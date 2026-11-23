# M4 T7b's fix: the design session's rulings and the review

Development runs on the #171 VM (`dc-linux171-1e68`, 8 vCPU), 2026-11-04, not a release gate. Every sitting ran on a
private Xvfb the harness started itself (the live-run declaration withdrawn; nothing on `:0`), every probe under its own
`xvfb-run`; no other session's `stress-ng` was running at the start of any of them. The candidate is the musl build of
192cb80c made as the release workflow makes it: `cua-engine 0.3.0 (192cb80c2013)`, sha256
`f0f987bb5466252d98de27012da88e6b0019a72613d0cb2ddd33e0b5e78c2184`. The control is the REPL host of f59575fb
(`control-f59575fb`, the branch before T7b), with the same engine. The harness is 82687dc4 (`idle/`) and ed724671
(the others; a comment differs).

```bash
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix/idle --trials 10
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix/idle-disabled --sandbox disabled --cases hold --trials 10
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix/load2-burst --cases burst --paths idle,eof,signal,remote --load-factor 2 --trials 10
```

| Directory | Sandbox | Load | Verdict |
|---|---|---|---|
| `idle/` | scoped | none | **pass**: drain 90 of 90; the control left the key down 50 of 50, `held-back` included; bursts reported |
| `idle-disabled/` | disabled | none | **pass**: drain 50 of 50; the control left the key down 40 of 40 on the four paths; `held-back` reported |
| `load2-burst/` | scoped | 2x (16 stress-ng workers) | **fail, as the review's item 7 asks it to**: drain 40 of 40 exact; the control cut no burst, 0 of 40 |
| `explore-load2-kill/` | scoped | 2x | the control lane alone, 5 a path, before the sitting: 0 of 20 cut |

Every run found its session's one engine before the stop (`engines` 1 in every row), none failed on its way, and each
effect was read once the engine had gone and before the run's cleanup.

## `held-back`: admitted work past upstream's escalation, with a key held

The stream's end while a cell sleeps 12 s: cua serve waits 5 s for the task's completion, then tears the runtime down,
EOF first, SIGTERM to the owned group at by(0.4) = 7 s after the end, SIGKILL at by(0.7) = 8.5 s.

- Sandboxed (`idle/`): the drain lane released Shift 10 of 10, the engine gone 7062-7108 ms after the end; the control
  left it down 10 of 10, the engine gone 7028-7034 ms after the end, at the group's SIGTERM.
- Sandbox disabled (`idle-disabled/`): both lanes released it, 10 of 10 each (the engine is in the owned group and the
  group's SIGTERM is its first signal in either lane), engine gone 7007-7033 ms.

Before the fix the sandboxed drain lane failed this too: `probes/sandboxed-noreset.log` (the host and engine before the
fix) ends with `keys after [50]`, and `probes/strace-engine-sb.log` shows the engine got no signal at all before
`killed by SIGKILL`: the group's SIGTERM reached the worker's outer `codex-linux-sandbox`, which ends its sandbox at
once (bwrap's `--die-with-parent` ends the PID namespace). After the fix, `probes/sandboxed-fixed.log` and
`probes/disabled-fixed.log`: `keys after []`. (The probes' Xvfb runs with `-noreset`: without it the server resets once
its last client leaves and every key reads up, which hid the bug in a first probe.)

## The burst (the review's item 7)

Through the production stop paths the control cut no burst, idle (40 of 40 exact) or at twice the load (40 of 40, and
20 of 20 in the exploration). The control's engine lived 97-355 ms after the stop began at 2x: cua's service answers
each key as soon as it is sent and holds the next 100 ms behind it, so at the stop the last key is the only recent one,
and Chrome has taken it before the killed engine's unredirect. No pending-burst condition was established; the
sitting's verdict says so (`load2-burst/summary.md`). The drain lane landed every key in order in all 80 burst runs.

## The worker's own end (the design session's item 4)

`probes/worker-dies-*.log`, the worker SIGKILLed from outside with Shift held (its exit is what matters, as for a
`process.exit`): sandboxed, the engine is `killed by SIGKILL` (`probes/strace-worker-dies-sb.log`) and the key stays
down: the inner `codex-linux-sandbox`, the PID namespace's PID 1, exits with the worker, and the namespace's end
SIGKILLs every process in it. With the sandbox disabled the key is released within 11 ms: the engine sees its stdin
close and its orderly exit releases first. The reaper now lets such a stray engine drain before its SIGKILL (kernel-child.test.mjs; not a live measurement).

## The residual (`probes/residual-long-request.log`)

Admitted work holds the drain past by(0.4) while an engine request of its own runs on (a 23 s desktop scroll): the
supervisor's stop at by(0.4) tells the engine to stop, but the request is still running when the group's SIGKILL comes
at by(0.7), 1.5 s later and before the engine's 2 s backstop, so neither the drain nor the backstop's release runs:
`keys after [50]`, the engine `killed by SIGKILL` (`probes/strace-residual.log`).
