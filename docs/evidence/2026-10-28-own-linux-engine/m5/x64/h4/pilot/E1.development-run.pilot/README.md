# E1 (development run, not a release gate, pilot)

**development run, not a release gate.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: the events experiment: desktop move's later requests at or below the bar (T9)
- display: own; load: idle; estimated 8 min
- run: `m5-dev-E1-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t105-x64/ at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64-041/engine/linux/cua-engine (sha256 c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t105-x64 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t105-x64/scripts/linux-engine-gate/gate.mjs run E1 --pinned /Users/new/.local/share/cua-171/m5/home-x64-041 --out /Users/new/.local/share/cua-171/m5/pilot-x64-h4 --dev --pilot 2 --engine-stats`
- started 2026-11-18T23:37:52.121Z
- finished 2026-11-18T23:40:14.150Z; exit 0
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
