# 0.4.1's candidate: the settle, measured (task 101)

**Superseded by the fix wave's measurement below** (review 1: the rule changed after 2d8f6ad9). The first table stays as
the record of 2d8f6ad9.

Development runs of the 0.4.1 release candidate, never counted. They follow the way task 98 ran its prototype
(`m5/l4a-fix/`). Nothing here is released: no tag, no release workflow run that publishes, and no change to the pin or
to `MIN_ENGINE_VERSION`.

- **The candidate.** Branch `m5-engine-041` at 2d8f6ad9 (`cua-engine 0.4.1 (2d8f6ad96296)`), each VM's own release
  build: x64 sha256 `cb879d77…`, arm64 `432b5c53…`. Later commits on the branch change no engine source.
- **The rule.** Ruling 827's option B, with ruling 3a as the design session's 829 reads it. The settle's second rest is
  taken when the first sync waited past the 30 ms rest and both rests end within `SETTLE_WITHIN` (150 ms from the
  first ping). A first sync of 31 to 90 ms takes it. Above 90 ms the second rest is skipped, and the drop is judged as
  the settle alone judges it.
- **Runs.** Every run used `gate.mjs run <step> --candidate <build> --dev --pilot 100`, task 96's and task 98's
  command, under `locked.sh m5-engine041`, on private displays, in run-owned homes. Each run's `README.md`,
  `step.json`, `summary.md` and rows (`results.jsonl.gz`) are here.
  - arm64: L4a at twice the load, then H1 at idle. Both exited 0 and both watchdogs were clean.
  - x64: L4a at twice the load. It exited 0 and its watchdog was clean.
- **Scripts:** `scripts/` (`setup.sh`, `chain.sh`, `t101.mjs` for the tables, `two-screens.sh`). Each run's
  `t101.md` holds its full per-cell table.

## The numbers

