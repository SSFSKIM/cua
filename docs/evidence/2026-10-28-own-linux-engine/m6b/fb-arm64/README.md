# FB on arm64 at main 854103aa5 (task 165; ruling 1217 N9)

FB is the facade half of acceptance item 4, which M6a's evidence calls "the fallback part". It runs the over-budget
scene's truncation line and the two error sentences through both services. This is arm64's counted witness for FB
before M6b (M6b pre-flight §5.3, item 4 and #558's row).

- **The head** is main **854103aa58b56521ba85afb4b392e1f3c5a8287d**.
- **The checkout** is a fresh VM worktree `t165-main` on `dc-linux171arm-996d`, detached and clean at that head. It has
  a real `npm ci`, the Electron binary present and xprobe built (`scripts/setup-all.sh`, `setup-main.log.txt`).
- **The home** is `home-arm64-045-main`, installed by that checkout's own `node bin/cua.mjs install --engine`
  (`scripts/install-home.log.txt`).
  - Its engine sha256 is `f81121552e77f50ec2d8dcf3135006a9245c411f2b67bc9cfbe408850e6e637c`, equal to the pin
    (linux-engine-v0.4.5, arm64), and it reads `cua-engine 0.4.5 (77ed101d43ea)`.
  - `gate.mjs check --pinned` exited 0, with `engine_tree` 77ed101d43ea… `equal: true` and `clean: true`.
- **The run.** `gate.mjs print FB --pinned <home> --holder t165-arm64` gave one line (`out/FB.print.txt`), which ran
  once, as printed, under the VM's `locked.sh t165-arm64` (`scripts/steps.sh`; `scripts/lock-lines.txt`).
  - It ran 2026-11-24 10:43:03–10:43:35Z on a private display, never `:0`.
  - hold-sittings was absent and the disk had 91G free.
  - The run was clean, with a clean watchdog and a clear end check.

**Verdict:** `VERDICT: every step passes`, then `acceptance on the pinned release: FB exit 0`
(`out/FB.pinned-release/stdout.log.txt`, `run/summary.md`).

**The counts:** 10 of 10 steps pass, the vendor service and cua's service equal on every one.
- The 10 are setup, the over-budget scene's 8 steps and harness-windows.
- The over-budget scene's 8 are: window, state, tree, query, state-after-query, screenshot, unknown-id and
  unknown-action.
- The truncation line on cua's lane reads `{"depth":2,"failed":0,"nodes":1263}`:
  - at line 1265 of the state, state-after-query and screenshot (4908 rendered lines);
  - in the tree (5000 nodes) and in the query.
- unknown-id gives "Unknown element ID 999999 for this window; refresh get_window_state()" on both lanes.
- unknown-action gives 'AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault",
  "showContextMenu"]' on both lanes.

**Scans** (26 files; `scripts/scan-token.txt`, `privacy-scan.txt`, `scan-lsps.txt`):
- token-shaped strings: 0;
- key codes: 0 held-code rows and 0 raw minimized codes;
- raw U+2028 / U+2029: none, in plain files or in gzipped ones.
- No `:0` title list was read, since nothing connected to any `:0`.

**Files:** `out/` holds the step as the runner wrote it, with the print and its record and `steps.log.txt`. `scripts/`
holds the launchers (task 163's, re-pointed), the setup and install logs, the copy, the scans and the lock lines.
