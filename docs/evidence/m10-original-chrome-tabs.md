# M10 evidence: the server's own Codex login and the owned-page probe on the original Chrome route

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M10. Branch `feat/chrome-existing-profile`.
macOS 26 arm64, host Node 22.23.2, pinned runtime `26.928.40906-darwin-arm64`, bundled `codex-cli 0.159.2`.

## Part A (2026-10-02/03, executor; no human step)

No `codex login` ran, no credential was read or copied, `CODEX_HOME` was never `~/.codex`, and the live `--with-tabs`
probe did not run. No Chrome, registry, native-messaging or manifest file was written; no process was stopped.

### First real install into the default home

```sh
env -u CUA_HOME node bin/cua.mjs install --archive /Users/new/codex-app-src/_dist/ChatGPT-darwin-arm64-26.928.40906.zip --json
env -u CUA_HOME node bin/cua.mjs doctor --json
env -u CUA_HOME node bin/cua.mjs login --status
```

- Install: `ok: true`, release `26.928.40906-darwin-arm64`, `changed: true`, `source: archive`, root under
  `~/Library/Application Support/cua/runtimes/`. The home and its entries are 0700/0600.
- Doctor: exit 0, `ok: true`. `pass`: platform, runtime.installed, runtime.files, runtime.vendor-manifest,
  runtime.ipc (`CodexComputerUseIPC-5`), runtime.signatures (4 components, team `2DC432GLL2`), helper.live (the
  desktop's existing helper, version 26.929.1001365, reused as-is), secrets.helper. `blocked`: helper.permissions,
  secrets.signing (ad-hoc helper), **codex.login**.
- `codex.login` was first `blocked` with "the owned CODEX_HOME does not exist yet" (nothing was run). The owned
  `state/codex` was then created 0700 (as `cua serve`/`cua login` create it) so the real CLI could be asked once:
  `codex login status` exited 1, mapped to `blocked` "codex login status reports no login; ... run cua login", and
  `cua login --status` exited 1 with "the cua server has no Codex login in its own CODEX_HOME; run `cua login`". The CLI
  left only a `tmp/` directory in the owned home (the per-launch arg0 directory M1 saw).

### M9 regression re-run (once)

```sh
CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-chrome-original.mjs --live --report /tmp/cua-chrome-original-live-m10regress.json
```

7/7 PASS, identical to M9: 2 hosts / 2 sockets, both listed `extension`/`chrome` (`profileName` absent), both `listTabs`
refused `identity-or-auth` "Codex auth token is unavailable", 0 elicitations, cells `listBrowsers, listTabs, listTabs`,
`tabOperations: 0`, teardown confirmed with 0 leftovers, hosts still running. This path still uses an empty scratch
`CODEX_HOME` (removed afterwards); the default home's `state/codex` was untouched by it.

### `--with-tabs` fixtures

```sh
node scripts/probe-chrome-original.mjs --fixtures --report /tmp/cua-chrome-original-fixtures.json   # 11/11 PASS, ~2 s
node --test 'scripts/probe/chrome/original/test/*.test.mjs'                                         # 41/41
npm test                                                                                             # 200/200
```

(The M9 evidence's `node --test scripts/probe/chrome/original/test/` directory form does not resolve on Node 22.23;
the glob form above runs the same files.)

The fixtures drive the real anchor, test page, session, cells, elicitation policy, leftover accounting, judge and
report reduction against `fake-runtime.mjs`, which runs each cell for real against a fake `cua` API seeded with
sentinel user-tab titles/URLs, a token and a host socket path in its error texts:

| Fixture | Shows |
|---|---|
| happy-path | full round trip PASS; own-origin answered `{accept, _meta:{persist:"session"}}`; screenshot hash matches; user tabs reduced to a count |
| decline-foreign | user-tab origin, lookalike host, localhost alias, other port, unknown shape, raw CDP, download, history: all declined on the wire, verdict PASS |
| decline-own-origin-variants | two origins, all-sites grant, URL mode, input-asking form naming the probe origin: declined, verdict BLOCKED |
| unstructured-own-origin | origin only in the message: declined (no text matching), verdict BLOCKED, input withheld, tab still closed |
| leftover-close-fails / still-listed | leftover reported for the user; nothing sent after a failed close |
| create-fails | no tab id guessed, nothing closed, possible new tab reported |
| ambiguous / same-profile / explicit-index | distinct profiles without `--browser-index` BLOCKED; identical tab sets or an explicit index proceed |
| report-sanitization | no sentinel, probe origin or page marker in any case report; the leak guard flags a deliberately leaky report |

## Part B (pending: needs the user's `cua login`)

```sh
node bin/cua.mjs login                      # the user, at a terminal; browser sign-in, once
node bin/cua.mjs login --status             # expect exit 0
CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-chrome-original.mjs --live --with-tabs --report /tmp/cua-chrome-original-tabs.json
```

Two backends are listed today. If they show different tabs (two profiles), the run stops at `target-browser`
BLOCKED before creating anything, and the per-browser user-tab counts in the report are the only way to tell the
profiles apart; rerun with `--browser-index N` for the intended profile.

## Part B, run 1 (2026-10-03, executor, after the user's `cua login`)

The user ran `cua login` at a terminal; the coordinator verified `cua login --status` exit 0 and doctor
`codex.login: pass` (no auth material read). One run:

```sh
CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-chrome-original.mjs --live --with-tabs --report /tmp/cua-chrome-original-tabs.json
```

Result 7 PASS / 0 FAIL / 7 BLOCKED, `tabOperations: 0`. **It stopped at `target-browser`, as designed:** the two
backends are distinct profiles, so no tab was created and nothing was navigated, typed, clicked, screenshotted or closed.

| Step | Outcome |
|---|---|
| live-prerequisites | PASS: login `logged-in` (codex login status), 2 hosts / 2 sockets, all signatures valid |
| live-launch, list-browsers | PASS: 2 backends, both `extension`/`chrome`, `extensionInstanceId` present, `profileName` absent |
| list-tabs-reach | **PASS: with the login, listTabs reaches both hosts** (M9 was refused `identity-or-auth`). Backend 0 lists **0** tabs, backend 1 lists **35** (counts only) |
| compareProfiles | ok, `sameProfile: false` (the two tab-id sets differ) |
| target-browser | BLOCKED: "2 browsers that may be different profiles; rerun with --browser-index N" |
| create-tab ... close-created-tab | BLOCKED (nothing attempted); leftover `none` |
| elicitations-own-origin-only | PASS: 0 elicitations (none asked, none accepted) |
| user-tabs-untouched | PASS: cells `listBrowsers, listTabs, listTabs, compareProfiles` |
| owned-teardown | PASS: confirmed (EOF), 0 owned leftovers, hosts still running |

- Test page: 0 requests (never navigated to). Runtime stderr: 0 bytes. Owned group ran `codex`, `node`, `node_repl`;
  4 remote TCP endpoints, all port 443 (the identity path).
- Owned `state/codex`, names only. Before: `auth.json`, `log`, `tmp`. After: those plus `goals_1.sqlite`,
  `installation_id`, `logs_2.sqlite`, `memories_1.sqlite`, `models_cache.json`, `node_repl`, `queue_1.sqlite`,
  `skills`, `state_5.sqlite` (each sqlite with `-shm`/`-wal`): what `codex app-server` and node_repl wrote. `auth.json`
  was seen by name in the listing only, never opened.

**Next:** the user picks the profile. Backend 0 shows no tabs (a profile with no open window, or a host without a
window); backend 1 shows 35 tabs. If the selected `Default` profile is the one with the user's open tabs, rerun once
with `--browser-index 1`; the probe then creates one tab there, uses only its own loopback page, and closes it.

**Verdict against M10's criteria: not yet promotable, not discarded.** The login made the original route's session
requests work (listTabs reaches both hosts with no policy refusal), but the owned-page round trip has not run.

## Part B, run 2 (2026-10-03, `--browser-index 1`, the user's Default profile)

The user identified backend 1 (the window with the open tabs) as the Default profile. One run:

```sh
CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-chrome-original.mjs --live --with-tabs --browser-index 1 --report /tmp/cua-chrome-original-tabs.json
```

Result 12 PASS / 2 FAIL / 0 BLOCKED, `tabOperations: 7`, no leftover.

| Step | Outcome |
|---|---|
| prerequisites, launch, listBrowsers | PASS (login `logged-in`; 2 `extension`/`chrome` backends) |
| listTabs | ok on both: backend 0 lists 0 tabs, backend 1 lists 36 (counts only; the user had one more tab open than in run 1) |
| target-browser | PASS, index 1 (explicit `--browser-index`) |
| createBrowserTab | ok; handle exposes `goto`, `close`, `getAXState`, `typeText`, `click`, `getScreenshot` |
| goto + AX read | ok, document marker found in the created tab's AX text; the page server served exactly 1 request |
| typeText | **FAIL, class `other`**: "This tab does not support accessibility input. Use its Playwright API." (refused before input) |
| click + AX verify | **FAIL**: no element index, so no click was sent; DOM change not observed |
| getScreenshot | ok: 1 image, **JPEG, 15253 bytes, SHA-256 `d4bb823b8718d26dfb7950cca856f7d730cc201e0b532c45745f846a6b69aeb8`**, size matches the in-cell byte count; kept outside git. It shows only the probe page (input focused and empty, status "waiting") |
| close + confirm | ok; the created tab is gone from listTabs (36 before and after); leftover `none` |
| elicitations | 1 total: `origin-access` for the probe's exact origin, form mode, **accepted with `persist:"session"`**; 0 declined |
| user tabs | untouched: cells `listBrowsers, listTabs x2, createBrowserTab, gotoOwnedPage, typeText, clickAndVerify, getScreenshot, closeCreatedTab, confirmClosed` |
| teardown | confirmed (EOF), 0 owned leftovers, hosts still running; runtime stderr 0 bytes; 5 remote endpoints, all port 443 |

**AX text format observed** (line shapes of the probe's own controls, label and digits replaced):
`- textbox "<label>" [active]` and `- button "<label>"`. This is a Playwright-style aria snapshot with **no numeric
element indices**, and the page's origin string does not appear in it. That matches the pinned vendor documentation for
DOM-only tabs: `getAXState()` is a DOM snapshot without indices, and native input wrappers "throw before input. Use the
documented Playwright locators to click controls and fill fields" (`@oai/cua/docs/tinysky-alt-core-cua-repl.md`).
On this route, a tab created through the original extension is such a DOM-only tab for input purposes.

Owned `state/codex`: run 2 added `browser` and `plugins` to the entries recorded after run 1 (names only; `auth.json`
was only seen in the listing).

**Verdict against M10's criteria: not promoted yet, not discarded.** Navigation, AX read, screenshot, close of the
created tab, session-scoped own-origin approval and user-tab isolation all work on the original route with the server's
own login. Input and click failed because the probe used the native-input wrappers, which the vendor documents as
unsupported on these tabs; the route itself did not refuse anything. Next: switch the probe's input and click to the
documented Playwright locator API (fill the input, click the button, verify through `getAXState`) and run once more.
That locator path is also the `playwright_locator_fill` shape the browser secret wrapper already targets.
