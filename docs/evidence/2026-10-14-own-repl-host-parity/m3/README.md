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
