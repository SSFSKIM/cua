# A cloud VM as a cua device

One cloud-init template that turns a fresh Ubuntu 24.04 VM into a machine a cloud agent drives with cua: its own X11
desktop, Google Chrome with OpenAI's extension, cua and the pinned runtime installed, and the agent for remote control
when a relay is given. It does by script what Phase F and issue #58 did by hand (the README's "Linux" section;
`docs/evidence/2026-10-06-linux-acceptance.md`, `docs/evidence/2026-10-06-linux-agent-and-x64.md`). The live proof is
`docs/evidence/2026-10-07-cloud-vm-provisioning.md`.

| File | What it is |
|---|---|
| `cloud-init.yaml` | The user-data template: writes the parameters and the provisioning script, runs it |
| `render.sh` | Prints the user data with the parameters filled in, for any provider |
| `cua-provision.sh` | Runs on the VM as root (`/usr/local/sbin/cua-provision.sh`); every step is idempotent, so running it again repairs or upgrades |
| `create-hetzner.sh` | The reference provider script: creates the server on Hetzner Cloud, waits, prints the doctor summary and the owner's checklist |

## Create one on Hetzner

```sh
deploy/cloud-vm/create-hetzner.sh --name cua-vm                         # cx23 (x64) in nbg1, downloads the pinned deb on the VM
deploy/cloud-vm/create-hetzner.sh --name cua-vm --arch arm64            # cax11
deploy/cloud-vm/create-hetzner.sh --name cua-vm --deb ~/cua-mirror/chatgpt_26.928.40906_amd64.deb   # upload your mirror copy
deploy/cloud-vm/create-hetzner.sh --name cua-vm --relay wss://<relay>/ws # also enrol it and run the agent
```

Other flags: `--type`, `--location` (Hetzner sometimes has no capacity for a type in a location: pick another, such as
`fsn1`), `--ssh-key` (default `macbook`), `--user` (default `cua`), `--ref` (default `main`). The hcloud context is
`$HCLOUD_CONTEXT`, `cua` when unset; `devbox` is refused. The server gets the firewall `cua-vm` (SSH in only, created
once and shared). The script refuses a name that already exists, and prints the delete command when it is done. A
server costs money for every hour it exists: `hcloud server delete <name>`.

On another provider, `deploy/cloud-vm/render.sh [--user …] [--ref …] [--deb …] [--relay …] > user-data.yaml` and pass
that file as the server's user data (it stays under the 32 KiB most providers allow).

## What the VM ends up with

- **Desktop.** lightdm logs the user (`--user`, default `cua`; no password, no sudo, root's SSH keys) in to Openbox on
  `:0`. Xorg drives the VM's virtual GPU (`virtio-gpu` on Hetzner), or the dummy driver at 1280x800 when there is no
  `/dev/dri/card*`. Linger is on, so the user's systemd manager and session bus run from boot. The session keeps the
  screen on, puts AT-SPI's bus up and starts Chrome.
- **Packages.** The ones cua and its doctor need (`binutils xz-utils x11-utils dbus-x11 bubblewrap at-spi2-core`), the
  desktop (`xorg openbox lightdm dbus-user-session`), `gedit`, `zenity`, `jq` and `x11vnc`.
- **Chrome.** `google-chrome-stable` from Google's apt repository (a deb; a Flatpak or snap Chrome cannot start a native
  host). OpenAI's extension is force-installed by policy (`/etc/opt/chrome/policies/managed/cua.json`).
  `/usr/local/bin/google-chrome` adds `--force-renderer-accessibility` (web contents in the native route's tree),
  `--password-store=basic` (no keyring prompt in an autologin session) and no first-run prompts. Toolkit accessibility
  is on as a system dconf default. One profile, `Default`.
- **Sandbox.** `kernel.apparmor_restrict_unprivileged_userns = 0` (`/etc/sysctl.d/60-cua-userns.conf`), so the scoped
  sandbox works for the browser surface alone and for `cua profiles list` and `bind`. With the computer surface the
  Linux default is `disabled` (README, "Linux": the runtime's sandbox refuses every socket, X's included).
- **cua.** Node 22 (NodeSource), a checkout of `--ref` at `/opt/cua` owned by the user, `npm ci`, `cua` on `PATH`, the
  pinned runtime installed in `~/.local/share/cua`, the Chrome host registered, and the profile `me` registered for
  `Default`.
- **The deb.** By default the VM downloads the pin's official URL (about 450 MB); `--deb <https URL>` downloads a
  mirror instead; `--deb <file>` makes `create-hetzner.sh` copy your copy while cloud-init runs, and the VM waits for it
  (with `render.sh` alone, copy it to `/var/cache/cua/<its file name>` yourself). Either way the bytes are checked
  against the pin's sha256 before `cua install --archive` checks them again; the file stays in `/var/cache/cua`.
- **Remote control** (with `--relay`): `cua remote enroll --relay … --json` into `/root/cua-enrollment.json` (0600, the
  only place the client credential is written), then `cua agent install` (the systemd user unit). A re-run with
  another relay URL moves the enrolment without rotating it.
- **Results.** `/var/log/cua-provision.json` is `cua doctor --json` at the end of the run;
  `/var/lib/cua-provision/checklist.txt` is the owner's checklist; `/var/log/cua-provision.log` the whole output.

## What it leaves to the owner

Printed at the end as a checklist with the VM's address filled in, because each needs a person or a decision:

1. Sign in to ChatGPT in the VM's Chrome. The screen is reachable through an SSH tunnel to `x11vnc` with a one-time
   password (the checklist has the command; macOS: open `vnc://localhost:5900`), or the provider's web console.
2. `cua login --device-auth` over SSH (the server's Codex login).
3. `cua profiles bind me`.
4. With a relay: add the device's `devices.json` line (`cua remote show`) to the relay's table with
   `relay/deploy/update.sh --devices` (the file replaces the whole table), and give the client its credential
   (`/secret <clientSecretKey>`, then the `devicesAddCommand`, both in `/root/cua-enrollment.json`).

Before step 1 doctor reads `codex.login` blocked and `chrome.profiles` not ready; everything else passes, including
`chrome.hosts.live`, because the extension starts cua's host without a sign-in.

## Re-running and upgrading

`ssh root@<vm> /usr/local/sbin/cua-provision.sh` repeats every step: packages and Chrome are installed only when
missing, files are rewritten only when different (lightdm restarts only then), the checkout moves to the `CUA_REF` in
`/etc/cua-provision.conf` and runs `npm ci` when it moved, `cua install` is a no-op for an installed release, and a
registered profile or an existing enrolment is kept. Edit the conf to change the ref or the relay.
