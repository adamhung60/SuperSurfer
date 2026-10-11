"""Initialize the bundled workspace; reuse an existing research manager."""
import hashlib
import errno
import fcntl
import io
import json
import os
from pathlib import Path
import shutil
import select
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import urllib.error


def systemctl_checked(arguments, timeout):
    """Keep the service manager's useful error instead of CalledProcessError's summary."""
    command = ['systemctl', '--user', *arguments]
    try:
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        detail = error.stderr or b''
        if isinstance(detail, bytes):
            detail = detail.decode(errors='replace')
        raise RuntimeError(f'Systemd timed out during {" ".join(arguments)}. {detail.strip()} No detached replacement was started because the service may already be starting.') from error
    except OSError as error:
        raise RuntimeError(f'Could not run {" ".join(command)}: {error}. No detached replacement was started.') from error
    if result.returncode:
        detail = result.stderr or b''
        if isinstance(detail, bytes):
            detail = detail.decode(errors='replace')
        raise RuntimeError(f'Systemd {" ".join(arguments)} failed (exit {result.returncode}): {detail.strip() or "no diagnostic output"}. No detached replacement was started.')


def ensure_manager(release, home):
    command = [sys.executable, '-m', 'server.engine', '--ensure', '--engine-dir', str(release / 'engine'), '--aml-home', str(home)]
    result = subprocess.run(command, cwd=release, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Workspace manager setup failed: ' + (result.stderr.strip()[-2000:] or 'No diagnostic output'))
    try:
        ready = json.loads(result.stdout)
        if ready.get('status') not in {'existing', 'started'} or Path(ready.get('home', '')).resolve() != home.resolve():
            raise ValueError('Wrong manager workspace')
    except (ValueError, TypeError, AttributeError) as error:
        raise RuntimeError('Workspace manager did not confirm startup. No replacement was attempted.') from error


def progress(message):
    print('SUPERSURFER_PROGRESS: ' + json.dumps({'message':message}),file=sys.stderr,flush=True)


def upgrade_detached_release(state, previous, release, session_info, healthy, timeout=60):
    """Restart only the authenticated owner after a native Customize install."""
    recorded = json.loads((state / 'service.json').read_text())
    pid = session_info.get('pid')
    if (type(pid) is not int or pid <= 1 or pid == os.getpid()
            or recorded.get('pid') != pid or recorded.get('port') != session_info.get('port') or session_info.get('read_only')
            or session_info.get('release_dir') != str(previous.resolve())
            or not previous.resolve().is_relative_to((state.parent / 'releases').resolve())):
        raise RuntimeError('The previous workspace cannot confirm its process identity. Stop that service and reconnect once to finish this update. No process was stopped.')
    command = [sys.executable, '-m', 'server.app', '--state-dir', str(state),
               '--port', str(recorded['port']), '--aml-home', session_info['aml_home']]
    env = {**os.environ, 'PATH': str(Path.home() / '.local/bin') + os.pathsep + os.environ.get('PATH', '')}

    def wait_stopped():
        deadline = time.monotonic() + timeout
        with (state / 'service.lock').open('a+') as lock:
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise RuntimeError('The previous workspace did not finish stopping. No competing service was started.')
                    time.sleep(.1)

    def start(directory):
        with (state / 'service.log').open('ab', buffering=0) as log:
            child = subprocess.Popen(command, cwd=directory, stdin=subprocess.DEVNULL,
                                     stdout=log, stderr=log, env=env, start_new_session=True)
        try:
            for _ in range(40):
                if child.poll() is not None:
                    raise RuntimeError('The workspace service exited during startup.')
                token = healthy()
                if token and session_info.get('pid') == child.pid and session_info.get('release_dir') == str(directory.resolve()):
                    return token
                time.sleep(.5)
            raise RuntimeError('The workspace service did not become ready.')
        except Exception:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=timeout)
            raise

    progress('Restarting the connected workspace to load your installed changes…')
    os.kill(pid, signal.SIGTERM)
    wait_stopped()
    if healthy():
        raise RuntimeError('A workspace is still answering after shutdown. No competing service was started.')
    try:
        token = start(release)
    except Exception as error:
        try:
            wait_stopped()
            if healthy():
                raise RuntimeError('Another service is answering; no replacement was started.')
            start(previous)
        except Exception as restore_error:
            raise RuntimeError('Workspace update failed and recovery needs attention. Inspect the private service log; no second service was started.') from restore_error
        raise RuntimeError('Workspace update failed; the previous service was restored. Inspect the private service log and retry.') from error
    (state / 'release.json').write_text(json.dumps({'path': str(release), 'python': sys.executable, 'command': command, 'mode': 'detached'}))
    return token


