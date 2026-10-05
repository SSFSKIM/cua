# cua route report (cua_repl → ChatGPT Chrome extension, profile `personal`)

- Model: Claude Opus 5.5 (`claude-opus-5-5[1m]`)
- Total wall time, T0 start → T9 done: 2026-10-05T19:44:18Z → 19:51:28.6Z = **7 min 10 s**, including MiniWoB, which ran between T8 and T9 so all work stayed in one tab
- Fixture T1–T8: **8/8** (T8 is correct as observed; see the note under the T8 row)
- MiniWoB: **15/15** successes (raw reward 1 on every task)
- Tool calls: 54 in total (`profiles_list` 1, `js` 52, `end_task` 1)

## Setup friction (T0)

- `profiles_list` returned `personal` as ready (extensionInstanceId `94c9fc71-…`). `school` was `binding_stale` and `work` was `extension_not_installed`; I didn't touch either.
- The browser-specific API document (Playwright locators, `tabs.new`, `screenshot`, `dev.logs`) is only returned by the first `cua.getBrowser({extensionInstanceId})`. Reading it during the pre-GO wait would have meant binding the browser. Before GO I could only read the generic API document, which describes the native-app/AX surface and not the browser API.
- `getBrowser` returned in 137 ms. Tab inventory used `browser.user.openTabs()`: 9 tabs before and 9 after.
- **Opening the tab took 61 s.** The single `tabs.new()` + `goto(index.html)` call took 60.8 s. Every later `goto` took about 0.5 s.
- REPL scoping: a `var tab` declared inside a `{ … }` block did not persist to the next cell, which gave `ReferenceError: tab is not defined`. I recovered the tab with `browser.tabs.list()` + `tabs.get(id)`, so no second tab was created. Only top-level `const`/`let` persist.

## Fixture tasks

Wall time is measured from the previous task's done mark to this task's done mark, so it includes my reasoning and logging between calls.

| Task | Wall (s) | Tool calls | Observe calls | Retries | Answer | Correct? |
|---|---|---|---|---|---|---|
| T0 | 18.7 | 3 | 1 | 0 | 9 tabs before | n/a |
| T1 | 66.2 | 1 | 0 | 0 | title "Bench Home"; `#bench-id` = BENCH-2026-10-05 | yes |
| T2 | 18.2 | 4 | 4 | 2 | 1437.50 | yes |
| T3 | 14.9 | 2 | 2 | 1 | D | yes (see disclosure) |
| T4 | 9.6 | 1 | 0 (1 wait) | 0 | LATE-7f3a | yes |
| T5 | 11.5 | 2 | 1 | 0 | 50,40,200,150 | yes (exact) |
| T6 | 15.1 | 2 | 0 | 0 | 42-Bravo-circle-11 | yes |
| T7 | 4.9 | 1 | 0 | 0 | `#deep-log` fFx, `#deep-echo` fFx | yes (matches the README spec; no ground-truth row) |
| T8 | 74.3 | 4 | 2 | 3 | the page has **no `<h1>`** (title "Example Domain") | yes as observed; the README has no ground-truth row for it |
| T9 | 8.9 | 2 | 0 | 0 | closed 1 tab; 9 tabs after (= 9 before); `end_task` → `{"status":"ended"}` | yes |

**How each task was done:**
- **T2:** Playwright `allTextContents` on the table rows joins the cells into one string per row (for example `Widget1012.50`), which is ambiguous. I re-read the table cell by cell with `evaluateAll`.
- **T3:** I first passed `screenshot({clip})` the canvas's viewport rectangle, and the image showed the table instead. The clip rectangle appears to be in page coordinates, not viewport coordinates. A full-viewport screenshot then showed bar D clearly tallest. **Disclosure:** while checking element ids before GO, I briefly saw the head of `index.html`, which contains the bar-height array. The answer still came from the screenshot.
- **T4:** The page had been open for more than 60 s, so `#late` was already present. No reload was needed.
- **T5:** I scrolled with a real mouse wheel (`tab.cua.scroll`), read the canvas rectangle, then made an 11-point `tab.cua.drag` from canvas point (50,40) to (250,190).
- **T6:** All inputs were real UI actions: `locator.click()` + `pressSequentially` for the three quantities and the phrase, clicks on the dropdown toggle, the Bravo option, the circle radio and Submit. `submissions.log` received `42-Bravo-circle-11` at 19:46:48Z.
- **T7:** `frameLocator('#outer').frameLocator('#inner')`, click `#deep`, then `press('f')`, `press('F')`, `press('x')`.
- **T8:** `goto` worked, but `locator('h1').innerText` failed with `Playwright selector deadline exceeded` and kept failing in a 20 s bounded loop (7 times). `domSnapshot`, a read-only `querySelectorAll('h1')` (empty) and a screenshot all showed the current example.com page: an icon, multilingual paragraphs and a "Learn more" link, with no heading. `curl https://example.com/` outside the browser also found 0 `<h1>` tags. The task assumes an `<h1>` that the live site no longer has. **Decision for the operator:** whether "no h1" scores as correct. I counted it as correct.

## Failures (exact error text)

