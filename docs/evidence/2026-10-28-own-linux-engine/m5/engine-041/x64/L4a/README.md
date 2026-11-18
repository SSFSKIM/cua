# L4a (development run, not a release gate, pilot)

**development run, not a release gate.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: T17's Electron cells at twice the load
- display: private; load: load2; estimated 25 min
- run: `m5-dev-L4a-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a817caeccef5345cc/ at 2d8f6ad962960150f0728a004a2a87372c56d499, **not clean**
- candidate: /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a817caeccef5345cc/native/linux-engine/target/release/cua-engine (sha256 cb879d77133076707aee1c16d267e489f4366488dc0bafcac2dc6e8f5b2abbab as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-engine041 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a817caeccef5345cc/scripts/linux-engine-gate/gate.mjs run L4a --candidate /Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a817caeccef5345cc/native/linux-engine/target/release/cua-engine --out /Users/new/.local/share/cua-171/task101/out-x64/gate --dev --pilot 100`
- started 2026-11-18T12:24:50.983Z
- finished 2026-11-18T12:44:13.964Z; exit 0; private display's watchdog: clean
- unjudged (a pilot takes no top-up; not passes): none
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
