# L4d (development run, not a release gate)

**development run, not a release gate.**

- what: the stale-position drops at twice the load (rulings 957 and 962): Chrome's long control and the floor's cells, and Electron's long path out of the zone, any false ok and any drop at a stale position a fail
- display: private; load: load2; estimated 30 min
- run: `m5-dev-L4d`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-p2/ at bda3da8f66ab5dae9f6cf907cdf8c110d722c042, clean
- candidate: /Users/new/.local/share/cua-171/task121/home/.local/share/cua/engine/linux/cua-engine (sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-h7 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-p2/scripts/linux-engine-gate/gate.mjs run L4d --pinned /Users/new/.local/share/cua-171/task121/home/.local/share/cua --out /Users/new/.local/share/cua-171/task128/gate-dev-l4d --dev`
- started 2026-11-21T06:47:44.035Z
- finished 2026-11-21T07:06:51.563Z; exit 1; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
