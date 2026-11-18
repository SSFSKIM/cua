# L4a (development run, not a release gate, pilot)

**development run, not a release gate.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: T17's Electron cells at twice the load
- display: private; load: load2; estimated 25 min
- run: `m5-dev-L4a-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t98-l4a/ at b74961ca7cf262220440f69f6d160f71ab422410, clean
- candidate: /Users/new/Developer/GitHub/cua/.claude/worktrees/t98-l4a/native/linux-engine/target/release/cua-engine (sha256 9ae1fbc134c171a3632f981c01542ffc35156ae77465394f26cd70c8ebaf3f83 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-l4a /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t98-l4a/scripts/linux-engine-gate/gate.mjs run L4a --candidate /Users/new/Developer/GitHub/cua/.claude/worktrees/t98-l4a/native/linux-engine/target/release/cua-engine --out /Users/new/.local/share/cua-171/task98/out/gate --dev --pilot 100`
- started 2026-11-18T10:44:04.304Z
- finished 2026-11-18T11:05:11.805Z; exit 1; private display's watchdog: clean
- unjudged (a pilot takes no top-up; not passes): none
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
