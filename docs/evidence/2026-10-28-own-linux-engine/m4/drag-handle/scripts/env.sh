# Shared paths for task 73's runs (sourced; task 71's, after task 70's). S is this scripts directory, wherever it is checked
# out; T is the work directory the runs write (builds, harness exports, sittings), overridable from the environment;
# WT the checkout the builds and the harness exports are made from (the one holding these scripts, unless set).
S=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
T=${T:-$HOME/.local/share/cua-171/task73b}
WT=${WT:-$(cd "$S/../../../../../.." && pwd)}
PINNED=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
# the Mozilla Firefox deb task 59 unpacked, first on PATH
export PATH=$HOME/.local/share/cua-171/task59/bin:$PATH
guard() {
  if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present: not starting" >&2; exit 5; fi
  if pgrep -x stress-ng >/dev/null; then echo "stress-ng is running: not starting" >&2; exit 3; fi
}
