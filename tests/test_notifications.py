import unittest
from server.notifications import chat_notifications, workspace_notifications

class NotificationTests(unittest.TestCase):
    def test_all_categories_and_resolution(self):
        chat = {"scope":"project:p", "approvals":[{"id":"a","status":"pending","created":1}],
                "questions":[{"id":"q","status":"answered","created":2}],
                "tasks":[{"id":"t","title":"Build","status":"completed","updated":3},
                         {"id":"b","title":"Review change","status":"blocked","updated":4}]}
        rows = chat_notifications(chat)
        self.assertEqual([r['kind'] for r in rows], ['approval','complete','review'])
        chat['questions'][0]['status'] = 'pending'
        self.assertEqual(chat_notifications(chat)[1]['kind'], 'question')
        chat['approvals'][0]['status'] = 'approved'
        self.assertNotIn('approval', [r['kind'] for r in chat_notifications(chat)])
        self.assertEqual(rows[1]['id'], chat_notifications(chat)[1]['id'])

    def test_conversation_owner_and_pending_not_capped(self):
        class Store:
            def get(self, key, default): return default
            def conversation(self, scope): return {'experiment_id':'e'}
        notices=[{'id':str(i),'pending':True,'created':i} for i in range(110)]
        rows=workspace_notifications([{'scope':'conversation:c','notifications':notices}],Store(),{'e':{'project_id':'p'}})
        self.assertEqual(len(rows),110)
        self.assertEqual(rows[0]['project_id'],'p')
        self.assertEqual(rows[0]['experiment_id'],'e')

    def test_required_results_review(self):
        rows=chat_notifications({'scope':'experiment:e','required_tasks':{'review':'r'},'tasks':[{'id':'r','title':'Results check','status':'working','created':1}]})
        self.assertEqual(rows[0]['kind'],'review')

    def test_report_ready_for_review(self):
        class Store:
            def get(self, key, default): return [{"id":"report","title":"Comparison","updated":7}]
        row=workspace_notifications([],Store(),{"e":{"project_id":"p"}})[0]
        self.assertEqual((row["kind"],row["destination"],row["project_id"]),("review","results","p"))


import test_codex as fixtures
class NotificationBridgeTests(unittest.TestCase):
    setUp=fixtures.CodexBridgeTests.setUp
    tearDown=fixtures.CodexBridgeTests.tearDown
    new_bridge=fixtures.CodexBridgeTests.new_bridge
    requests=fixtures.CodexBridgeTests.requests
    wait_for=fixtures.CodexBridgeTests.wait_for

    def test_owned_summary_exposes_completion_without_starting_another_turn(self):
        self.bridge.send("project:vla", "hold")
        self.wait_for(lambda:self.bridge.chat("project:vla").get("turn_id"))
        task=self.bridge.update_task("project:vla",{"title":"Deliver patch","status":"working"})["task"]
        self.assertEqual(self.bridge.list_chats()[0]["notifications"],[])
        self.bridge.update_task("project:vla",{"task_id":task["id"],"status":"completed","summary":"Verified patch"})
        before=len(self.requests())
        notice=self.bridge.list_chats()[0]["notifications"][0]
        self.assertEqual(notice["kind"],"complete")
        self.assertEqual(notice["scope"],"project:vla")
        self.assertEqual(before,len(self.requests()))
