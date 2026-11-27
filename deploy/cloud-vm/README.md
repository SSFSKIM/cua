# A cloud VM as a cua device

One cloud-init template that turns a fresh Ubuntu 24.04 VM into a machine a cloud agent drives with cua: its own X11
desktop, Google Chrome with cua's own extension, cua and its own Linux runtime installed, and the agent for remote
control when a relay is given. Nobody signs in to anything: cua's own extension and host need no account
(`docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`). It does by script what Phase F and issue #58 did
by hand (the README's "Linux" section; `docs/evidence/2026-10-06-linux-acceptance.md`,
`docs/evidence/2026-10-06-linux-agent-and-x64.md`). The live proof is
`docs/evidence/2026-10-07-cloud-vm-provisioning.md`.

| File | What it is |
|---|---|
| `cloud-init.yaml` | The user-data template: writes the parameters and the provisioning script, runs it |
| `render.sh` | Prints the user data with the parameters filled in, for any provider |
| `cua-provision.sh` | Runs on the VM as root (`/usr/local/sbin/cua-provision.sh`); every step is idempotent, so running it again repairs or upgrades |
| `create-hetzner.sh` | The reference provider script: creates the server on Hetzner Cloud, waits, prints the doctor summary and the owner's checklist |

## Create one on Hetzner

```sh
deploy/cloud-vm/create-hetzner.sh --name cua-vm                         # cx23 (x64) in nbg1; no deb needed
deploy/cloud-vm/create-hetzner.sh --name cua-vm --arch arm64            # cax11
deploy/cloud-vm/create-hetzner.sh --name cua-vm --deb pin               # also require OpenAI's deb, for the vendor engine
deploy/cloud-vm/create-hetzner.sh --name cua-vm --deb ~/cua-mirror/chatgpt_26.928.40906_amd64.deb   # the same, from your copy
deploy/cloud-vm/create-hetzner.sh --name cua-vm --relay wss://<relay>/ws # also enrol it and run the agent
deploy/cloud-vm/create-hetzner.sh --name cua-vm --extension store        # cua's extension from the Chrome Web Store
git bundle create /tmp/cua.bundle my-branch                              # an unpushed branch: upload it as a bundle
deploy/cloud-vm/create-hetzner.sh --name cua-vm --ref my-branch --repo /tmp/cua.bundle
```

Other flags: `--type`, `--location` (Hetzner sometimes has no capacity for a type in a location: pick another, such as
`fsn1`), `--ssh-key` (default `macbook`), `--user` (default `cua`), `--ref` (default `main`), `--repo` (default
`https://github.com/SSFSKIM/cua`; a local git bundle holding `--ref` as a branch, `git bundle create <file> <branch>`,
is copied to the VM's `/var/cache/cua/cua.bundle` while cloud-init runs, and the VM waits for it; a tag or a commit id
is refused), `--extension hosted|store` (default `hosted`) and `--extension-url` (the hosted update manifest, default
`https://178-104-102-73.sslip.io/ext/update.xml`). `--extension-url` only says where Chrome first installs from: the
CRX carries its own `update_url`, `<--base-url>update.xml` from `npm run extension:pack`, so a VM pointed at another
URL installs from there but takes later versions from the packer's URL. Pack with the same base URL you pass here. The hcloud context is
`$HCLOUD_CONTEXT`, `cua` when unset; `devbox` is refused. The server gets the firewall `cua-vm` (SSH in only, created
once and shared). The script refuses a name that already exists, and prints the delete command when it is done. A
server costs money for every hour it exists: `hcloud server delete <name>`.

On another provider, `deploy/cloud-vm/render.sh [--user …] [--ref …] [--repo …] [--deb …] [--relay …] [--extension …]
[--extension-url …] > user-data.yaml` and pass
that file as the server's user data (about 10 KB: the script is embedded gzipped, so it fits AWS EC2's 16 KiB as well
as Hetzner's 32 KiB).

## What the VM ends up with

