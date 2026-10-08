#!/usr/bin/env bash
# Turn a fresh Ubuntu 24.04 VM into a cua device (deploy/cloud-vm/README.md). cloud-init installs this script as
# /usr/local/sbin/cua-provision.sh with its parameters in /etc/cua-provision.conf and runs it once as root; running it
# again repeats every step, and each step changes only what is missing or different, so a re-run repairs or upgrades
# (a new CUA_REF in the conf moves the checkout). The parameters (render.sh writes them):
#   CUA_USER     the desktop user the agent works as (autologin on :0, owns the checkout and cua's home)
#   CUA_REF      the git ref of CUA_REPO checked out at /opt/cua
#   CUA_REPO     the repository (https://github.com/SSFSKIM/cua), or `upload`: a git bundle holding CUA_REF that the
#                operator copies to /var/cache/cua/cua.bundle (the script waits up to CUA_DEB_WAIT seconds for it)
#   CUA_DEB      where the pinned ChatGPT deb comes from: `pin` (the pin's own URL), an https URL (a mirror; the bytes
#                must still match the pin), or `upload` (the operator copies it to /var/cache/cua/upload.deb; the
#                script waits up to CUA_DEB_WAIT seconds for it, then stops at that step)
#   CUA_RELAY    optional wss:// relay URL: enrol the device there and install the agent as a systemd user unit
#   CUA_EXTENSION      where Chrome force-installs cua's extension from: `hosted` (default), the self-hosted CRX named
#                      by CUA_EXTENSION_URL's update manifest, or `store` (the Chrome Web Store listing)
#   CUA_EXTENSION_URL  the hosted update manifest (default the relay's /ext/update.xml, relay/deploy/update.sh --ext)
# Results: /var/log/cua-provision.json is `cua doctor --json` at the end, /var/lib/cua-provision/checklist.txt the
# owner's remaining steps (also printed), /var/log/cua-provision.log this script's output. Nothing it prints or logs is
# a credential: a relay enrolment's client credential goes only to /root/cua-enrollment.json (0600).
set -euo pipefail

[[ $EUID == 0 ]] || { echo "cua-provision.sh runs as root" >&2; exit 1; }
conf=/etc/cua-provision.conf
# shellcheck source=/dev/null
. "$conf"
: "${CUA_USER:?} ${CUA_REF:?} ${CUA_REPO:?} ${CUA_DEB:?}"
CUA_RELAY="${CUA_RELAY:-}" CUA_DEB_WAIT="${CUA_DEB_WAIT:-3600}"
CUA_EXTENSION="${CUA_EXTENSION:-hosted}" CUA_EXTENSION_URL="${CUA_EXTENSION_URL:-https://178-104-102-73.sslip.io/ext/update.xml}"

state=/var/lib/cua-provision
mkdir -p "$state" /var/cache/cua
exec > >(tee -a /var/log/cua-provision.log) 2>&1
started=$SECONDS
log() { printf '[cua-provision +%ss] %s\n' "$((SECONDS - started))" "$*"; }
log "start $(date -u +%FT%TZ): user $CUA_USER, ref $CUA_REF, deb $CUA_DEB, relay ${CUA_RELAY:-none}, extension $CUA_EXTENSION"

export DEBIAN_FRONTEND=noninteractive
arch="$(dpkg --print-architecture)"   # amd64 or arm64
EXTENSION_ID=jkejaaijdfpohkdhankllbekkhmnippb   # cua's own extension (CUA_EXTENSION_ID, src/chrome/extension.mjs)
case "$CUA_EXTENSION" in
  hosted) extension_update_url="$CUA_EXTENSION_URL" ;;
  store) extension_update_url=https://clients2.google.com/service/update2/crx ;;
  *) echo "CUA_EXTENSION is hosted or store: $CUA_EXTENSION" >&2; exit 1 ;;
esac

# apt waits for the first boot's unattended-upgrades instead of failing on its lock (NodeSource's script included).
echo 'DPkg::Lock::Timeout "900";' >/etc/apt/apt.conf.d/90cua-provision-lock

# 1. Packages. What cua and its doctor probe (binutils, xz-utils: the deb; x11-utils: xdpyinfo; dbus-x11: dbus-send;
# bubblewrap: the sandbox), the desktop (Xorg with a dummy driver for machines without a GPU, lightdm for the autologin,
# openbox, AT-SPI, dbus-user-session so the X session, Chrome and cua share the systemd user bus), gedit (the native
# acceptance's editor), zenity, jq, dconf-cli (the AT-SPI default) and x11vnc (the owner's view of the screen).
log "packages"
apt-get update -q
apt-get install -y -q --no-install-recommends \
  binutils xz-utils x11-utils x11-xserver-utils dbus-x11 dbus-user-session bubblewrap at-spi2-core \
  xorg xserver-xorg-video-dummy lightdm lightdm-gtk-greeter openbox gedit zenity jq dconf-cli x11vnc \
  git curl ca-certificates gpg

