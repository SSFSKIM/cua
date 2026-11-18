# L4a's false ok: the mechanism, the options, a recommendation (task 98)

For the design session, or the owner while it is away. Nothing here is released: no tag, no workflow run, no change to
the pin or to `MIN_ENGINE_VERSION`. Every run below is a development run on a private display, never counted.

- Branch `m5-l4a-fix`, from `origin/feat/171-m5` (10c0fec8), pushed. The code's head is **95a80e7a** (`ci-gate
  --gates engine-linux`: GREEN, run 44285694703); the evidence and this note are committed after it.
- The measured engine builds: 78d6cbda (`cold2`, and every x64 run) and b74961ca (every later arm64 run). Their
  engine source is the same. 95a80e7a changes one comment after them.
- Evidence: `docs/evidence/2026-10-28-own-linux-engine/m5/l4a-fix/` on the branch (rows, summaries, scripts, the
  analysis outputs). On the VMs the runs are under `~/.local/share/cua-171/task98/out/`.

## In short

1. **The fault.** `linux-engine-v0.4.0` reads Electron's drag cursor at the instant it sends the release. Electron's
   drag loop can be tens of milliseconds behind the pointer then. The cursor it still shows is its answer for a place
   the pointer has left. The engine reads that accept and answers ok; Electron then catches up, shows no-drop and
   drops nothing.
2. **It is not arm64's alone.** The pinned x64 asset answered ok outside the zone on **15 of 128** handle drags of the
   left cell at twice the load on x64. The pinned arm64 asset: **62 of 128**. L4a's plan has 3 exposed drags a
   sitting, which is why x64's sittings never met it.
3. **Recommended fix: settle before the release.** The engine asks the application where it has got to, with a
   `_NET_WM_PING`, which Chromium answers on the thread that runs its drag loop, in the order of its events. It asks
   once before the release's last rest and once after its last motion, each bounded at 150 ms. The accept counts only
   when both were answered with the pointer at rest between them. Past the bound the release still goes out and the
   answer is unconfirmed, never ok.
4. **Measured on arm64 at twice the load, on exposed drags of the left cell, the two rules taking turns in one
   sitting:** 0.4.0's rule **38 false oks of 128**; the settle **0 of 128**. Counting a third sitting, the settle has
   0 in 177 exposed drags, so its false-ok rate on them is below 1.7% at 95% (3/177), against 30% and 48%.
5. **Cost.** No true ok was turned unconfirmed in any run. The settle adds a median of about 3 ms to a drag whose
   loop is in step, and 34 to 68 ms (p95 64 to 101 ms) to one whose loop is behind. No sync hit the 150 ms bound in
   any settled drag (over 1,200). The drops that 0.4.0 answered unconfirmed though they landed (5 in task 96's L4a)
   now answer ok.
6. **L4a still fails on arm64 with the fix, on a missed landing** (1 of 100 in the handle's plain cell, as in task
   96's run, answered unconfirmed). The settle does not remove it. It needs its own ruling (section 4).
7. **The brief's direction does not close it.** "The accept counts only if put up after the pointer's last move" still
   answers ok on 33 of 38 false oks on arm64 and 7 of 7 on x64: a loop that is behind puts the stale accept up late,
   after the pointer has stopped.

## 1. The mechanism

### What Chromium does (read in its source, main branch)

- **The status is answered at once, with what the browser already holds.** For a drag inside one process the source
  hands its `XdndPosition` straight to the target (`XDragDropClient::SendXClientEvent`, the short circuit). The target
  answers with `WebContentsViewAura::OnDragUpdated`, which returns `current_drag_data_->operation` and only then asks
  the page (`GetRenderWidgetHostAtPointAsynchronously`, then `DragTargetDragOver`). So a status is the page's answer to
  an **earlier** position.
- **The cursor is that status.** `XDragDropClient::OnXdndStatus` sets the negotiated operation and calls
  `UpdateCursor`.
- **The loop takes its events in order, the newest motion for the older ones.**
  `X11WholeScreenMoveLoop::DispatchEvent` handles a motion with `CoalescePendingMotionEvents`, and a release as it is
  read. A loop that is behind handles the last queued motion and then the release, with nothing from the page between.
- **The release drops when the negotiated operation is not none** (`XDragDropClient::HandleMouseReleased`), and the
  page refuses a drop whose last dragover said none (`WebFrameWidgetImpl::DragTargetDrop`: "IPC RACE CONDITION: do
  not allow this drop").

So the cursor the engine reads says what the loop had handled, not where the pointer is. Two things can be behind:
the loop behind the X server's stream, and the page's answer behind the loop.

### The two false oks of task 96, from the stored rows

Times are ms after the take, on the X server's clock (the release has a wall time, mapped to it). Rows:
`m5/arm64/pilot/l4a-rate/L4a/…/run/results.jsonl.gz` and `m5/arm64/pilot/out/L4a.…/run/results.jsonl`, cua:handle
left, at twice the load. Script: `analysis/timeline.mjs`.

| | rate run #20 | pilot #0 |
|---|---:|---:|
| the harness sends `start` (the row's "press") | −180 | −87 |
| the take | 0 | 0 |
| the drag loop's own cursor | −1, 0 | −1, 0 |
| first status: no-drop | +33 | +37 |
| **the accept put up** | **+39** | **+42** |
| the release sent; the cursor read is the accept; answer ok | +135 | +130 |
| no-drop | +138 | +137 |
| the loop ends; the page's drop count unchanged | +140 | +138 |

- The stored rows keep the pointer's last four places (516, then 500 three times) but no times for its motions. The
  engine's pacing puts the last move across the zone's left edge at least 60 ms before the release (the second
  move's 30 ms rest, then the end's).
- In a warm drag of the same cell the first status comes 2 to 4 ms after the take, the accept at about +25 and the
  no-drop that withdraws it at about +40, 64 to 100 ms before the release.
- The same block's other two exposed left drags sat on the edge of the same fault: #0 was withdrawn 2.2 ms before
  the release, and #10's accept came 5 ms **after** it (answered unconfirmed by the order alone).

### The same fault with every motion timed (the prototype's record)

The prototype's watch records every motion and cursor change with the server's clock. Run `cold3`, arm64, twice the
load, the lane that keeps 0.4.0's rule (`--drop-no-settle`), block 6. The zone's left edge lies between x 547 and 562.

| ms after the take | what the engine's watch read |
|---:|---|
| −14 to −11 | the first move, 530 to 640, into the zone |
| 0 | the take |
| +21 | the first move's second visit of (640, 128) |
| +26 to +37 | the second move, 640 to 500. **The last motion across the zone's edge: +34.** At rest at (500, 128) from +37 |
| +36 | first status: no-drop |
| +68 | the second move's second visit of (500, 128) |
| +101 | the end's second visit of (500, 128) |
| **+102** | **the accept put up, 68 ms after the pointer left the zone** |
| +103 | the release sent; the cursor read is the accept, put up after the pointer came into the window; answer ok |
| +129 | no-drop (the harness's watch) |
| +130 | the loop ends; nothing dropped |

The same sitting, the settled lane, block 2: the accept went up at +87, 59 ms after the pointer crossed the edge at
+28. The first sync was answered after 54.6 ms, when the loop had caught up. After the 30 ms rest the second visit
at +149 brought no-drop at +150, the second sync was answered in 1.8 ms, the cursor read was no-drop, and the answer
was unconfirmed. Without the settle the read would have fallen at about +92, on the accept.

### What the rows call cold

- **It is not the fresh engine.** In the first balanced sitting every drag was a fresh engine's first, and the loop
  ran behind on every second drag, whatever its cell or lane (`analysis/lagseq.mjs`: `L.L.L.L.…`). In L4a's plan,
  blocks of ten on one engine, it ran behind on the first drag of 18 of 28 handle blocks and on 46 of 252 later
  drags (task 96's rate run, `analysis/prevcell.mjs`).
- **What sets it off is not found.** It is on Electron's side: the same engine code runs on the drags that lag and on
  those that do not. I did not chase it further, because the fix must hold whatever makes a loop late.
- **How far behind.** On the exposed drags the first status came 21 to 75 ms after the take (2 to 4 ms otherwise), and
  the first sync waited a median of 33 ms and at most 85 ms on the left cell, 66 to 69 ms (at most 104 ms) on the
  short paths (plain, inzone-out).

### Why x64 never showed it

- x64 has the same lag. In its judged L4a (pinned, twice the load) the three exposed left drags were withdrawn 20,
  36 and 60 ms before the release, against 64 ms warm, and 4 of 10 exposed plain drops got their accept after the
  release. M4's load sitting: 32, 35 and 35 ms, and 5 of 10.
- A sitting of `t17-fix3` has 3 exposed left drags. At the rate measured below a sitting misses it about two times
  in three.
- **Measured directly:** the pinned x64 asset (sha256 751ec9be…, checked against the pin) on 128 exposed left drags
  at twice the load: **15 answered ok with no drop** (x64 `out/shipped`).

### The plain cell's missed landing

It shares the cause. In rate run #20 of the plain cell the loop showed no-drop at +36, the release went out at +90,
the loop ended at +131, and the accept never came: the loop handled the release with the page's answer still
outstanding, so Chromium sent a leave. The engine answered it honestly, unconfirmed. The five exposed plain drops of
that sitting that landed unconfirmed are the same lag with the accept arriving 30 to 47 ms after the release (#364's
"cold handle drops at load"). The settle waits for the loop before the release. Under it every exposed plain drop
of the cold sittings landed and answered ok: 54 of 54 on arm64 and 48 of 48 on x64, at twice the load. In L4a's
whole plan one of 21 exposed plain drops still missed (section 4).

## 2. The options

Each was judged against the same drags where that is possible. A rule that only reads can be replayed over stored
rows (`analysis/options.mjs`); a rule that waits changes the drag and is measured live.

The false oks to remove, at twice the load: on arm64, 38 from 0.4.0's rule on the prototype's build (`cold3`,
`cold4`) and 62 from the pinned asset (`shipped`); on x64, 7 and 15.

| | what changes in the rule | false oks left on arm64, of 38 and of 62 | on x64, of 7 and of 15 | true oks turned unconfirmed | latency |
|---|---|---:|---:|---:|---|
| **A. The loop's own word** | the accept at the release counts only if the loop's cursor does not change again before the loop ends | 7 and 5 (replay) | 0 and 0 | 0 of 228 in these sittings; 1 of 96 in x64's judged plain rows | the answer waits for the loop's end: 1 to 5 ms, about 27 ms when the loop is behind |
| A′. The loop's last cursor | judge by the cursor the loop showed last, whatever the release read | 20 and 23 (replay); it also **adds** one in task 96's rows (#10) | 0 and 0 | none; it would confirm task 96's 5 unconfirmed landings | as A |
| **B. Settle before the release** (recommended) | the application is asked before the last rest and after the last motion; the accept counts only if both were answered | **0 of 177 exposed drags** (live, the same sittings) | **0 of 110** (live) | **0** in every run | the two sync waits: median 3 ms in step, 34 to 69 ms behind |
| C. After the pointer's last move (the brief's direction) | the accept counts only if put up after the pointer last changed place | **33** of 38 (replay; the pinned rows have no motion record) | **7** of 7 | 0 of 228; a drop reached by two moves inside one zone would turn, not measured | none |
| D. A floor for handles | hold the release a fixed time after the last move | not run | not run | none | the whole floor on every drop |

- **A** is pure narrowing: it can turn an ok into unconfirmed, never the reverse, and it moves no input. It removes
  both of task 96's false oks and every one on x64. On arm64 it leaves the case where the loop handles its last
  motions and the release in one batch, still holding the stale accept: 12 of 100.
- **A′** is unsafe. A loop that is far behind puts the stale accept up after the release and then acts on it.
- **C** fails for the reason in the timeline above: the accept went up 65 ms after the pointer stopped. The engine
  can order the cursor's change against the pointer's motions, but not against the loop's handling of them. It also
  judges by the cursor's history, which the ruling of 2026-11-11 set aside ("the cursor's history decides nothing").
- **D** has no bound to stand on. The first sync waited up to 104 ms in these sittings. The plain drag's 350 ms floor
  left one left drag 14 ms of margin in task 96's arm64 rows. A floor long enough to cover the lag costs every drop
  that much, and still races.
- **B** is the second half of the brief's direction made exact: "a bounded settle that the target must answer
  within", with the target's answer read, not assumed.

### What M4's populations and the spec's rules imply

- **Ruling 650** (a false ok fails the series). A and C leave false oks in the sittings that expose them, and D
  cannot bound them. B left none in 177 exposed drags on arm64 and 110 on x64.
- **Rulings (1) and (2) of 2026-11-10**, "a faster honest no, not a wrong ok". That was said of Chrome's leave paths,
  where the activation request answers either way. For Electron the accept cursor is the only confirmation, so a
  stale accept is a wrong ok. The spec's sentence needs that limit; T17's entry already says the cursor rule's own
  limits (#364, #365), and this is a third.
- **T17's proof, 0 of 1,619.** It stands as a count, but its plan exposed 9 left drags a load on the handle lane. It
  does not bound the rate on exposed drags.
- **"Handles get no drop floor"** (2026-11-10). B adds no fixed wait. It waits for the application's answer, about
  1.5 ms each time when the loop is in step, and at most 150 ms each when it is not. The design session should say
  whether a bounded wait on the application is inside that ruling. I read it as inside: the ruling refused a fixed
  cost on every handle.
- **The gate rule** ("unconfirmed, and it landed" is honest, a finding above 5%). B lowers that share: it waits for
  a loop that 0.4.0 released ahead of.
- **M4's timing populations** no longer describe a B engine's Electron drops (the release moves). The reached steps
  rerun (section 6).

## 3. The recommendation: B, as prototyped

### The rule

- **The sync** (`drop_cursor.rs`, `DropCursor::sync`). A `ClientMessage` of type `WM_PROTOCOLS`, `_NET_WM_PING`, to the
  source's top-level, with a token of the sync's own. A client that lists the protocol sends the same message on to
  the root (EWMH); Chromium does it in `X11Window::HandleEvent`, on its UI thread. The X server gives a client its events
  in order, so the answer says the application has handled every event sent before the question. Its cursor changes
  for those events reach the watch before the answer does, on the same connection.
- **A handle's end** (`engine/handle.rs`), when its source confirms by cursor and a take was seen:
  1. sync, waited for at most 150 ms;
  2. the 30 ms rest the end already had (now the page's time to answer the pointer's last place);
  3. the second visit of the pointer's place, as before;
  4. sync again;
  5. the cursor read and the release, as before.
- **A plain drag** (`engine/pointer.rs`), the same after its path, hold and floor. The settle's rest is taken out of
  the floor's last 30 ms, so a drop that ends inside the floor is released when it was before, plus the two waits
  (H1, plain cell: 370.6 ms against 0.4.0's 369.3). A path that itself runs to the floor's end pays the rest as
  well (H1, left cell: 400.4 ms against 369.4).
- **`settled`** (`drop_cursor.rs`). Both syncs answered, in order; on an XTEST route every motion after the first
  answer is at one place, with at least one such motion, and none after the second answer. A person's motion in
  between unsettles it. On the background route the two answers alone decide.
- **An accept counts** only when it was shown at the release, over an `XdndAware` window, put up after the entry (all
  as in 0.4.0), **and settled**. Otherwise the answer is the unconfirmed notice.
- **`--drop-no-settle`** (measurement only) releases and judges as 0.4.0 did.
- **The record.** `drop_cursor.steps` (every motion, cursor change and answer, with the server's clock),
  `drop_cursor.settle` (the two waits, settled or not) and `accept_unsettled` (what 0.4.0 would have answered on the
  same read).

### Its tests

- Written first: the rule's cases (`an_accept_counts_only_when_the_application_answered_before_the_rest_and_after_
  the_last_motion`, `the_pointer_must_rest_at_one_place_between_the_answers_and_be_visited_again_there`,
  `on_the_background_route_the_two_answers_alone_decide`), the token's range, the flag, and a live test against a
  window that answers pings, one that stops answering and one that lists no ping. The first red was the compile
  failure against the missing API. I wrote `settled`'s first body in the same edit as its types, before its tests,
  and reshaped it after them; that part was not test-first.
- `cargo test`: 417 unit tests passed and 19 in the boundary suites. The whole live suite as the gate runs it
  (`cargo test --release --locked --features live -- --test-threads 1`, private Xvfb, x64): 628 passed, 0 failed.
  `cargo clippy --all-targets --features live`: clean. `ci-gate --gates engine-linux` on 95a80e7a: GREEN. The
  harness's drop-signals tests: 24 passed.
- **Not done:** a code review. The release's fix gets its own.

### What it leaves open

- **The page slower than the rest.** If the loop is in step but the page takes longer than the 30 ms rest (plus the
  second sync) to answer the pointer's last place, the second visit still carries the old answer. As a false ok it
  was not seen in 177 exposed drags on arm64 and 110 on x64. Its honest side was seen once: L4a's missed landing
  (section 4), where the page's **first** answer was still out 125 ms after its first position. A stale accept needs
  a slow second answer, after the page has answered once, which is the rarer case. A page with a heavy `dragover` handler is the case to fear; the harness's page answers in
  a frame. A longer rest, or a second rest when the first sync was slow, would narrow it at a cost in time.
- **#365's races** are unchanged: a target that never answers, and Chromium lagging its own events across a window
  boundary. The person's-motion race narrows: a motion between the two answers now unsettles the drop.
- **A take seen only after the end began** is not settled and answers unconfirmed. None occurred in these runs.

## 4. The measurements

Scripts: `bin/drive98.sh`, `bin/chain2.sh`, `bin/t98-run.mjs` (the gate's own private display wrapper), `analysis/
settle.mjs`, `analysis/cost.mjs`. Plans, in `scripts/linux-engine-diff/drop-signals.mjs`:

- `t98-cold`: 258 single drags, each a fresh engine's first, the cells left, plain, left, inzone-out in turn, the
  settled lane (`cua:handle`) and the unsettled one (`cua:handle-unsettled`) balanced over cells and order, in L4a's
  scene.
- `t98-cold-shipped`: the same order on one lane, for the pinned engine.
- `t98-cold-drag`: the plain drag's cells the same way.

### The cold sittings, arm64, twice the load

"Behind" counts the drags whose drag loop ran behind the pointer (first status over 15 ms after the take): the
exposed ones.

| sitting | engine | rule | left: drags (behind) | left: ok with no drop | plain: landed and ok | inzone-out: ok with no drop |
|---|---|---|---:|---:|---:|---:|
| `cold3` | prototype b74961ca | settle | 64 (64) | **0** | 32 of 32 | 0 of 32 |
| `cold3` | the same | 0.4.0's (`--drop-no-settle`) | 64 (63) | **18** | 32 of 32 | 0 of 32 |
| `cold4` | the same | settle | 64 (64) | **0** | 32 of 32 | 0 of 32 |
| `cold4` | the same | 0.4.0's | 64 (64) | **20** | 32 of 32 | 0 of 32 |
| `cold2` | prototype 78d6cbda | settle | 50 (49) | **0** | 50 of 50 (48 behind) | 0 of 25 |
| `cold2` | the same | 0.4.0's | 50 (4) | 0 | 50 of 50 | 0 of 25 |
| `shipped` | **linux-engine-v0.4.0**, the pinned arm64 asset | 0.4.0's | 128 (127) | **62** | 64 of 64 | 0 of 64 |

- **The settle: 0 false oks in 178 left drags, 177 of them exposed.** 0.4.0's rule on the same build in the same two
  sittings: 38 of 128. The pinned asset: 62 of 128.
- `cold2` used the first order, in which each unsettled drag followed a settled drag of its own cell and so was not
  exposed (4 of 50). Its settled lane was exposed and counts; its unsettled lane shows nothing either way.
- `cold1` was the first sitting, stopped by me at 56 drags when it would have passed 45 minutes (SIGTERM to its own
  launcher; display clean). Its rows are kept and not counted.
- Every sync was answered inside the bound: 395 settled drags in these three sittings.
- All four counted sittings exit 1 where the judge sees the unsettled or pinned lane's false oks, as it should.

### L4a's whole plan and H1, as task 96 ran them

`gate.mjs run <step> --candidate <the prototype's build> --dev --pilot 100`.

