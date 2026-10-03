# M11 evidence: browser surface in `cua serve`, browser secret substitution, profile registry

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M11 (acceptance C1-C5). Branch
`feat/chrome-existing-profile`, from `b8b7f1a`. macOS 26 arm64, host Node 22, pinned runtime
`26.928.40906-darwin-arm64`, vendor `@oai/browser-desktop` 0.1.1. Live work in the default `CUA_HOME`.

Status: code and automated suites complete (review fix wave `7ce9643`, `bceb499`: `npm test` 268/268). Live part 2: the
`computer,browser` verify passed; `profiles bind personal` stopped **undetermined** with a single unlabelled backend
(not bound, by rule); the C2 run is pending the user's pick.

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

## Live, part 2 (2026-10-03, the user's regular Chrome open on the Default profile)

Environment: checkout at `171bf56` (M12 landed: Chrome host component placed in the release, `cua chrome`, doctor
`chrome.host.config`). One `ChatGPT for Chrome` host was running, a child of the user's regular Chrome (the desktop's
plugin-cache host binary; the registration still names the desktop's host). The ChatGPT desktop app was closed and no
native computer-use helper was running (no process; the IPC directory held only `computeruse.sock.lock`).

### `CUA_SHIM_SURFACES=computer,browser node verify.mjs` (06:50:06Z, once)

Exit 0, `problems: []`. Tools `js, js_reset, end_task, secrets_list, profiles_list`; browser API documented in the js
description; instructions 1990 characters (cap 2048); `profiles_list` keys personal/school/work, none ready;
`secrets_list` ok (0 labels); task ids stable across calls, `end_task` ended, repeat `noop`, the next task differed;
broker started and gone after close; every process relocated (anchor -> vendor node -> node_repl -> codex x3 -> node
x2), no desktop runtime path; serve exit 0; stderr empty.

**Acceptance-9 cold-start gate: not exercised by this run.** `nativeHelper: []`: nothing held the native socket
during the run, and after it no `Codex Computer Use` / `SkyComputerUseService` process existed and the IPC directory
still held only the lock file. So the vendor did **not** launch our release's pinned `Codex Computer Use.app`; no
macOS prompt appeared (none was shown to the user; the TCC log showed nothing for Computer Use in that window); no
helper was stopped (none was running). IPC version not observable without a helper (the pin expects
`CodexComputerUseIPC-5`). Discovery: verify's trivial cells (`nodeRepl.write`) load the API banner without contacting
the native helper; the helper is opened only by a native call (e.g. `cua.getState()`, as `scripts/probe-runtime.mjs`
sends). Earlier runs listed a helper because the desktop's was already running, not because verify reached it. A
cold-start observation therefore needs one explicit native read (`scripts/probe-runtime.mjs`), not verify. Note kept
for that run: a cold-started cua helper holds the per-user socket until its clients go away, so the desktop may see a
brief conflict when it reopens.

### `cua profiles bind personal` (06:50:41Z, once, automatic)

```sh
env -u CUA_HOME node bin/cua.mjs profiles bind personal --json   # exit 1
```

`outcome: undetermined`, `reason: unlabelled`: exactly **one** live extension backend, **unlabelled** (no
`profileName` from the vendor's enrichment), listing **42** tabs; 0 elicitations; the listing runtime was torn down
(confirmed; `run/` empty afterwards, no owned process left). **Nothing was bound**: a singleton backend is never bound
automatically, and the relayed user pick applies only to the two-backend split seen in M10 (one with many tabs, one
with 0), which this listing is not. `personal` stays `not_bound`. Stopped for the user's pick (instance id with its tab
count reported to the parent session, not recorded here).

### C2 live round trip

Not run: it needs `personal` bound.

## Live, part 3 (2026-10-03, checkout `8d16f77`)

### Cold start of the pinned native helper (acceptance-9 gate observation), once

```sh
CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-runtime.mjs --variants none --out /tmp/cua-m11-coldstart
```

`--variants none` sends exactly one read-only `cua.getState()` (no sandbox socket allowance variant, no TextEdit,
no app approval). Before the run: no `SkyComputerUseService` / `Codex Computer Use` process, the IPC directory held
only `computeruse.sock.lock`, the desktop app was closed. Result (23:20:07Z-23:20:19Z, exit 0):

- **The vendor launched our release's pinned helper**: `helperServed` pid 53082, executable
  `$CUA_HOME/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService`.
  It was not in the runtime's owned process tree (anchor-less M1 probe: vendor node -> node_repl -> codex sandbox x2 ->
  kernel/trusted worker), consistent with the vendor's LaunchServices open. Its parent pid was not captured: the probe
  snapshots holders by pid/executable only, and the helper had exited by the time it was looked up afterwards (the
  socket was gone too: it held the socket only while its client existed). The unified log showed nothing for it.
- `cua.getState()` answered `ok`: 37 apps, 0 browsers, no inventory errors; delegated `setup`, `execute:list_apps`;
  `turn_ended` acknowledged; 0 elicitations; all owned executables relocated; no leftover after exit; stderr empty.
- IPC version: the pinned helper binary carries `CodexComputerUseIPC-5` (the pin's expected version, also what the
  vendor client speaks); the handshake succeeded.
- No helper was stopped: none was running before; the cold-started one exited on its own.
- macOS prompts: none reached the run (no elicitation; `list_apps` succeeded). Whether the system showed any dialog is
  the user's observation (they watched and answer prompts themselves); nothing was clicked by the executor.
- Note: a cold-started cua helper holds the per-user socket until its clients go away; the user was told the desktop
  may see a brief conflict when it reopens. Here it was gone within the run.

What this proves: the relocated release's own helper cold-starts and serves a read-only native request on this host
while the desktop is closed. It does not prove desktop absence (the desktop app stays installed, and the helper shares
its bundle id and CDHash with the desktop's installed copy, so TCC grants made for that identity apply) or fresh-TCC
onboarding.

### `cua profiles bind personal --extension-instance-id 77fc…aef4` (23:20:59Z): refused before any launch

The user's pick, relayed by the parent session on 2026-10-03 (the single live backend, 42 tabs, identified by the user
as their Default profile). Exit 1, `profile_not_ready`: "the OpenAI extension is not installed in this Chrome
profile". Nothing was launched or bound.

File presence (no extension storage read): `Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/` and
`Default/Local Extension Settings/hehggadaopoacecdllhhajmbjkdcmajg/` no longer exist (Default's `Extensions` directory
was last modified 2026-10-03 16:17 local; on 2026-10-02 both existed, version `1.26.901.11451_0`, and `profiles add`
and doctor saw them). The extension is now present in `Profile 1` (`1.2.27259.19709_0`) and `Profile 11`
(`1.26.901.11451_0`), neither registered. So the live backend may not be the Default profile; binding `personal`
(Default) to it was not attempted. Doctor's `chrome.extension.personal` would now be `blocked` as well.

### C2 live round trip

Not run: `personal` is not bound.