def upgrade_systemd_release(root, state, previous, release, healthy):
    """Switch an owned user service to the uploaded release, restoring it on failure."""
    unit_name = 'supersurfer-' + hashlib.sha256(str(root).encode()).hexdigest()[:10] + '.service'
    if (state / 'unit').read_text().strip() != unit_name:
        raise RuntimeError('The running workspace service does not match this installation. Reconnect using its original workspace folder.')
    unit_file = Path.home() / '.config/systemd/user' / unit_name
    original = unit_file.read_text()
    old_line = 'WorkingDirectory=' + str(previous).replace('%', '%%') + '\n'
    new_line = 'WorkingDirectory=' + str(release).replace('%', '%%') + '\n'
    if old_line not in original or original.count(old_line) != 1:
        raise RuntimeError('The workspace service configuration no longer matches its recorded release. No service was changed.')

    def write_unit(content):
        temporary = unit_file.with_name(unit_file.name + '.tmp')
        temporary.write_text(content)
        temporary.replace(unit_file)

    def wait_ready():
        for _ in range(40):
            if healthy():
                return
            time.sleep(.5)
        raise RuntimeError('The updated workspace service did not become ready.')

    progress('Updating the workspace service to the new app version…')
    try:
        write_unit(original.replace(old_line, new_line, 1))
        systemctl_checked(['daemon-reload'], timeout=15)
        systemctl_checked(['restart', unit_name], timeout=25)
        wait_ready()
    except Exception as error:
        try:
            write_unit(original)
            systemctl_checked(['daemon-reload'], timeout=15)
            systemctl_checked(['restart', unit_name], timeout=25)
            wait_ready()
        except Exception as recovery:
            raise RuntimeError(f'Workspace update failed: {error}. Restoring the previous service also failed: {recovery}') from error
        raise RuntimeError(f'Workspace update failed; the previous service was restored: {error}') from error


def read_bundle(expected=None, timeout=30, stream=None):
    """Read a framed upload before taking any workspace/service lock.

    SSH EOF may be delayed by a wrapper or shared session. An explicit byte
    count avoids waiting for it; a remote deadline also survives client death.
    """
    limit=32*1024*1024
    if expected is not None and (type(expected) is not int or not 0 < expected <= limit):
        raise RuntimeError('Invalid workspace bundle size.')
    source=stream or sys.stdin.buffer;descriptor=source.fileno();chunks=[];size=0
    deadline=time.monotonic()+timeout
    while expected is None or size < expected:
        remaining=deadline-time.monotonic()
        if remaining <= 0 or not select.select([descriptor],[],[],max(0,remaining))[0]:
            raise RuntimeError('Workspace upload timed out. No connection lock or service was changed. Retry the connection.')
        chunk=os.read(descriptor,min(1024*1024,(expected-size) if expected is not None else limit+1-size))
        if not chunk:
            if expected is not None and size != expected:
                raise RuntimeError('Workspace upload was interrupted. No connection lock or service was changed. Retry the connection.')
            break
        chunks.append(chunk);size+=len(chunk)
        if size > limit:raise RuntimeError('Remote bundle is too large.')
    if not size:raise RuntimeError('The workspace upload was empty. Retry the connection.')
    return b''.join(chunks)


