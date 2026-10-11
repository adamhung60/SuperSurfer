# SuperSurfer 🏄

A cozy workspace for ambitious projects. Bring your AI agents, code, papers,
experiments and GPUs together—and shape the workspace around how you actually work.

[Explore the interactive demo](https://bardienus.com/supersurfer/) ·
[Download](https://github.com/Duisterhof/SuperSurfer/releases/latest)

## What can it do?

- **Build your own workflow.** Connect agents, instructions, checks, compute and
  results on a **Surfboard**. Start with research, software, web or writing, then
  customize each task. Choose requirements before execution, set resource limits
  and decide what your agents should bring back.
- **Bring your agents.** Work with **Codex, Cursor or Claude Code** through
  persistent project leads and task workers. Give each a role, share context,
  ask questions and follow their progress across projects.
- **Keep your editor.** Use the optional **VS Code backend with Open VSX
  extensions**, themes and keybindings, or the lightweight built-in editor.
  Send selected code straight to chat, inspect Git diffs and review agent edits
  chunk by chunk without losing your own draft.
- **Write beside your work.** Edit LaTeX alongside its compiled PDF and your
  writing agent. Share source or PDF selections, inspect build errors and keep
  notes, to-dos and published artifacts with the project. Compilation runs on a
  configured Linux workspace.
- **Run and understand experiments.** Pool GPUs across machines, queue and
  prioritize jobs, and monitor availability. Compare measured W&B curves and ask
  agents for custom plots or interactive results pages. Keep the code, research
  question and evidence together.
- **Make room for your process.** Rearrange panels, split views, open separate
  windows and add reusable HTML blocks. Schedule reviews or metric/status
  follow-ups; remote agents and jobs keep running when you close the app.
- **Customize SuperSurfer.** Type an idea in the app workshop, review a running
  visual preview when available, build the changed source, and install a verified
  desktop build through an explicit restart.

## Install

1. [Download the latest release](https://github.com/Duisterhof/SuperSurfer/releases/latest) for **macOS** (Apple Silicon or Intel) or **Linux x64**.
2. Extract it. On Mac, move **SuperSurfer.app** to Applications. On Linux, run **SuperSurfer-linux-x64/SuperSurfer**.
3. Open the app and choose **This machine** or connect to a **remote machine over SSH**. The workspace host needs **Python 3.11+, Git and one AI provider’s CLI**.
4. Choose **Codex**, **Cursor** or **Claude** on the first-machine screen and sign in on that computer. This choice becomes the default for new agents. Connect a project, then create its first task. SuperSurfer creates its service and workspace data folders automatically.

**Settings → Accounts** shows all three providers with sign-in and sign-out. You only need one. Existing conversations stay with their original provider; sign-out keeps their history and requires that provider’s turns to be idle.

**Customize SuperSurfer** appears in the left navigation of builds containing
this feature. Add a SuperSurfer source checkout as a workspace project, select
it in Customize, and type your idea in the main page. The selected project's
agent receives the request. A configured, running visual preview appears in the
main page; refresh it after the agent starts or updates the preview. **Build
changes** copies the saved project source to the Mac client, installs locked
npm dependencies and packages a locally signed Mac app. A local Git checkout
can be chosen as an alternative source. **Install and restart** asks
for confirmation, saves a backup of the current app beside it, then relaunches
the replacement. Save open source files first. The app's containing folder must
be writable by your user; project and workspace data are not replaced. The first
installation of a build containing Customize must use the ordinary package
installation path, since an older app has no in-app updater.
On Mac, **Automatic updates** can be enabled once for one connected SuperSurfer
source project. The client checks its clean, committed source every five minutes
and, when it changes, builds, verifies, backs up and installs the new app without another
prompt. It is off by default and can be turned off in Customize. Automatic
restart closes app windows, so save editor changes while this option is enabled.
A failed source revision is reported and held until the source changes.
When reconnecting after an app update, a systemd-managed workspace service
switches to the UI and server bundled with the new app; the workspace state stays
in its existing folder. The connection shows an error if an older detached
service needs a manual restart.

Use a page tab’s **⋯** menu or right-click → **Remove page**. Each block’s handle/menu offers **Remove block**, including outside Rearrange. Source files, notes, results and running work are kept. Utility/Markdown tabs can be restored from the page menu; removed blocks can be added again through Rearrange. Drag Results report tabs to reorder; their menu removes a report into the recoverable **Removed** list.

Research Results show all task attempts immediately. Workers use `check_experiment_results` to compare new attempts with earlier evidence, update an existing report and record a revision-checked review. Released attempts, status/source changes or a changed report reopen that checkpoint. Pending and failed measurements stay explicit; a review never authorizes another run.

Mac releases are not Developer ID signed or notarized. If blocked, try
**System Settings → Privacy & Security → Open Anyway**. If macOS says the app is
“damaged,” first move it to Applications, then run this **only for a download you
trust from the releases linked above**:

```bash
xattr -dr com.apple.quarantine "/Applications/SuperSurfer.app"
```

Reopen the app. This clears its download quarantine; it does not sign or notarize it.

[Agent contribution guide](.agents/README.md) · [More details](CONTRACT.md) · [Roadmap](TODO.md)

The notification bell shows approvals, questions, task completions and review requests across owned chats. On macOS, Voice settings offers separate editable voice lines and sound toggles for each category, a preview and global mute. Alerts use Daniel, a British male system voice. Settings and read receipts stay on the Mac; alerts require an open, connected app.

Customize installs reconnect to the installed workspace version, including detached local services. Automatic updates use the same upgrade path after native opt-in. The grant is scoped to the installed bundle and workspace; ordinary reconnects do not restart an unrelated service.
