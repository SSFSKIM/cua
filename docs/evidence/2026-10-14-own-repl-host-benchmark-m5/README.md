# M5 model benchmark, host axis (acceptance 8's browser benchmark)

Six serial, unattended `sonnet` controller runs, following `test/browser-parity/bench-controller-brief.md`. Three runs
use the vendor REPL host as the control and three use cua's own host. All six run on one harness-owned, browser-only
endpoint on the mini, with browser service `cua` in every run. The session was 2026-10-17, 00:23 to 00:52 UTC.

- **Experiment id:** `orh-m5-host-a`, shared by both groups. On-device journals are at
  `$TMPDIR/cua-bench/orh-m5-host-a/<host>/cua/run-<n>/`.
- **Route:** endpoint `repl-m5t5r1-mini-browser`, the RemoteProofEndpoints `scripts/repl-parity/remote.mjs` from the
  M5 oracle; see `../2026-10-14-own-repl-host-parity/m5/remote/`.
  - It has a fresh installed scratch `CUA_HOME` with the managed Node v24.22.0 and no `CUA_NODE`.
  - The parity clone is at `1d1ed89bb192041e1be4e50d62bd772f12577356` (product code `e24a1cd`), with runtime
    26.928.40906-darwin-arm64.
  - Settings: `CUA_SHIM_SURFACES=browser`, `CUA_BROWSER_SERVICE=cua`, sandbox scoped, profile `ssfs`, backend
    `3b45d47c-…`.
  - Before every run the controller op `restart` restarted the endpoint's agent under `CUA_REPL_HOST=vendor` (runs 1–3)
    or `cua` (runs 4–6), keeping the same device identity. This is why the resident mini agent is not used: its
    `computer,browser` surfaces select the vendor host.
- **Fixture:** the archive's `fixture/` at `/tmp/bench-browser/fixture` on the mini, byte-identical to
  `docs/evidence/2026-10-05-browser-route-benchmark/fixture/` (logs aside), with MiniWoB at `33c3b4d`.
  - The fixture server ran from 00:22 to 00:53 UTC as the dispatcher's one tracked process (PID 22326), and only that
    PID was stopped afterwards (`fixture.txt`).
  - The controllers did not start or stop it.
- **Controllers:** each was a fresh `sonnet` subagent given the brief path plus the run's inputs, and was told to
  `devices_use repl-m5t5r1-mini-browser`. Each scp'd `calls.jsonl` and `outcomes.json` after its last score and
  before `end_task`. The dispatcher started the next run only after those files were on disk.

## Verdict

`node scripts/bench-summary.mjs docs/evidence/2026-10-14-own-repl-host-benchmark-m5 --axis host` (`summary.txt`, exit 1):
**`verdict: regression`**. The regression is on outcomes only. Tool time passes on every task.

- **Tool time (judged): passes.** On all 23 judged tasks, cua's median tool time is within max(10%, 500 ms) of the
  vendor's, or faster.
  - The largest increases are `miniwob/use-slider` (+117 ms, 689 to 807 ms), T3 (+38 ms) and `miniwob/click-link`
    (+36 ms).
  - Tool time is measured on the device (`performance.now()` around each awaited call), so the controller Mac's load
    affects wall time, not tool time.
- **Outcomes: the summarizer reports `regression` on three tasks.** In each, the vendor succeeded 3/3 and cua 2/3, and
  each cua miss is a single run:
  - **T2 (cua run 2).** The controller summed rows from `allTextContents()`, which concatenates the cells. Its parse
    gave `NaN`, it recorded `NaN` as the answer, and it scored the task false. Its report calls this its own error.
    The right total, 1437.50, was in its DOM snapshot.
  - **`miniwob/drag-box` (cua run 1).** The controller did a `tab.cua.drag`, then read the outcome globals and called
    `done` without clicking Submit. The page reported `WOB_DONE_GLOBAL=false`, raw reward 0. Every vendor run clicked
    Submit, and the controller reports this as its own mistake.
  - **`miniwob/drag-items` (cua run 1).** The drag ("Kori to bottom", 52 ms) did not reorder the list, so raw reward
    was -1. The recorder does not record the drag's coordinates. The vendor drags of this task took 99–106 ms; vendor
    run 1 went to (77,98)→(77,205).
- **How far the host explains the outcome misses.**
  - #130's scripted check (task 4, `../2026-10-14-own-repl-host-parity/m5/mini/scripted/summary.txt`) shows identical
    results on both hosts: the same drag paths (121,114)→(76,93) and (77,98)→(77,191), and drag-box and drag-items
    pass 3/3 on each.
  - Every other cua run passed both drag tasks.
  - So the drag-items miss is most likely the controller's choice of target, though this recording cannot prove it.
