# F3b (development run on the pinned release, not acceptance, never counted, pilot)

**development run on the pinned release, not acceptance, never counted.** A pilot: the step's smallest form, to show it starts; no verdict of it is the gate's.

- what: T7 revised at twice the load: click then paste, a click into another field then paste
- display: own; load: load2; estimated 15 min
- run: `m5-pinned-dev-F3b-pilot`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64/ at da306cc6319e7e9da282812402308c074b872dee, clean
- candidate: /Users/new/.local/share/cua-171/m5/pilot-arm64/home/engine/linux/cua-engine (sha256 0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42 as given)
- command: `/Users/new/.local/share/cua-171/locked.sh t96-arm64 /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64/scripts/linux-engine-gate/gate.mjs run F3b --pinned /Users/new/.local/share/cua-171/m5/pilot-arm64/home --out /Users/new/.local/share/cua-171/m5/pilot-arm64/out --pilot 2`
- started 2026-11-18T06:54:36.960Z
- finished 2026-11-18T06:58:55.414Z; exit 0
- unjudged (a pilot takes no top-up; not passes): 9
  - chrome click-paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - chrome click-field: a series of 2, shorter than the 30 the proof needs (a pilot)
  - electron click-paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - electron click-field: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gedit click-paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - kate click-paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - qtcreator click-paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - writer click-paste: a series of 2, shorter than the 30 the proof needs (a pilot)
  - gnome-terminal click-paste: a series of 2, shorter than the 30 the proof needs (a pilot)
- end check: clear (no cua171-run-* directory or session bus of one)
- unclean end (the run's own side, not a verdict failure): 1
  - a process it spawned still runs: pid 495717 openbox
