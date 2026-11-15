# #171 M5 T6, the x64 pilot (task 87), 2026-11-15

**Development runs, not a release gate, never counted.** Every step ran once in its smallest form at wave 0's reviewed
tip, so that wave 0's rules could be seen working live before the judged run. None of these verdicts is T5's. The
three pinned-path pilots below carry the harness's label "acceptance on the pinned release", because that is what they
exercise. They are **pilots of the pinned path**, not counted evidence, and their label must not be read as T5's.

- Checkout: `t87-pilot`, a fresh git worktree detached and clean at `01ff0648f3afc4a234669cd381395c91543ce3f7`. It had a
  real `npm ci`, then `node node_modules/electron/install.js` (electron 44.9.0), then xprobe built
  (`scripts/setup-pilot.sh`, `.log`). The tree had 0 changes before and after.
- The run home: `~/.local/share/cua-171/m5/pilot-x64/home` (CUA_HOME). Its own `cua install` ran under a HOME and XDG
  directories of the run's, with an empty secret store (`scripts/install-home.sh`, `.log`). It placed the vendor runtime
  26.928.40906-linux-x64, the sandbox helper, and **linux-engine-v0.4.0**: `cua-engine` sha256 `751ec9be…` (the pin's
  x64 asset), `cua-engine 0.4.0 (c55c8e08d9cb)`, static-pie, `install.json` build `pinned`.
- The pinned rule live: `gate.mjs check --pinned <home>` exited 0 (`scripts/check-pinned.log`). The record shows the
  pin's x64 asset, native/linux-engine as at c55c8e08, the checkout at 01ff0648 and clean, and the attestation verified
  (`linux-engine.yml`, run 43637317960 on `release/linux-engine-v0.4.0`, a GitHub-hosted runner).
- The steps: `gate.mjs run <step> --pinned <home> --dev --pilot 2` (`scripts/drive.sh`), one locked step each, holder
  `t87-pilot`, capped at 45 min. None reached the cap. Before each step, the driver checked hold-sittings, stress-ng
  and the load. Task 59's Firefox was first on PATH. The parity clone already held the tag `linux-engine-v0.4.0`
  (c55c8e08).
- The `:0` step: V3 in its pilot form (`--blocks 1`), on the design session's GO (sminos 720), under run71.sh and wrap71
  (`scripts/run-zero.sh`, `zero-commands.txt`, `zero-V3.precheck.out`, `zero-V3.out`).
- Lock lines: `scripts/lock-lines.txt`, holder t87-pilot, from 03:46Z to 10:15Z. The step table is
  `scripts/pilot-table.md`.

## Steps

All 49 steps ran once: 43 private as development pilots, V3 on `:0`, and three pinned-path pilots. V1, V2, V4, V5 and
Z0 (the other `:0` steps) were not part of this pilot, since the brief asked for one `:0` step. The minutes are each
step's started..finished.

