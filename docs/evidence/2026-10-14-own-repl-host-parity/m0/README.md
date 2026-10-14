# M0 vendor control for the M1 REPL host

These runs execute the pinned vendor host through the real cua proxy. They use an isolated no-services fixture, not the production facade or native UI. The suite is `cells --through M1`; every applicable M1 case is recorded. Ordinary raw cells use a no-op banner. One bootstrap-lifecycle probe uses a service-free Symbol witness so reset and timeout can prove that the banner ran again.

**Linux has a reproducible vendor safety defect. Zero differences does not mean that its safety assertion passed.**

## Evidence

- `vendor-1/`, `vendor-2/`: mini, profile `ssfs`.
- `linux-vendor-1/`, `linux-vendor-2/`: cua-linux, profile `me`, X display `:0`.
- Each run contains `meta.json`, `results.jsonl` and the effective MCP tool contract in `tools.json`.
- `mini-prepare/prepare.json` and `linux-prepare/prepare.json` record readiness and source/runtime facts.
- `mini-diff.json`, `linux-diff.json` and `summary.json` contain the verdicts and counts.
- `capability-lane-smoke.json` is a separate real-host/fake-backend startup check, not live Chrome or native API coverage.

Raw MCP results and external boundary observations are counted separately. Every actual connection has initialize serverInfo, real tool-result host attestation and observed execution provenance. Preflight refusals are explicitly labeled boundary observations; they do not invent host replies.

## The Linux sandbox defect

For `cells/confinement/no-unsandboxed-fallback`, a harness-owned executable replaces the sandbox launcher through the internal launch-fixture seam and exits 73. The mini refuses execution. The pinned Linux vendor host instead executes the cell unconfined: a write outside both the REPL cwd and TMPDIR succeeds. The file remains inside a private harness-owned directory and is removed during cleanup. The installed runtime is never patched.

The independent assertion remains literally `ok:false` in both Linux journals. It is tagged `linux-vendor-sandbox-launcher-fail-open`, with a declaration scoped to this case, Linux, the vendor host and runtime `26.928.40906-linux-arm64` in `test/repl-parity/vendor-defects.json`. Both controls must reproduce the same observation. A changed or undeclared failure still fails the run and comparison.

The Linux case counts as **recorded**, not covered-and-passing. `allAssertionsPassed:false` and the separate coverage counts make that distinction explicit. No expected-differences entry was added. M1's own host must refuse the failed launch; only after it passes may M1 add the approved case/platform/field-scoped security departure. This follows Decision Log ruling 172a6bb in `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md`.

`vendor-defects/linux-sandbox-launcher-failure.json` preserves the original diagnostic observation that established the defect.

## Exactness and safety

Only actual MCP image-content data is replaced with SHA-256 plus decoded dimensions/MIME. All non-byte item fields, optional-field absence, ordered content, structured content and metadata remain observable. Deterministic PNG/JPEG/WebP fixtures cover every included input and promised-input form. The existing average hash is reserved for explicitly live screenshot cases.

Execution durations remain in evidence but are excluded from semantic comparison. Declared proxy IDs are mapped by creation order. In the two controlled process-failure cases, comparison maps only the PID slots in the parsed vendor diagnostic suffix; raw diagnostic text remains in the journal. Error sentences, exit status, reason and other fields are not waived.

The observations contain synthetic output and image hashes, never owner window text or screenshot bytes. All process signals target a specifically identified kernel in the fixture's owned process tree. No shared helper or resident agent is stopped. The Linux stretch was released at `2026-10-14T21:21:39Z`.

## Reproduce

Use new output directories, a prepared profile, and the source commit recorded in each run's metadata:

```sh
node scripts/repl-parity.mjs prepare --device mini --commit 88970a0 --profile ssfs
node scripts/repl-parity.mjs prepare --device cua-linux --commit 88970a0 --profile me
node scripts/repl-parity.mjs run --host vendor --device mini --suite cells --through M1 --out /tmp/repl-mini-new-1
node scripts/repl-parity.mjs run --host vendor --device mini --suite cells --through M1 --out /tmp/repl-mini-new-2
node scripts/repl-parity.mjs diff /tmp/repl-mini-new-1 /tmp/repl-mini-new-2 --suite cells --through M1
```

Repeat the run/diff pair with `--device cua-linux`. Vendor determinism uses **no expected-differences file**; passing even an empty one is refused. A stale/dirty checkout or changed runtime/Node at startup is refused before coverage can be counted. Local runs are explicitly doubles only and do not use the controller Mac's installed runtime.

## Final recorded result

Both device pairs use source and harness commit `88970a0ab707a382eec09f7108ed7668020753ea`.

- Mini: 111 recorded and passing cases, 145 journal cells (134 raw MCP results and 11 boundary observations), 12 attested connections per run. Zero differences; all independent assertions pass.
- Linux: 112 recorded cases, **111 passing cases and one recorded vendor defect**, 146 journal cells (134 raw MCP results and 12 boundary observations), 12 attested connections per run. Zero differences; the declared safety assertion remains false in both runs.
- Each run contains 63 exact image observations and no raw image bytes. No M1 case remains pending.
- Launcher Node is v24.18.0 on mini and v22.23.3 on Linux; the observed pinned vendor Node is v24.21.0 on both. The own host's Node ≥24 requirement still applies when M1/M4 select it.
- Final local gates: 199 covering shared/repl tests passed; the full scratch-home suite passed 1774 tests with 0 failures and 8 skips; mods passed 32 tests. Plugin validation passed with its known warning: `root: CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.`