| | L4a, twice the load: prototype | L4a: 0.4.0 (task 96) | H1, idle: prototype | H1: 0.4.0 (task 96) |
|---|---|---|---|---|
| drags | 560 | 560 | 560 | 560 |
| ok with no drop and nothing pending | **0** | 1 (cua:handle left) | **0** | 0 |
| cua:handle plain landed | 99 of 100 | 99 of 100 | 100 of 100 | 100 of 100 |
| cua plain landed | 100 of 100 | 100 of 100 | 100 of 100 | 100 of 100 |
| landed and unconfirmed | **0** | 5 | 0 | 0 |
| a sync past the bound | 0 | – | 0 | – |
| the judge | FAIL on the one missed landing | FAIL on the false ok and the missed landing | pass (exit 0) | pass |

- **L4a still fails on a missed landing**, 1 of 100 in the handle's plain cell, as in task 96's run. It is an exposed
  drag (`cua:handle plain` #0). Its loop caught up 88 ms after the first sync was asked; after the 30 ms rest the
  second visit still read no-drop, and the release was handled as a leave. Answered unconfirmed. So the page's first
  answer can take longer than the rest even after the loop has caught up: this is section 3's open point, seen once,
  on the honest side. **The settle removes the false ok, not this miss.** The missed landing needs its own ruling: a
  declared residue as #363 was, or a second rest when the first sync was slow, which I did not build.
- The five landed-and-unconfirmed drops of task 96's run are gone: the settle waits for the loop.

### x64

Private displays, twice the load, the worktree's own release build (78d6cbda) and the pinned x64 asset.

| sitting | engine | rule | left: drags (behind) | left: ok with no drop | plain: landed and ok |
|---|---|---|---:|---:|---:|
| `cold3` | prototype | settle | 64 (63) | **0** | 32 of 32 |
| `cold3` | the same | 0.4.0's | 64 (63) | **7** | 32 of 32 |
| `x64-cold2` | prototype | settle | 50 (47) | **0** | 50 of 50 (47 behind) |
| `x64-cold2` | the same | 0.4.0's (first order: 9 behind) | 50 | 0 | 50 of 50 |
| `shipped` | **linux-engine-v0.4.0**, the pinned x64 asset | 0.4.0's | 128 (124) | **15** | 64 of 64 |

- The settle: 0 in 114 left drags, 110 exposed. Every sync answered: 265 settled drags.
- `chrome-floor`: Chrome's path, section 5.4. `wm-check`: section 5.1.
- The engine's whole live suite in the release profile, and `ci-gate --gates engine-linux` (hosted x64): section 3.

## 5. The controller's four points

### 5.1 The window manager's side

- **In scope:** Openbox, which both VMs run on `:0` and on every private display (`cua-provision.sh`), and any EWMH
  window manager, since the README asks only for one ("Openbox is enough"). mutter is the likely other. Neither VM
  has mutter installed, so mutter was read, not run.
- **A window manager calls an application hung when its own ping gets no answer.** An extra answer cannot do that.
  - Openbox (`openbox/ping.c`): `ping_got_pong(id)` looks the id up among the pings it is waiting on. An id it is not
    waiting on is logged at debug level and dropped ("Got PONG with id %u but not waiting for one"). It pings only a
    window it has asked to close.
  - mutter (`src/core/display.c`, `meta_display_pong_for_serial`): it walks its pending pings for the serial and does
    nothing when none matches.
- **Disturbing the window manager's own ping** needs the engine's token to equal a ping the window manager is waiting
  on. Then the window manager would read that the application answered, which it had, a moment before.
  - Openbox numbers its pings from 1. mutter sends the server's time.
  - The engine's tokens have the top bit set (`drop_cursor::token`): Openbox never reaches them, and a server-time
    serial reaches that half only on a server up more than 24 days, then matches by chance one time in 2^31.
- **The other way round:** the watch reads the window manager's pings' answers too, since they come to the root. It
  waits only for its own token.
- **Live** (`bin/wm-check.sh`, x64, a private Xvfb with `openbox --debug`): the engine's sync test sent two answers
  to the root. Openbox logged "Got PONG with id 3677683712 but not waiting for one" and the same for …713, stayed the
  window manager, and the test passed. Beyond that, every run above ran under Openbox with two pings a settled drag: no window's title
  or state changed (the display's watchdog clean in every run, the harness's foreign-window audit clean).

### 5.2 Coverage

- **Who is asked.** Only a source that confirms by cursor: the family `Chromium` (Electron, and Chromium browsers of
  other classes that take its entry). Chromium lists `_NET_WM_PING` on every top-level it makes
  (`X11Window::Initialize`) and answers on its UI thread, the thread of the drag loop.
- **A source that lists no ping** is not asked (`Sync::Unasked`), is never settled, and answers unconfirmed. It falls
  back to honesty, not to 0.4.0's rule, so its false-ok exposure is closed and its confirmations are lost.
- **A source that does not answer in time** (150 ms a sync) gets its release anyway, and the answer is unconfirmed.
- **Which applications of the matrix are in either case: none.** The only cursor-confirming family is `Chromium`
  (in the matrix: Electron), and in every run here all of its syncs were answered inside the bound. An Electron
  application whose UI thread is stalled past 150 ms at the release would be: it answers unconfirmed.
- **A source that answered off its event thread** would break the order the rule stands on: its answer would not say
  what its drag loop had handled. No cursor-confirming family does. A family added to `confirms_drop_by_cursor` later
  must be checked for this first; the function's comment should say so in the release's fix.
- **Ruling 823's first condition, as the prototype stands.** Bounded wait: yes. Never ok: yes, in the rule and its
  tests (`settled` is false for `Unasked` and `Unanswered`, and an unsettled accept is `Cursor(false)`). **With the
  reason: not yet in the answer's text.** The prototype answers 0.4.0's unconfirmed notice ("… did not confirm a
  drop after the release …") and keeps the reason only in the `--stats` record (`settle.before_rest`,
  `settle.after_motion`). The release's fix should carry it in the notice. A proposed sentence, under the same "an
  unconfirmed drop:" kind so the service's and the facade's handling does not move: "your drag into <app> began a
  drag and drop, and <app> did not answer in time for its drop to be confirmed, so the drop may not have landed as
  the drag answered". That is a text change with its pins: `dnd.rs`'s `pending_cause`, the deviations, and
  `docs/cua-api/linux-engine.md` with its test.
- **Chrome, Firefox, GTK, Qt and the rest** are not asked and are not changed: Chrome confirms by activation, and the
  others' drops are not judged at all.

### 5.3 Cost

The added latency is the two syncs' waits (`settle.before_rest.ms` + `settle.after_motion.ms`). The 30 ms rest
between them is the rest the handle's end already had, and the plain drag's comes out of its floor.
`analysis/cost.mjs`.

| arm64 | drags | sync waits added: median | p95 | max | a sync past the 150 ms bound |
|---|---:|---:|---:|---:|---:|
| idle, H1's plan: handles, plain cell | 100 | 1.3 ms | 8.1 ms | 22 ms | 0 |
| idle, H1's plan: handles, left cell | 30 | 1.3 ms | 1.8 ms | 1.8 ms | 0 |
| idle, H1's plan: plain drags, plain cell | 100 | 1.3 ms | 1.8 ms | 1.8 ms | 0 |
| twice the load, L4a's plan: handles, plain cell | 100 | 3.3 ms | 71 ms | 123 ms | 0 |
| twice the load, L4a's plan: handles, left cell | 30 | 2.4 ms | 12 ms | 39 ms | 0 |
| twice the load, L4a's plan: plain drags, plain cell | 100 | 2.6 ms | 8 ms | 13 ms | 0 |
| twice the load, cold sittings: handles, loop in step | 112 | 2.4 to 3.1 ms | 6.5 to 12 ms | 20 ms | 0 |
| twice the load, cold sittings: handles, left cell, loop behind | 177 | 34 ms | 64 to 75 ms | 86 ms | 0 |
| twice the load, cold sittings: handles, short paths, loop behind | 73 | 66 to 68 ms | 99 to 101 ms | 104 ms | 0 |

- **The share that hit the bound: 0** of 395 settled drags in the cold sittings, 0 in L4a's plan and H1's
  (560 settled drags each), and 0 of 265 on x64. The longest single wait was 99.8 ms.
- On x64 at twice the load the loop is less far behind: left cell behind, median 3 to 5 ms, p95 28 to 40 ms, max
  46 ms; short paths behind, median 36 to 41 ms, p95 60 ms.
- The whole request, same cell, the two rules side by side in one sitting (arm64, twice the load): left cell with
  the loop behind, median 263 to 268 ms settled against 236 to 238 ms; plain cell in step, 162 to 169 ms against
  156 to 165 ms.

**The bound's expiry answers the unconfirmed notice, never ok.** The release still goes out.

### 5.4 Chrome's path

Not changed. The cursor watch, and so the settle, starts only for a `Chromium`-family source; Chrome's family
confirms by its activation request (ruling (1)), and `confirms_drop_by_cursor` excludes it by an existing test.
Checked live on x64: plan `t14-floor`, 10 a cell, idle, on the prototype's build: 10 of 10 landed and ok, 10 of 10
and 10 of 10 unconfirmed on the two controls, no false ok, and no row carries a `drop_cursor` or `settle` record
(x64 `out/chrome-floor`).

One thing for the design session, outside this fix: Chrome's known limit, a drop on a stale accept that Chrome
confirms and the page refuses, is this same lag. The floor hides it. The settle would bound it for Chrome as well,
if that limit is ever worth closing.

## 6. What the fix reaches (pre-flight §8.2)

### The functions the diff changes (10c0fec8..95a80e7a, `native/linux-engine/src/`)

| function | what changed | when the new lines run |
|---|---|---|
| `drop_cursor::DropCursor::start_for` (was `start`) | also selects takes of `XdndSelection`; reads the source's `WM_PROTOCOLS`; selects the root's `SubstructureNotify` when the source lists the ping | whenever the watch starts: a drag or handle whose source is a `Chromium`-family window |
| `drop_cursor::read_changes`, `AtRelease::record` | read takes and answers; keep each step's server time; the record's `steps` | the same |
| `drop_cursor::DropCursor::sync`, `take_seen`, `settled`, `token`, `Sync` | new | from the two callers below |
| `engine/handle.rs` `Engine::start_drag_handle` | passes the window to `start_for` | inside the existing `confirms_drop_by_cursor` branch |
| `engine/handle.rs` `Engine::release_handle` | two syncs around the rest; `settled`; the record | only when the handle has a cursor watch that saw a take (`settling`); otherwise the function sends the X requests it sent before |
| `engine/pointer.rs` `drag_along` | the floor's keepalives end one rest sooner; then sync, rest, second visit, sync | only with a cursor watch and a take (`measure.settle` and `measure.drop_cursor`) |
| `engine/pointer.rs` `Engine::drag` | passes the source to `start_for`; `settled` in the judgment; the record | inside the existing cursor-watch branches |
| `engine.rs` `Config`, `main.rs` `parse_args` | `drop_settle`, `--drop-no-settle` | at start |

`release_handle`, `drag_along` and `Engine::drag` are entered by every `drag_handle` end and every `drag`, whatever
the family. For a source that is not `Chromium`-family every new branch is skipped, and the watch never starts.

### The reruns, sized (`analysis/reach.mjs`, from `steps.mjs`'s planned minutes)

| list | steps | minutes an architecture | on `:0` |
|---|---|---:|---|
| **A. The new code runs** (an Electron source) | H1 22, H2 25, L4a 25, D2 30, L2b 22, L1 22, S1 39, L3b 24 | **209** (3.5 h) | none |
| the cross-check | D1 35 (Chrome's drag cells, the path the fix must not move) | 35 | none |
| **B. A changed function is entered, no new branch taken** (every other step that sends a drag or a handle; at most these) | V2 39, V3 35, V4 34, V5 38, Z0 25, D1, D3 30, D4 25, D5 25, R1 40, R2 45, R3 5, R4 3, E1 8, S2 25, S3 26, S4 30, ES 15, P4 30, P6 30, P5 20, C1 4, L2a 25, L2c 40, L3a 26, L3c 31, L3d 32, L3e 38, L4b 25, L4c 4 | 788 (13.1 h) | V2–V5 and Z0: 171 min |
| C. No drag and no handle | V1, FB, F1a–F4, L5, P1–P3 | 234 | V1 |

- **A's steps:** H1, H2 and L4a are T17's Electron cells, where the settle decides. D2 and L2b are Electron's drag
  kinds: their drag-and-drop cells settle, and the others start the changed watch. L1 has Electron's thumbs and
  ranges, and S1 and L3b its `drag` and `drag_handle` cells through the service: these start the watch.
- **My reading of §8.2 with M4's rulings (677, 691): rerun A and the cross-check, 244 minutes (4.1 h) an
  architecture, nothing on `:0`.** B's steps enter the changed functions with the changed code unreachable in them,
  which ruling 691 kept on the earlier record. If the design session reads "path" as the function, A and B together
  are 997 minutes (16.6 h) an architecture, 171 of them on `:0`.
- **For the lease:** A and the cross-check need about 4.1 hours of arm64 run time, plus the release's own steps
  (the fix's review, the release workflow, the pin, each run home's install). A and B need about 17 hours and a
  `:0` sitting.
- **The speed judgments** to watch: D2's and L2b's Electron drag-and-drop against the vendor. A short drop's settle
  rests inside the floor, so its added time is the two waits; a path that runs to the floor's end pays 30 ms more.
- I classed B's steps from the step list and the scenes' names, not from each step's rows; a step in B that in fact
  sends no drag belongs in C.

## 7. Commands and results

Every build, suite and run went under `locked.sh m5-l4a` with a timeout of 45 minutes or less, after a check that
`hold-sittings` was absent, on a private display. `$T` is `~/.local/share/cua-171/task98` on each VM (on x64 its `bin`
is `~/.local/share/cua-171/l4a-fix/bin`); the scripts are in the evidence's `scripts/`.

| where | command | result |
|---|---|---|
| x64 | `bin/engine-test.sh <worktree> unit` (`cargo test`) | 417 + 19 passed |
| x64 | `CUA171_GTK_TESTS=required bin/engine-test.sh <worktree> live` (`xvfb-run -a dbus-run-session … cargo test --release --locked --features live -- --test-threads 1`) | 628 passed, 0 failed, 1 ignored (`out/live-suite-x64-release.log`). A first run in the debug profile failed one test that needs the release profile's abort on panic; not the fix's |
| x64 | `cargo fmt`, `cargo clippy --all-targets --features live` | clean |
| x64 | `ci-gate --gates engine-linux` on 95a80e7a | GREEN, run 44285694703 |
| x64 | `node --test test/linux-engine-diff/drop-signals.test.mjs test/linux-engine-diff/electron-drop-judge.test.mjs` | 43 passed (24 in the first file) |
| arm64 | `bin/setup.sh <sha>` (worktree `t98-l4a`, `npm ci`, Electron, xprobe, `cargo build --release`) | exit 0 at c12f5f06, 7f192f99, 78d6cbda, b74961ca |
| arm64 | `bin/drive98.sh smoke1 t17-fix3 idle "" --trials 1` | exit 0; every sync answered in about 1 ms |
| arm64 | `bin/drive98.sh cold1 t98-cold load2` | stopped by me at 56 drags (`bin/stop-run.sh`) |
| arm64 | `bin/drive98.sh cold2 t98-cold load2` (the first order) | exit 0 |
| arm64 | `bin/chain2.sh b74961ca… cold3 cold4 shipped L4a H1 drag1` | `cold3` exit 1 (18 false oks, all the unsettled lane's); `cold4` exit 1 (20, the same); `shipped` exit 1 (62, the pinned asset's); L4a exit 1 (one missed landing); H1 exit 0; `drag1` not run (stopped before it by a STOP file, when the arm64 judged run began to wait for the lock) |
| x64 | `bin/x64-start.sh x64-cold1 …` | stopped by me at 30 drags |
| x64 | `bin/x64-start.sh x64-cold2 t98-cold load2` (the first order) | exit 0 |
| x64 | `bin/x64-chain.sh b74961ca… shipped chrome` | `shipped` exit 1 (15 false oks, the pinned x64 asset's); `chrome-floor` exit 0 |
| x64 | `bin/x64-chain.sh b74961ca… cold3` | exit 1 (7 false oks, all the unsettled lane's) |
| x64 | `bin/wm-check.sh <worktree>` | the test passed; Openbox dropped both answers |
| either | `node analysis/settle.mjs`, `cost.mjs`, `options.mjs`, `timeline.mjs`, `cold-lag.mjs`, `prevcell.mjs`, `lagseq.mjs`, `reach.mjs` | the tables above |

- Every run's display watchdog was clean. `gate.mjs leftovers` after the stopped run: "end check: clear".
- One slip: I copied a new `drive98.sh` over the one `cold2` was running from on arm64. The run was unaffected (its
  own record says exit 0, display clean), but that driver's closing log line is missing.
- The pinned assets were run from copies whose sha256 matched the pin's (0cbde8f0… arm64, 751ec9be… x64). Task 96's
  checkout and homes were read, not changed.
- No secret was read. No store was used: the drop-signals experiment starts no `cua serve`.

## 8. Not shown

- What sets the lag off.
- The settle on `:0`, and under mutter.
- **The plain drag's exposed rate.** Its settle ran in L4a's and H1's plain-drag cells (260 drags, every one
  settled, none wrong), but the plan that takes the two rules in turn on exposed plain drags (`t98-cold-drag`) did
  not run: I stopped before it when the arm64 judged run began to wait for the lock. Task 96's rows show the plain
  drag's left cell one withdrawal 14 ms before its release, so it is exposed in principle.
- A page slower than the rest as a false ok (section 3): not seen, not excluded.
- The reason in the unconfirmed notice's text (section 5.2).
- A code review of the prototype.
- A rerun of the judged x64 L4a: the pinned x64 asset's false oks came from this task's own plan, not from the gate's.
