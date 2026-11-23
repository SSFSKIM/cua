#!/bin/bash
# Task 99 (T7 part 2, F2's unjudged pass, private part): current stable Chrome arm64 (fetch-chrome-stable.sh, checked by
# Google's signed index), extracted under the lock into its own directory and never installed, so the judged Chrome
# 156 stays installed and held. A `google-chrome` wrapper with cua-provision's flags, first on PATH, makes the harness's
# CHROME_COMMAND resolve to it. Then F2's private Chrome steps, D1 and S1 (S1 runs whole: Chrome's cells and
# Electron's), as development runs on the pinned release (--dev; never counted) into m5/f2-arm64.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
W=$D/chrome-stable
V=$(cat "$W/current")
R=$W/$V/root
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
if [ ! -x "$R/opt/google/chrome/chrome" ]; then
  "$D/locked.sh" t7-arm64 dpkg-deb -x "$W/$V/chrome.deb" "$R" || { echo "extraction failed"; exit 1; }
fi
mkdir -p "$W/$V/bin"
cat > "$W/$V/bin/google-chrome" <<EOF
#!/bin/sh
# task 99, F2: current stable Chrome $V (extracted, not installed), with cua-provision's flags
exec $R/opt/google/chrome/google-chrome --force-renderer-accessibility --password-store=basic --no-first-run --no-default-browser-check "\$@"
EOF
chmod +x "$W/$V/bin/google-chrome"
export PATH=$W/$V/bin:$PATH
echo "$(date -u +%FT%TZ) google-chrome on PATH: $(command -v google-chrome): $(google-chrome --version 2>&1 | head -1)"
T7_OUT=$D/m5/f2-arm64 STEP_FLAGS="--dev" "$T/drive-h4.sh" D1 S1