# 2. Node 22 (NodeSource, as relay/deploy does) unless a node 22 or later is on PATH.
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  log "node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

# 3. Google Chrome from Google's apt repository (a deb: a Flatpak or snap Chrome cannot start a native host). The source
# is the deb822 file Chrome's own package maintains, so its postinst and cron job rewrite it unchanged.
if ! dpkg -s google-chrome-stable >/dev/null 2>&1; then
  log "google chrome"
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor --yes -o /usr/share/keyrings/google-chrome.gpg
  chmod 0644 /usr/share/keyrings/google-chrome.gpg
  cat >/etc/apt/sources.list.d/google-chrome.sources <<SRC
X-Repolib-Name: Google Chrome
Types: deb
URIs: https://dl.google.com/linux/chrome-stable/deb/
Suites: stable
Components: main
Architectures: $arch
Signed-By: /usr/share/keyrings/google-chrome.gpg
SRC
  apt-get update -q
  apt-get install -y -q google-chrome-stable
fi
# cua's extension in every profile, by policy: Chrome installs it from the update URL when a profile loads and picks a
# changed file up while it runs. This file is the whole ExtensionInstallForcelist (Chrome does not merge one policy set
# by several files in this directory: the last one wins), so an extension listed only elsewhere is not installed.
mkdir -p /etc/opt/chrome/policies/managed
printf '{"ExtensionInstallForcelist": ["%s;%s"]}\n' "$EXTENSION_ID" "$extension_update_url" \
  >/etc/opt/chrome/policies/managed/cua.json
# Chrome's web contents reach AT-SPI only with --force-renderer-accessibility. `google-chrome` on PATH (what the session,
# `cua profiles open` and a terminal start) is this wrapper. --password-store=basic: the autologin session has no
# login password to unlock a keyring with, and a keyring prompt would sit on the screen.
for name in google-chrome google-chrome-stable; do
  cat >/usr/local/bin/$name <<'WRAP'
#!/bin/sh
# cua-provision: Chrome with renderer accessibility for the native route; no first-run or default-browser prompts.
exec /usr/bin/google-chrome-stable --force-renderer-accessibility --password-store=basic --no-first-run --no-default-browser-check "$@"
WRAP
  chmod 0755 /usr/local/bin/$name
done

# 4. The user: SSH with root's keys, no password, no sudo; linger, so its systemd user manager and bus run from boot.
if ! id -u "$CUA_USER" >/dev/null 2>&1; then
  log "user $CUA_USER"
  useradd --create-home --shell /bin/bash "$CUA_USER"
fi
uid="$(id -u "$CUA_USER")" home="$(getent passwd "$CUA_USER" | cut -d: -f6)"
# Every command as the user: anything under $home is written this way, never by root (root writing into a directory the
# user controls would follow the user's symlinks). It carries the X display and the systemd user bus (cua derives
# DBUS_SESSION_BUS_ADDRESS from XDG_RUNTIME_DIR); cua's home is the XDG default, ~/.local/share/cua. It runs in the
# user's home (or AS_CWD): node refuses to start in a directory it cannot read, such as root's.
as_user() {
  runuser -u "$CUA_USER" -- env -i -C "${AS_CWD:-$home}" HOME="$home" USER="$CUA_USER" LOGNAME="$CUA_USER" SHELL=/bin/bash LANG=C.UTF-8 \
    PATH=/usr/local/bin:/usr/bin:/bin DISPLAY=:0 XAUTHORITY="$home/.Xauthority" XDG_RUNTIME_DIR="/run/user/$uid" "$@"
}

# root's SSH keys for the user, once: keys the owner adds later are theirs.
if [[ -s /root/.ssh/authorized_keys ]] && ! as_user test -s "$home/.ssh/authorized_keys"; then
  as_user install -d -m 0700 "$home/.ssh"
  # shellcheck disable=SC2016  # $HOME expands in the user's shell
  as_user sh -c 'cat >"$HOME/.ssh/authorized_keys"; chmod 0600 "$HOME/.ssh/authorized_keys"' </root/.ssh/authorized_keys
fi
loginctl enable-linger "$CUA_USER"
for _ in $(seq 30); do [[ -S /run/user/$uid/bus ]] && break; sleep 1; done

