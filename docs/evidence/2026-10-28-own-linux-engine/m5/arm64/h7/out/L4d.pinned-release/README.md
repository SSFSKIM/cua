# L4d (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the stale-position drops at twice the load (rulings 957 and 962): Chrome's long control and the floor's cells, and Electron's long path out of the zone, any false ok and any drop at a stale position a fail
- display: private; load: load2; estimated 30 min
- run: `pinned-L4d`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h71/ at 96fa1fd3b6a30c15eed4de232bc252d41655831e, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-042/engine/linux/cua-engine (sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h71/scripts/linux-engine-gate/gate.mjs run L4d --pinned /Users/new/.local/share/cua-171/m5/home-arm64-042 --out /Users/new/.local/share/cua-171/m5/out-arm64-h71`
- started 2026-11-21T09:23:07.868Z
- finished 2026-11-21T09:46:58.710Z; exit 1; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