- T2: `tab is not defined` (REPL scoping, explained in Setup friction).
- T3: no error, but the clip rectangle captured the wrong region (page vs viewport coordinates).
- T8: `Playwright selector deadline exceeded` (×8: once in the first call, 7 times in the bounded loop).
- MiniWoB click-option: `strict mode violation: locator('#boxes label').locator('input') resolved to 5 elements`. The `{hasText}` option on `playwright.locator(selector, options)` was silently ignored. No click had happened yet, so the episode continued, and the retry with `getByRole('radio', {name, exact:true})` succeeded. In click-button the same ignored option also clicked the first `button` in `#area`; that happened to be a correct "cancel" button.

## MiniWoB++ (one episode each, seeded URLs)

**Outcome reading had to change.** This route's `evaluate` runs in an isolated, read-only world, so `window.WOB_DONE_GLOBAL` and the other `WOB_*` globals read as `undefined`. Instead I read the outcome from the page's console through `tab.dev.logs`. `core.endEpisode` logs `reward: <WOB_REWARD_GLOBAL> (raw: <WOB_RAW_REWARD_GLOBAL>)` immediately after setting `WOB_DONE_GLOBAL = true`, so that line gives both rewards and implies done. I confirmed it against the DOM each time: `#reward-last` matched, `#episode-id` was 1, and the START cover was back. `WOB_REWARD_REASON` can't be read on this route; it only takes a value on timeout, and no episode timed out.

"Episode (s)" runs from just before `goto` to the outcome read. "Wall (s)" runs from the previous task's done mark to this task's done mark. Actions = js calls that act (start + perform); observes = outcome reads, which were done inside the action call.

| Task | Success | Raw | Discounted | Episode (s) | Wall (s) | Actions | Observes | Note |
|---|---|---|---|---|---|---|---|---|
| click-button | yes | 1 | 0.9416 | 1.4* | 35.5 | 2 | 1 | 2 identical "cancel" buttons; *episode time is the sum of call durations; the wall time includes finding the outcome workaround |
| click-checkboxes | yes | 1 | 0.9767 | 5.0 | 13.8 | 2 | 1 | "Select nothing", Submit |
| click-dialog | yes | 1 | 0.9796 | 4.2 | 7.8 | 2 | 1 | `.ui-dialog-titlebar-close` |
| click-link | yes | 1 | 0.9824 | 3.7 | 7.3 | 2 | 1 | |
| click-option | yes | 1 | 0.9564 | 8.6 | 13.4 | 3 | 1 | 1 strict-mode locator error before any click |
| click-tab | yes | 1 | 0.9830 | 3.6 | 7.4 | 2 | 1 | |
| enter-text | yes | 1 | 0.9780 | 4.5 | 8.5 | 2 | 1 | |
| enter-password | yes | 1 | 0.9424 | 10.9 | 15.7 | 2 | 1 | typing into password fields took 7 s |
| focus-text-2 | yes | 1 | 0.9769 | 4.7 | 8.8 | 2 | 1 | |
| drag-box | yes | 1 | 0.9536 | 8.7 | 13.1 | 2 | 1 | `tab.cua.drag`; containment checked before Submit |
| drag-items | yes | 1 | 0.9565 | 8.1 | 12.4 | 2 | 1 | 16-point drag; jQuery sortable reordered correctly |
| scroll-text | yes | 1 | 0.9707 | 5.8 | 10.2 | 2 | 1 | the last word was readable from the DOM without scrolling |
| use-slider | yes | 1 | 0.9431 | 10.7 | 16.0 | 2 | 1 | vertical slider; 73 × ArrowDown from -8 to -81 |
| simple-algebra | yes | 1 | 0.9783 | 4.4 | 8.8 | 2 | 1 | |
| email-inbox-delete | yes | 1 | 0.9741 | 5.2 | 9.7 | 2 | 1 | synthetic local inbox |

**Success: 15/15.**

**Rule disclosure:** I read `click-button.html`'s source once, to check whether either duplicate "cancel" button counted (both do), and `core.js`, to find an outcome signal the route could read. I read no other task's source.

## What the route made easy or hard

**Easy:**
- Playwright locators with `frameLocator` chains handled the nested iframes (T6, T7) in one call each.
- `tab.cua.drag` with a point path worked on the first try for the canvas, jQuery draggable and jQuery sortable.
- Batching several deterministic actions into one cell kept most MiniWoB tasks to 2 calls.
- `tab.dev.logs` exposed the console, which saved outcome reading.

**Hard:**
- The 61 s first tab open.
- The browser API document is only available after binding a browser.
- Read-only `evaluate` runs in an isolated world, so page globals are invisible.
- `screenshot({clip})` coordinates don't match `getBoundingClientRect`.
- `locator(selector, {hasText})` silently ignores `hasText`.
- REPL block-scope persistence (`var` inside a block doesn't survive to the next cell).
- Locator waits are capped at 3 s, so longer waits need hand-written loops.

**Couldn't do:**
- Read `WOB_*` globals directly, including `WOB_REWARD_REASON`.
- Read an `<h1>` on example.com, because the live page has none.

## Other notes

- Before my run started, the pw seat reported that its tab had been inactive during 19:32–19:37Z. That was not me: I had not touched Chrome before GO, which arrived at about 19:44Z.
