# S2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the settle: Firefox's and gedit's cells
- display: own; load: idle; estimated 25 min
- run: `pinned-S2`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-arm64/ at f6275fb600ae719f29cf32b206676e1a70a02e26, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64/engine/linux/cua-engine (sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t7-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-arm64/scripts/linux-engine-gate/gate.mjs run S2 --pinned /Users/new/.local/share/cua-171/m5/home-arm64 --out /Users/new/.local/share/cua-171/m5/out-arm64`
- started 2026-11-18T14:50:29.826Z
- finished 2026-11-18T15:15:41.173Z; exit 0
- end check: clear (no cua171-run-* directory or session bus of one)
- unclean end (the run's own side, not a verdict failure): 1
  - a process it spawned still runs: pid 924214 openbox
