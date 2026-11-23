# K2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the hold canary on the current stable Chrome (extracted, not installed)
- display: private; load: idle; estimated 15 min
- run: `pinned-K2`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/ at 69bd7993e1f1cb252574939bd6e8e80674bab5b8, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64-042/engine/linux/cua-engine (sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh task123-x64 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/scripts/linux-engine-gate/gate.mjs run K2 --pinned /Users/new/.local/share/cua-171/m5/home-x64-042 --out /Users/new/.local/share/cua-171/m5/out-x64-h6`
- started 2026-11-20T22:35:21.645Z
- finished 2026-11-20T22:38:21.585Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
