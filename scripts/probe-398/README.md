# #398 hosted measurement and qualification: the placeholder in element identity

A disposable hosted macOS kit, not product code. It measures, on GitHub-hosted macOS, (1) how often the placeholder is the only attribute that separates two text fields of one window, by the engine's own identity match, and (2) how main answers when a field's placeholder changes between the observation and the action. It then qualifies the #398 fix (the placeholder leaves `ElementIdentity`'s strict match and only breaks a tie among otherwise-matching candidates) against main. Built from `probe/361-qual`'s lanes (exact-SHA stock builds, the owned cover and activation witness, the long-poll fixture server, one engine connection per trial) and `probe/414-qual`'s AppKit fixture pattern; the helpers it needs are copied here (`proc.mjs`, `wire.mjs`, `fixture-server.mjs`, `host.swift`) so the kit stands on main alone.

```sh
gh workflow run probe-398-qual.yml --ref probe/398-qual -f main="$MAIN_SHA" -f mode=measure                       # Phase 1: census and main alone
gh workflow run probe-398-qual.yml --ref probe/398-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f census=omit
```

## The census (`census.mjs`, `phase=census`, main only)

- **Engine.** An instrumented copy of main (`patch-census.mjs`): `ElementIdentity.matches` gains `ignoringPlaceholder` (default false, so every existing call is unchanged), and every committed observation, on `PROBE398_CENSUS=1`, reports its text fields (`AXTextField`, `AXTextArea`, `AXComboBox`, `AXSearchField`, `AXSecureTextField`) and, for each pair of them in the observed window, whether the engine's own match separates them only by the placeholder (`matches` false, `matches(ignoringPlaceholder:)` true) or not at all (`matches` true), with the value counted (an `.ifNeeded` re-read) and without it (set_value's `.ignoringValue` re-check). Each pair also records its **lineage of parents**: whether every ancestor, level by level, matches its counterpart (`ancestryAlike`), whether the two are siblings, and how far up their nearest common ancestor is. Only roles, subroles and each attribute's shape (absent, empty, set) leave the engine, never an attribute's text (`Probe398Census.swift`). The vendor runtime is never used.
- **Pages.** 45 public pages that need no login (`sites.mjs`): sign-up and account forms, checkout, address and tracking forms, search pages and search-led sites, settings-like pages; in Chrome for Testing (one tab per page through its DevTools endpoint, a refused tab recorded as `tab-open`) and Safari (`open`, closed with ⌘W). Each page is loaded for 8 s, observed, and observed again 2.5 s later (after Chromium's complete accessibility mode); the second observation is the census. A page is **reached** when one of its web areas is on the requested site (`hostMatch`); bot walls, consent pages and redirects elsewhere stay in `census.json` but are counted apart (`unreachedBy`), never in the totals. Nothing is typed, submitted or signed in.
- **Apps.** Fifteen built-in app windows: five System Settings panes, Contacts' new card, Calendar's new event, Mail's first window, a Finder search, TextEdit's find and replace, Reminders, Notes, Dictionary, Font Book and Maps (Keychain Access is left out: main's policy refuses it before any observation), opened by URL or bundle with their keys posted by the census engine's own `press_key`. Each records whether the app was ready, came to the front and took its keys; a scene is **verified** by a window title where one marks it (`expectTitle`: the pane's name, a Finder search, a new TextEdit document), else by its app ready and its keys accepted. Only verified scenes enter the totals.
- **Pass.** A census lane passes when it reached at least half of what it sampled.

## The fixture lanes (`run.mjs`, `phase=stock`)

- **Heads.** Unmodified release builds of exact SHAs (`git worktree add --detach`, clean before and after the build). The harness drives the engine's own wire: `get_app_state`, then `click` and `set_value` or `type_text` with the observation's token and lineage, one engine connection (so one fresh lineage) per trial; only the head under trial holds a connection.
- **Lanes.** Chrome for Testing, Safari, Electron (`electron/`, Electron 44.4.5) on the owned page (`page.mjs`), and an owned AppKit fixture (`fixture.swift`: `NSTextField`s and an `NSSearchField`). Each lane tries the background under the owned cover with #395's activation witness, and falls back to frontmost only when the background could not be set up before any cua call.
- **Fields.** Each placeholder-change field carries its own label (aria-label, AppKit accessibility label), so the placeholder is the only attribute that changes: `static` (never changes: the control), `focus` (cleared on focus, restored on blur: a floating label), `rotate` (rotates every 150 ms while its cell runs: "search people…", "search files…"), `input` (switches on the first input: a mode hint), `search` (an `<input type=search>` or `NSSearchField` whose hint switches on focus). The **twins** are two fields alike in everything but their placeholder (same label, type and parent); the **solo** field has its own label and no twin. Twins and solo are rebuilt at every prepare. The setup field holds a canary that `mark` must still read as set.
- **Units**, ten per unit per head to measure, twenty to qualify, the heads interleaved (`cells.mjs`):
  - each placeholder field × `set` (click its element, then set_value on the same element) `type` (click it, then type_text; skipped when the click refused) and `typeset` (click it, type_text, then set_value on the same element, whose value is the expected one: the fix builder's suggestion; skipped likewise);
  - the stale-handle cells, `set` only, whose observed handle `mark` makes stale between the observation and the click: the first twin recreated alike (`twin-recreate`: the right answer is success into it), recreated with another placeholder (`twin-renamed`: success into it or a refusal; never the other twin), or removed (`twin-removed`: the right answer is an identity refusal); and the solo field recreated with another placeholder (`solo-renamed`: its replacement is the only otherwise-matching field, and main's walk, which keeps the placeholder, refuses it).
- **Per trial**: the click's and the second action's outcomes (success or the engine's error name) and why a native error says it refused (`actWhy`, from its message: `refetch`, the post-write re-fetch found no field; `drift`, a late click's drift; `unfocused`, the unfocused write's read-back; `other`); the fixture's first read right after the actions (kept apart) and its settled content (polled up to 2 s, read again 300 ms later); whether the target is still the node the observation named (`sameNode`); how often its placeholder changed by the first read (`realized`); one more observation on the trial's connection after the reads, and whether it shows the target with another placeholder than before (`axChanged`); any other field, the setup canary included, written or focused (`wrongAdoption`); what the observation showed of the placeholder; the witness (`presentationHeld`); and the engine-call times.
- **Exercised.** A changing placeholder row is exercised when its placeholder changed in the fixture (`realized`) and in the engine's own re-observation (`axChanged`); unexercised rows are reported apart.
- **Verdicts** (`check.mjs`): `success-exact`; `refused-delivered` (an error while the value went in, e.g. `valueUnconfirmed`); `refused`; `click-refused` (type unit, the click refused); `no-answer` (a missing reply, or an error without a usable name); `observe-failed` (after a valid prepare, the head's observation or the target in it missing: the head's own answer, a valid row); `wrong-success`; `wrong-adoption`. A refusal is **correlated with a placeholder change** when it is an identity refusal (`elementNoLongerValid`, either ambiguity, or `valueUnconfirmed` whose message says the re-fetch found no field) on an exercised row whose target is still the same node and present. This is a correlation, not a proof that the placeholder alone caused it. A setup failure before the first action is an invalid row with its step, never a product miss.

**Gates** (`check.mjs` `gates`, qualify only): coverage (every planned row ran, and every unit of every head kept 80% of its rows valid); every valid fix row of a placeholder unit an exact success with a successful click, and at least one changing unit exercised on at least half its valid fix rows, any unit a lane never exercises listed (`placeholderFixed`); no wrong adoption and no wrong success on the fix; every `twin-removed` fix row an identity refusal from the click or the write, answered and with nothing delivered; every `twin-recreate` fix row an exact success; every stale-handle fix row (the twins and `solo-renamed`) answering exactly as its paired main row: the click's outcome, the write's outcome and the verdict (`staleAsMain`; the narrowed #398 design keeps the placeholder in the stale-handle walk and drops it only for the same handle); no paired row where main succeeded exactly and the fix did not (`observe-failed` counts against the fix); per unit, no more fix rows than main's on which something other than the cover activated (`presentation`).

`report.mjs <dir>` prints the tables from a downloaded run (`gh run download <id> -D <dir>`).

## Runs

Workflow `probe-398-qual.yml`, id `423477668`, [registration](https://github.com/SSFSKIM/cua/actions/runs/44470552784) (Ubuntu only). Main `44de35271408df6aba90b80f20487f6fe12574d6` throughout. Hosted macOS 26.7.2, images `20261102.0473.1` and `20261112.0504.1`; Chrome for Testing 156.0.8078.80, Safari 27.2, Electron 44.4.5 / Chromium 152.0.7977.130.

| Run | Kit | Mode | What it established |
|---|---|---|---|
| [Smoke](https://github.com/SSFSKIM/cua/actions/runs/44470569283) | `67919aba` | one trial per unit | Every lane reached its fixture in the background under the cover, zero invalid rows; every census lane ran. AppKit's focus and search hints never showed in the engine's re-observation (so those units are listed, not gated: `41905046`); the `typeset` unit was added after it. |
| [Phase 1 measurement](https://github.com/SSFSKIM/cua/actions/runs/44473534613) | `41905046` | ten per unit, main only, plus the census | Below. |

## Phase 1: main measured

### Collisions (the census, instrumented main)

Totals over reached windows (a page whose web area is on the requested site; an app scene whose window title matched). Unreached: CfT p06 (Wikipedia's create-account page left the site); Safari p03, p06, p09 (PyPI, Wikipedia, Dropbox); AppKit's Keyboard pane and Finder search (titles did not match).

| Lane | Windows reached | Text fields | With a placeholder | Field pairs | Placeholder the only difference, value counted / value left out | Windows with such a pair | Identical in all eleven, value counted / left out | Windows with an identical pair |
|---|---|---|---|---|---|---|---|---|
| Chrome for Testing | 45 of 46 | 289 | 132 | 7,055 | **8 / 17** | 3 (p15, p18, p22) | 125 / 241 | 7 |
| Safari | 43 of 46 | 139 | 51 | 389 | **8 / 12** | 2 (p15, p18) | 14 / 14 | 4 |
| AppKit apps | 13 of 15 | 28 | 23 | 112 | **20 / 20** | 1 (Contacts' new card) | 0 / 0 | 0 |

- **Where the placeholder is the only separator.** Web: unlabeled `<input>`s whose accessible name is empty and whose placeholder carries the meaning: p18 (demoqa's practice form: sibling inputs with alike ancestry), p15 (automationexercise's sign-up and log-in forms, alike but for the placeholder, in different sections), and with the value left out p22 (MUI's text-field demos, where a filled field and an empty one differ by placeholder). AppKit: Contacts' new card, 15 `AXTextField`s with no title or description, told apart only by their placeholders; 20 pairs, every one with alike ancestry (the census records shapes, never the text, so which fields they are is not recorded).
- **Identical pairs** (no attribute separates them even with the placeholder) are more common than placeholder-only ones: MUI's demo page alone has 105 (215 with the value left out), USPS's address lookup 10, Bootstrap's floating labels 5. These are already ambiguous on main.
- **Lineage of parents.** Of the placeholder-only pairs, 6 of 8 (CfT), 6 of 8 (Safari) and 20 of 20 (AppKit) also have alike ancestry level by level, so a parent chain does not separate them either: the placeholder is the only thing that tells these fields apart. A rule that drops it on a stale handle would make them ambiguous (or adopt the wrong one when only one survives).

### Placeholder changes, live (owned fixtures, main, 10 per unit)

All four lanes in the background under the cover, the witness held on every row; 190/190 rows valid per lane. "Exercised" means the fixture changed the placeholder and the engine's own re-observation after the actions saw it changed. Second action outcomes, as `valueUnconfirmed`/success; every `valueUnconfirmed` here says "the field could not be found again" (the post-write re-check), and the value was delivered in every one of them (`refused-delivered`).

| Unit (same handle) | Chrome for Testing | Safari | Electron | AppKit |
|---|---|---|---|---|
| static: set / type / typeset | 10 / 9 (+1 `typeUnconfirmed`) / 10 success | 10 / 10 / 10 success | 10 / 9 (+1 `typeUnconfirmed`) / 10 success | 10 / 9 (+1 `typeUnconfirmed`) / 10 success |
| focus-clear: click → set_value | **10/10 `valueUnconfirmed`** | **10/10** | **10/10** | 0/10 (not exercised: no AX-visible change) |
| focus-clear: click → type_text | 10/10 success | 10/10 success | 10/10 success | 10/10 success |
| focus-clear: type_text → set_value | **10/10** | **10/10** | **10/10** | 0/10 (not exercised) |
| rotate: click → set_value | **8/10** | **10/10** | **7/10** | **6/10** |
| rotate: click → type_text | 10/10 success | 10/10 success | 10/10 success | 10/10 success |
| rotate: type_text → set_value | **6/10** | **6/10** | **7/10** | **9/10** |
| input-switch: click → set_value | 0/10: success, though exercised 10/10 (the hint changed after the re-check) | **10/10** | 0/10: success, likewise | **10/10** |
| input-switch: type_text → set_value | **10/10** | **10/10** | **10/10** | **10/10** |
| input-switch: click → type_text | 10/10 success | 10/10 success | 10/10 success | 10/10 success |
| search hint: click → set_value | **10/10** | **10/10** | **10/10** | 0/10 (not exercised) |
| search hint: type_text → set_value | **10/10** | **10/10** | **10/10** | 0/10 (not exercised) |
| search hint: click → type_text | 10/10 success | 10/10 success | 10/10 success | 10/10 success |

Main's clicks all succeeded (the click resolves before the placeholder changes), and **type_text after a click never refused** (it re-finds nothing by identity). The failure is set_value's post-write `.ignoringValue` re-check: whenever the placeholder changed between the observation and that re-check, main answered `valueUnconfirmed` with the value in the field. No `elementNoLongerValid` appeared in a same-handle cell: the pre-write resolution never re-read (no invalidation) in these fixtures.

| Unit (stale handle, set) | Chrome for Testing | Safari | Electron | AppKit |
|---|---|---|---|---|
| twin recreated alike | `elementNoLongerValid` 10/10 | success 10/10 | `elementNoLongerValid` 10/10 | success 10/10 |
| twin recreated with another placeholder | `elementNoLongerValid` 10/10 | 10/10 | 10/10 | 10/10 |
| twin removed | `elementNoLongerValid` 10/10 | 10/10 | 10/10 | 10/10 |
| solo field recreated with another placeholder | `elementNoLongerValid` 10/10 | 10/10 | 10/10 | 10/10 |

Zero wrong adoptions and zero wrong successes on main in all 760 rows. In Chromium (CfT, Electron) main does not re-find even a field recreated exactly alike: the walk's strict match fails on something other than the placeholder (not identified here), so on those lanes the stale-handle cells cannot tell a strict walk from a looser one; Safari and AppKit can.
