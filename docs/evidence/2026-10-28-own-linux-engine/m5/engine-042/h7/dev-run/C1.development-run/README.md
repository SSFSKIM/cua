# C1 (development run, not a release gate)

**development run, not a release gate.**

- what: #264's late-take path (T14) in three freeze bands: landed inside the hold, the edge's late takes counted, refused with the hold notice past it (ruling 931)
- display: private; load: idle; estimated 4 min
- run: `m5-dev-C1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80/ at 348cae0f49784596b95b80f74daad53a5a39d8c4, clean
- candidate: /Users/new/.local/share/cua-171/task121/home/.local/share/cua/engine/linux/cua-engine (sha256 a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-h7 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80/scripts/linux-engine-gate/gate.mjs run C1 --pinned /Users/new/.local/share/cua-171/task121/home/.local/share/cua --out /Users/new/.local/share/cua-171/task125/gate-dev --dev`
- started 2026-11-21T05:02:39.099Z
- finished 2026-11-21T05:04:43.631Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
