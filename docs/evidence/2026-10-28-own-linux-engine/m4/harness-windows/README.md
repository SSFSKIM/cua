# M4: the harness never changes a window it did not open (task 35)

The design session's rule (Decision Log, 2026-11-02): the differential harness sends no mutating request that names a
window it did not open. The harness no longer restores the window found active at a run's start. A run that starts
with a foreign window active opens and activates a holder first. Its own X tools go through a trace of the run's own,
and the trace's audit (`audit.mjs` `auditForeign`) fails any foreign change (`scripts/linux-engine-diff/README.md`,
"Windows the harness did not open").

These are development runs (`--dev`), not a release gate. The candidate is a musl build made as the release workflow
makes it: `cua-engine 0.3.0 (e6ed649f9d91)`, sha256 `858f75ab4b1fa994bf4d58b87010ca466b2b2d95cf229c8a2d2f697d2a8b679c`,
static-pie. The vendor builds are the pinned and the newest build, as in T4's runs. Window ids only; no title of a
window the harness did not open is recorded.

## On `:0`, started with the owner's Chrome active (`run-2/`, exit 0)

`diff-run.sh` runs the scenes `gedit`, `minimized`, `minimized-xterm` and `minimized-recorder` with `tree`, `press_key`,
`click` and every minimized case, at 7fbe9e1c. The owner's Chrome (`0x00600002`) was active before and after.

- `meta.active_start`: `0x00600002`, `foreign`. The `end` row's `desktop`: start and end both `0x00600002`, `foreign`,
  neither acted on. The holder was `0x0140000e`.
- The harness's own trace: 32,387 requests, 1,997 of them changes of a window, every one naming a window of the
  harness's (`trace.foreign` empty).
- The engines' audit passes: 36, all clean, none with a foreign change.
- The activating stub was failed by the witness and the audit, and the in-front checks held, on two windows of the
  harness's.
- Verdict line: "every verdict PASS".

`run-1/` is the same run at 1773390c. The desktop record is the same: start and end `0x00600002` `foreign`, its trace
32,407 requests and 1,997 changes, all the harness's own, and 36 clean audits. It failed one verdict, `gedit press_key
cua`: the effect was not seen on 40 of 40 samples.

## The defect run-1 found, and its fix (`repro-collision/`, `repro-collision-fix/`, `ab-head/`, `ab2-head/`)

The `minimized` scene opened its gedit with the `gedit` scene's label. In a sitting with both scenes, each engine's two
gedit windows therefore shared one scratch file, and the second open rewrote the first window's file. Only cua runs the
minimized cases, so only cua's `gedit` window was affected.

| Run | Commit | Scenes and operations | Result |
|---|---|---|---|
| `ab-head` | 1773390c | gedit `press_key` | PASS |
| `ab2-head` | 1773390c | gedit `tree`, `press_key`, `click` | PASS |
| `repro-collision` | 1773390c | gedit `press_key`, minimized `minimized_press_key` | FAIL: gedit `press_key` cua |
| `repro-collision-fix` | 7fbe9e1c | the same | PASS |

7fbe9e1c gives the minimized scene's gedit its own stem (`openGedit(…, {stem})`, as `openChrome` takes one). T4's
runs had no `gedit` scene, so they could not show it. M4's gate runs both scenes in one sitting.

## The negative control, on a private display (`negative-control/`)

`private-control.sh` starts Xvfb `:91` with Openbox and opens a terminal standing for the person's window
(`0x0040000c`), activated first. `desktop-control.mjs` then begins one harness Desktop, opens its front window and
closes the run. It does this twice: with the worktree's build, and with a build that still restores.
`make-restoring-build.py` makes the restoring build by putting the old restore back into `closeEverything`
(`restoring-build.diff`).

| Build | Exit | Start / end active | Holder | Trace | Foreign changes |
|---|---|---|---|---|---|
| worktree (`worktree.json`) | 0 | `0x0040000c` foreign / the same | `0x0080000c` | 2,520 requests, 8 changes | none |
| restoring (`restoring.json`) | 1 | the same | `0x0080000c` | 2,528 requests, 10 changes | `_NET_ACTIVE_WINDOW ClientMessage on 0x0040000c` |

In both runs the window manager had already activated the person's window when the holder closed. The restore changed
nothing visible, and the audit failed it all the same. This is the stale write the rule forbids.

## The checks around the runs

- Stray checks before and after found no harness process. The only client window on `:0` was the owner's `0x600002`,
  and Chrome pid 9910 ran throughout.
- Four `/tmp/cua171-audit-*` directories were left by two trial runs of the control. Those runs had given the private
  display no authority file, so `xtrace` refused to start, and `startProxy` leaves its directory when xtrace does not
  start. They were removed.
