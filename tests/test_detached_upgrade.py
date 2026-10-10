"""Real detached workspace upgrade in isolated processes, with no agents/jobs."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('detached_bootstrap', Path(__file__).resolve().parents[1] / 'desktop/bootstrap.py')
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)
FIXTURE = '''import fcntl,json,os,signal,sys,threading
from pathlib import Path
from http.server import HTTPServer,BaseHTTPRequestHandler
state=Path(sys.argv[sys.argv.index('--state-dir')+1]);port=int(sys.argv[sys.argv.index('--port')+1])
home=sys.argv[sys.argv.index('--aml-home')+1];release=Path(__file__).resolve().parents[1]
if (release/'fail-start').exists():raise SystemExit(1)
lock=(state/'service.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.headers.get('Authorization')!='Bearer fixture-token':self.send_error(401);return
  body=json.dumps(dict(ok=True,state_dir=str(state),aml_home=home,read_only=False,pid=os.getpid(),port=port,release_dir=str(release))).encode()
  self.send_response(200);self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
server=HTTPServer(('127.0.0.1',port),Handler)
(state/'service.json').write_text(json.dumps(dict(pid=os.getpid(),port=port)))
def stop(*args):
 if not (release/'ignore-stop').exists():threading.Thread(target=server.shutdown,daemon=True).start()
signal.signal(signal.SIGTERM,stop)
try:server.serve_forever(poll_interval=.05)
finally:server.server_close();lock.close()
'''


class DetachedUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.state = self.root / 'state'; self.state.mkdir()
        self.previous = self.root / 'releases/previous'
        self.release = self.root / 'releases/new'
        for directory in (self.previous, self.release):
            (directory / 'server').mkdir(parents=True)
            (directory / 'server/__init__.py').write_text('')
            (directory / 'server/app.py').write_text(FIXTURE)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0)); self.port = listener.getsockname()[1]
        self.command = [sys.executable, '-m', 'server.app', '--state-dir', str(self.state), '--port', str(self.port), '--aml-home', str(self.root / 'manager')]
        self.session = {}; self.children = []
        self.addCleanup(self.cleanup_children)
        (self.state / 'token').write_text('fixture-token')
        (self.state / 'release.json').write_text(json.dumps({'mode': 'detached', 'path': str(self.previous)}))
        (self.state / 'history').write_text('preserved conversation')
        self.old = self.spawn(self.command, cwd=self.previous, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if self.healthy(): break
            time.sleep(.02)
        self.assertEqual(self.session.get('pid'), self.old.pid)

    def spawn(self, *args, **kwargs):
        child = subprocess.Popen(*args, **kwargs); self.children.append(child); return child

    def cleanup_children(self):
        for child in self.children:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=5)

    def healthy(self):
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}/api/session', headers={'Authorization': 'Bearer fixture-token'})
        try:
            with urllib.request.urlopen(request, timeout=1) as response: data = json.load(response)
        except urllib.error.URLError as error:
            if isinstance(error.reason, ConnectionRefusedError): return None
            raise
        self.assertEqual(data['state_dir'], str(self.state))
        self.session.update(data)
        return 'fixture-token'

    def upgrade(self, timeout=2):
        original = subprocess.Popen
        def spawn(*args, **kwargs):
            child = original(*args, **kwargs); self.children.append(child); return child
        with patch.object(bootstrap.subprocess, 'Popen', side_effect=spawn):
            return bootstrap.upgrade_detached_release(self.state, self.previous, self.release, self.session, self.healthy, timeout=timeout)

    def test_verified_owner_restarts_into_new_release_preserving_state(self):
        self.assertEqual('fixture-token', self.upgrade())
        self.assertEqual(str(self.release), self.session['release_dir'])
        self.assertNotEqual(self.old.pid, self.session['pid'])
        self.assertEqual(str(self.release), json.loads((self.state / 'release.json').read_text())['path'])
        self.assertEqual('preserved conversation', (self.state / 'history').read_text())
        self.assertEqual('fixture-token', (self.state / 'token').read_text())

    def test_failed_new_release_restores_previous_service(self):
        (self.release / 'fail-start').touch()
        with self.assertRaisesRegex(RuntimeError, 'previous service was restored'): self.upgrade()
        self.assertEqual(str(self.previous), self.session['release_dir'])
        self.assertEqual(str(self.previous), json.loads((self.state / 'release.json').read_text())['path'])
        self.assertEqual('preserved conversation', (self.state / 'history').read_text())

    def test_mismatched_or_missing_process_attestation_never_signals(self):
        for field, value in [('pid', None), ('pid', self.old.pid + 1), ('port', self.port + 1), ('read_only', True), ('release_dir', '/other/release')]:
            prior = self.session.copy(); self.session[field] = value
            with patch.object(bootstrap.os, 'kill') as stop:
                with self.assertRaisesRegex(RuntimeError, 'process identity'): self.upgrade()
                stop.assert_not_called()
            self.session = prior
        self.assertIsNone(self.old.poll())

    def test_stop_timeout_never_starts_competing_process_or_force_kills(self):
        (self.previous / 'ignore-stop').touch()
        with self.assertRaisesRegex(RuntimeError, 'No competing service'): self.upgrade(timeout=.2)
        self.assertEqual(1, len(self.children))
        self.assertIsNone(self.old.poll())
