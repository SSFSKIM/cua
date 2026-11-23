# C1 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: #264's late-take path (T14) in three freeze bands: landed inside the hold, the edge's late takes counted, refused with the hold notice past it (ruling 931)
- display: private; load: idle; estimated 4 min
- run: `pinned-C1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/ at 69bd7993e1f1cb252574939bd6e8e80674bab5b8, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64-042/engine/linux/cua-engine (sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh task123-x64 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/scripts/linux-engine-gate/gate.mjs run C1 --pinned /Users/new/.local/share/cua-171/m5/home-x64-042 --out /Users/new/.local/share/cua-171/m5/out-x64-h6`
- started 2026-11-20T22:30:06.678Z
- finished 2026-11-20T22:32:18.733Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
