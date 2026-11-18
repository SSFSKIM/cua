#!/bin/bash
# Task 96: the matrix's and the desktop's package versions on both VMs, side by side (read only).
P="gnome-text-editor xterm libreoffice-writer kate qtcreator gnome-terminal gedit gir1.2-gtk-4.0 python3-pyqt5 python3-pyqt6 xvfb stress-ng xtrace xdotool openbox at-spi2-core libgtk-3-0t64 libqt5core5t64 libqt6core6t64 xserver-xorg-core google-chrome-stable"
read_versions() { for p in $P; do echo "$p $(dpkg-query -W -f='${Version}' "$p" 2>/dev/null)"; done; }
echo "# package versions, read $(date -u +%FT%TZ): x64 VM (dc-linux171-1e68) | arm64 VM (dc-linux171arm-996d)"
read_versions > /tmp/t96-x64.txt
{ echo "P='$P'"; declare -f read_versions; echo read_versions; } | ssh cua-171-arm64 bash -s > /tmp/t96-arm64.txt
paste -d' ' /tmp/t96-x64.txt /tmp/t96-arm64.txt | awk '{print $1, $2, "|", $4, ($2==$4 && $1==$3 ? "same" : "DIFFERS")}'
rm -f /tmp/t96-x64.txt /tmp/t96-arm64.txt
