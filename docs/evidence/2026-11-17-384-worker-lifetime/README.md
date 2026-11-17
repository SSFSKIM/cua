# Why cua's REPL host pays for a stall at the next setup and the vendor's does not (#384)

Task 95 (2026-11-17, dc-linux171). The #384 investigation (`diag/384-cdp-latency`) found that after a hidden agent tab
stalls, cua's REPL-host lane times out two more `Emulation.setFocusEmulationEnabled` commands at about 1.5 s, the
second while the browser service's `setup` runs, and the vendor's lane does not. This probe shows why.

`probe.mjs` drives a REPL host over MCP stdio with one fixture trusted service (`svc/probe-svc.mjs`), which answers its
worker's pid and how long ago that worker loaded it, and registers a turn-ended handler that outlasts its 1 s deadline.
The probe makes a call, runs `js_reset`, ends the turn, resets again, and lets a cell time out, asking for the pid
after each step.

- `vendor.txt`: the pinned vendor `node_repl` (26.928.40906, linux-x64, run with the sandbox disabled). Every
  `js_reset` and every cell timeout starts a new trusted worker: a new pid, and service state from zero (`age` 0).
- `cua.txt`: cua's own host (`src/repl-host/supervisor.mjs`). The worker and its services survive both (one pid, `age`
  growing). This is cua's design (own-REPL-host spec, Decision Log 2026-10-14: "The port's trusted worker starts on the
  first service request and survives kernel resets and timeouts"), and later work relies on it (the Linux service's
  held handles and `kernel_reset`, sky_linux as the worker's child).

What follows for the browser service: every new kernel's bootstrap calls `setup` on both hosts (each parity case starts
with `js_reset` and a fixture-setup cell; a cell's timeout also starts a new kernel). On the vendor's host that `setup`
runs in a fresh worker, so there is no previous runtime to dispose, and the old worker's unfinished turn-end work dies
with it. On cua's host the same `setup` disposes the previous runtime, joining whatever the turn's end left running.
Before the fix, that work removed the page clipboard bridge step by step, each step with a fresh 3 s budget, and
re-attached a tab the host had detached at the first step's timeout. On a starved tab each re-attach waited 1.5 s on
the page guard and then timed out `setFocusEmulationEnabled` on the remaining 1.5 s. The `setup` re-run is correct
behaviour; the fix is in the removal and the dispose (`src/browser-service/clipboard-bridge.mjs`, `cdp.mjs`).

To run again, with `$R` the vendor runtime's `cua_node` and `$E` this directory:

```
node $E/probe.mjs "[\"$R/bin/node_repl\"]" '{"NODE_REPL_NODE_PATH":"'$R'/bin/node","NODE_REPL_TRUSTED_SERVICES":"{\"probe\":\"'$E'/svc/probe-svc.mjs\"}","NODE_REPL_TRUSTED_CODE_PATHS":"'$E'/svc","NODE_REPL_TRUSTED_RPC_ENABLED":"1","NODE_REPL_DISABLE_ANALYTICS":"1"}'
node $E/probe.mjs "[\"$(command -v node)\",\"--disable-sigusr1\",\"$PWD/src/repl-host/supervisor.mjs\"]" '{"CUA_REPL_NODE_PATH":"'$(command -v node)'","CUA_REPL_TRUSTED_SERVICES":"{\"probe\":\"'$E'/svc/probe-svc.mjs\"}","CUA_REPL_TRUSTED_CODE_PATHS":"'$E'/svc","CUA_REPL_TRUSTED_RPC_ENABLED":"1","CUA_SANDBOX_DENY_READ":"[]"}'
```
