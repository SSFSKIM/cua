# M6 evidence: packaging and acceptance of the native + secrets slice

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M6. Run on 2026-10-02, macOS 26 arm64,
host Node 22.23.2, Swift 6.3.3, pinned runtime `26.928.40906-darwin-arm64`, code at `d3bcc81` (the working tree
differed only in `tech-debt-tracker.md`). ChatGPT.app was installed and running throughout, and its helper served
every native request; nothing of it was stopped, read or modified. Paths: `$CUA_HOME` is a fresh
`mktemp -d /tmp/cua-accept.XXXXXX` home, deleted afterwards.

## Commands (Concrete Steps, as run)

```sh
export CUA_HOME="$(mktemp -d /tmp/cua-accept.XXXXXX)"
node bin/cua.mjs install --archive /Users/new/codex-app-src/_dist/ChatGPT-darwin-arm64-26.928.40906.zip   # 9 s
node bin/cua.mjs doctor --json        # exit 0
node verify.mjs                       # exit 0
node scripts/accept-native.mjs --report "$CUA_HOME/acceptance.json"                                  # 1 min 51 s
node scripts/accept-native.mjs --live-keychain --report "$CUA_HOME/acceptance-keychain.json"         # 2 min 2 s
node scripts/accept-native.mjs --live-textedit --report "$CUA_HOME/acceptance-live.json"             # 2 min 9 s
node scripts/accept-native.mjs --live-keychain --live-textedit --report "$CUA_HOME/acceptance-keychain-ui.json"  # 2 min 18 s
```

Every run also ran `npm test` and `npm run test:helper` in this checkout and, in a fresh `git clone` of the branch
under `/tmp/cua-clean.*` (removed afterwards), `npm test`, `npm run build:helper` and `npm run test:helper`. The
download-mode install was not rerun: `src/runtime/{install,checks,manifest,layout}.mjs` and `runtime/releases` are
unchanged since `bc315bc`, whose evidence (`docs/evidence/m2-installer.md`) is a byte-identical tree from the official
URL; the runner checks that with `git log` and would report BLOCKED with the rerun command otherwise. The manual
`secrets set` demonstration in Concrete Steps is human-only and was not run.

## Result per acceptance item

The four reports agree wherever they overlap; a skipped opt-in check is BLOCKED, never PASS.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Node-only `npm test`; actual Swift helper build and `test:helper` | PASS | 184/184 Node tests, no warnings; helper suite 55 Swift tests + 7 Node-driven executable tests; the same three suites in a clean clone (build from scratch 8 s) |
| 2 | Pinned install | PASS | active release = pin, installed from the archive; doctor's files/vendor-manifest/IPC/signatures (4 components, team `2DC432GLL2`) pass; reinstall returned `changed:false` and all 2947 entries of the release tree compared identical (type, mode, size, mtime, inode); bad hash/length/manifest/signature refusal by `npm test`; download mode cited (above) |
| 3 | `doctor --json` | PASS | exit 0, names the release; `helper.live` pass (reused helper), `helper.permissions` blocked, `secrets.helper` pass, `secrets.signing` blocked (ad-hoc), reported apart from runtime health; an empty home exits 1 with install guidance |
| 4 | `serve` + `verify.mjs` on relocated binaries | PASS | four tools; stable task ID across calls, `ended`, repeat `noop`; 8 processes (server, anchor, runtime under `$RUNTIME`), no installed-desktop path; the runtime's own `CODEX_HOME` holds no auth file and native read-only work succeeded without any account |
| 5 | Live native fixture (own TextEdit document) | PASS (with `--live-textedit`) | below |
| 6 | Secrets: TTY-only hidden set, label-only listing, live roundtrip | PASS (with `--live-keychain`) | `secrets set` without a terminal: exit 1 `[no_terminal]`, no item created; `secrets list --json` and MCP `secrets_list` return labels only; hidden input/restoration in `test:helper`; live roundtrip below |
| 7 | Substitution per method, rejection before dispatch, broker authentication | PASS | `npm test` (sky service, reference parser, trust roots, client, broker), `test:helper` (actual broker refuses forged/malformed/oversized requests), and the live probe's per-method steps |
| 8 | Lifecycle; native cancel/approval behaviour observed | PASS (approvals with `--live-textedit`) | lifecycle suites; live probe below; per-connection approvals below |
| 9 | Release gates | BLOCKED | four gates, each with the environment it needs (below) |
| 10 | Packaging, README, tracked files, clean checkout | PASS | below |

