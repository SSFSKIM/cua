# Linux: the agent as a systemd user unit, the relay path, and the x64 runtime (issue #58)

Phase F (PR #57) proved `cua serve` on Linux over stdio on an arm64 VM. It left three things unproven: `cua agent` on
Linux (it had no counterpart of the launchd job), `agent run --relay` from Linux, and the x64 pin at runtime (checked
only by inspection and signature). This document records all three, on 2026-10-06 and 2026-10-07 UTC. Branch
`feat/linux-agent-x64`; the code under test in A and B is `45a2b97`, the systemd unit commit (`5d9db08` changes only
tests). C ran `main` at `eeef390`, because nothing on the branch changes the runtime path.

| Part | Result |
|---|---|
| A. systemd user unit | **PASS**. `cua agent install|uninstall|status` on Linux manage `~/.config/systemd/user/cua-agent.service`; doctor's `agent.*` rows read it. Crash restart, deliberate stop, linger and uninstall were checked on the VM. Suite: macOS 716 tests (715 pass, 1 Linux-only skip); VM 716 tests (673 pass, 43 darwin-only skips), 0 fail on either |
| B. relay path from Linux | **PASS**. The VM was enrolled with the hosted relay, its agent ran as the user unit, and a `claude -p` session on the MacBook typed into gedit in the VM with `pressKey`, read the text back through AT-SPI and opened an `example.com` tab in the VM's Chrome profile `me`, all through `https://178-104-102-73.sslip.io` |
| C. x64 runtime | **PASS** on a throwaway Hetzner `cx23` (AMD EPYC, x86_64): install from the mirror deb and by download, doctor `ok: true`, `scripts/accept/linux-native.mjs` PASS, `verify.mjs` exit 0, `npm test` 0 fail. The server was then deleted |

## A. The agent as a systemd user unit

The design is in the spec's Decision Log (entry dated 2026-10-06, "issue #58"). In short, the unit runs exactly the
launchd job's program arguments (`<node> <checkout>/bin/cua.mjs agent run --relay|--http …`). Its environment is the
job's plus `DISPLAY` and `XAUTHORITY`. It uses `Restart=on-failure` with `RestartSec=10` (launchd's
`KeepAlive {SuccessfulExit: false}`), `KillMode=mixed`, and appends its log to `$CUA_HOME/state/agent.log`.
`WantedBy=default.target`. Linger is reported but never set.

