# M2 task 3: the own host's live runs (2026-10-15)

## Final state: code at `c49777c`, corpus pair at `e4ea7eb`

`c49777c` is the head of the shipped host code. It is `aff75b4` plus:
- a time-zone settle at runtime load (`8e3d148`);
- replacement of a child that does not finish starting (`d29907a`), from the `capabilities/history` hang investigation in `history-hang/README.md`;
- a bound on what the host waits for from a ready worker: its reported hook deadlines plus 2 s, then the worker is stopped (`c49777c`).

Later commits touch only the harness, the corpus and the tests:
- `7342d69`: trace allowances can name `methods` and a `maxDelta`;
- `e4ea7eb`: the slow-budget allowance, and `dialogs/paused-response`'s start cell outlasts the response pause it traces;
- `1a196bb`: the bound tests reach their blocked state;
- the commit that records this pair adds the `input/coordinates` and `waits/networkidle` allowances.

| Run | Command | Result |
|---|---|---|
| Services suite, `cua/`, `cua-diff.json` (at `c49777c`) | `repl-parity.mjs run --host cua --device mini --suite services`, diff against `vendor-1` with `--expected` | 41 cases, 74 cells, complete, every assertion passing, **0 differences**. 73 expected entries used, all the `meta.cua/replHost` identity slot. All 42 connections attest `cua-repl-host 0.3.0` with the marker `{host: cua, version: 0.3.0}`. |
| Tools, `tools-cua/`, `tools-diff.json` (at `c49777c`) | `tools.mjs record --host cua`, diff against `tools-vendor` | **0 differences**. The only allowance is `tools.0.description` through the `table-2-browser-exclusions` transform. |
| MAWS, `maws/` (at `c49777c`) | the probe below | Verdict PASS. Served by `cua browser service 0.1.0`. All 3 serve sessions answered initialize as `cua-repl-host 0.3.0`, and every js result carried the own-host marker (`maws/attest-cua-summary.json`). |
| Browser corpus pair, `browser-vendor-host/`, `browser-cua-host/` (at `e4ea7eb`) | `browser-parity.mjs prepare --commit e4ea7eb --profile ssfs`, then `run --service cua --repl-host vendor` and `run --service cua --repl-host cua`, then `diff --expected test/browser-parity/repl-host-expected-differences.json` | All 59 cases on both sides, downloads included, every case passing, no hang. Vendor side: 61/61 connections `rmcp 1.5.0`. Own side: 61/61 `cua-repl-host 0.3.0`. Every connection's service was `cua browser service 0.1.0`. **0 unexpected differences (59 cases, 151 cells, 7 expected)**, in `browser-diff.txt`. |

The corpus pair has no semantic differences: the 7 differences without allowances (`browser-diff-no-allowances.txt`) are all trace counts, in four cases. Two full vendor-host runs differ from each other in exactly the same 4 cases, cells and methods (`browser-diagnostics/vendor-c49777c-vs-vendor-e4ea7eb-diff.txt`, 7 differences). Each case has a scoped entry in `test/browser-parity/repl-host-expected-differences.json`:

| Case, cell | Methods | maxDelta | Vendor against itself | Own host |
|---|---|---|---|---|
| `actions/wait-for`, `visible` | `Runtime.evaluate`, `Runtime.releaseObject` | 1 | 11/7 and 12/8 (`hist-vendor`, `vendor-variance-*`, both full pairs) | 11/7 and 12/8 |
| `actions/slow-budget`, `late` | the same | 2 | 78/74 (`corpus-c49777c/vendor-host`); 80/76 (`reruns-slow-budget-paused-response/vendor-1..3`, `browser-vendor-host`) | 80/76 three times; 79/75 in the pair |
| `input/coordinates`, `drag` | the same | 1 | 3/1 and 2/0 (`corpus-c49777c/vendor-host`, `browser-vendor-host`, `reruns-coordinates-networkidle/vendor-1..3`) | 3/1 and 2/0 |
| `waits/networkidle`, `idle` | `Page.lifecycleEvent` | 4 | 8, 11, 12 (the same runs) | 11 every run |

The c49777c pair (`browser-diagnostics/corpus-c49777c/`) is kept as diagnostics. It had 3 unexpected differences.
- Two were slow-budget's polling count. They led to that entry.
- One was `dialogs/paused-response`, start cell: `Fetch.requestPaused` 1 against 0. The host traces show the event emitted at the same offset in every run, on both hosts (dialog opening + about 700 ms). The runner's trace read at the end of the cell sometimes missed it, so it fell between cells. `e4ea7eb` makes the start cell wait 2.5 s after the click, past the response pause, instead of adding an allowance. It then matched on both hosts (`browser-diagnostics/paused-response-check-e4ea7eb`) and in the pair.

`maws/e2e-browser-cua.txt` (7 passed) is MAWS's unchanged fake-host regression. It never starts cua, so it is not re-run per code head.

## Earlier record, at `aff75b4` (superseded)

Source: `feat/own-repl-host-m2` at `aff75b4`. That commit matches the vendor where task 1's evidence contradicted the port:
- a bare elicitation suspends the cell's budget;
- response meta merges across a cell's rpcs and hooks;
- a nativePipe peer leaving is reported as a close only.

All macOS sessions were browser-only (`CUA_SHIM_SURFACES=browser`). The mini parity clone was prepared at `aff75b4` with profile ssfs, own Node v24.18.0. No resident checkout, agent, Chrome binding or native helper was touched.

## Services suite (`cua/`, `cua-diff.json`): 0 unexpected differences

