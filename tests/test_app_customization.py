import json
import io
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

from server.surfboard_service import is_supersurfer_source
from server.app_source import snapshot
from server.surfboards import SurfboardError


class AppSourceTests(unittest.TestCase):
    def test_source_detection_requires_app_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "package.json").write_text(json.dumps({"name": "supersurfer"}))
            self.assertFalse(is_supersurfer_source(root))
            (root / ".git").mkdir()
            for file in ("desktop/main.cjs", "server/app.py", "ui/app.js"):
                target = root / file
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("")
            self.assertTrue(is_supersurfer_source(root))
            (root / "package.json").write_text(json.dumps({"name": "another-app"}))
            self.assertFalse(is_supersurfer_source(root))
            self.assertFalse(is_supersurfer_source(None))

    def test_snapshot_contains_saved_edits_and_excludes_private_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "package.json").write_text(json.dumps({"name": "supersurfer", "version": "1.0.0"}))
            for file in ("desktop/main.cjs", "server/app.py", "ui/app.js", "scripts/package.cjs"):
                target = root / file
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("initial")
            (root / ".gitignore").write_text(".SuperSurfer/\n")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            (root / "ui/app.js").write_text("saved agent edit")
            private = root / ".SuperSurfer"
            private.mkdir()
            (private / "secret.txt").write_text("secret")
            saved = snapshot(root)
            self.assertEqual(saved, snapshot(root))
            with tarfile.open(fileobj=io.BytesIO(saved), mode="r:gz") as archive:
                names = archive.getnames()
                self.assertIn("ui/app.js", names)
                self.assertNotIn(".SuperSurfer/secret.txt", names)
                self.assertEqual(archive.extractfile("ui/app.js").read(), b"saved agent edit")
            (root / "outside-link").symlink_to(private / "secret.txt")
            with self.assertRaises(SurfboardError):
                snapshot(root)


if __name__ == "__main__":
    unittest.main()
