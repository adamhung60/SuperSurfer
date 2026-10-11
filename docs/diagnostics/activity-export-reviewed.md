# SuperSurfer diagnostic report — reviewed extract

Exported through the same authenticated /api/diagnostics route used by Project Activity. Private run, editor and agent/tool/log sections omitted; retained environment and workflow sections reviewed below. No session tokens, user paths or chat contents are included.

## Environment

```json
{
  "version": "0.1.40",
  "platform": "macOS-26.6.2-arm64-arm-64bit-Mach-O",
  "python": "3.14.3",
  "generated": "2026-10-10T20:08:49.059996-04:00",
  "timezone": "America/New_York",
  "manager_connected": true,
  "manager_error": null
}
```

## Project workflow

```json
{
  "id": "proj_be0eb681b20f",
  "name": "supersurfer",
  "board_version": 1,
  "workflow": "software",
  "nodes": [
    {
      "id": "brief",
      "kind": "brief",
      "label": "Feature brief"
    },
    {
      "id": "lead",
      "kind": "agent",
      "label": "Technical lead"
    },
    {
      "id": "worker",
      "kind": "agent",
      "label": "Developer"
    },
    {
      "id": "code",
      "kind": "code",
      "label": "Implementation"
    },
    {
      "id": "notes",
      "kind": "document",
      "label": "Notes"
    },
    {
      "id": "artifacts",
      "kind": "artifacts",
      "label": "Project files"
    },
    {
      "id": "activity",
      "kind": "activity",
      "label": "Background activity"
    },
    {
      "id": "editor",
      "kind": "editor",
      "label": "Code editor"
    },
    {
      "id": "checks",
      "kind": "check",
      "label": "Project checks"
    },
    {
      "id": "preview",
      "kind": "preview",
      "label": "App preview"
    },
    {
      "id": "results",
      "kind": "results",
      "label": "Review"
    }
  ],
  "requirements": [
    {
      "node_id": "preview",
      "source_node_id": "checks",
      "kind": "check_passed",
      "required": true,
      "applies_to": [
        "run_board_action:preview"
      ],
      "action_id": "checks"
    }
  ]
}
```


## Reproduction and local diagnosis


User-reported reproduction: after installing an updated SuperSurfer app, reconnect reports: “A new workspace version was uploaded, but this workspace uses a detached service. Stop that service and reconnect to apply the new version.”

Read-only observations on the affected Mac:
- Installed desktop/main.cjs, desktop/customize.cjs and desktop/bootstrap.py match the older main implementation, lacking grant consumption and detached-service upgrade support.
- A pending native upgrade grant exists and its bundle digest matches the installed app. The older app cannot consume it.
- The authenticated live session provides PID, port, release path and manager identity and is writable; the service supports attestation.
- The existing reviewed feature implementation had detached upgrading, but it was not integrated in main. The later source install therefore returned to the old implementation.

Repair integrates the grant producer, consumer, authenticated process attestation and rollback into current main while preserving automatic-update consent. Native recovery asks the user before issuing a missing grant and retries once. Tests use isolated processes and fixture state. No live app installation, service stop or restart was performed.

