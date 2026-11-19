# E1 (development run, not a release gate, pilot)

**development run, not a release gate.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: the events experiment: desktop move's later requests at or below the bar (T9)
- display: own; load: idle; estimated 8 min
- run: `m5-dev-E1-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/ at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-041/engine/linux/cua-engine (sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t7-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/scripts/linux-engine-gate/gate.mjs run E1 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-041 --out /Users/new/.local/share/cua-171/m5/pc-arm64 --dev --pilot 2 --engine-stats`
- started 2026-11-19T06:44:55.407Z
- finished 2026-11-19T06:47:12.486Z; exit 0
- unjudged (a pilot takes no top-up; not passes): 17
  - desktop press_key first
  - desktop press_key later
  - desktop key_down first
  - desktop key_down later
  - desktop key_up later
  - desktop click first
  - desktop click later
  - desktop move first
  - desktop move later
  - desktop move_relative first
  - desktop move_relative later
  - desktop scroll first
  - desktop scroll later
  - desktop drag first
  - desktop drag later
  - desktop drag_handle first
  - desktop drag_handle later
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
