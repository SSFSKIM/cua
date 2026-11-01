# #237 live checks: end_task frees the engine; engine_busy names its holders (2026-11-01, MacBook)

There was no owner slot and no GUI work: neither check acts on an app, and the owner was not needed.

## end_task drops the connection (09:01–09:03Z)

- **Setup:**
  - The client ran at branch head 2f9a83ef, against the installed engine: build dd7a09235885, pid 97954. That build predates holder naming.
  - The driver was [live-end-task.mjs](live-end-task.mjs) (`--repo` defaults to the worktree it was written in). It speaks MCP over stdio to this branch's `node bin/cua.mjs serve`, with `CUA_NATIVE_ENGINE=cua` and `CUA_CURSOR_LABEL=live-237`.
  - It ran a `cua.listApps()` cell, then `end_task`, then `cua engine status` at 0, 250, 500, 1000 and 2000 ms, one at a time. Then a second cell, status, `end_task` and the same polls.
- **[live-end-task-2f9a83ef-build.jsonl](live-end-task-2f9a83ef-build.jsonl), with `--try-build`: PASS.**
  - Before each `end_task`, status read 1 other connection. It was unnamed: the installed engine has no `holders`.
  - The first poll after each `end_task` read 0. It started 66 ms and 22 ms after the request, and the count stayed 0 through +2 s and after the server closed.
  - The second cell reconnected.
  - With the holder connected, `node bin/cua.mjs engine build` refused `engine_busy` about 210 ms after it started, through the new early check.
  - The engine directory was untouched: no staging or build directory appeared, and the bundle, approved.json and pending.json kept their mtimes.
  - This run set `CUA_SIGNING_IDENTITY`, because build checks that an identity is configured before anything else. Nothing was signed.
- **[live-end-task-2f9a83ef.jsonl](live-end-task-2f9a83ef.jsonl): the same run without an identity.**
  - Its build step stopped earlier, at `engine_identity_missing`, which is why the run above was made.
  - Its end_task results were the same: 0 at the first poll after each `end_task`, and the reconnect worked.

## Holders named (scratch engine)

- **Setup:** [scratch-holders.sh](scratch-holders.sh) ran the branch's debug engine (sources at 790295f3) on a private socket under a scratch HOME. The unbundled engine runs only the non-prompting preflight, so no TCC was involved. Two stand-in holders ([holder.mjs](holder.mjs)) each connected and sent a cursor label.
- **Result, in [scratch-holders-790295f3.log](scratch-holders-790295f3.log):**
  - `cua engine status` read `2 other connection(s): pid 73206 (MAWS), pid 73207 (cursor235)`.
  - `cua engine stop` refused: `the engine (pid 73118) has 2 other connections open: pid 73206 (MAWS), pid 73207 (cursor235) [engine_busy]`.
  - After each holder was killed, the count went to 1 and then 0.