| step | min | exit | result |
|---|---:|---:|---|
| D1 | 11.4 | 0 | the judges' verdict for cua: PASS; #358 declared (368.1 against 337 ms, interval [25.2, 32.7] within 40) |
| D2 | 1.5 | 0 | PASS |
| D3 | 6.3 | 0 | PASS |
| D4 | 5.4 | 0 | PASS |
| D5 | 3.4 | 0 | PASS |
| R1 | 38.7 | 0 | repl-parity: 34 cases on each lane; the diff exits 0; the prepared home's pinned check exits 0 |
| R2 | 21.7 | 0 | `VERDICT: PASS`, judged by in-cell time, no top-up, nothing unproved (`unproved.txt` empty); every cc run took `--pinned-check` |
| R3 | 3.4 | 0 | linux-native passes; the fixture home's pinned check exits 0; engine watch: only the home's installed cua-engine, under the trusted worker, no sky_linux |
| R4 | 1.1 | 0 | linux-device-mode passes; the engine watch passes |
| FB | 0.4 | 0 | every step passes (the truncation line) |
| E1 | 8.0 | 0 | complete |
| S1–S4 | 5.7–8.9 | 1 | only "a development series of 2, not the 30 the rule needs" (50, 30, 31 and 37 reasons; no other reason, no false ok) |
| F1a, F1b | 4.2, 3.4 | 1 | only "a development series of 2, not the 30 the proof needs" (24, 9) |
| F2 | 4.4 | 0 | complete |
| P1–P4, P6 | 3.8–4.3 | 0 | PASS (the leave cases: `--plan leave`) |
| P5 | 18.7 | 0 | PASS |
| H1, H2 | 1.8, 2.1 | 0 | no false ok, no missing landing, no false error |
| C1 | 0.4 | 0 | every late take reported (2 of 2) |
| L1, L2a–c | 1.0–11.0 | 0 | PASS (the drag pilots drop the load) |
| L3a–e | 4.7–9.3 | 1 | only "a development series of 2" (26, 24, 30, 31, 37) |
| L4a–c | 0.5–2.0 | 0 | complete (L4a ran last, at 10:06Z: the first driver lists left it out) |
| L5 | 0.8 | 0 | complete |
| F3a, F3b | 5.1, 4.2 | 1 | only "a development series of 2" (24, 9) |
| F4 | 4.8 | 0 | complete |
| **V3** on `:0` | 35.4 | 0 | "run valid; no verdict FAIL". Listed apart as losses: declared refusal chrome-input drag cua; declared unconfirmed right_click_fallback and secondary_action cua; **declared gap** activate_window cua (#373: cold 12.57 against the bar's 4.77 ms, interval [5.785, 11.975]; warm 7.25 against 0.5, [5.905, 9.46]) |

The 13 steps that exited 1 failed only because a pilot series is too short for its rule, as M4's pilot did
(`scripts/reasons-all.txt`).

### Pilots of the pinned path (the controller's word, 2026-11-15; `scripts/pinned-path.sh`)

A `--dev --pilot` step takes the home's engine unchecked, so these runs exercised T1's pinned branch inside a step:

- **C1** (`gate.mjs run C1 --pinned <home>`, no `--dev`, 1.8 min, exit 0): withExperimentCandidate's pinned branch and
  pinnedEngine. The record shows the candidate line with the attestation verified. 15 late takes, 15 reported.
- **R4** (no `--dev`, 1.1 min, exit 0): suites.sh at LABEL counted, ENGINE=installed. The fixture home's pinned check
  exits 0, linux-device-mode passes 18 of 18, and the engine watch passes.
- **engine-stop** (`linux-engine-diff.mjs --experiment engine-stop --pinned`, 0.3 min, exit 0). No gate step runs
  engine-stop, so its pinned `cua serve` (pinnedServeEnvironment) was reached directly, in its smallest form: the drain
  lane, paths eof and signal, the hold case, 2 runs each. All 4 runs passed. Each session had exactly one engine under
  it, the home's installed path (`enginesUnder(session, ctx.cua)`). Output: `out/engine-stop.pinned-path-pilot/`.

## The `:0` sitting (V3), 04:40:26–05:15:52Z

- Preconditions at 04:40:05Z: hold-sittings absent; no stress-ng; the owner's Chrome pid 2546101; load 0.20; the lock
  free; the pointer at 142,130; task 59's Firefox on PATH.
- wrap71: 16,258 samples, 0 flags, 0 decoy connections, no leftovers. It read the person from the session as uid 501,
  /Users/new, /run/user/501 (T4's guard).
- The stub check: the witness failed the activating stub (stacking, focus, active), and so did the audit
  (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput).
- owner-watch: 206 checks, changed=0. One check (171, 05:09:43Z) could not read windows-viewable (rc 1), and the next
  read it the same. owner-check's one difference is the owner's Chrome profile mtime, as in M4's sittings. The owner's
  Chrome kept pid 2546101 and was never signalled.
- tmproot was empty and removed. The pointer was restored to 142,130 and read 142,130. No cua171 window was left on
  `:0`, and no Firefox or soffice was running.

## The five old `/tmp/cua171-run-*` directories (ruling 721)

These were present before V3 and are not this run's. All five were Desktop scratch directories (scenes.mjs
`mkdtemp(scratchRoot, SCRATCH_PREFIX)`), not a run71 TMPDIR. Each held home/, a session/session.conf listening under
the directory itself, and tmp/, plus a Chrome profile or scene directories. They sat in /tmp because their runs were
private runs with TMPDIR unset. Records: `scripts/leftover-scratch.txt`, `leftover-processes.txt`,
`leftover-scratch-remove.txt`.

| dir | mtime (UTC) | the run | how it ended |
|---|---|---|---|
| 7nTGZK | 11-13T10:30Z | M4 candidate 1's D2, `m4-gate-D2-0fb96409` | spawn of the missing Electron binary, ENOENT, unhandled: node died (`m4/gate/out/D2.release-gate/stderr.log`) |
| AdXsUJ | 11-09T02:41Z | task 68's drop-signals pilot3, `t68-pilot3-1ced4884` (tag from its Chrome profile) | "the freeze cell needs the run's browser process", thrown uncaught out of runDropSignals |
| q8ExPO | 11-09T02:43Z | task 68's pilot4, `t68-pilot4-5547731e` | the same throw |
| OJWaJi | 11-12T23:54Z | harness-fix's H1 pilot, first attempt, `m4-dev-H1-pilot-87369062` | exit 1 after 9 s with its Electron scene dir empty; the rerun overwrote its record, so the error is not provable |
| lLeOBG | 11-10T00:58Z | task 70's idle1-predicates sitting, `t70-idle1-predicates-d4a20e45` (857 MB) | its display watchdog got SIGTERM: "STOPPED: … no cleanup was in place, so none ran" |

- **Why no end check caught them.** Each run died, or was stopped, before Desktop.closeEverything reached its
  `rmSync(this.dir)`. The run's end check (`ending`) is part of that same cleanup. gate.mjs and display.mjs record the
  exit and the display watchdog, never the scratch. run50/run71 print every `/tmp/cua171-run-*`, the run's own or not,
  and never fail on one.
- **Removed**, each one meeting every marker: owner new, mode 700, the prefix, the Desktop layout, a named run tag, and
  no process naming it.
- **The orphaned session buses.** At 05:27:31Z four of them still had their session buses running, orphaned to init
  since their runs: dbus-daemon on `<dir>/session/session.conf`, at-spi-bus-launcher, and its a11y dbus-daemon. That
  is 12 processes. None was signalled by this task. By the removal's process check (05:28:32Z) all 12 had ended, while
  their files were still in place. What ended them in that minute is not established. Nothing in D3's run, the step
  then running, kills by name: every kill site is scoped to pids or groups the run spawned, its own Chrome's pids by
  profile, a symlink in its own mkdtemp, or the watchdog's guarded pids (ruling 725).
- **For T4's second round** (rulings 721, 724): Desktop.closeEverything runs every step and reports all failures (the
  session bus, the scratch), on an uncaught error and on the watchdog stop too. The end check lists any
  `cua171-run-*` that isn't the current run's, and any session bus or at-spi process whose config lives in one.

