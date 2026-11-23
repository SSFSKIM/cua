#!/bin/bash
# An engine path that runs an engine's server with a measurement flag appended (the settle experiment's service
# spawns its engine with no flags of ours); `--version` and the rest pass through unchanged.
# usage: make-wrapper.sh <engine> <name> <flags...>   (prints the wrapper's path)
set -u
engine=$1
name=$2
shift 2
dir=$HOME/.local/share/cua-171/task64/build/wrappers
mkdir -p "$dir"
w=$dir/$name
cat > "$w" <<EOF
#!/bin/sh
if [ "\$1" = server ]; then exec $engine "\$@" $*; fi
exec $engine "\$@"
EOF
chmod +x "$w"
echo "$w"
