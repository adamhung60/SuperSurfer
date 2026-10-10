---
name: supersurfer-app-customization
description: Change SuperSurfer itself from its source project, verify the app, and prepare a local desktop update.
---

# Customize SuperSurfer

The Customize SuperSurfer navigation area is the entry point for changing this app. Its source-project selector determines the connected workspace repository and project agent. Check that project's `repo` is the intended fork before editing. The desktop client's local checkout is a separate path and may be on a different machine. Neither source edits nor a remote build change the running client by themselves.

The main-page idea box sends the user's text to the selected source project's lead. For a visual change, start a configured preview for that project when the workflow supports one, then direct the user to the Visual preview area in Customize. It displays active preview actions from project activity and has a Refresh control. A preview of a web page or component is evidence for that surface only; do not claim it is the installed desktop app. If no configured preview can represent the change, explain the limitation and show the source diff or a local packaged-app check instead.

Map a request to the installed source version first. `ui/` owns workspace pages and agent chat; `server/` owns API actions, work items, surfboards and policy; `desktop/` owns Electron windows, local connection, native dialogs and installation. Read `AGENTS.md` and `.agents/contributing.md` for contribution checks and deliverables. Re-read files before patching because this repository is shared with the user and other agents. Preserve unsaved editor buffers and unrelated changes.

For a functionality change, implement the complete UI to service path, verify meaningful behavior, run applicable browser/native checks, and package for the target operating system. Record failed or unavailable checks accurately. Review the source diff with the user before installing. App installation is a separate explicit action in the desktop client; agent tools and surfboards do not grant installation rights.

On macOS, **Build workspace changes** transfers a bounded authenticated snapshot of the selected project's saved, unignored files to a local build copy. A native confirmation precedes running npm from that source. The app installs locked dependencies, runs `npm run package:mac`, verifies the package identity and signature, then stages the built `.app` beside the current packaged app. A local Git checkout can be selected as an alternative. The Install and restart button opens another native confirmation, quits the client, keeps a backup of the old app, swaps the staged bundle, and opens the new one. Save editor buffers before approving. The workspace service and project data are separate from the client bundle. If the client cannot close or the install location is not writable, report the exact error and preserve the candidate. A Mac client cannot install a Linux build. Unsaved editor buffers and ignored files are not included in the workspace snapshot.

Current conversations appear as horizontal chat tabs. Switch tabs to return to an earlier idea; Show chat history exposes previous and archived conversations. Empty chats have no introductory copy or suggestion cards. Tab selection preserves per-conversation drafts and does not dispatch work.

Repeated macOS App Management prompts can result from ad-hoc signatures whose
identity changes each build. Local packaging supports an explicitly configured
persistent certificate, saved outside the source snapshot. The one-time
`node scripts/configure-mac-signing.cjs --create` operation changes the user's
Keychain and code-signing trust; obtain explicit authorization before running it.
An existing certificate can be selected by SHA-1 fingerprint with `--identity`.
Never reset TCC or weaken Gatekeeper to avoid prompts. A configured but missing
identity fails the build; don't silently replace it. Moving from an ad-hoc build
may still need one final approval, and signing continuity is not proof that macOS
has granted App Management permission or that the new app is installed.
