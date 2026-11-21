## At H6 on 0.4.2 (task 123), 2026-11-20 to 2026-11-21

**What ruling 929's reach reruns on x64, at the frozen head H6 = `69bd7993` on linux-engine-v0.4.2.** They ran on the
#171 x64 VM (`dc-linux171-1e68`) from 2026-11-20T22:24Z. The records are in `h6/`: `out/` holds the counted private
steps, `zero/` V5's `:0` sitting, and `scripts/` task 123's launchers and records.

- **Class A**, every one exit 0 and passing by its own judge at H6:
  - at idle: C1, K1, K2, K3, D1, D2, S1, H1 and H2;
  - at twice the load: L1, L2a and L2b so far. L3a, L3b, L4a, L4b and L4c are running (the next part's commit).
- **V5** passes every one of its 52 verdicts on `:0`, in the owner's window (ruling 933, GO 939). Its all-clear is clear.
- **S2**, the cross-check for the steps that only gained new reads (V4, S4, L3c, L3e), is **the same** as its record
  at H in every cell. So those four don't rerun.
- **Item 9** passes: the fresh-home install equals the pin, and doctor exits 0.
- **H6's local proof** passed before any counted step.

### Setup

- **Checkout:** `t123-x64`, a fresh worktree detached and clean at `69bd7993e1f1cb252574939bd6e8e80674bab5b8`. It got
  a real `npm ci`, `node node_modules/electron/install.js` (electron v44.9.0), and xprobe through the cargo wrapper, all
  under the lock (`h6/scripts/setup.sh`, `setup-t123.log.txt`). It had 0 changes before and 0 after.
- **The acceptance home:** `~/.local/share/cua-171/m5/home-x64-042`, its own `cua install` under a HOME of the run's
  with an empty secret store (`install-home.sh`, `.log.txt`).
  - It holds linux-engine-v0.4.2, sha256 `a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78`, which
    is the pin's x64 asset and the brief's.
  - The engine reads `cua-engine 0.4.2 (9371d2348cf8)` and is static-pie, with install.json build `pinned`.
  - `gate.mjs check --pinned` exited 0: attested (linux-engine.yml run 44796908527 on `release/linux-engine-v0.4.2`),
    native/linux-engine as at 9371d234, and the checkout at 69bd7993 and clean.
- **Chrome (F2):** google-chrome 156.0.8078.73 for the judged steps and V5. K2 takes the extracted current stable,
  158.0.8127.36. Task 59's Firefox is first on PATH.
- **The owner's Chrome** kept pid 2546101 (started 11-02 20:16:10) throughout, read by `ps` only, never signalled.
- **Disk (ruling 937):** 51G free at the idle block's start, 50G at the twice-load block's and at V5's.

### H6's local proof and item 9, under `locked.sh task123-x64`

| part | UTC (11-20) | result |
|---|---|---|
| harness suite (`npm run test:linux-engine-diff`) | 22:27:32–22:28:19 | 1403 tests: 1398 pass, 0 fail, 4 skipped, 1 todo; exit 0 |
| harness-dbus (the gate's line) | 22:28:19–22:28:43 | 91/91; exit 0 |
| item 9 (`item9.sh` in `private-desktop.mjs --session`, `:1`) | 22:28:43–22:29:16 | **passes**. `cua install --engine` exit 0. The engine's sha256 equals the pin; `file` reads static-pie; `--version` reads `cua-engine 0.4.2 (9371d2348cf8)`; install.json build `pinned`. `CUA_NATIVE_ENGINE=cua cua doctor` exit 0, `engine` PASS (0.4.2), `accessibility.enabled` PASS, and its three chrome-route rows BLOCKED as at H (no Chrome registration in an empty home). No engine process of the home left, the home removed, the private desktop's watchdog clean |

The proof ran `scripts/linux-engine-gate/local-proof.sh` with the parts the brief names (`h6/scripts/proof.sh`, logs in
`h6/scripts/proof/`). ci-gate on H6 is the controller's: GREEN 8/8, run
[44824501779](https://github.com/SSFSKIM/cua/actions/runs/44824501779).

### The step table at H6

Lock lines are from `host-lock.log`, holder `task123-x64` (`h6/scripts/lock-lines.txt`). Private steps ran one per hold
through `drive.sh`/`step.sh`, with a quiet wait inside the hold. The idle block was fenced at 02:15Z, so no step could
still run when V5's window opened. The twice-load block ran L1 and L2a before the fence and resumed after V5's hold was
released. Load is the 1-, 5- and 15-minute average.

| step | SHA | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| C1 | 69bd7993 | 11-20 22:29:16 | 22:30:06 | 22:32:18 | 2.2 | 0 | 0.85 0.96 0.58 | 0.41 0.80 0.57 | clean; end check clear | PASS: every band at its minimum (below) |
| K1 | 69bd7993 | 11-20 22:32:18 | 22:32:18 | 22:35:21 | 3.0 | 0 | 0.41 0.80 0.57 | 0.34 0.69 0.58 | clean; end check clear | every verdict PASS; the canary relative (below) |
| K2 | 69bd7993 | 11-20 22:35:21 | 22:35:21 | 22:38:21 | 3.0 | 0 | 0.34 0.69 0.58 | 0.31 0.61 0.58 | clean; end check clear | every verdict PASS on Chrome 158.0.8127.36; the canary relative |
| K3 | 69bd7993 | 11-20 22:38:21 | 22:38:21 | 22:39:31 | 1.2 | 0 | 0.31 0.61 0.58 | 0.51 0.59 0.57 | clean; end check clear | complete: dragstart-150 10/10 and dragstart-400 10/10 landed inside B (ruling 900) |
| D1 | 69bd7993 | 11-20 22:39:31 | 22:39:31 | 23:03:29 | 24.0 | 0 | 0.51 0.59 0.57 | 0.78 0.74 0.65 | clean; end check clear | PASS; #358 declared: cua 371.4 ms against newest's 338.7, the interval [29.2, 36.9] within 40 ms (cua:0ms 365.7, [20.6, 31.6]). At H⁗: 369 against 338.4, [24.6, 33.2] |
| D2 | 69bd7993 | 11-20 23:03:29 | 23:03:29 | 23:22:59 | 19.5 | 0 | 0.78 0.74 0.65 | 0.42 0.49 0.50 | clean; end check clear | PASS |
| S1 | 69bd7993 | 11-20 23:22:59 | 23:22:59 | 23:58:03 | 35.1 | 0 | 0.42 0.49 0.50 | 0.50 0.89 0.81 | unclean: pid 1264445 openbox; end check clear | complete (#302, 4 of 30 on electron-input press_key, listed apart, as at H⁗) |
| H1 | 69bd7993 | 11-20 23:58:03 | 23:58:03 | 00:16:11 | 18.1 | 0 | 0.50 0.89 0.81 | 0.79 0.46 0.56 | clean; end check clear | no false ok, no missing landing, no false error |
| H2 | 69bd7993 | 11-21 00:16:11 | 00:16:11 | 00:34:47 | 18.6 | 0 | 0.79 0.46 0.56 | 0.24 0.40 0.50 | clean; end check clear | the same, at the gate's window load |
| S2 | 69bd7993 | 11-21 00:34:47 | 00:34:47 | 01:01:24 | 26.6 | 0 | 0.24 0.40 0.50 | 0.62 0.48 0.45 | unclean: pid 1387597 openbox; end check clear | complete; the cross-check (below) |
| L1 | 69bd7993 | 11-21 01:01:40 | 01:01:40 | 01:31:46 | 30.1 | 0 | 0.48 0.46 0.44 | 16.64 16.67 14.59 | clean; end check clear | the judges' verdict PASS |
| L2a | 69bd7993 | 11-21 01:31:46 | 01:34:57 | 01:58:56 | 24.0 | 0 | 0.91 8.93 11.92 | 17.15 16.97 15.99 | clean; end check clear | the judges' verdict PASS |
| V5 | 69bd7993 | 11-21 02:30:02 | 02:30:02 | 03:07:37 | 37.6 | 0 | 0.15 0.26 2.30 | 1.30 1.19 1.21 | all-clear clear | **every verdict PASS** (52 rows; below) |
| L2b | 69bd7993 | 11-21 03:08:34 | 03:08:34 | 03:24:52 | 16.3 | 0 | 0.63 1.02 1.15 | 17.38 16.55 11.55 | clean; end check clear | the judges' verdict PASS |

**What stands, and on which SHA.** Every other step stands on its record as above, for these reasons:

- V4, S4, L3c and L3e stand on H (`fefe306c`) on 0.4.0, because S2, their cross-check, is the same (below).
- Steps outside ruling 929's reach stand on their records: at H, and at H⁗ for E1 and for V1–V4 and Z0 (the sitting
  there).
- R1–R4 rerun with the flip at T10 (929), not here.

### C1's bands (ruling 931)

From `C1.pinned-release/run/summary.md`:

| band | cells | drags | its outcome | minimum | late takes |
|---|---|---:|---|---:|---:|
| inside | freeze-600 | 10 | 10 landed after a take inside the hold | 7 | 0 |
| edge | freeze-646, -648, -650, -652 | 20 | – | – | 3 |
| past | freeze-700 | 10 | 10 answered the hold notice, with no drop and nothing sent after it | 7 | 0 |

The judge counted 0 false ok, 0 unjudged, 0 false alarms, 0 missing landings, and 0 harness Escapes. 12 drags never
took and were answered as plain drags. T14's share is 0 of 25 landed drops answered unconfirmed.

**Each of the edge band's late takes, judged in full** (`h6/scripts/late-takes.mjs`, output `late-takes-C1.txt`):

| cell | take after the release | the answer | the read | the next request | the engine's Escape after the release | drop |
|---|---:|---|---|---|---:|---|
| freeze-648 #2 | 0.5 ms | ok with the hold notice ("the page may have started a drag that did not complete"; `hold.adaptive.way` noticed) | the late notice ("Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop a…") | refused with it | 1.8 ms | none |
| freeze-650 #4 | 0.7 ms | the same | the same | refused with it | 2.1 ms | none |
| freeze-652 #4 | 0.4 ms | the same | the same | refused with it | 2.4 ms | none |

In each one, the engine saw no take by its release (`hold.taken` false), and `late_dnd` was recorded with
`escaped: true`.

### The hold canary (rulings 930, 932): x64 relative

Each canary takes the plain control's largest warm wait, triples it, and floors the result at 5 ms. The table gives
the ping waits in ms, from each step's summary.

| step | Chrome | held / started | draggable largest | draggable median | plain largest | bar | verdict |
|---|---|---:|---:|---:|---:|---:|---|
| K1 | 156.0.8078.73 | 9 / 9 | 49.7 | 16.3 | 1.2 | 5 | PASS |
| K2 | 158.0.8127.36 | 9 / 9 | 42.9 | 16.3 | 1.3 | 5 | PASS |
| V5 (in step) | 156.0.8078.73 | 9 / 9 | 88 | 57.4 | 1.2 | 5 | PASS |

### S2, the cross-check (ruling 929)

`h6/scripts/crosscheck-s2.sh` compares S2's H6 summary with its record at H (`out/S2.pinned-release/run/summary.md`)
by M4's `compare-settle.mjs`, read-only (`crosscheck-S2.txt`):
- the 30 cells: the same runs and misses, and the same verdicts;
- the 19 audited cells: clean at both, 5 of 5 ran, 0 effects missed;
- neither run has a failure of its own.

The comparator's line: "CROSS-CHECK: SAME verdicts, cells, audits and the runs' own failures". **S2 does not move.**

### The judges' counts

- **Ruling 830's zone-truth mismatches:** none in 320 drags of the window's cells, in each of H1 (idle) and H2 (window
  load).
- **Ruling 838's H2-root unverified ends by answer:** cua:desktop root **0 ok** and 30 unconfirmed of 30; cua:handle
  root **0 ok** and 30 unconfirmed of 30. The ok count is zero, so there is no finding.
- **#365's declared race:** 0 of 60 in each of H1 and H2.

### V5 on `:0` (ruling 933's window; GO 939)

- **The plan** was sent at about 22:27Z on 11-20 (`h6/scripts/v5-plan.md`). The GO was ruling 939, relayed by the
  controller.
- **The launch:** `go-v5.sh` waited for 02:30:00Z and for task 123's private drivers to end, then read the precheck and
  refused on any miss. The precheck (`zero-precheck.out`, 02:30:02Z) found:
  - no hold-sittings and no stress-ng;
  - the owner's Chrome at pid 2546101, the load 0.15, and the pointer at 142,130;
  - no `/tmp/cua171-run-*`, and `gate.mjs leftovers` clear;
  - task 59's Firefox on PATH, and google-chrome 156.0.8078.73;
  - 50G free.
- **How it ran:** one hold of the host lock, holder task123-x64, 02:30:02–03:07:37Z (`run-sitting.sh` →
  `sitting-locked.sh` → `sitting.sh`).
  - CUA_LOCK_MAX was the minutes to 08:00Z less 2, and V5 was capped at 55 min. Only V5 ran.
  - The command was `gate.mjs print V5`'s line with only its leading `locked.sh task123-x64` stripped
    (`zero-commands.txt`).
  - Against H⁗'s line it differs only by `--hold-canary relative` (ruling 932), apart from the paths, holder and home.
- **The verdict:** "run valid; acceptance on the pinned release: every verdict PASS". That covers 52 rows, with text
  restores 0/0/0 and no premise exclusion.
- **One span-limited sample, judged live by ruling 680 as encoded (867a):** `chrome_dnd_late_take_shared` cua sample
  2/0, whose dragend came 191 ms after the press, past the witness span (the answer at 168.71 ms + 20).
  - The row's verdict is pass, and its row carries `span_limited: [{sample: "2/0", …}]`.
  - It is the shape x64 showed at H⁗ (2/0, 221 ms, stored FAIL then, re-judged pass under 680) and at T5 (0/0).
  - Now the judge passes it live, as the ruling encodes.
- **The guard records** (`zero-V5.out`):
  - wrap71 took 14963 samples, with 0 flags, 0 decoy connections and no leftovers;
  - owner-watch was done after 209 checks, changed=0;
  - owner-diff's one difference is the owner's Chrome writing its profile's mtime, as in every sitting;
  - the pointer was restored to 142 130 and reads 142 130;
  - tmproot and `/tmp/cua171-run-*` were left empty;
  - all-clear: clear. No hold-sittings was written.
- **Kept traces and rejudge-audit** (`after-V5.txt`): 52 audit rows, every one with `kept_traces` files (52, none
  missing). `rejudge-audit.mjs` reproduces the stored findings: moved 0, unkept 0, foreign 0 stored and 0 now.
- **One stderr line, harmless (ruling 949):** wrap.out carries libxdo's "XGetWindowProperty[_NET_ACTIVE_WINDOW]
  failed (code=1)", which H⁗'s V5 did not have.
  - It comes from one of the harness's own `xdotool windowactivate --sync <id>` calls (xtools.mjs `xdotool()`, an
    execFileSync whose stderr goes through). libxdo's wait loop read `_NET_ACTIVE_WINDOW` as None once while the
    window manager switched activation, then kept polling until the target was active, and the call exited 0.
  - wrap71's process records show 374 such calls, 307 of them focusFront's restore to the scene's front window. No
    other xdotool call read the active window. The line follows the negative checks' lines, so it came from the cell
    loop.
  - On a private display (`xdo-msg-check.sh`, `.txt`), `getactivewindow` with nothing active prints exactly this
    line, plus a second one, and exits 1. V5 shows only the first line, so it wasn't the stub's getactivewindow,
    which succeeded: the negative check failed the stub.
  - No verdict and no witness span reads the value; the helper's output is discarded.

### settle-check over every step directory at H6

`settle-counted.txt` and `settle-zero.txt`, the counter as ruling 834 reads it:

| step | reading |
|---|---|
| H1, H2 | **TAKEN**: entered 560 each, second_rest 0 and 5, and skipped, unsettled and settle_failed_activation_confirmed 0. These are class A by design: their Electron cells are where the settle decides, as at H⁗ (560 each) |
| C1, K3 | not taken: all zero, final |
| K1, K2 | unknown: 2 of 10 cua engines kept no counter, and those were sent no drag or handle. Every recorded one entered 0 |
| D1, D2, L1, L2a, L2b | unknown: the counted lanes take no `--stats` (834) |
| S1, S2 | unknown: their engines start through cua's service, which 843 excludes from the opt-in |
| V5 | unknown: 20 of 218 cua engines are without a counter (its audit engines, `stats: false`). Every recorded one entered 0 |

No step outside class A reads taken.

### Scans before the commit

- **Token-shaped strings:** `h6/scripts/scan-evidence.sh` over `h6/`, file names only.
- **Key codes** (rulings 874, 875): `privacy-scan.mjs` (task 109's) found 0 held-code rows and 0 raw minimized codes.
- **Window titles** (ruling 863): **the live title half was not run on x64.** Its `:0` is the owner's display, and
  reading its windows' titles is a read of that display outside the GO (the controller's word, ruling 947).
- In its place, a structural scan (`title-scan.mjs`) judged every value in the evidence that can carry a window's
  title, name, class or application. That is 8841 JSON fields (title, name, label, app, application, window, owner,
  class, by, source, toolkit and the like), the quoted strings in error and notice sentences, and the double-quoted
  strings on plain-text lines that name a window.
- Every value is one the harness set itself: its `cua171-…` windows, its scene pages' elements, its own instances'
  classes and app names, and its labels. That is 8855 of 8855, with 0 not its own. The owner's Chrome appears in the
  owner-check lines by class and geometry only, as at H⁗.
