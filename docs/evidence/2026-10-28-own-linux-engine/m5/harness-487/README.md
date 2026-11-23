# Task 142: harness pieces for linux-engine 0.4.4's reach (#487, ruling 1102)

## The settle-rest check (item 1, plan t17-fix3)

`rejudge-settle-rest.mjs` judges every stored drop-signals run under `m4/` and `m5/` twice: with the base judge
(origin/main's `drop-signals-judge.mjs` at da7585c3) and with this branch's. Both go through the dispatcher, with the
run's meta row. The output is `rejudge-settle-rest.jsonl`, one line per run and a summary line.

- **186 runs, 144 of them judged** (rerun at fix wave 1; the 7 more are this task's own pilot and diagnostic sittings under `pilot/`, which no judge holds). Of the judged runs, 40 are t17-fix3, including H8's H1 on x64 and on arm64.
- **No fail list moved from base** (`moved_from_base: []`).
- **Both H8 H1 runs** are on `cua-engine 0.4.3 (ba5b043834ce)`. Each stored a pass and still passes, with
  `settle_rest: {applies: false, version: "0.4.3"}`.
- **Every t17-fix3 run's version parses**, from 0.3.0 through 0.4.3, so none applies the check.
- **16 runs differ between their stored verdict and today's**, all of them t14-late or t14-long from H4 to H6. The base
  judge gives the same result for each, so the difference comes from earlier judge changes, not from this one.

## #487's case: `t487-named` (development, not gated)

`private-run.mjs` runs one sitting on a private display: Xvfb, Openbox and a `person` xterm, through the gate's
`runOnPrivateDisplay`. The command is:

    CUA_HOME=/Users/new/.local/share/cua-171/m5/home-x64-043 locked.sh harness-487 timeout -s TERM -k 60 45m \
      node private-run.mjs <out> <label> --experiment drop-signals --family electron --plan t487-named --trials 5 \
      --cua <engine> --run <label>

The two engines:
- 0.4.3: the pinned `home-x64-043/engine/linux/cua-engine`.
- 0.4.4: the candidate `cua-engine-0.4.4-linux-x64` from build run 45129424625, sha256 9bd2e5844b52c8b877b59ffa8fba1f0dac9e9efd94ded5190471d9daf75d078b.

### The pilot (x64, idle)

| engine | drops | route | `drag_pacing` | press on Electron | source started | settle | exercised | T17 counts (unexercised) |
|---|---:|---|---|---|---:|---:|---:|---|
| 0.4.3 (`pilot-043`) | 5 | foreground 5 | GTK 4, rest 0, 5 | 5 | 0 | 0 | 0 | false ok 5, landed 0, stale 0, honest unconfirmed 0 |
| 0.4.4 (`pilot-044`) | 5 | foreground 5 | GTK 4, rest 0, 5 | 5 | 0 | 0 | 0 | false ok 5, landed 0, stale 0, honest unconfirmed 0 |

- **"Press on Electron"** counts two pieces of evidence: the page's press counter moved on every drop, and the engine
  started its Electron drop-cursor watch (`drop_cursor: {"read": false}`).
- **Electron never started its drag**, so there was no take and no settle, and #487's settle was not reached.
- **The false oks are untaken plain drags.** The engine answered ok on a drag that started no drag and drop.

### Diagnostics

These ran on 0.4.3 only. Each used a temporary lane that was never committed, 5 drops each. The column "asked for
activation" counts drops where Electron sent `_NET_ACTIVE_WINDOW` on the press.

| run | lane | route | started | asked for activation |
|---|---|---|---:|---:|
| `diag-043` | named GTK 4, `--drag-step-us 500` | foreground | 0 | 5 |
| `diag2-043` | named GTK 4, `--drag-step-us 500 --drag-rest-ms 30` | foreground | 0 | 5 |
| `diag3-043` | no window named (desktop route), the GTK 4 window activated by the harness first | desktop | 5 (settled 5) | 0 |
| `diag4-043` | named GTK 4 at zero pacing, the GTK 4 window activated first | foreground | 0 | 5 |
| `diag5-043` | as diag4, with `--drag-step-us 500 --drag-rest-ms 30` | foreground | 0 | 5 |

Neither the motion's pacing nor when the named window was activated decides the take. On every foreground-route drop
Electron asked for activation at the press and never started its drag (25 of 25). On every desktop-route drop it did
not ask, and it started every drag (5 of 5).

## Fix wave 2: the engine's settle count on every row (`pilot/fix3-count-044/`)

Each drop-signals row now carries `settle_count`: the engine's own `drop_settles.entered` after the drop's requests,
less the count before them. For a handle, that spans every one of its requests. `t17-fix3`'s settle-rest check holds
each drop to that count, not to the settle's own record.

One live check of the count ran on the 0.4.4 candidate (sha256
9bd2e5844b52c8b877b59ffa8fba1f0dac9e9efd94ded5190471d9daf75d078b, `cua-engine 0.4.4 (d8e03a5cb7d4)`), on a private
display: `--plan t17-fix3 --trials 1`, one drag in each of the 14 cells.
- **Every row carries `settle_count.entered: 1`**, matched by a settle record.
- **Each handle's two copies of the settle agree.** Every row is labelled electron.
- **The verdict's only settle fail is the missing `rest_ms`**, 14 of 14. This build predates the fix wave that adds it,
  so the check fails it by design.

## Fix wave 3: the named lane's real origin, and the 0.4.4 PR review's harness fixes (`wave3/`, `pilot/w3-pilot-*`)

**The earlier pilots' cause was the harness, not Electron.** `xdotool getwindowgeometry` counts Openbox's decoration
offset twice: the GTK 4 client at (961, 262) read as (962, 284). The named path was given from that origin, and the
engine translates from the real one, so every press for (530, 128) went to (529, 106). That point is above the plain
source, whose top edge is at y 110. The page saw the press, and nothing started a drag. The "inactive window" reading
above is withdrawn.

The named lane now takes its origin from xwininfo's absolute upper-left corner. Each drop records:
- `named.aim.root`: the press's root point;
- `named.aim.park`: the real pointer parked there, with the window chain under it;
- `named.aim.source`: the plain source's root rectangle, from the page's tree.

**The pilot** ran on x64, on a private display, with 5 drops on each pinned home (`wave3/pilot-table.md`). On
`home-x64-043` (0.4.3) and on `home-x64-044` (0.4.4, eff8befc…, `cua-engine 0.4.4 (23f342178d94)`) alike:
- every press was at (530, 128), inside the plain source at (505, 110), 50x36;
- the pointer was parked there over the Electron window (the chain is its frame, then the window itself);
- the route was foreground, paced as GTK 4 with rest 0;
- the page's press counter moved, the source started, and the hold took;
- `settle_count` read 1 with its provenance;
- all 5 drops are exercised and landed, with 0 false ok, 0 stale and 0 honest unconfirmed.

The settle's `rest_ms` is absent on 0.4.3, which predates it, and 30 on all 5 drops on 0.4.4.

**Constructed rows** (`wave3/constructed-rows.txt`, `red-wave3.mjs`): each of the six findings judged by 4e0ba0a9's
code and by this branch's. Every one passed at 4e0ba0a9 and fails now.

**Offline rejudge** (`wave3/rejudge-vs-4e0ba0a9.jsonl`, `rejudge-vs-main.jsonl`, `rejudge-summary.txt`): every stored
drop-signals run under m4/ and m5/ plus H9's (`engine-044/reach/`), 216 runs and 153 judged.
- Against 4e0ba0a9's judge, no fail list moved (0 runs, 0 rows).
- H9's six t17-fix3 runs each hold 560 of 560 settled at 30 ms with every lane and cell observed. They stored a pass
  and still pass; H9's L4d runs keep their stored verdicts.
- Against main's judge, only this task's own development check (`pilot/fix3-count-044`) moves.

**The offset's reach** (`wave3/offset-reach.jsonl`, `offset-reach.mjs`; ruling 1143 (a)): the counted cells whose target
came from xdotool's geometry are t17-fix3's off-window ends.
- The cells: `xterm` (from `frontPoint`), and `other` and `slow` (from `clientOrigin`), on the `cua:desktop` and
  `cua:handle` lanes, in H8's H1 and in H9's H1, H2 and L4a, on both arches.
- At an offset of (1, 22) the release falls inside its window with room to spare: the xterm's at (101, 97) of 200x150,
  the other window's at (151, 172) of 340x360, the sink's at (81, 97) of 160x150.
- The row's own read of the pointer (`end_park`) verified the window under every end: 30 of 30 in each lane and cell of
  every run.
- No cell's outcome could have moved, and none is rerun.
- Task 132's cells and #512's (t14-floor `left`) take their coordinates from the engine's window geometry or the
  window-relative path, never from xdotool.
