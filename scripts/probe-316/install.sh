#!/bin/bash
# #316 (copied from #287's kit): the browsers a group needs, as the hosted image has them or installed by Homebrew cask; each one's source and
# version goes to $RUNNER_TEMP/probe-316/install.txt.  usage: install.sh <chrome|firefox|vscode>...
set -u
out="$RUNNER_TEMP/probe-316"; mkdir -p "$out"
rec() { echo "$*" | tee -a "$out/install.txt"; }
rec "image ${ImageOS:-?} ${ImageVersion:-?}; $(sw_vers | tr '\n' ' ')"
ls /Applications > "$out/applications.txt"
rec "managed preferences: $(ls '/Library/Managed Preferences' 2>/dev/null | tr '\n' ' ')"
version() { defaults read "$1/Contents/Info" CFBundleShortVersionString 2>/dev/null; }
for need in "$@"; do
  case "$need" in
    chrome) app="/Applications/Google Chrome.app"; cask=google-chrome ;;
    firefox) app="/Applications/Firefox.app"; cask=firefox ;;
    vscode) app="/Applications/Visual Studio Code.app"; cask=visual-studio-code ;;
    *) rec "unknown need $need"; continue ;;
  esac
  if [ -d "$app" ]; then
    rec "$need: preinstalled by the image, $(version "$app")"
  else
    s=$(date +%s)
    brew install --cask "$cask" > "$out/brew-$cask.log" 2>&1
    rc=$?
    rec "$need: brew install --cask $cask rc=$rc in $(( $(date +%s) - s )) s, $(version "$app")"
    xattr -dr com.apple.quarantine "$app" 2>/dev/null || sudo xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
  fi
  rec "$need: quarantine $(xattr -p com.apple.quarantine "$app" 2>/dev/null || echo none)"
done
rec "Chrome for Testing: $(version '/Applications/Google Chrome for Testing.app')"
rec "Safari: $(version /Applications/Safari.app)"
