# Linux native speed: vendor host against cua's own host on cua-bench (#116 M5 task 6b, 2026-10-16)

This is acceptance 8's native half, measured on the quiet cloud box the spec's Decision Log assigns to it ("Four rulings shape M5's remaining live work", first bullet). A fresh vendor triple and the own triple ran in one sitting under one experiment id, on the same box, clone, runtime and sample plan.

## Verdict: FAIL, on one method-case outcome; every latency row passes

`node scripts/native-baseline.mjs compare m5-cua-bench/vendor m5-cua-bench/cua` printed `verdict: FAIL` and exited 1. Its unedited output is `comparison.md`. Its "Problems" section is empty: both sides are complete, attested and comparable.

- **The one failing row is `method.typeText`, and it fails on outcome, not time.** The rule holds the candidate to the baseline's outcomes sample for sample. The vendor's three samples were 2 × the D-Bus `NoReply` sentence and 1 × `Resource temporarily unavailable (os error 11)`. The own host's three were 3 × `NoReply`. In all six samples typeText threw and its gedit window exited. Only the error text of one vendor sample differs. The timing of the row is within the limit (candidate 1,636 ms against a 2,134 ms limit).
- **Every other judged row passes:** 19 latency operations and the other five method cases. Medians, p95 and max for both sides are in `comparison.md`.
- **This was not rerun.** The FAIL is recorded as it came out.

**What the differing sample coincides with.** Vendor run-1's typeText sample took 3,014 ms; the other five took 1,625 to 1,642 ms. Its run also recorded the box's first gedit crash report: `meta.gedit.crashReportsBefore` was 0 files and `crashReportsAfter` was 1 file, written at 18:43:36.727Z, during that run's method step. Every later run found the same single report and added none, because apport keeps one unreported report per program. That points to apport collecting the first crash as the reason this one crash ended differently: the helper saw EAGAIN (`os error 11`) instead of `NoReply`. M0's README records the same pair of sentences for this crash on the cua-linux VM (`os error 11` on 2026-10-06, `NoReply` from 2026-10-14). The error comes from the pinned `sky_linux` helper, which is the same binary under both hosts. This explains the variance but does not change the verdict. Whether the verdict stands is for the session to rule.

**Session ruling (2026-10-16): acceptance 8's native half is met, and the raw `verdict: FAIL` above stays as recorded.** No rerun and no oracle change. The reasons:
- typeText's outcome class (threw, window exited) is identical on both hosts in 6 of 6 samples.
- The differing sentence comes from the pinned `sky_linux` helper. The own host relays it unchanged.
- The vendor produced both sentences within this one sitting. M0 and M4 had already recorded the same pair for this crash. This is vendor-against-vendor spread, not a host difference.
- Every latency row passes.

A fresh sitting would mean rerunning until the result passes. Changing the oracle after seeing the result would loosen it post hoc. Whether `compare`'s outcome rule should absorb vendor sentence spread derived in advance from recorded vendor runs is the question #130 asks of the benchmark verdict, so it goes to #130 and is not changed in M5. The spec's Decision Log records the ruling.

Medians from `comparison.md`, in milliseconds. "Judged" is the wall median, net of each side's ssh.roundtrip median for the four cold `initialize`/`total` rows:

| Operation | Vendor judged | Own judged | Limit | Vendor in-cell | Own in-cell | Verdict |
|---|---|---|---|---|---|---|
| cold.miss.total | 1,368.7 | 1,359.1 | 1,868.7 | – | – | pass |
| cold.hit.total | 1,329.3 | 1,047.2 | 1,829.3 | – | – | pass |
| warm.noop | 176.0 | 173.1 | 676.0 | 0.01 | 0.01 | pass |
| warm.getState | 174.2 | 179.8 | 674.2 | 2.50 | 2.67 | pass |
| warm.listApps | 167.2 | 167.9 | 667.2 | 2.46 | 2.61 | pass |
| bind.getApp | 521.3 | 529.4 | 1,021.3 | 351.4 | 362.0 | pass |
| warm.getAXState | 497.8 | 518.6 | 997.8 | 328.1 | 333.6 | pass |
| warm.getScreenshot | 617.0 | 620.3 | 1,117.0 | 446.8 | 447.9 | pass |
| task.act (43 pressKey) | 16,328.6 | 16,318.5 | 17,961.5 | 16,152.1 | 16,142.5 | pass |
| task.verify | 499.4 | 512.1 | 999.4 | 330.1 | 336.0 | pass |
| task.clear | 1,314.1 | 1,318.1 | 1,814.1 | 1,133.6 | 1,138.8 | pass |
| task.total | 18,158.7 | 18,159.3 | 19,974.6 | 17,617.1 | 17,616.9 | pass |
| end_task | 159.7 | 189.6 | 659.7 | – | – | pass |
| method.typeText | 1,634.5 | 1,636.2 | 2,134.5 | – | – | **fail (outcome)** |
| method.paste | 1,637.8 | 1,662.3 | 2,137.8 | – | – | pass |

