# D3 (development run, not a release gate, pilot)

**development run, not a release gate.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: Firefox's drag cells, the pointer parked inside (T19), its canvas judged on speed
- display: private; load: idle; estimated 30 min
- run: `m5-dev-D3-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/ at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-041/engine/linux/cua-engine (sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t7-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/scripts/linux-engine-gate/gate.mjs run D3 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-041 --out /Users/new/.local/share/cua-171/m5/pc-arm64 --dev --pilot 2 --engine-stats`
- started 2026-11-19T06:34:57.481Z
- finished 2026-11-19T06:36:31.037Z; exit 0; private display's watchdog: clean
- unjudged (a pilot takes no top-up; not passes): 1
  - firefox canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
