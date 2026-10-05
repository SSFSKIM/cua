# Browser-route benchmark: playwright-cli extension bridge vs cua_repl (2026-10-05)

One run per route, same model (Claude Opus 5.5), one controller per route, serial calls, the owner's existing Chrome Default profile, identical fixture pages and seeded MiniWoB++ instances served from loopback. Routes: `pw` = playwright-cli `attach --extension=chrome`; `cua` = `cua serve` (profile `personal`, sandbox default `scoped`). Reports: `pw/report.md`, `cua/report.md`; task definitions: `TASKS.md`.

Rulings: T8's live example.com no longer has an `<h1>`; "no h1" scores as correct for both. Neither run was blind (both seats saw the README's ground-truth section before running); every answer was taken from the page and logged.

| Measure | pw (playwright-cli bridge) | cua (cua_repl) |
|---|---|---|
| Fixture T1–T8 correct | 8/8 | 8/8 |
| Fixture block, T0 start → T8 done | 2 min 01 s | 3 min 53 s (61 s first tab open; 74 s on T8 looping the 3 s locator cap) |
| MiniWoB++ successes | 13/15 | 15/15 |
| MiniWoB block wall | 11 min 23 s (≈3.5 min pause + diagnosis of a hidden tab) | ≈3 min 17 s |
| Total T0 → T9 | 13 min 38 s | 7 min 10 s |
| Tool calls | 233 log lines (~0.25–0.8 s each) | 54 (52 `js`; most MiniWoB tasks in 2 cells) |
| Nested iframes (T6/T7) | a11y snapshot pierces frames, refs per frame | `frameLocator` chains, one cell each |
| Canvas drag (T5) | exact, via `snapshot --boxes` + mouse commands | exact, via `tab.cua.drag` point path |
| Elements without a11y roles | needed `eval` outerHTML + CSS selectors | Playwright locators directly |
| Page globals (MiniWoB outcome) | `eval` reads them | invisible (read-only isolated world); read from console via `tab.dev.logs` |
| Failures | 2 MiniWoB episodes lost when the tab went to the background (owner using Chrome; a second extension client appeared); each action then stalls 5 s with no visibility hint | none lost; one strict-mode locator retry (`hasText` ignored), one REPL block-scope slip |
| Setup friction | attach 1 s; `attach`/`tab-list` output prints the extension token; tab counts cover only route-visible tabs; `detach` no-op after closing the last tab | `profiles_list` → id; browser API doc only after binding; first `tabs.new` 60.8 s (vendor policy fetch); `screenshot({clip})` uses page coordinates |

## Reading

- Capability: equal on the fixture; cua ahead on MiniWoB (15/15 vs 13/15), but pw's two losses were environmental (tab visibility), not logic. With the tab in front, pw completed the remaining tasks cleanly.
- Speed: pw's per-call latency is far lower, and it won the fixture block by ~2 min; cua won overall because its cells batch several actions per call (2 calls per MiniWoB task) and because pw paid ~3.5 min for the contention incident. Excluding that pause, totals are close (pw ≈10 min, cua ≈7 min).
- Robustness to a live user: pw depends on the controlled tab being the active one in the owner's window; cua did not show this dependence in this run (its tab stayed in the background of a 9-tab window while the owner worked). This is the most decision-relevant difference for an agent that shares the user's Chrome.
- Privacy: pw's normal output echoes the extension token; cua's results are token-redacted since #24.
- Known cua costs confirmed: 60 s first-tab open, 3 s locator cap (#25), read-only evaluate cannot see page globals, `hasText` ignored, clip coordinates.

## Limits

Single run each; the pw run overlapped with the owner's active use of Chrome and a second extension client, the cua run did not; MiniWoB wall times include model reasoning between calls; both seats had seen the ground truths.
