# M3 evidence: standalone MCP server and task lifecycle

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M3. Run on 2026-10-02, macOS 26 arm64,
host Node 22.23.2, against the M2 scratch install (`$CUA_HOME`, a `/tmp/cua-m2-archive.*` directory holding the
verified `26.928.40906-darwin-arm64` release). Paths below use `$CUA_HOME`, `$RUNTIME`
(`$CUA_HOME/runtimes/26.928.40906-darwin-arm64`) and `~`.

The deterministic evidence is `npm test` (fake upstream in process and as real child processes, plus `cua serve` and
`cua-shim.mjs` end to end on a scratch home). The live runs below are opt-in and read-only: cells only wait or write
text; the first cell of each connection loads the vendor API, which contacts the native helper. No app was bound, no
GUI action was taken, and no elicitation occurred (any would have been declined).

## `node verify.mjs` (acceptance 4 and the task-ID part of 8): PASS

| Check | Result |
|---|---|
| Handshake through `bin/cua.mjs serve` | `rmcp 1.5.0`, protocol `2025-06-18`, instructions 1371 characters (cap 2048) |
| Model-visible tools | exactly `js`, `js_reset`, `end_task`, `secrets_list`; `turn_ended` and `js_add_node_module_dir` hidden |
| `end_task` with no task | `{status:"noop", ended:false}` |
| `secrets_list` | `{status:"unavailable", code:"secrets_not_configured"}`, no labels (M4 wires storage) |
| Two js calls | same task ID; `end_task` then `{status:"ended", ended:true, taskId:<that ID>}`; a repeat is `noop`; the next js gets a new task ID |
| Executables serving the connection | 6 processes, all under `$RUNTIME`: `cua_node/bin/node`, `cua_node/bin/node_repl`, `CodexCLI.app/Contents/MacOS/codex`; no installed-desktop path |
| Native helper holding the socket | pid 34706, `~/.codex/computer-use/Codex Computer Use.app/.../SkyComputerUseService`: the owner's existing helper (another installation), neither started nor stopped by cua. Cold start remains BLOCKED as in M1. |
| Close | exit 0 on EOF; no connection directory left under `$CUA_HOME/run/`; no `$RUNTIME` process left |

This proves relocated execution through the actual launcher with the server's own configuration, not desktop absence
(ChatGPT stayed installed and running).

## `node scripts/probe-lifecycle.mjs` (native cancel/end-task behavior, acceptance 8)

| Scenario | Observed |
|---|---|
| `notifications/cancelled` 0.5 s into a cell that waits 3 s | Forwarded; node_repl kept running the cell, which finished and replied normally (`isError:false`, ~2.5 s after the cancel); the next cell saw the cell's final state. Cancellation is not honored for a running cell in this runtime, so a cancel acknowledgement would never have been evidence of quiescence. `end_task` afterwards ended normally. |
| `end_task` 0.3 s into a 2 s cell | New work sent right after was rejected at once with `task_ending`; the running cell replied normally; `turn_ended` followed and `end_task` returned `ended` within 1 ms of the cell's reply. |
| `end_task` while a cell waits 15 s (`timeout_ms` 30 s) | At the 5 s completion deadline `end_task` returned `isError:true` `{status:"error", ended:false, code:"completion_timeout", stage:"quiescence", nativeCleanup:"unconfirmed"}`; the running call was failed once with `connection_failed`; no `turn_ended` was sent; the server tore down and exited 1 about 2.2 s later. Stderr: `connection failed (completion_timeout, quiescence)`, then `runtime teardown needed SIGTERM; every owned process is gone`. No `$RUNTIME` process remained. |
| Idle EOF | exit 0 about 215 ms after EOF, with EOF alone (no signal); no process remained. |

Not observed (no app was bound): app approvals and their per-connection persistence; native side effects of
`turn_ended` for the sky service (M1: sky registers no turn-ended hook, so none are expected). Terminating the runtime
does not undo native actions already submitted; on the failure path native cleanup is reported unconfirmed.

## Raw runtime behavior behind the design (direct MCP to the relocated runtime, no server)

- Pinned upstream tool schemas: `js {code, timeout_ms?, title?}` (default timeout 30 s), `js_reset {}`,
  `js_add_node_module_dir {path}`, `turn_ended {hook_event_name, session_id, turn_id}` with `_meta.ui.visibility: []`
  and the description "Repeated notifications for the same session and turn are ignored". Two `turn_ended` calls for
  the same IDs both returned `{}`.
- node_repl serializes cells itself and replies to a cancelled request.
- An upstream `js_reset` preempts a running cell (the cell replies `js execution reset`, isError). The server
  serializes `js_reset` behind running work as the spec requires, so a reset cannot unstick a cell; the cell's own
  `timeout_ms` does (`js execution timed out; kernel reset, rerun your request`).
- After a timeout or reset of a busy cell, the killed kernel's `node` kept running for seconds after the launcher had
  exited on EOF, reparented to launchd but still in the launcher's process group. This is why the server spawns the
  runtime as its own process group and tears down the group, not the launcher pid.
- On a timeout, node_repl logs the cell source (identifier-redacted) to its stderr, which the server passes to its own
  stderr. Relevant to M5's sentinel checks; cells never contain secret values by design.
- A runtime terminated with a cell running leaves its `node_repl/active_execs/<exec>.json` record under
  `$CUA_HOME/state/codex`. node_repl writes and removes these; no reader was found in node_repl itself.
