# Own-browser-service benchmark controller

You are running the **agent-level benchmark**, not the deterministic parity corpus. Its question is whether cua's replacement browser service preserves task outcomes and latency through the same plugin/device route. Source contract: `docs/doperpowers/specs/2026-10-13-own-browser-service-design.md`, “Benchmark baseline and comparison” and M0/M5.

## Inputs and route

The dispatcher supplies `service` (`vendor` or `cua`), `profile` (the mini's prepared key, normally `ssfs`), resident checkout commit, runtime release, and an evidence directory on this Mac. Do three consecutive runs, serial and unattended, with the same model and profile. The owner/session must first make that mini profile ready on **cua's extension route**. If readiness or service attestation disagrees, stop and report it; a run through the old ChatGPT extension is not this baseline (spec's execution pre-flight discovery).

Use the cua plugin: finish any open task, `devices_use mini`, `profiles_list`, select exactly the supplied key's `extensionInstanceId` with `cua.getBrowser`. Only tabs you create are yours to close. Call `end_task` between runs and at completion. The resident agent serves vendor until the session updates its checkout/agent at M5; setting a shell variable in your client does not switch it. Record the supplied resident commit and the selected browser's documentation header/marker as the attestation. Vendor has no `cua browser service <version>` marker; cua requires it. Never restart/reconfigure the resident agent to make a benchmark run.

## Fixture, task set and lifecycle

The shared tasks are `docs/evidence/2026-10-05-browser-route-benchmark/TASKS.md`; copy that archive's `fixture/` to `/tmp/bench-browser/fixture` on the mini. Keep MiniWoB at `/tmp/bench-browser/miniwob-plusplus`, checked out at commit `33c3b4d` from `https://github.com/Farama-Foundation/miniwob-plusplus`. The same fixture server patches the response to a 180 s episode and deterministic `?seed=bench-<task>`; do not change either clone's source.

Start exactly your fixture process on the mini with `node /tmp/bench-browser/fixture/serve.mjs` in a tracked SSH/Bash process (BatchMode for SSH), record its PID, and wait for loopback port 48731 to answer. If the port is already occupied, establish who owns it rather than killing it. Stop only that recorded process after the three runs. This is a different server/port from the parity harness's 48732. Remote setup touches the fixture directory, not the resident cua checkout or Chrome's profile data.

Read TASKS.md and only the fixture README's “Pages and element ids” and “MiniWoB++ block” sections before acting. The “Ground truth” section is for scoring **after** the fixture tasks. T0 is setup; perform T1–T8; then the 15 MiniWoB tasks listed in that README, in order, using IDs `miniwob/<taskname>`; T9 is final cleanup. One attempt per task, no reset/retry of an episode. The benchmark uses real UI actions; evaluate is for reads, not mutating a task to its answer. MiniWoB success is `WOB_DONE_GLOBAL === true && WOB_RAW_REWARD_GLOBAL === 1`, not time-discounted reward equal to 1. Read those globals before another START. On vendor, its read-only world may hide page globals; the archive documents reading the page's console outcome via `tab.dev.logs` instead. T8's historical “no h1” answer is acceptable when that is what the live page actually contains (archive README ruling).

## Evidence contract

For each run write `<evidence>/<service>/run-<1|2|3>/`:

- `meta.json`: `{service, commit, profile, model, runtime, started, finished, attestation}`. Times are ISO timestamps. Model/runtime/profile stay identical across both service groups; commit pins each group's implementation. `attestation` contains `{route:'resident-agent', residentCommit, selectedBrowserHeader, marker}`; vendor marker is null.
- `calls.jsonl`: append each tool call as it happens: `{t,task,tool,kind,ok,ms,note}`. `t` is call **start**, `ms` measured elapsed; `kind` is `action|observe|wait|other`. Append exactly one `{task,done,ok}` completion row for every task, including failures. Preserve actual timestamps: reasoning gaps are part of task wall time. Fixture correctness may be scored after the block; finalize `ok` then without moving the done timestamp.
- `outcomes.json`: an object keyed by the identical task IDs in all runs, each `{ok:boolean, answer?, rawReward?, discountedReward?, reason?}`. `ok` must match the done row. Failed/blocked tasks remain in both files, not silently omitted.

Keep notes about fixture data and observed errors, not unrelated tabs, credentials or approval content. Do not read secret stores, auth files, tokens or Chrome profile files to solve setup friction.

After run 3, run `node scripts/bench-summary.mjs <evidence>` on this Mac and return its output plus the evidence directory. Vendor-only output ends `cua runs: none`, not a parity verdict. With all six runs, a task passes when cua's median is no more than vendor's median plus `max(10%, 500 ms)` and cua's success count over its three runs is at least vendor's over its three. Success is the scored `ok` flag: fixture answers are scored against ground truth; MiniWoB uses completion with raw reward 1. Answers and rewards are recorded and printed, never compared: answer wording may vary, and discounted reward is time-dependent. One task outside that boundary yields `regression`. The summarizer rejects incomplete/incomparable inputs rather than inferring absent data.
