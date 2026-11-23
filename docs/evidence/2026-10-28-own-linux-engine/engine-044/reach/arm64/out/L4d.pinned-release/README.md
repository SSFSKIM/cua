# L4d (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the stale-position drops at twice the load (rulings 957 and 962): Chrome's long control and the floor's cells, and Electron's long path out of the zone, any false ok and any drop at a stale position a fail
- display: private; load: load2; estimated 30 min
- run: `pinned-L4d`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t147-h9/ at cd03a47bde2a484e1c3ecbf07cc97aada720fda7, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-044/engine/linux/cua-engine (sha256 f54b2aeb8e00676a9f521410156c9bdd1b578e2308724013eef2eb6145c7da3e as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t147-h9/scripts/linux-engine-gate/gate.mjs run L4d --pinned /Users/new/.local/share/cua-171/m5/home-arm64-044 --out /Users/new/.local/share/cua-171/m5/out-arm64-h9`
- started 2026-11-23T11:00:54.713Z
- finished 2026-11-23T11:24:39.728Z; exit 1; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