- **Desktop.** lightdm logs the user (`--user`, default `cua`; no password, no sudo, root's SSH keys) in to Openbox on
  `:0`. Xorg drives the VM's virtual GPU (`virtio-gpu` on Hetzner), or the dummy driver at 1280x800 when there is no
  `/dev/dri/card*`. Linger is on, so the user's systemd manager and session bus run from boot. The session keeps the
  screen on, puts AT-SPI's bus up, sets `org.a11y.Status` `IsEnabled` to true before any application starts (Qt 6
  applications put their accessibility tree on the bus only then; doctor's `accessibility.enabled` row checks it) and
  starts Chrome.
- **Packages.** The ones cua and its doctor need (`binutils xz-utils x11-utils dbus-x11 bubblewrap at-spi2-core`), the
  desktop (`xorg openbox lightdm dbus-user-session`), `gedit`, `zenity`, `jq` and `x11vnc`.
- **Chrome.** `google-chrome-stable` from Google's apt repository (a deb; a Flatpak or snap Chrome cannot start a native
  host). cua's extension (id `jkejaaijdfpohkdhankllbekkhmnippb`) is force-installed by policy
  (`/etc/opt/chrome/policies/managed/cua.json`, the whole `ExtensionInstallForcelist`: Chrome does not merge one
  policy across files there). With `--extension hosted` it comes from the self-hosted CRX the relay serves
  (`CUA_EXTENSION_KEY=<the owner's key> npm run extension:pack`, then `relay/deploy/update.sh --ext dist`); with
  `store`, from the Chrome Web Store (see "Hosted or store" below).
  `/usr/local/bin/google-chrome` adds `--force-renderer-accessibility` (web contents in the native route's tree),
  `--password-store=basic` (no keyring prompt in an autologin session) and no first-run prompts. Toolkit accessibility
  is on as a system dconf default. One profile, `Default`.
- **Sandbox.** `kernel.apparmor_restrict_unprivileged_userns = 0` (`/etc/sysctl.d/60-cua-userns.conf`), so the scoped
  sandbox, the Linux default for every surface since 0.15.0, works for the computer and browser surfaces and for
  `cua profiles list` and `bind` (README, "Linux").
- **cua.** Node 22 (NodeSource, unless Node 22.14+ or 23.7+ is already on `PATH`), a checkout of `--ref` at `/opt/cua`
  owned by the user, `npm ci`, `cua` on `PATH`, cua's own Linux runtime installed in `~/.local/share/cua` (its module
  tree, the pinned Node 24, the sandbox helper and the engine: the main README, "Linux", cua's own Linux runtime), cua's
  Chrome host registered (`cua chrome register`), and the profile `me` registered for `Default` and bound. The engine
  is the pinned `cua-engine` for the VM's architecture, at `~/.local/share/cua/engine/linux/cua-engine`, its SHA-256
  checked against `runtime/engine/linux-engine.json`, and the computer surface runs on it by default. A failed install
  of cua's own runtime fails the provisioning (exit 1, which cloud-init reports), with the install's error and remedy
  in the checklist. The user's `~/.config/cua/engine.json` gets
  `"desktop": "dedicated"`, beside any keys it already has: the desktop belongs to the agent, so cua's engine may bring
  a window forward for an application that ignores background input instead of refusing it. A mode already set there
  is kept. The extension starts cua's host as soon as the registration is there,
  so the bind needs no one; if it fails (Chrome not up yet), the checklist keeps it.
- **The deb.** OpenAI's Linux package is needed only for `CUA_NATIVE_ENGINE=vendor`. With `--deb none`, the default,
  the VM fetches and waits for nothing: its `cua install` still tries the pin's official URL for the vendor's tree
  (about 450 MB), and a failure there leaves a working device. The other values ask for the vendor's tree, and the VM
  first installs and registers cua's own runtime as under `none` (`cua install`, `cua chrome register`, the profile).
  Only then does it get the deb: `--deb pin` from the pin's official URL (not again when that first `cua install`
  already placed the tree from there), `--deb <https URL>` from a mirror, and `--deb <file>` from your copy, which
  `create-hetzner.sh` copies to the VM's `/var/cache/cua/upload.deb` while cloud-init runs, and the VM waits for it
  (with `render.sh` alone, copy it there yourself; a failed copy is marked `upload.deb.failed`, which ends the wait).
  The bytes are checked against the VM checkout's pin before `cua install --archive` checks them again, where the
  tree is then required; the file stays in `/var/cache/cua` under the pin's name. A deb the VM cannot get, or an
  install with it that fails, stops the provisioning there with the device working (exit 0), the checklist saying
  why.
- **Remote control** (with `--relay`): `cua remote enroll --relay … --json` into `/root/cua-enrollment.json` (0600, the
  only place the client credential is written), then `cua agent install` (the systemd user unit). A re-run with
  another relay URL moves the enrolment without rotating it.
- **Results.** `/var/log/cua-provision.json` is `cua doctor --json` at the end of the run;
  `/var/lib/cua-provision/checklist.txt` is the owner's checklist; `/var/log/cua-provision.log` the whole output.

