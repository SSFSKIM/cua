# M11 evidence: browser surface in `cua serve`, browser secret substitution, profile registry

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M11 (acceptance C1-C5). Branch
`feat/chrome-existing-profile`, from `b8b7f1a`. macOS 26 arm64, host Node 22, pinned runtime
`26.928.40906-darwin-arm64`, vendor `@oai/browser-desktop` 0.1.1. Live work in the default `CUA_HOME`.

Status: code and automated suites complete; live runs that need the user's Chrome are **pending** (see "Live, part 2").

## What was built

| Piece | Where |
|---|---|
| Surfaces: `CUA_SHIM_SURFACES` = `computer` (default) / `browser` / `computer,browser` -> `CUA_REPL_ENABLED_SURFACES`; exactly the enabled surfaces' trusted services; with `browser`: `CUA_BROWSER_VENDOR_SERVICE`, `BROWSER_USE_AVAILABLE_BACKENDS=chrome`, no backend list, no network/security override | `src/runtime/launch.mjs`, `src/mcp/server.mjs` (`settingsFrom`) |
| Pin layout key `browserVendorService` (`@oai/browser-desktop/scripts/browser-service.mjs`) | `runtime/releases/26.928.40906-darwin-arm64.json`, `src/runtime/manifest.mjs` |
| Trusted browser wrapper: delegates everything; substitutes an exact `{{secret:<label>}}` only in `playwright_locator_fill.value` and `tab_ax_action` paste/type_text `.text`, set_value `.value`; refuses other shapes and other vendor versions before any read; post-substitution rejections and `{ok:false}` envelopes become one fixed classification | `src/services/browser.mjs`, shared failure sentences in `src/services/secret-input.mjs` |
| Profile registry `$CUA_HOME/profiles.json`; `cua profiles add/list/remove/bind` | `src/profiles/{registry,chrome,bind,inventory,commands}.mjs`, `src/cli.mjs` |
| `profiles_list` tool and the three Chrome host notes (browser surface only) | `src/mcp/surface.mjs`, `src/mcp/server.mjs` |
| Doctor `chrome.extension.<key>`, `chrome.host.registered` (path class), `chrome.hosts.live` | `src/profiles/checks.mjs`, `src/runtime/doctor.mjs` |
| C2 live runner | `scripts/accept-chrome.mjs`, `scripts/accept/chrome-{page,cells}.mjs` |
| `verify.mjs` follows `CUA_SHIM_SURFACES` | `verify.mjs` |

## Source facts used (pinned readable `browser-service.mjs`, `browser-client.mjs`, cua docs)

- Service request: `nodeRepl.rpc("browser", {method, params})`, method `setup` / `execute` / `executeWithRecovery`,
  params the flat agent command `{type, ...payload}` (client `AC`; service `X2`/`rYe` at the end of the file).
  `executeWithRecovery` returns `{ok:true, value}` or, for `BrowserCredentialRecoveryError` only, `{ok:false, error:
  details}`; other errors reject.
- `playwright_locator_fill` payload `{browser_id, tab_id, selector, value, replace, timeout_ms?}`; the client's
  `locator.fill` sends `replace:true` and `timeout_ms` possibly undefined. `tab_ax_action` `{browser_id, tab_id,
  action}` with the discriminated `action` union (paste/type_text: `element_index` int>=0 or null; set_value: int>=0;
  paste `format` text/md/html).
- The turn-ended hook is registered at `setup` through `globalThis.nodeRepl.addTurnEndedHandler` (turn tracker `ph`),
  not at import; delegating `handleRpc` keeps it.
- `BROWSER_USE_AVAILABLE_BACKENDS=chrome` keeps extension backends: the availability name of type `extension` is
  `chrome` (`ij`, and the filter at the backend listing).
- Profile enrichment puts the label at `metadata.profileName`, surfaced as `BrowserInfo.profileName`; it reads
  `Local State` `profile.info_cache[dir].name` — the same field the bind rule compares.
- `cua.getBrowser({extensionInstanceId})` filters `listBrowsers` to `type:"extension"` with that instance id and
  throws when none or several match; the returned browser carries `browserId` for `createBrowserTab`.
- `classic-level` 3.0.0 is present in the relocated tree at `cua_node/lib/node_modules/classic-level` (resolvable
  from `@oai/browser-desktop/scripts/` by Node's upward lookup) with a `darwin-x64+arm64` prebuild signed by team
  `2DC432GLL2`. So "module missing" is not the reason enrichment left `profileName` absent in M9/M10 (static fact only;
  the bind rule still reports a missing label as "undetermined").

## Automated suites (this commit range)

```sh
npm test                                                     # 260/260 (was 200 at b8b7f1a)
node --test 'scripts/probe/chrome/original/test/*.test.mjs'  # 42/42
node scripts/probe-chrome-original.mjs --fixtures --report /tmp/cua-m11-orig-fixtures.json      # 11/11
node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/cua-m11-contract-fixtures.json  # 15/15
npm run test:helper                                          # Swift 55 + node 7; the production helper was not rebuilt
```

New Node tests: browser wrapper matrix (13), browser trusted-path load, launch surfaces (4), profile registry/Chrome
facts/bind rule (14), backend listing (4), bind command + CLI (8), browser surface/settings (5), serve with surfaces
(2), doctor Chrome checks (4), acceptance page/cells (4), leak-scan exclusion (1).

## Live, part 1 (2026-10-03, no browser needed)

Environment at the time: the user's regular Chrome was **not running** (four Chrome processes were Playwright
temporary profiles), no `ChatGPT for Chrome` host was running, the ChatGPT desktop app was not running.

```sh
env -u CUA_HOME node bin/cua.mjs profiles add personal --chrome-profile Default      # extension installed
env -u CUA_HOME node bin/cua.mjs profiles add work --chrome-profile "Profile 8"      # extension not installed
env -u CUA_HOME node bin/cua.mjs profiles add school --chrome-profile "Profile 6"    # extension not installed
env -u CUA_HOME node bin/cua.mjs profiles list --json
```

All exit 0; `profiles.json` 0600. `list`: personal not ready (`not_bound`), school and work not ready
(`extension_not_installed`). No Chrome file was written; only the extension directory's presence was read.

`doctor --json`: exit 0, `ok: true`; `codex.login: pass`; `chrome.extension.personal: pass`, `.school`/`.work:
blocked` (not installed); `chrome.host.registered: pass (desktop)`, naming the desktop's plugin-cache host;
`chrome.hosts.live: blocked` (no host running, Chrome closed); `helper.live: blocked` (no native helper running).

`CUA_SHIM_SURFACES=browser node verify.mjs`: exit 0, `problems: []`; tools `js, js_reset, end_task, secrets_list,
profiles_list`; browser API documented in the js description; instructions 1095 characters; `profiles_list` returned
keys personal/school/work, none ready; task ids stable, `end_task` ended, a second task differed; every process
relocated (anchor -> vendor node -> node_repl -> codex x3 -> node x2); no native helper involved; serve exit 0; run
directory removed.

## Live, part 2 (pending: needs the user's Chrome open)

`profiles bind personal`, `CUA_SHIM_SURFACES=computer,browser node verify.mjs` and
`accept-chrome.mjs --live --profile personal` need live OpenAI hosts, which Chrome starts for the extension.
