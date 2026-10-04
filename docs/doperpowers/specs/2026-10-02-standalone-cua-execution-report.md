# Execution report: standalone CUA runtime and Keychain secrets (phases A+B)

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md` (its Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective are the full record). Branch `feat/standalone-runtime`, checkout `/Users/new/Developer/GitHub/cua`, range `d936354..a253a68` plus this report's commit. Not pushed; no PR; no npm publication; no MCP registration changed.

Status: DONE_WITH_CONCERNS. Every milestone is implemented and reviewed clean. The concerns are the four acceptance-9 release gates this host cannot prove, and a TextEdit process left running (below).

## Milestones

| Milestone | Commits | Review |
|---|---|---|
| M1 runtime portability + wrapper seam probe | `364a8b6` | astra-high, clean |
| M2 pinned installer, resolver, doctor, `buildLaunch` | `01eaae8`, fix `bc315bc` | astra-high, clean after 1 fix wave |
| M3 standalone MCP + explicit tasks | `c1dc915`, fixes `78eedb1`, `51c4f1a` | astra-high, clean after 2 fix waves |
| M4 Swift Keychain helper + private broker | `52a511b`, fix `9dc389d` | astra-high, clean after 1 fix wave |
| M5 trusted native substitution | `0972ce1`, fix `a55fee9` | astra-high, clean after 1 fix wave |
| M6 packaging + acceptance | `d87d450`..`3ba5244`, fixes `ca785ee`, `9d1e51c`, `98e6d0d` | astra-high + whole-branch `doperpowers:reviewer-high`, both clean after one consolidated fix wave |

Executors were `doperpowers:task-executor` (opus). Per-milestone reviewers ran on `astra-high` with the task-reviewer rubric, as the user asked. The final whole-branch review was `doperpowers:reviewer-high`; its verdict after the fix was "correct, no material findings".

## Tests (verified in this session at the final head)

- `npm test`: 188/188 passed, 0 skipped, 0 TODO. It is Node-only and does not need Swift, a GUI, the network or credentials.
- `npm run test:helper`: the actual Swift helper passed, with Swift suites green and 7/7 Node-driven executable tests. It runs on injected storage and pseudo-TTYs, with no Keychain access.
- Clean clone (run by M6's acceptance runner, then deleted): `npm test`, `npm run build:helper` and `npm run test:helper` all passed.

## Acceptance (final combined run: `--live-keychain --live-textedit`, fresh scratch home, code `9d1e51c`)

| # | Result | Note |
|---|---|---|
| 1 | PASS | Node suite and actual Swift helper suite, each with positive executed coverage |
| 2 | PASS | Local-archive install verified and idempotent across 2947 entries. Download mode is cited from M2 (byte-identical tree); install code is unchanged since `bc315bc` |
| 3 | PASS | doctor names the release. Permissions and signing show as `blocked`, separate from runtime health |
| 4 | PASS | Four tools. Every owned process runs from the relocated release, none from an installed-desktop path |
| 5 | PASS | Own temp TextEdit document: marker typed and observed, closure confirmed |
| 6 | PASS | Real Keychain → broker → trusted wrapper → controlled target. Covers create, substitution with all 3 methods, replace and re-substitute; induced and real-vendor failures stay value-free; fails closed when secrets are off or the broker is absent; only the owned item is cleaned up. UI delivery also passed, recorded as target observation and not as confidentiality evidence |
| 7 | PASS | Per-method expansion and rejection before dispatch; broker refuses forged, malformed and oversized requests |
| 8 | PASS | Lifecycle suites pass. Live: forwarded cancellation does not stop a running cell; the TextEdit approval is asked once per connection; the session file is removed at close |
| 9 | BLOCKED ×4 | See below |
| 10 | PASS | README, package `files`, clean checkout; no archive or secret is tracked |

Helper evidence by run: pid 34706 served M1-M5 and pid 63982 served M6, both the owner's existing `~/.codex/computer-use/Codex Computer Use.app` helper. It was reused every time and never started or stopped by us.

## Remaining manual gates (acceptance 9, BLOCKED)

1. **Desktop-absent clean machine.** Needs a macOS machine or VM with no ChatGPT/Codex installation, to run install, grants, the native fixture and real Keychain substitution.
2. **Cold start of the pinned helper.** Needs an environment where no other helper holds the fixed per-user socket. The pinned and installed binaries share CDHash and bundle id, so this host cannot tell them apart.
3. **Fresh TCC onboarding.** A human must grant Accessibility and Screen Recording on a fresh machine or account. Existing grants here apply automatically.
4. **Stable release signing across upgrade.** Needs a Developer ID Application identity to sign the helper, then a check of Keychain ACL behaviour across a helper upgrade. Only Apple Development and local identities exist here; the checkout helper is ad-hoc. Apple Development signing ran without prompts, and Keychain trust followed the designated requirement.

## Concerns

- **TextEdit pid 33371 is still running, with no documents.** The M6 executor started it in an early exploratory run. Its attempt to quit TextEdit was denied by the permission classifier, so it was not retried or delegated. The owner can quit it.
- Open debt is in `tech-debt-tracker.md`, all minor:
  - stale `node_repl` active-exec records after a forced teardown;
  - wall-clock test bounds that flake under heavy concurrent load;
  - no final reap deadline in the acceptance session teardown.

## Deviations from the spec text (each recorded in the Decision Log)

- `buildLaunch` also returns an owned `cwd`.
- A server-owned anchor process leads the runtime's process group to prove ownership.
- `state/codex` is removed from the trusted code paths, unlike the vendor recipe.
- `CUA_SHIM_SECRETS=on|off` was added; the parent confirmed it.
- `serve()` has a non-CLI `prepareLaunch` test seam.

## Environmental friction

- `master` does not exist in this clone; the base branch is `main`. The whole-branch review used the implementation base `d936354`.
- A reviewer's stalled Node-only fixture (its own processes, no vendor code) was terminated by the controller after verification with `ps`.

## Residue (candidate tickets)

- **Phase C, existing-profile Chrome bridge.** The spec retains this design and it is approved. Its first step is the seam test of the Playwright extension transport against the CUA browser backend protocol.
- **Acceptance-9 release run.** Needs a clean macOS VM, a fresh-TCC user session, and a Developer ID identity for stable helper signing and upgrade ACL testing. This needs the owner's participation.
- **Test-timing hardening.** Measure the lifecycle and broker boundedness tests against injected budgets rather than absolute wall-clock times, so they stop flaking under load.
