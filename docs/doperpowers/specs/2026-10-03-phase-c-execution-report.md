# Phase C execution report (M11–M13)

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md` (dispatched at `287b789`). Branch `feat/chrome-existing-profile`, checkout `/Users/new/Developer/GitHub/cua`. Commit range `287b789..1d604ac` (plus this report's commit). Not pushed; no PR; nothing published; MAWS and the owner's MCP registration untouched.

## Status

DONE. All three milestones are reviewed clean and ticked in the spec's Progress. Final `node scripts/accept-chrome.mjs --all --c2-report /tmp/cua-accept-chrome.json --c6-report /tmp/cua-c6-replace.json` on the default `CUA_HOME` at `be63a0a`: **C1–C7 PASS** (exit 0). Tests at `1d604ac`:
- `npm test` 341/341;
- `npm run test:helper` Swift 55 + Node 7 (this checkout's helper not rebuilt; sha256 unchanged);
- probe suites 42/42, 11/11, 15/15;
- clean clone (C7): npm test, the helper suites and `npm pack --dry-run` (60 files, nothing forbidden).

## How it ran

Controller: doperpowers:subagent-driven-execution. Opus `task-executor` per milestone; frontier reviews on `astra-high` with the task-reviewer rubric; the whole-branch review on `doperpowers:reviewer-high`. Ledger: `.doperpowers/sde/2026-10-02-standalone-cua-design/progress.md` (gitignored), with per-task reports `task-11/12/13-report.md` beside it.

- **Pre-flight** (`b8b7f1a`, parent-approved):
  - the live boundaries copied into the spec;
  - `profiles bind --extension-instance-id` as the non-interactive form of the user's explicit pick;
  - M12 host placement as an additive, separately recorded release component, because the release tree is immutable and reinstall never repairs in place.
  
  `c5e0e27` is mislabelled: it accidentally carried part of the parent's concurrent spec-review edit. The absorption itself is `b15156c`, and the mislabel is noted in the Decision Log.
- **M11** (browser surface, trusted browser secret wrapper, profile registry, `profiles_list`, doctor checks, C2 runner): code `bc16f1d`..`c9d1632`. One frontier fix wave (`7ce9643`, `bceb499`):
  - a declined prompt now latches a stop;
  - cleanup runs in `finally` with honest leftover reporting;
  - bind refuses after unconfirmed teardown;
  - an explicit pick is kept when the profile's own name is unknown.
  
  The live run found a pinned-shape gap: the vendor transport adds `client_timeout_ms`. The fix is `1f0cae6`, which I reviewed myself.
- **M12** (Chrome plugin component, `cua chrome register|unregister`, doctor `chrome.host.config`): `389ac71`, `171bf56`. Three frontier fix waves, all in registration:
  - `2d7928f`: no-clobber link(2) publish, announcement at the actual replacement, exact host ownership, per-browser restore failures;
  - `96714da`: compensated takes;
  - `1aa9437`: classified mismatch rollback, verified by me (narrow).
- **M13** (`accept-chrome --all`, README, tech debt): `d52482c`..`8d16f77`, then `be63a0a`, `530f9fc` after the live parts.
- **Whole-branch review** (`reviewer-high`, `63fe70d..e92115d`): verdict "incorrect", three P2. One consolidated fix wave (`39310ba`, `60a1148`):
  - restore only with a recorded hash;
  - undo earlier slots when a later slot forces a refusal;
  - every C2 step's failure stops later input.
  
  The re-reviews found two narrow regressions in the new undo path. `eb5ead6` keeps recovery data until an undo is confirmed. `f0a7925` keeps cleanup inside the per-browser boundary; I verified it myself and closed the loop there.

## Live results (default `CUA_HOME`, user's own Chrome)

- **Profiles:** `personal`→Default, `work`→Profile 8, `school`→Profile 6 registered; work and school are not ready (extension absent; never installed). C3's `remove school` ran on the real registry and was re-added afterwards, so all three keys remain.
- **Bind:** the vendor's enrichment never labelled a backend, so the automatic branch was always undetermined. Every bind was the user's explicit pick, relayed by the parent:
  1. The first pick (`77fc…`) was refused `profile_not_ready`: the OpenAI extension had disappeared from Default (Extensions dir modified 2026-10-03 16:17 local).
  2. After the user reinstalled it, they picked `8342…`.
  3. After the `--replace` toggle minted a new id, they picked `94c9fc71…`, which is the current binding.
- **C2:** the first run failed closed at the fill (`unsupported_secret_shape`, nothing entered; root cause `client_timeout_ms`). One rerun after `1f0cae6` passed **17/17**:
  - the page digest matched the sentinel;
  - the induced failure was value-free;
  - screenshot 16886 B, sha256 `544db26f…189b`;
  - no sentinel in the MCP transport, stderr, the screenshot or `$CUA_HOME/state` (auth.json excluded by name, never opened);
  - one own-origin elicitation accepted with `persist:"session"`;
  - leftover none.
- **Cold start (acceptance-9 observation): PASS.** One `probe-runtime.mjs --variants none` (a single read-only `getState`) with the desktop closed. The vendor launched the release's own pinned `SkyComputerUseService` (pid 53082) through LaunchServices, with IPC `CodexComputerUseIPC-5`. No prompt appeared, existing grants applied, and no helper was stopped. Fresh-TCC onboarding and desktop absence remain unproven (same bundle id and CDHash as the desktop's copy). The combined-surface `verify.mjs` cannot observe a cold start, because its cells never contact the helper.
- **M12 non-replace:** placement added 451 entries under `chrome-plugin/` with no existing file changed. `register` refused (desktop manifests), `unregister` was a no-op, and all 8 desktop manifests kept their hash, mtime and inode.
- **`--replace` gate (user GO):**
  - Five manifests were backed up and replaced after the consequences printed.
  - On the user's toggle, Chrome launched **cua's placed host** (pid 79354, from `cua/runtimes/…/chrome-plugin/`).
  - The toggle minted a new instance id, so the first round trip stopped at selection.
  - `unregister` restored all five manifests byte-for-byte: sha256 `58b89252…04b6` equal to the pre-step hash, and `cmp`-identical to a reference copy.
  - A single-socket listing then proved `94c9fc71…` is served by host 79354. After the rebind, the round trip through that still-running host passed **17/17** (screenshot 18557 B, sha256 `6f26f242…3ffa`, leftover none), with the registration back on desktop throughout.
  - Caveat: Chrome launched the host while cua's manifest was registered, and the round trip ran after the restore.

## Decisions and discoveries

All are folded into the spec's Decision Log and Surprises (2026-10-03/04 entries); the main ones:
- Registered trusted services equal the enabled surfaces exactly.
- The vendor version pin is checked only on substituted calls.
- Post-substitution failures from both channels are thrown as one fresh classification.
- `client_timeout_ms` is part of the pinned shape.
- Readiness is computed on each request.
- The Chrome plugin is placed whole (its scripts need `../node_modules` and wasm), at `runtimes/<release>/chrome-plugin/` with its own `component.json`. Its config names the plugin's own browser scripts, which differ from `cua_node`'s copies.
- Registration rules: refusal is all-or-nothing, writes never clobber, restore requires the recorded hash, an incomplete undo is `registration_partial`, and a run still contended after three attempts is `registration_contended`.
- An extension toggle or reinstall mints a new instance id, so bindings go stale.
- A running host keeps serving after its manifest changes, until the extension reconnects.

## Environmental friction routed around

- The harness forced two mid-run hand-backs while M12 was running, and the M12 executor stalled for about 75 minutes before being resumed by message. No work was lost.
- The user's Chrome was closed at first, and the Default profile lost and regained its extension during the run. Both were resolved through the parent, by the user.

## Unresolved review findings / deferred

- Ledger Minors still open from phases A+B (M2–M5) are unchanged in the tracker.
- New tech debt (in `tech-debt-tracker.md`): `--all` cannot tie a supplied live report to a commit; verify's `run/` leftover check also sees other connections in the same home; two runner helpers are duplicated from `accept-native.mjs`.
- The M11 "other-profile" label minor was fixed (`d52482c`).
- **Post-PR panel review (2026-10-04, `review-code` max over `54cf811..a4dbe5c`):** 10 confirmed findings (1 P1: binding ignored the backend's browser family; 9 P2 across runtime activation, doctor, helper distribution, MCP teardown, registration concurrency and profile compare-and-set), all fixed in three parallel waves (`4cf2ceb..`), `npm test` 366/366. The secret-substitution lens confirmed nothing. Details in the spec's Decision Log (2026-10-04, PR #1 panel review fold-back).

## Residue (candidates for tickets)

1. **Clean-machine release gate: closed for desktop absence and fresh permissions (2026-10-05, issue #9).** The run was in a macOS 27.0 VM with no ChatGPT app, never signed in to Codex, and fresh permissions; the evidence is `docs/evidence/clean-machine-acceptance.md`. It showed:
   - `cua install` (download mode) and `accept-native` items 1 and 3–8 PASS.
   - The pinned helper started from cua's release tree through LaunchServices, with the Accessibility and Screen Recording prompts attributed to it and granted once.
   - The desktop-absent Chrome gate passed, and `accept-chrome --all` C1–C7 PASS with cua's own host registered as the steady state.

   Developer ID signing of the Keychain helper remains open (#14). The earlier coexistence run is `docs/evidence/second-mac-acceptance.md`.
2. **Stale-binding readiness:** resolved on `fix/stale-binding-readiness` (`941b42a`): readiness checks the bound id against the live backends (`binding_stale`, `backends_unlistable`), and `bind` marks a stale id while the pick stays the user's (spec Decision Log, 2026-10-04).
3. **Vendor profile enrichment never labels backends here** — diagnosed 2026-10-05 (spike #8): not Full Disk Access (hypothesis refuted) but node_repl's default sandbox, which denies writes even to temp directories because cua sends no `codex/sandbox-state-meta`; the enrichment fails at `mkdtemp`. With the sandbox disabled the label appears (`profileName: "ucsd.edu"` for Profile 12). Follow-ups: cua-side candidate labelling by profile directory; owner decision on the sandbox metadata (spec Surprises and Decision Log, 2026-10-05).
4. **User-tab operations, downloads, dialogs, frames and Chrome tab-group side effects** are untested on the original route.
5. **The Playwright route's parking status** (`wip/m8-playwright-transport`): keep, retire or document as the login-free alternative.
6. **Phase D:** the MAWS in-app-browser adapter.
7. **Remote control (logged 2026-10-05, owner's question; not addressed):** can `cua serve` drive a remote Mac's GUI and its Chrome tabs? cua_repl itself only reaches local sockets (the native helper's group-container socket, the Chrome hosts' `/tmp/codex-browser-use` sockets), so this is an MCP-transport question (`cua serve` on the remote machine, stdio forwarded over SSH) plus the console-session constraints seen on the second Mac (Keychain and permission dialogs need the GUI session, not an SSH session).
8. **Linux (logged 2026-10-05, owner's question; not addressed):** the vendor's cua_repl carries Linux code paths; whether a Linux `node_repl` and computer-control service are shipped in any obtainable archive, and under what pin, is the research question. The current pin is darwin-arm64 only.
9. **Independence from the ChatGPT extension (logged 2026-10-05, owner's question; not addressed):** our own extension (or extension + host pair) speaking the native-messaging protocol the host expects. The parked Playwright route (`wip/m8-playwright-transport`, item 5) is one form of this; decide them together.
10. **Chrome host lifetime (logged 2026-10-05, second Mac):** the OpenAI Chrome host often exited within about a minute of the extension waking, while on the first Mac hosts stay up for hours (desktop 26.924 vs 26.930, same extension). Users may have to wake the extension right before the agent's first browser call. Diagnose; consider having cua detect "no live host" and tell the user exactly that.

## Open gates

None remain in Phase C acceptance on this Mac. The release gates outside it stay open: clean machine, fresh TCC, Developer ID signing, desktop absence.
