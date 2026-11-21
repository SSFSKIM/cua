# L4d (development run, not a release gate)

**development run, not a release gate.**

- what: the stale-position drops at twice the load (rulings 957 and 962): Chrome's long control and the floor's cells, and Electron's long path out of the zone, any false ok and any drop at a stale position a fail
- display: private; load: load2; estimated 30 min
- run: `m5-dev-L4d`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-128/ at 8a2a36963825da21d75bfdd3153ff9b39cc9f150, clean
- candidate: /Users/new/.local/share/cua-171/task121/home/.local/share/cua/engine/linux/cua-engine (sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-h7 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-128/scripts/linux-engine-gate/gate.mjs run L4d --pinned /Users/new/.local/share/cua-171/task121/home/.local/share/cua --out /Users/new/.local/share/cua-171/task128/gate-dev-l4d-2 --dev`
- started 2026-11-21T07:24:35.129Z
- finished 2026-11-21T07:43:12.680Z; exit 1; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
