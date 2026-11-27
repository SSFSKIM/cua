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
| `cua-provision.sh` | Runs on the VM as root (`/usr/local/sbin/cua-provision.sh`); every step is idempotent, so running it again repairs the VM at its commit. It provisions only the commit whose own provisioner it is |
| `update.sh` | Run from your checkout: upgrades a VM to one commit, binding the VM's provisioner, its `CUA_REF` and its checkout to it (see "Re-running and upgrading") |
| `create-hetzner.sh` | The reference provider script: creates the server on Hetzner Cloud, waits, prints the doctor summary and the owner's checklist |

## Create one on Hetzner

```sh
deploy/cloud-vm/create-hetzner.sh --name cua-vm                         # cx23 (x64) in nbg1
deploy/cloud-vm/create-hetzner.sh --name cua-vm --arch arm64            # cax11
deploy/cloud-vm/create-hetzner.sh --name cua-vm --relay wss://<relay>/ws # also enrol it and run the agent
deploy/cloud-vm/create-hetzner.sh --name cua-vm --extension store        # cua's extension from the Chrome Web Store
git bundle create /tmp/cua.bundle my-branch                              # an unpushed branch: upload it as a bundle
deploy/cloud-vm/create-hetzner.sh --name cua-vm --ref my-branch --repo /tmp/cua.bundle
```

Run the script from a checkout of the `--ref` the VM will provision: the VM's provisioner runs only as the provisioner
of the commit it checks out (see "Re-running and upgrading"). There is no `--deb`: since cua 0.30.0 the VM installs no
OpenAI package, and both scripts refuse the flag with one sentence.

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

On another provider, `deploy/cloud-vm/render.sh [--user …] [--ref …] [--repo …] [--relay …] [--extension …]
[--extension-url …] > user-data.yaml` from a checkout of the `--ref`, and pass
that file as the server's user data (about 10 KB: the script is embedded gzipped, so it fits AWS EC2's 16 KiB as well
as Hetzner's 32 KiB).

## What the VM ends up with

- **Desktop.** lightdm logs the user (`--user`, default `cua`; no password, no sudo, root's SSH keys) in to Openbox on
  `:0`. Xorg drives the VM's virtual GPU (`virtio-gpu` on Hetzner), or the dummy driver at 1280x800 when there is no
  `/dev/dri/card*`. Linger is on, so the user's systemd manager and session bus run from boot. The session keeps the
  screen on, puts AT-SPI's bus up, sets `org.a11y.Status` `IsEnabled` to true before any application starts (Qt 6
  applications put their accessibility tree on the bus only then; doctor's `accessibility.enabled` row checks it) and
  starts Chrome.
- **Packages.** The ones cua and its doctor need (`x11-utils dbus-x11 bubblewrap at-spi2-core`), the
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
- **No OpenAI package.** cua 0.30.0 retired the vendor's engine on Linux, so the VM's `cua install` fetches, waits for
  and unpacks no ChatGPT deb, and `--deb` and `CUA_DEB` are gone: `render.sh` and `create-hetzner.sh` refuse `--deb`
  with one sentence, and a conf from an earlier template that still sets `CUA_DEB` gets one log line saying it is no
  longer used. A VM that an earlier template made may still hold the package's tree in `~/.local/share/cua/runtimes/`;
  cua reports it (`cua install`, and doctor's informational `runtime.retired` row) and never deletes it (the main README,
  "Updating on Linux").
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
Linux, `cua secrets set KEY` at the VM's terminal). On a fresh VM every other row passes, `chrome.hosts.live` included,
but the `agent.*` rows read `skip` without a relay or `pass` with one (a VM upgraded from an older template may also show
`runtime.retired: skip`, naming the OpenAI package's tree the older template left). To see the screen: `ssh -t -L 5901:localhost:5900 <user>@<vm> x11vnc -display :0 -localhost -once
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

A VM provisioned before cua 0.30.0 keeps the provisioner it was created with, because a re-run moves the checkout and
never that script. Run against a 0.30.0 checkout, an earlier provisioner asks it for a Linux deb pin, which no longer
exists, or passes `cua install --archive`, which Linux no longer takes. The checkout answers both with a sentence naming
`update.sh`, in `/var/log/cua-provision.log`. What each does then differs. A script from before cua's own Linux runtime
(#171 M6a) stops there, before any install, with the checkout already moved: while the home lacks cua's own runtime every
session is refused (`runtime_not_installed`; the main README, "Updating on Linux"). M6a's script with `CUA_DEB=none`, the
default, runs to the end. With a pin, a mirror or an upload it installs and registers, then stops at the deb step with
exit 0, skipping the relay move and the agent restart; an upload first waits out `CUA_DEB_WAIT` for a deb that never
comes. `update.sh` repairs each of them: it replaces the script, then runs it.
