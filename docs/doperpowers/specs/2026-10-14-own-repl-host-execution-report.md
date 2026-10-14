# Own REPL host (#116): execution report

Executed by the plan-executor for the session that owns #116. Spec: `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md`.

## Status

| milestone | branch | PR | state |
|---|---|---|---|
| M0 | feat/own-repl-host | pending | whole-branch review |

## Log

- 2026-10-14 pre-flight at 56f7b08 (base main fae28d6). Gates: `HOME=/tmp/cua-scratch-home npm test` 1704 pass / 0 fail / 8 skip; `npm run test:mods` 32; `claude plugin validate .` passed with the known warning ("root: CLAUDE.md at the plugin root is not loaded as project context..."). M0 split into five tasks (spec Decision Log); tasks 2 and 4 ran in sibling worktrees and were merged back.
- 2026-10-14 M0 task 1 (opus task-executor; sol task review clean first pass): HostSelection/HostIdentity, explicit refusals, Node resolution order (session ruling: CUA_NODE, process.execPath, PATH; first ≥24), handshake cache identity schema 2, explicit-only CUA_REPL_HOST persistence for launchd/systemd, doctor groundwork. 360-combination route matrix across both launch consumers and doctor.
- 2026-10-14 M0 task 2 (sol-xhigh executor; review clean first pass): inventory of 542 rows (222 members, 103 types, 169 behaviours, 48 secret boundaries), 520 case ids, test parsing Table 1 directly.
- 2026-10-14 M0 task 4 (sol-xhigh executor; review clean first pass): BenchmarkRun tuple journals and `--axis host` on both summaries; archived #113 service-axis outputs byte-identical. Attestation shape `hostAttestations:[{host,serverInfo,_meta}]` (session ruling).
- 2026-10-14 M0 task 3 (astra executor; four review waves): ParityRun harness, raw cells, exact image oracle incl. WebP, serve-cells lane, remote capability lane, boundary probes for the twelve M1 process-control/confinement cases (controller ruling: M0 owns the whole M1 vendor control). Review waves fixed field-dropping image normalization, diff subset selection, stale provenance, control-traffic and manifest exactness, capability cleanup, host-aware kernel targeting and a case-wide defect exemption. Discoveries: the vendor groups text per write name before images (spec revised, session ruling); the Linux vendor node_repl fails open when its sandbox launcher fails at runtime (declared vendor defect, own host must refuse; session registered hardening as #135). Final evidence at harness 88970a0: mini 111/111 passing, 0 differences; Linux 112 recorded / 111 passing (declared defect), 0 differences; 12 attested connections per run.
- 2026-10-14 M0 task 5 (opus task-executor; three review waves): native-baseline Linux/gedit adapter, `--host`, recorded sandbox, `compare` with acceptance 8's verdict and coverage checks. Three Linux vendor runs at 5 cold/30 warm/10 task, 18 vendor attestations (rmcp 1.5.0), sandbox disabled, no errors. typeText/paste crash gedit 46.2 with D-Bus NoReply (earlier evidence: os error 11).

## Environmental friction

- The Agent tool has no effort parameter; agents ran at their defaults.
- sol-xhigh and astra executors decline to write report `.md` files (their system notes forbid it); the controller transcribed their handbacks into the SDE workspace.
- Some executors' messages to `main` reached the dispatching session rather than the controller; VM handoff crossed once (task 5 ran one smoke run at 58d42b6 before its fixes; cleaned up, not evidence).
- The cua-linux VM's Chrome was not running at first, and the mini's Profile 1 window closed once; the session restored both.
- Local `node --test test/repl-parity/` fails on Node 22 (directory argument); use a glob.
