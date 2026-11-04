# M4 T7: the FocusOut timer

Development runs on the #171 VM (`dc-linux171-1e68`, 8 vCPU), 2026-11-03, not a release gate. Every run is on a
private Xvfb the harness starts itself (`startPrivateServer`, under its watchdog), with Openbox and the run's own
applications, homes and session bus; the harness withdraws its live-run declaration first, so nothing reaches `:0`.
The harness is exported from the commit named per run (the export has no `.git`, so the `meta` rows say
`commit: null`). The candidate is a musl build made as the release workflow makes it (`build-musl.sh`: a hermetic
Cargo home, the remapped paths, `cargo build --release --locked --target x86_64-unknown-linux-musl`, stripped,
static-pie): `cua-engine 0.3.0 (24a86030038a)`, sha256
`a9362c71300642af52cb6bffaa2c4161e0bcba72394d69ac7f1db236e5f73612`. Its engine sources are those of fd581052 (no
engine change since). The released engine is `cua-engine 0.3.0 (cd4c929758ca)`. "Twice the load" is 16 `stress-ng`
CPU workers on the 8 cores (`--load-factor 2`).

The experiment (`scripts/linux-engine-diff/focus-timer.mjs`, its README section "M4 T7's addition"): per family, three
lanes, `timer` (the engine as it ships), `unredirect` (the delay, each request's redirect dropped with its FocusOut,
`--retention per-request`) and `control` (`--teardown-ms 0 --retention per-request`); scenarios `burst`, `aba`,
`paste`, each read back as the exact text at the caret; 30 consecutive passes for a timed lane (at most 60 runs), 10
control runs; an audit pass per family on the timer and control lanes; on Chromium 10 SIGTERM runs straight after a
burst's last answer and 3 SIGKILL controls.

| Directory | Harness | Engine | Load | Verdict |
|---|---|---|---|---|
| `idle/` (`t56-final-idle-b`) | 24a86030 | candidate | idle | **pass** (exit 0) |
| `load2/` (`t56-final-load2-b`) | 24a86030 | candidate | 2x | fails: see below |
| `delay-200-load2/`, `delay-400-load2/` | 24a86030, the delay set to 200 / 400 ms (a probe copy) | candidate | 2x | Chromium only |
| `terminal-030-load2/` | 24a86030 | released 0.3.0 | 2x | gnome-terminal only |
| `control-probe/` (`t56-probe-perreq`) | 78053e2b, the control given `--retention per-request` | candidate (78053e2b) | idle | Chromium, `--trials 3` |
| `qt-030/` | fd581052 | released 0.3.0 | idle | kate, qtcreator: 32 paste runs (16 per family), all unconfirmed, text exact |
| `events/` (`t56-events`) | fd581052 | candidate (fd581052) | idle | events experiment: pass |

## Idle (`idle/`)

Every family (chrome, electron, gedit, kate, qtcreator, firefox, writer, gnome-terminal) reached 30 consecutive on
both timed lanes in every scenario (48 series). Every audit is clean: on the timer lane 6 FocusOuts per family, all 6
attributed to the request whose input scheduled them and reported on a later line (deferred); on the control lane
53, none deferred. The control fails on Chromium in every scenario, the text wrong (Chrome bursts 3/10, A-B-A 10/10;
Electron 9/10 and 10/10). SIGTERM 10/10 on Chrome and Electron, exit 101 ms after the last answer (median); SIGKILL
3/3 leaves the session unclosed. Writer on `gen` is not among the families (no text field).

## The control on the private display

On Xvfb a 0 ms FocusOut with the window still redirected cuts nothing in Chromium: `--teardown-ms 0` alone showed 0 of
10 wrong texts in bursts and A-B-A, idle (two sittings, the later at harness 78053e2b) and at twice the load (a
development sitting of 3-run series); those sittings are not kept. A
FocusOut followed by the unredirect cuts keys and delivers them with the next FocusIn, the reorder M0.4 saw on `:0`
after a FocusOut alone (`control-probe/`: a run reads `abcDef`, the next `gHijkLmnoPqrsTabcDefgH`).

