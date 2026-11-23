# L1 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: thumbs and ranges at 40 a side against the pinned build (T12, #265)
- display: private; load: load2; estimated 22 min
- run: `pinned-L1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/ at 69bd7993e1f1cb252574939bd6e8e80674bab5b8, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64-042/engine/linux/cua-engine (sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh task123-x64 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/scripts/linux-engine-gate/gate.mjs run L1 --pinned /Users/new/.local/share/cua-171/m5/home-x64-042 --out /Users/new/.local/share/cua-171/m5/out-x64-h6`
- started 2026-11-21T01:01:40.586Z
- finished 2026-11-21T01:31:46.700Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
