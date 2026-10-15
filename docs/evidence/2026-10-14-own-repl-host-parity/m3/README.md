# M3 selected-host oracle controls

These controls exercise the **vendor REPL host and browser client**. They establish oracle determinism, not owned-host parity; the owned-host comparison is M3 task 4. Source commit and machine/runtime facts are recorded in every run's `meta.json`. `tools.json` is the actual MCP tool list and `results.jsonl` retains ordered MCP content, errors, metadata and independent assertion rows. Run directories are not relabelled after recording.

## Execution and comparison

Only the mini's isolated `~/Developer/GitHub/cua-parity` clone and existing `ssfs` binding are used, through batch SSH. The launch is browser-only with the retained cua browser service. Native macOS production calls and this Mac's Chrome/helpers are not involved. A missing live binding stops preparation rather than launching or rebinding Chrome.

From the source commit recorded in the metadata:

```sh
node scripts/repl-parity.mjs prepare --device mini --profile ssfs --commit <source-commit>
node scripts/repl-parity.mjs run --device mini --host vendor --suite api --through M3 --out <api-1>
node scripts/repl-parity.mjs run --device mini --host vendor --suite api --through M3 --out <api-2>
node scripts/repl-parity.mjs diff <api-1> <api-2>
```

Repeat the run/diff commands for `--suite docs-profiles` and `--suite secrets-live`. No expected-differences file is supplied: vendor determinism rejects one. The accompanying `*-diff.json` files are actual comparator output. Declared schema-aware identity/image projections are not raw-byte equality; arbitrary output text and nonidentity command values remain exact.

## What the proof labels mean

