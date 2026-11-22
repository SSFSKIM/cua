# #463: hosted macOS evidence for background clicks on controls that open transient UI

Every run in this document happened on GitHub-hosted macOS (image 20261117.0516.1, Chrome 157.0.8103.79, macOS 26.7.2), with the engines built unmodified from exact SHAs. The kit is `probe/463-measure` (`scripts/probe-463/`): a 10 ms window-list sampler, a key-window watch on the person's Finder windows, and `lsappinfo front` read back to back for 4 s after the click. Every table is in `scripts/probe-337/README.md` on that branch: §"#463" at `7915cade` for the measurement and §"#463 qual" at `a702d13d` for the qualification.

## The bug on main

The setup: the app is behind the person's window in shared mode. A coordinate click on a control that opens transient UI answers ok, but the end of route 3's fake activation closes the UI again before 1.8 s. The raise is not what closes it. Main `1a1956b2`, run [44959835166](https://github.com/SSFSKIM/cua/actions/runs/44959835166):

| Control | UI it opens | Closed before 1.8 s |
|---|---|---|
| TextEdit's `list style` pull-down (an AXMenuButton) | a menu | 6/6 |
| TextEdit's context menu | a menu | 6/6 |
| TextEdit's colour-well popover | a popover | 6/6 |
| Chrome's page context menu | a menu | 4/4 opened |
| Chrome's bookmark star | a bubble | 3/3 opened |
| Chrome's profile button | a bubble | 1/1 opened |

In every one of these cells, the UI stays up when the app is frontmost.

## The fix

All of this applies only while the app is behind.

- **Delivered as the element's action.** This needs #458's agreement: the recorded node and the live hit name the same control.
  - An AppKit AXMenuButton or AXColorWell gets AXPress. The click is confirmed when a new app window appears at the control, at any layer.
  - An `<input list>` gets the focus hold, then AXPress. The click is confirmed when the layer-999 suggestion window appears.
  - If neither appears within 1.5 s, the answer is `clickUnconfirmed`.
  - The focused-window restore from #458 is unchanged.
  - If the element's action itself brings the app to the front, the answer says so (`popUpClick.activated`).
- **Refused in shared mode** with `backgroundClickRefused`, which names the ways through: bring the app to the front first, use keys, or call Show Menu on an element by its ID.
  - Chromium views outside a page that advertise a popup (`browserView`): the app menu, tab search, site information and the profile button.
  - Every right click (`rightClick`). `AXShowMenu` takes no point, and nothing proves an element's menu doesn't depend on where it was clicked.
- **Dedicated mode and the frontmost app** keep main's path for the refused kinds.

## Results

The fix is `2e2952ee` ([44983600954](https://github.com/SSFSKIM/cua/actions/runs/44983600954)). Its engine code is identical to `0c370d1a`. It ran against main `9c6368ce`, which is 1a1956b2 plus #469 ([44987874604](https://github.com/SSFSKIM/cua/actions/runs/44987874604)). Each engine ran 240 rows, and every layout read back as built.

| Cell | Main | Fix |
|---|---|---|
| `list style`, shared-behind | ok; opened 5, closed 5, up 0 | confirmed; up 5/5 |
| `list style`, dedicated | opened 1/5 | confirmed; up 5/5 |
| colour well, shared-behind | closed 5/5 | confirmed; up 5/5 |
| colour well, dedicated | nothing opened | confirmed; up 5/5 |
| `<input list>` arrow, shared and dedicated | ok, caret placed, nothing opened | confirmed; list up 5/5 each |
| right click, shared-behind (TextEdit, page) | opened 1/5 each | refused 5/5 each |
| Chrome app menu, profile, site information, tab search, shared-behind | opened 2–5/5; transient frontmost change in 2–4/5 | refused 5/5 each, frontmost change 0 |

The bar from ruling 1036:
- **Closed by the restore on the delivered kinds: 0/35.**
- **Refused cells:** 35/35 rows posted nothing, opened nothing and fired no page event.
- **The person's focused window changed in 0/175 behind rows.**
- **Frontmost changes, shared-behind:** the only cell is the bookmark star, which stays on main's path (#471): 4/5 transient and 0 at the end, against 2/5 on main.
- **Frontmost changes, dedicated:** the same as main. That is #470's scope.
- **False confirmed 0 and false unconfirmed 0** on both engines.
- **False ok:** main 86, fix 36. All 36 are in cells the fix leaves on main's path (see Limits).
- **Parity is identical:** a plain button, Back, a page link, `<select>`, the font pop-up, the combo arrow, an open menu's item (#454), a caret click, and right clicks with the app frontmost. The one exception is the named change: a click on an `<input list>`'s text now opens its list, confirmed 5/5, where main only placed the caret.

## Limits

- **The bookmark star** keeps main's false ok in shared-behind (closed 3/5, nothing opened 2/5). No attribute separates it from Back. Tracked in #471.
- **Activation after the panel is up is not watched.** If an app makes itself frontmost only after its panel is already showing, the answer won't report it. This is unmeasured, and #472 holds the measurement.
- **Dedicated mode keeps main's path for the refused kinds.**
  - Right clicks answer a false ok: TextEdit 5/5, a Chrome page 1/5. So does `<input type=color>`, 5/5.
  - `<input type=date>` answers a false ok both frontmost and dedicated, 5/5 each, on both engines.
  - All of these are in #475.
  - Chrome's toolbar bubbles bring Chrome to the front in dedicated mode, 5/5, on both engines. That is in #470.
- **Chrome's app menu, profile, tab search and site information** are now refused while Chrome is behind in shared mode. Those clicks used to open the UI sometimes.
- **ARIA comboboxes** that read like `<input list>` (AXPopupValue `listbox`, AXAutocompleteValue `list`) get the element click too. When no suggestion window comes, they answer `clickUnconfirmed`.
- **One `list style` row** reported its window-order restore incomplete when it hit the time bound. The answer said so, and the person's window was still on top at 1.8 s.
- **The menu-button and colour-well confirmation** accepts any new window of the app's at the control. This is logged in `tech-debt-tracker.md`.
- **TextEdit's `document actions`** button reads AXEnabled false on this image, so it stays on main's path. Its popover is up 5/5 in every mode on both engines.
