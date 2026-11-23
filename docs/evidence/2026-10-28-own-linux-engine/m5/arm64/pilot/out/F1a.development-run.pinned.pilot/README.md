# F1a (development run on the pinned release, not acceptance, never counted, pilot)

**development run on the pinned release, not acceptance, never counted.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: T7 revised on the shipped engine: burst, A-B-A, key then paste
- display: own; load: idle; estimated 20 min
- run: `m5-pinned-dev-F1a-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64/ at da306cc6319e7e9da282812402308c074b872dee, clean
- candidate: /Users/new/.local/share/cua-171/m5/pilot-arm64/home/engine/linux/cua-engine (sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t96-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64/scripts/linux-engine-gate/gate.mjs run F1a --pinned /Users/new/.local/share/cua-171/m5/pilot-arm64/home --out /Users/new/.local/share/cua-171/m5/pilot-arm64/out --pilot 2`
- started 2026-11-18T02:48:50.661Z
- finished 2026-11-18T02:52:52.699Z; exit 0
- unjudged (a pilot takes no top-up; not passes): 24
  - chrome burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - chrome aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - chrome paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - electron burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - electron aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - electron paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gedit burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gedit aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gedit paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - kate burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - kate aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - kate paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - qtcreator burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - qtcreator aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - qtcreator paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - firefox burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - firefox aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - firefox paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - writer burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - writer aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - writer paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gnome-terminal burst: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gnome-terminal aba: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gnome-terminal paste: a series of 2, shorter than the 30 the proof needs (a pilot)
- end check: clear (no cua171-run-* directory or session bus of one)
- unclean end (the run's own side, not a verdict failure): 1
  - a process it spawned still runs: pid 138164 openbox