Samples per side: 15 ssh, 6 cold misses, 9 cold hits, 90 of each warm operation, 3 binds, 30 tasks and 3 of each method case. The own side has 100% success everywhere the vendor does. Task outcome: 30/30 typed, verified and cleared on each side.

**Reported, not judged.**
- ssh.roundtrip (`ssh cua-bench true`): vendor median 2,149.5 ms (p95 2,769.2), own 2,207.3 ms (p95 3,606.0). The cold rows above are judged net of these.
- Approval wait: no elicitation was requested in any run (`meta.elicitations` is empty), so there is no approval time.
- setup.findWindow and setup.findTarget, the harness's own window search.

**Reading the wall times.** The box is in europe-west4, and the controller is this MacBook, so every MCP call crosses the WAN pipe. A warm no-op is 0.01 ms in the cell and 173 to 176 ms wall. Wall time is mostly transport, and the 500 ms tolerance floor is larger than many whole operations. The in-cell medians are the measure of what each host costs on the box, and they agree to within a few percent: getAXState 328 against 334, getScreenshot 447 against 448, task.total 17,617 against 17,617.

## The box

GCE project ytdownload-505811, instance `cua-native-bench`, zone europe-west4-a, ssh alias `cua-bench` (user admin, 34.178.36.236). The instance is a t2a-standard-4 spot instance with stop-on-preemption. No preemption happened during this sitting.

| Fact | Value |
|---|---|
| CPU | Ampere Altra, `lscpu` model Neoverse-N1, aarch64, 4 vCPU (1 thread per core, 1 socket) |
| Memory | 16 GiB (15 GiB available at idle) |
| OS | Ubuntu 24.04.5 LTS, kernel 7.0.0-1014-gcp |
| Display | Xvfb :0, 1440 × 900 × 24, openbox; AT-SPI on `unix:path=/run/user/1001/bus` |
| Session environment | `DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus` (also in `~/.config/cua-bench/desktop.env`) |
| gedit | 46.2, launched by the harness with `LANG=C.UTF-8` (recorded as `meta.gedit.locale` in every run) |
| System Node (runs the cua proxy) | v22.23.3 |
| Vendor host's Node | the pinned runtime's `cua_node` v24.21.0 (each run's `meta.answeringNode`) |
| Own host's Node | the managed Node v24.22.0 that each run's fresh `cua install` placed under `<scratch home>/node/24.22.0/` (`nodeMode: managed`, no `CUA_NODE`) |
| Runtime release | 26.928.40906-linux-arm64, installed fresh into each run's scratch home |
| Sandbox | `disabled`, the platform default for Linux computer sessions |

**Idle state before anything ran** (2026-10-16T18:37:19Z):
- `uptime`: up 6:27, load average 0.00, 0.00, 0.00.
- `top`: 95.7% idle, 0.0 st.
- `vmstat 1 5`: 100% idle, st 0 in every sample.
- `/proc/stat` steal counter: 0 across a 5 s window.
- No gedit and no cua process was running. The parity clone was clean, at 56ea8c3 before preparation.

**Controller.** The MacBook (Apple M1 Max, 10 cores) ran the harness. Its load stayed high from other sessions' work throughout: 27.9 at the start, 141.9 at its peak (cua run-1's start), and between 29 and 75 otherwise. The comparator nets out the ssh pipe and judges the device's work. The controller's load is recorded per run in `meta.load.controller` and is listed below.

## Commands and heads

The worktree `/Users/new/Developer/GitHub/cua-wt-repl-host` is on `feat/own-repl-host-m5` at `b3cb6db`. Its product code is at `e24a1cd`; later commits change evidence and the oracle only. The box's parity clone was detached at that same `b3cb6db`, clean, after `npm ci` (every `meta.json` records the commit).