## Acceptance 6 live roundtrip (`--live-keychain`, `scripts/probe-secrets.mjs`): PASS

One uniquely labelled item (`cua-m5-probe-<uuid>`) held generated sentinels; it was created and replaced only through
the test-owned pty seeding fixture typing into the production `set`, and removed in `finally`; no other item was read
(the label list was empty before and after). Path: real runtime → trusted worker → `nativePipe` → production Swift
broker (real Keychain) → `src/services/sky.mjs` → a controlled fake sky target forwarding what it receives to a
probe-owned socket.

| Phase | Steps | Result |
|---|---|---|
| create | pty fixture, terminal restored, value not echoed | PASS |
| first substitution | `paste`, `type_text`, `set_value`: the target received exactly sentinel 1 in the eligible field only; the cell got no value | PASS |
| replace / second substitution | sentinel 2 stored; a new connection substituted exactly sentinel 2 | PASS |
| failure output stays value-free | induced failure (target throws an error carrying the request) → fixed `secret_input_failed (failed)`; cell timeout during a substituted call (node_repl logs the redacted cell source); real vendor failure after substitution → `secret_input_failed (invalidApp)` | PASS |
| fail closed before any input (new in M6) | through the fake target, each of the three methods with `CUA_SHIM_SECRETS=off` → `secrets_disabled`, and with no broker (`--no-helper`) → `secrets_unavailable (helper_not_built)`; the target received nothing in all six | PASS |
| ordinary input, unsupported method, unknown/invalid label, unsupported shape, planted modules | unchanged / literal / `secret_not_found` / `invalid_secret_label` / `unsupported_secret_shape` / `EPERM` ×4 | PASS |
| sentinel scan | neither value, raw or base64 at any alignment, in the MCP transport (both directions) and stderr (serve, anchor, runtime, node_repl, kernel, trusted worker, broker) of every connection, every file left under `$CUA_HOME/state` and `run` (read whole, none unread), or the report; scanner self-check passed | PASS |
| cleanup | the scenario-owned item removed, no longer listed | PASS |

No Keychain prompt appeared (the production helper created the item, so its own reads need none).

## Acceptance 5 live fixture (`--live-textedit`): PASS

- The fixture created an empty `$CUA_HOME/accept-textedit/cua-accept-<uuid>.txt`, opened it with `open -a TextEdit`,
  and through `cua serve` checked that TextEdit's front window was that document before typing anything.
- Connection A typed a benign marker (`CUAMARKER<hex>`); TextEdit's accessibility value read back exactly the marker
  and a screenshot was taken (JPEG, about 46-53 KB; only its size and format were recorded).
- Connection B bound TextEdit again, then `super+w` closed only that window (TextEdit autosaved it into the temporary
  file); TextEdit reported no windows left. The file and its directory were deleted.
- TextEdit was already running (a windowless instance an earlier exploratory run of this milestone had opened; see
  Concerns in the task report) and was left running; the fixture never quits TextEdit.
- Native helper: the existing one, pid 63982, `~/.codex/computer-use/Codex Computer Use.app/.../SkyComputerUseService`,
  before and after; reused, not started or stopped by cua. Cold start is not shown (item 9).
- Elicitations: exactly one per connection, `Allow Computer Use to use "TextEdit"?` with
  `_meta.tool_params.app = "com.apple.TextEdit"`, accepted for the session only (`CUA_SHIM_PERSIST=session`); no
  other request arrived (any would have been declined). The accept rule (`scripts/accept/lib.mjs`
  `isTextEditApproval`) requires the exact message, the bundle id as the only tool parameter, the computer-use
  connector and an empty requested schema; it lives only in the test harness.

With both flags the fixture also stored a disposable generated value (`CUAUI<hex>`, its own item, removed in
`finally`), typed `{{secret:<label>}}` with `typeText` through the real vendor sky service, checked that nothing
carried the value before readback (MCP transport and server/runtime stderr), and read the document back: the marker
followed by exactly the stored value. That readback is plaintext observation of the target, not confidentiality
evidence.

## Acceptance 8 observations

- `scripts/probe-lifecycle.mjs` matched M3's record: a forwarded cancel does not stop a running cell (it replied
  ~2.5 s after the cancel); `end_task` with work in flight rejects new work `task_ending` and ends after it; a cell
  outlasting the 5 s deadline fails closed (`completion_timeout`, `nativeCleanup:"unconfirmed"`, exit 1, no runtime
  process left); idle EOF closes in ~0.1 s with nothing left.
