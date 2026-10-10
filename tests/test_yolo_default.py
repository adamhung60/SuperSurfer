"""The requested YOLO default persists without erasing explicit chat choices."""
from pathlib import Path
import tempfile
import unittest
from server.store import Store


class YoloDefaultTests(unittest.TestCase):
    def test_new_workspace_and_reopen_default_to_yolo(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            self.assertEqual(store.settings()['approval_mode'], 'yolo')
            self.assertIsNone(store.chat_settings('conversation:new')['approval_mode'])
            store.db.close()
            reopened = Store(directory)
            self.assertEqual(reopened.settings()['approval_mode'], 'yolo')
            reopened.db.close()

    def test_existing_default_migrates_once_preserving_explicit_chat_choices(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            store.put('settings', {'approval_mode': 'ask', 'timezone': 'America/New_York'})
            store.save_chat_settings('conversation:explicit', {'approval_mode': 'ask'})
            self.assertEqual(store.settings()['approval_mode'], 'yolo')
            self.assertEqual(store.settings()['timezone'], 'America/New_York')
            self.assertEqual(store.chat_settings('conversation:explicit')['approval_mode'], 'ask')
            store.save_settings({'approval_mode': 'auto_review'})
            store.db.close()
            reopened = Store(directory)
            self.assertEqual(reopened.settings()['approval_mode'], 'auto_review')
            reopened.save_settings({'approval_mode': 'ask'})
            self.assertEqual(reopened.settings()['approval_mode'], 'ask')
            reopened.db.close()
