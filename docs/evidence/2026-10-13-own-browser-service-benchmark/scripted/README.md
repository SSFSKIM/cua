# Scripted drag check (M5, 2026-10-14)

Why: in the model-driven cua benchmark runs (`../summary.txt`), cua missed drag-box once (the controller never clicked Submit) and drag-items once (a drop coordinate), each against the vendor's 3/3. This check runs the same two tasks with no model in the loop to tell the service's behaviour apart from controller slips (spec Decision Log, 2026-10-14, "on the M5 benchmark verdict").

**Result: both services 5/5 on drag-box and 5/5 on drag-items. Every episode got raw reward 1, so cua has no drag defect.** Per-episode raw and discounted rewards and the drag paths are in `summary.txt`.

## How it ran

- Mini, Chrome profile `ssfs`, through the parity harness from the parity clone `~/Developer/GitHub/cua-parity` at 8e10092. That is a plain `cua serve` per case, with `CUA_BROWSER_SERVICE` set explicitly and the real REPL client, as the parity runs use. The resident agent was not involved.
- Service check on every case: the vendor showed its `# Selected Browser` header with no cua marker; cua showed `cua browser service 0.1.0`.
- Runs went 2026-10-14 15:41 to 15:46 UTC, alternating vendor then cua, five times each (`<service>/ep-<n>/`, one harness run per episode with both tasks). Each run's `meta.json` (commit, profile, environment, check, times), `results.jsonl` (every cell's value) and `host-trace.jsonl` are kept.
- Pages: the archive benchmark fixture on the mini (`/opt/homebrew/bin/node /tmp/bench-browser/fixture/serve.mjs`, 127.0.0.1:48731), MiniWoB 33c3b4d, URL `.../miniwob/miniwob/<task>.html?seed=bench-<task>`. The seed gives every episode the same instance: "Drag Kori to the bottom." and the same two box positions. The fixture was started for these runs and stopped after them.
- Episode, as the successful model runs did it (`test/browser-parity/bench/scenarios/miniwob/`):
  - open a tab and goto the task, click START (`#sync-task-cover`), read `#query`, read the element rects with `tab.playwright.evaluate`;
  - one `tab.cua.drag` whose two-point path comes from a fixed rule (`test/browser-parity/bench/drag-rules.mjs`):
    - drag-items: from the named item's centre to the target row, its lower half when moving down;
    - drag-box: from the small box's centre to the large box's centre;
  - read back (item order; box rects then the Submit click on `#subbtn`);
  - outcome: MiniWoB's console line `reward: X (raw: Y)` from `tab.dev.logs` on both services. The vendor's evaluate cannot see page globals, and the line is logged right after `WOB_DONE_GLOBAL` is set to true. The read repeats for at most 3 s until the line appears.
- An episode passes when every cell succeeded and raw reward is 1.
- The drag paths came out the same on every episode and both services: drag-box (121,114)->(76,93), which is the path in cua run-1's successful note, and drag-items (77,98)->(77,191).
- The vendor asked one approval per case (accepted by the harness, recorded in `meta.json` `elicitations`); cua asked none.

To reproduce: start the fixture on the device, then run `node scripts/browser-parity.mjs run --device mini --corpus bench --service <vendor|cua> --out <service>/ep-<n>` per episode and `node scripts/bench-scripted-summary.mjs .`.
