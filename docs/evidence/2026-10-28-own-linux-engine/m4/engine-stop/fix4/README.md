# M4 T7b's fourth fix: the resident launcher shim

These are development runs on the #171 VM (`dc-linux171-1e68`, 8 vCPU), 2026-11-04, not a release gate. Every probe
ran under its own `xvfb-run -noreset`, and every sitting on a private Xvfb the harness started itself; nothing ran on
`:0`. `pgrep -x stress-ng` was 0 at each start.

- The candidate is the musl build of bf7c69b4, made as the release workflow makes it: `cua-engine 0.3.0
  (bf7c69b45cf4)`, sha256 `e54881bd1b58c021610d536067ef42918adce8bb632994efa45d5120898ae9a5`.
- The fix-3 rows run fix 3's head (305d8c10, exported with `docs/cua-api`) with its own engine, the musl build of
  d4f1faee (sha256 `5c72cb2ddc7055ab377fa4108aec6607fdc11b0ae807e1ab3ba3e3ec42b245a9`).
- `<worktree>` is the fix worktree, `<probes>` the probe directory.

## Where the record lives (`probes/fifo-in-sandbox.*`)

A process outside makes a FIFO in a private directory under the session's `tmp/`; a shell run through the pinned
`codex-linux-sandbox` in the worker's role opens it for writing, writes, and tries to create a file beside it. Under the
default state (no sandbox state: the whole filesystem read-only) the file cannot be made (`Read-only file system`) and
the FIFO write arrives (`read "default-ok"`); under a scoped state both work. A regular record file could not be written
in the default state; a FIFO can, by a path the worker already reads, with no policy change.

## The regressions (`probes/head-*.log`, `probes/fix3-*.log`, `probes/probes-all.sh`)

Each probe starts cua serve of a checkout with cua's engine, and a cell holds Shift on the desktop route (XTEST) and
button 1 (a `drag_handle` started and moved, never ended). Then one of:
- **held**: a sleeping cell is admitted and cua serve is SIGKILLed, so the supervisor's input ends and it holds the
  worker's launcher (state T, waited for); then the supervisor is SIGKILLed;
- **unheld**: cua serve is stopped (SIGSTOP), then the supervisor is SIGKILLed;
- **worker**: the trusted worker is SIGKILLed on its own, the supervisor living on (sandboxed, its PID namespace ends
  with it);
- **worker-busy**: the same while the engine is inside a desktop scroll far longer than the probe (655 wheel steps of
  36 ms each), so its stdin's end cannot start its exit before the namespace's SIGKILL.

The keys and buttons the X server holds are read at once after the engine is gone and 3 s later, with every process of
the tree recorded beforehand.

| Case | Sandbox | fix 4 (bf7c69b4): left / keys / buttons 3 s later | fix 3 (305d8c10) |
|---|---|---|---|
| held | scoped | nothing / [] / [] (engine gone 6 ms after the SIGKILL) | nothing / **[50] / [1]** |
| held | disabled | nothing / [] / [] | nothing / [] / [] |
| unheld | scoped | nothing / [] / [] | nothing / **[50] / [1]** |
| unheld | disabled | nothing / [] / [] | nothing / [] / [] |
| worker | scoped | nothing / [] / [] | nothing / [] / [] |
| worker | disabled | nothing / [] / [] | nothing / [] / [] |
| worker-busy | scoped | nothing / [] / [] (the shim: `released 3 of the 3 its engine held [button 5, button 1, key 50]`) | nothing / **[50] / [1, 5]** |
| worker-busy | disabled | nothing / [] / [] | nothing / [] / [] |

"Nothing" counts what may not outlive the case: the shim, the worker's launcher, bwrap, the worker and the engine (in
the worker cases the supervisor, the kernel and its sandbox live on, as they should; in the unheld cases the stopped
cua serve's anchor waits for its parent, and cua serve itself is the one stopped process, the probe's own SIGSTOP).

- With fix 3, a SIGKILLed supervisor leaves Shift and button 1 down, sandboxed: the launcher's parent-death SIGKILL
  ends the namespace with the engine in it.
- The plain worker case releases on both heads: the worker's death closes the engine's stdin, and the engine's
  release-first exit (fix 1) wins the race against the namespace's end, by microseconds. With the engine inside a
  request (worker-busy) nothing can, and fix 3 leaves Shift, button 1 and the wheel's button 5 down; fix 4's shim
  releases all three once the launcher is reaped and the engine has closed its record.
- With the sandbox disabled the engine outlives its worker and releases itself; in worker-busy the shim's release
  (after its 1.25 s wait for the record) comes first, the engine's own later (`head-worker-busy-disabled.log`: button 5
  of a later wheel step still down at +1556 ms, up by 3 s).
- The supervisor's own stderr is gone in the held and unheld cases, so the shim's sentence is not seen there; in the
  worker cases it reaches cua serve's stderr in the worker's exit diagnostic. `head-worker-scoped`'s record still held
  one key when the shim read it, already up at the server (the engine's own release had won), and the shim sent
  nothing (`released 0 of the 1`, in `probes-1a27e0bb`'s first run; the final run's engine had cleared its record).
- The same cases on the musl build of 1a27e0bb (before the stderr fix) gave the same results.

## The shim's stderr (`probes/stderr-gone*`)

On 1a27e0bb a shim whose stderr nobody read any more, after a release it could not make (no display), ended by SIGABRT
(status 134): `eprintln!` panics on a failed write. bf7c69b4 writes the sentence with the error dropped; the shim exits
3, as its program did (`tests/launcher_shim.rs`).

## The sittings

The control is the REPL host of f59575fb (`control-f59575fb`, the branch before T7b), running the same engine; the
harness is cec3f39b's (its one-engine check skips the shim).

```bash
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix4/idle --trials 10
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix4/idle-disabled --sandbox disabled --cases hold,handle --trials 10
```

| Directory | Sandbox | Verdict |
|---|---|---|
| `idle/` | scoped | **pass**: drain 130 of 130 (hold 50, burst 40, handle 40); engines gone 59–406 ms after the stop on the four paths, 7076–7116 ms after the stream's end on `held-back` (by(0.4) is at 7000); control: key left down 50 of 50, button 1 left down 40 of 40, bursts 0 of 40 cut (reported) |
| `idle-disabled/` | disabled | **pass**: drain 90 of 90 (hold 50, handle 40); engines gone 45–182 ms after the stop, 7006–7036 ms on `held-back`; control: key left down 40 of 40 on the four paths, button 1 left down 40 of 40; on `held-back` the control released 10 of 10 (reported, as in fix 2) |

In every one of the 440 runs the session's one engine was found before the stop (the shim not counted), none failed on
its way, and none left a process stopped (`stopped_left` is `[]` in every row).
