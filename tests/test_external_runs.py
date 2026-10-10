"""External job observations stay scoped, durable and separate from AutoML."""
import tempfile
from pathlib import Path
import unittest

from server import external_runs
from server.store import Store
import test_conversations as fixtures


def snapshot(at=1000, status="running"):
    return {"source_id": "trinity-leap-v3", "source_label": "Trinity LEAP v3",
            "observed_at": at, "runs": [{"id": "idm_rgb_100_seed0", "name": "IDM RGB",
            "status": status, "health": "healthy", "host": "trinity-0-13", "gpus": [1],
            "step": 1000, "total_steps": 40000, "step_seconds": 0.7,
            "heartbeat_at": at, "method": "rgb", "demos_per_task": 100}]}


class ExternalRunStoreTests(unittest.TestCase):
    def test_snapshot_is_idempotent_and_rejects_older_or_changed_source(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Store(Path(folder))
            first = external_runs.publish(store, "exp-one", snapshot())
            self.assertEqual(first, external_runs.publish(store, "exp-one", snapshot()))
            self.assertEqual(1, first["version"])
            with self.assertRaisesRegex(ValueError, "older"):
                external_runs.publish(store, "exp-one", snapshot(999))
            changed = snapshot(1001, "succeeded")
            self.assertEqual(2, external_runs.publish(store, "exp-one", changed)["version"])
            changed["source_id"] = "other-campaign"
            with self.assertRaisesRegex(ValueError, "different external run source"):
                external_runs.publish(store, "exp-one", changed)
            self.assertEqual([], external_runs.read(store, "exp-two")["runs"])

    def test_rejects_fabricated_progress_and_unbounded_fields(self):
        cases = [{"step": 40001}, {"gpus": [-1]}, {"status": "queued"},
                 {"unknown_field": "value"}, {"step_seconds": 0}]
        for update in cases:
            with self.subTest(update=update):
                value = snapshot()
                value["runs"][0].update(update)
                with self.assertRaises(ValueError):
                    external_runs.validate_snapshot(value)


class ExternalRunToolTests(unittest.TestCase):
    open_service = fixtures.ConversationTests.open_service
    setUp = fixtures.ConversationTests.setUp
    tearDown = fixtures.ConversationTests.tearDown

    def test_worker_publishes_to_own_experiment_without_scheduler_action(self):
        scope = "experiment:" + self.exp["id"]
        self.service.codex.busy.add(scope)
        self.service.turn_origins[scope] = "user"
        receipt = self.service.agent_action(scope, "supersurfer_publish_external_runs", snapshot())
        self.assertEqual("idm_rgb_100_seed0", receipt["runs"][0]["id"])
        self.assertEqual(receipt, external_runs.read(self.service.store, self.exp["id"]))
        self.assertEqual([], [op for op, _ in self.manager.calls if op != "status"])

    def test_worker_cannot_publish_to_another_experiment(self):
        scope = "experiment:" + self.exp["id"]
        self.service.codex.busy.add(scope)
        self.service.turn_origins[scope] = "user"
        with self.assertRaises(Exception):
            self.service.agent_action(scope, "supersurfer_publish_external_runs",
                                      {**snapshot(), "experiment_id": "another"})
