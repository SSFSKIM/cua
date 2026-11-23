# The binaries and directories task 61's sittings name (sourced).
T61=$HOME/.local/share/cua-171/task61
CK=$T61/checkout
# the pinned vendor build, 26.928.40906 (sha256 7ac3c2ae…)
VENDOR=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
# cua's released engine 0.3.0, the pinned asset (sha256 5f4a1600…)
RELEASED=$T61/bin/cua-engine-0.3.0-linux-x64
musl() { echo "$T61/build/$1/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine"; }
