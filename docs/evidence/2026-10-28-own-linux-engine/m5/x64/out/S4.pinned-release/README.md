# S4 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the settle: xterm's, GTK 3's, Qt 5's and 6's, GTK 4's cells
- display: own; load: idle; estimated 30 min
- run: `pinned-S4`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64/ at fefe306c288956a48b6c086017f3cd1a58462a07, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64/engine/linux/cua-engine (sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t5-x64 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64/scripts/linux-engine-gate/gate.mjs run S4 --pinned /Users/new/.local/share/cua-171/m5/home-x64 --out /Users/new/.local/share/cua-171/m5/out-x64`
- started 2026-11-16T19:11:16.176Z
- finished 2026-11-16T19:46:05.297Z; exit 0
- end check: clear (no cua171-run-* directory or session bus of one)
- unclean end (the run's own side, not a verdict failure): 1
  - a process it spawned still runs: pid 3708294 openbox
