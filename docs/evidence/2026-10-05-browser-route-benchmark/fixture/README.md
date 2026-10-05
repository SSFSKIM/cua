# Bench browser fixture

Serve with `node serve.mjs` (http://127.0.0.1:48731, no dependencies). Every
request is logged with a timestamp to `access.log`; `POST /submit` bodies are
appended to `submissions.log`. The same server also serves MiniWoB++ under
`/miniwob/` (see the MiniWoB++ block below).

## Pages and element ids

### index.html — "Bench Home"
- `#bench-id` — visible text `BENCH-2026-10-05`
- `#inventory` — table, 12 rows (Name, Qty, Unit price)
- `#to-frame` — link to `frame-host.html`
- `#graph` — 480x240 canvas, 6 bars drawn in JS, no labels in the DOM; caption `#graph-caption` "Bars A–F from left to right"
- `#late` — inserted by JS 8 s after `load` (inside `#late-container`), text `LATE-7f3a`
- `#draw` — 400x300 canvas; mouse drag draws a rectangle; on mouseup `#draw-result` gets `x,y,w,h` (canvas-relative integers, normalized so w,h >= 0)

### frame-host.html — "Bench Frame Host"
- paragraph "Nested form below"
- `#outer` — iframe, src `frame-form.html`, 600x500

### frame-form.html (inside `#outer`)
- `#qty-a`, `#qty-b`, `#qty-c` — number inputs
- custom dropdown: `#dropdown` container, `#dropdown-toggle` (opens/closes on click), `#dropdown-list` listbox with `[role=option]` items Alpha, Bravo, Charlie, Delta; closes on choice or outside click; chosen value shown in `#pick`
- radios `name=shape`: square, circle, triangle
- `#phrase` — text input
- `#submit` — submit button; computes `${a+b+c}-${pick}-${shape}-${phrase.length}` into `#result` and POSTs it (text/plain) to `/submit`
- `#inner` — iframe, src `frame-inner.html`, 300x120

### frame-inner.html (inside `#inner`)
- `#deep` — text input; each keydown appends `event.key` to `#deep-log` (case observable)
- `#deep-echo` — mirrors the input's value

## Ground truth
| Question | Answer |
|---|---|
| Inventory total (sum of qty x unit price) | 1437.50 |
| Tallest bar | D (4th from left) |
| Late element text | LATE-7f3a |
| Form code for qty 12, 7, 23; Bravo; circle; phrase "nested keys" | 42-Bravo-circle-11 |
| Bench id | BENCH-2026-10-05 |

Bar heights (px): A 90, B 120, C 70, D 210, E 100, F 60.

## MiniWoB++ block

Source: shallow clone of https://github.com/Farama-Foundation/miniwob-plusplus
at `/tmp/bench-browser/miniwob-plusplus` (commit `33c3b4d`, 2026-08-13). Its
`miniwob/html/` directory is served under `/miniwob/`, so task pages are at
`/miniwob/miniwob/<task>.html` and their `../core/` and `../common/` assets
resolve to `/miniwob/core/` and `/miniwob/common/`.

### Served patch (the clone on disk is unmodified)
`serve.mjs` rewrites MiniWoB `.js` and `.html` files as it serves them, so no
agent has to run page JS to set anything up:
1. Every `EPISODE_MAX_TIME = <n>` assignment, the `core.js` default and each
   task's override, becomes `180000`. Each episode has 180 s.
2. The first line of `core.startEpisodeReal` in `core/core.js` becomes
   `if (/[?&]seed=([^&]+)/.test(location.search)) Math.seedrandom(decodeURIComponent(RegExp.$1));`
   This makes the task instance depend only on the `?seed=` URL parameter.

### Seed convention
The harness loads each task as `?seed=bench-<taskname>`. Two fresh loads with
the same seed give an identical task DOM, checked for all 15 tasks in headless
Chrome. A different seed gives a different instance.

| Task | URL |
|---|---|
| click-button | http://127.0.0.1:48731/miniwob/miniwob/click-button.html?seed=bench-click-button |
| click-checkboxes | http://127.0.0.1:48731/miniwob/miniwob/click-checkboxes.html?seed=bench-click-checkboxes |
| click-dialog | http://127.0.0.1:48731/miniwob/miniwob/click-dialog.html?seed=bench-click-dialog |
| click-link | http://127.0.0.1:48731/miniwob/miniwob/click-link.html?seed=bench-click-link |
| click-option | http://127.0.0.1:48731/miniwob/miniwob/click-option.html?seed=bench-click-option |
| click-tab | http://127.0.0.1:48731/miniwob/miniwob/click-tab.html?seed=bench-click-tab |
| enter-text | http://127.0.0.1:48731/miniwob/miniwob/enter-text.html?seed=bench-enter-text |
| enter-password | http://127.0.0.1:48731/miniwob/miniwob/enter-password.html?seed=bench-enter-password |
| focus-text-2 | http://127.0.0.1:48731/miniwob/miniwob/focus-text-2.html?seed=bench-focus-text-2 |
| drag-box | http://127.0.0.1:48731/miniwob/miniwob/drag-box.html?seed=bench-drag-box |
| drag-items | http://127.0.0.1:48731/miniwob/miniwob/drag-items.html?seed=bench-drag-items |
| scroll-text | http://127.0.0.1:48731/miniwob/miniwob/scroll-text.html?seed=bench-scroll-text |
| use-slider | http://127.0.0.1:48731/miniwob/miniwob/use-slider.html?seed=bench-use-slider |
| simple-algebra | http://127.0.0.1:48731/miniwob/miniwob/simple-algebra.html?seed=bench-simple-algebra |
| email-inbox-delete | http://127.0.0.1:48731/miniwob/miniwob/email-inbox-delete.html?seed=bench-email-inbox-delete |

### Starting an episode
On load, every page shows a full-page `#sync-task-cover` labelled START. No
task exists yet: `#query` is empty and the clock is not running. Click
`#sync-task-cover` (or call `core.startEpisodeReal()`) to start. That
generates the seeded problem, with the instruction in `#query` and the
widgets in `#area`, and starts the 180 s timer. A timeout ends the episode
with reward -1 and `WOB_REWARD_REASON = 'timed out'`.

When an episode ends, the START cover comes back. The outcome globals keep
their values until the next start. Clicking START again begins a new episode
and resets the globals, so read the outcome before re-clicking START.

### Reading the outcome (names verified in `core/core.js`)
- `WOB_TASK_READY`: `true` by default. None of these 15 tasks overrides it.
- `WOB_DONE_GLOBAL`: `true` once the episode has ended (success, failure or timeout).
- `WOB_REWARD_GLOBAL`: the reward, time-discounted.
- `WOB_RAW_REWARD_GLOBAL`: the reward before the time discount.
- `WOB_REWARD_REASON`: `'timed out'` on timeout, otherwise usually null or undefined.
- `WOB_EPISODE_ID`: the number of episodes completed on this page.

**Success = `WOB_DONE_GLOBAL && WOB_RAW_REWARD_GLOBAL === 1`.** Do not test
`WOB_REWARD_GLOBAL === 1`. Every success path in these tasks calls
`core.endEpisode(r, true)`, which sets
`WOB_REWARD_GLOBAL = r * max(0, 1 - elapsed / EPISODE_MAX_TIME)`, so it is
below 1.0 on success. For example, it read 0.889 after a correct click at
about 20 s. A wrong answer or a timeout gives -1. click-checkboxes alone can
produce a fractional raw reward: per-box +1 or -1, averaged.
