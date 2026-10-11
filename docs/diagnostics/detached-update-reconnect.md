# Detached update reconnect diagnosis

User-reported reproduction: after installing an updated SuperSurfer app, reconnect reports: “A new workspace version was uploaded, but this workspace uses a detached service. Stop that service and reconnect to apply the new version.”

Read-only observations on the affected Mac:
- Installed desktop/main.cjs, desktop/customize.cjs and desktop/bootstrap.py match the older main implementation, lacking grant consumption and detached-service upgrade support.
- A pending native upgrade grant exists and its bundle digest matches the installed app. The older app cannot consume it.
- The authenticated live session provides PID, port, release path and manager identity and is writable; the service supports attestation.
- The existing reviewed feature implementation had detached upgrading, but it was not integrated in main. The later source install therefore returned to the old implementation.

Repair integrates the grant producer, consumer, authenticated process attestation and rollback into current main while preserving automatic-update consent. Native recovery asks the user before issuing a missing grant and retries once. Tests use isolated processes and fixture state. No live app installation, service stop or restart was performed.

This report was assembled from bounded local inspection because the SuperSurfer Activity/export connector is unavailable in this Codex session. It is not an Activity export. User paths, session credentials, tokens, source archives and private workspace data are omitted. Reviewed for public PR attachment.
