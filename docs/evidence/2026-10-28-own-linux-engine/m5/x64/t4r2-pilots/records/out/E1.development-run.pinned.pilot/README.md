# E1 (development run on the pinned release, not acceptance, never counted, pilot)

**development run on the pinned release, not acceptance, never counted.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: the events experiment: desktop move's later requests at or below the bar (T9)
- display: own; load: idle; estimated 8 min
- run: `m5-pinned-dev-E1-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a458977939f1feb0d/ at 2807b4ee3eedd229a6077784e5f39586396dee0a, clean
- candidate: /Users/new/.local/share/cua-171/m5-t4r2/home/engine/linux/cua-engine (sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-t4r2 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a458977939f1feb0d/scripts/linux-engine-gate/gate.mjs run E1 --pinned /Users/new/.local/share/cua-171/m5-t4r2/home --out /Users/new/.local/share/cua-171/m5-t4r2/out --pilot 1`
- started 2026-11-15T11:09:23.122Z
- finished 2026-11-15T11:11:29.595Z; exit 0
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
