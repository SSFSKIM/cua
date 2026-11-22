# Probe 453: can a click on an app's own overlay window be delivered to that window?

Hosted measurement kit for #453, on #337's (`scripts/probe-337/`, the omnibox popup opened with ⌘L and typed text) and
#458's (`scripts/probe-458/tool.swift` on `probe/458-qual`: the kit's own click and the key-window watch). It is
disposable and not a ci-kit gate. Workflow: `.github/workflows/probe-453.yml`, dispatched with an exact engine SHA; the
engine is built unmodified from it. The engine observes and opens the overlay; the kit delivers the click itself.

Each row, on stable Google Chrome at (400, 30, 620×720) or TextEdit at the same frame:
1. A re-set: Escape twice, the page reloaded, the web area focused; the app made frontmost, or a cover raised at
   (0, 40, 380×300) so the app sits behind it, uncovered (TextEdit for Chrome, Finder for TextEdit).
2. One observation; the overlay opened (omnibox: ⌘L and `type_text` of `http://127.0.0.1:<port>/results-` through the
   engine, with `/results-alpha` and `/results-beta` typed into the profile's history at launch; datalist: the field
   focused and `ap` typed; permission: a geolocation prompt on a fresh origin; popover: AXPress on TextEdit's colour well).
3. A re-observation (the screenshot the click is placed in), then the overlay's AX surfaces read (`rows`, `omnibox`).
4. The overlay sampled until the click, 1, 2 or 3 s after the re-observation (`life`: its window and its AX rows).
5. The hit at the point read just before the click (`identify`), then one delivery, with the window list and the
   person's key and main window (the cover's; Chrome's own when frontmost) watched through it.

Deliveries (`deliver.mjs`'s header has the detail): `engine` (the engine's own click, the baseline), `post` (the
engine's mouse recipe stamped with the overlay's window number and a point local to it), `postAct` (the same inside
route 3's subtype 1 and 2), `postMove` (a stamped mouse-moved first), `axpress` and `axpick` (the AX action on the hit's
first ancestor listing it), `hid` (a person's click, frontmost only). Timing cells `idle` and `type` sample the omnibox
popup for 3 s after the observation, `type` typing one more character through the engine at 1 s.

Reader: `node scripts/probe-453/summary.mjs <results.json>`.

## Results, engine 1a1956b2b7f749ccd1f8389fdc31566cd7b79a35 (main)

All runs: Google Chrome 157.0.8103.79, macOS 26.7.2 (25G332), image 20261117.0516.1. Artifacts are in
`~/.local/share/probe-453/run-<id>/` on the MacBook.
- Smoke: https://github.com/SSFSKIM/cua/actions/runs/44958182152 (kit 7a3a45f2, 1 rep, 48 rows).
- Run B: https://github.com/SSFSKIM/cua/actions/runs/44966589829 (kit 8e49cff3, 6 reps, 288 rows). It supplies the
  datalist, popover and permission rows. Its omnibox rows are superseded: the row picked had become the default match,
  which Chrome prerenders, so its page loaded before the click and the kit saw no load. After every kit delivery there
  (72/72) the address field showed the row's URL with the popup closed.
- Run C: https://github.com/SSFSKIM/cua/actions/runs/44971146877 (kit 36991103, 6 reps, 192 rows: omnibox and
  permission). It beacons prerender activation and clicks a non-default history row.
- Run D: https://github.com/SSFSKIM/cua/actions/runs/44974557415 (kit f3794464, 6 reps, 54 rows: the engine's element
  click, every overlay and mode).

### Q1. The omnibox popup: a click posted to the popup's own window (run C; `engineElement` from run D)

The row clicked is always a non-default history row (`/results-alpha` or `/results-beta`, row 2 of 3 or 4 of 4). "Taken"
means the page that row names loaded in the tab (6/6 by its load beacon, 0 by the address field alone). In the "beneath"
column, a hit would be a pointer event on the observed page. "Over the cover" means the browser window was listed in
front of the cover's window. "Reordered" means windows on screen at the start changed their order relative to each
other. "Key window" means the person's AXFocusedWindow or AXMainWindow changed: the cover's when Chrome is behind,
Chrome's own when it is frontmost. The click came 1.1 to 3.2 s after the observation.

| delivery | shared-behind (TextEdit frontmost) | shared-front | dedicated-behind |
|---|---|---|---|
| engine coordinate click (baseline) | refused `appWindowOverPoint` 6/6 | refused 6/6 | refused 6/6 |
| `post`: down/up stamped with the popup's window number, popup-local point, postToPid | **taken 6/6** | **taken 6/6** | **taken 6/6** |
| `postAct`: the same inside subtype 1/2 stamped with the browser window | taken 6/6 | (Chrome active: `post` is the recipe) | taken 6/6 |
| `postMove`: a stamped mouse-moved 200 ms first (with subtype 1/2 behind) | taken 6/6 | taken 6/6 | taken 6/6 |
| `axpress`: AXPress on the row's AXStaticText (one up the hit's chain) | **taken 6/6** | **taken 6/6** | **taken 6/6** |
| `axpick` (no element in the popup lists AXPick; performed on the AXPress one) | AXError 0, nothing 6/6 | nothing 6/6 | nothing 6/6 |
| `hid`, a person's click (control) | n/a | taken 6/6 | n/a |
| `engineElement`: the engine's element click on the observation's node for the row (run D) | refused `backgroundClickRefused` 6/6 | taken 6/6 (route 3) | taken 6/6 (route 3), **Chrome's window raised over the cover 6/6** |

Side effects of every kit delivery (post, postAct, postMove, axpress, axpick; 84 rows), all at 0:
- reached the browser window beneath: 0/84;
- frontmost app changed: 0/84 (TextEdit stayed frontmost in the behind cells);
- browser window over the cover: 0/84;
- windows reordered: 0/84;
- the person's key or main window changed: 0/84.

The engine's element click in dedicated-behind left TextEdit frontmost but listed Chrome's browser window over the cover
for the rest of the watch (about 2.3 s), 6/6. Its other cells moved nothing.

On run B's prerendered default row, every kit delivery (post 18, postAct 12, postMove 18, axpress 18) left the address
field showing the row's URL with the popup closed, 72/72. The person's click did the same, 6/6. Nothing reached the
page beneath, 0/72.

### Q2. The other overlays #452 refuses (runs B and C; `engineElement` from run D)

| overlay | mode | engine coordinate | `post` to the overlay's window | `postAct` | `axpress` | `hid` | `engineElement` |
|---|---|---|---|---|---|---|---|
| datalist (Chrome, layer 999) | shared-front (it shows only frontmost) | refused 6/6 | **taken 6/6** (`apricot` written to the field) | n/a | **nothing 6/6** (AXPress on the row's AXStaticText answers 0, the popup stays) | taken 6/6 | taken 6/6 (route 3) |
| permission bubble (Chrome, layer 0) | shared-behind | refused 2/2 | **taken 4/4** (Never allow: geolocation code 1) | taken 6/6 | taken 5/5 | n/a | **posted, nothing 6/6** (route 3; the bubble stays, no decision) |
| permission bubble | dedicated-behind | refused 3/3 | taken 5/5 | taken 3/3 | taken 5/5 | n/a | posted, nothing 4/4 |
| TextEdit colour-well popover (layer 0; an AXPopover in the document window's tree) | shared-behind (Finder frontmost) | refused 6/6 | **nothing 6/6** (the popover stays, the colour unchanged) | **dismissed 6/6** (closed, unchanged) | **taken 6/6** | n/a | taken 6/6 (route 3) |
| popover | shared-front | refused 6/6 | taken 6/6 | n/a | taken 6/6 | taken 6/6 | taken 6/6 (route 1) |
| popover | dedicated-behind | refused 6/6 | nothing 6/6 | dismissed 6/6 | taken 6/6 | n/a | taken 6/6 (route 3) |

Notes:
- The permission prompt showed in 33 of 96 rows (runs B and C); the counts above are those rows.
- Every kit delivery here reached nothing beneath, changed no frontmost app, raised nothing over the cover and changed
  no key or main window: 0 in every cell.

### Q3. Element targets: are the rows in AX?

- **Omnibox popup.**
  - Its own AXWindow (subrole AXUnknown) holds one AXWebArea titled "Omnibox Popup", 144/144 rows.
  - Each suggestion is an AXStaticText of 426×40 that lists `AXPress, AXShowMenu, AXScrollToVisible` and none lists
    AXPick. The row's text is its title, URL, kind and position, e.g. `probe453 /results-alpha
    http://127.0.0.1:…/results-alpha location from history, press Tab then Enter to Remove Suggestion., 4 of 4`.
  - The address field (AXTextField "Address and search bar") has no children. Its only element-valued attributes point at
    itself (AXEditableAncestor, AXFocusableAncestor, AXHighestEditableAncestor), so nothing links it to the popup.
- **The observation already holds them.** On 1a1956b2, get_app_state's tree has the popup's nodes: 29 to 32 nodes
  whose centre lies in the popup (AXWebArea, AXList, AXStaticText), and a node at the picked row's exact frame carrying
  its text, 126/126 omnibox rows (runs C and D). This corrects #337's reading on d44a4fe1 (0/19).
  - The datalist's rows (AXStaticText, AXPress) are nodes too, 6/6. So are the bubble's AXButtons, 26/26, and the
    popover's swatches (AXButton "rgb …", in the document window's tree), 18/18 (run D; runs C and D for the bubble).
- **AXPress takes the omnibox row behind and frontmost** (18/18), the permission button (10/10) and the popover swatch
  (18/18). It does not take the datalist row (0/6).
- The engine's own element click on those nodes (run D) takes the row in shared-front and dedicated-behind. In
  shared-behind it is refused `backgroundClickRefused`, Chromium's background-web-area rule, since the popup is a web
  area. In dedicated-behind it raises Chrome's window over the person's. On the permission bubble it posts and does
  nothing (0/10).

### Q4. Identity: is the row under the point the one the screenshot showed?

Just before the click (1.1 to 3.2 s after the observation), three application hit-tests at the point, 40 ms apart:
- **Omnibox.** The first answer is the popup's AXWebArea, the second and third the row's AXGroup (`AXWebArea > AXGroup >
  AXGroup`, 108/108, run C), so a single hit-test is not enough.
  - The hit's window is the popup's (108/108).
  - The element at the picked frame up the chain carries the same text as the row picked from the observation-time tree,
    and the same frame: 108/108.
  - The popup's window number was the same as at the observation: 108/108.
- **The other overlays.**
  - Datalist (24/24): the row's AXStaticText ("apricot") at the same frame.
  - Permission (16/16): the AXButton "Never allow" at the same frame.
  - Popover (72/72): the swatch AXButton (its "rgb …" description) at the same frame. Its hit window is the document
    window's, since the popover lives in that tree.
- **What the observation would need.** The rows are already in the observation's tree with their text and frames (Q3).
  A recheck at click time can compare the recorded node to the hit: text and frame both matched in every row measured
  here. The CG window list gives the overlay's number and bounds for the stamp, read just before the post.

### Q5. Cost and timing

- **Lifetime.** No overlay closed or changed between the observation and the click: 0 window changes, 1 row layout in
  every delivery row, 345 rows over runs B and C, clicks 1.1 to 3.4 s after the observation. With no typing, the
  omnibox popup held still for 3 s, 36/36 idle rows: its window number, bounds, alpha and rows were unchanged.
- **Re-layout while typing.** One more character typed through the engine 1 s into the sample (36 rows):
  - the rows re-laid out 2 to 4 times;
  - the first change came 2 to 114 ms after typing started (p50 25 to 52 across the two runs);
  - the last came at 132 to 346 ms (p50 about 245);
  - the window's bounds changed once (7 rows to 6), and its number never did.
- **Costs**, measured by the kit:
  - a full AX read of the popup's rows: 14 to 18 ms on average per read, 45 ms at most;
  - one hit-test chain with text: about 20 ms (p50), 40 at most;
  - the kit's AXPress, found and performed: about 10 ms (p50), 94 at most;
  - the window-list read for the stamp: under 1 ms;
  - the kit's post: about 1 ms (p50), 19 at most (425 to 560 ms with postMove's waits).

