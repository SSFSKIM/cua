# #374's live check: Show Menu confirmed, or menuUnconfirmed

This is a hosted kit for the macOS engine's perform_secondary_action "Show Menu" (AXShowMenu). The engine answers
success only once a menu is seen to open within 1 s, and `menuUnconfirmed` otherwise. The design is the native engine
spec's Decision Log entry for #374. The kit is disposable experiment code, not product code. It runs only on
GitHub-hosted macOS runners. A push to `probe/374-measure` that touches the kit (`scripts/probe-374/**` or the
workflow) is the smoke run (reps 1, labelled smoke). It is also what registers the workflow: a dispatch-only workflow
that exists only on a non-default branch gets no workflow ID, so `gh workflow run` cannot find it. Once the workflow is
registered, the measurement is a dispatch by its ID: `gh workflow run <id> --ref probe/374-measure -f reps=10`, with the
ID from `gh api repos/SSFSKIM/cua/actions/workflows --jq '.workflows[] | select(.path==".github/workflows/probe-374.yml") | .id'`.
**It has not run:** GitHub Actions is billing-locked as of 2026-11-15.

## What runs

There is one job per app family and engine: 5 families × {candidate, control} = 10 jobs. The candidate is the fix
(`CANDIDATE_REF`, fc2711e3). The control is main before it (`CONTROL_REF`, b99232de), and it shows the defect: ok
answered with no menu. Each job builds its engine on the runner, then `measure.mjs` takes the following steps for
every cell, in two placements (`foreground`: the app frontmost; `background`: a TextEdit document frontmost, shared
mode), `reps` times each:

1. Close any menu (`oracle.swift close`: AXCancel on the app's AXMenu children, then Escape) and reset the page.
2. Observe the app (`get_app_state`) and find the target by its label. Record whether it offers AXShowMenu.
3. Read the oracle (`menus`: the process's on-screen windows at the pop-up menu level, its AXMenu children, and the
   focused element's role and its parent's).
4. Send `perform_secondary_action {element, action: "Show Menu"}`.
5. Read the oracle again at once, and the fixture page's state about 250 ms later.

Each row (`rows.jsonl`) holds the answer (`ok` or the error name), the engine's `cua/menu` record (seen, openBefore,
polls, ms, actionError, unreadBefore), the wall time, both oracle readings and the page's state before and after.
`judge.mjs` (tested offline: `node --test scripts/probe-374/judge.test.mjs`) classes each row against the oracle and the
page, never against the answer, and writes `summary.md` and `summary.json`.

## Cells

| family | cell | target | what it is | expected answer (candidate) |
|---|---|---|---|---|
| AppKit (fixture app, `appkit.swift`) | native | "Fixture text", an NSTextView | AppKit's own text menu | ok, seen `application` |
| | popup | "Fixture popup", an NSPopUpButton | the button's menu | ok, seen `element` or `application` |
| | ignored | "Ignored menu", a view that takes AXShowMenu and shows nothing | the app that ignores the request | `menuUnconfirmed`, no menu |
| | blocking | "Blocking menu", a view that runs its menu inside the action | AXShowMenu answered only when the menu closes | ok, `actionError` −25204 (cannotComplete) |
| Chrome for Testing (pinned), Electron (the repo's pinned `electron`, `electron/main.js`), Firefox, Safari | native | a textarea with no handler (`page.mjs`) | the browser's own context menu (Electron's through its `context-menu` handler) | ok, seen `application` |
| | aria | a button whose contextmenu handler cancels the browser's menu and opens a role=menu, focus on its first item | a page's ARIA menu | ok, seen `focus` |
| | own | a button whose handler cancels the browser's menu and draws plain elements, no role, no focus | **the negative control**: a Docs-style page's own menu | `menuUnconfirmed`, with the page's contextmenu counter risen |

Office and LibreOffice are not on the hosted image, so they are not covered here (the issue says "where available").

## What it must show

These hold on the candidate's jobs. The control's jobs are expected to fail item 1 on the ignored, own and (if the
reading holds) blocking cells, which is the defect.

1. **No false ok anywhere** (`falseOk` 0 in every cell and placement): no ok answer without a menu open by the
   oracle's reading, or by the page's for the aria cell. This is the gate.
2. **The negative control:** every `own` row is `menuUnconfirmed`, and its page counter rose, so the request reached
   the page and the page drew its own menu. A browser that opens its own menu despite preventDefault shows up as
   `falseUnconfirmed`, and so does the engine failing to see it.
3. **The ignored request:** every AppKit `ignored` row is `menuUnconfirmed`, with the view's own count showing that
   the action arrived.
4. **Native menus confirmed:** every `native` and `popup` row where the oracle saw a menu answers ok
   (`falseUnconfirmed` 0), with `cua/menu.ms` p95 well inside the 1 s wait. In the background placement, a menu that
   does not stay open (Chromium on an unfocused window, the Linux gate's finding) is `honestUnconfirmed`, not a
   failure. The table separates it.
5. **ARIA menus:** ok through `focus` in Chrome for Testing, Electron and Safari. A family that does not expose the
   ARIA menu as an AXMenu, or does not move the focus into it, answers `menuUnconfirmed`. That makes the cell a stated
   limit (`limit`), never a false ok, and the limit is then written into the Decision Log.
6. **The cannotComplete reading** (Decision Log #374 item 4, unverified until this run): the `blocking` cell shows
   `actionError` −25204 and ok with the menu open. If it shows success instead, the reading is refuted, and the
   fallback costs nothing. The native and popup cells show whether AppKit's own text and popup menus block the same
   way.
7. **Show Menu offered:** a family whose element offers no AXShowMenu is reported as `limit` (`notOffered`), with
   the actions it does offer in the row.
8. **The wait's cost:** `menuUnconfirmed` rows' `ms` sits at 1000 to 1100. On ok rows, the time to the first
   sighting is reported per family.

The gate line at the end of each job's log (`gate {...}`) and `summary.md` give the verdict per cell: `pass`, `fail`
(any false ok), `limit`, or `review` (mixed classes, for a reader). The artifacts are `probe-374-<family>-<engine>`.