## Twice the load (`load2/`, `delay-*`, `terminal-030-load2/`)

- The timer lane: every family's burst and A-B-A, and every family's paste but gnome-terminal's, reached 30
  consecutive. gnome-terminal's paste missed 9 of 60 (its paste answered "could not be confirmed" after about 2.1 s,
  and the next request then refused with the engine's retry guard); the released 0.3.0, which spends 100 ms per key
  request, reached 30 consecutive there (`terminal-030-load2/`).
- The unredirect that follows the delay cuts Chromium keys at twice the load: the `unredirect` lane's bursts missed
  31/60 (Chrome) and 39/60 (Electron), and SIGTERM, whose exit drops the engine's redirects 100 ms after the last key,
  failed 8/10 (Chrome) and 4/10 (Electron), each a cut and its tail delivered with the next FocusIn.
- With the delay at 200 ms the unredirect lane's bursts still missed (12/60, 21/60) and Electron's SIGTERM failed
  5/10; at 400 ms every Chromium series reached 30 consecutive and SIGTERM was 10/10 on both.

An earlier sitting at 2x (`t56-final-load2`, harness f6c2c91a, not kept) failed the timer lane's Chromium bursts with
no text at all: two reads 150 ms apart had agreed before the loaded renderer took the first key. The read now also
waits, at most 5 s, for the text to reach the run's length (24a86030); keys cut until a later FocusIn still leave it
short.

**A mislabel in the rows above (the review of 9f3edff1).** Every `focus-timer-run` and `focus-timer-stop` row of the
sittings above carries its series or stop index as `"run": 0…59`, overwriting the sitting's name that the harness
writes first, so each of their `summary.md` files has about 43 empty "## N … run unfinished" sections after the real
one. The rows are otherwise right. From 5b9d28ed the index is `trial` and `run` is the sitting's name.

## The fix (`fix/`): the exit settle, independent starts, the paste trace

The design session's rulings on T7's escalation and on its review (2026-11-04). The engine's exit now waits, after its
FocusOut drain, until 300 ms have passed since the last key input to a window whose redirect it still holds (it drops
those redirects as it exits, and a covered Chromium window whose redirect goes while it has keys queued cuts them). The
harness starts every Chromium run independently (a fresh engine's Shift delivers any tail an earlier cut held back,
Ctrl+A and BackSpace empty the field), waits out the retry guard after an unconfirmed paste, and reports for every
series the independent count, which the verdict judges, and the raw count, in which a run that met a tail at its start
or follows an unconfirmed paste fails too. Rows carry `trial` (their index) and `tail_at_start`; paste rows their
`--stats` record. The candidate builds are musl builds made the release workflow's way, labelled dev runs.

| Directory | Harness | Engine | What | Verdict |
|---|---|---|---|---|
| `fix/settle-0-load2/` | 80fcbf80 | musl 5b9d28ed, `--exit-settle-ms 0` | the stop runs alone, Chrome and Electron, 2x | keys cut: Chrome 24/30 (raw 19), Electron 17/30 (raw 9); clicks 10/10 both |
| `fix/settle-200-load2/` | 80fcbf80 | the same, 200 | the same | Chrome 26/30 (raw 24), Electron 28/30 (raw 26); clicks 10/10 |
| `fix/settle-200-load2-compiling/` | 80fcbf80 | the same, 200 | the same, a test build running beside it (load beyond 2x): kept apart | Chrome 26/30, Electron 29/30 |
| `fix/settle-250-load2/` | 80fcbf80 | the same, 250 | the same | 30/30 both; clicks 10/10 |
| `fix/settle-300-load2/` | 80fcbf80 | the same, 300 | the same | 30/30 both; clicks 10/10 |
| `fix/load2-250/` (`t56-fix-load2-b`) | 82b92193 | musl 82b92193 (settle 250) | every lane of Chrome, Electron, gnome-terminal, 2x | Chrome SIGTERM 29/30 (one whole burst cut); see below |
| `fix/load2-300/` (`t56-fix-load2-c`) | 67681a38 | musl 67681a38 (settle 300), sha256 `63cba88a…` | every lane of Chrome and Electron, 2x | SIGTERM 30/30 both; see below |
| `fix/stops-smoke-idle/` | the working tree at 5b9d28ed with 80fcbf80's flag parse | musl 5b9d28ed, settle 0 | the stop runs, Chrome, idle | the drag stop refused: shared mode refuses Chromium's background drags |
| `fix/terminal-trace-load2/` | the working tree at 93390053 plus the trace fields of 9e703903 | a VM build of 9e703903's sources | gnome-terminal, 2x: what the paste's confirmation saw | timer paste 30/30; unredirect paste 9/60 (7 own, 2 guard) |

