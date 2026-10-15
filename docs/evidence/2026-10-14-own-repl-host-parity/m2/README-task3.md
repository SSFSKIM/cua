# M2 task 3: the own host's live runs (2026-10-15)

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

## Browser corpus (`browser-vendor-host/`, `browser-cua-host/`, `browser-diff.txt`): NOT PASSING, held for the controller

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
