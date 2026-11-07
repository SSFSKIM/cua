# #287: the #282–#311 chain on stable Chrome, Safari, Firefox and VS Code (hosted macOS, 2026-11-07)

All runs used GitHub-hosted macOS runners (`macos-latest`, a 1024 × 768 screen), 2 reps, main's engine at 51b473fc built
on the runner (release), instrumented on the runner only where a kit needs the guard's record (probe-299's
`instrument.py` for #296 and #305, probe-304's for #304). The kits are copied unchanged from their probe branches onto
`probe/287-hosted` (`.github/workflows/probe-287.yml`, `scripts/probe-287/run.sh`); `scripts/probe-287/patch-kits.py`
and the later commits add only a browser switch (`scripts/probe-287/browser.mjs`) and the fixes listed under "Kit
changes". Chrome groups run Chrome for Testing (the control) and stable Chrome in one job, the order alternating by
rep. Per-job results are under `~/.local/share/probe-287/run-<id>/` on the MacBook; the one-line readers are
`scripts/probe-287/offline/`.

## Configs

| Config | Version | Source | Accessibility |
|---|---|---|---|
| Chrome for Testing (control) | 156.0.8078.80 (image 20261102, macOS 26.7.2), 156.0.8078.47 (image 20261026, 26.6.2) | the image | as #282 |
| Stable Google Chrome | 156.0.8078.80; .48 and .81 on the older image | the image (a Homebrew cask, quarantine `Homebrew Cask`); not installed by the probe | `BrowserCrApplication`, lists AXEnhancedUserInterface |
| Safari | 27.2 | the system | lists AXEnhancedUserInterface |
| Firefox | 159.0 (20261102), 158.0.1 (20261026) | the image | off until an AX client's first contact (see below) |
| VS Code | 1.144.0, 1.143.1 | `brew install --cask visual-studio-code`, 34 s, no login | `AtomApplication`, lists AXManualAccessibility |

**The enablement write per browser** (the observation's `enabled` / `enablementWrite` / `enablementWriteError`, recon
run 42374569976, 2 reps alike):

| | attribute written | write | AXError | complete mode after the write | released at end_task |
|---|---|---|---|---|---|
| CfT | AXEnhancedUserInterface | success | −25208 | 1.3–1.6 s (checkbox AXPress after the observation), 2.08–2.15 s after a bare EUI write | EUI false in 26–104 ms |
| Stable Chrome | AXEnhancedUserInterface | success | −25208 | 1.6 s; 2.09–2.16 s after a bare EUI write | EUI false in 11–16 ms |
| Safari | AXEnhancedUserInterface | success | −25208 | (AXPress present before any write) | EUI false 300 ms after |
| Firefox | none (prior `true`) | – | – | its tree appears at the engine's first contact | not owned, stays true |
| VS Code | AXManualAccessibility | success | none (0) | ~2.4 s (365-element tree); EUI −25208 works too, 2.6–2.9 s | `released: 1`, tree stays (below) |

The AXManualAccessibility write itself (probe-288 `t/manual*`) answers −25205 (attribute unsupported) on both Chromes
and does nothing within 6 s; EUI is the route there, as #292 found.

## Stable Chrome against Chrome for Testing

