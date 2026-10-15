# Own REPL host (#116): execution report

Executed by the plan-executor for the session that owns #116. Spec: `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md`.

## Status

| milestone | branch | PR | state |
|---|---|---|---|
| M0 | feat/own-repl-host | https://github.com/SSFSKIM/cua/pull/136 | merged (f87f9cc) |
| M1 | feat/own-repl-host-m1 | https://github.com/SSFSKIM/cua/pull/137 | merged (397d532) |
| M2 | feat/own-repl-host-m2 | https://github.com/SSFSKIM/cua/pull/139 | merged (5722341) |
| M3 | feat/own-repl-host-m3 | (PR pending) | whole-branch reviewer-high correct |

## Log

- 2026-10-14 pre-flight at 56f7b08 (base main fae28d6). Gates: `HOME=/tmp/cua-scratch-home npm test` 1704 pass / 0 fail / 8 skip; `npm run test:mods` 32; `claude plugin validate .` passed with the known warning ("root: CLAUDE.md at the plugin root is not loaded as project context..."). M0 split into five tasks (spec Decision Log); tasks 2 and 4 ran in sibling worktrees and were merged back.
- 2026-10-14 M0 task 1 (opus task-executor; sol task review clean first pass): HostSelection/HostIdentity, explicit refusals, Node resolution order (session ruling: CUA_NODE, process.execPath, PATH; first ≥24), handshake cache identity schema 2, explicit-only CUA_REPL_HOST persistence for launchd/systemd, doctor groundwork. 360-combination route matrix across both launch consumers and doctor.
- 2026-10-14 M0 task 2 (sol-xhigh executor; review clean first pass): inventory of 542 rows (222 members, 103 types, 169 behaviours, 48 secret boundaries), 520 case ids, test parsing Table 1 directly.
- 2026-10-14 M0 task 4 (sol-xhigh executor; review clean first pass): BenchmarkRun tuple journals and `--axis host` on both summaries; archived #113 service-axis outputs byte-identical. Attestation shape `hostAttestations:[{host,serverInfo,_meta}]` (session ruling).
- 2026-10-14 M0 task 3 (astra executor; four review waves): ParityRun harness, raw cells, exact image oracle incl. WebP, serve-cells lane, remote capability lane, boundary probes for the twelve M1 process-control/confinement cases (controller ruling: M0 owns the whole M1 vendor control). Review waves fixed field-dropping image normalization, diff subset selection, stale provenance, control-traffic and manifest exactness, capability cleanup, host-aware kernel targeting and a case-wide defect exemption. Discoveries: the vendor groups text per write name before images (spec revised, session ruling); the Linux vendor node_repl fails open when its sandbox launcher fails at runtime (declared vendor defect, own host must refuse; session registered hardening as #135). Final evidence at harness 88970a0: mini 111/111 passing, 0 differences; Linux 112 recorded / 111 passing (declared defect), 0 differences; 12 attested connections per run.
- 2026-10-14 M0 task 5 (opus task-executor; three review waves): native-baseline Linux/gedit adapter, `--host`, recorded sandbox, `compare` with acceptance 8's verdict and coverage checks. Three Linux vendor runs at 5 cold/30 warm/10 task, 18 vendor attestations (rmcp 1.5.0), sandbox disabled, no errors. typeText/paste crash gedit 46.2 with D-Bus NoReply (earlier evidence: os error 11).
- 2026-10-14 M0 whole-branch reviewer-high (fae28d6..fe2b224): four P2 (candidate-only cold cleanup failures passed compare; mixed host versions passed bench attestation; CUA_NODE dropped by the parity fixtures; unquoted sandbox sentinel path), fixed in ad21892 by one fixer; re-review "correct". Gates at the head: `HOME=/tmp/cua-scratch-home npm test` 1823 pass / 0 fail / 8 skip; `npm run test:mods` 32; `claude plugin validate .` passed with the known warning. Committed pairs re-diffed: mini 111 cases / 145 cells, 0 differences; Linux 112 recorded / 111 passing / 146 cells, 0 differences, one declared vendor defect.

- 2026-10-14 M1 in two tasks (opus task-executors, sol task reviews). Task 1 (kernel port, vendored Meriyah 7.0.0 byte-identical to the embedded copy, base worker runtime, owned `CUA_REPL_*` names): clean first pass. Task 2 (supervisor, HostMcp, timers/fencing, grouped assembly, lifecycle, buildLaunch/sandbox wiring, launcher-failure refusal, serverInfo `cua-repl-host 0.2.0` and result marker, live cells on both devices): two fix waves (security-departure deleted whole rows; dead-launch descendants escaped cleanup; SIGTERM could not preempt an EOF drain; own Node unrecorded; then shutdown resolved before forced cleanup and the reaper killed live-worker descendants). Session rulings: effective tool text moves to M2; executors must not change device-global configuration (the VM `~/.bashrc` CUA_NODE block was reverted; the harness passes CUA_NODE, recorded by `prepare --node`). Live at 8f56fb5: mini 111/111, 0 unexpected differences (134 identity slots); cua-linux 112/112, 0 unexpected (134 identity slots + the #135 security departure); default 30 s timeout exercised on both.
- 2026-10-14 M1 whole-branch reviewer-high (f87f9cc..f2215d2): two P2 (termination not rechecked after a policy-change stop; unsafe marker path in a supervisor test), sent to the task 2 executor; fixed in dc7a86d (evidence not re-recorded: neither change is reachable by the cells suite; README names 8f56fb5); re-review "correct". Gates at the head: plain `npm test` 1860/0/48 (own-host tests skip visibly on PATH Node 22), with `CUA_NODE=/opt/homebrew/bin/node` 1900/0/8; test:mods 32; validate ok with the known warning; extract-meriyah clean.

- 2026-10-14 M2 in three tasks.
  - **Task 1, the vendor oracle** (astra executor in a sibling worktree, sol task reviews; two waves):
    - Built: services suite of 41 cases; `browser-parity --repl-host`; effective-tools control with an independent Table 2 transform; identity allowances pinned to the attested source.
    - Review fixes: duplicate turn acknowledgements, and a nativePipe error that the oracle never stimulated.
    - Vendor pins: bare elicitation suspends the budget; response meta merges; duplicate acks wait for shared completion; a macOS peer abort yields close only.
    - Rulings: macOS nativePipe timeout expiry and error ordering are proven by a unit test and a labelled worker-stdin injection.
    - Result: vendor pair 41 cases / 74 cells, 0 differences, no allowances.
  - **Task 2, the port** (opus):
    - Built: trusted worker, privileged runtime, relayed nativePipe, elicitation, budgets and hooks, turn deduplication, effective tool text via `CUA_REPL_TOOL_OVERRIDES`, `REPL_HOST_VERSION` 0.3.0.
    - One review wave: worker reaping killed the live kernel, and pending nativePipe connects survived closeAll.
  - **Task 3, live runs** (opus, task 2's executor resumed):
    - Vendor-matching changes: elicitation suspension, meta merge, close-only nativePipe.
    - Found the macOS sandboxed time-zone lookup hang: vendor 4/30 runs, own about 11% before the fix. Fixed with a time-zone warm at runtime load and `runtime_ready` child replacement; a 600-run stress test showed 0 hangs. The session registered it as #138.
    - Bounded unanswered hooks and `turn_ended`.
    - Host-comparison trace allowances, scoped by method and maximum delta from vendor-against-vendor spread: wait-for, slow-budget, coordinates drag, networkidle. M3 must derive these mechanically.
    - The EOF drain for a suspended service request is deferred to M3.
    - Environment: Downloads TCC consent was pending and ssfs went `host_not_live` twice; the session and the owner resolved both.
  - **Final evidence:**
    - services 41 / 0 differences;
    - tools 0 differences, with only the Table 2 allowance;
    - corpus 59/59 per host at e4ea7eb, 0 unexpected, 7 expected trace counts;
    - MAWS live probe PASS with the own host attested; `e2e:browser-cua` 7/7.
- 2026-10-14 M2 whole-branch reviewer-high (397d532..2d4378a): two P2s, sent to the task 3 executor.
  - Worker death left its timeout suspensions in place.
  - Host-only trace allowances could be applied to a vendor-against-vendor diff.

- 2026-10-15 M2 whole-branch fixes in bb3d59a: a dying worker's open timeout suspensions are released, and host allowances apply only to an attested vendor-host vs cua-host pair. Nothing was re-recorded, because no recorded case reaches the worker-death-during-suspension path. The re-review verdict is "correct". Gates at 0bc6f6b: plain `npm test` 1918 pass / 0 fail / 70 skip; with `CUA_NODE`, 1980/0/8; test:mods 32; validate ok with the known warning; corpus diff with `--expected`: 0 unexpected (59 cases, 151 cells, 7 expected). PR #139.

- 2026-10-15 M3 in four tasks.
  - **Task 1, the oracle** (astra executor in a sibling worktree, sol task reviews; four waves):
    - Built: api (290 cases), secrets-live (25), docs-profiles (12), and a trace tolerance derived from vendor-against-vendor pairs that replaces M2's hand-written allowances.
    - Rules added: the completeness gate with unit-proof references; `--suite all` live-only.
    - Review fixes:
      - empty, deleted and malformed target traces;
      - download cleanup moved out of the kernel;
      - locator guards, diagnostics and caches;
      - malformed recovery envelopes;
      - export success;
      - decoded screenshots;
      - RPC-sorted diagnostics;
      - WebMCP id projection.
    - Vendor controls at d75a105: three pairs, each 0 differences with no allowances.
  - **Task 2** (opus; one wave):
    - Built: the bounded EOF drain, then the browser-client port with vendored zod 3.25.76.
    - Review fixes: hook bounds registered late are now honoured during the drain; the eviction scenario is no longer vacuous.
  - **Task 3** (opus; clean): the owned facade and CuaBootstrap, and core.md. The owner later approved a two-sentence grammar amendment to Table 3, which the facade and the oracle both apply independently.
  - **Task 4** (opus; one wave):
    - Results:
      - own host against the M3 controls: 0 differences on all three suites (identity slots only);
      - tools contract 0;
      - fresh corpus pair 59/59, with 0 unexpected and 0 expected;
      - MAWS probe PASS, with per-session source records after the review; `e2e:browser-cua` 7/7.
    - Corpus download guards accept Chrome's timestamp collision name.
    - Rulings: `REPL_HOST_VERSION` is bumped at M4; browser-id mapping and locator calibration become oracle inputs for M4/M5.
- 2026-10-15 M3 whole-branch reviewer-high (5722341..3cf0469): "correct", no material findings. Task 4 review fix (MAWS per-session source records) re-reviewed clean. Gates at the head: plain `npm test` 2252/0/150; with `CUA_NODE` 2326/0/76 on re-run (first run had one load-sensitive failure at load average ~37, tracked in tech-debt-tracker.md); test:mods 32; validate ok with the known warning.

## Environmental friction

- The Agent tool has no effort parameter; agents ran at their defaults.
- sol-xhigh and astra executors decline to write report `.md` files (their system notes forbid it); the controller transcribed their handbacks into the SDE workspace.
- Some executors' messages to `main` reached the dispatching session rather than the controller; VM handoff crossed once (task 5 ran one smoke run at 58d42b6 before its fixes; cleaned up, not evidence).
- The cua-linux VM's Chrome was not running at first, and the mini's Profile 1 window closed once; the session restored both.
- Local `node --test test/repl-parity/` fails on Node 22 (directory argument); use a glob.
- 2026-10-14 (M2): the mini's Downloads privacy consent for the ssh session had to be granted by the owner (as in #113 M3); ssfs went host_not_live twice when the Profile 1 window closed, and the session reopened it each time. The harness forced several interim handbacks while executors ran; the session resumed the controller each time.
