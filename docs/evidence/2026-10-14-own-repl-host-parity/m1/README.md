# M1: cua's own REPL host against the M0 vendor control

These runs execute cua's own host (`src/repl-host/supervisor.mjs` and the ported kernel) through the real cua proxy, in the
same isolated no-services lane as M0's vendor control (`test/repl-parity/serve-cells.mjs`: no-op banner, no services, no
cell environment). The suite is `cells --through M1`, compared against `m0/vendor-1` (mini) and `m0/linux-vendor-1`
(cua-linux) with `test/repl-parity/expected-differences.json`.

## Evidence

- `cua/`: mini, profile `ssfs`; `linux-cua/`: cua-linux, profile `me`, X display `:0`. Each has `meta.json`,
  `results.jsonl` and the effective MCP tool contract in `tools.json`.
- `mini-prepare/`, `linux-prepare/`: readiness and source/runtime facts. `mini-diff.json`, `linux-diff.json`,
  `summary.json`: verdicts and counts.
- Source and harness commit: `8f56fb5`. The PR head differs from it only by two fixes the cells suite cannot reach: a forced
  shutdown during a sandbox-policy change no longer launches a kernel, and a supervisor test passes its marker path to
  the cell and shell as data. Both diffs below were re-run at that head and still read 0 unexpected differences.

## Result

- Mini: 111 cases recorded and passing, 145 journal cells (134 MCP results, 11 boundary observations), 12 connections,
  each attesting `serverInfo {name: cua-repl-host, version: 0.2.0}` and the result marker `cua/replHost {host: cua,
  version: 0.2.0}`, and the own host's Node it ran on (`executionFacts.ownNode`, path and self-reported version, re-resolved
  on the device for each connection and matched against `prepare`). Diff against `m0/vendor-1`: **0 unexpected differences**; 134 accepted identity slots (the marker
  the vendor never sends), nothing else.
- cua-linux: 112 cases recorded and passing (146 cells, 12 boundary observations), the same attestation. Diff against
  `m0/linux-vendor-1`: **0 unexpected differences**; the same 134 identity slots plus the one declared security departure
  below. The comparison still reports `allAssertionsPassed: false` because the vendor control carries its declared defect.
- The default budget was exercised, not inferred: `cells/timeouts/default-30000` sent no `timeout_ms` and was answered
  `js execution timed out; kernel reset, rerun your request` after 30,141 ms (mini) and 30,054 ms (cua-linux); the vendor
  control took 30,036 ms.
- 63 exact image observations per run; no raw image bytes are stored.

## The #135 security departure

With a harness-owned sandbox launcher that exits 73, the pinned vendor Linux host runs the cell unconfined (declared
vendor defect `linux-vendor-sandbox-launcher-fail-open`). cua's own host refuses: the cell is answered with the kernel
exit diagnostic (`exited(code=73)`, tail `fixture sandbox launcher refused`), exactly as the vendor refuses on macOS, no
code runs and nothing is written outside the policy, so the case's assertion passes. `expected-differences.json` names
this one case, platform and assertion field, the declared vendor defect on the vendor side and the exact refusal on the
own side (`scripts/repl-parity/compare.mjs validateExpected`); any other difference in that case still fails.

## Environment

- Mini: proxy and own host on the PATH Node v24.18.0 (`/Users/new/.nvm/versions/node/v24.18.0/bin/node`, recorded as
  `ownNode`).
- cua-linux: the proxy stays on the VM's Node v22.23.3, as M0's control did; the own host runs on a harness-owned Node
  v24.18.0 (checksum-verified from nodejs.org) at `~/.local/share/cua-parity-node/node-v24.18.0-linux-arm64/bin/node`.
  `prepare --node <path>` records it and the harness passes it as `CUA_NODE` in its own remote command environment; no
  shell profile or other device-global setting names it. Every connection's facts carry the same path and `v24.18.0`.

## Reproduce

```sh
node scripts/repl-parity.mjs prepare --device mini --commit 8f56fb5 --profile ssfs
node scripts/repl-parity.mjs run --host cua --device mini --suite cells --through M1 --out /tmp/repl-m1-mini
node scripts/repl-parity.mjs diff docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1 /tmp/repl-m1-mini --through M1 --expected test/repl-parity/expected-differences.json
```

Repeat with `--device cua-linux --profile me --node /home/admin/.local/share/cua-parity-node/node-v24.18.0-linux-arm64/bin/node`
against `m0/linux-vendor-1`.
