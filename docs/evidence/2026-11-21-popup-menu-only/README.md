# #469: hosted macOS evidence for pressing only pop-up buttons known to open a menu

Every run in this document happened on GitHub-hosted macOS (image 20261117.0516.1, Chrome 157.0.8103.79, macOS 26.7.2), with the engines built unmodified from exact SHAs. The kit is `probe/463-measure` (`scripts/probe-463/`). Every table is in `scripts/probe-337/README.md` on that branch, in the sections "#463" (at `7915cade`), "#469 signal" (at `4f8c58d1`) and "#469 qual" (at `f50b970f`), each labelled with its engine head.

## The regression on main

#458 (PR #467) carries a coordinate click on a closed AXPopUpButton as the control's AXPress. Chrome's toolbar has two AXPopUpButtons that open a layer-0 bubble, not a menu: site information and tab search. With Chrome behind the person's window, #458 pressed them. That made Chrome frontmost and put its window over the person's, 10/10 each. The answer was a false `clickUnconfirmed`, because #458's check looks for a layer-101 menu. Measured in run [44959835166](https://github.com/SSFSKIM/cua/actions/runs/44959835166), and again on main in the qual below.

## No signal before the press, except the view class

Run [44970638020](https://github.com/SSFSKIM/cua/actions/runs/44970638020) read every attribute of every pop-up and toolbar button in Chrome, TextEdit and Script Editor, 4 rows each, without pressing anything.
- AXHasPopup with AXPopupValue `menu` also appears on tab search and the profile button, and both of those open bubbles.
- Chrome's views answer AXDOMClassList with the view class: `BrowserAppMenuButton`, `TabStripFlatEdgeButton`, `LocationIconView`.
- AppKit pop-ups answer −25205 (unsupported) to AXHasPopup, AXPopupValue and AXDOMClassList. Every AppKit AXPopUpButton measured opened a menu.

## The fix

#458's AXPress stays for a web page's `<select>` (in an AXWebArea, with the recorded option at the point), for AppKit pop-up buttons, and for the combo-box arrow. An AXPopUpButton outside any web area whose element answers AXDOMClassList is a browser view: it keeps main's posted click, with `popUpClick.kept: "browserView"`. If AXDOMClassList can't be read for any reason other than "unsupported", main's path is kept too (`viewClassUnread`). No class name is allowlisted, so Chrome's app menu also goes back to the posted click.

## Results

Fix `88c24213` ([44974548214](https://github.com/SSFSKIM/cua/actions/runs/44974548214)) against main `1a1956b2` ([44977678919](https://github.com/SSFSKIM/cua/actions/runs/44977678919)), 170 rows each. The PR head `6e578764` differs from `88c24213` only in docs wording. Frontmost was read with `lsappinfo front`, back to back for 4 s after the click, alongside a key-window watch on the person's Finder windows.

| Cell, shared-behind | Main | Fix |
|---|---|---|
| site information: answer | `clickUnconfirmed` 10/10 | ok, kept `browserView`, 10/10 |
| site information: Chrome frontmost at the end | 10/10 | **0/10** |
| site information: person's window covered at 1.8 s | 10/10 | **0/10** |
| tab search: answer | `clickUnconfirmed` 10/10 | ok, kept, 10/10 |
| tab search: Chrome frontmost at the end | 10/10 | **0/10** |
| tab search: person's window covered at 1.8 s | 10/10 | **0/10** |
| app menu: open and up at 1.8 s | 10/10 (pressed) | 10/10 (posted) |
| app menu: frontmost changed, person's window covered | 0, 0 | 0, 0 |

- **#458's cells and parity are identical on both engines.** That is 105 rows: TextEdit font, Script Editor language and Chrome `<select>` in #458's layouts a–d plus dedicated, the combo arrow, and a page button. Each was confirmed and up where it was before, with frontmost changed 0.
- **The person's focused window** stayed F1 in every sample of all 340 rows, on both engines.
- **An Electron toolbar pop-up** (a kit-built Electron 44 app with an `aria-haspopup="menu"` button) is page content. Neither engine takes #458's path for it, and its numbers are the same on both.

## Limits

- **A transient frontmost change remains.** On the fix, Chrome becomes frontmost for a moment and route 3's guard then puts Finder back: site information 10/10, tab search 7/10, seen 85–241 ms in. This is main's behaviour from before #458, the posted click for these buttons. #463 refuses these buttons behind in shared mode, which ends it.
- **The bubble then closes again** (site information open 5/10 and up 0, tab search open 4/10 and up 1), and the answer is ok. That is #463's case: route 3's restore closes the transient UI the click opened.
- **Chrome's app menu loses #458's confirmation.** It is posted now, and still opens and stays up behind in shared mode, 10/10. In dedicated mode the posted click puts Chrome's window over the person's, 5/5, where main's press didn't, 0/5. Chrome is not made frontmost in either. That is within #282's dedicated contract, where the window may come forward, but it is a change from main. #463 decides how Chromium pop-up buttons are answered behind.
- **In dedicated mode, site information and tab search make Chrome frontmost** and cover the person's window, 5/5 each, on both engines. This is not a #458 effect, and it is folded into #470's scope.
- **No class allowlist** was adopted.
