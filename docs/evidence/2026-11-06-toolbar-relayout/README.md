# #294's spike: Chrome for Testing re-lays out its toolbar after launch, so a late click lands where Reload used to be

**This is #294's measurement spike.** It ran on GitHub-hosted macOS runners, with no owner and no MacBook slot. It finds that #294 is not lost input.

#294 reported that a route-3 click on Reload into a background Chrome for Testing answers success but does nothing once the window has sat 20 s or more. The click is delivered, but to a stale point:
- About 18–20 s after launch, Chrome for Testing lays its toolbar out again. In the kit's 620-pt-wide window, the "Sign In to Chrome" pill collapses to an avatar, the "»" overflow chevron goes away, and the disabled Forward button comes back.
- Reload moves 36 pt right, from x 442 to 478.
- A click at the first screenshot's Reload point (459, 94) then lands on the disabled Forward button.

The engine's "success" was honest about delivery. The stale-point guard that this spike called for is #296.

- **The kit:** the `probe/294-hosted` branch (`scripts/probe-294/live.mjs`, `scripts/probe-294/tool.swift`, `.github/workflows/probe-294.yml`), building origin/main's engine at 50f3312d. It stays off main.
- **The runs:**
  - https://github.com/SSFSKIM/cua/actions/runs/42173188779: the threshold, the A/B cells, the event tap and Safari. Image 20261026, macOS 26.6.2, Chrome for Testing 156.0.8078.47.
  - https://github.com/SSFSKIM/cua/actions/runs/42175037968: HID with no engine, an EUI toggle, an AXManualAccessibility write, a re-observation, then the element click. Image 20261102, macOS 26.7.2, Chrome for Testing 156.0.8078.80.
  - https://github.com/SSFSKIM/cua/actions/runs/42176012181: Reload's position sampled every second, with and without an engine, and the click at Reload's current centre. Same image as the second run.
- **The records:** `run-<id>/rep<n>/results.json`, one runner per rep. Each cell carries:
  - the engine's full answers (meta);
  - the page's counters;
  - `loadsDelta`, which counts GET requests at the server;
  - the posted point;
  - Reload's frame at the observation and, in the third run, at the click.
- **The screenshots:** `toolbar-8s.png` and `toolbar-18s.png` are region captures of the toolbar 8 s and 18 s after TextEdit came front. They are from the third run's rep 1, with no engine.
- **The setup:** each cell gets a fresh Chrome for Testing, a fresh engine and a fresh connection, in shared mode, with TextEdit frontmost.
- **The reps agree in every cell**, except the threshold's boundary, which moves with the re-layout's time.

## The threshold follows Chrome's launch, not the observation

The first run's cells, clicking at the first observation's point. The time since Chrome launched is from the cell's launch to the engine's `startedAt`.

| After the observation | rep 1: since launch, result | rep 2: since launch, result |
|---|---|---|
| 1 s | 10.0 s, reloaded | 8.6 s, reloaded |
| 10 s | 13.3 s, reloaded | 13.7 s, reloaded |
| 12 s | 15.2 s, reloaded | 15.3 s, reloaded |
| 15 s | 18.7 s, **no reload** | 18.1 s, reloaded |
| 17 s | 20.1 s, **no reload** | 20.8 s, **no reload** |
| 20 s, 25 s | 23.2 s and 28.7 s, **no reload** | 23.3 s and 28.5 s, **no reload** |

- **The boundary falls between 18.1 s and 18.7 s after launch** in both reps. Every click at 18.7 s or later at the old point was lost, in every cell of every run.

- **The third run sampled the hit at (459, 94) once a second** from just after TextEdit came front, 2.3–7.7 s after launch. With no engine, it changed between 13.1 s and 14.1 s, and between 11.4 s and 12.5 s, of that clock. With an engine observing, it changed between 16.0 s and 17.1 s, and between 15.0 s and 16.0 s. Counted from launch, all four changes fall between 17.6 s and 20.2 s.
- **In every rep, the hit at (459, 94) turned** from `AXButton Reload @442,77` into an AXGroup.
- **Waiting 30 s, then observing, then clicking 1 s later reloaded.** The observation saw the new layout and posted at (495, 94).

## The click is delivered both times

These are the first run's cells at 1 s and 25 s, under a listen-only `CGEvent.tapCreateForPid` on Chrome and an AX sampler.

- **The engine's meta is identical:**
  - route 3, `activationJoin: fresh`, `activationClickKind {action, consumedByAction}`, `activationClick: outsideFrame`, no restores;
  - no held activation is involved, because every synthesized click takes a fresh one.
- **The events Chrome receives are identical:**
  - subtype 1;
  - the down and the up at (459, 94), with click state 1 and the window's number;
  - the window server's subtypes 22 and 23;
  - subtype 2.
- **Chrome's state is identical:** AXFrontmost true for about 100 ms, then false; AXMain true; TextEdit stays frontmost.
- **The page is identical up to the effect:** a focus and a blur in both cases. Only the 1 s click goes on to a hidden page and a new load. The page's ticks are never throttled; the largest gap is about 320 ms.

## What isolates the cause

| Cell | Reloaded |
|---|---|
| Route 3 at Reload's *current* centre at 25 s, from the old screenshot's pixels, and from a fresh screenshot | 2 of 2, and 2 of 2 |
| The element click on Reload's token at 25 s (it re-reads the frame and posts at (495, 94)) | 4 of 4 |
| The coordinate click at 25 s, then the element click 1.5 s later | the first no, the second yes |
| A real HID click at (459, 94), no engine, 3 s after launch / 25 s after launch | yes / **no** |
| Plain post (route 2′) and dedicated mode, 1 s / 25 s | yes / **no** |
| A re-observation at 24 s (with or without a screenshot), a cheap AX read, an EUI toggle or an AXManualAccessibility write, then the old point at 25 s | **no**, in every cell |
| Safari's Reload by route 3, 1 s / 25 s | yes / yes |

- **(a) Held activation expiry: excluded.** Every click is a fresh activation, with identical meta.
- **(b) AppKit's first click into a long-inactive window: excluded.** The events and AppKit state are identical, and Chromium's `BridgedContentView acceptsFirstMouse:` always answers YES.
- **(c) Chromium throttling: excluded.** The page stays visible and unthrottled.

## What it means

- **#294's "Reload after idle" table** in `docs/evidence/2026-11-06-eui-release/` is this artifact: those cells clicked the first observation's point after the re-layout. So are #288's `c6/released-reload` rows. That README now says so.
- **The product's part is general:** a coordinate click from a screenshot that the app has since re-laid out. It is #296: compare what the screenshot's tree had under the point with what is there now, and refuse when the target is gone or moved.
- **For the next probe:** locate toolbar controls at click time, or observe at least about 20 s after Chrome for Testing launches. `probe/288-hosted`'s `noobs` cell now locates Reload through AX (5762adbc).
- **The kit's own faults:**
  - its `pixelStale` field aliases `pixel`, so both show the current point;
  - its `toolbar` command's breadth-first search found no controls, though its hit-test works.