**Quoting, before the tests were written.** The VM runs systemd 255 (255.4-1ubuntu8.17). A probe unit rendered by
cua's template had these arguments: `a b`, `q"uote`, `back\slash`, `per%cent %n`, `dol$lar ${HOME}`, `it's` and an
empty string. It had the same values in `Environment=` lines, and a log path with a space and a `%`
(`/tmp/cua probe %dir/out.log`). Every argument and every variable arrived byte for byte, including the empty
argument: `[a b][q"uote][back\slash][per%cent %n][dol$lar ${HOME}][it's][]`. `systemd-analyze --user verify` printed
nothing. The probe unit was removed afterwards.

**On the VM** (Tart `cua-linux`, Ubuntu 24.04.5 aarch64, user `admin`, over SSH). The branch was checked out as a
worktree `~/cua-58` of the VM's repository, followed by `npm ci`. `~/cua` was left alone, because another session
(#54) was using the VM.

```sh
sudo -n loginctl enable-linger admin            # Linger=yes (passwordless sudo on this VM)
cd ~/cua-58 && DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority node bin/cua.mjs agent install
```

This ran at 00:05:29 UTC and took 0.25 s:

```
installed and enabled the systemd user unit cua-agent.service (/home/admin/.config/systemd/user/cua-agent.service)
  runs    /usr/local/bin/node /home/admin/cua-58/bin/cua.mjs agent run --relay
  env     DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority CUA_SHIM_SURFACES=computer,browser
  status  running, pid 54607 (enabled)
```

`systemctl --user status` showed `Loaded: … enabled`, `Active: active (running)` in the cgroup
`user@1000.service/app.slice/cua-agent.service`. `agent status` added `linger  on: the unit runs from boot and survives
logout`.

**Doctor over SSH** ran with no `DISPLAY` in its own environment, once the relay knew the device (part B). `doctor
--json` gave these rows:

- `agent.installed` **pass**: "…/cua-agent.service: node /usr/local/bin/node, runs /home/admin/cua-58/bin/cua.mjs
  agent run --relay, display :0"
- `agent.running` **pass**: "pid 54607, systemd user unit cua-agent.service (enabled; linger on: it runs from boot and
  survives logout)"
- `agent.enrolled` **pass**: "device 94_bOP7hRpkMAtKwYEOGQg, relay wss://178-104-102-73.sslip.io/ws"
- `agent.console` **pass**: "X display :0 has XTEST, Composite and XFIXES for the agent's unit; a locked screen is not
  detected on Linux"

In the same report, doctor's own `display` row read `fail` ("DISPLAY is not set"). This contrast is why
`agent.console` checks the unit's display rather than doctor's.

**Restart semantics, measured:**

- **SIGKILL to the agent** at 00:16:08, while a session's runtime was alive. systemd killed the remaining
  `node_repl` with SIGKILL. It reported `Failed with result 'signal'` and `Scheduled restart job, restart counter is
  at 1` at 00:16:18, 10 s later. The new agent swept the leftovers: "$CUA_HOME/run: removed the leftovers of 1
  connection whose cua process is gone (…, pid 54607)". It reconnected to the relay, and no runtime process was left.
- **SIGTERM to the agent** (a deliberate stop). The log showed `SIGTERM: closing every session`, then `Result=success
  ExecMainStatus=0 ActiveState=inactive`. After 13 s `NRestarts` was still 1, so the unit was not restarted.
- **`agent uninstall`** (00:16:58, 0.44 s) printed "stopped and disabled systemd user unit cua-agent.service and
  removed /home/admin/.config/systemd/user/cua-agent.service". After it, `LoadState=not-found`, `agent status` read
  "not installed", `agent.installed` read `blocked` (enrolled, no unit), `run/` was empty and no agent or runtime
  process remained.

**After the review** (`821eb0c`), the unit uses `Type=exec`. It was installed again on the VM with no `XAUTHORITY` in
the SSH session, so the unit has none. Doctor's `agent.console` then passed: it now checks the unit's display with the
user's `HOME`, so `~/.Xauthority` is found as the agent finds it. Next, the unit file was deleted and the manager
reloaded, which left `LoadState=not-found` with `ActiveState=active`. `agent uninstall` stopped that orphan (`not-found
inactive` afterwards, no agent process left). The review found that the earlier uninstall would have reported "nothing
changed" there.

**Tests.** `test/remote-systemd.test.mjs` covers the unit text and its read-back, the refusals, an unreachable
manager, reinstall, a failed start, status, linger and uninstall. It runs against a fake `systemctl --user` and a fake
`loginctl` (`test/fixtures/fake-systemctl.mjs`). `test/runtime-doctor.test.mjs` covers the Linux `agent.*` rows with
an injected display check. The first run on the VM found two tests that read the host's real installed agent: the
enroll hint test wrote a launchd plist, and a Linux doctor test used the default agent inspector. Both now pin their
inputs (`5d9db08`).

## B. The relay path from the VM

1. **Enrol.** `node bin/cua.mjs remote enroll --relay wss://178-104-102-73.sslip.io/ws --json` wrote device
   `94_bOP7hRpkMAtKwYEOGQg`. The output went to a 0600 file in the VM and was never displayed.
2. **Install the agent** (part A). Until the relay knew the device, it logged `could not connect (Unexpected server
   response: 401; the relay does not know this device's credential …)` with backoff.
3. **The relay's table.** `/etc/cua-relay/devices.json` was read from the server into a 0600 temp file. It held one
   device, the mini's `nuadM-MUKSbSN4L59EffLQ`. The VM's `devicesEntry` was merged into it, giving 2 devices.
   - **Before the restart.** No `/d/` request had reached Caddy in the previous 6 minutes; the last was the mini
     session's `DELETE` at 00:01:09. No `claude` process ran in the VM.
   - **The restart.** `relay/deploy/update.sh --devices merged.json` ran at 00:08:10. It printed "devices.json: 2
     device(s)" and "listening … 2 devices". This was the only relay restart this work made.
   - **After it.** The mini was back online at 00:08:23 and the VM device at 00:08:37 (`relay: connected to
     wss://178-104-102-73.sslip.io/ws as device 94_bOP7hRpkMAtKwYEOGQg`, after its 30 s backoff).
4. **Drive the VM from the MacBook** (Claude Code 2.1.292). The MCP config was a 0600 temp file naming `cua_repl` at
   `https://178-104-102-73.sslip.io/d/94_bOP7hRpkMAtKwYEOGQg/mcp` with the bearer:

   ```sh
   claude -p --strict-mcp-config --mcp-config <0600 file> \
     --allowedTools "mcp__cua_repl__js,mcp__cua_repl__js_reset,mcp__cua_repl__end_task,mcp__cua_repl__profiles_list" < prompt.txt
   ```

   It ran from 00:11:30 to 00:15:47 UTC (4 min 17 s), exit 0. gedit had been started over SSH on an empty
   `/tmp/cua58-gedit/relay-cua58-3fb65a.txt`. The session's own summary line was:

   ```json
   {"window":20971768,"axSource":"at_spi","markerReadBack":true,"screenshotBytes":36718,"tabTitle":"Example Domain","h1":null,"endTask":"ended"}
   ```

   - **Native.** `listWindows` found the window and `getApp({windowId})` bound it. The marker `cua58-3fb65a` was typed
     with 12 `pressKey` calls (`minus` for `-`), read back from the AT-SPI tree, and seen on line 1 of the screenshot.
   - **Chrome.** `profiles_list` returned `me`, ready. `getBrowser({extensionInstanceId})` bound it and
     `createBrowserTab('https://example.com')` opened the tab. Its title read "Example Domain" and the tab was closed.
     The `h1` locator matched nothing because example.com currently has no heading; the DOM snapshot confirmed it.
   - `end_task` returned `ended`.
   - **Agent log.** One idle session was evicted at the cap of 1 when the client opened its working session. The client
     never sent `DELETE`, as Phase E found for both Claude Code modes, so that session's runtime stayed until the idle
     close; the SIGKILL test in part A ended it first.

**Left in place** (the choice the issue asks for):

- **Uninstalled.** The VM's unit (`agent uninstall` above). It ran from an unmerged worktree, so it should be
  reinstalled from `~/cua` after the merge.
- **Kept.** The VM's enrolment (`~/.local/share/cua/remote/device.json`, and the client credential in
  `~/.cua58-enroll.json`, 0600). Its line in the relay's `devices.json` stays too.
  - Removing the line would have meant a second relay restart while #54 drives the mini through the relay.
  - While no agent dials, a stale entry only answers `503 device offline`.
  - Reinstalling the agent (`cua agent install` in the VM) makes the device reachable again with no relay change.
  - To drop it later, run `update.sh --devices` with the mini-only table.