- Per-connection approvals: the vendor asked again on every new connection; while a connection was open its
  `state/codex/computer-use/sessions/<session id>.toml` existed, and after close it was gone (the server now removes
  its own connection's file; before M6 these accumulated: three were left by exploratory runs before the fix).
- No connection directory or broker endpoint was left under `$CUA_HOME/run` by any of the four runs.

## Acceptance 9 release gates: BLOCKED, each needing another environment or a human

| Gate | Why not shown here | Needed |
|---|---|---|
| Clean macOS machine/VM without the desktop app (install, permissions, native fixture, real Keychain substitution) | ChatGPT.app installed and running | a clean macOS arm64 VM or machine without ChatGPT/Codex; a human runs install, grants Accessibility and Screen Recording when asked, then `accept-native --live-textedit --live-keychain` |
| Cold start of the pinned native helper | the socket is held by `~/.codex/computer-use/.../SkyComputerUseService`; cua never stops another helper | the clean VM above, where the pinned helper's LaunchServices start is what serves |
| Fresh permission (TCC) onboarding | this account already granted the helper bundle id | a fresh macOS user account or VM, with a human answering the prompts |
| Stable helper signing and Keychain access across an upgrade | 0 Developer ID Application identities (1 Apple Development); the helper is ad-hoc | a Developer ID Application identity; release N and N+1 of the helper; an item created by N read by N+1 without a prompt |

## Acceptance 10 packaging: PASS

- README: standalone requirements and limitations (arm64 only, runtime pin and verification, permissions, no
  account, not-yet-shown release gates), install, plugin and plain-MCP registration (`claude mcp add` documented,
  never run), helper build/signing levels, acceptance commands, the Chrome phase as not available.
- Plugin: `node ${CLAUDE_PLUGIN_ROOT}/cua-shim.mjs`, no hooks. The owner's MCP registration was not touched; no
  tracked code runs `claude` or edits `~/.claude`.
- 96 tracked files: no archive, runtime tree, build output, credential, log, socket or pointer; no code or config
  names this user's home or holds a token-shaped string; nothing outside docs refers to the local research trees.
- `npm pack --dry-run`: 49 files, all tracked, none forbidden, including `native/keychain` sources and
  `scripts/build-helper.mjs` so a packed install can build its helper.
- Clean clone of the branch: `npm test` 184/184, `npm run build:helper` 8 s, `npm run test:helper` 55 + 7; removed.

## Findings during M6

- **TextEdit's own text system rewrites typed text.** With a lower-case marker, TextEdit's autocorrect offered to
  capitalize the first word and applied it when typing continued in the next connection, so the readback no longer
  matched; base64url values are also exposed to smart dashes (`--`) and word-boundary autocorrect. The fixture now
  uses single upper-case tokens, and the README says that `typeText` secrets are subject to an ordinary text view's
  substitutions (password fields do not do this).
- **TextEdit after its last document closes** briefly reports no front window, and later can show its Open panel. The
  close check retries the observation; the Open panel (a TextEdit window, not a document) may be left in front.
- **A failed assertion in an in-process `serve` test hung `npm test`** (server, anchor and fake runtime stayed alive),
  and the runner's timeout then killed only `npm`, orphaning `node --test`. Seen once during these runs while another
  load ran concurrently. Tests now end their input in an after hook (a deliberately failing assertion now fails in
  ~18 s instead of hanging), and the runner kills a timed-out step's whole process group. Wall-clock bounds in a few
  M3/M4 tests still fail under heavy concurrent load (tech-debt-tracker).
- **Stale `run/<uuid>` directories in the M2 scratch home** (`/tmp/cua-m2-archive.S4tI8P/run`, two, empty, created
  10:36 during M3's first fix wave): mode 0755, whereas `cua serve` always creates `run/<session>` 0700 (and chmods it)
  and removes it in `finally`, at every commit since `c1dc915`. No committed code path makes a 0755 `run/<uuid>`;
  M3's report records that its uncommitted raw experiments wrote under `run/` there. They were not left by the
  server. Only a SIGKILLed `cua serve` can leave its own (0700) directory and socket. That home is now deleted.

## Limits of this evidence

- Every native result used the owner's existing helper and grants; none of them is evidence for item 9.
- Unobservable channels (vendor telemetry, the native helper's own logs) are not claimed.
- The fixture's readback of a typed secret is target observation; confidentiality evidence is the fake-target scan.
- TextEdit may keep its own autosave/version data for the deleted temporary document (disposable marker and value
  only).
