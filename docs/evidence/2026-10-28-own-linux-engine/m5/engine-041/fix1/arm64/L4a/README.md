# L4a (development run, not a release gate, pilot)

**development run, not a release gate.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: T17's Electron cells at twice the load
- display: private; load: load2; estimated 25 min
- run: `m5-dev-L4a-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t101-041/ at ac8d86a62f9a80bb543e5459f6c42a34be267bb7, clean
- candidate: /Users/new/Developer/GitHub/cua/.claude/worktrees/t101-041/native/linux-engine/target/release/cua-engine (sha256 bab84b1fec6b57ba18fde358d62f8b5556e2672ef80a106eb591a9211899bd1f as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-engine041 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t101-041/scripts/linux-engine-gate/gate.mjs run L4a --candidate /Users/new/Developer/GitHub/cua/.claude/worktrees/t101-041/native/linux-engine/target/release/cua-engine --out /Users/new/.local/share/cua-171/task101/out3/gate --dev --pilot 100`
- started 2026-11-18T16:40:58.448Z
- finished 2026-11-18T17:02:14.512Z; exit 0; private display's watchdog: clean
- unjudged (a pilot takes no top-up; not passes): none
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
