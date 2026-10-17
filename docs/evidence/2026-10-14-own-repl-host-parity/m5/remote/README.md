# M5 remote acceptance on the mini's browser-only endpoint (acceptance 7's remote half; task 5)

**Mini endpoint only.** The cua-linux endpoint belongs to task 6's sitting.

## Commits

| Role | Commit |
|---|---|
| Endpoint checkout (mini parity clone, prepared by task 4) | `1d1ed89bb192041e1be4e50d62bd772f12577356` |
| Product code at that head | `e24a1cd` |
| Harness (this worktree) at preparation | `b3cb6db`. `fabfb11` landed before the start; it changes only the managed fixtures' archive cache. |

Runtime: 26.928.40906-darwin-arm64.

## Endpoint: RemoteProofEndpoints

Commands, all run from this worktree with `CUA_NODE` and `CUA_HOME` unset and `CUA_REPL_HOST=cua`:

```sh
node scripts/repl-parity/remote.mjs --experiment m5t5r1 --relay wss://178-104-102-73.sslip.io/ws --out docs/evidence/2026-10-14-own-repl-host-parity/m5/remote --device mini
# stopped at the two handoffs; then, after both were done:
node bin/cua.mjs devices add repl-m5t5r1-mini-browser --relay https://178-104-102-73.sslip.io --device Vu5kX8vUd7cYoR6CwjG_-w
node scripts/repl-parity/remote.mjs ... --action start --operator-ready --owner-ready   # stdin: a FIFO held open by a dispatcher-owned process
```

**Identity.** These fields are safe to record, and `endpoints.json` is the harness journal:

| Field | Value |
|---|---|
| Device name | `repl-m5t5r1-mini-browser` |
| deviceId | `Vu5kX8vUd7cYoR6CwjG_-w` |
| Relay endpoint | `https://178-104-102-73.sslip.io/d/Vu5kX8vUd7cYoR6CwjG_-w/mcp` |
| Client key name | `CUA_DEVICE_Vu5kX8vUd7cYoR6CwjG__w` |
| Surfaces | `browser` |

**Home.** A fresh `cua install` scratch home, `~/.local/share/cua-parity-remote/m5t5r1-weUX8M` on the mini, outside
TMPDIR, with an ownership marker. It used the managed Node v24.22.0 (`nodeMode: managed`, no override). The scratch
agent got a private HOME holding synthetic, presence-only Chrome metadata for the prepared `ssfs` binding. No profile
contents were copied and no extension was installed.

**Handoffs.**
- The relay operator (the session) merged the `devicesEntry` into the relay table; the relay then reported 4 devices,
  the others unchanged.
- The owner stored the client credential under the key above through the cua plugin's `/secret` mod, in the global
  store. Their first attempt was refused because the value was typed into the prompt box rather than the secret field.
- Before the endpoint started, `devices list --json` showed `credentialStored:true`.
- The credential itself was never read or printed. It stayed in the mini's 0600 `enroll.json` until that home was
  deleted.

The relay server was recreated by Hetzner on 2026-10-13, so its ssh host key changed. The new ED25519 fingerprint is
`SHA256:LAHSFscDZcM2dVcXTCtB+AOxyS88XuZ5mrdc3GdM7tQ`. No ssh to the relay was needed here.

**Start and attestation** (`attestations/start-cua.json`).
- The endpoint became relay-ready with the owned agent PID 9031.
- The harness's real `initialize` returned `serverInfo {name:'cua-repl-host', version:'0.5.0'}`.
- A real js result carried `_meta['cua/replHost'] {host:'cua', version:'0.5.0'}`.
- The managed-Node witness found the production supervisor `<home>/node/24.22.0/bin/node --disable-sigusr1 …/supervisor.mjs`
  (PID 9226), v24.22.0, inside the owned agent's subtree.
- `profiles_list` showed `ssfs` ready for the prepared backend.

Restarts for the benchmark kept the same identity. `restart` stops the owned agent and spawns `agent run --relay`
again with the new `CUA_REPL_HOST`. It never runs `cua install`, and it refuses if the clone's commit, release or
clean state has changed since preparation. Each restart re-attested; those records are under
`../../../2026-10-14-own-repl-host-benchmark-m5/attestation/`.

