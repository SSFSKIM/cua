# linux-engine 0.4.5 pre-flight (#512, #572; task 158, ruling 1193)

Base: origin/main cb9973e82 (M6a merged, 0.4.4 pinned). Scope: #512 and #572; #497 stays out (1193). Nothing here is
built yet: the forks (§D) are the design session's.

## A. Item 3: can the engine read Chrome's drag status?

**The engine can see the very signal the harness calls the leave, but it cannot apply item 3's rule. Items 1 and 2
stand.**

**What the harness reads.** The harness's "leave" comes from `xprobe drop-watch`, an ordinary client with no RECORD and
no grab: an XFixes `DisplayCursorNotify` on the root, then `GetCursorImage`. The leave is Chrome's no-drop image (`bd1d…`)
shown after its accept (`1dc3…`, `t147-left-table.mjs`). Chrome's drag loop sets its cursor through its pointer grab,
so every client sees that cursor.

**The engine sees it too.** It already reads the same thing on its own connection: `accept.rs` (`CursorWatch`, the
measurement-only release at the accept) and `drop_cursor.rs` (Electron's watch). Both tell the accept from the no-drop
image by identity. The probe (`docs/evidence/2026-10-28-own-linux-engine/engine-045/preflight-probe/`) confirms it:
- Setup: a private Xvfb :158, never :0. The harness's Chrome 158 ran behind xtrace, and three XTEST drags went from a
  Chrome page to a zone on the same page.
- Drag A, released in the zone: no-drop at the take, then the accept, then the release with no leave. It dropped.
- Drags B and C, which went into the zone and back out: the accept, then **the leave (`bd1d…`) 509 ms later**, then the
  release. They did not drop.

**The engine still can't use it.** Item 3's rule is "no leave seen after the path's last out-of-zone step". It fails on
the engine's side for three reasons:
1. **The engine doesn't know the zone.** "Out of zone" is the page's geometry. The harness knows it, and the engine
   never does.
2. **A missing leave is also what a genuine drop shows.** Drag A, a real drop, ended with the accept shown and no
   leave, exactly like H9 #28 and task 147's two false oks. At the release, the cursor can't tell "Chrome answered the
   last position in the zone" from "Chrome hasn't answered it yet".
3. **No per-position status is visible.** Chrome is both source and target, and `SendXClientEvent` keeps `XdndPosition`
   and `XdndStatus` inside the process. In the probe's trace, Chrome sent and received **0 ClientMessages**. Its Xdnd
   traffic is atom interning, properties and the `XdndSelection` take (`xtrace-xdnd.txt`). The only way to watch another
   client's requests is RECORD, and RECORD can freeze X.Org 21.1 (task 41), so it is never used on a person's display.

## B. The design

**Item 1: an overrun takes the after-path tail.**
- `release_sync.rs`: `Schedule::of(open, overran, floor_end)` returns `AfterPath` when `open || overran`, so 993's rule
  now applies to floor_until.
- A new pure function, `overran(take, steps_floor, last_sent) -> bool`, is true when `last_sent > take + steps_floor`, by
  any margin.
- `pointer.rs` `drag_along` keeps `last_sent`, the instant the path's last sample went out. `ReleaseSync::at_release`
  takes `overran`.
- The gate (`open`) and option (c)'s switch keep their meaning (F3).
- The handle end is untouched, because its tail always runs after the path.

**Item 2: a dropped visit answers unconfirmed (fail-closed).**
- `release_sync.rs`: a new function, `unconfirms(open, unconfirm_outlasted, synced) -> bool`, returns
  `(open && unconfirm_outlasted) || synced.visits_dropped > 0`.
- `pointer.rs` (line 1502) puts it where `outlasted` is computed today. It then flows through
  `Confirming::after_outlasted`, so an activation-only drop becomes `Confirming::Outlasted`, which ends with
  `WatchEnd::Outlasted` and option (c)'s notice (`dnd.rs` line 368).
- Other confirmations are untouched.

**Item 4: rows copy release_sync.**
- `drop-signals.mjs`: a new exported `releaseSyncOf(stats)` returns
  `stats.release_sync ?? stats.handle?.release_sync ?? null`.
- Each row gets it as a top-level `release_sync`.

**#572: LS and PS in JSONL.**
- `wire.rs`: a new `pub fn jsonl(value: &impl Serialize) -> String` calls `serde_json::to_string`, then replaces U+2028
  with ` ` and U+2029 with ` `. Those characters can occur only inside JSON strings, so the value is
  unchanged.
- Every JSONL writer uses it: `Response::to_line`, `Engine::stats_line`, `standalone_stats_line`, `exit_stats_line`, and
  the `focus_out` and exit `eprintln!`s in `engine.rs` (lines 599 and 1056).

**What a counted row records.** The drag's `release_sync` record gains:
- `overran` (bool);
- `last_step_after_take_ms`;
- `unconfirmed`: `"visit_dropped"`, `"outlasted"` or null.

`schedule` (`after_path` / `in_floor`), `visits_dropped`, `past_floor_ms` and `hold.floor_until_ms` stay as they are.
The row carries all of this through item 4.

**Tests.** Each is written red first; each rule's test uses timings taken from the rows that motivated it.

| Test | What it covers |
|---|---|
| `release_sync::tests::a_path_whose_last_step_overran_floor_until_takes_the_after_path_tail` | H9 L4d #28 (+12.7 ms) and task 147 r2 #3 and r2 #13 (+8.8 and +7.2): after-path, rest 8, visit, 8, visit, 8, 0 dropped, on the existing late-capable `Clock` |
| `release_sync::tests::an_in_floor_tail_that_dropped_a_visit_answers_unconfirmed_with_option_c_s_notice` | a late wakeup drops a visit; `unconfirms` is true; `Activation` becomes `Outlasted`; `WatchEnd::Outlasted`'s text |
| `release_sync::tests::an_in_floor_tail_with_no_overrun_is_unchanged` | last step at take + 320: `InFloor`, visits at 334 and 342, release at 350, not unconfirmed (0.4.4's calls) |
| `engine::pointer::tests::a_drag_s_overrun_is_its_last_sample_against_floor_until` | the `drag_along` path through the fix wave's live seam (XTEST on Xvfb, a real `DndWatch`), with a path slowed past floor_until; reverting `overran` to false fails it |
| `wire::tests::every_jsonl_line_escapes_ls_and_ps_and_reads_back_the_same_value` | a response and a stats line |
| `live_device::an_at_spi_name_with_a_line_separator_reaches_a_node_readline_reader_as_one_line` | a GTK window titled with LS; the engine's reply piped to a Node 24+ `readline` reader: one line, name intact (F6) |
| `test/linux-engine-diff/drop-signals.test.mjs` | "a row carries its drag's and its handle's release_sync" |

## C. The measurements (the reach is ruled by 1193; this section confirms it and gives times)

**Development bar.** t14-floor `left` ×300 at arm64 twice the load, with 0 false oks required.
- Harness: task 147's (`t132-alternate.mjs`, `--engine-stats`), 12 rounds of 25, on the publish=false candidate.
- Duration: task 147's ×100 took 6.2 min (11:43–11:49Z), so ×300 takes about **20 min**.
- Bound: 0 in 300 puts the 95% upper bound at 1.0%, against 3 in 260 before the fix.

**Counted reach.** H1, H2, L4a, and L4d at 993's bar, on both arches, on private displays only.
- Durations: H9's arm64 sitting took H1 17.5, H2 18.0, L4a 21.5 and L4d 26.6 min, about **1 h 25 min** in all. x64 is
  no slower.
- **No cell runs a vendor lane.** H1, H2 and L4a are `t17-fix3`, L4d is `t14-stale`, and every lane is `cua*`
  (`steps.mjs` lines 139–163; `PART_CELLS`), so M6b's deletion of the vendor lanes doesn't touch them.

**Deadlines on arm64.** The arm VM's lease ends 2026-11-26T01:00Z.
- The counted reach must start by **2026-11-25T20:00Z**. That leaves room for one full rerun (2 × 1 h 25 min) and about
  2 h of margin.
- It runs on the pinned 0.4.5, so before it come the tag, the pin pull request and ci-gate, about 4 h.
- So the ×300 must start by **2026-11-25T15:00Z**, which leaves room for one rerun.

**Hosted ubuntu-24.04-arm.** From the harness code only, with no run:
- L4d's load step is `stress-ng --cpu <cores × 2> --cpu-method matrixprod` (`experiments.mjs` `startLoad`). Nothing in
  it is tied to the VM, so it would run there.
- But "twice the load" is relative to the cores: 8 workers on a hosted runner's 4 vCPUs, against 16 on the VM's 8, where
  H9 saw loadavg about 16. The step would need to be re-baselined.
- The rest of L4d (arm64 Chrome, Openbox, Electron fixtures) is unproven there.
- So it is a fallback only (F7).

## D. Forks for the design session (each with my recommendation)

- **F1. Item 3.** Recommend: items 1 and 2 stand, and nothing reads the leave in 0.4.5 (§A). A zone-free proxy, such
  as "the accept is older than the last motion", would also fail closed on every genuine drop that enters the zone
  before its path ends.
- **F2. What counts as "the path's last step".** The engine could use the instant the last motion went out, or the
  harness's `hold.path_ms`, which is the path loop's end and includes the last wait. Recommend the motion's own instant.
  It is what reaches Chrome. Record `last_step_after_take_ms` so tables can compare it with `path_ms`.
- **F3. Whether an overrun opens the gate.** Recommend that it changes only the schedule. `open` keeps meaning 993's
  shape, and option (c) stays off. Otherwise item 1 would silently widen (c)'s scope.
- **F4. Item 2's notice.** Recommend option (c)'s `WatchEnd::Outlasted` as ruled, with `release_sync.unconfirmed` naming
  the cause. The alternative is a new `WatchEnd` with wording specific to the dropped visit. Both kinds of dropped visit
  count: a passed due time and a wakeup inside `VISIT_CUTOFF`.
- **F5. Whether item 2 still fires after item 1.** Recommend yes. In-floor tails then only follow a path that ended by
  floor_until, so their dropped visits come only from late wakeups (task 147's honest rows had 6). Those are rare,
  fail closed and cost nothing on the bar.
- **F6. Where #572's Node test runs.** The engine-linux gate has no Node (`setup: false`). Recommend giving that gate
  Node 24 and making the live test required under `CUA171_NODE_TESTS=required`, as `CUA171_GTK_TESTS` is. The
  alternative is a Rust emulation of readline's splitting, which wouldn't be the ruled Node 24+ reader.
- **F7. Venue.** Recommend the arm VM for both the ×300 and the reach, inside the deadlines in §C. Hosted
  ubuntu-24.04-arm only if the VM is lost, and then with a re-baselined load factor recorded beside the bar.
