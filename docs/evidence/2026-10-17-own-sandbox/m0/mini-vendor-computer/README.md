# #115 M0 baseline: the vendor host's computer session on the mini

This is acceptance 11's first configuration (spec `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`): the vendor REPL host, computer surface, TextEdit, before any production change. M4 repeats it into `m4/mini-vendor-computer/` with the same arguments, and `compare --same-host` judges `cold.miss.first_js` and `cold.hit.first_js`.

```sh
node scripts/native-baseline.mjs prepare --device mini --commit 90cbfe0
node scripts/mini-rules.mjs vendor      # = native-baseline run --device mini --experiment 115-m0 --host vendor --approved-runtime /Users/new/cua-115/home --out …/run-N, three times, each behind the mini rules
```

## Result

All three runs completed, all at harness commit `90cbfe0` (M0's merge). `summary.md` lists no problems. Every connection attested the vendor host (`rmcp 1.5.0`).

Judged rows (pooled medians):

| Row | Median | Samples | p95 |
|---|---|---|---|
| `cold.miss.first_js` | **400.9 ms** | 6 | 2,321.9 ms |
| `cold.hit.first_js` | **429.3 ms** | 9 | 519.7 ms |

The other rows are in `summary.md`.

## How each run was set up

- **Runtime.** The approved copy `~/cua-115/home` (release `26.928.40906-darwin-arm64`) was served in place; nothing was installed. The record shows `runtimeReuse` and `measurement.freshInstall: false`.
- **Environment.** HOME was the account's, XDG_CONFIG_HOME the run's scratch directory, and secrets were off.
- **TMPDIR.** Each run's serves had a TMPDIR of their own, `<scratch>/tmp`. The launch witness reads `{launcher: codex-cli, tmpdir: inherited}` on every connection.
- **Cleanup.** It restored `state/` and `run/` every time and stopped no helper (`helpersStopped: []`): no helper was running when cleanup came. One TextEdit approval per run was answered by the harness. No serve or TextEdit was left behind.

## Loads, and the bar that moved

| Run | Started (UTC) | Gate's 2nd reading | Device before | Device after | Controller 1-min load before → after |
|---|---|---|---|---|---|
| run-1 | 13:38:02 | 1.85 | 1.85 3.75 4.86 | 2.03 3.40 4.63 | 219.34 → 172.43 |
| run-2 | 14:49:03 | 1.66 | 1.66 2.39 2.85 | 3.91 2.85 2.98 | 189.05 → 231.73 |
| run-3 | 14:51:17 | 3.11 | 3.11 2.80 2.95 | 4.39 3.40 3.17 | 207.23 → 230.63 |

**Why the bar moved.** The mini's load gate was "1-minute load under 2" for run-1 and "under 5" from about 14:10Z for run-2 and run-3, by the dispatching session's ruling.
- The bar of 2 was set for task 1's cargo builds, which took the mini to load 16.
- After run-1, the residue waited 35 minutes on load alone, between 2.1 and 4.3. The cause was another session's calibration job: one Python process at about 100% CPU on a 10-core machine, a much smaller contention.
- Its effect shows in the loads above. Run-3 started at 3.11; run-1 and run-2 started under 2. A reader judging the triple's spread should read the `first_js` rows per run beside these loads.
- The controller (this MacBook) ran at loads near 200 throughout, from other sessions. The judged rows are timed around one MCP call over an open connection.

## The sittings

- **Run-1 (13:38Z).** It ran in the window after maws-fe's E2 landing set. Two earlier attempts stopped on a Chrome window in front. At 13:25Z the MAWS CI job's window came up while the runner was busy. In between, the rule was refined: a window in front waits while the runner is busy, but once the runner is idle Terminal is required, and a system prompt always stops. At 13:28Z the window was still in front with the runner idle. The owner closed Chrome's windows before run-1.
- **Run-2 and run-3 (14:49Z and 14:51Z).** The first try at run-2, at 13:42Z, stopped when Chrome came to the front with the runner idle. That was the owner's journal run, which ended at 13:50Z. A later try at 14:46Z stopped on a GitHub list that reported one queued run and delivered none. Such a CI observation is now read again rather than stopping the sequence; an unreadable frontmost app still stops.
- **Prompts.** No system prompt appeared. Terminal was frontmost after every run (`../mini-rules/sitting-log.txt`).

The earlier run-1 from 10:52Z, recorded without the per-run TMPDIR, is in `../mini-vendor-computer-superseded/`.