def _install(payload):
    if sys.version_info < (3, 10):
        raise RuntimeError('The workspace computer needs Python 3.10 or newer.')
    config = json.loads(sys.argv[1])
    root = Path(config['remoteRoot']).expanduser()
    if not root.is_absolute():
        raise RuntimeError('Choose an absolute remote folder, or a path starting with ~/')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    state = root / 'state'
    state.mkdir(exist_ok=True, mode=0o700)
    progress('Checking the workspace installation…')
    digest = hashlib.sha256(payload).hexdigest()[:16]
    release = root / 'releases' / digest
    release.parent.mkdir(exist_ok=True, mode=0o700)
    if not release.exists():
        temporary = Path(tempfile.mkdtemp(prefix='install-', dir=release.parent))
        with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
            for member in archive.getmembers():
                target = temporary / member.name
                if not target.resolve().is_relative_to(temporary.resolve()) or member.issym() or member.islnk():
                    raise RuntimeError('Invalid path in remote bundle.')
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source:
                        target.write_bytes(source.read())
                    target.chmod(0o600)
                else:
                    raise RuntimeError('Unsupported archive entry.')
        temporary.rename(release)
    port = int(config.get('remotePort', 8765))
    if not 1024 <= port <= 65535:
        raise RuntimeError('Choose a remote port between 1024 and 65535.')

    session_info = {}
    aml_home = Path(config.get('amlHome') or '~/.auto-ml').expanduser()
    if not aml_home.is_absolute():
        raise RuntimeError('Choose an absolute manager folder, or a path starting with ~/')

    def healthy():
        try:
            token = (state / 'token').read_text().strip()
        except FileNotFoundError:
            token = None
        # Authenticate without waiting on the research manager or starting Codex.
        request = urllib.request.Request(f'http://127.0.0.1:{port}/api/session', headers={'Authorization': 'Bearer ' + token} if token else {})
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Remote port {port} is already serving a different or incompatible workspace (HTTP {error.code}). Use its matching remote folder or choose another port.') from error
        except urllib.error.URLError as error:
            if isinstance(error.reason, ConnectionRefusedError) or getattr(error.reason, 'errno', None) == errno.ECONNREFUSED:
                return None
            raise RuntimeError(f'Remote port {port} did not answer the workspace check: {error.reason}. No second service was started.') from error
        except (OSError, ValueError) as error:
            raise RuntimeError(f'Remote port {port} returned an invalid workspace response. No second service was started.') from error
        if not isinstance(result, dict) or not result.get('ok') or not token or result.get('state_dir') != str(state.resolve()):
            raise RuntimeError(f'Remote port {port} belongs to a different workspace. Choose its matching remote folder or another port.')
        manager_home = result.get('aml_home')
        if not manager_home and (state / 'release.json').is_file():
            metadata = json.loads((state / 'release.json').read_text())
            previous = metadata.get('command', [])
            if '--aml-home' in previous:
                manager_home = previous[previous.index('--aml-home') + 1]
        if manager_home and Path(manager_home).expanduser().resolve() != aml_home.resolve():
            raise RuntimeError(f'This workspace uses manager folder {manager_home}. Use that folder or choose a different workspace folder and port.')
        session_info.update(result)
        return token

    token = healthy()
    # Only the explicit connection/bootstrap flow initializes the engine. API
    # reads and ordinary sidecar startup never start or replace a research manager.
    if not session_info.get('read_only'):
        progress('Checking the remote research manager…')
        ensure_manager(release, aml_home)
    if token and (state / 'release.json').is_file():
        installed = json.loads((state / 'release.json').read_text())
        previous = Path(installed.get('path', ''))
        if previous.resolve() != release.resolve():
            if installed.get('mode') != 'systemd':
                if installed.get('mode') != 'detached' or config.get('customize_upgrade') != hashlib.sha256(payload).hexdigest():
                    raise RuntimeError('A new workspace version was uploaded, but this workspace uses a detached service. Stop that service and reconnect to apply the new version.')
                token = upgrade_detached_release(state, previous, release, session_info, healthy)
            else:
                upgrade_systemd_release(root, state, previous, release, healthy)
                installed['path'] = str(release)
                (state / 'release.json').write_text(json.dumps(installed))
                session_info.clear()
                token = healthy()
    if not token:
        progress('Starting the workspace service…')
        command = [sys.executable, '-m', 'server.app', '--state-dir', str(state), '--port', str(port), '--aml-home', str(Path(config.get('amlHome') or '~/.auto-ml').expanduser())]
        env = dict(os.environ)
        # SSH noninteractive shells often omit the Codex install directory.
        env['PATH'] = str(Path.home() / '.local/bin') + os.pathsep + env.get('PATH', '')
        process = None
        mode = 'detached'
        use_systemd = False
        if shutil.which('systemctl'):
            try:
                use_systemd = subprocess.run(['systemctl', '--user', 'show-environment'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5).returncode == 0
            except (OSError, subprocess.SubprocessError):
                # An absent or unresponsive user bus is common on SSH compute hosts.
                # No service has been started yet, so the detached path remains safe.
                pass
        if use_systemd:
            # A user service can recover after process failure independently of SSH.
            unit_name = 'supersurfer-' + hashlib.sha256(str(root).encode()).hexdigest()[:10] + '.service'
            unit_directory = Path.home() / '.config/systemd/user'
            unit_directory.mkdir(parents=True, exist_ok=True)
            def unit_quote(value):
                return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'
            # WorkingDirectory is a scalar path, not a command-line argument:
            # systemd retains surrounding quotes and would reject it as relative.
            working_directory = str(release).replace('%', '%%')
            if any(character in working_directory for character in ('\0', '\r', '\n')):
                raise RuntimeError('The remote install folder cannot contain control characters.')
            unit = ('[Unit]\nDescription=SuperSurfer research workspace\nAfter=network.target\n\n[Service]\nType=simple\n'
                    + 'WorkingDirectory=' + working_directory + '\n'
                    + 'ExecStart=' + ' '.join(unit_quote(str(arg).replace('$', '$$')) for arg in command) + '\n'
                    + 'Environment=' + unit_quote('PATH=' + env['PATH']) + '\n'
                    + 'Restart=on-failure\nRestartSec=5\nUMask=0077\n\n[Install]\nWantedBy=default.target\n')
            (unit_directory / unit_name).write_text(unit)
            systemctl_checked(['daemon-reload'], timeout=15)
            try:
                systemctl_checked(['enable', '--now', unit_name], timeout=20)
            except RuntimeError as error:
                raise RuntimeError(f'{error}\nDetails: journalctl --user -u {unit_name} -n 30 --no-pager') from error
            mode = 'systemd'
            (state / 'unit').write_text(unit_name)
        else:
            with open(state / 'service.log', 'ab', buffering=0) as log:
                process = subprocess.Popen(command, cwd=release, stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=env, start_new_session=True)
        for _ in range(40):
            token = healthy()
            if token:
                break
            if process is not None and process.poll() is not None:
                raise RuntimeError('The service could not start. Inspect ' + str(state / 'service.log'))
            time.sleep(0.5)
        if not token:
            details = ('journalctl --user -u ' + unit_name + ' -n 30 --no-pager') if mode == 'systemd' else str(state / 'service.log')
            raise RuntimeError('Remote service did not become ready. Inspect ' + details)
        (state / 'release.json').write_text(json.dumps({'path': str(release), 'python': sys.executable, 'command': command, 'mode': mode}))
    progress('Workspace ready. Opening its private connection…')
    print(json.dumps({'token': token, 'port': port, 'root': str(root), 'version': session_info.get('version')}))


def main():
    config = json.loads(sys.argv[1])
    root = Path(config['remoteRoot']).expanduser()
    if not root.is_absolute():
        raise RuntimeError('Choose an absolute remote folder, or a path starting with ~/')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    progress('SSH connected. Uploading the workspace bundle…')
    payload=read_bundle(config.get('bundle_size'))
    # Two new windows can connect at the same time; only one installs/starts.
    progress('Waiting for workspace setup…')
    with (root / 'connection.lock').open('a+') as lock:
        deadline = time.monotonic() + 60
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Another window is still initializing this workspace. Try connecting again shortly.')
                time.sleep(.1)
        _install(payload)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
