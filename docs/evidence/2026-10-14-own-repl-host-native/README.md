# Linux native baseline: the vendor REPL host before cua's own (#116 M0, 2026-10-14)

**Why.** #116 replaces the vendor's REPL host, and acceptance 8 requires that the replacement not regress the native surface on Linux. This directory records how the vendor host performs today, on the machine where M4 will measure cua's own host: the cua-linux Tart VM, gedit, and the pinned `sky_linux` helper. It is recorded before any session switches hosts. M4 records `cua/run-{1,2,3}` beside `vendor/` with the same script and plan, then runs `node scripts/native-baseline.mjs compare docs/evidence/2026-10-14-own-repl-host-native/vendor docs/evidence/2026-10-14-own-repl-host-native/cua`. The macOS baseline in `docs/evidence/2026-10-14-native-baseline/` is a different machine and app; it is not a substitute for this one.

**Result.** The pooled summary is `vendor/summary.md`. Per-sample rows are in `vendor/run-<n>/results.jsonl` and attestation is in `vendor/run-<n>/meta.json`.
- All three runs completed, with no failed and no invalidated samples. The summary lists no problems.
- Every connection (6 per run) attested the vendor host.
- No approval was asked.
- Nothing was left behind: no serve of the clone, no gedit, no `/tmp/cua-native-baseline-*`, and no `sky_linux` after the runs.

Medians in milliseconds, wall (in-cell):

| Operation | Samples | Wall median | Wall p95 | In-cell median |
|---|---|---|---|---|
| ssh pipe open (`ssh cua-linux true`) | 15 | 189 | 246 | – |
| cold start, handshake record missing: spawn → first js result | 6 | 478 | 611 | – |
| cold start, handshake record present | 9 | 451 | 477 | – |
| warm no-op cell | 90 | 1.9 | 3.4 | 0.00 |
| `cua.getState({emit:false})` | 90 | 7.4 | 13.4 | 5.1 |
| `cua.listApps({emit:false})` | 90 | 7.0 | 10.1 | 5.0 |
| `cua.getApp({windowId})`, the run's own gedit window | 3 | 509 | 513 | 506 |
| `getAXState` full tree (about 10.9k chars, 399 elements, source `at_spi`) | 90 | 428 | 709 | 425 |
| `getScreenshot` (window, 910 × 756 JPEG, about 35.7 KB) | 90 | 532 | 710 | 527 |
| task: type 43 keys with pressKey, verify, clear (3 cells, 45 actions) | 30 | 19,223 | 19,410 | 19,211 |
| of which `task.act` (43 `pressKey` calls, one keysym each) | 30 | 17,351 | 17,545 | 17,347 |
| `end_task` | 3 | 2.7 | 2.7 | – |

Task outcome: 30/30 typed, verified and cleared.

Method cases (one sample per run, all three runs identical):

| Method | Outcome (vendor sentence) | Its window | Wall median |
|---|---|---|---|
| `typeText` (on a gedit window of its own) | threw `D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying` | exited (gedit crashed) | 1,458 |
| `paste` (on a gedit window of its own) | threw, same sentence | exited (gedit crashed) | 1,485 |
| `paste(text, {format: "html"})` | threw `Linux paste supports only text format.` | survived (no input sent) | 3.5 |
| `setValue` | threw `setValue is unavailable on Linux; use click, pressKey, and typeText.` | survived | 3.2 |
| `selectText` | threw `selectText is unavailable on Linux.` | survived | 3.3 |
| `scroll(at, dir, 1)` (pages) | threw `Linux scroll accepts { pixels }, not pages.` | survived | 3.2 |

## How it ran

