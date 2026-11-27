# E1 (development run, not a release gate)

**development run, not a release gate.**

- what: the events experiment: desktop move's later requests at or below the bar (T9)
- display: own; load: idle; estimated 8 min
- run: `m5-dev-E1`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m6b-t3/ at c0ea33bab3a7cb6052f59dbecd533e8188922926, clean
- candidate: /Users/new/.local/share/cua-171/t168/run/src/cua/engine/linux/cua-engine (sha256 ef714179ac244114431275580f600d9dc340b3d62142a59d7563149a76cc119a as given)
- comparator fixture: /Users/new/.local/share/cua-171/vendor-x64-pinned (tar sha256 2e6209866473328aa832fcb7b0e1f19b2a435fe803512c2bf578706f83505914); the pinned build /Users/new/.local/share/cua-171/vendor-x64-pinned/extracted/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64 (sha256 7ac3c2ae45a3dacc9209063e91d2df4ea9f206b814a9ffd976f5bcf90d73f1cd), the client /Users/new/.local/share/cua-171/vendor-x64-pinned/extracted/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky (service.js sha256 5b2fa2f0e19c8401a9be8c71be17008d88049ab107972c1e4a5cb615f4ef5993)
- command: `/Users/new/.local/share/cua-171/t168/run/src/home/.local/share/cua-171/locked.sh m5-gate /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m6b-t3/scripts/linux-engine-gate/gate.mjs run E1 --candidate /Users/new/.local/share/cua-171/t168/run/src/cua/engine/linux/cua-engine --out /Users/new/.local/share/cua-171/t168/run/fixture/out --dev`
- started 2026-11-24T13:25:44.158Z
- finished 2026-11-24T13:36:28.684Z; exit 1
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
