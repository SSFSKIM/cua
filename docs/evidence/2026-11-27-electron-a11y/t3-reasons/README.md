# #228 task 3: the engine's two reasons, and their live tests (session task 181)

The pre-flight's §E3 on the engine's side and its §G 3 (`docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`),
for `native/linux-engine/src/unavailable.rs`. Run on the #171 VM (x86-64, Ubuntu 24.04), 2026-11-28, against
`cua-engine 0.4.6 (002824fc81c4)`, with the base before it (`cua-engine 0.4.6 (20d2eb476839)`, task 2's engine,
whose native code is feat/228's at b62b5928d) beside it on every window.

## What the engine does

`get_window_state`'s answer gains `tree_unavailable: {reason}` for an Electron window whose tree is not there, and
for nothing else:

- **`no_provider`**: association found no application on the accessibility bus for the window's process, and the
  window's `WM_WINDOW_ROLE` is `browser-window`. "No application" means the registry listed its applications and the
  bus named every one's process, none of them the window's (`atspi::of_process`); an application whose process the bus
  could not name might have been the window's, so then there is no field. The role is read only in this case.
- **`asked`**: the engine asked the application (task 1) and the wait (task 2) reached its bound with the frame still
  alone (`end: bound`, `shape: bare`). Only the observation that waited says so: the next one finds the application
  asked before on its connection, makes no request and no wait, and has no field.
- **No field** on a screenshot (`tree_wanted: false`), a window of an application that is on the bus (with or without
  a frame for the window), a process the bus could not name, a window with no `_NET_WM_PID`, NW.js (`pop-up`), Chrome
  (`browser`), CEF (no role), every other toolkit, and an asked application whose wait ended on content, or at the
  bound with views or an empty document.

The tree and its source are unchanged: the field is added after them, and an answer without it is the base's.

## The live tests (`reasons.py`, extending `../t2-wait/wait.py` and `../t1-rule/rule.py`)

Each run in its own `lib.Session` (`../probes/lib.py`: a private Xvfb display, never `:0`, a session bus and
accessibility bus of its own, a temporary home), whose environment names none of `ACCESSIBILITY_ENABLED`,
`GNOME_ACCESSIBILITY` and `QT_ACCESSIBILITY`; gedit, Chrome and NW.js with no network (`unshare --user --net`). The
bus is watched as task 1's runner does: an unfiltered `dbus-monitor --monitor`, each observation between two markers.
Every observation of the candidate is followed by the base's on the same window, and the candidate's answer less its
field must equal the base's. Every expectation is a check, and the run exits 1 on any unmet one. Under the lock:
`locked.sh t181 timeout -s TERM -k 60 30m python3 -I reasons.py <out> <apps> <scenario:runs> ...` with `ENGINE` and
`MAIN` set.

The final pass (`out/reasons.jsonl`, and `out/beside.jsonl` for the scenario added after it) exited 0:

| Scenario | Test | Runs (passed) | Result |
|---|---|---:|---|
| `off-the-bus` | §G 3 | 3 (3) | Both switches off, no variable: the fixture never joins the bus (the registry is empty). Every state read answers the X11 tree, one node, with `{reason: "no_provider"}`, in 1.1 to 1.5 ms; a screenshot between them has no field. No `GetAttributes`, no `ToolkitName` read, no `ask` record. The answer less the field is the base's. |
| `off-the-bus-beside` | §G 3 | 3 (3) | The same with gedit on the bus first: association asks the bus for gedit's process (one `GetConnectionUnixProcessID` a read), finds no application of the fixture's, and the answer is the same. |
| `asked` | §G 4, its field | 3 (3) | `--disable-renderer-accessibility`, `IsEnabled` on: the first observation asks once, waits the bound (1,985 to 1,996 ms, shape `bare`; the whole request 1,990 to 2,005 ms) and is answered bare with `{reason: "asked"}`. The next two, at once and 1.5 s later, are `asked_before`, answer in 4 to 8 ms, still bare, with no field. |
| `gedit` | negative | 2 (2) | On the bus, 480 nodes, no field. |
| `chrome-on` | negative | 2 (2) | Chrome 156, no flag, `IsEnabled` on: on the bus, its frame bare, left at its role (`browser`), no request, no field. No Chrome process left. |
| `chrome-off` | negative | 2 (2) | The same Chrome, both switches off: not on the bus, its role `browser`, the X11 tree, no field. No Chrome process left. |
| `nwjs` | negative | 2 (2) | NW.js 0.120.0: never on the bus, its role `pop-up`, the X11 tree, no field. |

In every run of every scenario the candidate's answer less `tree_unavailable` equals the base's on the same window.

**It can fail.** `out/control-base.jsonl` is `off-the-bus` and `asked` with the base as the candidate, and the run
exited 1: `state_reads_say_no_provider`, `the_field_is_exactly_the_reason` and `first_says_asked` false.
`out/control-base-first.jsonl` is the same control before `the_field_is_exactly_the_reason` was made to read a missing
field as a failed check: there the off-the-bus run failed with a `TypeError` in the runner, which also fails closed but
names no check.

**Task 2's runner at this engine** (`out/wait-at-t3.jsonl`, `../t2-wait/wait.py`, exit 0). Its §G 9 fallback, "bare
after the whole bound", now also requires the answer's `{reason: "asked"}`, as its docstring had promised for this task.
`fixture-disabled` 1/1, its first observation with the field and its later ones without; `vscode` 2/2, 393 nodes after
a 185 ms wait, so the fallback was not taken.
