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

## The `--replace` live gate, run with the user's GO (2026-10-03)

The parent session relayed the user's GO for the gate. The steps below follow the list above. Nothing was killed or relaunched, and nothing touched `chrome-native-hosts-v2.json`.

### Before step 1

- All 8 desktop manifests: sha256 `58b892526102a537b43ee632a60f03aa47e1f456b5223f8c564a50a8eb5704b6` (386 bytes), mtime 1786643409. Inodes: Chrome 4527928, Chromium 4527932, ChromeForTesting 4527930, Chrome for Testing 4527934, Edge 4527936, Brave 4527931, Opera 4527937, Vivaldi 4527933. These are the same values as the M12 baseline above.
- Running hosts: two, both `~/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome`, with parent pid 69284 (Google Chrome), pids 79991 (started 16:23:52) and 85652 (16:24:39).
- Doctor: `chrome.host.config`, `chrome.host.registered` (desktop), `chrome.hosts.live` and `codex.login` all pass.

### Step 1: `chrome register --replace`: PASS (exit 0)

- Both consequences were printed to stderr before anything was written: the side-panel/app-server loss (no v2 entry names cua's host), and the desktop re-sync with `unregister` as the way back.
- All five browsers were `replaced`: chrome, edge, brave, opera, vivaldi.
- `~/Library/Application Support/cua/chrome/manifest-backup/{chrome,edge,brave,opera,vivaldi}.json` (0600, directory 0700) each have sha256 `58b89252…04b6`, byte-identical to the desktop manifest.
- `registration.json` (0600) holds `replaced: true` with `backupSha256 58b89252…04b6` for each of the five.
- The five manifests now have sha256 `86c8cf8f9dc27b6c…` and name `~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome`. Each has a new inode (atomic publish) and mtime 1791072070.
- The Chromium and both Chrome for Testing manifests are unchanged (same hash, mtime and inode). They are not in cua's browser set.
- No hidden temp or `.taken` files are left in the NativeMessagingHosts directories.

### Step 2: `doctor --json`: PASS (exit 0, `ok:true`)

- `chrome.host.registered: pass`, now naming cua's host (class `cua`).
- `chrome.host.config: pass`, `codex.login: pass`, `chrome.extension.personal: pass`.
- `chrome.hosts.live: 2`. Those are still the two desktop hosts (pids 79991 and 85652, unchanged): the browser starts cua's host only on the extension's next connection.

### Step 3 (the user)

The user switched the ChatGPT extension off and back on at chrome://extensions in the Default profile and changed nothing else (relayed by the parent session).

### Step 4: a host from cua's tree serves the extension: PASS

- A new host is running: `~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome`, pid 79354, parent 69284 (Google Chrome), started 17:03:13. Chrome launched it from cua's manifest on the extension's reconnection. Its socket is `/tmp/codex-browser-use/af823d87-….sock`.
- Desktop host 85652, which served Default before, is gone; it exited when the extension was switched off and was never signalled by cua. Desktop host 79991 (another profile's, started 16:23:52) keeps running.

### Step 5: owned-page round trip: BLOCKED at backend selection

- Command: `node scripts/accept-chrome.mjs --live --profile personal --report /tmp/cua-m12-replace-roundtrip.json`, exit 1.
- `select-profile-backend` FAIL: "The Chrome instance is unavailable." The `personal` binding (`8342c6b8…31be`) is no longer live, because switching the extension off and on minted a new extension instance id.
- No tab was created (no tab operations) and there were no elicitations. Sentinel scan PASS, disposable secret cleaned up, `end_task` and `serve` exited cleanly.
- `personal` was **not** rebound.
- Read-only live listing afterwards (one bounded launch, `listBrowsers` and tab counts, teardown confirmed, 0 elicitations):
  - `41f3ec26-8d63-49d3-9aac-3dd1ee094954`, 0 tabs, unlabelled. It was present before the toggle; its host is the still-running desktop host 79991.
  - `94c9fc71-4bfb-4a14-9d99-2caf6eebbabd`, 21 tabs, unlabelled. It is new.
- That `94c9…` is served by cua's host 79354 is inferred from the timing and the host replacement, not proven by a socket-level mapping. The listing carries no pid or socket.
- To finish C6's live round trip, the user must first rebind `personal` by explicit pick (`cua profiles bind personal --extension-instance-id <id>`), and then the gate (register `--replace`, reconnect, round trip, unregister) must run again with the extension left on.

### Step 6: `chrome unregister`: PASS (exit 0, `blocked: false`)

- chrome, edge, brave, opera and vivaldi are all `restored`/`restored`.
- Every one of the 8 manifests now has sha256 `58b892526102a537b43ee632a60f03aa47e1f456b5223f8c564a50a8eb5704b6`, equal to the pre-step-1 hash, and `cmp` shows each identical to the reference copy saved before step 1.
- The five restored manifests have new inodes (atomic publish: Chrome 113647528, Edge 113647531, Brave 113647534, Opera 113647537, Vivaldi 113647540) and mtime 1791072772. The three untouched ones (Chromium, both Chrome for Testing) keep their original inode and mtime.
- `manifest-backup/` is empty (each verified restore consumed its backup), `registration.json` is `{schema: 1, browsers: {}}`, and no hidden files are left.

### Step 7: `doctor --json`: PASS (exit 0, `ok:true`)

- `chrome.host.registered: pass (desktop)`, naming `~/.codex/plugins/cache/openai-bundled/chrome/latest/…/ChatGPT for Chrome`.
- `chrome.host.config` and `codex.login` pass.
- `chrome.hosts.live: 2`. cua's host 79354 keeps running until Chrome lets it go, since nothing is killed, and the desktop host 79991 is still running. The extension's next connection will launch the desktop host again.

### C6 verdict for the gate

- PASS: placement, the backup and replace, a host from cua's tree launched by Chrome, and a byte-for-byte restore.
- BLOCKED: the owned-page round trip through that host, because the binding went stale when the extension was toggled.
- `/tmp/cua-c6-replace.json` (shape `{scenario: "C6-replace-live-gate", servingHost, roundTrip, unregister}`) carries `servingHost.pathClass: "cua"` with `backendMappingProven: false` and the note above, the round-trip report (`status: FAIL` at selection) and the unregister output.
