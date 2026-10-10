"""Compact notification read model. Never starts a provider or changes task state."""
def chat_notifications(chat):
    scope = chat["scope"]
    rows = []
    def add(kind, item, title, pending=False):
        stamp = item.get("updated", item.get("created", 0))
        rows.append({"id": f"{scope}:{kind}:{item['id']}:{stamp}", "kind": kind,
                     "scope": scope, "title": title[:240], "created": stamp, "pending": pending})
    for item in chat.get("approvals", []):
        if item.get("status") == "pending":
            add("approval", item, "Approval required", True)
    for item in chat.get("questions", []):
        if item.get("status") == "pending":
            add("question", item, "Question to answer", True)
    required = set(chat.get("required_tasks", {}).values())
    for item in chat.get("tasks", []):
        if item.get("status") == "completed":
            add("complete", item, item.get("title") or "Task complete")
        elif item.get("status") == "blocked" or (item["id"] in required and item.get("status") == "working"):
            add("review", item, item.get("title") or "Review needed", True)
    return rows


def workspace_notifications(chats, store, experiments):
    rows = []
    for chat in chats:
        scope = chat["scope"]
        project_id = experiment_id = None
        if scope.startswith("project:"):
            project_id = scope.split(":", 1)[1]
        elif scope.startswith("experiment:"):
            experiment_id = scope.split(":", 1)[1]
        elif scope.startswith("conversation:"):
            try:
                experiment_id = store.conversation(scope)["experiment_id"]
            except KeyError:
                continue
        if experiment_id:
            project_id = experiments.get(experiment_id, {}).get("project_id")
        for item in chat.get("notifications", []):
            rows.append({**item, "project_id": project_id, "experiment_id": experiment_id,
                         "agent_name": chat.get("agent", {}).get("name") or "Agent"})
    for experiment_id, experiment in experiments.items():
        for report in store.get("results:" + experiment_id, []):
            if not report.get("archived"):
                rows.append({"id": f"report:{report['id']}:{report['updated']}", "kind": "review",
                             "scope": "experiment:" + experiment_id, "title": report["title"],
                             "created": report["updated"], "pending": False, "destination": "results",
                             "project_id": experiment["project_id"], "experiment_id": experiment_id,
                             "agent_name": "Results"})
    # All pending decisions remain visible; only historical completion receipts are capped.
    pending = [row for row in rows if row["pending"]]
    history = sorted((row for row in rows if not row["pending"]), key=lambda row: row["created"], reverse=True)[:100]
    return pending + history
