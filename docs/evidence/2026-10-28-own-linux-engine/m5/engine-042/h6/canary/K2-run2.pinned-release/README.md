# K2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the hold canary on the current stable Chrome (extracted, not installed)
- display: private; load: idle; estimated 15 min
- run: `pinned-K2`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80/ at 4fffcdd314f892f5cbffe9df893cb65b09de0b09, clean
- candidate: /Users/new/.local/share/cua-171/task121/home/.local/share/cua/engine/linux/cua-engine (sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-h6 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80/scripts/linux-engine-gate/gate.mjs run K2 --pinned /Users/new/.local/share/cua-171/task121/home/.local/share/cua --out /Users/new/.local/share/cua-171/task121/k2-2`
- started 2026-11-20T20:16:57.786Z
- finished 2026-11-20T20:19:57.364Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
