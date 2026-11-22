# K1 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the hold canary on the gate's Chrome: a draggable press reads slow, a plain drag fast, Chrome identified, the engine sandboxed as in service
- display: private; load: idle; estimated 15 min
- run: `pinned-K1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8/ at 048140a2bde0f6398cc910c1aa14ecf2e7e51004, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-043/engine/linux/cua-engine (sha256 dd74e19b44596f992dd120b13fbbe8021a7ca0af581c07496f5cee8f5edbcf1e as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8/scripts/linux-engine-gate/gate.mjs run K1 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-043 --out /Users/new/.local/share/cua-171/m5/out-arm64-h8`
- started 2026-11-22T03:34:52.307Z
- finished 2026-11-22T03:37:47.657Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
