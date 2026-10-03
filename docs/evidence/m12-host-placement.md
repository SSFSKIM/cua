# M12 evidence: independent placement and registration of the original OpenAI Chrome host

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M12, acceptance C6. Run on 2026-10-03,
macOS 26 arm64, host Node 22, on `feat/chrome-existing-profile` at `389ac71`. No browser, ChatGPT, host or native
helper was launched, stopped or signalled. The host binary was never executed (only `codesign --verify`). No
`chrome-native-hosts-v2.json` was written, the desktop's plugin cache was not touched, no extension was installed,
and `state/codex/auth.json` was never opened. **`chrome register --replace` was not run live.** No real
NativeMessagingHosts manifest was written, backed up or restored.

## Results

| Item | Result | Evidence |
|---|---|---|
| `npm test` | PASS | 300/300: 32 new M12 tests (component install and pin parsing 10, registration 13, doctor 5, CLI 4) and 3 updated existing tests. |
| `npm run test:helper` | PASS | Swift tests and node-driven executable tests passed. The production helper was not rebuilt (its sha256 is the same before and after). |
| Probe suites | PASS | `scripts/probe/chrome/original/test/*.test.mjs` 42/42; `probe-chrome-original.mjs --fixtures` 11/11; `probe-chrome-contract.mjs --fixtures` 15/15. |
| (a) `install --archive` into a scratch home | PASS | `CUA_HOME=$(mktemp -d /tmp/cua-m12.XXXXXX)`: 6.8 s. The release tree holds `CodexCLI.app`, `chrome-plugin`, `cua_node`, `install.json`. `chrome-plugin/` is the whole archived plugin directory (386 files) plus `component.json` and `extension-host/macos/arm64/extension-host-config.json`. The host passes `codesign --verify --deep --strict` with the pinned team requirement and carries only `com.apple.provenance`. Doctor `ok:true`, `chrome.host.config: pass`. |
| Scratch reinstall is a no-op | PASS | `install --json` returned `changed:false` and `chromeHost.changed:false`. All 3399 entries under `runtimes/` were identical before and after (type, mode, size, mtime, inode). |
| (b) `install --archive` into the default home | PASS | "added the Chrome host to the installed release … nothing that was installed changed". Snapshot of every entry under `~/Library/Application Support/cua` before and after (5415 → 5866): **0 files changed**, 451 entries added, all under `runtimes/26.928.40906-darwin-arm64/chrome-plugin/`. Two directories changed only in their listing: the release directory gained its new child, and `staging/` got a new mtime from the temporary stage directory. `state/` (including the Codex login) is unchanged. |
| (c) `chrome register` (no flag) refuses | PASS | Exit 1, `registration_in_use`: "com.openai.codexextension is already registered for another host in chrome (desktop), edge (desktop), brave (desktop), opera (desktop), vivaldi (desktop): the desktop's registration is in use and already works with `cua serve`. Nothing was changed." The hint names `--replace` and the backup directory. `<home>/chrome/` was not created. |
| (c) `chrome unregister` is a no-op | PASS | Exit 0. "nothing to unregister: no com.openai.codexextension manifest names cua's host"; all five browsers show `not_ours` with class `desktop`; `--json` gives `blocked:false`. |
| Real manifests untouched | PASS | All 8 `com.openai.codexextension.json` files the desktop wrote (Chrome, Chromium, Chrome for Testing ×2, Edge, Brave, Opera, Vivaldi) have the same sha256, mtime and inode before step (b) and after step (c). |
| (d) `doctor --json` on the default home | PASS (exit 0, `ok:true`) | `chrome.host.config: pass` (host signed by `2DC432GLL2`; the config names node, node_repl, the codex CLI and both browser scripts inside the active release; `codexHome` is `<home>/state/codex`, owned and writable). `chrome.host.registered: pass (desktop)`, `chrome.hosts.live: 1`, `codex.login: pass`, `chrome.extension.personal: pass`, work/school blocked (extension absent). `helper.live` blocked (no helper held the native socket at that moment). |
| C6 `--replace` live gate | BLOCKED | Needs the user (see below). Covered only by tests against injected temporary manifest directories. |

## Facts established

- **Plugin contents (source, data only).** In the pinned archive the plugin is
  `ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/chrome/` (449 zip entries, 14.9 MB). Its
  `scripts/browser-service.mjs` dynamically imports `../node_modules/classic-level.mjs`, which requires
  `./classic-level/index.js` and a darwin prebuild that is itself signed by team `2DC432GLL2`. The service also loads
  `browser-accessibility.wasm.br` and `zxing_reader.wasm` from `scripts/`. A pruned copy would break that closure, so
  the whole directory is placed.