### Reading (evidence for the design, not a decision)

- **Deliver by post.** A post stamped with the overlay's own window number and a point local to it takes the item in
  every Chrome overlay and every mode measured:
  - omnibox 18/18 (plus 72/72 on the prerendered row);
  - datalist 6/6;
  - permission 9/9.

  It moves nothing of the person's in any of them. Route 3's subtype 1/2 adds nothing for Chrome. For TextEdit's popover
  a background post does not take: 0/12, the popover stays, and with subtype 1/2 it is dismissed. So post-delivery is
  per app. The engine would need the overlay's number and bounds at click time, and the hit chain to confirm the item.
- **Expose rows as elements.** On 1a1956b2 the observation already carries every overlay's items as nodes, with text
  and frame. The engine's element click on them takes the omnibox row, the datalist row and the swatch where the
  element route runs. It fails in three places:
  - the omnibox in shared-behind: refused by the background-web-area rule;
  - the permission bubble in both behind modes: posted, nothing happened (10/10);
  - dedicated-behind: Chrome's window raised over the person's (6/6).

  AXPress through the kit takes the omnibox row, the permission button and the swatch in every mode. It does not take
  the datalist row (0/6).
- **Keep the refusal.** It is exact today (every coordinate click on an overlay refused, 0 misdeliveries). But the model
  can already reach the same items through their tree nodes, and the element route's behaviour on them is uneven: it
  takes, refuses, raises or silently does nothing depending on the overlay and mode. That holds whichever of the other
  two is chosen.
- **What favours each.**
  - AXPress on the node is the only delivery that took the item behind for every overlay but the datalist.
  - The post is the only one that took the datalist, and it takes every Chrome overlay in every mode.
  - A combined rule fits all 0-side-effect cells measured: AXPress where the node lists it, else the stamped post.
    Its one known miss is the datalist row, which lists AXPress and does nothing (frontmost only, where a post takes it).

## #453 qual: main 5580ac20 against fix/453-overlay-click (smoked, paused)

State on 2026-11-22: **two smokes run (reps 1, preview only), kit fixed after them, the changed cells not yet
re-smoked; paused** while the design session decides whether to park #453 again (the focused review of the fix found
P1s). No counted run. Main is 5580ac20 (#443 included); the fix head smoked is 07d487d8.

Kit: `qual453.mjs` (its header lists the cells), reader `qual-reader.mjs`, the workflow `probe-453.yml` with
`kit: qual453` and a `label`. Dispatch one engine head per run. Pass `reps` empty for each cell's own row count (191
rows); the input's default of 6 caps them. A smoke is `reps: 1`, 34 rows, about 6 minutes of measuring. What it does
that `deliver.mjs` did not:
- Every click is the engine's own: a coordinate click, an element click by the node's token, a forced route
  (`spikeRoute: '3'`) or a drag.
- The item is picked from the engine's observation, from its nodes inside the overlay's CG window. The kit makes no
  hit-test or AX row read before the click, because Chromium's first hit-test answers the web area and a kit hit-test
  would prime the engine's.
