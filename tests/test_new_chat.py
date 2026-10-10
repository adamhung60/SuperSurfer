import tempfile
from pathlib import Path
import unittest

from server.aml import AMLClient
from server.app import Service
from test_backend import FakeManager, FakeCodex, FakeTracking


class NewChatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        repo = root / 'repo'
        repo.mkdir()
        self.service = Service(root / 'state', root / 'aml', aml=AMLClient(root / 'aml', rpc=FakeManager(repo)), codex=FakeCodex(), start_monitor=False, tracking=FakeTracking())

    def tearDown(self):
        self.service.close()
        self.temp.cleanup()

    def test_distinct_chats_and_idempotent_creation_do_not_start_work(self):
        params = {'project_id': 'p1', 'name': 'Make cards compact', 'request_id': 'new-chat-request-0001'}
        first = self.service.action('chat.create', params)
        self.assertEqual(first, self.service.action('chat.create', params))
        second = self.service.action('chat.create', {**params, 'request_id': 'new-chat-request-0002'})
        self.assertNotEqual(first['scope'], second['scope'])
        directory = self.service.project_agents('p1')['agents']
        self.assertTrue({first['scope'], second['scope']} <= {agent['scope'] for agent in directory})
        self.assertFalse(self.service.codex.sent)
        self.assertEqual(self.service.board_record('p1', first['experiment_id'])['board'], self.service.board_record('p1')['board'])

    def test_rejects_readonly_and_invalid_or_conflicting_requests(self):
        params = {'project_id': 'p1', 'name': 'New chat', 'request_id': 'new-chat-request-0001'}
        self.service.action('chat.create', params)
        with self.assertRaisesRegex(Exception, 'different fields'):
            self.service.action('chat.create', {**params, 'name': 'Different request'})
        with self.assertRaisesRegex(Exception, 'request_id'):
            self.service.action('chat.create', {**params, 'request_id': '../invalid'})
        with self.assertRaisesRegex(Exception, 'Invalid chat'):
            self.service.action('chat.create', {**params, 'command': ['touch', 'unwanted']})
        self.service.read_only = True
        with self.assertRaisesRegex(Exception, 'Read-only'):
            self.service.action('chat.create', params)


if __name__ == '__main__':
    unittest.main()
