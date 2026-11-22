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
