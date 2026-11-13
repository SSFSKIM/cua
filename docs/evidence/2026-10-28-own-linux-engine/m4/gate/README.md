# #171 M4: the release gate on the attested artifact (T18, task 76), 2026-11-13

**Status: not passed. Work is reopened.** The idle steps and the `:0` sitting ran. After their rulings, every step but
V5 passes. V5's rerun found two false successes in Chrome's drag and drop, and the design session ruled that they
reopen work: an engine fix, then a new artifact, then reruns of the steps the fix touches. The block at twice the load
(L1–F4, 16 steps) did not run. It is held, because most of its steps drive Chrome drags and will run on the new
artifact. Its STOP file is in place.

## The candidate

- **Frozen head:** `514f5c62dd6c74b1ed24c48f112ca9c35a70eece` on `feat/171-m4`. ci-gate GREEN 8/8, with sandbox-live
  among the gates (https://github.com/SSFSKIM/cua/actions/runs/43401193339).
- **Build:** the release workflow's build-only run, `publish=false`:
  https://github.com/SSFSKIM/cua/actions/runs/43405393873. The version, both musl builds and attest passed; publish was
  skipped.
- **Artifact:** `cua-engine-0.4.0-linux-x64`.
  - sha256 `f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937`.
  - Static-pie x86-64, stripped. `--version` prints `cua-engine 0.4.0 (514f5c62dd6c)`.
- **Attestation:** `gh attestation verify --signer-workflow SSFSKIM/cua/.github/workflows/linux-engine.yml
  --deny-self-hosted-runners` verifies it.
  - Run 43405393873, attempt 1.
  - Built from `514f5c62dd6c74b1ed24c48f112ca9c35a70eece` on `refs/heads/feat/171-m4`, on a GitHub-hosted runner.
  - Its subjects are x64 `f7c12e9b…` and arm64 `da457d7f69b5546bfbe2fa5ecfa7d923dbb88c51a7fee22009deb33c04f3006b`.
  - Every step's own `--gate` preparation checked this again: the attested commit equals the checkout's HEAD, and
    `--version` names it. Each step's README and summary carry the line.
- **The gate checkout:** a git worktree at 514f5c62, clean, with a real `npm ci` and xprobe built. Its out directories
  lie outside it.
  - Electron 44.9.0 has no install script; it ships the download as a `bin`, `install-electron`. So its binary was
    installed with `node node_modules/electron/install.js` (below, D2).
  - From the artifact on, `native/linux-engine/` and `runtime/` were frozen. Nothing in the candidate's tree changed
    during the gate.
- **R2's top-up** (2d5cfeb5, with 514f5c62's fix after review) is in the head. R2 did not need it: its counted sitting
  passed alone.

## Gate mode under the `:0` guard

Gate mode under `wrap71.py` had never been tried. It was proven first on a private display (`wrap71-proof/`): a gate
verdict ran under wrap71 in private mode around a private Xvfb.
- The attestation verified, and the verdict line read "every verdict PASS".
- 0 flags, 0 decoy connections, and the watchdog was clean.
- gh keeps its credential in `hosts.yml`, not in a keyring, so it needs no D-Bus inside the guard.

Then every `:0` step verified the attestation inside wrap71's person mode.

## Every step

Lock lines are from `~/.local/share/cua-171/host-lock.log`, holder `t18-gate`. Load is the 1-, 5- and 15-minute
average. mawsd's render host ran during none of them. Each step's labelled directory is `out/<step>.release-gate/`;
reruns are in `out-rerun1/`. The STOP file held the driver after C1, before the twice-the-load block.