- **The settle's steps.** 250 ms was the smallest 50 ms step that held 30 consecutive independent SIGTERM runs on both,
  but the full sitting on its bytes then cut Chrome once in 30, so the value is 300 ms, which held 30/30 in its step
  and in the full sitting (`fix/load2-300/`). The unredirect cut no click at any step, the 100 ms drain alone included,
  so the settle follows keys only; the clicks stop exits about 104 ms after its last answer.
- **The final sitting (`fix/load2-300/`).** The timer lane, the engine as it ships, reached 30 consecutive in every
  scenario on Chrome and Electron, independent and raw alike; the audits are clean (6 FocusOuts attributed per family,
  all deferred); the control fails on every scenario; SIGTERM after a burst 30/30 on both (exit 303 ms after the last
  answer), after clicks 10/10 (104 ms); SIGKILL 3/3 unclosed. The `unredirect` lane's bursts failed (Chrome 24 of 60,
  Electron 18): that lane drops each request's redirect at its FocusOut, 100 ms after the keys, the mechanism the exit
  settle exists for, and the settle does not apply to it (it is no shipped configuration).
- **gnome-terminal at 2x (`fix/load2-250/`).** The timer lane's paste reached 30 consecutive in 59 runs (6 unconfirmed,
  raw 11 misses); the unredirect lane's did not (12 unconfirmed in 60). The trace (`fix/terminal-trace-load2/`) shows
  the keys had landed before every missed paste's observation; in most misses the paste landed but the terminal's
  accessible text had scrolled under the confirmation (its count fell by about a row), and in the rest the paste never
  landed. Not fixed here: it needs a ruling (task 56's report).
- **Independent counts from the earlier rows** (a run's own burst arrived whole iff its text ends with the burst): in
  `load2/` (the 100 ms drain) Chrome had 6 own cuts of 10 (raw 8), Electron 3 (raw 4); in `delay-200-load2/` Chrome 0,
  Electron 4 (raw 5); in `delay-400-load2/` none.

## Fix 2 (`fix2/`): the paste's confirmation in a terminal that scrolls

The design session's ruling on T7's paste trace (2026-11-04). In every missed gnome-terminal paste the keys had landed
before the paste observed the field. In most, the paste landed but wrapped the last row of a full screen, the first
row scrolled out, and the confirmation read offsets taken before the scroll; in the rest the terminal never took the
paste. Every sitting below ran on a private Xvfb the harness started, never on `:0`; the candidates are musl builds made
the release workflow's way (dev runs).

| Directory | Harness | Engine | What | Result |
|---|---|---|---|---|
| `terminal-030-load2/` (`t56-fix2-terminal-030-load2`) | 76ba4842 | the released 0.3.0 (`5f4a1600…`) | gnome-terminal, every lane, 2x | timer paste 30/30; unredirect paste 6/60 unconfirmed (raw 11): 3 landed and scrolled, 3 never taken; control 3/10 (2 scrolled, 1 never taken) |
| `vte-probe/` | 76ba4842 | 0.3.0 | the harness's terminal filled by keys, its accessible text after each 14 keys | 20 rows of 69; no newline at a soft wrap, only the text's last; `GetTextAtOffset` at `LINE_START` gives the rows; a scroll drops exactly the first row |
| `paste-probe-old/` | 29e31ee1 | musl 67681a38 (T7's first fix) | idle, a full screen, 60 runs of 8 keys and a paste of the run's own text | 7 pastes scrolled the screen: all 7 landed, none confirmed |
| `paste-probe-new/` | 29e31ee1 | musl 29e31ee1 (the fix) | the same | 7 scrolled, 7 confirmed by the scrolled rule; 53 by the segment; 60/60; the whole read 3.8 ms median |
| `fresh-terminal-load2/` (`t56-fix2-fresh-terminal-load2`) | df1e835f | musl df1e835f (`9c4b9e4f…`) | gnome-terminal, every lane, 2x | timer paste 30 consecutive after one never-taken miss (trial 3); unredirect 30 consecutive in 48 (3 never taken); no scrolled miss; audits clean |
| `fresh-terminal-load2-b/` (`t56-fix2-fresh-terminal-load2-b`) | 3dac77a8 | musl 3dac77a8 (`e6c1c5e4…`) | the same, the rows carrying `confirm_rule` | timer paste 30 consecutive in 45 (2 never taken, trials 13-14), 5 confirmed by the scrolled rule; unredirect 30 in 38 (2 never taken), 3 scrolled; no scrolled miss; the timer audit is "not clean" only because its one paste was never taken (no forbidden request, no attribution problem) |
| `fresh-others-paste-load2/` (`t56-fix2-fresh-others-paste-load2`) | df1e835f, `--scenarios paste` | musl df1e835f | Chrome, Electron, gedit, kate, qtcreator, Firefox, Writer: key-then-paste, 2x | every timer lane 30/30 with no miss; every unredirect lane 30 consecutive (Firefox in 51, one unconfirmed whose observation read the caret before its keys had moved it: count 875, caret 867); the Chrome and Electron controls fail as they must; audits clean |

- **The rule** (`native/linux-engine/src/paste.rs` `Expected::confirmed_scrolled`): in a family whose text scrolls
  (VTE), the paste observes the field whole, its text and its lines. A field that has lost text since confirms only
  when the whole of it is the observed text with the paste at the caret less a prefix ending where an observed line
  starts, the paste whole after it, and the paste text occurs exactly once in that expected text. Anything else stays
  unconfirmed, within the unchanged 2 s budget.
- **Each run's own paste text** (`Pasted` and three letters, from 29e31ee1): the terminal's screen holds many runs'
  text, and the rule cannot confirm a paste whose text the scrolled screen already shows.
- **The never-taken paste** (the terminal asks `TARGETS` and never the data; transfer `ended`, nothing lands): the
  released 0.3.0 misses it the same way on today's harness (4 of 100 paste runs across its lanes), so it is a load
  limit, not this fix's; the fresh sittings show it at about the same rate (4 of 92, 6 of 93). The X trace in
  `never-taken/` (task 56's probe) contradicts "load limit". The terminal's TARGETS is its owner-change refresh, not
  a paste request. cua answers it, but after the chord has reached the terminal, which then drops the paste.

## Fix 3 (`fix3/`): the TARGETS answer before the chord

The never-taken paste was cua's own race, so it is fixed in cua and not declared as a limit (`fix3/README.md`).
After the take, the owner thread syncs, so that a `TARGETS` request the target's client has already made is answered
and delivered before the chord. A family that asks at every owner change (GTK 3, GTK 4, VTE, from a matrix pass over
every family) waits up to 25 ms for that request, a bound measured at twice the load. The revalidation runs after the
wait.

Results on the final musl build:

- gnome-terminal's key-then-paste at twice the load, with no proxy: 200 of 200 runs pasted, against 21 of 200 never
  taken before the fix.
- Fresh focus-timer series: the timer and unredirect paste reach 30 consecutive from the first run, both idle and at
  twice the load.
- The other families are unchanged.
- The wait adds about 2.5 ms idle to a flagged family's paste (p95 10.8 ms at twice the load).

The scrolled rule now confirms a landed paste whose text shows elsewhere on the screen, unless a reading short of the
whole paste gives the same text. This is trial 28 of `fix2/never-taken/direct-2/`.