## Remote acceptance: the existing cua-remote skill flow

Details are in `part2-skill-flow.md`. The client was this Mac's installed cua plugin's `cua_repl` tools.

| Check | Verdict |
|---|---|
| `devices_list`, then `devices_use repl-m5t5r1-mini-browser` | pass: online; it switched with the owned facade's browser-only tool text |
| js observe/act/verify on a harness-owned page (loopback fixture on the mini, `127.0.0.1:48741`, tracked and stopped) | pass: `{"before":"ready","after":"clicked","verified":true}` |
| `js_reset` | pass: bindings gone (`tabBound:false`, `browserBound:false`), and the next call emits a fresh bootstrap |
| Switch with an open task | pass: refused, `{"status":"error","code":"task_open"}` |
| `end_task` | pass: `ended` |
| Switch back to local | pass |
| Elicitation | **not exercised live** (see below) |
| Host attestation: initialize plus a real result | pass, at the endpoint level (see below) |
| Kill-client / count-one (controller op `probe`) | **pass**: `{"requestId":3,"disruption":"after-started","count":1}`, mini load 2.61 |
| Resident `mini` endpoint | vendor-routed; not counted as own-host proof |

**Elicitation.** No production path on this endpoint issues `elicitation/create`:
- the cua browser service asks for no approvals;
- `nodeRepl.createElicitation` is privileged and cells cannot reach it;
- secrets are off and the trusted services are the production ones.

An elicitation would also open a dialog in the owner's session. Coverage comes from elsewhere instead: the device relay
leg in `test/mcp-devices.test.mjs`, and the own host's accept, decline and cancel in the services suite.

**How the attestation was taken.** Each plugin connection's own handshake is not visible to the client model:
`devices_use` passes on only `instructions`, and Claude Code does not show `_meta`. So the answering host is attested
at the endpoint in two ways:
- the harness's real initialize, real result and managed-Node witness;
- process samples of the owned agent's subtree during the flow (`samples/part2.jsonl`): 1 cua supervisor and 0 vendor
  processes whenever a session runtime was live.

**Kill-client probe.** A cell appended one increment to a harness-owned counter under the device's TMPDIR, signalled
`started`, and waited on a bounded release file. The harness then SIGKILLed its own MCP client. It reconnected a fresh
client without resubmitting, released the cell, and read the counter as exactly 1, both through the device helper and
through the reconnected client. Nothing was replayed. The fixture directory was removed when the session closed.

**Resident endpoint.** `devices_use mini` returned the vendor facade's js text (with `iab` and `mcpapps`). One
`nodeRepl.write` cell returned the vendor first-call document. `samples/resident-check.jsonl` shows the resident
agent's subtree with 1 vendor node_repl, 1 vendor launcher and 0 cua supervisors. `end_task` was called, then the
client switched back to local. The resident agent was not otherwise used, restarted or reconfigured.

## Cleanup

1. `{"op":"stop"}` on the controller's stdin stopped the owned agent (journal `pid: null`, phase `handoff`).
   - The controller process then stayed alive after its loop ended, apparently because the FIFO stdin kept the event
     loop open.
   - It was ended with SIGTERM to its own PID, after the journal was saved; the endpoint was already stopped.
   - The harness should close stdin after `stop`, and this is recorded as a harness note.
2. `node bin/cua.mjs devices remove repl-m5t5r1-mini-browser`: removed. The stored key stays until the owner removes it.
3. `remote.mjs --action cleanup`: the owned home `m5t5r1-weUX8M` was removed, including its enroll file (journal phase
   `operator-cleanup`, `removed: true`).
4. `repl-parity.mjs cleanup-prepared --device mini` and `browser-parity.mjs cleanup-prepared --device mini` both
   returned `removed: true`. `~/.local/share/cua-parity-remote/` on the mini is now empty.
5. **Still open, handed back:**
   - relay operator: remove only `Vu5kX8vUd7cYoR6CwjG_-w` from the merged table, then apply
     `relay/deploy/update.sh --devices <merged-table>`;
   - owner: remove `CUA_DEVICE_Vu5kX8vUd7cYoR6CwjG__w` through the secret UI.

`load/` holds `uptime` on the mini and on this Mac at preparation and at start. The probe records its own mini load,
and the benchmark records load per run.