- **Real Chrome**: the selected host/client drives fixture pages in the already bound profile; independent fixture state verifies side effects. Shared decorated-tab behavior uses this lane on both platforms.
- **`real-service`**: the selected client reaches the retained real service over the synthetic capability backend. The backend supplies advertised capabilities and synthetic user/history/WebMCP data; it is not the owner's tabs or history.
- **`boundary-double`**: the selected host/client is real; source-grounded replies below that client exercise members that the retained service cannot reach or advertise. Successful AX, optional browser methods, all six GSuite export formats and YouTube transcript export prove client marshalling, not newly implemented service support or authenticated external export success.
- **`boundary-double:hidden`**: absent/disabled manifests exercise `get`, `in`, keys and descriptors. This is an executable reflection proof, not a skip.
- **`binder-double`**: actual macOS facade/binder code over source-grounded Sky/tab doubles. These are darwin M3 obligations; native Linux rows remain M4 and cannot be satisfied by these doubles.
- **`service-boundary-double`**: actual selected host/client calls the unchanged production browser secret wrapper and real scratch file store, with a recorder below the wrapper. Only synthetic scratch values are used; observations expose booleans and labels, never secret values. Native substitution remains M4 (macOS production native work is #117).

`real-service+boundary-double` cases retain the real-service contract cells and add explicitly scoped client-boundary supplements; the combined label does not promote a double into service coverage.

`meta.json.caseProofs` and per-row `proof` distinguish these seams. Unit-only malformed envelopes that the real client cannot emit remain named unit proofs. The inventory gate executes those exact named tests and verifies inclusion in `npm test`; live-required rows cannot be satisfied with fake rows. `--suite all` excludes fake/unit scenarios, and live comparison still rejects fake rows.

## Independent documents and bounded profiles

Expected first-call core bytes come from the independently edited Table 3 golden and hash-pinned readable vendor sources, not the owned implementation. The dated owner amendment permits exactly the two Linux grammar repairs listed in Table 3. Source-transform tests independently verify this derivation and reject partial, old or unrelated changes.

Selected-browser documents use the same service/backend. Only declared Name/ID header slots normalize. The comparison-only core projection is limited to explicit documentation/binder/rewrite cells and complete exact core+policy prefixes; persisted rows remain unchanged. Cases exercise core/browser/state ordering, suppressed output and same/later-request metadata rewriting. `profiles_list` has an independently observed, bounded listing host with initialization and actual JS-call attestation, forbidden tab enumeration/title/URL checks, and teardown observation.

## Exact observation boundaries

The WebMCP call case maps only `webmcp_invoke_tool.registration_id`, after the fixture has observed that exact ID in the real delegated `webmcp_list_tools` response. Tokens follow first issuance and are browser/tab-scoped. Unknown references fail. Reused identities stay reused; all other payload and result values remain exact. This is not generic UUID masking, backend substitution or a comparison allowance.

Locator supplements observe cross-tab refusal before dispatch, cache reuse/eviction/action invalidation and diagnostic match sampling. Boundary observations retain non-script fields and script presence rather than evaluated-script implementation spelling; actual Chrome cases verify the diagnostic result. Suppressed screenshot cases decode and compare image content in memory, emitting only safe booleans.

Download cleanup runs outside the kernel only after successful chooser assertions. It requires a newly obtained handle, acknowledged upload, exact fixture basename grammar/content/size and matching canonical path/device/inode, uses a no-follow file descriptor and rechecks identity before unlinking that one artifact. No directory sweep or unknown-file deletion occurs. Private cleanup paths do not enter parity rows.

## Trace calibration and coverage

Host trace limits are mechanically derived per case/cell/method from the immutable vendor-vendor evidence pinned by `test/browser-parity/repl-host-expected-differences.json` at commit `50f556baa72ce3024f7108f4978536fbe0788c3c`. The configuration contains evidence references, not handwritten method bounds. Non-trace variance is refused, context and host-axis guards remain mandatory, malformed traces fail before counting, and calibrated scopes cannot lose either trace.

Reproduce the committed M2 comparison:

```sh
node scripts/browser-parity.mjs diff \
  docs/evidence/2026-10-14-own-repl-host-parity/m2/browser-vendor-host \
  docs/evidence/2026-10-14-own-repl-host-parity/m2/browser-cua-host \
  --expected test/browser-parity/repl-host-expected-differences.json
```

At this oracle source state it reproduces **0 unexpected differences, 59 cases, 151 cells and 7 mechanically accepted trace differences**. Those host-axis tolerances are not used for these vendor controls. The M3 inventory gate links all 491 due obligations; 51 native/Linux M4 obligations remain pending. Linkage is not an owned-host live-parity claim.

## Source gates

`gates.json` records the verified commands and counts at source commit `d75a10541aa427659a51566c2f7563fbd98e3f95`: default Node 2,166 pass/70 declared skips; explicit CUA_NODE 2,228 pass/8 declared skips; mods 32/32; inventory 8/8; independent pinned-document tests 19/19. Both npm test runs have 2,236 total tests and zero failures. Plugin validation passes with its existing root CLAUDE.md warning, quoted exactly in that file. No production `src/` files changed in this task.

## Recorded controls

All six runs recorded source and harness commit `d75a10541aa427659a51566c2f7563fbd98e3f95`, complete clean-clone attestations and zero vendor defects. Every raw assertion row was independently checked, not inferred from the shell exit code.

| Suite | Passing cases | Recorded cells | Differences | Expected/waived |
|---|---:|---:|---:|---:|
| api | 290/290 each | 1072 each | 0 | 0 |
| secrets | 25/25 each | 50 each | 0 | 0 |
| docs | 12/12 each | 37 each | 0 | 0 |

API proof labels comprise 136 Chrome cases, 22 real-service cases, 8 real-service-plus-boundary cases, 40 boundary doubles, 64 hidden boundary cases and 20 binder doubles. All use the actual selected host/client; the labels distinguish what lies below that client. `doubleCases: 0` in the comparator means no fake host rows, not absence of the explicitly labelled transport/binder doubles.

The earlier 41867b8 API pair passed every assertion but differed in one WebMCP registration UUID. Those recordings are not committed as passing controls or relabelled. These are fresh recordings after the source-grounded issuance projection, and the two docs/secret pairs likewise replace the earlier provisional captures.

# M3 task 4: the own host with the owned facade, graded against this oracle

The mini runs below execute `feat/own-repl-host-m3` at **`50d1170`**; the MAWS probe, which runs on this Mac, executes **`0d54b41`**, the evidence commit that adds its source-binding recorder (no code change since `50d1170`: `git diff 50d1170 0d54b41 -- src bin scripts test` is empty). The own host's code is unchanged since `9a3b0e1` (task 3 and the Table 3 amendment). Task 4's two commits touch only the #113 browser corpus's download guards (below). The own host's banner is `src/cua-api/bootstrap.mjs` (`CUA_BOOTSTRAP_BANNER`); no vendor facade import is left on the own route.

All macOS sessions were browser-only (`CUA_SHIM_SURFACES=browser`, cua browser service, scoped sandbox), on the mini's `~/Developer/GitHub/cua-parity` clone through batch SSH, with the existing ssfs binding. No native helper, Chrome launch or rebind, resident checkout or agent, or secret store was involved, and no -10005 or `host_not_live` occurred.

| Run | Command (from the worktree) | Result |
|---|---|---|
| API, `cua-api/`, `api-cua-diff.json` | `repl-parity.mjs run --host cua --device mini --suite api --through M3`, diff against `vendor-api-1` with `--expected test/repl-parity/expected-differences.json` | 290/290 cases, 1,072 cells, every assertion passing. **0 differences.** 1,072 expected entries used, all the `meta.cua/replHost` identity slot. |
| Secrets, `cua-secrets/`, `secrets-cua-diff.json` | the same, `--suite secrets-live`, against `vendor-secrets-1` | 25/25 cases, 50 cells. **0 differences.** 50 expected, all the identity slot. |
| Docs and profiles, `cua-docs/`, `docs-cua-diff.json` | the same, `--suite docs-profiles`, against `vendor-docs-1` | 12/12 cases, 37 cells. **0 differences.** 36 expected, all the identity slot. The first-call core bytes equal the oracle's independent Table 3 derivation, amendment included. `profiles_list` passes through the own browser-only bounded host (its initialize and listing js attest `cua-repl-host 0.3.0`), with no titles, URLs or tab counts. |
| Tools contract, `tools-cua/`, `tools-cua-diff.json` | `repl-parity/tools.mjs record --host cua --device mini`, diff against `../m2/tools-vendor` | **0 differences.** The only allowance used is the `table-2-browser-exclusions` transform of `tools.0.description`. |
| Browser corpus, `browser-vendor-host/`, `browser-cua-host/`, `browser-diff.txt` | `browser-parity.mjs prepare --commit 50d1170 --profile ssfs`, `run --service cua --repl-host vendor`, `run --service cua --repl-host cua`, `diff --expected test/browser-parity/repl-host-expected-differences.json` | 59/59 cases on each side, every assertion passing. **0 unexpected differences (59 cases, 151 cells, 0 expected)**; without the derived tolerances it is also 0 (`browser-diff-no-allowances.txt`). Vendor side: 61/61 connections `rmcp 1.5.0`, no own-host marker. Own side: 61/61 `cua-repl-host 0.3.0` with `{host: cua, version: 0.3.0}`. Every connection served by `cua browser service 0.1.0`. |
| MAWS live probe, `maws/` (at `0d54b41`) | below | Verdict PASS. All 3 `cua serve` sessions answered initialize as `cua-repl-host 0.3.0`, every js result carried the own-host marker, and each session's source record names commit `0d54b41`, a clean tree, runtime `26.928.40906-darwin-arm64` and own-host Node `/opt/homebrew/Cellar/node/26.7.0/bin/node` v26.7.0 (`maws/attest-cua-summary.json`). |
| MAWS `pnpm e2e:browser-cua`, `maws/e2e-browser-cua.txt` | below | 7 passed. MAWS's fake-host regression; it never starts cua, so it is not own-host evidence. The raw log's two `ExperimentalWarning: SQLite is an experimental feature` lines (1094-1097) come from MAWS's own test processes and are nonblocking noise. |

Each mini parity run's metadata (api, secrets-live, docs-profiles, tools, both corpus runs) records commit `50d1170`, a clean clone, harness Node and own-host Node v24.18.0 and runtime `26.928.40906-darwin-arm64`, and every own connection in them attests `serverInfo {name: cua-repl-host, version: 0.3.0}` and the result marker. The MAWS records prove their own facts, listed in their row above; M2's MAWS records (`../m2/maws/`) carry identity and markers only, and the M2 and M3 0.3.0 hosts are told apart by these source records.

## The download guards (`2512590`, `50d1170`)

The mini's Downloads already holds `parity.txt` and `parity (1).txt` through `parity (100).txt`, so Chrome names every new fixture download `parity - YYYY-MM-DDTdddddd.ddd.txt`. At `0bab8b0` the corpus's `downloads/chooser` and `downloads/two-tabs` refused their own artifact on the vendor host (`diagnostics/downloads-guard/vendor-before-fix-0bab8b0`). Each newly created file matched that grammar exactly. `2512590` gives both cases one shared guard, `test/browser-parity/support/fixture-download-name.mjs`, carrying exactly the grammar the REPL chooser case accepts, and they then passed (`vendor-after-fix-2512590`). The first full pair at `2512590` (`diagnostics/corpus-2512590/`) showed a third case on the same old grammar, `downloads/blocked-navigation` (`armed` reported `downloaded: false` on both hosts), and `50d1170` moves it onto the same guard. `test/browser-parity/download-names.test.mjs` requires every corpus pattern that names the fixture artifact to be that guard. Nothing was deleted from Downloads.

## Vendor variance met on the way (no allowance added)

- **`actions/locators`, `fill` cell.** In the `2512590` pair the vendor host counted 6 `Runtime.evaluate` / 2 `Runtime.releaseObject` against the own host's 5/1. Three reruns of each host at `50d1170` (`diagnostics/locators-reruns-50d1170/`) give the vendor 5/1 in `fill`, and 4/2 then 3/1 in `select`; the own host is 5/1 and 3/1 every time. This is locator polling the vendor varies on against itself. The final pair at `50d1170` matched without it, so the derived-tolerance configuration is unchanged.
- **`cells/documentation/browser-docs-before-state`.** The cua browser service numbers browsers in the order their backends answer `getInfo` (`src/browser-service/backend.mjs` `discoverBackends`), and the mini has two bound profiles (ssfs and school). When docs-profiles ran straight after the secrets suite, both hosts numbered school first: the own host's first docs run (`diagnostics/docs-browser-id-race/cua-first`, 1 semantic difference against `vendor-docs-1`), the vendor host after its own api and secrets runs (`vendor-after-api-secrets`, the same single difference against `vendor-docs-1` with no allowances), and the own host again (`cua-after-secrets`). Three further runs of each host and a second vendor run after secrets numbered ssfs first. The committed `cua-docs/` run (docs-profiles first, before api and secrets) matches.

## MAWS

MAWS ran from a worktree created for this task (`/tmp/maws-cua-m3t4`, detached at MAWS `origin/master` `d45452f1`, `pnpm install --frozen-lockfile`, `pnpm build`), never the MAWS main checkout, on this Mac as in #113 M4/M5 and M2. The scratch home `/tmp/cua-m3t4-home` holds only an APFS clone of the installed runtime and `current.json`. The probe is #113's, unchanged. Host attestation uses `maws/attest-serve.mjs` and `maws/attest-summary.mjs`, copies of M2's extended (after the task review) so that each `cua serve` session also records, at spawn, its checkout, HEAD commit, clean-tree status, resolved runtime release and the own host's Node as `ownHostNode` resolves it from that child's environment (path and reported version). The summary requires exactly one such record per session, naming the expected commit with a clean tree. The probe's own assertions are unchanged. The records are written outside the checkout during the run (so the tree stays clean) and copied in afterwards. An earlier probe at `50d1170`, recorded with M2's identity-only recorder, also passed; it is superseded and not committed.

```
MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && /tmp/maws-review/with-slot.sh env MAWS_CHECKOUT=/tmp/maws-cua-m3t4 \
  CUA_HOME=/tmp/cua-m3t4-home CUA_BROWSER_SERVICE=cua CUA_REPL_HOST=cua CUA_SHIM_SURFACES=browser CUA_NODE=/opt/homebrew/bin/node \
  CUA_ATTEST_OUT=/tmp/m3t4/maws3/attest-cua.jsonl NODE_OPTIONS=--import=./docs/evidence/2026-10-14-own-repl-host-parity/m3/maws/attest-serve.mjs \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out /tmp/m3t4/maws3/maws-live-cua.json   # exit 0
node docs/evidence/2026-10-14-own-repl-host-parity/m3/maws/attest-summary.mjs /tmp/m3t4/maws3/attest-cua.jsonl 0.3.0 "$(git rev-parse HEAD)" \
  > /tmp/m3t4/maws3/attest-cua-summary.json                                                                            # exit 0; then copied into m3/maws/
cd /tmp/maws-cua-m3t4 && MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && /tmp/maws-review/with-slot.sh pnpm e2e:browser-cua   # 7 passed
```

Probe: verdict PASS, every maws-features step passing, the cursor moved. Takeover: at the default budget the click stops at 3,011 ms with `#state` waiting; with `{timeoutMs: 15000}` it goes through at 3,259 ms with `submitted:x`. The e2e group was run once, at `50d1170`; it never starts cua, so it was not repeated.

## Gates at `50d1170`

`gates-task4.json`: default Node 2,252 pass / 150 declared skips; `CUA_NODE` 2,326 pass / 76 declared skips (2,402 tests each, 0 failures); mods 32/32; M3 inventory gate 8/8; `claude plugin validate .` passes with its one known root CLAUDE.md warning; `npm pack --dry-run --json` ships 192 files, including `docs/cua-api/*`, `src/cua-api/*` with vendored Zod, and the Meriyah asset, and no test file.
