# M4 T7b's third fix: the held launcher's owner

These are development runs on the #171 VM (`dc-linux171-1e68`), 2026-11-04, not a release gate. Every probe ran on its
own `xvfb-run -noreset` display, and the sitting ran on the harness's private display; nothing ran on `:0`.
`pgrep -x stress-ng` was 0 at each start. The engine is the musl build of d4f1faee, made as the release workflow makes
it: `cua-engine 0.3.0 (d4f1faee820f)`, sha256 `5c72cb2ddc7055ab377fa4108aec6607fdc11b0ae807e1ab3ba3e3ec42b245a9`.
`<worktree>` is the fix worktree and `<probes>` the probe directory.

## A supervisor SIGKILLed (`probes/supervisor-kill-*.log`, `probes/supervisor-kill-all.sh`)

Each probe starts cua serve of a checkout with cua's engine and holds Shift on the desktop route, then does one of two
things:
- **held**: a sleeping cell is admitted, then cua serve is SIGKILLed. Its anchor exits, the supervisor's input ends,
  and from T7b's fix on the supervisor holds the worker's launcher while it drains. No teardown of cua serve's is
  coming. The probe waits until the launcher is held.
- **unheld**: cua serve is stopped (SIGSTOP), so it cannot react, and nothing is held.

Then the supervisor is SIGKILLed. 3 s later, every process recorded under cua serve beforehand is listed with its
state.

| Checkout | Case | Launcher before | Left 3 s later | Keys after |
|---|---|---|---|---|
| fix 3 (`head`) | held, scoped | T | nothing | [50] |
| fix 3 | held, sandbox disabled | (none) | nothing | [] |
| fix 3 | unheld, scoped | S | nothing (the stopped cua serve's anchor) | [50] |
| fix 3 | unheld, sandbox disabled | (none) | nothing (the anchor) | [] |
| fix 2 (d80f5719) | held, scoped | T | **the worker's launcher, stopped (T)** | [] |
| fix 2 | unheld, scoped | S | nothing (the anchor) | [] |
| before T7b (f59575fb) | held mode, scoped (nothing held) | S | nothing | [] |
| before T7b | held mode, sandbox disabled | (none) | nothing | [] |
| before T7b | unheld, scoped | S | nothing (the anchor) | [] |
| before T7b | unheld, sandbox disabled | (none) | nothing (the anchor) | [] |

The anchor listed in the unheld rows belongs to the stopped cua serve (its parent is still alive). It exits once the
probe kills cua serve at the end.

- **The orphaning does not predate T7b.** A SIGKILLed supervisor before T7b leaves neither launcher, worker nor engine
  in any of the four cases: the worker's lifeline ends it, and its sandbox goes with it.
- **The stopped launcher came with fix 1's hold**, and fix 2 still left it (`fix2-held-scoped`: the launcher in state
  T 3 s later).
- **Fix 3 leaves nothing**: the launcher's parent-death signal is SIGKILL, which takes it, and bwrap's
  `--die-with-parent` takes the sandbox.
- **Held input, sandboxed:** the fix-3 rows end with Shift still down. The launcher's SIGKILL ends the PID namespace
  at once, the engine in it, before the worker's lifeline path would have stopped it and released the key (the fix-2
  and pre-T7b rows release it). That is the SIGKILL limit: the M4 report's limit line for deaths without a drain names
  the case. With the sandbox disabled, the worker dies and the engine sees its stdin close and releases first.

The two fix-2 runs with the sandbox disabled are not kept. They ran from a partial export of d80f5719 where cua serve
could not start. The export was then made whole, and the scoped fix-2 runs come from it.

## Which thread forks the launcher (`probes/spawn-thread.*`)

`strace -f` over a Node process that starts a child through `startKernelChild` with the built engine as its shim, while
a worker thread runs and the libuv pool reads files. The clone that makes the child is issued by the process's own pid
(its main thread's tid). The child then runs `prctl(PR_SET_PDEATHSIG, SIGKILL)` and execs the program. The
parent-death signal follows the forking thread, and the main thread lives as long as the process.

## `held-back/`, the stopped-process check (10 a lane, scoped)

**pass**: drain 10 of 10, the engine gone 7057–7099 ms after the stream's end (by(0.4) is at 7000); the control left the
key down 10 of 10. No run left a process stopped.
