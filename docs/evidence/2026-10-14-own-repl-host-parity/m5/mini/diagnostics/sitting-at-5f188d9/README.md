# Diagnostic: the mini sitting at code head 5f188d9 (stopped on a product finding)

Recorded code head **5f188d99a6c9d076c5706e7c47e1ebdfe13f8c85**. Evidence commits made during the sitting (631dce1,
a977f9f's Decision Log, this one) change no code; runs record them as `harnessCommit`. Mini, browser-only, profile ssfs.

```sh
node scripts/repl-parity.mjs prepare  --device mini --commit 5f188d99a6c9d076c5706e7c47e1ebdfe13f8c85 --profile ssfs
node scripts/browser-parity.mjs prepare --device mini --commit 5f188d99a6c9d076c5706e7c47e1ebdfe13f8c85 --profile ssfs
node scripts/repl-parity.mjs run --host vendor --device mini --suite all --through M5 --out all-vendor-1
node scripts/repl-parity.mjs run --host cua    --device mini --suite all --through M5 --out all-cua
node scripts/repl-parity.mjs diff all-vendor-1 all-cua --through M5 --expected test/repl-parity/expected-differences.json > all-diff.json
```

- Preparation: fresh `cua install` scratch homes, no `CUA_NODE`, no `--node`; `nodeMode: managed`. The own host's
  answering Node is the managed `<scratch home>/node/24.22.0/bin/node` v24.22.0 (`prepare-summary.json`; every one of
  all-cua's 59 connections attests `cua-repl-host 0.5.0` with that executable). Harness Node on the mini v24.18.0.
- all-vendor-1 (10:54–11:26 UTC): 479 cases, complete, assertions PASS, 479 covered, 0 vendor defects.
- all-cua (11:26–11:57 UTC): 479 cases, complete, assertions **FAIL**, 478 covered.
- Diff: **3 unexpected differences**, all in `cells/native-pipe/absolute-path`, cell `stat-missing` (M5 task 2's row);
  1,365 expected (identity slots), 1,379 cells.
  - vendor: `native pipe path unavailable: No such file or directory (os error 2)` (the M5 oracle's mini sentence)
  - cua: `failed to connect native pipe: No such file or directory (os error 2)`
  The own relay (`src/repl-host/native-pipe.mjs`, `open`) reports a failed `stat` with the connect prefix; the vendor
  uses a separate stat prefix. This is a product finding, not an allowance candidate.
- A second vendor run started at 11:57 and was stopped by the executor after 32 rows, once the finding made this head's
  evidence moot; it is not kept. No harness process was left on the mini.
- Load (`*-uptime.txt`, before/after each run): mini 2.3–4.2; this Mac 48–168 (not timed evidence).
- ssfs readiness (`ssfs-readiness.txt`, profiles list key/ready/reason only, before/after each step and every 5 min):
  ready throughout this sitting. One drop before it: last ready 10:35:14Z (after attempt 1's cleanup), found not live at
  10:50:37Z with no harness step running in between; the session reopened Profile 1.
