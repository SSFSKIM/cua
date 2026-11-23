# K2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the hold canary on the current stable Chrome (extracted, not installed)
- display: private; load: idle; estimated 15 min
- run: `pinned-K2`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6/ at 69bd7993e1f1cb252574939bd6e8e80674bab5b8, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-042/engine/linux/cua-engine (sha256 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f as given)
- command: `/Users/new/.local/share/cua-171/locked.sh task122-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6/scripts/linux-engine-gate/gate.mjs run K2 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-042 --out /Users/new/.local/share/cua-171/m5/out-arm64-h6`
- started 2026-11-21T00:27:42.464Z
- finished 2026-11-21T00:30:38.045Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
