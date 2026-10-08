# Downloads, JavaScript dialogs and the file chooser on the cua route (#15)

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, Decision Log 2026-10-08 (#15). Branch
`feat/downloads`. Fixture: `scripts/accept/linux-chrome-features.mjs` (its page `scripts/accept/features-page.mjs`),
run on the Tart VM `cua-linux` (Ubuntu 24.04 aarch64, Chrome 154.0.8037.97, Node 22) over `cua serve` with the
browser surface, home `~/.local/share/cua-h4`, profile `me` = `Default`, the cua extension force-installed from the
relay. No ChatGPT sign-in, no `cua login`.

| Item | Result |
|---|---|
| Extension 0.3.0 reaches a force-installed copy | **PASS**, with a Chrome restart. Packed on the Mac (`CUA_EXTENSION_KEY`), published with `relay/deploy/update.sh --ext dist` (update.xml names `cua-extension-0.3.0.crx`). Chrome relaunched with `--extensions-update-frequency=20` fetched and unpacked `0.3.0_0` within a minute but kept running 0.1.0 (an update installs when the extension is idle; a worker holding the native port never is); the next restart installed it: the host's log `hello … version=0.3.0`, status `extensionVersion: 0.3.0`. The new `downloads` permission was granted without a prompt (policy install) |
| Download | **PASS** (runs 1–3). `tab.playwright.waitForEvent("download")` armed, `#dl` clicked, the service asked "Allow download from <origin>" (accepted for the session), the wait resolved on completion in 289–310 ms with `path()` = `~/Downloads/cua-report.pdf`, 7729 bytes, sha256 `a3030829…6ec5` equal to the served body; the fixture deleted the file it had proven it created |
| alert | **PASS**. `getJsDialog()` → `{type: "alert"}`, handled, `getJsDialog()` null, the page continued (`#state` = `after-alert`) |
| confirm | **PASS**. `{type: "confirm"}` dismissed → the page saw `false` |
| File chooser | **PASS only with file access**. Runs 1–2: `setFiles` failed with the service's own text, "To enable file upload, go to chrome://extensions … enable 'Allow access to file URLs'" (Chrome refuses `DOM.setFileInputFiles` to a chrome.debugger client without the extension's file access; the `ExtensionSettings.file_url_navigation_allowed` policy does not grant it). Run 3, Chrome relaunched with `--disable-extensions-file-access-check`: `waitForEvent("filechooser")`, `#file` clicked, "Allow upload to <origin>" accepted, `setFiles([<tmp>/cua-upload.txt])` → the page read `cua-upload.txt:1234` |
| CDP download events (the design's rejected alternative) | **Refused**, measured with a backend client on the live host: `executeCdp Browser.setDownloadBehavior {behavior:"default", eventsEnabled:true}` → `'Browser.setDownloadBehavior' wasn't found` (-32601, the same with `allow`); `Page.setDownloadBehavior` → `Cannot not access browser-level commands` (-32000). The `downloads` permission is the only route to download completion through chrome.debugger |
| Session hygiene | every run: the tab closed, `end_task`, the host owned no tab, `cua serve` exited 0, no `run/` entry left; elicitations: origin access, download, upload — all for the served origin only |

Run 3's full report is the fixture's JSON (VM `/tmp/features-run3.json`); the three runs differ only in the
elicitation policy (run 1 declined file transfers, which the service reported as "the user declined permission")
and the file-access switch.

## What follows

- Users who want agents to upload files turn on "Allow access to file URLs" for the cua extension (README, Chrome
  section); the agent-facing error already says so. A dedicated agent machine may launch Chrome with
  `--disable-extensions-file-access-check` instead; `deploy/cloud-vm` does not, by default.
- The Store build 0.3.0 (the `downloads` permission) is uploaded after the pending 0.2.0 review (#78);
  `~/cua-store-listing/listing.md` carries the justification.
- The owner's Mac (unpacked load) takes the new permission at the next extension reload.
