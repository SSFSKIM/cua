# K1 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the hold canary on the gate's Chrome: a draggable press reads slow, a plain drag fast, Chrome identified, the engine sandboxed as in service
- display: private; load: idle; estimated 15 min
- run: `pinned-K1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64/ at 048140a2bde0f6398cc910c1aa14ecf2e7e51004, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64-043/engine/linux/cua-engine (sha256 f1513e79f4efdb3dd950e108fec05ce59b090926907a3071ee65ca3899d4921f as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64/scripts/linux-engine-gate/gate.mjs run K1 --pinned /Users/new/.local/share/cua-171/m5/home-x64-043 --out /Users/new/.local/share/cua-171/m5/out-x64-h8`
- started 2026-11-22T03:18:25.754Z
- finished 2026-11-22T03:21:26.769Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
- re-judged offline at 9e80f9b6 by the final review's fixes (task 139, ruling 1091), nothing rerun: no verdict moved; `rejudge-final-review.txt`