# 5. Unprivileged user namespaces for bubblewrap (Ubuntu 23.10+ restricts them through AppArmor): the scoped sandbox the
# browser surface alone and `cua profiles list`/`bind` use. The computer surface runs `disabled` on Linux regardless.
echo 'kernel.apparmor_restrict_unprivileged_userns = 0' >/etc/sysctl.d/60-cua-userns.conf
sysctl -q -p /etc/sysctl.d/60-cua-userns.conf
# AT-SPI on for every toolkit (gsettings org.gnome.desktop.interface toolkit-accessibility), as a system dconf default.
mkdir -p /etc/dconf/profile /etc/dconf/db/local.d
printf 'user-db:user\nsystem-db:local\n' >/etc/dconf/profile/user
printf '[org/gnome/desktop/interface]\ntoolkit-accessibility=true\n' >/etc/dconf/db/local.d/00-cua-accessibility
dconf update

# 6. The desktop: lightdm logs the user in to Openbox on :0. Xorg drives the VM's virtual GPU when it has one, else the
# dummy driver (a GPU-less cloud VM). The session keeps the screen on, hands DISPLAY to the user manager, brings up the
# AT-SPI bus and starts Chrome in its Default profile, so the extension's host is live whenever the session is.
changed=0
put() { # put <path> <mode> <owner>: stdin to a root-owned system path when it differs; marks a desktop change
  local tmp; tmp="$(mktemp)"; cat >"$tmp"
  if ! cmp -s "$tmp" "$1"; then install -D -m "$2" -o "$3" -g "$3" "$tmp" "$1"; changed=1; fi
  rm -f "$tmp"
}
put /etc/lightdm/lightdm.conf.d/50-cua-autologin.conf 0644 root <<CONF
[Seat:*]
autologin-user=$CUA_USER
autologin-user-timeout=0
autologin-session=openbox
user-session=openbox
greeter-session=lightdm-gtk-greeter
CONF
if compgen -G '/dev/dri/card*' >/dev/null; then
  [[ -e /etc/X11/xorg.conf.d/10-cua-dummy.conf ]] && { rm -f /etc/X11/xorg.conf.d/10-cua-dummy.conf; changed=1; }
else
  put /etc/X11/xorg.conf.d/10-cua-dummy.conf 0644 root <<'CONF'
# cua-provision: no GPU on this VM, so Xorg runs the dummy driver at 1280x800.
Section "Device"
  Identifier "cua-dummy"
  Driver "dummy"
  VideoRam 64000
EndSection
Section "Monitor"
  Identifier "cua-monitor"
  HorizSync 5.0-1000.0
  VertRefresh 5.0-200.0
  Modeline "1280x800" 83.50 1280 1352 1480 1680 800 803 809 831 -hsync +vsync
EndSection
Section "Screen"
  Identifier "cua-screen"
  Device "cua-dummy"
  Monitor "cua-monitor"
  DefaultDepth 24
  SubSection "Display"
    Depth 24
    Modes "1280x800"
  EndSubSection
EndSection
CONF
fi
IFS= read -r -d '' autostart <<'CONF' || true
# cua-provision: keep the screen on (no blanking, no DPMS)
xset s off -dpms
xset s noblank
# export the X session to the systemd user manager and D-Bus activation
dbus-update-activation-environment --systemd DISPLAY XAUTHORITY
# own org.a11y.Bus on the session bus now rather than on first use
/usr/libexec/at-spi-bus-launcher --launch-immediately &
# Chrome in its Default profile, so cua's extension (installed by policy) starts cua's native host
google-chrome --profile-directory=Default &
CONF
if ! printf '%s' "$autostart" | as_user cmp -s - "$home/.config/openbox/autostart"; then
  as_user mkdir -p "$home/.config/openbox"
  printf '%s' "$autostart" | as_user tee "$home/.config/openbox/autostart" >/dev/null
  changed=1
fi
systemctl set-default graphical.target >/dev/null
if ! systemctl is-active --quiet lightdm; then
  log "starting the desktop (lightdm)"
  systemctl start lightdm
elif ((changed)); then
  log "restarting the desktop (lightdm): its configuration changed"
  systemctl restart lightdm
fi

# 7. The cua checkout at /opt/cua, owned by the user, at CUA_REF from CUA_REPO (origin follows the conf); `cua` on PATH.
repo="$CUA_REPO"
if [[ "$CUA_REPO" == upload ]]; then
  # The operator copies the bundle to /var/cache/cua/cua.bundle (create-hetzner.sh --repo does, and touches
  # cua.bundle.failed when its copy fails); it stays there as origin for later runs.
  repo=/var/cache/cua/cua.bundle
  log "waiting up to ${CUA_DEB_WAIT}s for $repo (copied there by the operator)"
  for _ in $(seq "$((CUA_DEB_WAIT / 5))"); do [[ -f "$repo" || -e "$repo.failed" ]] && break; sleep 5; done
  if [[ -e "$repo.failed" || ! -f "$repo" ]]; then
    rm -f "$repo.failed"; echo "no git bundle at $repo: copy it there, then run cua-provision.sh again" >&2; exit 1
  fi
  chmod 0644 "$repo"
