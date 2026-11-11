# The fix wave's paths (sourced): task 73's (../../scripts/env.sh: S, WT, PINNED, NEWEST, guard), the runs written
# under T (the fix wave's own work directory unless set), and the host lock's cargo first on PATH (it takes the lock
# itself outside a locked step, and runs cargo directly inside one).
export T=${T:-$HOME/.local/share/cua-171/task73fix}
export PATH=$HOME/.local/share/cua-171/bin:$PATH
F=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. "$F/../../scripts/env.sh"