## Findings, for T4's second round or the design session

1. **A pilot cannot run the pinned rule inside a step.** gate.mjs refuses `--pilot` without `--dev`, and `--pinned
   --dev` takes the engine unchecked. So the harness's pinned preparation runs only in a run labelled acceptance. The
   pinned-path pilots above stood in for it. The verdict run's `--pinned` preparation, which only `:0` steps take, has
   not been seen live and first runs in T5.
2. **No gate step reaches engine-stop's pinned `cua serve`.** None of the 49 steps runs `--experiment engine-stop`, so
   the Decision Log's "`cua serve` in engine-stop … selects the run home's installed engine" is proved by no gate step.
   It passed here only as a direct run.
3. **A verdict pilot is not short.** `--blocks 1` leaves the speed series under 20 a side, and the verdict run tops them
   up, so V3's pilot took 35.4 min against the full step's 36–38. A `:0` pilot sitting costs about the full step.
4. **#373's declared gap has no bound.** `SPEED_GAPS` (deviations.mjs) has no `bound_ms`, unlike `DRAG_SPEED_GAPS`. So
   activate_window reads "declared gap" whatever its size, as long as its other parts hold. Measured here: cold
   interval [5.785, 11.975] ms, warm [5.905, 9.46].
5. **Records name M4's holder.** A step's README "command" line names `t18-gate` unless `--holder` is given; C1 and R4
   pinned and the first steps carry it, though their lock holder was t87-pilot. Development run names are still
   `m4-dev-<step>-pilot` at M5.
6. **Settle and Fisher judges barely seen.** The pilots' series of 2 stop the settle steps before T2's streak rule
   could pass anything, though no false ok and no other reason appeared. P6's pilot runs the leave cases only, so P6's
   Fisher judge was not reached. Seen live: #373 in the verdict run, the declared-unconfirmed listing, and T3's in-cell
   judge with its backstop column.
7. **scenes.mjs `close` signals a pidfile's pid** (gnome-terminal's server) without checking that it is still that
   program. It is not a name match. No step here used it.

## Files

- `out/`: each step's labelled directory as the runner wrote it (`<step>.development-run.pilot`, the pinned-path ones
  `C1.pinned-release`, `R4.pinned-release` and `engine-stop.pinned-path-pilot`), the driver's log and `zero.log`.
  Files over 1 MB are gzipped, and the guard's decoy sockets are left out.
- `scripts/`: task 87's launchers and records, as they ran.

The directory was scanned for token-shaped strings before the commit (`scripts/scan-evidence.sh`, which prints file
names only). Unlike M4's scan, it does not read the stored secret values, because this task reads no secrets.
