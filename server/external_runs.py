"""Read-only observations of jobs launched outside the AutoML scheduler.

These records are presentation evidence. They never become scheduler runs and
cannot be passed to queue, stop, or recovery actions.
"""
from __future__ import annotations

import math
import re
import time


STATUSES = {"pending", "starting", "running", "succeeded", "failed", "cancelled", "unknown"}
HEALTH = {"unknown", "healthy", "stale", "failed"}
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,149}$")


def _text(value, label, limit=300, required=False):
    if not isinstance(value, str) or len(value) > limit or "\0" in value or (required and not value.strip()):
        raise ValueError(label + " must be bounded text")
    return value


def _number(value, label, minimum=0):
    if type(value) not in (int, float) or not math.isfinite(value) or value < minimum:
        raise ValueError(label + " must be a finite nonnegative number")
    return value


def validate_snapshot(payload):
    if not isinstance(payload, dict) or set(payload) != {"source_id", "source_label", "observed_at", "runs"}:
        raise ValueError("External run snapshot requires source_id, source_label, observed_at and runs")
    source_id = _text(payload["source_id"], "source_id", 150, True)
    if not IDENTIFIER.fullmatch(source_id):
        raise ValueError("source_id must be a stable identifier")
    label = _text(payload["source_label"], "source_label", 150, True)
    observed = _number(payload["observed_at"], "observed_at")
    if observed > time.time() + 300:
        raise ValueError("observed_at is in the future")
    rows = payload["runs"]
    if not isinstance(rows, list) or len(rows) > 256:
        raise ValueError("runs must contain at most 256 jobs")
    result, seen = [], set()
    allowed = {"id", "name", "status", "health", "health_reason", "job_type", "method", "task",
               "demos_per_task", "host", "gpus", "step", "total_steps", "step_seconds",
               "started_at", "heartbeat_at", "finished_at", "error", "evidence"}
    for index, raw in enumerate(rows):
        if not isinstance(raw, dict) or set(raw) - allowed or not {"id", "name", "status"} <= set(raw):
            raise ValueError(f"runs[{index}] has missing or unknown fields")
        row = dict(raw)
        run_id = _text(row["id"], "run id", 150, True)
        if not IDENTIFIER.fullmatch(run_id) or run_id in seen:
            raise ValueError("run IDs must be distinct stable identifiers")
        seen.add(run_id)
        _text(row["name"], "run name", 200, True)
        if row["status"] not in STATUSES or row.get("health", "unknown") not in HEALTH:
            raise ValueError("Invalid external run status or health")
        for key in ("health_reason", "job_type", "method", "task", "host", "error", "evidence"):
            if key in row:
                _text(row[key], key, 2000 if key in {"error", "evidence"} else 300)
        if "gpus" in row and (not isinstance(row["gpus"], list) or len(row["gpus"]) > 32 or
                             any(type(gpu) is not int or gpu < 0 or gpu > 1024 for gpu in row["gpus"])):
            raise ValueError("gpus must be physical device indices")
        for key in ("demos_per_task", "step", "total_steps"):
            if key in row and (type(row[key]) is not int or row[key] < 0):
                raise ValueError(key + " must be a nonnegative integer")
        if row.get("step", 0) > row.get("total_steps", row.get("step", 0)):
            raise ValueError("step exceeds total_steps")
        for key in ("step_seconds", "started_at", "heartbeat_at", "finished_at"):
            if key in row:
                _number(row[key], key)
        if "step_seconds" in row and row["step_seconds"] <= 0:
            raise ValueError("step_seconds must be positive")
        result.append(row)
    return {"source_id": source_id, "source_label": label, "observed_at": observed, "runs": result}


def publish(store, experiment_id, payload):
    snapshot = validate_snapshot(payload)
    key = "external_runs:" + experiment_id
    with store.lock:
        previous = store.get(key)
        if previous and previous["source_id"] != snapshot["source_id"]:
            raise ValueError("This experiment already has a different external run source")
        if previous and snapshot["observed_at"] < previous["observed_at"]:
            raise ValueError("An older external run snapshot cannot replace newer evidence")
        if previous and snapshot["observed_at"] == previous["observed_at"]:
            if {key: previous[key] for key in snapshot} == snapshot:
                return previous
            raise ValueError("Snapshot time already belongs to different evidence")
        record = {**snapshot, "version": (previous or {}).get("version", 0) + 1,
                  "saved_at": time.time()}
        store.put(key, record)
        return record


def read(store, experiment_id):
    return store.get("external_runs:" + experiment_id, {"source_id": None, "source_label": None,
                                                       "observed_at": None, "runs": [], "version": 0})
