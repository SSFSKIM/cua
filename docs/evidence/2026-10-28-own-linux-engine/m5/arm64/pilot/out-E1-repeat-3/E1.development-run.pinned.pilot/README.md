# E1 (development run on the pinned release, not acceptance, never counted, pilot)

**development run on the pinned release, not acceptance, never counted.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: the events experiment: desktop move's later requests at or below the bar (T9)
- display: own; load: idle; estimated 8 min
- run: `m5-pinned-dev-E1-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64/ at da306cc6319e7e9da282812402308c074b872dee, clean
- candidate: /Users/new/.local/share/cua-171/m5/pilot-arm64/home/engine/linux/cua-engine (sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t96-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64/scripts/linux-engine-gate/gate.mjs run E1 --pinned /Users/new/.local/share/cua-171/m5/pilot-arm64/home --out /Users/new/.local/share/cua-171/m5/pilot-arm64/out-E1-repeat-3 --pilot 2`
- started 2026-11-18T03:50:53.591Z
- finished 2026-11-18T03:53:12.353Z; exit 1
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