- **The plugin's scripts are not the runtime's.** The plugin's `browser-service.mjs` (`8712d99d…`) and
  `browser-client.mjs` (`9c76ccc4…`) differ from `cua_node/.../@oai/browser-desktop/scripts/` (`64b3e675…`,
  `7e9077c0…`). The host configuration names the plugin's own pair, which is what the vendor installer pairs with this
  host (`browserClientPath` defaults to `<plugin>/scripts/browser-client.mjs`). `cua serve` keeps using the runtime's
  browser-desktop service (M11). The plugin's scripts would only be used by the host's app-server path, which stays
  unreachable without a v2 registry entry.
- **What the vendor installer writes** (`scripts/installManifest.mjs`, read, never executed). Native host
  `com.openai.codexextension` with description "ChatGPT browser native messaging host", extension ids
  `hehggadaopoacecdllhhajmbjkdcmajg` and `odlomjlbamekndcpllcnffbgeohgkmjh` → `allowed_origins`
  `chrome-extension://<id>/`, and `type: "stdio"`. The manifest is `JSON.stringify(m, null, 2) + "\n"` with keys in
  the order allowed_origins, description, name, path, type. On macOS the vendor writes it unconditionally (mkdir -p)
  into eight directories: Google/Chrome, Chromium, Google/ChromeForTesting, "Google/Chrome for Testing", Microsoft
  Edge, BraveSoftware/Brave-Browser, com.operasoftware.Opera, Vivaldi. Its `extension-host-config.json` writer emits
  schemaVersion, channel, browserClientPath, codexCliPath, nodePath, nodeReplPath, proxyHost (127.0.0.1) and
  proxyPort (0). cua's manifest is byte-identical to the vendor format except for `path`.
- **This Mac.** Every one of those eight directories exists and holds the desktop's manifest, including ones whose
  browser data directory contains nothing but `NativeMessagingHosts/` (Chromium, Chrome for Testing, Edge, Brave,
  Vivaldi). The desktop created them. A directory's existence is therefore not evidence that a browser is installed.
- **Host binary.** A thin arm64 Mach-O, identifier `extension-host`, signed "Developer ID Application: OpenAI OpCo,
  LLC (2DC432GLL2)". It has no bundle seal, so writing `extension-host-config.json` beside it does not affect its
  signature (re-verified after placement).

## The `--replace` live gate (for the parent, with the user)

Preconditions: Chrome is running with the OpenAI extension in `personal` (Default), the default home holds the
placed host, and `codex.login: pass`. Never kill the running desktop hosts; Chrome starts a new host on the
extension's next connection.

```sh
cd /Users/new/Developer/GitHub/cua
node bin/cua.mjs chrome register --replace     # prints the two consequences, backs up the 5 desktop manifests to
                                               # ~/Library/Application Support/cua/chrome/manifest-backup/<browser>.json,
                                               # then writes cua's manifest (chrome, edge, brave, opera, vivaldi)
node bin/cua.mjs doctor --json                 # expect chrome.host.registered: pass (cua: ... chrome-plugin/...)
# The user makes the extension reconnect (e.g. disable/enable it at chrome://extensions, or reopen its side panel).
ps -axo pid=,ppid=,comm= | grep 'ChatGPT for Chrome'   # expect a host whose path is under .../cua/runtimes/.../chrome-plugin/
node scripts/accept-chrome.mjs --live --profile personal --report /tmp/cua-m12-replace-roundtrip.json
                                               # one owned-page round trip through cua serve (M11 boundaries)
node bin/cua.mjs chrome unregister             # restores each backup, verified byte-for-byte; exit 0 expected
node bin/cua.mjs doctor --json                 # expect chrome.host.registered: pass (desktop: ...)
```

Expected side effects: while cua's host is registered, the desktop's Codex side panel and app-server features in
Chrome stop working, and the desktop app rewrites its manifest when it next runs. Chromium and the two Chrome for
Testing directories are not in cua's browser set, so their desktop manifests stay as they are throughout. Once the
extension has reconnected, both the old desktop host and cua's host may be running until Chrome lets the old one go.
The `ps` line identifies which host served.

PASS needs all of the following: the backend listed through `cua serve` comes from a host process whose path is
cua's, the round trip passes, and `unregister` reports `restored` for every browser. Otherwise C6's live part stays
BLOCKED or FAIL with the observed step.
