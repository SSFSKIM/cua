#!/bin/bash
# Task 96 (T6 arm64, pre-flight §7.2 items 0-6 as amended for GCE): the system half of the arm64 VM's install, run as
# root through sudo on dc-linux171arm-996d. Each part prints what it did; the whole log is the install record.
#   2. Google Chrome 156.0.8078.73 arm64 from Google's pool (F2), installed before the template so the template's own
#      Chrome step finds it, then held.
#   1. the template, deploy/cloud-vm/cua-provision.sh at the checkout's head, with the x64 VM's conf and the ref changed.
#   3-5. the matrix's applications, the harness's tools, the fonts.
set -euo pipefail
[[ $EUID == 0 ]] || { echo "run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive
echo 'DPkg::Lock::Timeout "900";' >/etc/apt/apt.conf.d/90cua-provision-lock
log() { echo "== $(date -u +%FT%TZ) $*"; }
CO=/Users/new/Developer/GitHub/cua
log "head $(runuser -u new -- git -C $CO rev-parse HEAD); arch $(dpkg --print-architecture); $(lsb_release -ds)"

log "2. Chrome 156.0.8078.73 arm64 from Google's pool"
C=/var/cache/cua-171; mkdir -p $C
deb=$C/google-chrome-stable_156.0.8078.73-1_arm64.deb
if [ ! -f $deb ]; then
  curl -fL --retry 3 -sS -o $deb.part https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_156.0.8078.73-1_arm64.deb
  mv $deb.part $deb
fi
ls -l $deb; sha256sum $deb
dpkg-deb -f $deb Package Version Architecture
apt-get update -q
apt-get install -y -q $deb
apt-mark hold google-chrome-stable
dpkg -s google-chrome-stable | grep -E '^(Status|Version|Architecture)'
/usr/bin/google-chrome-stable --version

log "1. the template: cua-provision.sh"
cat >/etc/cua-provision.conf <<CONF
CUA_USER=new
CUA_REF=feat/171-m5
CUA_REPO=https://github.com/SSFSKIM/cua
CUA_DEB=pin
CUA_EXTENSION=hosted
CONF
cat /etc/cua-provision.conf
install -m 0755 $CO/deploy/cloud-vm/cua-provision.sh /usr/local/sbin/cua-provision.sh
/usr/local/sbin/cua-provision.sh
log "template exit $?"

log "3-5. the matrix's applications, the harness's tools, the fonts"
apt-get install -y -q gnome-text-editor xterm libreoffice-writer libreoffice-gtk3 libreoffice-calc libreoffice-impress \
  kate qtcreator gnome-terminal yad python3-pyqt5 python3-pyqt6 python3-gi gir1.2-gtk-3.0 gir1.2-gtk-4.0 breeze \
  xvfb stress-ng xtrace xdotool xclip build-essential pkg-config \
  fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji
log "held: $(apt-mark showhold | tr '\n' ' ')"
dpkg -s google-chrome-stable | grep -E '^Version'
log "install-sys done"