```sh
node scripts/native-baseline.mjs prepare --device cua-bench --commit b3cb6dbfde346a7e1e90bd2bc065052853aec056
E=docs/evidence/2026-10-14-own-repl-host-native/m5-cua-bench
for host in vendor cua; do for n in 1 2 3; do
  # before each run: ssh cua-bench uptime, wait while the 1-minute load is above 0.30
  node scripts/native-baseline.mjs run --device cua-bench --host $host --experiment m5t6b-cua-bench-2026-10-16 --out $E/$host/run-$n
done; done
node scripts/native-baseline.mjs summary $E/vendor
node scripts/native-baseline.mjs summary $E/cua
node scripts/native-baseline.mjs compare $E/vendor $E/cua --out $E/comparison.md   # verdict: FAIL, exit 1
```

Both summaries listed no problems. The sample plan is the default: 5 cold, 30 warm and 10 tasks. All six runs share experiment `m5t6b-cua-bench-2026-10-16`, and each ran in its own fresh scratch home, which was removed after its cleanup (`meta.preparationCleanup.removed: true`).

## Every run's load

"Pre-run check" is the sitting's own `ssh cua-bench uptime` just before the run command; the full log is `sitting-load.log`. No run waited: every check found the 1-minute load at or below 0.30. "Harness before" is the run's preflight. It is taken after the run's own fresh `cua install`, so it includes the decay of that install's decompression. "Harness after" is taken after cleanup. Device figures are 1-, 5- and 15-minute load averages; the controller figure is the 1-minute average.

| Run | Started (UTC) | Pre-run check | Harness before | Harness after | Controller before → after |
|---|---|---|---|---|---|
| vendor/run-1 | 18:38:42 | 0.00 0.00 0.00 | 0.45 0.11 0.04 | 0.06 0.12 0.07 | 27.12 → 64.72 |
| vendor/run-2 | 18:44:50 | 0.05 0.12 0.07 | 0.51 0.23 0.11 | 0.19 0.25 0.16 | 74.82 → 67.08 |
| vendor/run-3 | 18:50:57 | 0.18 0.25 0.16 | 0.54 0.33 0.19 | 0.10 0.21 0.18 | 45.45 → 138.93 |
| cua/run-1 | 18:57:08 | 0.09 0.21 0.18 | 0.50 0.30 0.21 | 0.28 0.27 0.21 | 141.56 → 58.37 |
| cua/run-2 | 19:04:42 | 0.26 0.26 0.21 | 0.61 0.34 0.24 | 0.09 0.15 0.17 | 59.27 → 37.62 |
| cua/run-3 | 19:10:55 | 0.08 0.15 0.17 | 0.44 0.23 0.20 | 0.19 0.19 0.18 | 29.85 → 38.42 |

## Attestation and hygiene

- **Host attestation.**
  - Vendor: every connection, 6 per run, attested `rmcp 1.5.0` with no `cua/replHost` marker.
  - Own: every connection attested `cua-repl-host 0.5.0` in `initialize` and `{"host":"cua","version":"0.5.0"}` on its first real result. The answering Node was the run's managed v24.22.0, matching the prepared `ownNode` exactly.
- **Helper.** None was running at any run's start (`helperAtStart: none observed`). Each run started the pinned `sky_linux` and left none behind.
- **Leftovers.** Every run ended with `{"serves":0,"geditRunning":0}`. After the sitting the box had no gedit, no `sky_linux`, no `/tmp/cua-native-baseline-*` directory and no scratch home. The clone was clean at `b3cb6db`, and the load was back to 0.10.
- **gedit windows.** Only harness-owned gedit windows were bound or sent input, each on its own scratch file. A process is signalled only while its command line names the run's own scratch file.
- **One device-side artifact.** `/var/crash/_usr_bin_gedit.1001.crash` is apport's report of the first typeText crash, written by vendor run-1. It is left in place. Removing it would mean editing system crash state, which the harness does not do.
- **Content.** No screen content, titles or screenshot bytes are in these files. Cells return only counts, lengths, booleans, ids, hashes and the vendor's error sentences.

## Files

- `vendor/run-{1,2,3}/` and `cua/run-{1,2,3}/`: `results.jsonl` (one row per sample), `meta.json` (what each run ran against) and `preparation.json` (its scratch home).
- `vendor/summary.md` and `cua/summary.md`: each side pooled.
- `comparison.md`: the comparator's unedited output.
- `sitting-load.log`: the pre-run load checks and run boundaries.
