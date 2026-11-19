# S1 (development run, not a release gate)

**development run, not a release gate.**

- what: the settle through cua's service as shipped: Chrome's and Electron's cells, audited
- display: own; load: idle; estimated 39 min
- run: `m5-dev-S1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/ at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-041/engine/linux/cua-engine (sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t7-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/scripts/linux-engine-gate/gate.mjs run S1 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-041 --out /Users/new/.local/share/cua-171/m5/f2-arm64 --dev`
- started 2026-11-19T08:00:41.468Z
- finished 2026-11-19T08:34:04.738Z; exit 0
- end check: clear (no cua171-run-* directory or session bus of one)
- unclean end (the run's own side, not a verdict failure): 1
  - a process it spawned still runs: pid 1932558 openbox