- The `<datalist>` opens by the engine's click on the field's arrow (#463's AXPress behind), so it is measured behind too.
- The permission cells read the origin's state after the click (`navigator.permissions`, beaconed), Allow and Block.
- Frontmost is `lsappinfo front`, read back to back for 4 s (transient and end), beside the key-window watch and the
  window list.
- The element click by ID on an overlay row is a parity cell (`p-element`), expecting main's answer: ruling 1066 cut
  #470 from the fix.

### Smokes (preview, reps 1; Chrome 157.0.8103.79, macOS 26.7.2, image 20261117.0516.1)

- Fix 07d487d8, kit 64d595cd: https://github.com/SSFSKIM/cua/actions/runs/45045858141 (34 rows).
- Main 5580ac20, kit 0a7fc83a: https://github.com/SSFSKIM/cua/actions/runs/45047231711 (34 rows).

What they showed (one row per cell, so a direction, not a count):
- **Fix, delivered and taken:** omnibox row by coordinate (3 modes, route 2′, `closed`), datalist row (3 modes; it
  opens behind by the arrow click), geolocation Block (2 behind modes), TextEdit popover swatch (3 modes, AXPress
  `closed`). Main refused every one `appWindowOverPoint`.
- **Re-laid-out (cell 6):** the fix refused `textChanged` 3/3, main `appWindowOverPoint` 3/3. No other row taken.
- **Fix, the browser window listed over the cover's in every Chrome behind row it delivered** (10/10: omnibox,
  datalist, permission, shared-behind and dedicated-behind), from about 20 to 80 ms into the click to the end of the
  3 s watch, the window order changed. The key window did not change; frontmost changed in one row, the first
  geolocation Allow (Chrome to the front at 241 ms, read as Location Services' doing, see the kit fixes). Main's refusals moved nothing;
  `deliver.mjs`'s own stamped post took the same rows with 0/84 raised (run C), so the engine's delivery differs from
  the kit's there. TextEdit's popover (AXPress) raised nothing. The p-font row (#458, route 3 AXPress) lists the
  window over the cover for about 35 ms on both heads.
- **Parity:** p-page and p-underclosed clicked, p-forced and p-drag refused `appWindowOverPoint`, p-inputlist and
  p-font opened, on both heads. The element click (fix 07d487d8 still carrying #470): the fix refused omnibox and datalist rows
  `textChanged` and took the permission button by post; main refused the omnibox row behind (`backgroundClickRefused`),
  took it by route 3 front and dedicated (dedicated: the window over the cover), dismissed the datalist row behind and
  took it front and dedicated.
- No row reached the page beneath on either head.

Kit fixes after the smokes (kit 0a7fc83a, then the head of this branch):
- **Permission: geolocation replaced by Web MIDI.** The runner's macOS has Location Services off: Chrome answers
  geolocation's Allow with the state `denied` and a "Location is turned off in system settings" bubble (the "Allowed"
  chip shows: Allow was taken, the kit read `wrongRow:block`), and the first Allow brought Chrome to the front. MIDI's
  prompt ("Block", "Allow") has no macOS layer. Its Block label is read whole as `Block | Block` (the regex fixed after
  the main smoke).
- **Permission frontmost:** the engine observes the prompt as the window itself (it is Chrome's focused window), so no
  overlay lies over the observed window. The row now runs as a plain click in that window (`observedIsOverlay`).
- **Unknown kind (p-unknown):** Chrome 157 lists no site information button for `http://127.0.0.1`; the cell opens
  Tab search's bubble by the engine's click on its toolbar button and clicks one of its items.
- The tool's `overlay` op also answers a window of the app's listed behind the observed one (`behind`, marked
  `overlayListedBehind`); the smokes needed it nowhere.

Left before the counted runs:
- Re-smoke the changed cells on both heads (`only: permission,siteinfo`): MIDI's prompt behind and frontmost, the
  Allow and Block reading, and Tab search as the unknown kind.
- Then the full runs, main 5580ac20 and the fix head the coordinator names (each under 500 rows), and #443's
  `decomove` rows on the fix head through `probe/443-qual` (CfT and Electron, `controlGone` expected, plus a couple of
  #433 keep cells as a control). Add the tables here, each labelled with its engine SHA.

## #453 spike: does a bare AXPress on an overlay row activate Chrome or move the person's windows? (ruling 1067)

Engine main `5580ac204f1a2a5cd6a36186d658087060690e5f`, unmodified (observations, and the comparison clicks). Kit
`qual453.mjs --order --spike` (workflow `probe-453.yml`, `kit: qual453`, `flags`), kit d2e5f139:
https://github.com/SSFSKIM/cua/actions/runs/45050307595 (240 rows, 43 min; Chrome 157.0.8103.79, macOS 26.7.2, image
20261117.0516.1). Smoke before it: https://github.com/SSFSKIM/cua/actions/runs/45048772778 (kit c78d1118, 61 rows).

What a row does:
- `axpress`: the kit's bare AXPress on the recorded row's own element. Tool op `pressrow` takes the element under the
  overlay's AX root whose frame lies within 2 pt of the frame the engine's observation recorded for the row, of the
  row's role (it found that role in every row). AXPress goes to exactly that element: no hit-test, no ancestor.
- `click` / `block`: main's coordinate click on the same row (for the permission prompt, its Block button).
- `kitpost`: `deliver.mjs`'s stamped post (run C), measured in this harness for window order.
- `o-click`, `o-element`, `o-type`, `p-element`: main's own background input, with Chrome behind the cover (ruling 1069).
- The permission prompt is Web MIDI's: Allow on every third AXPress row, Block otherwise.

Per row:
- Frontmost: `lsappinfo front`, read back to back for 4 s from the click.
- The person's key and main window, read every 5 ms: the cover's, or Chrome's own when Chrome is frontmost.
- The window list every 10 ms: whether Chrome's browser window is listed above the cover's window, at any time
  (transient) and at the end of the 3 s watch.
- The overlay's window, every 10 ms: the time it left, from the click.
- The AXPress's AXError and the time the call took.

| cell | rows | answer | taken | frontmost changed, transient / end | key/main window changed | window over the cover, transient / end | first over, ms after the click (p50) | AXPress result | AXPress ms p50 / max | overlay gone, ms after (p50) | problems |
|---|---|---|---|---|---|---|---|---|---|---|---|
| page/shared-behind/o-click | 10/10 | ok route 3 ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | - | - | - | - |
| page/shared-behind/o-element | 10/10 | ok route 3 ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | - | - | - | - |
| note/shared-behind/o-type | 5/5 | ok route "2'" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - | - |
| page/dedicated-behind/o-click | 10/10 | ok route 3 ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 10/10 / 10/10 | 145 | - | - | - | - |
| page/dedicated-behind/o-element | 10/10 | ok route 3 ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | - | - | - | - |
| note/dedicated-behind/o-type | 5/5 | ok route "2'" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - | - |
| omnibox/dedicated-behind/p-element | 10/10 | ok route 3 ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 10/10 / 10/10 | 30 | - | - | 83 (0 stayed) | - |
| omnibox/shared-behind/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | 0 ×10 | 0 / 2 | 55 (0 stayed) | - |
| omnibox/shared-behind/click | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - (5 stayed) | - |
| permission/shared-behind/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | 0 ×10 | 5 / 11 | 39 (0 stayed) | - |
| permission/shared-behind/block | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - (5 stayed) | - |
| datalist/shared-behind/axpress | 5/5 | ok route "kit AXPress" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | 0 ×5 | 3 / 10 | 40 (0 stayed) | - |
| omnibox/shared-behind/kitpost | 5/5 | ok route "kit post" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | 105 (0 stayed) | - |
| datalist/shared-behind/kitpost | 5/5 | ok route "kit post" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | 32 (0 stayed) | - |
| permission/shared-behind/kitpost | 5/5 | ok route "kit post" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | 34 (0 stayed) | - |
| omnibox/shared-front/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | n/a | - | 0 ×10 | 0 / 2 | 53 (0 stayed) | - |
| omnibox/shared-front/click | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | n/a | - | - | - | - (5 stayed) | - |
| permission/shared-front/axpress (prompt observed as the window) | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 10/10 | n/a | - | 0 ×10 | 9 / 32 | 63 (0 stayed) | - |
| permission/shared-front/block (prompt observed as the window) | 5/5 | ok route 3 ×5 | 5/5 | 0/5 / 0/5 | 5/5 | n/a | - | - | - | 61 (0 stayed) | - |
| datalist/shared-front/axpress | 5/5 | ok route "kit AXPress" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | n/a | - | 0 ×5 | 2 / 5 | 33 (0 stayed) | - |
| omnibox/dedicated-behind/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | 0 ×10 | 1 / 1 | 65 (0 stayed) | - |
| omnibox/dedicated-behind/click | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - (5 stayed) | - |
| permission/dedicated-behind/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | 0 ×10 | 3 / 8 | 33 (0 stayed) | - |
| permission/dedicated-behind/block | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - (5 stayed) | - |
| datalist/dedicated-behind/axpress | 5/5 | ok route "kit AXPress" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | 0 ×5 | 2 / 7 | 37 (0 stayed) | - |
| omnibox/dedicated-behind/kitpost | 5/5 | ok route "kit post" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | 71 (0 stayed) | - |
| datalist/dedicated-behind/kitpost | 5/5 | ok route "kit post" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | 26 (0 stayed) | - |
| permission/dedicated-behind/kitpost | 5/5 | ok route "kit post" ×5 | 5/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | 40 (0 stayed) | - |
| popover/shared-behind/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | 0 ×10 | 7 / 12 | 104 (0 stayed) | - |
| popover/shared-behind/click | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - (5 stayed) | - |
| popover/shared-front/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | n/a | - | 0 ×10 | 13 / 25 | 145 (0 stayed) | - |
| popover/shared-front/click | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | n/a | - | - | - | - (5 stayed) | - |
| popover/dedicated-behind/axpress | 10/10 | ok route "kit AXPress" ×10 | 10/10 | 0/10 / 0/10 | 0/10 | 0/10 / 0/10 | - | 0 ×10 | 11 / 22 | 98 (0 stayed) | - |
| popover/dedicated-behind/click | 5/5 | appWindowOverPoint ×5 | 0/5 | 0/5 / 0/5 | 0/5 | 0/5 / 0/5 | - | - | - | - (5 stayed) | - |

- permission state after: shared-behind/axpress allow->-/granted ×4; shared-behind/block block->-/- ×5; shared-behind/kitpost block->-/NotAllowedError ×5; shared-front/axpress allow->-/granted ×4; shared-front/block block->-/NotAllowedError ×5; dedicated-behind/axpress allow->-/granted ×4; dedicated-behind/block block->-/- ×5; dedicated-behind/kitpost block->-/NotAllowedError ×5; shared-behind/axpress block->-/NotAllowedError ×6; shared-front/axpress block->-/NotAllowedError ×6; dedicated-behind/axpress block->-/NotAllowedError ×6
- wrong row: 0

Notes:
- **Taken.**
  - The omnibox row taken means the page that row names loaded.
  - The permission prompt: Allow is the request granted (12/12), Block is NotAllowedError (18/18).
  - The datalist: the field took `apricot`.
  - The popover: the colour well's value changed.
- **AXPress on the datalist row took it, 15/15.** The bare AXPress goes to the row's own AXStaticText at its recorded
  frame. Run B's "nothing 6/6" pressed the element the kit's hit-test chain found first that lists AXPress.
- **Key window, frontmost permission prompt.** When Chrome is frontmost the prompt is Chrome's own focused window
  (`observedIsOverlay`). Its closing hands the focus back to the browser window, so the key window changes in every row
  that takes it: AXPress 10/10, and main's own route-3 click 5/5. No other app's window changed.
- **The kit's stamped post (`kitpost`) listed the browser window above the cover in 0/30 rows**, the same harness that
  saw the fix's route-2′ post at 07d487d8 list it there in 10/10 (the qual smoke above). The raise comes from the
  engine's path, not from the harness.

Main's own background input, window order (ruling 1069; ruling 1070: a raise fails the bar only in shared mode, in
dedicated mode it is recorded):

| main 5580ac20, Chrome behind the cover | shared-behind: over the cover, transient / end | dedicated-behind: transient / end | first over, ms after the input (p50) |
|---|---|---|---|
| page click by coordinate (route 3) | 0/10 / 0/10 | **10/10 / 10/10** | 145 (dedicated) |
| element click by ID on a page button (answered route 3) | 0/10 / 0/10 | 0/10 / 0/10 | - |
| element click on an omnibox row (route 3) | - | **10/10 / 10/10** | 30 |
| type_text then press_key into a page field (route 2′) | 0/5 / 0/5 | 0/5 / 0/5 | - |

Frontmost and the key window: 0 in every one of these rows. Every input took effect.

### The fix's route-2′ overlay post against the kit's stamped post

The events are built and posted the same way:
- They are made by `NSEvent.mouseEvent` with the overlay's window number, at the global point, button 0, subtype 3
  (field 7).
- Fields 91 and 92 hold the overlay's number, and the window-local point is set through `CGEventSetWindowLocation`
  (`Mouse.swift` `mouseEvent`/`stampWindow`; the tool's `post`).
- One down/up pair, click count 1, pressure 1, each event timestamped and sent by `postToPid` back to back, with no
  activation event around them.

What differs (fix `OverlayClick.swift` `overlayDelivery`/`deliverOverlayClick` at 07d487d8):
- **Flags.** The engine writes the events' flags to 0 (`event.flags = []`). The kit leaves the flags NSEvent made.
- **Event number.** The engine takes it from its own counter (from 1). The kit uses 50 001 upward.
- **Pid.** The engine posts to the owner of the row's element (`ownerPid(of: row)`), the kit to the app's pid. Both are
  Chrome's browser process here.
- **Who posts.** The engine posts from its own process, an AppKit app with the agent cursor. Just before the post,
  `beforeDispatch` runs `cursor.act(window: observedWindow, .click(point))`, which orders the cursor's screen-sized panel
  `.above` the observed browser window at that window's level (`CursorPanel.place`). It also registers the owner as
  driven (`actionTargets`), ends the after-action watch, and arms the settle (`markActed`).
- **Reads around the post** (read-only):
  - just before it, the engine reruns its decision (`revalidate`: AX hit-tests on the overlay and the window list);
  - after it, the engine polls the window list every 20 ms for up to 500 ms.

  The kit made no read before its post.

Which of these lists the browser window over the cover is not settled by this run. The cursor panel alone does not
explain it: main's element click by ID in dedicated-behind places the cursor the same way and raised 0/10, while its
coordinate click raised 10/10. Two kit cells would tell the others apart: the kit post with its flags cleared and the
engine's event numbering, and the kit post sent from inside the engine (a spike route on a probe build).

### Runner fact: Location Services

GitHub's hosted macOS image runs with Location Services off. Chrome answers a geolocation prompt's Allow with the
site's state `denied` and a "Location is turned off in system settings" bubble. The first Allow of the qual smoke
(run 45045858141, shared-behind) brought Chrome to the front 241 ms after the click. That came from Chrome's location
request with the system service off, not from the click's delivery. The permission cells use Web MIDI's prompt for that
reason: it has no macOS layer.

## #453 qual, counted: main 5580ac20 against fix/453-axpress de0d119f (rulings 1040, 1069-1074)

The fix's route (ruling 1071): where main refuses a plain left click with `appWindowOverPoint` on one of four overlay
kinds (omnibox popup, datalist, permission prompt, AppKit popover), the engine presses the recorded row's own handle
with AXPress. The meta is `overlayClick {window, by, kind, route: "action", confirmed}` or `{..., refused}`. The
element-ID route and Chrome's frontmost permission prompt (observed as its own window) are out of scope.

Kit 3326bebf (`qual453.mjs`, reader `qual-reader.mjs`), workflow `probe-453.yml`, `kit: qual453`, `reps: 99`. Chrome
157.0.8103.79, macOS 26.7.2, image 20261117.0516.1.
- Main 5580ac20: https://github.com/SSFSKIM/cua/actions/runs/45061006010 (263 rows, 50 min).
- Fix de0d119f: https://github.com/SSFSKIM/cua/actions/runs/45066234145 (263 rows, 49 min).
- #443's `decomove` and keep cells on de0d119f, through `probe/443-qual` (`probe-443-qual.yml`, `mode: measure`,
  `lanes: cft,electron`, `cells: decomove,plain,overlapinto`, `reps: 10`, the fix as the only engine):
  https://github.com/SSFSKIM/cua/actions/runs/45071184918.

Previews, not counted (reps 1):
- Fix c8858c2a: https://github.com/SSFSKIM/cua/actions/runs/45057158194.
- Fix e7e78424 (the pre-fix comparison for ruling 1076's three ordering fixes):
  https://github.com/SSFSKIM/cua/actions/runs/45058436188.
- Main 5580ac20 on kit 3326bebf: https://github.com/SSFSKIM/cua/actions/runs/45059748139.

What the cells do:
- **Re-laid-out cells.**
  - Omnibox: one character typed through the engine after the observation, 20 rows per mode. Each row records the row
    the screenshot showed at the point, the row the popup held there just before the click (read from its AX rows by a
    tree walk, no hit-test) and the row taken.
  - Datalist: `b` typed, so the list re-filters to banana and blueberry and a neighbour lies at the recorded second
    row.
  - Permission: geolocation's prompt replaces MIDI's in the same place. Chrome changes no shown prompt's buttons, so a
    replaced prompt is the re-layout that can be made.
  - Popover: none could be made. The swatch grid holds still.
- **Unknown kind (p-unknown):** Tab search's bubble. Both heads observe it as Chrome's focused window, so it is a
  parity cell, not an overlay over the window.
- **Observations (ruling 1074):** each `get_app_state` is rendered by the head's own renderer
  (`src/services/engine/render.mjs` of the engine SHA), so the text compared is the model's view. Each also records the
  result's keys and its timings.

### Reading (the fix de0d119f against the bar)

- **Delivered and confirmed, per kind:** only the permission prompt.
  - Permission prompt: 20/20 behind (Allow granted, Block NotAllowedError, `confirmed`).
  - Omnibox: 0/18, refused `notARow` in every mode. At the point, the observation's deepest recorded node is an AXGroup
    of 410×40 inside the row's AXStaticText of 426×40. The AXStaticText is the element the spike's bare AXPress took
    (30/30).
  - Datalist: 0/18, `clickUnconfirmed`, nothing taken. The observation records two AXStaticText "apricot" nodes at the
    same frame, one inside the other.
  - Popover: 0/18, refused `partlyRecorded`. The c8858c2a preview took it 3/3.
- **Shared mode:** frontmost 0/160 (transient and end) and key window 0/160 on both heads. Window over the cover:
  transient 4/106 and end 0/106, all of them #458's TextEdit font pop-up (p-font), as on main (4/106).
- **Dedicated mode (recorded, not failed):** 10/76 raised, all of them main's own route-3 element click (p-element).
  Main shows the same 10/76.
- **Wrong row:** 0/263. The re-laid-out cells refused every row:
  - omnibox 60/60 (`notARow`; the row at the point had changed in 60/60, another row in 58);
  - datalist 18/18 (`notOneOverlay`);
  - permission 12/12 behind (`screenChangedSinceScreenshot`, as main).

  The omnibox route refuses even an unchanged row, so these rows do not yet show what a delivering omnibox route
  would do after a re-layout.
- **False ok:** 0. **False confirmed:** 0. **Refused but taken anyway:** 0. **Reached the page beneath:** 0/164.
- **Parity:** every cell outside the four kinds answers as main, 19/19 cells (table below), including the out-of-scope
  frontmost prompt (27 rows).
- **Observations, fix against main (ruling 1074):**
  - The result's keys are the same, with one new timing key, `screenshotWindowsListedMs` (p50 0.5 ms, p95 1.4 ms).
  - Observation time on the kit's wall clock: p50 80 ms against 107, p95 407 against 430. The engine's `totalMs`: p50
    74 against 99, p95 397 against 419. The fix is not slower: the delta is within run-to-run noise, with no cost
    visible beyond the 0.5 ms read.
  - Parity cells' rendered text (166 observations on each head), after the kit's ports and Chrome's tab memory figures
    are normalised: no line appears only on the fix. 4 lines appear only on main: omnibox suggestion lines whose
    history titles vary per run.
  - Nothing new reaches the model's view: no window owner, layer or bounds appears in the text.
- **#443 on the fix head:** decomove refused `controlGone` 40/40 (CfT 20, Electron 20), the keep cells kept and landed 40/40 (table at the end).

#### main-5580ac20 engine 5580ac204f1a2a5cd6a36186d658087060690e5f  (Google Chrome 157.0.8103.79; ProductName: macOS ProductVersion: 26.7.2 BuildVersion: 25G332; image 20261117.0516.1; kit 3326bebf21fcc05658a2c2fc1d9aa78a1c6ad91b; 263 rows, 50.23 min)

| cell | rows | answer [overlayClick] | effect | frontmost changed, transient / end | key/main window changed | window over the cover, transient / end | beneath | problems |
|---|---|---|---|---|---|---|---|---|
| omnibox/shared-behind/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-element | 5/5 | backgroundClickRefused ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/relayout | 20/20 | appWindowOverPoint ×20 | nothing ×20 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/p-element | 5/5 | ok route 3 ×5 | dismissed ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/relayout | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/allow | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/block | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/p-element | 6/6 | ok route 3 ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/relayout | 6/6 | screenChangedSinceScreenshot ×6 | nothing ×2; dismissed ×4 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-front/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/shared-front/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/shared-front/relayout | 20/20 | appWindowOverPoint ×20 | nothing ×20 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/relayout | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| permission/shared-front/allow (prompt observed as the window) | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 5 | n/a | 0 | - |
| permission/shared-front/block (prompt observed as the window) | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 5 | n/a | 0 | - |
| permission/shared-front/p-element (prompt observed as the window) | 6/6 | ok route 1 ×6 | taken ×6 | 0 / 0 | 6 | n/a | 0 | - |
| permission/shared-front/relayout (prompt observed as the window) | 6/6 | noScreenshotForCoordinates ×6 | dismissed ×6 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/dedicated-behind/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/dedicated-behind/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | 5 / 5 | 0 | - |
| omnibox/dedicated-behind/relayout | 20/20 | appWindowOverPoint ×20 | nothing ×20 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/dedicated-behind/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/dedicated-behind/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | 5 / 5 | 0 | - |
| datalist/dedicated-behind/relayout | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/allow | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/block | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/p-element | 6/6 | ok route 3 ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/relayout | 6/6 | screenChangedSinceScreenshot ×6 | nothing ×3; dismissed ×3 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| page/shared-behind/p-page | 5/5 | ok route 3 ×5 | clicked ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| underclosed/shared-behind/p-underclosed | 5/5 | ok route 3 ×5 | clicked ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-forced | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-drag | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| siteinfo/shared-behind/p-unknown (prompt observed as the window) | 5/5 | ok route 3 ×5 | closed ×5 | 0 / 0 | 0 | 5 / 0 | 0 | - |
| inputlist/shared-behind/p-inputlist | 5/5 | ok route 3 {popUp {"role":"AXComboBox","polls":2,"ms":61.247,"action":"AXPress} ×1; ok route 3 {popUp {"kind":"datalist","effect":"confirmed","polls":2,"ms":44.94} ×1; ok route 3 {popUp {"delivery":"action","ms":92.281,"kind":"datalist","polls":2} ×1; ok route 3 {popUp {"ms":28.858,"action":"AXPress","role":"AXComboBox","kind":"} ×1; ok route 3 {popUp {"polls":2,"kind":"datalist","role":"AXComboBox","ms":44.591} ×1 | opened ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| popover/shared-behind/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| popover/shared-front/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| popover/dedicated-behind/click | 6/6 | appWindowOverPoint ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| font/shared-behind/p-font | 5/5 | ok route 3 {popUp {"role":"AXPopUpButton","polls":3,"ms":108.965,"action":"AXP} ×1; ok route 3 {popUp {"kind":"popUpButton","effect":"confirmed","restored":{"comp} ×1; ok route 3 {popUp {"menuWindow":1509,"action":"AXPress","restored":{"raises":1} ×1; ok route 3 {popUp {"kind":"popUpButton","restored":{"leftCovered":0,"windows":} ×1; ok route 3 {popUp {"role":"AXPopUpButton","kind":"popUpButton","delivery":"act} ×1 | opened ×5 | 0 / 0 | 0 | 4 / 0 | 0 | - |

##### Bar lines

- delivered, confirmed and taken, per overlay cell: omnibox/shared-behind/click 0/6; datalist/shared-behind/click 0/6; permission/shared-behind/allow 0/5; permission/shared-behind/block 0/5; omnibox/shared-front/click 0/6; datalist/shared-front/click 0/6; omnibox/dedicated-behind/click 0/6; datalist/dedicated-behind/click 0/6; permission/dedicated-behind/allow 0/5; permission/dedicated-behind/block 0/5; popover/shared-behind/click 0/6; popover/shared-front/click 0/6; popover/dedicated-behind/click 0/6
- shared: frontmost changed transient 0/160, end 0/160; key or main window changed 0/160; window over the cover transient 4/106, end 0/106 (font/shared-behind/p-font ×4)
- dedicated (recorded, not failed: ruling 1070): frontmost changed transient 0/76, end 0/76; key or main window changed 0/76; window over the cover transient 10/76, end 10/76 (omnibox/dedicated-behind/p-element ×5; datalist/dedicated-behind/p-element ×5)
- wrong row: 0/263
- re-laid-out omnibox: refused appWindowOverPoint ×60, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 60; the list or prompt changed before the click in 60)
- re-laid-out datalist: refused appWindowOverPoint ×18, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 18; the list or prompt changed before the click in 18)
- re-laid-out permission: refused screenChangedSinceScreenshot ×12, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 12; the list or prompt changed before the click in 5)
- omnibox re-laid out, the row at the point: shown in the screenshot vs held now: changed in 60/60 (now no row ×2; another row ×58); pressed/taken: appWindowOverPoint, nothing taken ×60
- false ok (answered ok, not taken): 0
- false confirmed (overlayClick confirmed, not taken): 0
- refused but taken anyway: 0
- reached the window beneath: 0/164
- frontmost prompt observed as the window itself (out of scope, main's click): 27 (permission/shared-front/allow ok route 3 taken ×5; permission/shared-front/block ok route 3 taken ×5; permission/shared-front/p-element ok route 1 taken ×6; permission/shared-front/relayout noScreenshotForCoordinates dismissed ×6; siteinfo/shared-behind/p-unknown ok route 3 closed ×5)
- permission state after: shared-behind/allow allow->-/- ×5; shared-behind/block block->-/- ×5; shared-behind/p-element block->-/- ×3; shared-behind/relayout block->-/- ×6; shared-front/allow allow->-/granted ×5; shared-front/block block->-/NotAllowedError ×5; shared-front/p-element block->-/NotAllowedError ×3; shared-front/relayout block->-/- ×6; dedicated-behind/allow allow->-/- ×5; dedicated-behind/block block->-/- ×5; dedicated-behind/p-element block->-/- ×3; dedicated-behind/relayout block->-/- ×6; shared-behind/p-element allow->-/- ×3; shared-front/p-element allow->-/granted ×3; dedicated-behind/p-element allow->-/- ×3

#### fix-de0d119f engine de0d119f52b981ff29351a57b8fbf5498b4abd72  (Google Chrome 157.0.8103.79; ProductName: macOS ProductVersion: 26.7.2 BuildVersion: 25G332; image 20261117.0516.1; kit 3326bebf21fcc05658a2c2fc1d9aa78a1c6ad91b; 263 rows, 48.8 min)

| cell | rows | answer [overlayClick] | effect | frontmost changed, transient / end | key/main window changed | window over the cover, transient / end | beneath | problems |
|---|---|---|---|---|---|---|---|---|
| omnibox/shared-behind/click | 6/6 | appWindowOverPoint [omniboxPopup refused notARow] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-element | 5/5 | backgroundClickRefused ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/relayout | 20/20 | appWindowOverPoint [omniboxPopup refused notARow] ×20 | nothing ×20 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/click | 6/6 | clickUnconfirmed [datalist action unconfirmed] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/p-element | 5/5 | ok route 3 ×5 | dismissed ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/relayout | 6/6 | appWindowOverPoint [refused notOneOverlay] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/allow | 5/5 | ok route 1 [permissionBubble action confirmed] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/block | 5/5 | ok route 1 [permissionBubble action confirmed] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/p-element | 6/6 | ok route 3 ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/relayout | 6/6 | screenChangedSinceScreenshot ×6 | nothing ×5; dismissed ×1 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-front/click | 6/6 | appWindowOverPoint [omniboxPopup refused notARow] ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/shared-front/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/shared-front/relayout | 20/20 | appWindowOverPoint [omniboxPopup refused notARow] ×20 | nothing ×20 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/click | 6/6 | clickUnconfirmed [datalist action unconfirmed] ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/relayout | 6/6 | appWindowOverPoint [refused notOneOverlay] ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| permission/shared-front/allow (prompt observed as the window) | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 5 | n/a | 0 | - |
| permission/shared-front/block (prompt observed as the window) | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 5 | n/a | 0 | - |
| permission/shared-front/p-element (prompt observed as the window) | 6/6 | ok route 1 ×6 | taken ×6 | 0 / 0 | 6 | n/a | 0 | - |
| permission/shared-front/relayout (prompt observed as the window) | 6/6 | noScreenshotForCoordinates ×6 | dismissed ×6 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/dedicated-behind/click | 6/6 | appWindowOverPoint [omniboxPopup refused notARow] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/dedicated-behind/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | 5 / 5 | 0 | - |
| omnibox/dedicated-behind/relayout | 20/20 | appWindowOverPoint [omniboxPopup refused notARow] ×20 | nothing ×20 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/dedicated-behind/click | 6/6 | clickUnconfirmed [datalist action unconfirmed] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/dedicated-behind/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | 5 / 5 | 0 | - |
| datalist/dedicated-behind/relayout | 6/6 | appWindowOverPoint [refused notOneOverlay] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/allow | 5/5 | ok route 1 [permissionBubble action confirmed] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/block | 5/5 | ok route 1 [permissionBubble action confirmed] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/p-element | 6/6 | ok route 3 ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/relayout | 6/6 | screenChangedSinceScreenshot ×6 | nothing ×2; dismissed ×4 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| page/shared-behind/p-page | 5/5 | ok route 3 ×5 | clicked ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| underclosed/shared-behind/p-underclosed | 5/5 | ok route 3 ×5 | clicked ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-forced | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-drag | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| siteinfo/shared-behind/p-unknown (prompt observed as the window) | 5/5 | ok route 3 ×5 | closed ×5 | 0 / 0 | 0 | 5 / 0 | 0 | - |
| inputlist/shared-behind/p-inputlist | 5/5 | ok route 3 {popUp {"role":"AXComboBox","menuWindow":238,"effect":"confirmed","} ×1; ok route 3 {popUp {"ms":34.419,"polls":2,"delivery":"action","effect":"confirm} ×1; ok route 3 {popUp {"kind":"datalist","effect":"confirmed","polls":2,"role":"AX} ×2; ok route 3 {popUp {"delivery":"action","menuWindow":847,"polls":2,"effect":"co} ×1 | opened ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| popover/shared-behind/click | 6/6 | appWindowOverPoint [appKitPopover refused partlyRecorded] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| popover/shared-front/click | 6/6 | appWindowOverPoint [appKitPopover refused partlyRecorded] ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| popover/dedicated-behind/click | 6/6 | appWindowOverPoint [appKitPopover refused partlyRecorded] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| font/shared-behind/p-font | 5/5 | ok route 3 {popUp {"ms":172.927,"effect":"confirmed","kind":"popUpButton","del} ×1; ok route 3 {popUp {"menuWindow":1450,"role":"AXPopUpButton","effect":"confirme} ×1; ok route 3 {popUp {"kind":"popUpButton","role":"AXPopUpButton","delivery":"act} ×1; ok route 3 {popUp {"ms":98.978,"effect":"confirmed","kind":"popUpButton","deli} ×1; ok route 3 {popUp {"restored":{"ms":348.193,"complete":true,"leftCovered":0,"w} ×1 | opened ×5 | 0 / 0 | 0 | 4 / 0 | 0 | - |

##### Bar lines

- delivered, confirmed and taken, per overlay cell: omnibox/shared-behind/click 0/6; datalist/shared-behind/click 0/6; permission/shared-behind/allow 5/5; permission/shared-behind/block 5/5; omnibox/shared-front/click 0/6; datalist/shared-front/click 0/6; omnibox/dedicated-behind/click 0/6; datalist/dedicated-behind/click 0/6; permission/dedicated-behind/allow 5/5; permission/dedicated-behind/block 5/5; popover/shared-behind/click 0/6; popover/shared-front/click 0/6; popover/dedicated-behind/click 0/6
- shared: frontmost changed transient 0/160, end 0/160; key or main window changed 0/160; window over the cover transient 4/106, end 0/106 (font/shared-behind/p-font ×4)
- dedicated (recorded, not failed: ruling 1070): frontmost changed transient 0/76, end 0/76; key or main window changed 0/76; window over the cover transient 10/76, end 10/76 (omnibox/dedicated-behind/p-element ×5; datalist/dedicated-behind/p-element ×5)
- wrong row: 0/263
- re-laid-out omnibox: refused notARow ×60, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 60; the list or prompt changed before the click in 60)
- re-laid-out datalist: refused notOneOverlay ×18, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 18; the list or prompt changed before the click in 18)
- re-laid-out permission: refused screenChangedSinceScreenshot ×12, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 12; the list or prompt changed before the click in 7)
- omnibox re-laid out, the row at the point: shown in the screenshot vs held now: changed in 60/60 (now no row ×2; another row ×58); pressed/taken: appWindowOverPoint, nothing taken ×60
- false ok (answered ok, not taken): 0
- false confirmed (overlayClick confirmed, not taken): 0
- refused but taken anyway: 0
- reached the window beneath: 0/164
- frontmost prompt observed as the window itself (out of scope, main's click): 27 (permission/shared-front/allow ok route 3 taken ×5; permission/shared-front/block ok route 3 taken ×5; permission/shared-front/p-element ok route 1 taken ×6; permission/shared-front/relayout noScreenshotForCoordinates dismissed ×6; siteinfo/shared-behind/p-unknown ok route 3 closed ×5)
- permission state after: shared-behind/allow allow->-/granted ×5; shared-behind/block block->-/NotAllowedError ×5; shared-behind/p-element block->-/- ×3; shared-behind/relayout block->-/- ×6; shared-front/allow allow->-/granted ×5; shared-front/block block->-/NotAllowedError ×5; shared-front/p-element block->-/NotAllowedError ×3; shared-front/relayout block->-/- ×6; dedicated-behind/allow allow->-/granted ×5; dedicated-behind/block block->-/NotAllowedError ×5; dedicated-behind/p-element block->-/- ×3; dedicated-behind/relayout block->-/- ×6; shared-behind/p-element allow->-/- ×3; shared-front/p-element allow->-/granted ×3; dedicated-behind/p-element allow->-/- ×3

##### Parity: main-5580ac20 5580ac20 against fix-de0d119f de0d119f

| cell | main-5580ac20 | fix-de0d119f | same |
|---|---|---|---|
| omnibox/shared-behind/p-element | backgroundClickRefused → nothing ×5 | backgroundClickRefused → nothing ×5 | yes |
| datalist/shared-behind/p-element | ok → dismissed ×5 | ok → dismissed ×5 | yes |
| permission/shared-behind/p-element | ok → nothing ×6 | ok → nothing ×6 | yes |
| omnibox/shared-front/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| datalist/shared-front/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| permission/shared-front/allow (prompt observed as the window) | ok → taken ×5 | ok → taken ×5 | yes |
| permission/shared-front/block (prompt observed as the window) | ok → taken ×5 | ok → taken ×5 | yes |
| permission/shared-front/p-element (prompt observed as the window) | ok → taken ×6 | ok → taken ×6 | yes |
| permission/shared-front/relayout (prompt observed as the window) | noScreenshotForCoordinates → dismissed ×6 | noScreenshotForCoordinates → dismissed ×6 | yes |
| omnibox/dedicated-behind/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| datalist/dedicated-behind/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| permission/dedicated-behind/p-element | ok → nothing ×6 | ok → nothing ×6 | yes |
| page/shared-behind/p-page | ok → clicked ×5 | ok → clicked ×5 | yes |
| underclosed/shared-behind/p-underclosed | ok → clicked ×5 | ok → clicked ×5 | yes |
| omnibox/shared-behind/p-forced | appWindowOverPoint → nothing ×5 | appWindowOverPoint → nothing ×5 | yes |
| omnibox/shared-behind/p-drag | appWindowOverPoint → nothing ×5 | appWindowOverPoint → nothing ×5 | yes |
| siteinfo/shared-behind/p-unknown (prompt observed as the window) | ok → closed ×5 | ok → closed ×5 | yes |
| inputlist/shared-behind/p-inputlist | ok → opened ×5 | ok → opened ×5 | yes |
| font/shared-behind/p-font | ok → opened ×5 | ok → opened ×5 | yes |

##### Observations (ruling 1074)

| head | observations | wall ms p50 / p95 | screenshotWindowsListed ms p50 / p95 | total timing p50 / p95 | render errors |
|---|---|---|---|---|---|
| main-5580ac20 | 526 | 107 / 430 | - / - | 98.6 / 419 (totalMs) | 0 |
| fix-de0d119f | 526 | 80 / 407 | 0.5 / 1.4 | 74.4 / 397.3 (totalMs) | 0 |

- result shape, fix-de0d119f against main-5580ac20: the same keys
- timing keys only on fix-de0d119f: screenshotWindowsListedMs
- parity cells' rendered text: 166 observations on fix-de0d119f, 166 on main-5580ac20; lines only on fix-de0d119f: 0; only on main-5580ac20: 4 ("text probe453 /results-alpha http://127.0.0.1:PORT/results-alpha location from history, press Tab th", "button Help: Remove suggestion, Remove Suggestion button, press Enter to remove, probe453 /results-a", "text probe453 page http://127.0.0.1:PORT/results-beta location from history, press Tab then Enter to", "text (selected) probe453 page http://127.0.0.1:PORT/results-beta location from history, press Tab th")
- new in the model's view on fix-de0d119f (lines naming a window owner that main-5580ac20 never shows): no

### #443's decomove on fix de0d119f

One engine per dispatch: the kit names its only engine "main", so the "main" columns below are fix de0d119f and the "fix" columns are unused. Expected: decomove refused `controlGone`, the keep cells (plain, overlapinto) kept and landed. Result: decomove refused `controlGone` 40/40 (CfT 20, Electron 20), keep cells kept-landed 40/40.

| Unit | cft: main | cft: fix | electron: main | electron: fix |
|---|---|---|---|---|
| plain/text | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |
| plain/link | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |
| decomove/text | refused controlGone 10 [AXLink 10] | – | refused controlGone 10 [AXLink 10] | – |
| decomove/link | refused controlGone 10 [AXLink 10] | – | refused controlGone 10 [AXLink 10] | – |
| overlapinto/text | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |
| overlapinto/link | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 5.106 / 17.635 / 21.443 (60) | 8.502 / 18.557 / 21.443 (40) | 4.031 / 5.836 / 5.836 (20) | 8.015 / 18.557 / 21.443 (30) |
| electron | main | 3.058 / 6.677 / 19.986 (60) | 2.473 / 5.142 / 19.986 (40) | 5.12 / 9.313 / 9.313 (20) | 3.175 / 6.677 / 19.986 (30) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| fix-de0d119f | cft | 20261117.0516.1 | 157.0.8103.78 | 60/60 | none | – |
| fix-de0d119f | electron | 20261117.0516.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 60/60 | none | – |

### The recorded chain at the point, and what each route pressed (from the saved rows; no new run)

These are representative shared-behind rows: on de0d119f, `omnibox-`, `datalist-` and `popover-shared-behind-click-1` of
run 45066234145; on c8858c2a, `popover-shared-behind-click-1` of run 45057158194; the spike rows are the
`*-shared-behind-axpress-1` rows of run 45050307595.

**What the kit kept, and what it did not.**
- It kept the observation's nodes whose frame holds the point, inside the overlay's window, smallest first, up to six
  (`recordedAtPoint`). Each has its role, frame and label, where the label is title, description, value and
  placeholder joined. Nesting is read from the frames.
- It did not keep the nodes' `actions`, `depth`, `children` or `flags` (all on the wire), the title, description and
  value apart, or the parent links.
- The wire carries no `recorded` or `subtreeRecorded`: they are the engine's own, and its meta names no chosen node.
- So per-node actions, the recorded flags and the descendant behind `partlyRecorded` are not in these artifacts. A
  kit change keeping the whole subtree at the point, and one more run, would give them. The actions listed below are
  the ones the spike's tool read live on the element it pressed.

**Chains, from the overlay's root down to the deepest node** (frames as `x,y w×h`):
- **Omnibox popup** (window 37, layer 0): AXWebArea "Omnibox Popup" 515,116 426×210 › AXScrollArea 515,116 426×210 ›
  AXGroup 515,116 426×210 › AXList 515,116 426×160 › AXStaticText "probe453 page http://…/results-beta location from
  history, press T…" 515,236 426×40 › **AXGroup (no label) 515,236 410×40**.
- **Datalist** (window 65, layer 999): AXGroup 471,228 156×188 › AXScrollArea › AXGroup › AXList "Autofill" 471,228
  156×188 › AXStaticText "apricot" 475,268 148×36 › **AXStaticText "apricot" 475,268 148×36**. The two texts have the
  same frame, one inside the other.
- **AppKit popover** (window 1333; the popover lives in the document window's tree): AXWindow "p453.rtf" › AXScrollArea
  › AXTextArea (the document's text, under the popover) › AXPopover 393,91 225×246 › AXGrid 418,137 175×147 ›
  **AXButton "rgb 0.833356 0.518662 0 1" 520,197 13×13**.
- **Popover on c8858c2a:** the same pick (AXButton "rgb 0.833356 …" 520,197 13×13, token t127, 143 nodes in the
  overlay). That run predates `recordedAtPoint`.

| kind, head | the fix's node (its rule: the deepest recorded node at the point, of no container role) | the fix's answer | the spike's bare AXPress pressed | in the recorded chain |
|---|---|---|---|---|
| omnibox, de0d119f | the AXGroup 410×40, the row's child | refused `notARow`: AXGroup is not one of the omnibox's row roles (AXStaticText, AXButton, AXLink, AXCell, AXRow) | the AXStaticText 426×40 (`AXPress, AXShowMenu, AXScrollToVisible`); took it 30/30 | yes: the AXGroup's parent |
| datalist, de0d119f | the inner "apricot" (the deeper of the two) | AXPress sent, `clickUnconfirmed`: the list stayed, nothing written (6/6 per mode) | the outer "apricot" (`AXPress`, inference below); took it 15/15 | yes: both texts are |
| popover, de0d119f | the swatch AXButton 13×13 | refused `partlyRecorded` before any press | the same swatch AXButton (`AXPress`); took it 30/30 | yes |
| popover, c8858c2a | the swatch AXButton | `route: "action"`, confirmed; colour changed | — | yes |

- **(b) The spike's selection rule** (`tool.swift` `pressRow`): under the overlay's AX root (the popup's or list's
  AXWindow; for the popover its AXPopover), breadth-first, the first element of the recorded pick's role whose frame
  lies within 2 pt of the pick's frame. That element gets AXPress itself: no hit-test, no ancestor. The kit picked its
  row from the observation: the omnibox band's widest node with text, the datalist's widest node labelled "apricot",
  and the middle "rgb …" swatch.
- **(c) Datalist: which "apricot".** Both texts match the spike's rule. Breadth-first reaches the outer one first,
  after visiting 10 elements, so the spike pressed the **outer** text. The fix's rule (the deepest, then nested) takes
  the **inner** one. Both readings are inferences, from the walk's order and the fix's code (`OverlayClick.swift`,
  `rows.max(by: depth)`): neither run recorded the element's depth. So Chromium's list takes AXPress on the outer text
  and not on the inner one.
- **(d) Popover, the cause of `partlyRecorded`.** Not determinable from these artifacts. The check needs every element
  of the swatch's recorded subtree (and every frameless node under it) to have `subtreeRecorded` and to be recorded.
  Neither flag reaches the wire, and the kit kept no children of the swatch. It is not the swatch itself failing to
  record: the same swatch was pressed and confirmed on c8858c2a, which had no whole-subtree check. The descendant (a
  child read that failed, or children left out, under an AXButton) would show in the engine's own record or in a kit
  run that keeps the swatch's subtree with its `children` count.

### Preview: fix d1e7d318 (ruling 1082's row-selection wave), reps 1

Run https://github.com/SSFSKIM/cua/actions/runs/45073546905, kit 13b07a32, 18 rows. The kit now keeps each row's
recorded chain at the point (`recordedChain`): every observed node whose frame holds the point, by depth, with the
wire's fields (role, subrole, frame, title, description, value, actions, flags, children count, token). The wire
carries no `recorded`, `subtreeRecorded` or `childrenLeaf`.

| kind | shared-behind | shared-front | dedicated-behind | `overlayClick.row` / `refusedBy` |
|---|---|---|---|---|
| omnibox row | confirmed, taken | confirmed, taken | confirmed, taken | row AXStaticText 515,236 426×40 |
| omnibox re-laid out | refused `labelChanged` | refused `labelChanged` | refused `labelChanged` | refusedBy AXStaticText:labelChanged; nothing taken, the row at the point had changed 3/3 |
| datalist row | refused `notARow` | refused `notARow` | refused `notARow` | row AXGroup 471,228 156×188; refusedBy AXGroup:notARow |
| permission Allow, Block (behind) | confirmed, taken | (frontmost prompt: the observed window, out of scope) | confirmed, taken | row AXButton |
| popover swatch | confirmed, colour changed | confirmed, colour changed | confirmed, colour changed | row AXButton 13×13 |

Nothing else moved:
- frontmost changed 0/16 and key window changed 0/16 in shared and dedicated mode;
- window over the cover 0/12;
- wrong row 0/18, false ok 0, false confirmed 0.

**The datalist's recorded chain at the point** (depth, role, frame; the overlay window's part only):

| depth | role | frame | label | actions | children |
|---|---|---|---|---|---|
| 2 | AXGroup | 467,220 164×202 | – | – | 1 |
| 3 | AXList "Autofill" | 471,228 156×188 | title and description "Autofill" | AXPress | 1 |
| 4 | **AXGroup** | 471,228 156×188 | – | – | 1 |
| 5 | AXScrollArea | 471,228 156×188 | – | – | 2 |
| 6 | AXGroup | 471,228 156×188 | – | – | 1 |
| 7 | AXGroup | 471,228 156×188 | – | – | 5 |
| 8 | AXStaticText | 475,268 148×36 | value "apricot" | AXPress | 1 |
| 9 | AXStaticText | 475,268 148×36 | value "apricot" | AXPress | 0 |

How this reads:
- The AXList's own child on the chain is a wrapper AXGroup the size of the whole list (depth 4). The fix takes that
  group as the row, and it is not a row role. The option rows sit three levels further down, as children of the
  depth-7 AXGroup (5 children).
- The outer "apricot" (depth 8) is the element the spike's bare AXPress took 15/15.

**The omnibox's chain:** AXWebArea "Omnibox Popup" (7) › AXGroup (8) › AXList (9, 4 children) › **AXStaticText**
(10, AXPress, AXShowMenu, AXScrollToVisible; the row) › AXGroup/AXEmptyGroup (11, 410×40).

## #453 qual, counted on the final head: fix/453-axpress a8307c6c against main 5580ac20 (rulings 1040, 1069-1083)

Runs:
- Smoke on a8307c6c (reps 1): https://github.com/SSFSKIM/cua/actions/runs/45075185955.
- Counted fix run: https://github.com/SSFSKIM/cua/actions/runs/45075999203 (kit 58827e12, 281 rows, 54 min).
- Main's counted run, the baseline: https://github.com/SSFSKIM/cua/actions/runs/45061006010 (kit 3326bebf, 263 rows;
  the same cells but `omniremove`).
- Main's `omniremove` baseline: https://github.com/SSFSKIM/cua/actions/runs/45074375354 (18 rows). Its artifact upload
  failed after measuring (`ENOTFOUND` on the runner), so its rows come from the run log: refused `appWindowOverPoint`
  18/18, the suggestion kept 18/18, nothing navigated, frontmost, key window and window order all 0.
- #443's decomove and keep cells on a8307c6c: https://github.com/SSFSKIM/cua/actions/runs/45081388473.

### Reading

- **Delivered, confirmed and taken:**

  | kind | shared-behind | shared-front | dedicated-behind |
  |---|---|---|---|
  | omnibox | 6/6 | 6/6 | 6/6 |
  | permission prompt | 10/10 | out of scope (observed as the window) | 10/10 |
  | AppKit popover | 6/6 | 6/6 | 6/6 |
  | datalist | 0/6 | 0/6 | 0/6 |

  The rows pressed: the omnibox and the popover as their row AXStaticText and AXButton, the permission prompt as its
  AXButton.
- **Datalist: refused in 18/18 rows, for a ticket** (ruling 1083). Every row was refused `actionableDescendant` with
  `refusedBy` AXStaticText and `row` AXGroup 471,228 156×188. Its recorded chain:
  - AXList "Autofill" (AXPress) at depth 3;
  - its one child, an AXGroup the size of the list (depth 4) — the fix's row;
  - AXScrollArea (depth 5), AXGroup (depth 6), then an AXGroup with 5 children (depth 7);
  - AXStaticText "apricot" (depth 8, AXPress, 1 child) and inside it AXStaticText "apricot" (depth 9, AXPress, no
    children).

  The wrapper AXGroup is the AXList's direct child. The actionable option rows lie three levels below it, so the
  wrapper reads as holding actionable descendants. The spike's bare AXPress took the depth-8 text 15/15.
- **Remove suggestion (`omniremove`, ruling 1083):** refused `actionableDescendant` in 18/18 rows, `refusedBy`
  AXButton, row AXStaticText. The suggestion was kept and nothing navigated (0/18). Its chain: AXList (depth 9) ›
  AXStaticText row (depth 10, AXPress) › AXGroup 410×40 (depth 11, 2 children) › AXButton "Remove Suggestion button,
  press Enter to remove, …" 884,124 24×24 (depth 12) beside an AXEmptyGroup. Main refuses it `appWindowOverPoint`
  18/18.
- **Omnibox while typing (decisive):** 60/60 refused `labelChanged`, `refusedBy` AXStaticText. The row at the point had
  changed in 60/60 (another row each time), and nothing was taken in any row. The image-against-pressed line is in
  the bar lines.
- **Shared mode:**
  - frontmost changed 0/172 (transient and end);
  - key window changed 0/172;
  - window over the cover: transient 5/112, end 1/112. Four are #458's TextEdit font pop-up (transient only, as on
    main, 4/106).
  - **The one row that stayed raised at the end is a parity cell, not #453's route.** In
    `datalist-shared-behind-p-element-3`, the element click by ID on a datalist row (route 3, main's) answered
    `activationFailed` after 1 s: "the app's window did not stay behind the frontmost window within 1 s". Chrome's
    window stayed listed over the cover from 1064 ms after the click to the end of the watch. Frontmost and the key
    window did not move. Main's counted run had 0/5 there. This is the only parity difference.
- **Dedicated mode (recorded, not failed):** 10/82 raised, all of them main's route-3 element click (p-element), as on
  main.
- **Wrong row:** 0/281. **False ok:** 0. **False confirmed:** 0. **Refused but taken:** 0. **Reached beneath:**
  0/182.
- **Re-laid-out datalist:** 18/18 refused `notOneOverlay`. **Permission:** 12/12 refused
  `screenChangedSinceScreenshot`, as main.
- **Parity:** 18 of 19 cells answer as main. The 19th is the `activationFailed` row above.
- **Observations, fix against main:**
  - The result's keys are the same, with one new timing key, `screenshotWindowsListedMs` (p50 0.6 ms, p95 1.7 ms).
  - Wall clock: p50 101 ms against 107, p95 436 against 430. The engine's `totalMs`: p50 94 against 99, p95 423 against
    419. The delta is within noise.
  - Parity cells' rendered text after normalisation: 1 line only on the fix and 9 only on main. All are omnibox
    history suggestion lines, whose titles vary per run.
  - Nothing new reaches the model's view (no window owner, layer or bounds).

#### fix-a8307c6c engine a8307c6cb5ccbe53f4b83689978aa67f90f14f31  (Google Chrome 157.0.8103.79; ProductName: macOS ProductVersion: 26.7.2 BuildVersion: 25G332; image 20261117.0516.1; kit 58827e12d57c14962b54c801f4291355fc58a7e8; 281 rows, 53.75 min)

| cell | rows | answer [overlayClick] | effect | frontmost changed, transient / end | key/main window changed | window over the cover, transient / end | beneath | problems |
|---|---|---|---|---|---|---|---|---|
| omnibox/shared-behind/click | 6/6 | ok route 1 [omniboxPopup action confirmed row AXStaticText] ×6 | taken ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-element | 5/5 | backgroundClickRefused ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/relayout | 20/20 | appWindowOverPoint [omniboxPopup refused labelChanged by AXStaticText:labelChanged row AXStaticText] ×20 | nothing ×20 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/click | 6/6 | appWindowOverPoint [datalist refused actionableDescendant by AXStaticText:actionableDescendant row AXGroup] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/shared-behind/p-element | 5/5 | ok route 3 ×4; activationFailed ×1 | dismissed ×5 | 0 / 0 | 0 | 1 / 1 | 0 | - |
| datalist/shared-behind/relayout | 6/6 | appWindowOverPoint [refused notOneOverlay] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/allow | 5/5 | ok route 1 [permissionBubble action confirmed row AXButton] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/block | 5/5 | ok route 1 [permissionBubble action confirmed row AXButton] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/p-element | 6/6 | ok route 3 ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/shared-behind/relayout | 6/6 | screenChangedSinceScreenshot ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omniremove/shared-behind/click | 6/6 | appWindowOverPoint [omniboxPopup refused actionableDescendant by AXButton:actionableDescendant row AXStaticText] ×6 | kept ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-front/click | 6/6 | ok route 1 [omniboxPopup action confirmed row AXStaticText] ×6 | taken ×6 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/shared-front/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/shared-front/relayout | 20/20 | appWindowOverPoint [omniboxPopup refused labelChanged by AXStaticText:labelChanged row AXStaticText] ×20 | nothing ×20 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/click | 6/6 | appWindowOverPoint [datalist refused actionableDescendant by AXStaticText:actionableDescendant row AXGroup] ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | n/a | 0 | - |
| datalist/shared-front/relayout | 6/6 | appWindowOverPoint [refused notOneOverlay] ×6 | nothing ×6 | 0 / 0 | 0 | n/a | 0 | - |
| permission/shared-front/allow (prompt observed as the window) | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 5 | n/a | 0 | - |
| permission/shared-front/block (prompt observed as the window) | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 5 | n/a | 0 | - |
| permission/shared-front/p-element (prompt observed as the window) | 6/6 | ok route 1 ×6 | taken ×6 | 0 / 0 | 6 | n/a | 0 | - |
| permission/shared-front/relayout (prompt observed as the window) | 6/6 | noScreenshotForCoordinates ×6 | dismissed ×6 | 0 / 0 | 0 | n/a | 0 | - |
| omniremove/shared-front/click | 6/6 | appWindowOverPoint [omniboxPopup refused actionableDescendant by AXButton:actionableDescendant row AXStaticText] ×6 | kept ×6 | 0 / 0 | 0 | n/a | 0 | - |
| omnibox/dedicated-behind/click | 6/6 | ok route 1 [omniboxPopup action confirmed row AXStaticText] ×6 | taken ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/dedicated-behind/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | 5 / 5 | 0 | - |
| omnibox/dedicated-behind/relayout | 20/20 | appWindowOverPoint [omniboxPopup refused labelChanged by AXStaticText:labelChanged row AXStaticText] ×20 | nothing ×20 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/dedicated-behind/click | 6/6 | appWindowOverPoint [datalist refused actionableDescendant by AXStaticText:actionableDescendant row AXGroup] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| datalist/dedicated-behind/p-element | 5/5 | ok route 3 ×5 | taken ×5 | 0 / 0 | 0 | 5 / 5 | 0 | - |
| datalist/dedicated-behind/relayout | 6/6 | appWindowOverPoint [refused notOneOverlay] ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/allow | 5/5 | ok route 1 [permissionBubble action confirmed row AXButton] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/block | 5/5 | ok route 1 [permissionBubble action confirmed row AXButton] ×5 | taken ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/p-element | 6/6 | ok route 3 ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| permission/dedicated-behind/relayout | 6/6 | screenChangedSinceScreenshot ×6 | nothing ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omniremove/dedicated-behind/click | 6/6 | appWindowOverPoint [omniboxPopup refused actionableDescendant by AXButton:actionableDescendant row AXStaticText] ×6 | kept ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| page/shared-behind/p-page | 5/5 | ok route 3 ×5 | clicked ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| underclosed/shared-behind/p-underclosed | 5/5 | ok route 3 ×5 | clicked ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-forced | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| omnibox/shared-behind/p-drag | 5/5 | appWindowOverPoint ×5 | nothing ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| siteinfo/shared-behind/p-unknown (prompt observed as the window) | 5/5 | ok route 3 ×5 | closed ×5 | 0 / 0 | 0 | 5 / 0 | 0 | - |
| inputlist/shared-behind/p-inputlist | 5/5 | ok route 3 {popUp {"effect":"confirmed","action":"AXPress","kind":"datalist","} ×3; ok route 3 {popUp {"menuWindow":471,"polls":2,"delivery":"action","ms":46.712,} ×1; ok route 3 {popUp {"menuWindow":916,"polls":2,"delivery":"action","ms":42.793,} ×1 | opened ×5 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| popover/shared-behind/click | 6/6 | ok route 1 [appKitPopover action confirmed row AXButton] ×6 | changed ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| popover/shared-front/click | 6/6 | ok route 1 [appKitPopover action confirmed row AXButton] ×6 | changed ×6 | 0 / 0 | 0 | n/a | 0 | - |
| popover/dedicated-behind/click | 6/6 | ok route 1 [appKitPopover action confirmed row AXButton] ×6 | changed ×6 | 0 / 0 | 0 | 0 / 0 | 0 | - |
| font/shared-behind/p-font | 5/5 | ok route 3 {popUp {"effect":"confirmed","action":"AXPress","kind":"popUpButton} ×5 | opened ×5 | 0 / 0 | 0 | 4 / 0 | 0 | - |

##### Bar lines

- delivered, confirmed and taken, per overlay cell: omnibox/shared-behind/click 6/6; datalist/shared-behind/click 0/6; permission/shared-behind/allow 5/5; permission/shared-behind/block 5/5; omniremove/shared-behind/click 0/6; omnibox/shared-front/click 6/6; datalist/shared-front/click 0/6; omniremove/shared-front/click 0/6; omnibox/dedicated-behind/click 6/6; datalist/dedicated-behind/click 0/6; permission/dedicated-behind/allow 5/5; permission/dedicated-behind/block 5/5; omniremove/dedicated-behind/click 0/6; popover/shared-behind/click 6/6; popover/shared-front/click 6/6; popover/dedicated-behind/click 6/6
- shared: frontmost changed transient 0/172, end 0/172; key or main window changed 0/172; window over the cover transient 5/112, end 1/112 (datalist/shared-behind/p-element ×1; font/shared-behind/p-font ×4)
- dedicated (recorded, not failed: ruling 1070): frontmost changed transient 0/82, end 0/82; key or main window changed 0/82; window over the cover transient 10/82, end 10/82 (omnibox/dedicated-behind/p-element ×5; datalist/dedicated-behind/p-element ×5)
- wrong row: 0/281
- re-laid-out omnibox: refused labelChanged ×60, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 60; the list or prompt changed before the click in 59)
- re-laid-out datalist: refused notOneOverlay ×18, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 18; the list or prompt changed before the click in 18)
- re-laid-out permission: refused screenChangedSinceScreenshot ×12, the recorded row taken 0, a neighbour taken 0 (must be 0), other 0 (of 12; the list or prompt changed before the click in 12)
- omnibox re-laid out, the row at the point: shown in the screenshot vs held now: changed in 60/60 (now another row ×60); pressed/taken: appWindowOverPoint, nothing taken ×60
- false ok (answered ok, not taken): 0
- false confirmed (overlayClick confirmed, not taken): 0
- refused but taken anyway: 0
- reached the window beneath: 0/182
- frontmost prompt observed as the window itself (out of scope, main's click): 27 (permission/shared-front/allow ok route 3 taken ×5; permission/shared-front/block ok route 3 taken ×5; permission/shared-front/p-element ok route 1 taken ×6; permission/shared-front/relayout noScreenshotForCoordinates dismissed ×6; siteinfo/shared-behind/p-unknown ok route 3 closed ×5)
- permission state after: shared-behind/allow allow->-/granted ×5; shared-behind/block block->-/NotAllowedError ×5; shared-behind/p-element block->-/- ×3; shared-behind/relayout block->-/- ×6; shared-front/allow allow->-/granted ×5; shared-front/block block->-/NotAllowedError ×5; shared-front/p-element block->-/NotAllowedError ×3; shared-front/relayout block->-/- ×6; dedicated-behind/allow allow->-/granted ×5; dedicated-behind/block block->-/NotAllowedError ×5; dedicated-behind/p-element block->-/- ×3; dedicated-behind/relayout block->-/- ×6; shared-behind/p-element allow->-/- ×3; shared-front/p-element allow->-/granted ×3; dedicated-behind/p-element allow->-/- ×3

##### Parity: main-5580ac20 5580ac20 against fix-a8307c6c a8307c6c

| cell | main-5580ac20 | fix-a8307c6c | same |
|---|---|---|---|
| omnibox/shared-behind/p-element | backgroundClickRefused → nothing ×5 | backgroundClickRefused → nothing ×5 | yes |
| datalist/shared-behind/p-element | ok → dismissed ×5 | ok → dismissed ×4; activationFailed → dismissed ×1 | **no** |
| permission/shared-behind/p-element | ok → nothing ×6 | ok → nothing ×6 | yes |
| omnibox/shared-front/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| datalist/shared-front/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| permission/shared-front/allow (prompt observed as the window) | ok → taken ×5 | ok → taken ×5 | yes |
| permission/shared-front/block (prompt observed as the window) | ok → taken ×5 | ok → taken ×5 | yes |
| permission/shared-front/p-element (prompt observed as the window) | ok → taken ×6 | ok → taken ×6 | yes |
| permission/shared-front/relayout (prompt observed as the window) | noScreenshotForCoordinates → dismissed ×6 | noScreenshotForCoordinates → dismissed ×6 | yes |
| omnibox/dedicated-behind/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| datalist/dedicated-behind/p-element | ok → taken ×5 | ok → taken ×5 | yes |
| permission/dedicated-behind/p-element | ok → nothing ×6 | ok → nothing ×6 | yes |
| page/shared-behind/p-page | ok → clicked ×5 | ok → clicked ×5 | yes |
| underclosed/shared-behind/p-underclosed | ok → clicked ×5 | ok → clicked ×5 | yes |
| omnibox/shared-behind/p-forced | appWindowOverPoint → nothing ×5 | appWindowOverPoint → nothing ×5 | yes |
| omnibox/shared-behind/p-drag | appWindowOverPoint → nothing ×5 | appWindowOverPoint → nothing ×5 | yes |
| siteinfo/shared-behind/p-unknown (prompt observed as the window) | ok → closed ×5 | ok → closed ×5 | yes |
| inputlist/shared-behind/p-inputlist | ok → opened ×5 | ok → opened ×5 | yes |
| font/shared-behind/p-font | ok → opened ×5 | ok → opened ×5 | yes |

##### Observations (ruling 1074)

| head | observations | wall ms p50 / p95 | screenshotWindowsListed ms p50 / p95 | total timing p50 / p95 | render errors |
|---|---|---|---|---|---|
| main-5580ac20 | 526 | 107 / 430 | - / - | 98.6 / 419 (totalMs) | 0 |
| fix-a8307c6c | 580 | 101 / 436 | 0.6 / 1.7 | 94 / 423.2 (totalMs) | 0 |

- result shape, fix-a8307c6c against main-5580ac20: the same keys
- timing keys only on fix-a8307c6c: screenshotWindowsListedMs
- parity cells' rendered text: 166 observations on fix-a8307c6c, 166 on main-5580ac20; lines only on fix-a8307c6c: 1 ("text probe453 /results-alpha http://127.0.0.1:PORT/results-alpha location from history, press Tab th"); only on main-5580ac20: 9 ("text probe453 /results-alpha http://127.0.0.1:PORT/results-alpha location from history, press Tab th", "button Help: Remove suggestion, Remove Suggestion button, press Enter to remove, probe453 /results-a", "text http://127.0.0.1:PORT/results- search, 2 of 4", "text http://127.0.0.1:PORT/results-, 3 of 4", "text probe453 page http://127.0.0.1:PORT/results-beta location from history, press Tab then Enter to", "text probe453 page http://127.0.0.1:PORT/results-beta location from history, press Tab then Enter to", "text probe453 /results-alpha http://127.0.0.1:PORT/results-alpha location from history, press Tab th", "text probe453 page http://127.0.0.1:PORT/results-beta location from history, press Tab then Enter to")
- new in the model's view on fix-a8307c6c (lines naming a window owner that main-5580ac20 never shows): no

### #443's decomove on fix a8307c6c

One engine per dispatch: the kit names its only engine "main", so the "main" columns below are fix a8307c6c and the "fix" columns are unused. decomove was refused `controlGone` 40/40 (CfT 20, Electron 20). The keep cells (plain, overlapinto) were kept and landed 40/40.

| Unit | cft: main | cft: fix | electron: main | electron: fix |
|---|---|---|---|---|
| plain/text | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |
| plain/link | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |
| decomove/text | refused controlGone 10 [AXLink 10] | – | refused controlGone 10 [AXLink 10] | – |
| decomove/link | refused controlGone 10 [AXLink 10] | – | refused controlGone 10 [AXLink 10] | – |
| overlapinto/text | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |
| overlapinto/link | kept-landed sameElement 10 | – | kept-landed sameElement 10 | – |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 6.368 / 17.788 / 23.532 (60) | 8.167 / 18.825 / 23.532 (40) | 3.639 / 11.226 / 11.226 (20) | 7.775 / 18.825 / 23.532 (30) |
| electron | main | 2.414 / 3.929 / 5.586 (60) | 1.825 / 3.355 / 3.929 (40) | 3.453 / 5.586 / 5.586 (20) | 2.613 / 3.921 / 3.929 (30) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| fix-a8307c6c | cft | 20261117.0516.1 | 157.0.8103.78 | 60/60 | none | – |
| fix-a8307c6c | electron | 20261117.0516.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 60/60 | none | – |

### The shared-mode raise in `datalist/shared-behind/p-element`, pinned down (20 rows per head)

This is main's element click by ID on a datalist row, by route 3, with Chrome behind the TextEdit cover. The cell
alone, `--cellreps 20`, kit 8c992128:
- main 5580ac20: https://github.com/SSFSKIM/cua/actions/runs/45082409495;
- fix a8307c6c: https://github.com/SSFSKIM/cua/actions/runs/45084310309.

| head | `activationFailed` | raised over the cover, transient | raised at the end | first raised, ms after the click | frontmost changed | key window changed |
|---|---|---|---|---|---|---|
| main 5580ac20 | 2/20 | 2/20 | 2/20 | 1038, 1022 | 0/20 | 0/20 |
| fix a8307c6c | 1/20 | 1/20 | 1/20 | 1054 | 0/20 | 0/20 |

How this reads:
- The raise is main's. Every raised row is exactly the row that answered `activationFailed` ("the app's window did not
  stay behind the frontmost window within 1 s"), and the window is listed over the cover from just after the 1 s give-up
  to the end of the 3 s watch (about 1.8 s).
- The other rows answered ok by route 3 and raised nothing.
- Every row's effect was the same: the list dismissed, with no option taken.
- The rates are 2/20 on main and 1/20 on the fix. The counted runs' 0/5 on main and 1/5 on the fix are the same
  intermittent failure. It is route 3's activation guard on Chromium's datalist, outside #453's route.
