# L4b (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the accept signal's false releases (the measurement lane, T14's 300 long drops and the controls)
- display: private; load: load2; estimated 25 min
- run: `pinned-L4b`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8/ at 048140a2bde0f6398cc910c1aa14ecf2e7e51004, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-043/engine/linux/cua-engine (sha256 dd74e19b44596f992dd120b13fbbe8021a7ca0af581c07496f5cee8f5edbcf1e as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8/scripts/linux-engine-gate/gate.mjs run L4b --pinned /Users/new/.local/share/cua-171/m5/home-arm64-043 --out /Users/new/.local/share/cua-171/m5/out-arm64-h8`
- started 2026-11-22T04:16:51.961Z
- finished 2026-11-22T04:33:29.083Z; exit 1; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
- re-judged offline at 74a5a91a by the final review's fixes (task 139, ruling 1091), nothing rerun: no verdict moved; `rejudge-final-review.txt`