- **Not done here.** The summarizer's verdict is reported as it is. Remeasuring is the session's call: a new
  experiment id and a fresh 3+3, never relabelled or edited evidence. No run was repeated, edited or dropped.

Wall time (first call to done mark, not judged) is printed per task in `summary.txt`. The wall-time medians for the
fixture tasks are larger on the cua side, for example T6 6,263 ms vendor and 10,333 ms cua, and T8 118 and 5,853 ms.
Those gaps come from controller think time between calls, since the tool-time medians for those tasks are equal or
lower.

## Host attestation (endpoint level)

Each connection the plugin uses cannot be captured, for two reasons. `devices_use` passes on only the device's
`instructions`, not its `initialize.serverInfo` (`src/mcp/target.mjs`). And Claude Code does not show tool-result
`_meta` to the model; this was checked in Part 2, where the client's saved result carries no `_meta` or `cua/replHost`.
The dispatcher therefore attested each run at the endpoint level, under the plan-executor's ruling:

- **Endpoint record.** `attestation/<host>-run-<n>-endpoint.json` is the harness's journaled `hostAttestation` from the
  restart just before that run, and each run's `meta.json` carries it verbatim as `hostAttestations[0]`, checked with
  `jq -S` diff. It records:
  - the real `initialize.serverInfo`;
  - a real js result's `_meta`;
  - on cua, the managed-Node witness: the supervisor `<home>/node/24.22.0/bin/node` v24.22.0, inside the owned agent's
    subtree.

  The two hosts answered as follows:
  - **vendor:** `rmcp 1.5.0`, with no `cua/replHost`;
  - **cua:** `cua-repl-host 0.5.0`, with `_meta['cua/replHost'] = {host:'cua', version:'0.5.0'}`.
- **Process samples.** `attestation/<host>-run-<n>-samples.jsonl` samples the owned agent's process subtree every 30 s
  during the run. It records counts only: anchors, cua supervisors, vendor node_repl and the vendor launcher.
  `…-samples-verdict.json` summarizes each run. In every run:
  - no sample shows a host process of the other kind;
  - every sample with a live session runtime (an anchor) shows exactly one process of the expected kind.

  The agent's `CUA_REPL_HOST` is fixed for its lifetime, and every session it serves resolves the same host.

## Runs and load

| Host | Run | Started–finished (UTC) | Agent PID | Mac 1-min load before / after | Mini 1-min load before / after | Process samples |
|---|---|---|---|---|---|---|
| vendor | 1 | 00:24:03–00:27:14 | 24203 | 32.21 / 44.28 | 2.15 / 3.75 | 10 (7 with a session; expected max 1, other kind max 0, live without expected 0) |
| vendor | 2 | 00:29:47–00:32:39 | 44581 | 44.85 / 35.02 | 3.90 / 2.90 | 10 (7 with a session; expected max 1, other kind max 0, live without expected 0) |
| vendor | 3 | 00:33:54–00:37:29 | 65646 | 31.80 / 14.77 | 2.93 / 3.94 | 9 (6 with a session; expected max 1, other kind max 0, live without expected 0) |
| cua | 1 | 00:38:38–00:41:48 | 84951 | 14.65 / 18.36 | 4.06 / 5.74 | 8 (6 with a session; expected max 1, other kind max 0, live without expected 0) |
| cua | 2 | 00:43:35–00:47:12 | 5921 | 17.67 / 37.36 | 5.37 / 3.85 | 10 (7 with a session; expected max 1, other kind max 0, live without expected 0) |
| cua | 3 | 00:48:29–00:52:16 | 27816 | 36.29 / 34.48 | 4.10 / 3.93 | 10 (7 with a session; expected max 1, other kind max 0, live without expected 0) |

The full `uptime` lines are in `load/<host>-run-<n>-{before,after}.txt`. The mini stayed quiet, with a 1-minute load
of 2.2–5.7. This Mac only ran the controller.

ssfs was `ready:true` at every endpoint restart: the harness's attestation requires `profiles_list` ready for the
prepared backend. Every controller's `profiles_list` also showed it ready. The standing Profile 1 reopen was never
used.

## Controller notes

These are from the controllers' reports and do not change the recorded rows.

- **T7.** It has no row in the fixture's ground truth. All six controllers recorded `#deep-echo` `fFx`, and recorded
  `#deep-log` as `fShiftFx`, because `Shift+F` also logs its Shift keydown. All six scored it true.
- **T8.** All six answered `no h1` with an `h1` count of 0.
- **Vendor run 2, T1.** It includes one failed call: `createBrowserTab` with `visible` gives "Capability is not
  available: visibility". That call is retried without the option.
- **profiles_list.** It is timed with shell clocks and recorded with `bench.recordExternal` in T0. It is diagnostic and
  never judged.
