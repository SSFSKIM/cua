# L4b (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: the accept signal's false releases (the measurement lane, T14's 300 long drops and the controls)
- display: private; load: load2; estimated 25 min
- run: `pinned-L4b`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/ at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-041/engine/linux/cua-engine (sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t7-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/scripts/linux-engine-gate/gate.mjs run L4b --pinned /Users/new/.local/share/cua-171/m5/home-arm64-041 --out /Users/new/.local/share/cua-171/m5/out-arm64-h4`
- started 2026-11-19T05:15:35.132Z
- finished 2026-11-19T05:31:40.780Z; exit 1; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
