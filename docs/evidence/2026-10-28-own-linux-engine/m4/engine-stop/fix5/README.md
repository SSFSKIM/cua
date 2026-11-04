# M4 T7b's fifth fix: the re-review's findings on the resident shim

These are development runs on the #171 VM (`dc-linux171-1e68`, 8 vCPU), 2026-11-04. They are not a release gate. Every
probe ran under its own `xvfb-run -noreset`, and every sitting ran on a private Xvfb that the harness started itself.
Nothing ran on `:0`, and `pgrep -x stress-ng` was 0 at each start.

- The candidate is the musl build of 50c1e536, made the way the release workflow makes it: `cua-engine 0.3.0
  (50c1e53661d0)`, sha256 `4a91a3abc7589921ff19d287de00a5393e07c77fcaf1c6dbc76beea5f9a15b39`. The host is the fix
  worktree's head, cd6fadd3.
- The rows labelled "fix 4" run fix 4's head (fce9e75b, exported with `docs/cua-api`) with its own engine, the musl
  build of bf7c69b4.
- Labels used in the logs: `<worktree>` is the fix worktree, `<probes>` the probe directory, `<cua home>` the default
  cua home, `<fix-5 engine>` and `<fix-4 engine>` the two engines.

## Does an inherited descriptor survive the sandbox? Yes (`probes/fd-in-sandbox.*`)

The probe runs a Node "worker" through the pinned `codex-linux-sandbox` in the worker's role, in the default state (no
sandbox state) and in a scoped one. The worker's descriptor 3 is the write end of an anonymous pipe, and the pipe's
reader is outside the sandbox. In both states:
- the worker finds the pipe at 3;
- it reopens the pipe close-on-exec through `/proc/self/fd/3` (descriptor 18, the same pipe inode) and closes 3;
- a child it starts plainly holds no end of that pipe (its 3 is the shell's own command-substitution pipe, another
  inode);
- a child it starts with the reopened descriptor in its stdio at 3 writes through it;
- the reader outside receives `from-enginevia-3`.

Since the descriptor survives, the record became that descriptor in every state, as the design session ruled.

## Who holds the record (`probes/head-reach-*.log`)

Through cua serve, after a cell holds Shift and button 1, every process on the machine is scanned for a descriptor on
the record's pipe. The record's pipe is the shim's only pipe beyond its stdio.

| State | Holders | Kernel side |
|---|---|---|
| scoped | shim (reader); outer and inner `codex-linux-sandbox` (inherited); worker (cloexec); engine (3, cloexec) | none |
| default | shim; outer `codex-linux-sandbox`; worker (cloexec); engine (3, cloexec) | none |
| disabled | shim; worker (cloexec); engine (3, cloexec) | none |

In the reach probe, a scoped cell (model code) walks the session's tmp and finds no FIFO. Under the default state the
walk is refused (`EACCES`).

## The reviewer's forge, from a model cell (`probes/{fix4,head}-forge-scoped.log`)

Another XTEST client (xdotool) holds Shift, and the engine holds nothing. A scoped cell drains every FIFO under the
session's tmp and writes a record naming Shift into each, in fix 4's layout and in fix 5's. Then the trusted worker is
SIGKILLed, so the shim acts.

| Head | The cell reached | The shim said | Keys 2.5 s later |
|---|---|---|---|
| fix 4 | `<cua home>/run/<session>/tmp/cua-held-…/held` | `released 1 of the 1 its engine held [key 50]` | `[]`: the other client's Shift released |
| fix 5 | nothing | nothing | `[50]`: still held by the other client |

## The engine outlives its worker inside a request (`probes/{fix4,head}-busy-*.log`)

A recorder window (`xprobe record`) covers the screen, and a cell holds Shift and button 1. A second cell scrolls far
longer than the probe runs (655 wheel steps of 36 ms each), and the supervisor is SIGKILLed during the scroll. The
recorder times every wheel press it receives, and the engine's end and the shim's are polled every 2 ms. Times are
measured from the SIGKILL.

| Head | Sandbox | Engine gone | Shim gone | Last wheel press | Presses after the shim's exit |
|---|---|---:|---:|---:|---:|
| fix 4 | disabled | +3014 ms | +1260 ms | +3004 ms | 48 |
| fix 5 | disabled | +1263 ms | +1268 ms | +1247 ms | 0 |
| fix 5 | scoped | +5 ms | +10 ms | none | 0 |

On fix 4 the shim released at its wait's bound and the engine went on pressing. On fix 5 the shim ended the engine
first, and only then released.

## Fix 4's regressions (e), on the head (`probes/head-*-{scoped,disabled}.log`)

The cases are the supervisor SIGKILLed with its launcher held and unheld, the worker SIGKILLed on its own, and the
worker SIGKILLed with the engine inside a long scroll, each sandboxed and disabled (`probes/probe-shim.*`,
`probes/probes-all.sh` run with `ONLY=head`). All 8 leave nothing behind, keys `[]` and buttons `[]`, and no process
stopped.

In `head-worker-busy-disabled` the shim said `its record's writers outlived the launcher by 1.25s: ended 1 holding it,
1 gone; released 3 of the 3 its engine held [button 5, button 1, key 50]`, and every sample from +1261 ms on reads
`keys [] buttons []`. On fix 4, button 5 was still down at +1556 ms.

## RED logs (`red/`)

- `red-live-findings.log`: the new live tests in `tests/launcher_shim.rs`, run against fix 4's engine. 4 failed:
  - forge;
  - suppress;
  - the engine left alive in state S at the shim's exit;
  - 10 of 70 held keys left down.
- `red-shim-unit.log`: the new shim unit tests with the old classification patched in. 2 failed.
- `red-held-client.log`: the worker's held-record test against the client before a070a560. 1 failed.

## The sittings

The control is the REPL host of f59575fb (`control-f59575fb`, the branch before T7b) running the same engine. The
harness is the fix worktree's.

```bash
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix5/idle --trials 10
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix5/idle-disabled --sandbox disabled --cases hold,handle --trials 10
```

| Directory | Sandbox | Verdict |
|---|---|---|
| `idle/` | scoped | **pass**: drain 130 of 130 (hold 50, burst 40, handle 40). Engines gone 59–394 ms after the stop on the four paths, and 7053–7084 ms after the stream's end on `held-back` (by(0.4) is at 7000). Control: key left down 50 of 50, button 1 left down 40 of 40, bursts 0 of 40 cut (reported) |
| `idle-disabled/` | disabled | **pass**: drain 90 of 90 (hold 50, handle 40). Engines gone 36–174 ms after the stop, and 7004–7032 ms on `held-back`. Control: key left down 40 of 40 on the four paths, button 1 left down 40 of 40; on `held-back` the control released 10 of 10 (reported, as in fixes 2 and 4) |

In every one of the 440 runs, the session's one engine was found before the stop, no run failed on its way, and no run
left a process stopped (`stopped_left` is `[]` in every row).
