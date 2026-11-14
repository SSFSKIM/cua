# Shared paths for task 64's fix wave (sourced).
T=$HOME/.local/share/cua-171/task64-fix
WT=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
PINNED=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
SKY=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
# the Mozilla Firefox deb task 59 unpacked, first on PATH
export PATH=$HOME/.local/share/cua-171/task59/bin:$PATH
guard() {
  if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present: not starting" >&2; exit 5; fi
  if pgrep -x stress-ng >/dev/null; then echo "stress-ng is running: not starting" >&2; exit 3; fi
}
# the fix wave's final engine (958db275, musl, the release workflow's way) and harness
FINAL=$T/build/958db27554086a1da6d9b01c330e78e3413c1982/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
H=$T/harness-958db275
