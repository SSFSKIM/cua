# #228 task 1: the rule's live tests (session task 179)

The pre-flight's §G 5 to 8 (`docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`) for the engine's rule
(`native/linux-engine/src/ask.rs`): one `Accessible.GetAttributes` to a bare frame's application, only when a tree was
asked for, the application's toolkit is Chromium, the window's role is `browser-window` and the application was not
asked before. Run on the #171 VM (x86-64, Ubuntu 24.04), 2026-11-28, against `cua-engine 0.4.6 (744af93d0731)`, this
branch's first commit, with the branch's base (`0a8f8a2df898`) as the control for §G 7. No wait yet (task 2).

## How it ran

- `rule.py` runs each scenario in its own `lib.Session` (`../probes/lib.py`: a private Xvfb display, never `:0`, a
  session bus and accessibility bus of its own, a temporary home), `IsEnabled` on and `ScreenReaderEnabled` off.
- A `dbus-monitor --monitor` of the run's own watches the accessibility bus for every `GetAttributes`,
  `GetRelationSet` and `Properties.Get` of `ToolkitName`, from any sender. The probe's own calls (a sentinel that proves
  the monitor is up, and its own registry reads) come from its own connection and are not counted.
- The engines run as the service runs them (`cua-engine server --desktop dedicated`), with `--stats`: each row carries
  the request's bus calls by member and the rule's record (`ask`).
- Chrome is the installed binary (not the provisioning wrapper, which adds the flag), on a profile inside the session,
  in a network namespace with loopback only, with `--disable-popup-blocking` so its page opens its own pop-up. No
  signal was sent to it: it ended with its display, and each Chrome row records that no process of it was left.
- Under the host lock: `/Users/new/.local/share/cua-171/locked.sh t179 timeout -s TERM -k 60 20m python3 -I rule.py
  <out>` with `ENGINE` (the candidate) and `BASE` (the base's build) set.

## What it found (`out/rule.jsonl`, one row per scenario)

| Scenario | §G | Result |
|---|---|---|
| `fixture-bare` | 5, and the positive case | Two screenshots (`tree_wanted: false`): no `GetAttributes`, no `ToolkitName` read, and the probe's own walk still finds 2 nodes. The first state read: one `ToolkitName` read and one `GetAttributes`, from the engine's connection, its answer still the frame alone. The next two reads: 28 nodes with `Fixture button`, nothing more sent. No `GetRelationSet` at any point. |
| `fixture-flag` | 6 | The fixture with `--force-renderer-accessibility`: two reads of 28 nodes with the button, no `GetAttributes`, no `ToolkitName` read, no `ask` record. |
| `others` | 7 | gedit (480 nodes), the GTK 4 scene (11), kate (891) and qtcreator (1261): the candidate's calls by member equal to the base's on both reads, and the base's equal to its own second pass. A bare GTK 3 frame (`bare-gtk3.py`): one `Properties.Get` more than the base on the first read (its `ToolkitName`, `gtk`), none on the second, no `GetAttributes`. |
| `chrome-tabbed`, `chrome-popup` | 8 | Chrome 156's tabbed window (`browser`) and its pop-up (`pop-up`), each observed first in its own session, then each again: every frame bare, one `ToolkitName` read in all, no `GetAttributes` and no `GetRelationSet`. |

The application's own record of its mode (the fixture's `cua-fixture-accessibility.jsonl`) stayed `false` throughout,
as it does on Electron 37 and later even after the request (the pre-flight's §A), so the walk is the screenshot's
evidence, not the record.
