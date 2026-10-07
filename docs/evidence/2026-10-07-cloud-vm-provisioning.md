# Cloud VM provisioning: a fresh Ubuntu VM becomes a cua device from one cloud-init template (issue #76)

Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`, Phase F (the Linux design, acceptance 8–12, the
F2 steps). Phase F and #58 provisioned their machines by hand (`docs/evidence/2026-10-06-linux-acceptance.md`,
`docs/evidence/2026-10-06-linux-agent-and-x64.md`); `deploy/cloud-vm/` does it from user data. Branch
`feat/cloud-vm-template`; the VM's checkout ran `main` at `93a82cd`, because the VM needs nothing from the branch except
the user data, which `create-hetzner.sh` rendered from the branch.

| Item | Result |
|---|---|
| From nothing to doctor `ok` | **PASS**, twice on a throwaway `cx23`. Run 1 (the deb downloaded on the VM) took 3 min 47 s from the create call to the printed doctor summary and checklist. Run 2 (the reviewed script, the owner's mirror deb uploaded) took 4 min 24 s |
| Doctor | **PASS**. `ok: true`; every row `pass` except `codex.login` and `secrets.store` (`blocked`, owner steps) and the four `agent.*` rows (`skip`, no relay) |
| `scripts/accept/linux-native.mjs` | **PASS** (gedit, `pressKey`, AT-SPI read-back, screenshot, `run/` empty) |
| `CUA_SHIM_SURFACES=computer node verify.mjs` | **PASS**, exit 0, `problems: []` |
| Chrome and the extension host | **PASS**. Chrome started by the session with the wrapper's flags; the extension present by policy; `chrome.hosts.live` "1 OpenAI Chrome host(s) running" with no sign-in; Chrome's web contents in the native route's AT-SPI tree |
| The checklist | **PASS** for every step a machine can check. `cua profiles bind me` worked before any sign-in, so provisioning now does it and the checklist keeps only what needs a person |
| Re-run, relay branch, GPU-less fallback | **PASS**. A re-run took 12 s and changed nothing; with a relay (on the VM's loopback) the enrolment, the agent unit and a client `initialize` worked; the dummy Xorg driver passed the native fixture |
| Cleanup | Both servers (169185177, 169188959) deleted; `hcloud server describe` answers "Server not found" for each |

## Run 1 (2026-10-07 08:53–09:04 UTC, the script before the review)

- **The server.** Hetzner context `cua`: `cua-vm-proof`, id **169185177**, `cx23` (x86), `ubuntu-24.04`, **fsn1**, ssh
  key `macbook`, firewall `cua-vm` (22 in). nbg1 refused the placement (`resource_unavailable` for `cx23` at 08:53), so
  the run passed `--location fsn1`; the README says to pick another location then.
- **Timeline** (the script's own clock from the create call; provisioning offsets from the VM's log):
  - 0 m 17 s server created and started at 2.28.43.138; 0 m 44 s SSH up.
  - Provisioning, from cloud-init's start of the script (08:54:09): packages +70 s, NodeSource Node 22 +93 s, Chrome
    from Google's repository +122 s (Chrome 155.0.8059.39), user, linger, sysctl, dconf and lightdm +124 s, clone and
    `npm ci` +127 s, the pinned amd64 deb downloaded from the pin's URL and checked against its sha256 in 5 s,
    `cua install --archive` 49 s, `chrome register`, Chrome's `Default` profile and the extension already present,
    `profiles add me`, doctor +182 s.
  - 3 m 38 s cloud-init `done` (`cloud-init status`: done, no errors); 3 m 47 s doctor summary and checklist printed.
- **The desktop.** lightdm autologin of `cua` on seat0/tty7; Xorg `-core :0 -seat seat0 … vt7` with the
  `modesetting` driver on virtio-gpu (`/dev/dri/card0`), 1280x800; Openbox; the session's environment on the systemd
  user bus (`DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus` in Openbox, Chrome's parent), which is the bus cua
  derives. `gsettings get org.gnome.desktop.interface toolkit-accessibility` reads `true` from the system dconf default.
- **Chrome.** `/opt/google/chrome/chrome --force-renderer-accessibility --password-store=basic --no-first-run
  --no-default-browser-check --profile-directory=Default` (the `/usr/local/bin/google-chrome` wrapper). The extension
  was force-installed by policy and opened its own "Get started | ChatGPT" tab. The apt source is the deb822
  `google-chrome.sources` Chrome's own package maintains; `apt-get update` afterwards printed no warning or conflict.
- **Doctor at the end of provisioning** (`/var/log/cua-provision.json`): `ok: true`. `pass`: `platform`,
  `runtime.installed`, `runtime.files`, `runtime.vendor-manifest` (linux-x64), `runtime.ipc`, `runtime.signatures`,
  `chrome.host.config`, `sandbox` (disabled, the Linux default with the computer surface), `run.stale`, `display`
  (XTEST, Composite, XFIXES), `accessibility.bus` (`org.a11y.Bus` on `/run/user/1000/bus`), `sandbox.userns`
  (bubblewrap creates a user namespace; the sysctl), `chrome.extension.me`, `chrome.host.registered`. `blocked`:
  `secrets.store` (no store yet), `codex.login` (no login: owner step), and `chrome.hosts.live`: doctor ran one second
  after `chrome register`, before the extension had reconnected. `skip`: `agent.*`.
- **Doctor a minute later** (08:59): `ok: true`, `chrome.hosts.live` **pass** ("1 OpenAI Chrome host(s) running"; the
  host's parent is Chrome, its path under `~/.local/share/cua/runtimes/26.928.40906-linux-x64/`). The provisioning
  script now waits for the host, up to 90 s, before it binds and runs doctor; run 2 below records the result.
- **Native acceptance** (as `cua` over SSH, `DISPLAY=:0 XAUTHORITY=~/.Xauthority`, 08:58:03–08:58:29):
  `node scripts/accept/linux-native.mjs --screenshot /tmp/native.jpg` **PASS**: window `18874616` `org.gnome.gedit`,
  accessibility source `at_spi`, marker `cua-f2-829318cf` read back, a 36,879-byte JPEG, `end_task` `ended`, serve
  exit 0, `run/` `[]` before and after.
- **verify.mjs** (08:58:29–08:58:45): `CUA_SHIM_SURFACES=computer node verify.mjs` exit 0, `problems: []`, release
  `26.928.40906-linux-x64`, tools `js, js_reset, end_task, secrets_list, devices_list, devices_use`; `run/` empty.
- **Chrome through the native route.** A throwaway probe over `cua serve` bound Chrome's window by id: source `at_spi`,
  95 lines, including `document web Get started | ChatGPT`, `heading Log in or sign up` and the page's links. So the
  wrapper's flag and the dconf default give the native route Chrome's web contents (F2's finding, now provisioned).
- **The checklist's bind step, tried** (09:00): `cua profiles bind me` before any sign-in listed one backend
  (Chrome profile `Default`, "Your Chrome") and bound it by directory; `cua profiles list` read `me ready`. The issue
  and the brief listed the bind as an owner step; it needs no person, so the provisioning script binds after the host
  is live and the checklist keeps the step only when that fails.
- **Re-run** (09:01, the updated script copied over the installed one): exit 0 in **12 s**: no package installed, no
  file rewritten (lightdm not restarted), `cua install` `changed: false`, the host registration `unchanged`, `me`
  already registered, then bound again; doctor `ok: true`; the checklist down to two steps (sign-in, `cua login`).
- **The relay branch** (09:01–09:03), against a relay on the VM's own loopback rather than the standing `cua-relay`
  (nothing on that server or in its table was touched): `cua-relay` from the checkout as a transient unit on
  `127.0.0.1:7800` with an empty table, `CUA_RELAY='ws://127.0.0.1:7800/ws'` in `/etc/cua-provision.conf`, then the
  script again: 13 s; `enrol with ws://127.0.0.1:7800/ws` wrote `/root/cua-enrollment.json` (mode 600, owner root; keys
  `clientCredential, clientRegisterCommand, clientSecretKey, deviceId, devicesAddCommand, devicesEntry, ok,
  relayEndpoint, relayUrl`; the credential was never displayed), and `cua agent install` started
  `cua-agent.service` (`/usr/bin/node /opt/cua/bin/cua.mjs agent run --relay`, `DISPLAY=:0`, linger on). The checklist
  gained the relay table step and the client credential step. Following them: `cua remote show --json`'s
  `devicesEntry` became the relay's table, the relay restarted, the agent logged `relay: connected to
  ws://127.0.0.1:7800/ws as device qKiB9kZo4mQXrtFlzxAtSQ`, doctor's `agent.installed`, `agent.running`,
  `agent.enrolled` and `agent.console` all **pass**, and a client `initialize` through the relay with the credential
  from the file (read into a shell variable, never printed) answered 200 with an `Mcp-Session-Id` (`serverInfo` rmcp
  1.5.0); its `DELETE` 200; a POST without the bearer 401.
