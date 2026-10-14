# Native baseline: sky before the REPL host and engine are replaced (#114, 2026-10-14)

Why: #114 requires that cua's own REPL host (#116) and native engine (#117) perform at least as well as today's vendor runtime, and that a native baseline be recorded before sky is touched. This directory is that baseline: what the pinned vendor runtime's native surface (sky, through @oai/cua and node_repl) costs on the owner's test machine, per operation.

**Result:** `summary.md` (three runs pooled; per-run rows in `run-<n>/results.jsonl`, attestation in `run-<n>/meta.json`). All three runs completed with no failed sample (657 rows, no errors), no approval or permission prompt beyond the vendor's one TextEdit approval per run, and nothing left behind (no serve of the clone, TextEdit quit). Medians, wall (in-cell), in milliseconds:

| Operation | Samples | Wall median | Wall p95 | In-cell median |
|---|---|---|---|---|
| ssh pipe open (`ssh mini true`) | 15 | 473 | 551 | – |
| cold start, handshake record missing: spawn → first js result | 6 | 1,082 | 1,167 | – |
| cold start, handshake record present | 9 | 1,145 | 2,089 | – |
| warm no-op cell (`1+1`) | 90 | 19.5 | 177 | 0.01 |
| `cua.getState({emit:false})` | 90 | 50 | 220 | 20 |
| `cua.listApps({emit:false})` | 90 | 45 | 147 | 22 |
| first `cua.getApp(TextEdit)`, launch and approval included | 3 | 1,470 | 1,500 | 1,415 |
| approval request arrives (from the start of getApp) | 3 | 31 | 109 | – |
| `getAXState` full tree (empty document: 2,810 chars, 53 elements) | 90 | 95 | 244 | 48 |
| `getScreenshot` (window, 1172 × 976 PNG, ~50 KB) | 90 | 88 | 200 | 47 |
| task: new document, type, verify, close unsaved (3 cells, 4 actions, 6 observations) | 30 | 3,158 | 3,568 | 3,013 |
| `end_task` | 3 | 18 | 101 | – |

Task outcome: 30/30 verified and closed without saving.

## How it ran