- **Removed.** Every credential-bearing temp file on the Mac (the merged table, the enrolment copy and the MCP config).
- **Not removed.** The worktree `~/cua-58` in the VM.

## C. The x64 runtime on a throwaway cloud server

- **The server.** Hetzner context `cua`: `cua-x64-proof`, id **169123728**, `cx23`, `ubuntu-24.04`, nbg1, ssh key
  `macbook`. Created 23:55:33–23:55:57 UTC. Deleted 00:12:54–00:13:11 UTC, about 17.5 min of server time.
  `hcloud server describe 169123728` now answers "Server not found", and `hcloud server list` shows only `cua-relay`.
- **The machine.** Ubuntu 24.04.4, kernel `6.8.0-138-generic` x86_64, AMD EPYC-Rome, 2 vCPU, 3.8 GB, virtio-gpu.
  Package versions match the arm64 VM: bubblewrap 0.9.0, AppArmor 4.0.1, at-spi2-core 2.52.0, gedit 46.2 on GTK
  3.24.41, Openbox 3.6.1, Xorg 21.1.12. Node was 22.23.3 (the nodejs.org linux-x64 tarball, SHASUMS256 checked).
- **Provisioning, as root.** First `apt-get install --no-install-recommends xorg openbox x11-utils dbus-x11 bubblewrap
  binutils xz-utils gedit at-spi2-core xvfb git curl xdotool ca-certificates`. Then a user `admin` (uid 1000),
  `loginctl enable-linger admin`, and `kernel.apparmor_restrict_unprivileged_userns=0` persisted in
  `/etc/sysctl.d/60-cua-userns.conf`, as on the arm64 VM.
