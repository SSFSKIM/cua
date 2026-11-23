# H2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: T17's Electron cells at the gate's window load
- display: private; load: gate-windows; estimated 25 min
- run: `pinned-H2`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64/ at cd03a47bde2a484e1c3ecbf07cc97aada720fda7, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64-044/engine/linux/cua-engine (sha256 eff8befcf591b937c3b019f32a2b9e36b47d126ffb12b1c187dc18519e4d67ca as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64/scripts/linux-engine-gate/gate.mjs run H2 --pinned /Users/new/.local/share/cua-171/m5/home-x64-044 --out /Users/new/.local/share/cua-171/m5/out-x64-h9`
- started 2026-11-23T10:33:50.360Z
- finished 2026-11-23T10:52:27.247Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
