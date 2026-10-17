# #115's GCE box `cua-gce`: how it was made, what it runs, how to use it

Spec: `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`, Constraints "Machines" and M0 "Harness extensions" item 3. The box carries #115's Linux live runs: M0's probes, baselines and vendor parity control, M1/M2's Linux regression, M3's helper and own-host runs, M4's acceptance. It replaces the cua-linux Tart VM (declared, kept off) and the deleted `cua-bench` box of #116 M5.

## The instance

| | |
|---|---|
| Project, zone | `ytdownload-505811`, `europe-west4-a` (the zone of #116's `cua-bench`) |
| Name, ssh alias | `cua-gce`, `ssh cua-gce` (user `cua`) |
| Machine | `t2a-standard-4` spot (`provisioningModel: SPOT`, `instanceTerminationAction: STOP`): Ampere Altra Neoverse-N1, 4 vCPU, 16 GiB |
| Image | `ubuntu-2404-noble-arm64-v20261016` (family `ubuntu-2404-lts-arm64`), 50 GB pd-balanced; Ubuntu 24.04.5 LTS, kernel 7.0.0-1014-gcp |
| Service account | the project's default compute account (default scopes) |
| Label | `purpose=cua-115` |
| State between milestones | **stopped**, never deleted until #115 ends (`gcloud compute instances stop cua-gce --zone europe-west4-a`) |

Created 2026-10-17 08:14Z by M0c (task 3 of the execution loop), from this worktree:

```sh
ssh-keygen -t ed25519 -N '' -C cua-gce -f ~/.ssh/cua-gce_ed25519
deploy/cloud-vm/render.sh --user cua --ref main > user-data.yaml        # the cloud-VM template (deploy/cloud-vm/README.md)
printf 'cua:%s\n' "$(cat ~/.ssh/cua-gce_ed25519.pub)" > ssh-keys
gcloud compute instances create cua-gce --project ytdownload-505811 --zone europe-west4-a \
  --machine-type t2a-standard-4 --provisioning-model=SPOT --instance-termination-action=STOP \
  --image-family ubuntu-2404-lts-arm64 --image-project ubuntu-os-cloud --boot-disk-size 50GB --boot-disk-type pd-balanced \
  --metadata-from-file user-data=user-data.yaml,ssh-keys=ssh-keys --labels purpose=cua-115
```

cloud-init ran `deploy/cloud-vm/cua-provision.sh` (125 s; its log is `/var/log/cua-provision.log`, doctor at the end `/var/log/cua-provision.json`): packages, Node 22 (NodeSource, v22.23.3), Google Chrome, the user, linger, the userns sysctl, the AT-SPI dconf default, lightdm's autologin to Openbox on `:0`, the checkout `/opt/cua` at main, the pinned deb (downloaded from the pin's URL and hash-checked, kept at `/var/cache/cua/chatgpt_26.928.40906_arm64.deb`), `cua install`, `cua chrome register`, `cua profiles add me --chrome-profile Default` and `cua profiles bind me`. Doctor: every row pass except `secrets.store` blocked (no secret stored), `secrets.project`, `codex.login`, `maws.hosts` and `agent.*` skip.

Added by hand afterwards, for the probes: `sudo apt-get install -y --no-install-recommends gcc libc6-dev libx11-dev libxext-dev`.

**The first attempt used the user `admin`** (as `cua-bench` and the Tart VM did) and was deleted: Ubuntu's image has a group `admin`, so both `useradd admin` in the provisioning script and the GCE guest agent's account creation failed, and nobody could log in. The template's default user `cua` works with GCE's metadata keys (the guest agent creates it with sudo through `google-sudoers`; the provisioning script finds it existing).

## The ssh alias

`~/.ssh/config` on the MacBook, written like `cua-linux`'s entry (the address is resolved at connect time, because a spot instance's ephemeral IP changes on every start):

```
Host cua-gce
    User cua
    IdentityFile ~/.ssh/cua-gce_ed25519
    IdentitiesOnly yes
    HostKeyAlias cua-gce
    ProxyCommand /Users/new/.ssh/cua-gce-connect.sh
```

`~/.ssh/cua-gce-connect.sh` connects to the last address it resolved (cached in `~/.ssh/cua-gce.ip`) and, when that does not answer within 5 s, asks `gcloud compute instances describe cua-gce --zone europe-west4-a` for the current one (about 1.9 s), caches it and connects. `HostKeyAlias` keeps the host key bound to the instance whatever its address, so a reused address of someone else's machine fails closed.

## What is on it

| | |
|---|---|
| Desktop | lightdm autologin of `cua` into Openbox on `:0`; Xorg's dummy driver at **1280 × 800**, depth 24 (the template's choice for a GPU-less VM; `cua-bench` ran Xvfb at 1440 × 900); AT-SPI bus up from the Openbox autostart; the session's `DISPLAY`, `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus` and `XDG_RUNTIME_DIR` are what the harness reads from the Openbox process (`scripts/repl-parity/desktop.mjs`) |
| Apps | gedit 46.2, zenity, gnome-terminal (listed by sky_linux), x11vnc |
| Sandbox | bubblewrap 0.9.0; `kernel.apparmor_restrict_unprivileged_userns = 0` |
| Chrome | **Google Chrome 155.0.8059.84 arm64** (`google-chrome-stable` from Google's apt repository), started in the session with `--force-renderer-accessibility --password-store=basic --no-first-run --no-default-browser-check --profile-directory=Default` |
| cua's extension | `jkejaaijdfpohkdhankllbekkhmnippb`, force-installed by `/etc/opt/chrome/policies/managed/cua.json` from the relay's hosted CRX (`https://178-104-102-73.sslip.io/ext/update.xml`), in the `Default` profile; no sign-in anywhere |
| cua | `/opt/cua` (main at provisioning), `cua` on PATH; the default home `~/.local/share/cua` with the pinned runtime `26.928.40906-linux-arm64`, managed Node 24.22.0, cua's Chrome host registered (`~/.config/google-chrome/NativeMessagingHosts/io.github.ssfskim.cua.json`), and the profile **`me`**, bound to the `Default` profile's live extension instance |
| Clones | `~/Developer/GitHub/cua-parity` (the harnesses' clone; `prepare` checks it out at the commit it is given); `~/cua-115-probes` (the Linux probes' clone) |

**The browser lanes run on arm64 as they are.** Google ships Chrome for Linux arm64 as a deb (Chrome 154 already ran on the arm64 Tart VM, `docs/evidence/2026-10-07-own-extension-linux.md`), and `repl-parity prepare` needs exactly what the template provides: a deb Chrome (a snap or Flatpak Chrome cannot start a native host), whose main process (comm `chrome`) runs on the prepared display (the `cua-gce` declaration records its launch facts), and one ready profile bound to cua's extension in the discovery home (the default home, since `cua-gce` declares none). No Chromium substitution was needed.

## Using it

```sh
gcloud compute instances start cua-gce --zone europe-west4-a --project ytdownload-505811
ssh cua-gce uptime        # the session (lightdm, Openbox, Chrome) comes up by itself at boot
# … runs …
gcloud compute instances stop cua-gce --zone europe-west4-a --project ytdownload-505811
```

A spot instance may be preempted; it then stops (it is not deleted) and is started again the same way. Harness preparations clean up after themselves (`repl-parity cleanup-prepared --device cua-gce`; native-baseline removes each run's scratch home).
