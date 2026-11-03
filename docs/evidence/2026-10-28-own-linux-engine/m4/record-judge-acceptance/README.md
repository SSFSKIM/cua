# T4c's record-judge acceptance on a private display (#171 M4, task 49, part 2)

The whole-run RECORD on a private display (allowed there and only there), under the watchdog. Scenes: gedit,
paste-target and gnome-text-editor, `--ops all --blocks 3 --dev`, every lane (pinned 26.928.40906, newest
26.1023.51421, cua-engine 0.3.0 musl `5b7e38cf…`). This is the run task 42 started on 2026-11-02 before the incident;
it now runs with the run's own Chrome, homes and session bus (part 1:
`../harness-isolation-live/task49/README.md`).

- **Harness:** `~/.local/share/cua-171/live-43` at 297f8c20, unmodified. Its own command line was used,
  `scripts/linux-engine-diff.mjs`, with the record on.
- **Display:** `startPrivateServer`'s Xvfb `:1`, marked private, under the run's watchdog, with `XAUTHORITY` unset.
  Openbox ran, and an xterm `person` was active at the start.
- **Guards:** part 1's (`../harness-isolation-live/task49/scripts/`): `wrap.py`, `owner-watch.sh` and `stop-watch.sh`.
  None fired.
- **When:** 2026-11-03, VM time 01:27–02:21 (09:27–10:21Z).

## The verdict

The run is valid: the witness and the audit failed the activating stub, and the foreground and in-front checks held.
23 of 24 verdicts pass. The run exits 1 on the record's findings and on one verdict, and none of them is a change to
a window of anyone's.

**The record judge** (`desktop.record` in the end row of `runs/attempt-2/record-judge/results.jsonl.gz`):

| measure | value |
|---|---|
| requests judged | 85,622 |
| mutating | 74,042 |
| unplaced | 0 |
| unattributed clients | 0 |
| findings | 214 |
| findings of the selection protocol | **0** |

Every finding is a `SKY_CLIPBOARD_STOP` ClientMessage, and each is a false red (below).

**The selection exemption held**, which is what T4c is about. The record holds:
- 19,785 SelectionRequests, answered by 7 connections;
- 16,684 `GDK_SELECTION…` property writes into requestor windows;
- 19,785 SelectionNotify events;
- one INCR transfer.

The requestors include gedit's, gnome-text-editor's, paste-target's and the run's Chrome's windows, which read
`TARGETS` from every new CLIPBOARD owner (M2.3). None of them is a finding. In T5's paste run (`m4/identity/`), these
same writes were the record's false reds in every lane.

**The harness's trace** (xtrace): clean, 29,271 requests, 25,492 mutating, nothing foreign.

**The rest of the end row:**
- the watchdog `ended`, 1,453 round trips;
- the start and end active window is the session's `person` (foreign), never acted on;
- `chrome`: 1 spawned, `left: []`;
- the session bus `terminated: true, killed: false`;
- text restores: pinned 43, newest 0, cua 0 (the pinned build's own failed pastes, as in M3 and T5).

**The one failed verdict, `gedit tree_shot cua`**, is an artifact of this session:
- the run's TMPDIR was one of the session's own, `/tmp/cua171-task49-…/`, so the scratch path in gedit's title is
  longer than a plain run's;
- gedit middle-ellipsizes that path differently in the window cua's lane read (`…WqJ6…` against `…WqJ6J…`);
- the tree itself is equal (492 nodes), and `gedit tree` passes for every engine.

## The false reds, with their record lines

All 214 are the vendor builds' (pinned and newest). cua's lane has none. Each is the same sequence on one vendor
engine's clipboard connection: it destroys its own window, then sends `SKY_CLIPBOARD_STOP` to that window's id. The
server refuses it with BadWindow (code 3) on SendEvent (major 25).

The first one, from the record (`runs/attempt-2/record-judge/record.jsonl.gz`, kept because the record was not clean):

```
{"kind":"req","client":69206016,"seq":66,"t":530665403,"op":"DestroyWindow","window":69206016}
{"kind":"destroyed","window":69206016}
{"kind":"error","client":69206016,"seq":68,"major":25,"minor":0,"code":3,"t":530665403}
{"kind":"req","client":69206016,"seq":68,"t":530665403,"op":"SendEvent","destination":69206016,"event":"ClientMessage","cm_window":69206016,"cm_type":"SKY_CLIPBOARD_STOP"}
```

`client` is the connection's resource-id base, `0x04200000`, so the window is the connection's own first resource.

**How the 368 stops in the record divide:**

| case | count | judged |
|---|---|---|
| refused with BadWindow, after the window's own DestroyWindow | 214 | **exactly the 214 findings** |
| sent while the window lived | 154 | owned by the run: not foreign |

Every one of the 368 names a window inside its sender's own resource-id range.

**Why the judge flags them:**
- For a connection of the run's, `recordVerdict` (foreign.mjs) flags any mutating request that names a window that is
  not the run's now. A refused request skips only the state updates.
- A destroyed id is no longer the run's, so a SendEvent to it is "a window the harness did not open".
- This keeps to the invariant's letter: the request names a window id that was not open.
- But no window of anyone else's could have been changed. X allocates ids from each client's own range, so an id in the
  sender's range can name only that sender's window. The server refused the request in any case.

The same messages show in the route audits (`pinned/newest on gedit type_text…: SKY_CLIPBOARD_STOP ClientMessage`).
There xtrace's audit has the same rule (T5's paste run met it on `:0`). Five of the record's findings have `xtrace` as
the client, for the same reason: those are the route-audit passes, whose engine connections go through the xtrace
proxy.