## Hosted or store

`hosted` is the default while cua's extension is not on the Chrome Web Store: Chrome installs the CRX the owner packed
and published on the relay. Once the Store item is published (unlisted is enough: the force-list installs it by id),
`--extension store` selects it per VM, and flipping the default makes it the norm: `CUA_EXTENSION` in
`cua-provision.sh`, `extension` in `render.sh`, `create-hetzner.sh`'s usage and this README. The id is the same either
way, so the host registration and the profile binding do not change.

The flip is for new VMs. Chrome uses a force-list entry's update URL only for the first install; later updates come
from the `update_url` inside the installed copy (Chromium's `ExtensionInstallForcelist` definition), and the
`ExtensionSettings` override does not apply to a Store URL. So a VM that installed the hosted CRX keeps updating from
the relay even after its `/etc/cua-provision.conf` says `store`: keep publishing new versions there with
`relay/deploy/update.sh --ext` while such VMs exist, or replace them. Moving an installed VM from the hosted copy to
the Store's in place (taking it off the force-list so Chrome uninstalls it, then listing the Store's, then binding
again, since an uninstall drops the instance id) is untested.

## What it leaves to the owner

Printed at the end as a checklist with the VM's address filled in, because each needs a person or a decision. Without
a relay it is empty when the bind succeeded; with one:

1. Add the device's `devices.json` line (`cua remote show`) to the relay's table with `relay/deploy/update.sh
   --devices` (the file replaces the whole table), and give the client its credential (`/secret <clientSecretKey>`,
   then the `devicesAddCommand`, both in `/root/cua-enrollment.json`).

Doctor reads `ok: true` with `secrets.store` blocked (no secret has been stored on the VM; cua's file store works on
Linux, `cua secrets set KEY` at the VM's terminal). Every other row passes, `chrome.hosts.live` included, but
`runtime.vendor` reads `skip` where OpenAI's package was not placed, and the `agent.*` rows read `skip` without a relay
or `pass` with one. To see the screen: `ssh -t -L 5901:localhost:5900 <user>@<vm> x11vnc -display :0 -localhost -once
-passwd <one-time password>`, then open `vnc://localhost:5901` (or use the provider's web console).

## Re-running and upgrading

`ssh root@<vm> /usr/local/sbin/cua-provision.sh` repeats every step: packages and Chrome are installed only when
missing, files are rewritten only when different (lightdm restarts only then), the checkout moves to the `CUA_REF` in
`/etc/cua-provision.conf` and runs `npm ci` when it moved, `cua install` is a no-op for parts already installed, and a
registered profile or an existing enrolment is kept (a changed relay URL moves it and refreshes the relay fields of
`/root/cua-enrollment.json`). Edit the conf to change the relay; the ref changes with `update.sh` (below). With a relay, a re-run restarts the agent
unit (`cua agent install` always does), which ends any remote session open at that moment. On a VM provisioned by an earlier
version of this template, whose force-list named OpenAI's extension, a re-run is the migration: the force-list now names
only cua's extension, so Chrome uninstalls the other, cua's host registers and the profile re-binds; no sign-in is
involved. `cua chrome register` then prints, and doctor's `chrome.route` row names until they are done, the steps that
remove what the earlier registration left in cua's home and Chrome's native-messaging directory. Root's SSH keys are copied
to the user only while the user has none, and everything under the user's home is written as the user.

To upgrade, run `deploy/cloud-vm/update.sh root@<vm> [--ref <ref>] [--bundle]` from your checkout. It resolves the ref
(default `HEAD`) once to a commit, checks that the VM's `CUA_REPO` can give exactly that commit (`--bundle` first
replaces a stale uploaded bundle with one of yours), installs that commit's `cua-provision.sh` on the VM, sets
`CUA_REF` to the commit's ID, runs it, and checks that the checkout ends there. From cua 0.30.0 a template must be
rendered from the ref it provisions: the provisioner stops before `npm ci` and `cua install` unless it is byte for
byte the checked-out commit's own `deploy/cloud-vm/cua-provision.sh`, and it provisions cua 0.30.0 or later only.

A VM provisioned before cua's own Linux runtime (#171 M6a) needs this re-run once its `CUA_REF` reaches that release:
until the checkout's `cua install` has run, every session there is refused (`runtime_not_installed`; the main README,
"Updating on Linux"). Its `/usr/local/sbin/cua-provision.sh` is still the earlier script, which takes the deb from
`/var/cache/cua` first, as it always did, then runs the same install.
