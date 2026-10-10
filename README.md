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
this feature. Connect a SuperSurfer source checkout once; it stays available in
Customize without taking a row in the Projects sidebar. Each idea opens its own
agent chat, so multiple ideas can progress independently. **New chat** also opens
a coding conversation directly, without a feature form. Sent messages offer
**Edit and resend** and **Resend**; these send a new message with the original
attachments and preserve earlier messages and replies.
The sliding **Show visual preview** switch above **Send idea** defaults off.
Turn it on to request and display a configured preview; off omits the preview
request and area. The page keeps the source location and offers local
checkout setup when no source project is linked. **Install and
restart** copies saved source to the Mac, installs locked dependencies, packages
and verifies the app, then requests confirmation before replacing and restarting
it. Cancellation or a failed build leaves the installed app unchanged. Save open source files first. The app's containing folder must
be writable by your user; project and workspace data are not replaced. The first
installation of a build containing Customize must use the ordinary package
installation path, since an older app has no in-app updater.
After a confirmed Customize install, the app reconnects to the same workspace
and restarts its authenticated service to load the new UI and server. Active agent
turns can be interrupted and are not replayed; saved history and workspace data
stay in place. A failed service startup restores the previous service. The restart
permission is limited to the installed bundle and the original workspace, and
clears after a successful connection. Older services without process identity
support need one manual restart when first upgrading to this build. Ordinary
reconnects do not restart detached services without a confirmed install.

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