| step | out | acquire (UTC) | release | min | exit | load at acquire | load at release | render host | verdict |
|---|---|---|---|---:|---:|---|---|---|---|
| D1 | out | 10:07:00 | 10:29:48 | 22.8 | 0 | 0.34 0.17 0.16 | 0.58 0.55 0.46 | none | PASS (Chrome's drag cells; #358 declared) |
| D2 | out | 10:29:48 | 10:30:03 | 0.3 | 1 | 0.58 0.55 0.46 | 0.45 0.52 0.45 | none | environment fault (no Electron binary), rerun below |
| D3 | out | 10:30:03 | 10:49:29 | 19.4 | 0 | 0.45 0.52 0.45 | 0.28 0.49 0.59 | none | PASS (Firefox's drag cells) |
| D4 | out | 10:49:30 | 11:15:59 | 26.5 | 0 | 0.28 0.49 0.59 | 0.32 0.40 0.41 | none | PASS |
| D5 | out | 11:15:59 | 11:35:24 | 19.4 | 0 | 0.32 0.40 0.41 | 0.21 0.21 0.27 | none | PASS (Writer unprimed, writer-gen) |
| R1 | out | 11:35:24 | 12:13:04 | 37.7 | 0 | 0.21 0.21 0.27 | 1.37 1.32 1.21 | none | PASS (repl-parity 34 cases each lane, diff ok) |
| R2 | out | 12:13:24 | 12:35:00 | 21.6 | 0 | 0.98 1.24 1.19 | 0.52 0.57 0.73 | none | PASS (compare --engines, no top-up needed) |
| R3 | out | 12:35:01 | 12:38:29 | 3.5 | 0 | 0.52 0.57 0.73 | 1.09 0.93 0.86 | none | PASS (linux-native) |
| R4 | out | 12:38:59 | 12:40:05 | 1.1 | 0 | 0.96 0.92 0.86 | 1.17 1.00 0.89 | none | PASS (linux-device-mode) |
| FB | out | 12:40:25 | 12:40:52 | 0.5 | 0 | 0.99 0.96 0.88 | 1.30 1.03 0.91 | none | PASS (the over-budget truncation line) |
| E1 | out | 12:41:22 | 12:49:22 | 8.0 | 0 | 0.97 0.98 0.90 | 0.79 0.74 0.81 | none | PASS (the events experiment's move) |
| S1 | out | 12:49:22 | 13:21:12 | 31.8 | 1 | 0.79 0.74 0.81 | 0.41 0.58 0.79 | none | PASS by ruling: #302 (below) |
| S2 | out | 13:21:12 | 13:47:51 | 26.6 | 0 | 0.41 0.58 0.79 | 0.87 0.63 0.59 | none | PASS |
| S3 | out | 13:47:51 | 14:13:57 | 26.1 | 0 | 0.87 0.63 0.59 | 0.28 0.35 0.53 | none | PASS (Writer's drag at 25 ms) |
| S4 | out | 14:13:57 | 14:48:49 | 34.9 | 0 | 0.28 0.35 0.53 | 0.36 0.24 0.27 | none | PASS |
| F1a | out | 14:48:49 | 15:05:14 | 16.4 | 0 | 0.36 0.24 0.27 | 0.55 0.54 0.40 | none | PASS |
| F1b | out | 15:05:14 | 15:15:51 | 10.6 | 0 | 0.55 0.54 0.40 | 0.61 0.64 0.51 | none | PASS |
| F2 | out | 15:15:52 | 15:20:09 | 4.3 | 0 | 0.61 0.64 0.51 | 0.34 0.53 0.50 | none | PASS |
| P1 | out | 15:20:09 | 15:48:26 | 28.3 | 0 | 0.39 0.54 0.51 | 0.31 0.32 0.33 | none | PASS |
| P2 | out | 15:48:26 | 16:15:03 | 26.6 | 0 | 0.31 0.32 0.33 | 0.32 0.31 0.34 | none | PASS |
| P3 | out | 16:15:03 | 16:41:22 | 26.3 | 0 | 0.32 0.31 0.34 | 0.57 0.33 0.35 | none | PASS |
| P4 | out | 16:41:22 | 17:10:16 | 28.9 | 0 | 0.57 0.33 0.35 | 0.27 0.33 0.33 | none | PASS |
| P6 | out | 17:10:16 | 17:39:09 | 28.9 | 1 | 0.27 0.33 0.33 | 0.38 0.35 0.37 | none | PASS by ruling: Fisher (below) |
| P5 | out | 17:39:09 | 17:57:53 | 18.7 | 0 | 0.38 0.35 0.37 | 0.55 0.44 0.43 | none | PASS (the leave cases) |
| H1 | out | 17:57:53 | 18:15:45 | 17.9 | 0 | 0.55 0.44 0.43 | 0.48 0.35 0.40 | none | PASS (findings below) |
| H2 | out | 18:15:45 | 18:34:06 | 18.4 | 0 | 0.48 0.35 0.40 | 0.27 0.34 0.39 | none | PASS (findings below) |
| C1 | out | 18:34:06 | 18:35:56 | 1.8 | 0 | 0.27 0.34 0.39 | 0.52 0.42 0.42 | none | PASS (11 late takes, 11 reported) |
| V1 | out | 19:30:54 | 20:07:58 | 37.1 | 0 | 0.17 0.13 0.09 | 0.63 0.43 0.37 | none | PASS (14 faster, 2 within the bound, 6 pass) |
| V2 | out | 20:09:42 | 20:34:15 | 24.6 | 0 | 0.22 0.34 0.34 | 1.31 1.51 1.22 | none | PASS (52 faster, 2 same, 2 within the bound, 15 pass) |
| V3 | out | 20:34:32 | 21:10:41 | 36.1 | 1 | 1.02 1.44 1.20 | 0.86 1.03 1.07 | none | PASS by ruling: activate_window #373 (below) |
| V4 | out | 21:11:41 | 21:38:13 | 26.5 | 0 | 0.39 0.87 1.01 | 1.03 0.88 0.81 | none | PASS (8 faster, 22 pass; every paste case) |
| V5 | out | 21:39:01 | 21:41:02 | 2.0 | 1 | 0.48 0.76 0.77 | 0.35 0.69 0.75 | none | environment fault (the snap's firefox), rerun |
| V5 | out-rerun1 | 21:42:39 | 22:19:16 | 36.6 | 1 | 0.62 0.66 0.73 | 1.57 1.10 0.95 | none | **FAIL: two false successes, one dishonest answer; work reopened** (below) |
| Z0 | out | 22:20:40 | 22:31:42 | 11.0 | 0 | 0.56 0.89 0.89 | 0.61 0.94 0.98 | none | PASS (Firefox's plain drop 30/30 on :0; Writer 30/30) |
| D2 | out-rerun1 | 22:32:12 | 22:50:58 | 18.8 | 0 | 0.66 0.91 0.97 | 0.36 0.47 0.65 | none | PASS: the environment-fault rerun. Electron's select, range, scroller, dnd and canvas 30/30; the thumb reached 146 px or more against the pinned mean of 129.2 |
| L1–F4 | – | – | – | – | – | – | – | – | **held: not run** (STOP; they run on the new artifact) |

## Steps that passed by a ruling over stored records, not by the gate's own judge

Each script reads only the stored rows, through the candidate checkout's own judge functions. It lives under `scripts/`
here, outside the candidate's tree. Each was checked against negative controls: the step's rows edited one way at a
time, every edit failing.

| step | counts | ruling | script | output |
|---|---|---|---|---|
| S1 | electron-input press_key background: 32 runs, 22 pass, **10 #302** (key-down inside the settle, key-up seen 206.9–218.7 ms after the answer, released by the next before-read), 0 failing; streak 32 of 30; audit pass. electron-text and electron-input desktop 30/30 | #302, a declared limit (T8), the lane's encoding missing; the design session, sminos 659 | `scripts/rejudge-302.mjs` | `out/S1.rejudge-302.txt` |
| P6 | firefox dnd visible pointer-in: cua 29/30, **1 honest miss** ("the desktop pointer left its window"; GTK's drag source ended mid-path, ffdnd-fix's mechanism), 0 ok with no effect; pinned 30/30; one-sided Fisher p = 0.5000 ≥ 0.05. The other 7 dnd cases as the manifest judged them | an honest miss on an allowed dnd case is a landing miss under one-sided Fisher at LOAD_P against the pinned build (ruling 650's principle); ok with no effect is hard; sminos 662 | `scripts/rejudge-dnd-fisher.mjs` | `out/P6.rejudge-dnd-fisher.txt` |
| V3 | chrome-input activate_window cua: cold 10.4 ms against the bar's 3.86 (interval [5.635, 7.8]); warm 7.9 against 0.52 ([6.145, 8.97]); effect 40/40, audit and witness as the vendor builds'. Every other row as stored: 39 pass, 1 declared refusal (M3's) | **declared speed gap #373**, with no closing route: "activate_window waits for its window's raise so the next input can't reach the window it covered (task 63, 2026-11-06); the wait is the safety; tracked by #373". Listed apart, never a pass. This gap comes from task 63's ruling, made after M3's gate; activate_window went unmeasured on :0 until this gate. Ruled by sminos 666 | `scripts/rejudge-speed-gap.mjs` | `out/V3.rejudge-speed-gap.txt` |
| D2 | environment fault, rerun. No Electron binary: spawn ENOENT at 15 s, at the first Electron page, before any engine request | the design session (relayed) | none; rerun into `out-rerun1/D2.release-gate` | `out/D2.release-gate/stderr.log`; electron 44.9.0 has no install script; every later Electron step ran after `install.js` (10:49:29Z) |
| V5 | environment fault, rerun. The snap's `/usr/bin/firefox` started instead of task 59's Mozilla Firefox, and failed in the guard ("cannot create transient scope … org.freedesktop.systemd1"). No verdict was made, 0 flags, screen as found | the design session (relayed): a rerun inside the window with task 59's Firefox on PATH | the launcher fix below; rerun into `out-rerun1/V5.release-gate` | `out/V5.release-gate/run/apps/*firefox-device_cua.stderr`, `wrap.out` |
| L3b | not run (held) | #302, sminos 659 | `scripts/rejudge-302.mjs` | when it runs |

## V5's open false successes (work reopened)

V5's rerun on `:0` (under `--ballast gate`): 11 of device-chrome-dnd's 14 cases passed, and so did every Firefox device
case and all four identity scenes. Three cases failed one sample each. All three were in block 1, within about 160 s
of each other. In each, Chrome never took `XdndSelection` within the press + 250 ms hold (`press.taken: false`).

1. **`chrome_dnd_short_in_front_shared`, block 1, cold.**
   - cua answered **ok** in 259 ms. The hold: held, not taken, waited 201 ms.
   - The page saw a plain press and release, with no dragstart: downs 51→52, ups 15→16, starts and drops unchanged.
   - No notice. The other 8 samples took and dropped.
   - **A false success.**
2. **`chrome_dnd_obscured_in_front_late_shared`, block 1, warm 1.**
   - cua answered **ok** in 160 ms, outcome `no_start`. The page's dragstart came at h164.4, after the answer, with no
     drop.
   - The other 8 answered not-ok with outcome `late`.
   - Judge: "a request answered success; an answer was not honest".
3. **`chrome_dnd_inzone_out_in_front_shared`, block 1, warm 2.**
   - cua answered **ok** in 256 ms, not taken. The page saw a press and release only.
   - No notice. The other 8 took, each carrying the unconfirmed-drop notice.
   - **A false success.**

T14's acceptance is "the gate's Chrome drag-and-drop cases 9 of 9, cold samples included". Task 63's follow-up had seen
the first case's class once at twice the load. Here it came at the gate's own window load, on an ordinary scene. The
design session ruled that it reopens work (an engine fix, a new artifact, reruns). An investigator reproduces it on a
private display under the lock (holder `v5-repro`).

## Findings with counts (not failures)

- **#365, the hung sink's declared race.** H1, idle: 0 of 60 ok with no drop. H2, at the gate's window load: 0 of 59.
- **#364, cold handle drops landing unconfirmed.** H2, at the gate's window load: 4. T14's share: 4 of 200 landed drops
  unconfirmed, within 5%. H1: 0 of 200.
- **H2's root lane.** Unmeasured: every end of cua:desktop and cua:handle, 30 each, was not verified where the drag
  left the pointer. Recorded as the judge reports it.
- **C1 (#264).** 11 real late takes, all 11 reported. No false ok. T14's share: 0 of 29.
- **#358, declared.** D1 passed with Chrome's long drag and drop inside its 40 ms bound.
- **#302.** S1's 10, above. L3b did not run.

## The `:0` sitting's checks

The design session cleared it ("GO :0"). It ran 19:30–22:32Z: V1–V5 and Z0, with V5 rerun once.
- **Guards.** Every step ran under task 50's guards and wrap71: owner-check before and after, owner-watch, tmp-watch, a
  TMPDIR of its own (empty after every step), and 0 flags with 0 decoy connections every time.
- **The owner's Chrome.** The same pid, 2546101, throughout. owner-check showed no difference after Z0 and after V5's
  first run. After the other steps its one difference was the person's own Chrome writing its profile's mtime, which
  wrap71 saw no run process touch.
- **The pointer.** Restored to 142,130 after every step.
- **The screen.** At the all-clear (22:32Z) no window of the run's was left on `:0`, and no Firefox or LibreOffice of
  the run's was running.
- **The vendor bar.** The counts resolved it: no speed series was left undetermined in V1–V5.
- **`witness_allowed` focus moves.** None occurred in V1–V5, so there was nothing for the within-toplevel allowance to
  judge.
- **T7 fix 3.** V4: 103 of 103 foreground starts were clean (quiet, 0 popups, waits of 2–5 ms), with no false red.
  V5's foreground checks held.
- **Pixel baselines.** None is stored across sittings. Z0's Writer cell, the first on `:0`'s theme, passed 30/30, so
  the layout constant held. Z0's Firefox plain drop took 30/30 on `:0` (T11's end rest); the cua:0ms control took
  0/30, as it should.

## Launcher fixes (outside the candidate's tree)

- **Electron in the gate checkout.** `npm ci` does not fetch electron 44.9.0's binary, so `npx install-electron` (or
  `node node_modules/electron/install.js`) must follow it. For the hand-over: add it to the gate's checkout steps.
- **Firefox on `:0`.** The command `gate.mjs print` prints does not put task 59's Mozilla Firefox first on PATH. The
  sittings' `env.sh` did, and so does gate.mjs for its own runs (`DEFAULTS.firefoxDir`). The launcher
  (`~/.local/share/cua-171/task76/run-zero2.sh`, kept as `scripts/run-zero2.sh`) exports it. It then refuses a Firefox
  step, before anything runs, when `command -v firefox` is not task 59's. For the hand-over: the printed `:0` command
  should carry this PATH.

## Reruns and why

- **D2:** an environment fault (no Electron binary), rerun alone into `out-rerun1/` (22:32–22:51Z, after the `:0`
  sitting). It passed.
- **V5:** an environment fault (the snap's firefox), rerun into `out-rerun1/` inside the sitting's window. The rerun
  FAILED, on the false successes above.
- **Not rerun:** S1, P6 and V3. Their stored records are the evidence, re-judged by ruling.

## Files

- `out/`, `out-rerun1/`: every step's labelled directory, as the runner wrote it. Files over 1 MB are gzipped, as m4's
  traces are; the guard's decoy sockets are left out.
- `wrap71-proof/`: gate mode under wrap71, on a private display.
- `scripts/`: `rejudge-302.mjs`, `rejudge-dnd-fisher.mjs`, `rejudge-speed-gap.mjs`, and the launcher and driver as they
  ran (`drive.sh`, `run-zero.sh`, `run-zero2.sh`, `wrap71-proof.sh`).