- Topology, as the browser parity harness (`scripts/browser-parity.mjs`): this MacBook runs `scripts/native-baseline.mjs`, which starts `cua serve` of the parity clone on the mini (`~/Developer/GitHub/cua-parity`, detached at the branch commit each `meta.json` names) over `ssh -o BatchMode=yes mini` and speaks MCP over that stdio pipe. The serve runs with `CUA_SHIM_SURFACES=computer` (the native surface only), `CUA_SHIM_PERSIST=session` (no approval outlives a connection), `CUA_SHIM_SECRETS=off`, and the mini's default cua home, so the runtime is the installed pinned release. The resident checkout `~/Developer/GitHub/cua` and its agent were not touched.
- Service: the native surface has one engine today, the vendor's sky. Each run records the running `SkyComputerUseService` processes before it starts and after the first bind, with their path (the pinned runtime's `Codex Computer Use.app`) and age; in all three runs none was running at the start and the one that answered was started by the run (`meta.json` `helperAtStart`, `service`).
- Timing: every sample records the harness's wall time around the MCP call (on the MacBook, so it includes the ssh pipe and the MCP and REPL dispatch) and the in-cell time (`performance.now()` around the cell body inside the REPL on the mini) separately. Statistics are over successful samples; failures are counted and listed apart. Medians of an even count average the middle pair; p95 is nearest-rank.
- Sequence of a run (`scripts/native-baseline.mjs` header), sequential, one run after the other, each after checking that no `cua-116-spike` process was running on the mini:
  1. `ssh.roundtrip`: five `ssh mini true`, the cost of opening the pipe that every cold start pays.
  2. Five cold connections, each a fresh `cua serve`: `initialize`, `tools/list`, then the first `js` cell (the runtime's bootstrap and the 19.8 KB API document; the cell itself is trivial). Before connections 1 and 3 the runtime's handshake record for this surface and protocol (`state/handshake/<release>/computer@2025-06-18.json`, the harness's own; the resident agent's record is `computer,browser@2025-11-25.json` and was not touched) is deleted, so `initialize` launches the runtime (`cold.miss.*`); for 2, 4 and 5 it is kept, so `initialize` is answered from the record and the runtime launches at the first `js` call (`cold.hit.*`). Each connection is labelled by the record observed just before it started.
  3. One warm connection: 30 × `1+1`, 30 × `cua.getState({emit:false})`, 30 × `cua.listApps({emit:false})`.
  4. The first `cua.getApp("com.apple.TextEdit")` (`bind.getApp`): TextEdit was not running, so this includes its launch, and the vendor's approval request, answered by the harness at once (only the exact pinned TextEdit request is accepted, for the session; anything else would be declined) and timed apart as `approval.elicitation` (from the start of the call to the request's arrival). No macOS permission prompt appeared; a cell that timed out would have stopped all GUI input.
  5. A scratch document: TextEdit launched with no document shows its Open panel, which runs out of process and takes no keys sent to TextEdit, so the document comes from the panel's New Document button (`setup.newDocument`). Then 30 × `app.getAXState({emit:false, disableDiffing:true})` (full tree; AX text length, line and element counts recorded, never the text) and 30 × `app.getScreenshot({emit:false})` (bytes, dimensions and a SHA-256 prefix computed in the cell; no image left the mini or was saved).
  6. Ten observe → act → verify tasks, three cells each, all from the scratch document: `task.act` (observe, `super+n`, observe the new document in front, `typeText("The quick brown fox jumps over the lazy dog.")`), `task.verify` (full tree contains the sentence, with the task's document in front), `task.close` (`super+w`, the keep-or-delete sheet comes up as the front window, `super+BackSpace` answers Delete, observed until the scratch document is back in front). `task.total` sums the three cells and counts actions and observations.
  7. TextEdit, started by the run, quit from its unedited scratch document (`super+q`), confirmed gone; `end_task`; the run then checks that no serve of the clone and no TextEdit is left.
- Every cell guards the window it acts on: an acting cell does nothing unless the front window is the document the run created. The harness refuses to start when TextEdit is running (its windows could be the owner's).

To reproduce: put the parity clone on the mini at the branch commit, then `node scripts/native-baseline.mjs run --device mini --out <dir>/run-<n>` per run and `node scripts/native-baseline.mjs summary <dir>`.

## Caveats

- **Wall time is measured on the MacBook.** It includes the ssh pipe and the MCP and REPL dispatch: a warm no-op is 19.5 ms wall and 0.01 ms in the cell, so roughly 20 ms per call is transport, not sky. Read sky's own cost from the in-cell columns; read what a model on this topology waits from the wall columns. A local client would see less transport. Each cold start includes opening ssh (`ssh.roundtrip`, about 470 ms), which a local `cua serve` would not pay.
- **The handshake record moves the runtime's launch; it does not remove it.** With the record, `initialize` is answered without a runtime (631 ms, mostly ssh and `cua serve` start) and the runtime launches at the first `js` call (494 ms); without it, `initialize` launches the runtime (767 ms) and the first call is 292 ms. End to end the two are within noise of each other here (1,082 vs 1,145 ms median); what the record saves is a runtime for a session that never calls `js`.
- **First-call outliers are kept.** The first `getState` of each run includes starting the computer-use helper (none was running at any run's start; the helper that answered was started by the run, 6 to 8 s old when checked), up to 993 ms wall. That is why `getState`'s max is far above its p95.
- **One small, fixed target.** AX and screenshot samples read an empty TextEdit document (53 elements). Larger trees cost more; this is a reference point to compare the replacement against on the same target, not a workload average. The screenshot is of the window (1172 × 976), not the display.
- **The display is virtual.** The mini runs headless with a virtual 16:9 display, 2560 × 1440 points at scale 2. The owner was on the console session; nothing else drove the GUI during the runs (the `cua-116-spike` work had finished; the resident agent's serves stayed idle).
- **System language is Korean.** Role names in the AX text and TextEdit's window titles ("무제") are Korean; the typed sentence is English and correctly spelled, so autocorrection had nothing to change.
- **The approval is the harness's.** The vendor asks once per connection before using TextEdit; the harness answers that exact pinned request at once, for the session. The 31 ms is how soon the request arrives, not a human's response time.
- **The launch path is variable.** In two of three exploratory launches before these runs, the first `getApp` of a not-running TextEdit failed after about 5.5 s with `Computer Use server error -10005: timeoutReached` and the next call bound in about 1.6 s; in the three recorded runs it bound first time (about 1.5 s). The harness retries once on that error and records both calls (`bind.getApp`, `bind.getApp.retry`), so a later run that hits it shows it.
- **The helper is shared and keeps the configuration of whoever launched it.** During exploration earlier the same night, every native call failed with `Computer Use server error -10005: invalid configuration: invalid type: map, expected a boolean in features` while a helper started by another client was running. The owner's `~/.codex/config.toml` (changed 2026-10-14 22:56 KST) has a `[features]` entry with a dotted key (`context_management.…`), which the pinned release's parsers reject (the pinned `codex` CLI fails on it too); the helper launched through cua's runtime reads cua's own `CODEX_HOME` and works. The runs record the helpers at start and after binding; a run that meets a misconfigured helper fails every inventory call and stops before touching any app.
- **Element count is a line count.** `elements` counts AX lines that start with an element index; `chars` and `lines` are also recorded. Nothing of the text is.
- Three runs on one machine in one sitting (17:53 to 17:57 UTC), back to back.