| | arm64 L4a, twice the load | arm64 H1, idle | x64 L4a, twice the load |
|---|---:|---:|---:|
| drags | 560 | 560 | 560 |
| false oks (the judge's count) | **0** | **0** | **0** |
| plain cells: not landed, of 100 each (`cua`, `cua:handle`) | **0, 0** | 0, 0 | **0, 0** |
| landed but unconfirmed | 0 of 200 | 0 of 200 | 0 of 200 |
| the judge | pass (exit 0) | pass (exit 0) | pass (exit 0) |
| settle records (reconstructed from per-drag `drop_cursor.settle`, not `drop_settles`): entered | 560 | 560 | 560 |
| second rest taken | 9 | 0 | 8 |
| second rest skipped (did not fit) | 1 | 0 | 0 |
| unsettled | 0 | 0 | 0 |
| a sync unanswered (and so "did not answer in time" notices) | 0 | 0 | 0 |
| the two syncs' waits summed, every settled drag: median / p95 / max (ms) | 2.7 / 8.9 / 93.5 | 1.3 / 1.8 / 20.0 | 2.7 / 7.6 / 54.4 |
| the same, `cua:handle plain` | 3.1 / 54.3 / 93.5 | 1.3 / 11.0 / 18.6 | 2.7 / 32.5 / 52.2 |
| the same, `cua plain` | 2.6 / 8.1 / 12.6 | 1.3 / 1.8 / 2.5 | 3.0 / 5.8 / 19.8 |

- **The plain cell's residue** (3b: at most 2 honest non-landings per 100): 0 in each plain cell of each run. Task 96's
  0.4.0 run and task 98's prototype each had one in arm64 L4a's `cua:handle plain`.
- **The second rest, by cell**, with what each answered:

  | run | cell | taken | answered | skipped (first sync over 90 ms) | answered |
  |---|---|---:|---|---:|---|
  | arm64 L4a | `cua:handle plain` | 5 | ok 5, all landed | 1 (91.9 ms) | ok, landed, as the settle alone answers |
  | arm64 L4a | `cua:handle inzone-out` | 2 | unconfirmed 2, neither landed (the cell's control) | 0 | |
  | arm64 L4a | `cua:handle root` | 2 | unconfirmed 2, neither landed (off the window) | 0 | |
  | x64 L4a | `cua:handle plain` | 5 | ok 5, all landed | 0 | |
  | x64 L4a | `cua:handle inzone-out`, `root`, `xterm` | 1 each | unconfirmed, none landed (the controls) | 0 | |

  Every drag that took or skipped a second rest was a block's cold first handle drag. Their first syncs waited
  30.0–68.8 ms (x64 30.0–50.9, arm64 38.2–68.8), and the one skipped waited 91.9 ms. No plain drag (`drag`) took or
  skipped one. So the cutoff cost nothing here: the one drag past it landed and answered ok.
- **No sync hit the 150 ms bound** in these 1,680 settled drags. So no drop answered with the new reason. Its wiring
  is proven by the unit tests (`drop_settle.rs`, `dnd.rs`) and the harness pins, not live.

## A finding the design session ruled on (830)

On arm64 L4a, the plain drag's `left` cell (lane `cua`, the background route) answered ok on 2 of 30 drags where the
page's drop zone took nothing (blocks 14 and 41, `#13` and `#24`, not cold):

- Electron dropped at the browser level. Its own dragend reported `copy`, which is why the judge counts each one as a
  drop (`droppedOf` trusts a dragend in the window).
- The release was at (500, 128), about 50 px left of the zone.
- Both syncs answered in 1.6–2.0 ms, so the drag loop was in step, and the settle held (`settled: true`, no second rest
  needed). The accept went up 109 ms after the take and was never withdrawn before the release at +443 ms.
- So the page's answer for the last place came later than the rest, which is task 98's open point. Ruling 3a does not
  reach it, because the first sync was fast.
- In task 98's prototype runs and in x64's L4a here, every left drag answered unconfirmed.

Ruling 830: this is not the engine's false ok. The ok agrees with Electron's own dragend, so the engine stays. The
Linux document says that under heavy load an Electron page can miss a drag and drop's last position, so an agent that
needs certainty checks the target. Task 102 adds the judge's per-cell mismatch report. The two rows stay here for the
record.

## Other proof

- `cargo test` (x64): 421 unit tests passed, and every boundary suite passed. One flake came on the first run, in
  `launcher_shim.rs` (it reads the comm before the exec). The rerun passed, and the flake is logged in the tracker.
- The live suite as the gate runs it (`CUA171_GTK_TESTS=required xvfb-run -a dbus-run-session -- cargo test --release
  --locked --features live -- --test-threads 1`, x64): 632 passed, 0 failed, 1 ignored.
- `tests/two-screens.sh`: 3 of 3 on x64 and 3 of 3 on arm64 (aarch64-unknown-linux-musl, from the host), each on Xorg
  :100 and :101, from this branch's own checkouts, with no target override.
- `ci-gate --gates engine-linux,test` on 2d8f6ad9: GREEN, run 44301764159.

## Fix wave 1: the final candidate, measured again (`fix1/`)

Review 1 of task 101 found six Important issues; the fixes are b2ebc57e (the rule's five fixes, ruling 835's precedence
test and 837's record) and ac8d86a6 (838: `settle_failed_activation_confirmed` in the drag's own record). The runs
below are of **ac8d86a6**, each from a clean checkout at that commit (`step.json`: `clean: true`): the x64 worktree
and the arm64 worktree `t101-041`, each VM's own release build (`cua-engine 0.4.1 (ac8d86a62f9a)`; x64 sha256 in
`fix1/x64/L4a/README.md`). The head after them, 5710996e and its follow-up, changes only `--stats` lines written with
no request (the exit's and the idle release's: `drop_settles`, `settle_final`, `exit_settle`): no input, wait or
answer moves, so the runs stand for it. Totals are reconstructed from each drag's `drop_cursor.settle` record.

| | arm64 L4a, twice the load | arm64 H1, idle | x64 L4a, twice the load |
|---|---:|---:|---:|
| drags | 560 | 560 | 560 |
| false oks (the judge's) | **0** | **0** | **0** |
| plain cells not landed (`cua`, `cua:handle`, of 100) | **0, 0** | 0, 0 | **0, 0** |
| landed but unconfirmed | 0 of 200 | 0 of 200 | 0 of 200 |
| left cells answered ok with no zone drop (ruling 830's class) | 0 | 0 | 0 |
| the judge | pass (exit 0) | pass (exit 0) | pass (exit 0) |
| settle entered / unsettled | 560 / 0 | 560 / 0 | 560 / 0 |
| second rest taken / skipped / needless | 12 / 0 / 548 | 0 / 0 / 560 | 11 / 0 / 549 |
| syncs unanswered | 0 | 0 | 0 |
| `settle_failed_activation_confirmed` (no Chrome destination in these plans) | 0 | 0 | 0 |
| the two syncs' waits summed, every drag: median / p95 / max (ms) | 2.6 / 8.6 / 90.0 | 1.1 / 1.5 / 14.5 | 2.5 / 7.7 / 70.3 |
| the same, `cua:handle plain` | 3.3 / 63.1 / 90.0 | 1.1 / 1.6 / 13.1 | 2.8 / 45.2 / 70.3 |
| the same, `cua plain` | 2.4 / 5.6 / 10.1 | 1.0 / 1.5 / 1.6 | 2.3 / 5.0 / 6.6 |

- **The second rest by cell.** arm64 L4a: `cua:handle plain` 9 taken, ok 9, all landed; `cua:handle inzone-out` 2 and
  `cua:handle xterm` 1 taken, unconfirmed, none landed (the controls). x64 L4a: `cua:handle plain` 9 taken, ok 9, all
  landed; `cua:handle inzone-out` 2 taken, unconfirmed, none landed. None skipped as not fitting. Their first syncs
  waited 42.6–89.1 ms on arm64 and 31.7–69.3 ms on x64, every one a block's cold first handle drag.
- **The failed settle, end to end** (`fix1/*/stall/`, the harness's `t101-stall` plan: the plain short drop with the
  Electron browser process the harness spawned stopped from 300 to 950 ms after the request, idle): on each VM 10 of 10
  drags had both syncs unanswered (the waits read 150 ms each, the bound), skipped the second rest, settled nothing, and
  answered with the new notice, "… did not answer in time for its drop to be confirmed …"; the next acting request was
  refused with the same cause, and its `late_dnd` reads `unanswered: true`. Every one of the drops landed once Electron
  continued: honest unconfirmed, never ok.
- A second-rest skip was not seen in these runs; the live-clock rule (829) is proven by its unit tests.
