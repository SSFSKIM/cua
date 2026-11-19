# H2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: T17's Electron cells at the gate's window load
- display: private; load: gate-windows; estimated 25 min
- run: `pinned-H2`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/ at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-041/engine/linux/cua-engine (sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t7-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/scripts/linux-engine-gate/gate.mjs run H2 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-041 --out /Users/new/.local/share/cua-171/m5/out-arm64-h4`
- started 2026-11-18T22:57:43.062Z
- finished 2026-11-18T23:15:39.221Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
