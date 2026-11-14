# Shared paths for task 64's runs (sourced).
T=$HOME/.local/share/cua-171/task64
WT=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
PINNED=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
SKY=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
BEFORE=$T/build/21cc0e73ba6fa61cd5b99784b0e7c0892b029249/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
# the Mozilla Firefox deb task 59 unpacked, first on PATH
export PATH=$HOME/.local/share/cua-171/task59/bin:$PATH
guard() {
  if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present: not starting" >&2; exit 5; fi
  if pgrep -x stress-ng >/dev/null; then echo "stress-ng is running: not starting" >&2; exit 3; fi
}
C2=$T/build/500b48fd5fe01261e3e438b8070e69b94d8a02da/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
H2=$T/harness-500b48fd
C3=$T/build/992a51a1d5b865e03f6f995691e20e6e43a7c796/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