- **GPU-less fallback** (09:03): the script's own dummy-driver `xorg.conf.d` file installed by hand on this VM (which
  has a GPU) and lightdm restarted: Xorg loaded `dummy` ("Depth 24, framebuffer bpp 32"), 1280x800 with XTEST,
  Composite and XFIXES, and `linux-native.mjs` **PASS** on it. The file was removed and lightdm restarted on
  modesetting.
- **Deleted** at 09:03:56: `hcloud server delete cua-vm-proof`; `hcloud server describe 169185177` answers "Server not
  found"; `hcloud server list` shows only `cua-relay`. About 11 minutes of server time.

## Run 2: the finished script from nothing, with the mirror deb uploaded

The script after the review's fix wave (`0723c03`), from nothing, with `--deb` uploading the owner's mirror copy
instead of the VM downloading it:

```sh
deploy/cloud-vm/create-hetzner.sh --name cua-vm-proof --arch x64 --location fsn1 \
  --deb ~/cua-mirror/chatgpt_26.928.40906_amd64.deb
```

- **The server.** `cua-vm-proof`, id **169188959**, `cx23`, fsn1; Ubuntu 24.04.4 LTS, kernel `6.8.0-138-generic`
  x86_64; Chrome 155.0.8059.39; Node v22.23.3.
