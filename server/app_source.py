"""Bounded snapshot of a SuperSurfer project's saved source for a local Mac build."""
from __future__ import annotations

import io
import gzip
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tarfile

from .surfboards import SurfboardError
from .surfboard_service import is_supersurfer_source

MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_SOURCE_FILES = 5000


def snapshot(repo):
    root = Path(repo).expanduser().resolve()
    if not is_supersurfer_source(root) or not (root / ".git").exists():
        raise SurfboardError("Choose a SuperSurfer Git checkout as the source project", 409)
    try:
        listed = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20,
        ).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise SurfboardError("Could not list the source checkout", 409) from exc
    names = sorted(set(listed.decode("utf-8", "surrogateescape").split("\0")) - {""})
    if len(names) > MAX_SOURCE_FILES:
        raise SurfboardError("Source checkout has too many files to package", 413)
    output = io.BytesIO()
    total = 0
    with gzip.GzipFile(fileobj=output, mode="wb", mtime=0, filename="") as compressed, tarfile.open(fileobj=compressed, mode="w") as archive:
        for name in names:
            relative = PurePosixPath(name)
            if (relative.is_absolute() or relative.as_posix() != name
                    or any(part in {"", ".", "..", ".git", ".SuperSurfer"} for part in relative.parts)):
                raise SurfboardError("Source checkout contains an unsafe path", 409)
            path = root.joinpath(*relative.parts)
            parent = path.parent
            while parent != root:
                if parent.is_symlink():
                    raise SurfboardError("Source checkout contains a linked parent directory", 409)
                parent = parent.parent
            try:
                info = path.lstat()
            except FileNotFoundError:
                continue  # A tracked deletion is absent from the saved working tree.
            if not stat.S_ISREG(info.st_mode):
                raise SurfboardError("Source checkout contains a link or non-file entry", 409)
            total += info.st_size
            if total > MAX_SOURCE_BYTES:
                raise SurfboardError("Source checkout exceeds the 64 MiB transfer limit", 413)
            entry = tarfile.TarInfo(name)
            entry.size = info.st_size
            entry.mode = 0o755 if info.st_mode & 0o111 else 0o644
            entry.mtime = 0
            with path.open("rb") as source:
                archive.addfile(entry, source)
    return output.getvalue()