**Topology.** This MacBook ran `scripts/native-baseline.mjs` (worktree at the commit below). It started `cua serve` of the VM's parity clone over `ssh -o BatchMode=yes cua-linux` and spoke MCP over that stdio pipe.
- The parity clone was `~/Developer/GitHub/cua-parity`, detached at `1d34683`, clean, after `npm ci`. Every `meta.json` names this commit.
- The serve ran with `CUA_REPL_HOST=vendor` (explicit), `CUA_SHIM_SURFACES=computer`, `CUA_SHIM_PERSIST=session` and `CUA_SHIM_SECRETS=off`.
- It ran inside the VM's X session: `DISPLAY=:0`, the account's `~/.Xauthority`, and the session bus from the ssh session's `XDG_RUNTIME_DIR` (`/run/user/1000/bus`). No session manager process is involved: the display was checked with `xdpyinfo`.
- It used the VM's default cua home, so the runtime was the installed `26.928.40906-linux-arm64`. The run only read and cleared its own handshake record there.
- The sandbox was `disabled`, the platform default for Linux computer sessions (`meta.sandbox`, resolved by the clone's `sandboxModeFrom`).
- Node was the VM's v22.23.3.

**Machine.** Apple Virtualization arm64, 4 CPUs, 8 GiB, Ubuntu 24.04.5 LTS (kernel 7.0.0-38-generic). The X display is 1440 × 900, depth 24. gedit is 46.2.

**Host attestation.** Each connection's `initialize.serverInfo` and the `_meta` of its first js result are in `meta.hostAttestations`.
- The vendor host answers `{"name": "rmcp", "version": "1.5.0"}`.
- Its results carry `_meta` keys `codex/nodeReplExecutionDurationMs` and `cua/taskId`, and no `cua/replHost` marker.

**Helper.** The pinned runtime's `@oai/sky/bin/linux/sky_linux_arm64`. None was running at any run's start; each run started its own, and it was gone after each run.

**Sequence** (the script's header):
1. `ssh.roundtrip` ×5.
2. Five cold connections. The handshake record (`state/handshake/<release>/vendor@<release>/computer@2025-06-18.json`) was cleared before connections 1 and 3 (`cold.miss.*`) and kept for 2, 4 and 5 (`cold.hit.*`). Each connection is labelled by the record it found.
3. One warm connection: 30 × each of no-op, `getState`, `listApps`.
4. The run opened its own `gedit --standalone` on a new empty file in a new `/tmp/cua-native-baseline-XXXXXX` directory. It found that window by the file name, compared inside the cell; titles are never returned. It then bound the window by X11 id.
5. 30 full trees and 30 screenshots of that window. Counts and hashes were computed in the cell; no text or bytes left the VM.
6. Ten tasks, each from an empty window:
   - `task.act` observes, then presses the 43 keysyms of `the quick brown fox jumps over the lazy dog`.
   - `task.verify` polls the tree until the sentence is there.
   - `task.clear` presses `ctrl+a` then `BackSpace`, and polls until it is gone.
   - Transitions wait on a 10 s deadline, not a count of observations.
7. The method cases, after every timed sample. `typeText` and `paste` each ran on a gedit window of their own (`setup.findTarget`), because on GTK3 they take the window down. After each, the run checked whether that process survived, then ended it and removed its directory. The four refusals ran on the scratch window and send no input.
8. `end_task`. Then cleanup: the run ended its scratch gedit and removed its directory. A process is only signalled while its command line names the run's own scratch file. Finally the run counted what was left.

The run refuses to start while any gedit runs, so every gedit window it saw was its own. Two other windows the run did not open were on the display (Chrome, running with the parity lane's profile, is one of the VM's standing windows). They are counted in `setup.findWindow.windows`, and their titles were never returned; they were never bound or sent input. Chrome was not touched.

**Reproduce.** Detach the VM's parity clone at the commit and run `npm ci`. Then run `node scripts/native-baseline.mjs run --device cua-linux --host vendor --out <dir>/vendor/run-<n>` for each run, then `node scripts/native-baseline.mjs summary <dir>/vendor`.

**Check.** `compare vendor vendor` (a self-pair, as a check of the comparator on real evidence; not committed) passed every judged operation and method case (25 rows, no failure). As required, it gave NO VERDICT for one reason only: the candidate side attests the vendor host, not cua.

## Observations and caveats

- **typeText and paste now fail with a different sentence.** On gedit 46.2 / GTK 3 on this VM, both crash gedit, and the cell now gets the D-Bus `NoReply` sentence above. The 2026-10-06 Linux acceptance (`docs/evidence/2026-10-06-linux-acceptance.md`, item 9) recorded `Resource temporarily unavailable (os error 11)` for the same crash. A short check run before these recordings saw the same `NoReply` sentence, so it is today's behaviour, not a one-off. The comparison holds cua's own host to this observed outcome sample for sample. A host that made these methods work would count as better only if gedit survived and the text was read back.
- **The display is 1440 × 900.** The 2026-10-06 evidence recorded a 1024 × 768 console. Window size drives tree and screenshot size, so M4 must run on the same display, which `compare` checks.
- **pressKey is slow per key.** About 400 ms per `pressKey` call, so typing dominates the task (17.4 of 19.2 s). This is the vendor helper's per-call cost through the cell, and it is what an agent following the Linux host notes ("type with pressKey") waits.
- **Wall time includes transport.** Wall is measured on the MacBook. A warm no-op is 1.9 ms wall against 0.00 ms in the cell, so transport over the open ssh pipe is small here. Cold starts include opening ssh (about 190 ms), and `compare` judges the cold phases net of each side's `ssh.roundtrip` median.
- **Apport kept its existing report.** apport is active on the VM, and one gedit crash report from 2026-10-07 already existed. The count and time were unchanged after every run (`meta.gedit.crashReportsBefore/After`): apport keeps one unreported report per program, so these crashes added none.
- **Method-window cleanup is not in these metas.** These metas record the scratch window's cleanup (`meta.gedit.cleanup`), but not the per-method window cleanup done at the method step. The harness now records it as `meta.gedit.targetCleanup`, after these recordings. After the runs the VM had no `/tmp/cua-native-baseline-*` directory and no gedit.
- **Node.** The VM's Node is v22.23.3. cua's own host needs Node 24 or later. M4 should provide it through `CUA_NODE` and keep the proxy on this Node, so the two sides differ only in the host.
- **Timing and order.** Three runs in one sitting, back to back: 19:31 to 19:44 UTC.