Runs: 42375146858 (#282, #283, #288 probe and live, #294), 42379297174 (`keys-x`), 42379365501 (#296),
42382030666 (#305, #304).

| Kit / cell | CfT | Stable | Class |
|---|---|---|---|
| #282 shared checkbox, button, at once, after 3.4 s | AXPress, changed once | the same | holds |
| #282 shared textarea | #283 focus, placed | the same | holds |
| #282 dedicated textarea | delivered 1/1/1/1, TextEdit front | the same | holds |
| #282 toolbar Reload | route 3, reloaded once | the same | holds |
| #282 ⌘L then checkbox / textarea | element route / focus | the same | holds |
| #282 ⌘L then Apply button | AXPress 4/4 | `backgroundClickRefused` 3/4, AXPress 1/4; ⌘L then Escape: AXPress 2/2 | diverges, cosmetic |
| #282 no observation | `noScreenshotForCoordinates` | the same | holds |
| #282 geometry | frame and AXActivationPoint (−1, 769) unchanged | the same | holds |
| #282 AXPress after one observation | 1.3–1.6 s | 1.6 s | holds |
| element click by token (button, checkbox, textarea) | element route / focus | the same | holds |
| #283, 17 cells × 2 reps | every caret as expected, 0 pointer events | the same; fresh 1.05–1.74 s against 1.23–1.78 s | holds |
| #288/#292 end_task, grace (31.3–32.0 s), re-observation, SIGTERM | released | released, same bounds | holds |
| #288 click after a grace release | element-routed, 2.45–2.54 s | 2.33–2.41 s | holds |
| #288 first click, released Reload, released text | as #295 | the same | holds |
| EUI's window animation | 4–7 frames | 4–7 frames | holds |
| #294 toolbar re-layout | Reload leaves the observed point ~18 s after launch | the same (Forward takes its place) | holds |
| #296, 53 cells × 2 reps (chrome and final groups) | every kept cell kept with its effect, every stale cell refused | identical cell by cell | holds |
| #305 sweep (GitHub, Wikipedia), popover | 0 refused; popover as #308 | 0 refused; the same | holds |
| #301/#304 coverage, 21 pages, up to 4 positions | 100 % checked everywhere | 100 %; 0 of 156 rows differ; cut flags identical; walk ms p50 +20 (p10 −407, p90 +757) | holds |

**The ⌘L divergence.** Stable Chrome's ⌘L opens the omnibox's zero-suggest popup ("Ask Google about this page", AI
Mode) over the page, covering the Apply button (x 480–783). The hit-test at the point finds no element of the target
window, so the guard keeps it (`noHit`) and #282's walk, with no hit, refuses it as a possible web area. The refusal
is right (the click would hit the popup); its message blames the page. Chrome for Testing shows no such popup.

## Safari

Runs: 42375146858 (`safari-a`), 42379297174 (`keys-x`). #296, #305 and #304 had Safari already.

| Cell | Result | Class |
|---|---|---|
| #282 shared checkbox, button, textarea, at once, after 3.4 s | the engine clicks Safari's AXActivationPoint (560, 47, inside the window); the action's own down is delivered: pointer 1/1/1/1, the control changes once, the textarea focuses, TextEdit stays front; success | holds: no `clickUnconfirmed` arises |
| #282 dedicated textarea, toolbar Reload | delivered | holds |
| #282 ⌘L then checkbox / button / textarea | success, nothing delivered, 12 of 12 | **diverges: false success** |
| F19 then a click; ⌘L then Escape then a click | delivered, 8 of 8 | holds |
| #283, 17 cells × 2 reps | the posted click is delivered: focus and caret where WebKit puts them, type_text lands | holds |
| element click by token: button, checkbox | AXPress, the control changes | holds |
| element click by token: textarea | success; the focused element stays the web area, 2 of 2 | **diverges: false success** |

**⌘L.** Safari 27's ⌘L blanks the page under its address-field overlay (`screen-b-shared_cmdL_button.png` in run
42375146858's `safari-a-rep1`). The overlay is not in the AX tree: the hit-test still answers the page's button
(`sameElement`), the click joins ⌘L's spent hold (no consumed arm, so no `clickUnconfirmed`) and lands on the overlay.

**Textarea by token.** The element click's `advertised` AXPress on Safari's AXTextArea does not focus it; #282's
allowlist and #283's focus route are Chromium's only.

## Firefox

Runs: 42375146858 and 42376355521 (recon), 42379297174 (`firefox-a`, `firefox-s296`, `firefox-s305`, `keys-x`),
42382030666 (`firefox-cov`), 42386958490 and 42388802262 (timeline).

**How accessibility turned on.** A fresh profile's window exposes 5 elements and no page. The engine's first
observation (its application role read and walk) turns Gecko's accessibility on, with no pref; Firefox's
AXEnhancedUserInterface then reads true, so the engine writes nothing and owns nothing. `accessibility.force_disabled`
−1 exposes the tree before contact. Firefox 159's fresh profile shows a tab-modal "Welcome to Firefox" Terms of Use
dialog over the first page; `browser.mjs` lists the prefs that skip it.

| Cell | Result | Class |
|---|---|---|
| First observation's AXWebArea frame | {0, 0, 0, 0} on the observation that turns accessibility on (4 of 4 first observations in the timeline runs; real 0.55 s later; correct with the force pref) | **diverges: false refusal** |
| #282 page cells on that observation | `screenChangedSinceScreenshot` `interactiveHit` (recorded AXScrollArea), every cell, both reps | **false refusal**, from the row above |
| #282/#283 shared click on a page control, record good | posted, lost (pointer 0, no focus); `clickUnconfirmed`, 34 of 34 | holds (honest), but **lost coverage** |
| #282 toolbar Reload | reloads, answers `clickUnconfirmed`, 3 of 3 | diverges, cosmetic |
| element click by token: button, checkbox, textarea | AXPress lands: Apply, the checkbox, the textarea focused, 6 of 6 | holds |
| #296, 20 cells × 2 reps, warm page | stale cells refused with the right reasons, both modes; kept cells kept; dedicated clicks land | holds |
| #305 sweep, Wikipedia and GitHub (dedicated) | 0 refused of 32 + 31 and 32 + 22 posted | holds |
| #304 coverage, top of 6 pages | 100 % checked, local-fixed-tail 88 % | holds at top |
| #304 coverage, 25–90 % | Firefox exposes no scroll bar to position by | n/a |
| A web area with 2,501 children (big local pages) | printed with no children (36–50 nodes, Chrome 3,989); AXVisibleChildren answers −25212 | **diverges: lost coverage** |

**Mechanisms.**
- *Zero frame.* AXWebArea is a clipping role in `screenshotNodes` and `visibleFrame`; a zero frame leaves every page
  node with no shown part, so the record's deepest node at a page point is the scroll area, and the live hit (an
  interactive control) is `interactiveHit`.
- *Shared clicks lost.* Firefox's AXActivationPoint (430, 47) lies on a control (`activationClick: control`), so the
  engine does not click it; the action's own down consumes the arm and Gecko's content view does not accept first
  mouse. The answer is truthful. Its AX actions do work in the background.
- *Width rule.* The vendor's width rule takes an element's visible subset above 100 children and prints none above
  499 without one. Chrome answers AXVisibleChildren (all 2,501); Firefox does not.

## VS Code (Electron)

Runs: 42376953140 and 42379297174 (EUI cells), 42388802262 (clicks), 42376953140 and 42382030666 (sweep).

| Cell | Result | Class |
|---|---|---|
| AXManualAccessibility, EUI writes | above | holds |
| Release at end_task, SIGTERM, 30 s grace | `released: 1`, but the tree stays complete (352/365 elements 3 s after each, and through 36 s idle) | diverges, cosmetic |
| AXActivationPoint | (−1, 769), as Chrome's | – |
| Shared click on an explorer row (AXRow), Monaco's text | `backgroundClickRefused` `roleNotAllowed`, 6 of 6 | holds (#282's allowlist) |
| Shared click on Toggle Panel (AXCheckBox) | element-routed AXPress, success 2 of 2; the panel opened in 1 rep, the other read 0 after | unresolved |
| Dedicated clicks (row, text, toggle) | delivered: other.txt opened, the panel toggled | holds |
| #305 sweep (dedicated) | 0 refused of 20–23, 3 runs | holds |

## Kit changes (all off main)

- The browser switch (`browser.mjs`, `patch-kits.py`); Safari and Firefox launchers in #282, #283, #296, #304, #305;
  `runFirefox` and `runVSCode` in #305, `runFirefox` in #304.
- #296: Firefox targets by title (Firefox exposes no AXDOMClassList); sockets in a short `mkdtemp` directory (a deep
  output directory put labels' socket paths past 103 bytes).
- #304: one engine process serves both heads when they are one binary: a second process of the same binary had every
  screen capture time out, and then the first's (run 42376953140).
- #305: `P287_SWEEP_FRAMES` picks by node frame where the record shows nothing.
- #283: on Firefox the point is taken from the web area's parent scroll area, since its web area may answer a zero
  frame.
- #282: cells for element clicks by token, F19 then a click, and ⌘L then Escape then a click.
