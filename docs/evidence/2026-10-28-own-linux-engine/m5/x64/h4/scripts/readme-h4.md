
## At H⁗ on 0.4.1 (task 105), 2026-11-18 to 2026-11-19

**The reruns that ruling 827/828's reach calls for on x64, on linux-engine-v0.4.1, at the frozen head H⁗ = `3b5c0441`.**
They ran on the #171 x64 VM from 2026-11-18T21:13Z to 2026-11-19T05:27Z. The records are in `h4/`: `out/` holds the
counted private steps, `pilot/` the counter pilot, `zero/` the `:0` sitting, and `scripts/` task 105's launchers and
records.

- **Class A** (827), every one exit 0 and passing by its own judge at H⁗: H1, H2, D2 and S1 at idle; L1, L2b, L3b and
  L4a at twice the load.
- **D1** cross-checks **the same** as its record at H (ruling 854's form, below).
- **E1** is complete. Its fragile scenarios ran through the audit proxy (818, task 97).
- **The counter pilot** (828(c)) reads **not taken** on all 9 class-B idle steps it reaches. No step moves to class A.
- **The `:0` sitting** (GO ruling 862, the owner's window 02:30–08:00Z):
  - V1, V2, V3, V4 and Z0 pass.
  - V5 FAILs as stored on one cell, `chrome_dnd_late_take_shared`, in ruling 680's shape (below).
  - Every all-clear was clear, and no hold-sittings was written.

### Setup

- **Checkout:** `t105-x64`, a fresh worktree detached and clean at `3b5c0441b41e67ab87dd1265d2ca74325f93dec3`. It got a
  real `npm ci`, `node node_modules/electron/install.js` (electron v44.9.0), and xprobe through the cargo wrapper, all
  under the lock (`h4/scripts/setup.sh`, `setup-t105.log`). It had 0 changes before and 0 after.
- **The acceptance home:** `~/.local/share/cua-171/m5/home-x64-041`, its own `cua install` under a HOME of the run's with
  an empty secret store (`install-home.sh`, `.log`).
  - It holds linux-engine-v0.4.1, sha256 `c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626`, the
    pin's x64 asset and the brief's.
  - The engine reads `cua-engine 0.4.1 (7522dcb8fb8c)` and is static-pie, with install.json build `pinned`.
  - `gate.mjs check --pinned` exited 0: attested (linux-engine.yml run 44380699966 on `release/linux-engine-v0.4.1`),
    native/linux-engine as at 7522dcb8, the checkout at 3b5c0441 and clean.
- **Chrome (F2):** google-chrome 156.0.8078.73, read again at the sitting's pre-check. Task 59's Firefox is first on
  PATH. The owner's Chrome kept pid 2546101 (started 11-02 20:16:10) throughout and was never signalled.

### H⁗'s local proof (rulings 742, 743), under `locked.sh t105-x64`

This used the repo's `scripts/linux-engine-gate/local-proof.sh` at H⁗ (`h4/scripts/proof.sh`; logs in
`h4/scripts/proof/`). The comparison checkout is `t5-main` at `b99232de`, which is H⁗'s merge base with main.

| part | UTC (11-18) | result |
|---|---|---|
| npm test at H⁗ | 21:15:05–21:18:04 | 6167 tests: 5917 pass, **51 fail**, 199 skipped |
| npm test at main b99232de | 21:18:04–21:20:45 | 5826 tests: 5579 pass, **51 fail**, 196 skipped |
| harness suite (`npm run test:linux-engine-diff`) | 21:20:45–21:21:30 | 1311 tests: 1307 pass, 0 fail, 4 skipped; exit 0 |
| harness-dbus (the gate's line, its seven suites) | 21:21:30–21:21:54 | 91/91; exit 0 |

**Ruling 743:** the failing sets are the same 51 names at both heads, with none failing at H⁗ only and none at main
only (`failing.mjs`, `proof/npm-test-compare.txt`). So no alternation run was needed. **ci-gate on H⁗:** GREEN 8/8, run
[44394454677](https://github.com/SSFSKIM/cua/actions/runs/44394454677) (the controller's).

### The step table at H⁗

Lock lines are from `host-lock.log`, holder `t105-x64` (`h4/scripts/lock-lines.txt`). Private steps ran one per hold
through `drive.sh`/`step.sh`, with a quiet wait inside the hold (`step start`). The `:0` steps ran in one hold
(`run-sitting.sh`, CUA_LOCK_MAX 329m to 08:00Z), with times from `zero/zero.log`. Load is the 1-, 5- and 15-minute
average.

| step | SHA | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| D1 | 3b5c0441 | 11-18 21:22:37 | 21:23:17 | 21:44:45 | 21.5 | 0 | 0.85 2.19 1.46 | 0.22 0.45 0.75 | clean; end check clear | PASS; #358 declared (cua 369 ms against newest's 338.4, [24.6, 33.2] within 40 ms). The cross-check (below) |
| D2 | 3b5c0441 | 11-18 21:45:38 | 21:45:38 | 22:04:41 | 19.1 | 0 | 0.42 0.46 0.74 | 0.31 0.42 0.51 | clean; end check clear | PASS (Electron's cells, its thumb at the pinned mean) |
| E1 | 3b5c0441 | 11-18 22:04:41 | 22:04:41 | 22:12:46 | 8.1 | 0 | 0.31 0.42 0.51 | 0.19 0.21 0.36 | clean; end check clear | complete: cua sent the pinned build's events and answers in every scenario; desktop move first and later faster, key_up later within the bound |
| S1 | 3b5c0441 | 11-18 22:12:47 | 22:12:47 | 22:46:49 | 34.0 | 0 | 0.19 0.21 0.36 | 0.50 0.59 0.58 | unclean: pid 286294 openbox; end check clear | complete (#302 counted toward its streak, listed apart) |
| H1 | 3b5c0441 | 11-18 22:46:49 | 22:46:49 | 23:04:55 | 18.1 | 0 | 0.50 0.59 0.58 | 0.28 0.26 0.37 | clean; end check clear | no false ok, no missing landing, no false error; findings counted |
| H2 | 3b5c0441 | 11-18 23:04:55 | 23:04:55 | 23:23:31 | 18.6 | 0 | 0.28 0.26 0.37 | 0.81 0.91 0.80 | clean; end check clear | the same, at the gate's window load |
| L1 | 3b5c0441 | 11-19 00:08:24 | 00:08:24 | 00:37:01 | 28.6 | 0 | 0.94 0.70 0.84 | 16.67 16.60 14.29 | clean; end check clear | the judges' verdict PASS |
| L2b | 3b5c0441 | 11-19 00:37:46 | 00:40:16 | 00:56:07 | 15.8 | 0 | 0.84 8.92 11.71 | 16.64 16.42 14.95 | clean; end check clear | the judges' verdict PASS |
| L3b | 3b5c0441 | 11-19 00:56:07 | 00:58:57 | 01:16:27 | 17.5 | 0 | 0.97 9.29 12.44 | 16.68 16.39 15.24 | unclean: pid 574911 openbox; end check clear | complete (#302 listed apart) |
| L4a | 3b5c0441 | 11-19 01:16:27 | 01:19:58 | 01:39:38 | 19.7 | 0 | 0.98 8.33 12.23 | 17.31 17.13 15.91 | clean; end check clear | no false ok, no missing landing; residue 0 (below) |
| V1 | 3b5c0441 | 11-19 02:30:01 | 02:30:01 | 03:07:05 | 37.1 | 0 | 0.02 0.16 0.93 | 0.58 0.54 0.58 | all-clear clear | every verdict PASS; text windows a lane ended 0 |
| V2 | 3b5c0441 | (one hold) | 03:07:05 | 03:33:08 | 26.1 | 0 | 0.58 0.54 0.58 | 0.97 1.50 1.39 | all-clear clear | every verdict PASS |
| V3 | 3b5c0441 | (one hold) | 03:33:08 | 04:11:41 | 38.5 | 0 | 0.97 1.50 1.39 | 0.96 1.17 1.16 | all-clear clear | no verdict FAIL; listed apart as at H: the chrome-input drag (declared refusal), 2 declared unconfirmed (right_click_fallback, secondary_action), the #373 activate_window gap |
| V4 | 3b5c0441 | (one hold) | 04:11:42 | 04:38:44 | 27.0 | 0 | 0.96 1.17 1.16 | 0.62 0.89 0.91 | all-clear clear | every verdict PASS; every paste case |
| Z0 | 3b5c0441 | (one hold) | 04:38:45 | 04:49:46 | 11.0 | 0 | 0.62 0.89 0.91 | 0.69 0.81 0.91 | all-clear clear | PASS: Firefox's plain drop 30/30 (cua:0ms 2/30), Writer's select 30/30 |
| V5 | 3b5c0441 | (one hold, released 05:27:20) | 04:49:46 | 05:27:20 | 37.6 | 1 | 0.69 0.81 0.91 | 0.88 0.94 0.93 | all-clear clear | **FAIL as stored** on `chrome_dnd_late_take_shared` cua (2/0); 51 other rows pass (below) |

**What stands, and on which SHA.** Every other step of the gate stands on its record above at **H = `fefe306c`** on
0.4.0, for these reasons:

- **The counted class-B idle steps** D3, D4, D5, P4, P6, P5 and C1. The diff
  reaches them only by entering changed functions with no new branch taken (task 98's reach table, B). Their counter
  pilot at H⁗ reads not taken (below).
- **The class-B steps that start no engine through engine.mjs**, which `--engine-stats` cannot reach: S2, S3, S4, ES,
  R2, R3, R4 and FB. Ruling 843's static exclusions apply: no source of the settle's family (Electron, or another
  Chromium-toolkit app outside Chrome's classes).
- **R1** stands on H, **re-judged at H‴** (task 97, §8.1 point 4: the stored diff unchanged, ok with 0 differences).
- **The class-C steps** (no drag, no handle): F1a, F1b, F2, P1, P2, P3, L5, F3a, F3b and F4.
- **The class-B steps at twice the load:** L2a, L2c, L3a, L3c, L3d, L3e, L4b and L4c. They stand on H, and they had no
  idle-form pilot. Ruling 828(c)'s pilot covers idle steps that ran on 0.4.0, and their next runs record the counter.
- **V5 at H** stays as recorded beside this run, re-judged at H′ = `0495b1a7` (above). The sitting here is the H⁗ run
  that ruling 847 asks for.

### D1, the cross-check (§8.1 point 2; ruling 854)

`h4/scripts/compare-drag.mjs`, in the form of M4's `compare-settle.mjs`, compares D1's H⁗ summary with its H record
`out/D1.pinned-release/run/summary.md` (`h4/scripts/crosscheck-D1.txt`).

- **The shipped lane is the same in every cell:**
  - `cua` took 30/30 in each of select, range, scroller, dnd and canvas;
  - every cua verdict is the same (PASS, and dnd's #358 declared gap);
  - every witness is the same (dnd `changed` at both, as M4 recorded it), and the pinned build took 30/30 throughout;
  - the judges' verdict is PASS at both, no "Incomplete or failed" line at either, and no foreign window was acted on.
- **The 0 ms control lane moved by one sample in two cells, and a reference lane in one:**
  - select: cua:0ms 27/30 at H vs 28/30 at H⁗;
  - scroller: cua:0ms 4/30 at H vs 5/30 at H⁗;
  - canvas: newest (the vendor's newest build, a reference lane) 22/30 at H vs 23/30 at H⁗.
- So D1 does not differ, and §8.1 point 3's full rerun is not called for.

### E1

E1 is complete at H⁗. Its fragile scenarios ran through the audit proxy as task 97 built it (ruling 818): the
interrupted drag's and the interrupted click's rows carry `sent: {traced: true, conn: 1, …}`, the span of the run's
own connection read from the trace. Both scenarios are "same" against the pinned build. The key hold whose window is
destroyed is "same but the declared answer (interrupted_hold)" on both lanes.

### The counter pilot (ruling 828(c))

**Which steps.** Task 98's reach table (`m5/l4a-fix/README.md` §6 on `origin/m5-l4a-fix`) lists the class-B steps. The
idle steps among them that start their engines through engine.mjs are D1, D3, D4, D5, E1, P4, P6, P5 and C1. Each ran
once, uncounted, in pilot form, at idle (their counted load profile): `gate.mjs run <step> --pinned home-x64-041 --dev
--pilot 2 --engine-stats` (`h4/pilot/`, 23:23–00:08Z, every one exit 0).

| step | reading (`settle-check.mjs`, `h4/scripts/settle-pilot.txt`) | drags / drag_handles sent to cua lanes |
|---|---|---|
| D1 | not taken: entered 0, second_rest 0, skipped 0, unsettled 0, settle_failed_activation_confirmed 0 (12 cua engines; 1 without a counter sent no drag) | 40 / 0 |
| D3 | not taken, all zero (12 engines; 1 sent no drag) | 40 / 0 |
| D4 | not taken, all zero (18; 1) | 64 / 0 |
| D5 | not taken, all zero (30; 1) | 48 / 0 |
| E1 | not taken, all zero (133 engines) | 45 / 78 |
| P4 | not taken, all zero (3; 1) | 40 / 0 |
| P6 | not taken, all zero (3; 1) | 40 / 0 |
| P5 | not taken, all zero (7; 1) | 80 / 0 |
| C1 | not taken, all zero (2 engines) | 2 / 0 |

**No "taken": no step moves to class A.** Every zero is read from the engine's `settle_final` exit line.

V2–V5 and Z0 are class-B `:0` steps, so they reran in the sitting here.

### settle-check over every step directory at H⁗

| out root | step: reading |
|---|---|
| `h4/out/` (counted; `settle-counted.txt`) | **H1, H2, L4a: TAKEN** (entered 560 each; second_rest 0, 6 and 8; skipped, unsettled and settle_failed_activation_confirmed 0). These are class A by design: their Electron cells are where the settle decides, and they reran here as class A. D1, D2, E1, L1, L2b: unknown, since the counted lanes take no `--stats` (834) and their cua lanes read `no stats: not recorded`. S1 and L3b: unknown, since their engines start through cua's service and 843 excludes them from the opt-in |
| `h4/pilot/` (`settle-pilot.txt`) | all 9 not taken (above) |
| `h4/zero/` (`settle-zero.txt`) | V1, V2: not taken (all zero, final). V3, V4, V5, Z0: unknown. V3–V5's audit engines run with `stats: false` (2, 2 and 20 cua engines without a counter; every recorded one entered 0), and Z0's lanes take no stats. V3–V5's audit drags are 843's static exclusion: Chrome, Gecko, GTK 4, or a minimized gedit refusing, none of the settle's family |

### The judges' counts the brief asks for

- **L4a's residue** (827 3b, t17-fix3's plain cell at twice the load):
  - cua plain: **0 of 100** honest unconfirmed non-landings, against a bound of 2 (floor(2·100/100));
  - cua:handle plain: **0 of 100**, bound 2;
  - **false oks 0**.
- **Ruling 830's zone-truth mismatches:** none in 320 drags of the window's cells, in each of H1 (idle), H2 (window
  load) and L4a (twice the load).
- **Ruling 838's H2-root unverified ends by answer:** cua:desktop root **0 ok** and 30 unconfirmed of 30; cua:handle
  root **0 ok** and 30 unconfirmed of 30. The ok count is zero, so there is no finding. In H1 (idle) the root cells'
  ends were all verified: 30 of 30 unconfirmed on each lane.
- **#365's declared race:** 0 of 60 in each of H1, H2 and L4a. **T14's share:** 0 of 200 landed drops answered
  unconfirmed in each.

### The `:0` sitting

- **The GO:** ruling 862, relayed by the controller, for the owner's window of 2026-11-19 02:30–08:00Z (hard stop
  08:00Z). The plan was sent at about 01:41Z, with V1, V2, V3, V4, Z0 and V5, then the conditional V5 slots on the
  controller's decision only (last start 07:05Z).
- **The pre-check** (`zero-precheck.out`, 02:27:13Z):
  - no hold-sittings and no stress-ng;
  - the owner's Chrome at pid 2546101 and the pointer at 142,130;
  - no `/tmp/cua171-run-*`, and `gate.mjs leftovers` clear;
  - task 59's Firefox on PATH, and google-chrome 156.0.8078.73.
- **How it ran.** One hold of the host lock, holder t105-x64, from 02:30:01 to 05:27:20Z (`run-sitting.sh` →
  `sitting-locked.sh` → `sitting.sh`).
  - Each step ran `gate.mjs print`'s command (`zero-commands.txt`) with only its leading `locked.sh t105-x64` stripped.
  - Each step was capped at 55 min and admitted only if it fit before 08:00Z.
  - Inside each command are the sitting launcher and run71.sh under M5's wrap71.

| step | wrap71 samples | flags | decoy connections | leftovers | owner-watch | owner-diff | pointer | all-clear |
|---|---:|---:|---:|---|---|---|---|---|
| V1 | 17378 | 0 | 0 | none | done after 217 checks; changed=0 | mtime ~/.config/google-chrome | restored to 142 130, reads 142 130 | clear |
| V2 | 11584 | 0 | 0 | none | done after 148 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| V3 | 17467 | 0 | 0 | none | done after 222 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| V4 | 11737 | 0 | 0 | none | done after 153 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| Z0 | 4628 | 0 | 0 | none | done after 64 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear |
| V5 | 14929 | 0 | 0 | none | done after 207 checks; changed=0 | mtime ~/.config/google-chrome | restored, reads 142 130 | clear (the sitting's exit: 1, V5's verdict) |

owner-diff's one difference is the owner's own Chrome writing its profile's mtime, as in every sitting. No all-clear
was NOT CLEAR, so ruling 857's form did not arise. Every V step read "text windows a lane ended: 0" on every lane.

**Ruling 857(b)'s foreign scan** (task 106's `scan-foreign.mjs`, copied as is to `h4/scripts/`, over V1–V5's
`run/results.jsonl`; `h4/scripts/scan-foreign.txt`): **0 foreign findings in every step.**

| step | findings | audits | end rows | trace | text restores (pinned/newest/cua) | scene ends (pinned/newest/cua) |
|---|---:|---:|---:|---|---|---|
| V1 | 0 | 16 | 1 | clean | 43 / 0 / 0 | 0 / 0 / 0 |
| V2 | 0 | 30 | 1 | clean | 0 / 0 / 0 | 0 / 0 / 0 |
| V3 | 0 | 69 | 1 | clean | 0 / 0 / 0 | not recorded |
| V4 | 0 | 28 | 1 | clean | 0 / 0 / 0 | 0 / 0 / 0 |
| V5 | 0 | 52 | 1 | clean | 0 / 0 / 0 | not recorded |

The conditional V5 slot was not used, on the controller's word: a rerun could not erase this run's verdict under 836.

### V5 at H⁗, ruled

V5's stored verdict is "**FAIL**: device-chrome-dnd chrome_dnd_late_take_shared cua". The other 51 of its 52 rows pass,
`chrome_dnd_shared` among them, so ruling 756's judge held live. No cell reads incomplete and no sample was excluded as
premise-unmet, so this is not route D's stop. The stored verdict stands as recorded.

| cell | its judge at H⁗ | the re-judge (the ruling's instrument) | the ruling |
|---|---|---|---|
| `chrome_dnd_late_take_shared` | "a drop the witness did not record on 1 of 9 samples (2/0)". Sample 2/0's dragend came 221 ms after the press, after the witness span closed (the answer at 164.02 ms + 20 ms). Its notice, its read and its next request's refusal all pass. This is ruling 680's shape; T5's at H was 0/0 | Task 89's read-only `rejudge-680` script (`m5/x64/scripts/rejudge-680/`) over the stored rows, with H⁗'s harness (`h4/scripts/v5-680-diag.sh`, output `v5-680-diag.txt`): **pass**, "9 samples; the witness span's limit: 2/0 (dragend 221 ms after the press, answer 164.02 ms + 20); every other rule passes". Rows 52, failing none; replaced only this row; other terminal failures none. Controls: the stored rows PASS; all 7 negative controls FAIL as expected (notice missing; next acting request not refused; the drop early; no drop where the witness recorded; a foreign change at cleanup; preparation over the cap; an operation with no verdict) | **pending (680 as at T5)** |