- **The display: real Xorg, not Xvfb.** The server has a virtio-gpu DRM device, so modesetting worked on the first
  try.
  - Xorg ran as `Xorg :0 vt7 -nolisten tcp -auth <cookie>`, with the cookie added to `~admin/.Xauthority`. It gave
    1280x800x24 with XTEST, Composite, XFIXES and RANDR.
  - openbox ran as a transient user unit: `systemd-run --user --unit=cua-openbox …`.
  - The session bus was the systemd user bus `unix:path=/run/user/1000/bus`. `dbus-update-activation-environment
    --systemd DISPLAY XAUTHORITY` and `systemctl --user start at-spi-dbus-bus.service` put `org.a11y.Bus` on it.
- **Install from the mirror deb.** `git clone` and `checkout eeef390`, then `npm ci`. The deb was copied with scp from
  `~/cua-mirror/chatgpt_26.928.40906_amd64.deb`: 10 min 49 s at about 0.7 MB/s from the Mac, with sha256
  `8094004f…bd8ad30` equal to the pin. `node bin/cua.mjs install --archive ~/mirror/chatgpt_26.928.40906_amd64.deb
  --json` exited 0 in 31.0 s (24 s on arm64) with `{"ok": true, "release": "26.928.40906-linux-x64", "source":
  "archive", "changed": true, …}`.
- **Install by download.** Without `--archive`, in a temporary home, it exited 0 in 35 s with `"source": "download"`.
  The pool still served the amd64 deb on 2026-10-07.
- **The binaries.** `readelf` reads x86-64 for `codex`, `cua_node/bin/node`, `sky_linux_x64` and
  `extension-host/linux/x64/extension-host`. The vendor manifest reads `linux`/`x64`, and the bundled node is 24.21.0.
- **Doctor.** `doctor --json` exited 0 with `ok: true`.
  - **pass:** `platform` ("linux-x64 has pinned release 26.928.40906-linux-x64"), `runtime.installed`,
    `runtime.files`, `runtime.vendor-manifest` ("… linux-x64"), `runtime.ipc` (not applicable), `runtime.signatures`
    (archive hash), `chrome.host.config` (`…/extension-host/linux/x64/extension-host`), `sandbox` (the Linux default
    with the computer surface, disabled), `run.stale`, `display`, `accessibility.bus` and `sandbox.userns`.
  - **skip:** `secrets.helper`, and the four `agent.*` rows, because this ran `main`.
  - **blocked, as expected:** `codex.login` (no login was attempted), `chrome.host.registered` and
    `chrome.hosts.live` (no Chrome on this server).
- **Native acceptance.** `node scripts/accept/linux-native.mjs --screenshot /tmp/native.jpg` ran 00:08:12–00:08:36
  UTC and returned **PASS**, exit 0:
  - window `4194552`, `org.gnome.gedit`, "fixture-e47228.txt (/tmp/cua-linux-native-F1WbLd) - gedit";
  - accessibility source `at_spi`, with marker `cua-f2-1d7f66c8` read back;
  - a 37,097-byte JPEG showing the marker on line 1;
  - `end_task` `ended`, serve exit 0, and `run/` `[]` before and after.
- **verify.mjs.** `CUA_SHIM_SURFACES=computer node verify.mjs` ran 00:08:46–00:09:02 UTC and exited 0 with
  `problems: []`.
  - The release was `26.928.40906-linux-x64` and the tools were `js, js_reset, end_task, secrets_list`.
  - `allExecutablesRelocated: true`, the native-helper step read `skip`, and `run/` was empty afterwards.
- **`typeText` in GTK3, measured again on x64.** Two attempts, on an empty buffer and after a `pressKey`, each threw
  "editable Paste did not insert text". gedit stayed alive: no segfault in `dmesg` and an empty `/var/crash`.
  - The arm64 SIGSEGV did not happen with the same gedit and GTK builds, but `typeText` does not work there either.
  - `pressKey` typed on both architectures, so the host notes' advice holds. Their word "crash" is exact for arm64
    only.
- **Tests on the server.** `npm test` after the install had 703 tests on `main`: 660 pass, 43 skipped (darwin-only),
  0 fail, in 103 s.

## Not covered

- **Chrome on x64.** It needs a signed-in profile, and no Codex login was made on the throwaway server.
- **The Linux agent with `--http`.** It shares the unit and the program arguments with `--relay`, and the unit tests
  cover it.
- **A reboot of the VM with linger on.** The VM was not to be rebooted; `Linger=yes` and `WantedBy=default.target` are
  the standard route.
