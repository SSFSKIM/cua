# S1 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the settle through cua's service as shipped: Chrome's and Electron's cells, audited
- display: own; load: idle; estimated 39 min
- run: `pinned-S1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t105-x64/ at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64-041/engine/linux/cua-engine (sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t105-x64 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t105-x64/scripts/linux-engine-gate/gate.mjs run S1 --pinned /Users/new/.local/share/cua-171/m5/home-x64-041 --out /Users/new/.local/share/cua-171/m5/out-x64-h4`
- started 2026-11-18T22:12:47.346Z
- finished 2026-11-18T22:46:49.744Z; exit 0
- end check: clear (no cua171-run-* directory or session bus of one)
- unclean end (the run's own side, not a verdict failure): 1
  - a process it spawned still runs: pid 286294 openbox