```
node scripts/repl-parity.mjs prepare --device mini --commit aff75b4 --profile ssfs
node scripts/repl-parity.mjs run --host cua --device mini --suite services --out m2/cua
node scripts/repl-parity.mjs diff m2/vendor-1 m2/cua --expected test/repl-parity/expected-differences.json
```

| measure | value |
|---|---|
| cases | 41 |
| cells | 74 |
| complete | yes |
| assertions | all pass |
| vendor defects | none |
| differences | none |
| expected entries used | 73, every one the `meta.cua/replHost` identity slot |
| connections | 42, each attesting `serverInfo {name: cua-repl-host, version: 0.3.0}` and the result marker `{host: cua, version: 0.3.0}` |

## Tools contract (`tools-cua/`, `tools-diff.json`): 0 differences

```
node scripts/repl-parity/tools.mjs record --host cua --device mini --out m2/tools-cua
node scripts/repl-parity/tools.mjs diff m2/tools-vendor m2/tools-cua --expected test/repl-parity/expected-differences.json
```

The only allowance used is `tools.0.description`, through the `table-2-browser-exclusions` transform.

## Browser corpus at `aff75b4` (superseded, not in this tree): NOT PASSING, held for the controller

```
node scripts/browser-parity.mjs prepare --device mini --commit aff75b4 --profile ssfs
node scripts/browser-parity.mjs run --device mini --service cua --repl-host vendor --out m2/browser-vendor-host
node scripts/browser-parity.mjs run --device mini --service cua --repl-host cua --out m2/browser-cua-host
node scripts/browser-parity.mjs diff m2/browser-vendor-host m2/browser-cua-host      # 14 differences (59 cases, 151 cells)
```

Both runs covered all 59 cases. Every connection attested its host and `cua browser service`.

The 14 differences, by cause:

- **The downloads group fails identically on both hosts.** `downloads/chooser` (cell `path`), `downloads/media` (cell `media`) and `downloads/two-tabs` (cell `both`) each time out at the cell's budget, vendor host and own host alike.
  - The two hosts agree, so the REPL host is not the cause.
  - Under #113 M5 the same group passed on this mini.
  - This is the "case group needing consent or windows the mini lacks" condition, so it is stopped and reported, not worked around.
  - These are the six assertion rows.
- **`capabilities/viewport` (vendor side only): restored false.** This is the known one-off on this profile: the window's inner height moves as Chrome bars come and go (#113 `m5/network/viewport-diagnosis.txt`). The own host passed it.
- **`capabilities/history` (own side only): the cell hung for 60 s.** The vendor host got the backend's "No handler registered for method: getUserHistory" in 66 ms.
  - The host trace shows the case's setup traffic completing over the same pipe, then nothing until detach.
  - It did not recur in 3 later own-host runs: alone (`browser-diagnostics/hist-*`), and the whole capabilities group twice (`browser-diagnostics/caps-1`, `caps-2`), 12/12 each.
  - Cause not pinned. It is an open item, not dismissed.
- **`actions/wait-for`: a Runtime.evaluate/releaseObject polling count, 12/8 against 11/7.**
  - It flips direction between runs (in `browser-diagnostics/hist-diff.txt` the vendor has 11 and the own host 12).
  - It depends on when the element appears relative to a poll, not on the host.

## MAWS (`maws/`): PASS, own host attested

MAWS ran from a worktree created for this run (`/tmp/maws-cua-m2t3`, detached at MAWS origin/master `ed401ecd`, `pnpm install --frozen-lockfile`, `pnpm build`), never the MAWS main checkout. It ran on this Mac, as in #113 M4/M5. The scratch home `/tmp/cua-m2t3-home` holds only an APFS clone of the installed runtime and `current.json`.

The probe is #113's, unchanged. Host attestation is captured by `maws/attest-serve.mjs`, an `--import` preload that taps every `cua serve` child's stdout and records only `serverInfo` and each tool result's `cua/replHost` marker; `maws/attest-summary.mjs` judges that record.

```
MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && /tmp/maws-review/with-slot.sh env MAWS_CHECKOUT=/tmp/maws-cua-m2t3 \
  CUA_HOME=/tmp/cua-m2t3-home CUA_BROWSER_SERVICE=cua CUA_REPL_HOST=cua CUA_SHIM_SURFACES=browser CUA_NODE=/opt/homebrew/bin/node \
  CUA_ATTEST_OUT=m2/maws/attest-cua.jsonl NODE_OPTIONS=--import=m2/maws/attest-serve.mjs \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out m2/maws/maws-live-cua.json   # exit 0
node m2/maws/attest-summary.mjs m2/maws/attest-cua.jsonl 0.3.0 > m2/maws/attest-cua-summary.json                   # exit 0
cd /tmp/maws-cua-m2t3 && MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && /tmp/maws-review/with-slot.sh pnpm e2e:browser-cua   # 7 passed
```

Probe results:
- Verdict PASS.
- Every maws-features step PASS.
- Service requested `cua`, served `cua browser service 0.1.0`.
- The cursor moved.
- Takeover: at the default budget the click stops at 3,036 ms with `#state` waiting; with `{timeoutMs: 15000}` it goes through at 3,251 ms with `submitted:x`.
- All 3 `cua serve` sessions answered initialize as `cua-repl-host 0.3.0`, and every js result carried `{host: cua, version: 0.3.0}`.

`pnpm e2e:browser-cua` is MAWS's fake-host regression, unchanged. It never starts cua, so it is not evidence about the own host: 7 passed (`maws/e2e-browser-cua.txt`).