**A candidate rule, for the design session:** a request whose named window lies inside the sending connection's own
resource-id range is never foreign; at most it is the sender's own stale id. That would clear all 214, and every
SendEvent the route audits flag this way. Leaving it as is costs every vendor-lane paste a red line.

## The run's start, stopped (task 43's fix item 2, task 45's item 10; `runs/attempt-1/sigterm-begin/`)

The harness got SIGTERM 195 ms into its start, while its session bus's
`busctl … call org.a11y.Bus /org/a11y/bus org.a11y.Bus GetAddress` was in flight (the at-spi-bus-launcher had just
been activated). The record hook was the real one.

- The harness exited 143.
- Neither the record client (`xprobe record-run`) nor the trace (xtrace) shows anywhere. The guard samples every
  ~110 ms and could miss a process that lived less, but the evidence agrees:
  - the harness's process tree at the signal held only the watchdog, the bus daemon, the launcher and `busctl`;
  - the guard's samples over that harness's life show only it and its watchdog;
  - 3 s after it ended, no `record-run` or `xtrace` process existed;
  - the run's TMPDIR held no `cua171-record-*` or `cua171-audit-*` directory.
- The watchdog's own log is `ready`, then `end` after one round trip.
- Afterwards nothing of the run remained:
  - no process;
  - root `AT_SPI_BUS` unset, and `bus_1` gone;
  - no `session.conf` daemon, and no launcher or registryd but the person's;
  - nothing in the run's TMPDIR (so no `cua171-audit-*` or `cua171-record-*`).

## Attempt 1's record-judge run (`runs/attempt-1/record-judge/`): stopped by part 1's finding 1

The first run, in the same session as the SIGTERM check, ended 22 s in with
`…-gnometexteditor-cua has no field to type into`. That is the first GTK 4 window of a run home with a cold Mesa
shader cache, settling as an X11 tree (part 1, finding 1).

Attempt 2 ran the harness unmodified, with one change to the session: `MESA_SHADER_CACHE_DIR` named a directory in the
session's own TMPDIR, inherited by the run's applications, and warmed by one gnome-text-editor window first
(`warm-gtk4-shaders`, part 1's `probe.mjs`, no record). Everything else of the run's homes stayed the run's. The
directory was removed with the session's TMPDIR. A harness fix is part 1's finding 1.

## The person's side

Both sessions showed the same as part 1:
- the owner's Chrome kept pid 2546101 and start time 51157914 (294 checks during attempt 2);
- `:0` had one `Google-chrome` client;
- the person's session-bus names and pids, and their running units, were the same before and after;
- `~/.pki` never existed;
- no run process held a path under the person's Chrome profile or NSS databases, or connected to their buses or `:0`
  (attempt 2: 22,889 samples over 2,025 processes);
- the decoys took no connection;
- the run's Chrome held `<run scratch>/home/.local/share/pki/nssdb`;
- the only mtime that moved is `~/.config/google-chrome`, the owner's live Chrome's own writes.

Each session's TMPDIR held, afterwards, only what part 1's finding 2 describes: the vendor builds' jpgs, plus attempt
2's shader cache. It was removed.

## Files

- `runs/attempt-1/`: the session with `sigterm-begin` and the first `record-judge`.
- `runs/attempt-2/`: the session with `warm-gtk4-shaders` and the `record-judge` run.
  - `record-judge/`: `results.jsonl.gz`, `summary.md`, `record.jsonl.gz` and the applications' stderr.
  - The session's `session.jsonl`, `windows.jsonl`, `wrap-summary.json.gz`, `analysis.jsonl` and `owner-*.txt`.
- The phase files are `phases-part2.json` and `phases-part2b.json` in `../harness-isolation-live/task49/scripts/`.
