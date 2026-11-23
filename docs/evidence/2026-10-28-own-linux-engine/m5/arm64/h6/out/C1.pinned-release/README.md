# C1 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: #264's late-take path (T14) in three freeze bands: landed inside the hold, the edge's late takes counted, refused with the hold notice past it (ruling 931)
- display: private; load: idle; estimated 4 min
- run: `pinned-C1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6/ at 69bd7993e1f1cb252574939bd6e8e80674bab5b8, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-042/engine/linux/cua-engine (sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f as given)
- command: `/Users/new/.local/share/cua-171/locked.sh task122-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6/scripts/linux-engine-gate/gate.mjs run C1 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-042 --out /Users/new/.local/share/cua-171/m5/out-arm64-h6`
- started 2026-11-21T00:22:42.119Z
- finished 2026-11-21T00:24:46.759Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
