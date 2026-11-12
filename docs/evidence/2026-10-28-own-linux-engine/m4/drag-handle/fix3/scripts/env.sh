# The third fix wave's paths (sourced): task 73's (../../scripts/env.sh: S, WT, PINNED, NEWEST, guard), the runs written
# under T (this wave's own work directory unless set), and the host lock's cargo first on PATH (it takes the lock
# itself outside a locked step, and runs cargo directly inside one).
export T=${T:-$HOME/.local/share/cua-171/task73fix3}
export PATH=$HOME/.local/share/cua-171/bin:$PATH
export CUA_LOCK_HOLDER=${CUA_LOCK_HOLDER:-task73fix3}
F=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# task 73's shared scripts: beside this directory in the evidence, or the checkout's while this wave works
if [ -f "$F/../../scripts/env.sh" ]; then
  . "$F/../../scripts/env.sh"
else
  . $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-handle/scripts/env.sh
fi