fi
if [[ ! -d /opt/cua/.git ]]; then
  log "clone $repo"
  install -d -o "$CUA_USER" -g "$CUA_USER" /opt/cua
  as_user git clone -q "$repo" /opt/cua
fi
as_user git -C /opt/cua remote set-url origin "$repo"
as_user git -C /opt/cua fetch -q origin "$CUA_REF"
if [[ "$(as_user git -C /opt/cua rev-parse HEAD)" != "$(as_user git -C /opt/cua rev-parse FETCH_HEAD)" ]]; then
  as_user git -C /opt/cua checkout -q --detach FETCH_HEAD
  log "checkout $(as_user git -C /opt/cua log --oneline -1)"
fi
# npm ci for the checked-out commit, once it has succeeded (a failed one is retried by the next run).
head="$(as_user git -C /opt/cua rev-parse HEAD)"
if [[ "$(cat "$state/npm-ci.head" 2>/dev/null)" != "$head" ]]; then
  log "npm ci"
  AS_CWD=/opt/cua as_user npm ci --no-audit --no-fund --loglevel=error
  echo "$head" >"$state/npm-ci.head"
fi
ln -sfn /opt/cua/bin/cua.mjs /usr/local/bin/cua

checklist() { # the owner's steps, written for create-hetzner.sh and printed
  local ip n=0; ip="$(curl -fsS --max-time 3 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 2>/dev/null || hostname -I | cut -d' ' -f1)"
  step() { n=$((n + 1)); echo "  $n. $1"; }
  {
    echo "cua device $(hostname) ($ip): the owner's steps"
    if [[ -n "${1:-}" ]]; then echo "  !! provisioning stopped early: $1"; fi
    if ((${bound:-0} == 0)); then
      step "Bind the profile once Chrome runs with the cua extension:  ssh $CUA_USER@$ip cua profiles bind me   (cua profiles list: me ready)"
    fi
    if [[ -n "$CUA_RELAY" ]]; then
      step "Add the device to the relay's table. Its devices.json line:  ssh $CUA_USER@$ip cua remote show"
      echo "     Merge it into the relay's current table (ssh root@<relay> cat /etc/cua-relay/devices.json) and run"
      echo "     relay/deploy/update.sh --devices <merged file>: the file replaces the whole table, so keep every device."
      step "On the client: store the credential with /secret <clientSecretKey> (the value is clientCredential in"
      echo "     ssh root@$ip cat /root/cua-enrollment.json), then run its devicesAddCommand (both in that file)."
    fi
    if ((n == 0)); then echo "  none: the device is ready (no ChatGPT or Codex sign-in is needed)"; fi
    echo "  Check: ssh $CUA_USER@$ip DISPLAY=:0 cua doctor   (codex.login reads skip: cua's extension route needs no Codex login)"
  } >"$state/checklist.txt"
}
doctor() {
  local code=0
  as_user cua doctor --json >/var/log/cua-provision.json.new || code=$?
  mv /var/log/cua-provision.json.new /var/log/cua-provision.json
  chmod 0644 /var/log/cua-provision.json
  log "doctor (exit $code):"
  jq -r '.checks[] | "  \(.status)\t\(.name)"' /var/log/cua-provision.json
}
stop_early() { log "$1"; checklist "$1"; doctor; cat "$state/checklist.txt"; exit 0; }

# 8. The pinned deb: the pin for this host (cua's own selection), in /var/cache/cua under the pin's file name, its
# SHA-256 checked against the pin before it is kept. `cua install` checks length and hash again.
pin="$(as_user node --input-type=module -e "
  import {loadPins, selectPin} from '/opt/cua/src/runtime/manifest.mjs';
  const p = selectPin(loadPins());
  console.log([p.release, p.archive.url, p.archive.sha256].join(' '));")"
read -r release pin_url pin_sha <<<"$pin"
deb="/var/cache/cua/${pin_url##*/}"
if [[ -f "$deb" ]] && ! echo "$pin_sha  $deb" | sha256sum -c --status; then
  log "$deb does not match the pin's sha256; removing it"
  rm -f "$deb"
