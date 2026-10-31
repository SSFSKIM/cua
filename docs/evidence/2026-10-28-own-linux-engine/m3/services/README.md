# M3.2: cua's own Linux service against the vendor's, on one engine

M3.2's live proof, on the #171 VM's `:0` (Ubuntu 24.04, X11), on checkout dd2255b4. The engine is built from this
branch: `cua-engine 0.3.0 (9381f166e106)`, whose sources are unchanged at that checkout.

## The same states and the same element numbers

The instrument is `scripts/linux-engine-diff/services.mjs`. It loads the vendor's `@oai/sky` service (pinned 26.928.40906,
`OAI_SKY_LINUX_BIN` set to the engine) and cua's `src/services/engine/linux/service.mjs` in one process. Each service
drives its own process of the same `cua-engine` build. Over each service sits its own instance of cua's facade
(`src/cua-api/sky.mjs` with `bind-linux-app.mjs`), reached through an RPC stand-in that carries values the way the trusted
worker's JSON transport does.

Three harness-owned scenes are read: gedit on a scratch file (498 nodes), Chrome on the harness page `scene.html` (243
nodes) and the over-budget page (5,000 nodes, the limit). On every scene, both lanes run the same steps, in lockstep on
the same window:

- the method list;
- the window's `list_windows` entry;
- `getAXState`, the rendered state the model reads;
- the full numbered tree (each node's decimal id and native id);
- a query observation;
- `getAXState` again after the query;
- the combined observation with its screenshot;
- an unknown element number;
- a real element's number with an action it lacks (the engine's sentence, reached through the number).

The scenes run in one order in both lanes, so the counter shared across windows is compared too.

Why this instrument: the service is the only layer that differs. One engine build, one moment of each scene and one
facade make any difference the services'. The comparison sits at the layer the model reads, the rendered state, and at
the layer the numbering lives in, the numbered tree. A run through two `cua serve` sessions would add the host, the
sandbox and the approvals, which neither service owns, and could not run the vendor service on cua's engine after M3,
since the `cua` selection now loads cua's service.

Result (`summary.md`, `results.jsonl`, which hold digests and counts, never a tree's text): **all 25 rows are equal**.
That covers the setup row and 8 steps on each of the 3 scenes: the same rendered states, the same element numbers, the
same native ids and the same sentences.

```
~/.local/share/cua-171/task17/services.sh docs/evidence/2026-10-28-own-linux-engine/m3/services
# = DISPLAY=:0 node scripts/linux-engine-diff/services.mjs --vendor-js <runtime>/cua_node/lib/node_modules/@oai/sky \
#     --engine native/linux-engine/target/release/cua-engine --out docs/evidence/2026-10-28-own-linux-engine/m3/services
```

## No vendor module for the Linux computer surface

This test traced a real `cua serve` session under `strace -f -e trace=openat,execve`: `scripts/accept/linux-native.mjs`,
with the default home and the scoped sandbox. The fixture binds gedit, types, reads back, takes a screenshot and launches
an application. The trace follows the supervisor, the sandbox helper, the kernel and the trusted worker. `modules.json`
holds the derived record. The raw traces stayed on the VM.

| lane | `@oai/sky` files opened | engine processes started | cua Linux service files opened | fixture |
|---|---|---|---|---|
| `CUA_NATIVE_ENGINE=cua` (`CUA_LINUX_ENGINE_BIN` = the build above) | **0** | `cua-engine --version`, `cua-engine server --desktop shared` | 5 (service, client, ids, methods, settle) | 11/11 PASS |
| `CUA_NATIVE_ENGINE=vendor` (the control) | 60: `service.js`, `targets/linux/*`, `core/*` | `sky_linux_x64 server` | 0 | 10/11: the pinned vendor's x64 gedit text failure, as declared since M1b |

The control shows that the trace sees the vendor's modules wherever they are loaded. With cua's engine selected, nothing
under `@oai/sky` is opened, and the vendor's helper is never started.
