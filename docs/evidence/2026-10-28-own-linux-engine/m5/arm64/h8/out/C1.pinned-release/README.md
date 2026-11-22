# C1 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: #264's late-take path (T14) in three freeze bands: landed inside the hold, the edge's late takes counted, refused with the hold notice past it (ruling 931)
- display: private; load: idle; estimated 4 min
- run: `pinned-C1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8/ at 048140a2bde0f6398cc910c1aa14ecf2e7e51004, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-043/engine/linux/cua-engine (sha256 dd74e19b44596f992dd120b13fbbe8021a7ca0af581c07496f5cee8f5edbcf1e as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8/scripts/linux-engine-gate/gate.mjs run C1 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-043 --out /Users/new/.local/share/cua-171/m5/out-arm64-h8`
- started 2026-11-22T03:32:47.786Z
- finished 2026-11-22T03:34:51.933Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
