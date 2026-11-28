# #228 task 1: the rule's live tests (session task 179)

The pre-flight's §G 5 to 8 (`docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`) for the engine's rule
(`native/linux-engine/src/ask.rs`): one `Accessible.GetAttributes` to a bare frame's application, only when a tree was
asked for, the application's toolkit is Chromium, the window's role is `browser-window` and the application was not
asked before. Run on the #171 VM (x86-64, Ubuntu 24.04), 2026-11-28, against `cua-engine 0.4.6 (a60e31f27848)`, the
branch after fix wave 1, with a build of main (`10ee501b0e1b`) as §G 7's control. No wait yet (task 2).

## How it ran

- `rule.py` runs each scenario in its own `lib.Session` (`../probes/lib.py`: a private Xvfb display, never `:0`, a
  session bus and accessibility bus of its own, a temporary home), `IsEnabled` on and `ScreenReaderEnabled` off.
  gedit, kate, qtcreator and Chrome run in a network namespace with loopback only (`unshare --user --net`).
- **The monitor.** A `dbus-monitor --monitor` of the run's own, unfiltered: every method call on the accessibility
  bus, from every sender, with its string arguments. Each observation sits between two markers, a `GetAttributes` the
  probe sends from its own connection to the registry's desktop object (not an application). The second marker's
  arrival proves the monitor has seen everything routed before it, so a read's count of zero is a count, not a
  silence. Markers are never counted; a request is counted from any other sender.
- **The engines** run as the service runs them (`cua-engine server --desktop dedicated --stats`). An engine's own calls
  are those of the connections that said `Hello` after it started; §G 7 compares them by interface and member,
  candidate against main, on the same windows in one session, and main against itself in a third pass.
- **Every expectation is a check.** Each row carries `checks` and `passed`, and the run exits 1 when any scenario did
  not pass. Test 5 requires the screenshot itself, the fixture's record of its mode unchanged and the probe's walk
  still at 2 nodes; every read requires an answer.
- **It can fail.** `out/control-broken.jsonl` is test 5 against a control engine built from the same commit with
  `tree_wanted` ignored (it asks on a screenshot): the run exited 1, with `screenshot_sent_no_GetAttributes`,
  `screenshot_read_no_ToolkitName`, `mode_unchanged_after_screenshots` and the first read's checks false.
- Chrome is the installed binary (not the provisioning wrapper, which adds the flag), on a profile inside the session,
  with `--disable-popup-blocking` so its page opens its own pop-up. No signal was sent to it: it ended with its
  display, and each Chrome row checks that no process of it was left.
- Under the host lock: `/Users/new/.local/share/cua-171/locked.sh t179 timeout -s TERM -k 60 25m python3 -I rule.py
  <out>` with `ENGINE` (the candidate) and `MAIN` set. The run exited 0.

## What it found (`out/rule.jsonl`, one row per scenario, all `passed`)

| Scenario | §G | Result |
|---|---|---|
| `fixture-bare` | 5, and the positive case | Two screenshots (`tree_wanted: false`), each with its picture: no `GetAttributes`, no `ToolkitName` read, the fixture's record unchanged and the walk at 2 nodes. The first state read: one `ToolkitName` read and one `GetAttributes`, from the engine's connection, its answer still the frame alone. The next two: 28 nodes with `Fixture button`, nothing more sent. No `GetRelationSet` anywhere. |
| `fixture-flag` | 6 | The fixture with `--force-renderer-accessibility`: two reads of 28 nodes with the button, no `GetAttributes`, no `ToolkitName` read, no `ask` record. |
| `others` | 7 | gedit (480 nodes), the GTK 4 scene (11), kate (891) and qtcreator (1261): the candidate's calls on the bus by member equal to main's on both reads (3,041, 115, 6,854 and 9,688 calls on the first), and main steady against its own third pass. A bare GTK 3 frame (`bare-gtk3.py`): exactly one `Properties.Get` more than main on the first read (its `ToolkitName`), none on the second. No `GetAttributes` anywhere. |
| `chrome-tabbed`, `chrome-popup` | 8 | Chrome 156's tabbed window (`browser`) and its pop-up (`pop-up`), each observed first in its own session, then each again: every frame bare, one `ToolkitName` read in all, each left at the role, no `GetAttributes`, no `GetRelationSet`, no Chrome process left. |

The fixture's own record of its mode stays `false` on Electron 37 and later even after the request (the pre-flight's
§A), so the walk carries test 5's evidence of the mode and the record its evidence that nothing else changed.
