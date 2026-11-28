# #228 task 2: the wait, and its live tests (session task 180)

The pre-flight's §E1 wait and §G 2, 4, 9 and 10 (`docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`), for
the engine's `native/linux-engine/src/wait.rs`: once `ask.rs` has asked a bare Electron frame's application to turn
its accessibility on, the frame is read again until its content comes or the bound passes. Run on the #171 VM
(x86-64, Ubuntu 24.04), 2026-11-27, against `cua-engine 0.4.6 (59d106de972a)`, with task 1's engine
(`a60e31f27848`, no wait) as the control.

## What the wait does

- **It ends on the frame's own content** (`wait::shape`), found by `shapes.py` (`out/shapes.jsonl`): after the request
  a Chromium window shows its views within some 20 ms, and a window with a page shows a `document web` among them at
  once, empty until the renderer sends the page.
  - A `document web` with children ends it: the page.
  - No `document web`, something beyond panels (a control) and no node lost ends it at once: a window with no page
    (an Electron `BaseWindow` with its controls, CEF's terms dialog).
  - The frame alone, an empty document (`about:blank`, a page still to come), panels alone (`out/shapes-panels.jsonl`:
    a `BaseWindow` with no menu and no controls) or a read that lost a node whose role failed (it may have been the
    document) waits on.
- **Its bound is 2 s of wall time from the request's reply, the reads included.** Each read is made by the deadline
  (`atspi::read_by` over `Bus::recv_until`). Past it no reply already in is handed out and no call is queued; a read
  the deadline cuts, or whose tree is built only after it, is abandoned, and the answer is the last whole read. Calls
  the deadline caught unwritten are dropped, so the connection stays. A read every 20 ms (`GAP`).
- **Each read is confirmed.** On cua's own association routes (same-title duplicates, the caption) a read in the wait
  is the answer only once the window's association is run again and names the same frame, its calls ending by the
  deadline (`Bus::by`, `engine::confirmed_by`), as the first read is confirmed.
- **Once per application per bus connection.** The wait follows a request that went out, and the request goes out
  once (task 1's rule), so an application asked before is answered from the read it gave, with no wait. Nothing else
  waits: a frame with content, a screenshot, and every window the rule does not ask go as they did.
- The `--stats` line's `ask` record gains `wait`: `{end, shape, ms, reads, content_ms, nodes}`.

## The measurement, on the engine's own frame

Every first observation (the one that asked and waited) through the engine as the service runs it, timed by the engine
itself (`wait.ms`, from the request's reply) and by the runner (the whole request). `out/wait.jsonl` is the final
pass at 59d106de9; the pooled figures add `out/wait-first-pass.jsonl` (the same build, below),
`out/earlier-measure1.jsonl` and `out/earlier-measure2.jsonl` (a build of the same wait before formatting, `t2-wip`).

| Window | Runs | Ended | Wait, ms (min / median / max) | First content, ms | Reads | Nodes |
|---|---:|---|---:|---:|---:|---:|
| the fixture, started by hand | 30 | page 30 | 27 / 30 / 42 | 27 / 30 / 42 | 1 | 28 |
| VS Code 1.148, 8 s after it joined the bus | 16 | page 16 | 138 / 162 / 195 | 26 / 28 / 30 | 2 to 3 | 393 |
| VS Code, 3 s after | 14 | page 13 (1 not associated yet, below) | 142 / 205 / 282 | 26 / 30 / 40 | 2 to 6 | 301 to 393 |
| VS Code, 1 s after, its workbench loading | 15 | page 15 | 39 / 176 / 270 | 26 / 29 / 39 | 1 to 10 | 18 |
| an Electron window with no page (`no-page/`) | 18 | no page 18 | 24 / 26 / 31 | 24 / 26 / 31 | 1 | 13 |
| the fixture with `--disable-renderer-accessibility` | 6 | bound 6 | 1,982 / 1,994 / 2,000 | none | 93 to 94 | 1 |

**The longest wait that ended on content was 282 ms.** The pre-flight's slower figures were not the wait's: its 542 ms
and 2.1 s for VS Code were a whole-application tree read until it stopped growing. On the frame, VS Code's document has
children 140 to 280 ms after the request, and the tree goes on growing as VS Code builds its workbench, with or
without the request: started with `--force-renderer-accessibility` and observed 1 s after it joined the bus, VS Code
answers 18 nodes, then 278 to 288 at 2.5 s and 404 at 4 s (`vscode-flag-early`), the same course as the request's 18,
285 and 388 to 393 (`vscode-early`). So the wait answers what VS Code has at that moment, as the flag would, and does
not wait for a workbench still loading.

**Why 2 s.**
- It is 7 times the longest wait measured here, on an idle VM, and covers the pre-flight's one slow case of the page
  itself (VS Code's document at 0.7 s on its first run, `out/apps-first-run.jsonl`) with room for a loaded host.
- It is paid in full only by an application that never shows its content (`--disable-renderer-accessibility`, a
  renderer that hangs), and only once per application per connection. 2 s is what the engine already lets a silent
  bus cost one observation (`dbus::IO_TIMEOUT`).
- A tighter bound (500 ms) would hold every page measured but has a margin under 2 against the slowest; a looser one
  only lengthens the never-answering case.

## The live tests (`wait.py`, extending `../t1-rule/rule.py`)

Each run in its own `lib.Session` (`../probes/lib.py`: a private Xvfb display, never `:0`, a session bus and
accessibility bus of its own, a temporary home), `IsEnabled` on and `ScreenReaderEnabled` off; VS Code and CEF with no
network (`unshare --user --net`), unpacked from their packages in the scratch (`code.deb` and `cef152.tbz`, SHA-256 in
`../README.md`). The bus is watched as task 1's runner does: an unfiltered `dbus-monitor --monitor`, each observation
between two markers, so a count of zero is a count. Every expectation is a check, and the run exits 1 on any unmet one.
Under the lock: `locked.sh t180 timeout -s TERM -k 60 40m python3 -I wait.py <out> <apps> <scenario:runs> ...` with
`ENGINE` set.

| Scenario | §G | Runs (passed) | Result |
|---|---|---:|---|
| `fixture-started` | 2 | 10 (10) | The first `get_window_state` sends one `GetAttributes`, waits 29 to 42 ms and answers 28 nodes with `Fixture button`, the whole request 34 to 50 ms. The second asks and waits for nothing. |
| `fixture-disabled` | 4 | 3 (3) | The first observation asks, waits the bound (1,992 to 2,000 ms, 93 or 94 reads) and answers the frame alone. The second and third are `asked_before`, ask nothing and answer in 4 to 9 ms. |
| `vscode` | 9 | 5 (5) | The first observation has VS Code's page, 393 nodes, after a wait of 146 to 163 ms; the second has it with no request and no wait; `argv.json` has no `force-renderer-accessibility`. |
| `no-page` | 10, by substitution (below) | 6 (6) | An Electron `BaseWindow` with Chromium's own window controls (`browser-window`): answered after 25 to 29 ms, ended as a window with no page, with Close, Minimize, Maximize and Restore. |
| `cef-dialog` | 10, ruling 1251 | 1 (1) | CEF's terms dialog, Chromium's own: the engine finds no frame for it (its window has neither a class nor a role) and answers from X11; no request, no wait. Under ruling 1251 it is not asked; were its frame found, the rule would leave it at its role. |
| `vscode-3s`, `vscode-early`, `vscode-flag-early` | measurement | 5, 3, 3 (all) | VS Code observed 3 s and 1 s after it joined the bus, and the flag's control (above). |

**It can fail.** `out/control-no-wait.jsonl` is `fixture-started`, `fixture-disabled` and `no-page` against task 1's
engine, which asks and does not wait: the run exited 1, with `first_has_the_button`, `first_waited_the_bound`,
`first_ended_on_no_page` and `first_has_its_buttons` false (its first answers are the frame alone, in 4 to 10 ms).

**The first pass** (`out/wait-first-pass.jsonl`, the same build) exited 1 on `vscode-3s`, then checked as §G 9. Two of
its five first observations had 293 nodes, under §G 9's 300: VS Code 3 s after joining the bus is still building its
workbench, and the flag's control shows the same course. One first observation was answered from X11, the engine not
yet matching VS Code's window to its application; the rule never ran, and the next observation asked and waited. So
§G 9 is the `vscode` scenario, on a VS Code that has loaded, and `vscode-3s` became a measurement with the wait's own
checks. Every other scenario passed in both passes.

**§G 10 is met by substitution** (accepted by the coordinator in fix wave 1). §G 10 names "a dialog of Chromium's
own". Under ruling 1251 the engine asks only `browser-window` windows, and CEF's terms dialog has no role, so it is
never asked and never waited on (`cef-dialog`). The wait's no-page end is proved on an Electron window with no page
instead (`no-page`), whose role is Electron's. The ask rule is not widened for it.

## Fix wave 1

The review's four items, at `bd5caab4f`: the rows are `out/wave1/wait.jsonl` (`cua-engine 0.4.6 (bd5caab4fce2)`),
which exited 0, with two controls that exited 1.

1. **The deadline governs the read itself.** Replies already in no longer outrun it, and a tree built after it is
   rejected. Calls queued after it are dropped unwritten and the connection stays. Unit tests cover each path in
   `dbus.rs` (buffered replies past the deadline; calls queued past it, by `recv_until`, `calls_until` and a tree read;
   calls inside `Bus::by`) and in `wait/tests.rs` (a read whose tree completes after the deadline).
2. **Each replacement read is confirmed again**, by the deadline, on cua's own routes. `twins` (`twins/`: one process,
   two windows of the same title, told apart by position) passed 3/3: each window answers its own page (`Left button`,
   `Right button`), and the first observation, which waited, made one association more than the plain observations
   after it (3 `GetConnectionUnixProcessID` calls against 2), which is the wait's own confirmation. Against the wait
   before this wave (`59d106de9`, `out/wave1/control-before-wave1.jsonl`) that check fails: 2 against 2.
3. **Panels alone wait on.** `panels` (`no-page/ --t180-panels`, 7 nodes of panels) passed 3/3: the wait ends at the
   bound (1,983 to 1,997 ms) with shape `views`, and the next observation waits for nothing. Before this wave it ended
   at once as `no_page` (24 ms; the same control file).
4. **§G 9's fallback** now needs the bare answer (1 node) and a wait at the bound by the stats (at least 1,975 ms), not
   `end == "bound"` alone. Task 3's `tree_unavailable` will be required too. Every `vscode` run had its page, so the
   fallback was not taken.

The rest of the final pass: `fixture-started` 10/10 (page after 28 to 35 ms), `fixture-disabled` 3/3 (bound, then no
wait), `vscode` 5/5 (393 nodes after 145 to 203 ms), `no-page` 6/6 (27 to 32 ms), `cef-dialog` 1/1, `vscode-early`
3/3 (145 to 826 ms; the slowest wait yet, under the bound). Task 1's engine (`out/wave1/control-no-wait.jsonl`) still
fails `fixture-started`, `fixture-disabled` and `no-page`. `early.py` (`out/early.jsonl`) walked each window with no
pause right after the request and found no shape between the frame alone and the whole views tree: the panel-only
record is a window that has nothing else.