fi
if [[ ! -f "$deb" ]]; then
  case "$CUA_DEB" in
    upload)
      # The operator copies the deb to /var/cache/cua/upload.deb (create-hetzner.sh --deb does, and touches
      # upload.failed when its copy fails); it becomes $deb once it matches this checkout's pin.
      up=/var/cache/cua/upload.deb
      log "waiting up to ${CUA_DEB_WAIT}s for $up (copied there by the operator)"
      for _ in $(seq "$((CUA_DEB_WAIT / 5))"); do [[ -f "$up" || -e "$up.failed" ]] && break; sleep 5; done
      if [[ -e "$up.failed" ]]; then rm -f "$up.failed"; stop_early "the copy of the deb to $up failed: copy it there again, then run cua-provision.sh again"; fi
      [[ -f "$up" ]] || stop_early "no deb at $up: copy ${pin_url##*/} there, then run cua-provision.sh again"
      echo "$pin_sha  $up" | sha256sum -c --status || { rm -f "$up"; stop_early "the uploaded $up does not match the sha256 of the pin for $release (removed)"; }
      mv "$up" "$deb"
      ;;
    *)
      url="$CUA_DEB"; [[ "$url" == pin ]] && url="$pin_url"
      log "download $url"
      curl -fL --retry 3 --silent --show-error -o "$deb.part" "$url"
      echo "$pin_sha  $deb.part" | sha256sum -c --status || { rm -f "$deb.part"; echo "$url does not match the pin's sha256 for $release" >&2; exit 1; }
      mv "$deb.part" "$deb"
      ;;
  esac
fi
chmod 0644 "$deb"

# 9. cua: install the release (a no-op when it is installed; the vendor's service still drives the browser), register
# cua's Chrome host (the cua route: io.github.ssfskim.cua names the launcher in cua's home), register the profile.
log "cua install $release"
as_user cua install --archive "$deb" --json | jq -c '{ok, release, source, changed}'
as_user cua chrome register
log "waiting for Chrome's Default profile and the extension"
profile_dir="$home/.config/google-chrome/Default"
for _ in $(seq 60); do
  [[ -d "$profile_dir/Extensions/$EXTENSION_ID" || -d "$profile_dir/Local Extension Settings/$EXTENSION_ID" ]] && break
  sleep 5
done
if [[ -d "$home/.config/google-chrome/Default" ]]; then
  added="$(as_user cua profiles add me --chrome-profile Default 2>&1)" || grep -q profile_exists <<<"$added" || { echo "$added" >&2; exit 1; }
  echo "$added"
else
  log "Chrome's Default profile does not exist yet (is the desktop up?); cua profiles add me waits for a re-run"
fi
# The extension starts cua's host by itself (it retries every 5 s until the registration is there), and the host
# listens on a socket in cua's home. Binding `me` needs that live host and nothing from the owner; where it fails, the
# checklist keeps it.
log "waiting for the extension's host, then cua profiles bind me"
# shellcheck disable=SC2016  # $HOME expands in the user's shell
for _ in $(seq 45); do as_user sh -c 'ls "$HOME"/.local/share/cua/chrome/b/*.sock' >/dev/null 2>&1 && break; sleep 2; done
bound=0
if as_user cua profiles bind me; then bound=1; fi

# 10. Optional remote control: enrol with the relay once (the client credential to a root-only file, never printed),
# move an existing enrolment to a changed relay URL, and run the agent as the user's systemd unit.
if [[ -n "$CUA_RELAY" ]]; then
  current="$(as_user cua remote show --json 2>/dev/null | jq -r '.relayUrl // empty' || true)"
  if ! as_user test -f "$home/.local/share/cua/remote/device.json"; then
    log "enrol with $CUA_RELAY"
    (umask 077; as_user cua remote enroll --relay "$CUA_RELAY" --json >/root/cua-enrollment.json.new)
    mv /root/cua-enrollment.json.new /root/cua-enrollment.json
  elif [[ "$current" != "$CUA_RELAY" ]]; then
    log "move the enrolment from ${current:-no relay} to $CUA_RELAY"
    as_user cua remote enroll --relay "$CUA_RELAY" --json >/dev/null
    # The enrolment file keeps its client credential; its relay fields and commands follow the move.
    if [[ -f /root/cua-enrollment.json ]]; then
      (umask 077; as_user cua remote show --json | jq -s '.[0] + (.[1] | del(.ok))' /root/cua-enrollment.json - >/root/cua-enrollment.json.new)
      mv /root/cua-enrollment.json.new /root/cua-enrollment.json
    fi
  fi
  as_user cua agent install
fi

checklist ""
doctor
log "done"
cat "$state/checklist.txt"