- **Timeline** (09:17:27 UTC start):
  - The mirror deb checked against the x64 pin on the Mac before anything was created.
  - 0 m 16 s server created; 0 m 36 s SSH up; the deb copy started in the background to `/var/cache/cua/upload.deb`.
  - Provisioning (from 09:18:00): packages +66 s, Node +88 s, Chrome +115 s, desktop and clone +116 s, `npm ci`
    +118 s, then waiting for the upload from +120 s.
  - 3 m 19 s the copy finished (about 2.4 MB/s from the Mac this time; 0.7 MB/s in #58's run).
  - +172 s the VM checked the upload against its own pin and renamed it to `chatgpt_26.928.40906_amd64.deb`;
    `cua install` +215 s; the extension already in `Default`; the host live; `bound me to extension instance
    e8fdff4c-…`; doctor +222 s.
  - **4 m 16 s cloud-init done; 4 m 24 s doctor summary and checklist printed.** That is the time from create to
    doctor `ok`.
- **Doctor at the end of provisioning:** `ok: true`. Every row `pass`, `chrome.hosts.live` included ("1 OpenAI Chrome
  host(s) running"), except `secrets.store` and `codex.login` (`blocked`) and the four `agent.*` rows (`skip`).
- **The printed checklist** had two steps: the ChatGPT sign-in through the tunnel (`ssh -t -o ExitOnForwardFailure=yes
  -L 5901:localhost:5900 cua@<ip> '… x11vnc -display :0 -localhost -once -quiet -passwd "$p"'`, then
  `vnc://localhost:5901`), and `cua login --device-auth`. Its check line, `ssh cua@<ip> DISPLAY=:0 cua doctor`, ran
  as printed and ended "passive runtime checks pass; live capability remains unverified (blocked: secrets.store,
  codex.login)". The sign-in and `cua login` were not attempted (they are the owner's).
- **Acceptance on it** (as `cua` over SSH with `DISPLAY=:0`):
  - `scripts/accept/linux-native.mjs` 09:22:19–09:22:43: **PASS**, all seven steps.
  - `CUA_SHIM_SURFACES=computer node verify.mjs` to 09:22:59: exit 0, `problems: []`, release
    `26.928.40906-linux-x64`.
  - `cua profiles list`: `me ready Default extension instance e8fdff4c-…`; `run/` empty.
- **The fixed files.** `~/.config/openbox/autostart` `cua:cua 644`, `~/.ssh` `cua:cua 700`, `authorized_keys`
  `cua:cua 600`, all written as the user. `/var/cache/cua` holds only the renamed deb.
- **Re-run** (09:23:10): exit 0 in **10 s**; no package set up; no `npm ci` (the stamp matched); doctor `ok: true`.
- **Deleted** at 09:23:33. `hcloud server describe 169188959` answers "Server not found", and `hcloud server list`
  shows only `cua-relay`. About 6 minutes of server time.
- **Left on the account:** the firewall `cua-vm` (SSH in only). It costs nothing; `create-hetzner.sh` creates it once
  and reuses it, as `relay/deploy` does with its own.
- **Noise:** the SSH client printed `hostfile_replace_entries: link … known_hosts.old: File exists` once. It comes
  from `ssh-keygen -R` leaving `known_hosts.old` before `accept-new` records the new key. It is harmless and is the
  same as with `relay/deploy/create-server.sh`.

## Review

One opus review of the branch at `ce33926` found four Important findings. All four were fixed in `0723c03` by a
fix-wave worker and proven by run 2:

- **Re-running as root could have given the desktop user root.** The re-run wrote `~/.ssh/authorized_keys` and the
  Openbox autostart as root into directories the user controls, following the user's symlinks. Everything under the
  home is now written as the user, and the keys are copied only when the user has none.
- **The enrolment file went stale after a relay move.** After a move it still named the old relay's
  `devicesAddCommand`. Its non-secret fields are now refreshed after the move.
- **The checklist's doctor check failed over SSH**, because the command set no `DISPLAY`. It now passes `DISPLAY=:0`.
- **The upload could miss the VM's pin.** `create-hetzner.sh` and the VM could pick different pins, and the VM would
  then wait an hour. The upload now goes to a fixed name, and the VM checks it against its own pin; a failed copy
  leaves `upload.deb.failed`, which ends the wait at once.

The minor findings were fixed too:

- The script is embedded as `gz+b64`, so the user data is about 10 KB and fits AWS's 16 KB limit; the test asserts it.
- An `npm ci` stamp means a failed `npm ci` is retried.
- The exit trap stops the background copy and prints the delete command after a failure.
- Only `cloud-init status` 0 or 2 count as done.
- The tunnel uses port 5901, so it does not collide with the Mac's own Screen Sharing.
- A ref starting with `-` is refused.
- The README says a re-run with a relay restarts the agent unit.

## Decisions made here

- **Xorg's dummy driver, not Xvfb, on a VM without a GPU.** lightdm starts its X server with seat and VT arguments
  (`-seat seat0 … vt7 -novtswitch`) that Xvfb does not take, so a GPU-less VM keeps the same lightdm autologin path
  with `xserver-xorg-video-dummy` and one `xorg.conf.d` file. The run above proved it.
- **`cua profiles bind me` in provisioning** (beyond the issue's list): it needs a live extension host, which the
  extension starts without a sign-in, and no person.
- **The owner's view of the screen** is an SSH tunnel to `x11vnc` on localhost with a password generated on the VM
  for that one session, or the provider's web console. The password is there so any VNC client, macOS Screen Sharing
  included, can connect. No VNC port is ever open, and the firewall admits SSH only.
- **The VM's user has no sudo and no password**; root's SSH keys are copied to it. An agent that needs root asks the
  operator, who has `ssh root@`.
- **`--password-store=basic`** for Chrome: an autologin session has no login password to unlock a keyring with, and
  a keyring prompt would sit on the agent's screen. Chrome's cookies on disk are then protected by the VM's disk and
  account, not by a keyring.
- **The relay credential stays root-only** (`/root/cua-enrollment.json`, 0600), out of reach of a model running as
  the desktop user.
