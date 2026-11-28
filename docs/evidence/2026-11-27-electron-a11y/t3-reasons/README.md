# #228 task 3: the engine's two reasons, and their live tests (session task 181)

The pre-flight's §E3 on the engine's side and its §G 3 (`docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`),
for `native/linux-engine/src/unavailable.rs`. Run on the #171 VM (x86-64, Ubuntu 24.04), 2026-11-28, against
`cua-engine 0.4.6 (f3f849157af3)` (task 3 after its review's fix wave 1). The base runs beside it on every window:
`cua-engine 0.4.6 (20d2eb476839)`, task 2's engine, whose native code is feat/228's at b62b5928d.

## What the engine does

`get_window_state`'s answer gains `tree_unavailable: {reason}` for an Electron window whose tree is not there, and
for nothing else:

- **`no_provider`**: association found no application on the accessibility bus for the window's process, and the
  window's `WM_WINDOW_ROLE` is `browser-window`.
  - "No application" means all three of these held (`atspi::of_process`, `atspi::listed_whole`):
    - every entry of the registry's listing was an object reference;
    - the bus named every listed application's process;
    - none of those processes was the window's.
  - An entry left out of the listing, or a process the bus could not name, might have been the window's, so then there
    is no field.
  - The role is read only in this case.
- **`asked`**: the engine asked the application (task 1), and the wait (task 2) reached its bound with the frame still
  alone (`end: bound`, `shape: bare`). Only the observation that waited says so. The next one finds the application
  asked before on its connection, makes no request and no wait, and has no field.
- **No field** on:
  - a screenshot (`tree_wanted: false`);
  - a window of an application that is on the bus, with or without a frame for the window;
  - a process the bus could not name, or a registry listing with an entry of another shape;
  - a window with no `_NET_WM_PID`;
  - NW.js (`pop-up`), Chrome (`browser`), CEF (no role), and every other toolkit;
  - an asked application whose wait ended on content, or at the bound with views or an empty document.

The tree and its source are unchanged: the field is added after them, and an answer without it is the base's.

## The live tests (`reasons.py`, extending `../t2-wait/wait.py` and `../t1-rule/rule.py`)

**The sessions.** Each run is in its own `lib.Session` (`../probes/lib.py`): a private Xvfb display, never `:0`; a
session bus and an accessibility bus of its own; a temporary home. The environment names none of
`ACCESSIBILITY_ENABLED`, `GNOME_ACCESSIBILITY` and `QT_ACCESSIBILITY`. gedit, Chrome and NW.js run with no network
(`unshare --user --net`).

**What is watched.** The bus is watched as task 1's runner does: an unfiltered `dbus-monitor --monitor`, with each
observation between two markers.

**The base comparison.** After the candidate's observations, the base replays them on the same window, kind for kind
and in the same order, on a connection of its own.
- One base answer for each candidate answer, the screenshot included.
- Each candidate answer, less its `tree_unavailable`, must equal its base answer key for key.
- State reads ask for no picture. The screenshot asks for one, as `getScreenshot` does (`tree_wanted: false`,
  `include_screenshot: true`). Its generated file path is the only value normalized.
- A difference in any later answer fails the run (`the_field_is_the_only_difference`, with the per-answer `parity` in
  each row), and so does a base that answered fewer observations.

Every expectation is a check, and the run exits 1 on any unmet one. Under the lock:
`locked.sh t181 timeout -s TERM -k 60 30m python3 -I reasons.py <out> <apps> <scenario:runs> ...` with `ENGINE` and
`MAIN` set.

The final pass (`out/reasons.jsonl`) exited 0:

| Scenario | Test | Runs (passed) | Result |
|---|---|---:|---|
| `off-the-bus` | §G 3 | 3 (3) | Both switches off and no variable. The fixture never joins the bus (the registry is empty). Each state read answers the X11 tree, one node, with `{reason: "no_provider"}`, in 1.0 to 2.4 ms. A screenshot between them has its picture and no field. No `GetAttributes`, no `ToolkitName` read, no `ask` record. |
| `off-the-bus-beside` | §G 3 | 3 (3) | The same with gedit on the bus first. Association asks the bus for gedit's process (one `GetConnectionUnixProcessID` a read), finds no application of the fixture's, and the answer is the same. |
| `asked` | §G 4, its field | 3 (3) | `--disable-renderer-accessibility`, `IsEnabled` on. The first observation asks once, waits the bound (1,985 to 1,996 ms, shape `bare`; the whole request 1,990 to 2,006 ms) and is answered bare with `{reason: "asked"}`. The next two, at once and 1.5 s later, are `asked_before`: they answer in 4 to 7 ms, still bare, with no field. |
| `gedit` | negative | 2 (2) | On the bus, 480 nodes, no field. |
| `chrome-on` | negative | 2 (2) | Chrome 156, no flag, `IsEnabled` on: on the bus, its frame bare, left at its role (`browser`). No request, no field, no Chrome process left. |
| `chrome-off` | negative | 2 (2) | The same Chrome with both switches off: not on the bus, its role `browser`, the X11 tree, no field. No Chrome process left. |
| `nwjs` | negative | 2 (2) | NW.js 0.120.0: never on the bus, its role `pop-up`, the X11 tree, no field. |

In every run every candidate answer, less `tree_unavailable`, equals the base's answer to the same observation (43
answers, 43 equal).

**It can fail.** `out/control-base.jsonl` is `off-the-bus` and `asked` with the base as the candidate. The run exited 1,
with `state_reads_say_no_provider`, `the_field_is_exactly_the_reason` and `first_says_asked` false.

**Task 2's runner at this task's first engine** (`out/wait-at-t3.jsonl`, `../t2-wait/wait.py`, `0.4.6
(002824fc81c4)`, exit 0).
- Its §G 9 fallback, "bare after the whole bound", now also requires the answer's `{reason: "asked"}`, as its
  docstring had promised for this task.
- `fixture-disabled` 1/1: its first observation has the field, its later ones do not.
- `vscode` 2/2: 393 nodes after a 185 ms wait, so the fallback was not taken.
- Fix wave 1 changed no part of the engine that run reads: the registry listing it saw was whole.
