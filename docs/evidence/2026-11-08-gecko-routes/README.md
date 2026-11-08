# #315: shared-mode pointers into a background Firefox page (hosted macOS, 2026-11-07/08)

All runs used GitHub-hosted macOS runners: Firefox 159.0, Chrome for Testing 156.0.8078.80 and Safari 27.2.
- **The baseline:** A is main fc3b0804.
- **The fix:** B is the fix branch, at the head each run names.
- **Engines and order:** each head ran in its own engine process, and the head order alternated by rep.
- **What every cell watched:** each ran behind a frontmost TextEdit, with the frontmost app, the key window and the window order sampled every 5 ms. The page also reported what it received: its pointer, mouse and click events, values and selections.

The kit is `probe/315-ab` (head 93031b2a), off main. Per-job results are under `~/.local/share/probe-315/` on the MacBook.

## Runs

- **The full A/B, B = 9abdd7e8:** https://github.com/SSFSKIM/cua/actions/runs/42457001051. Firefox ran 3 reps; Chrome and Safari ran 2 reps, in both modes.
- **Confirmations on acb88f72, the refusal wording:** https://github.com/SSFSKIM/cua/actions/runs/42459610340 (this also re-ran the sidebar and devtools clicks) and https://github.com/SSFSKIM/cua/actions/runs/42460845888 (set_value).
- **Confirmation on 146b76a7, set_value and select_text by the field's press:** https://github.com/SSFSKIM/cua/actions/runs/42462800495, plus an 8-rep Safari control, https://github.com/SSFSKIM/cua/actions/runs/42465445014.

The final head, 80ee16cf, changes only the refusal texts.

## Firefox, shared mode

| Cell | A (main) | B |
|---|---|---|
| Coordinate click: button, checkbox, radio | `clickUnconfirmed`, no effect, 0/3 | success through the element route (AXPress), effect 3/3; the checkbox's value check passes |
| Coordinate click on a link, or by token on the link's text | `clickUnconfirmed`, 0/3 | success, the AXLink ancestor pressed, 3/3 |
| By token: button, checkbox, radio, fields | success | identical |
| Coordinate click: text field, textarea, password | `clickUnconfirmed`; type_text lands 0/3 | focused by the field's press with the read-back (`focusStep press`); type_text lands 3/3 |
| A `/fixedtail` row below the top, by token | **0 of 18** | **18 of 18**, the AXLink ancestor pressed |
| Plain text: coordinate click, drag, double click | `clickUnconfirmed`; a double click put 2 pointer events on the page | `backgroundClickRefused`, nothing reached the page |
| Toolbar Reload | reloads, `clickUnconfirmed` | identical |
| set_value, unfocused text field or textarea | succeeds through a posted click; **raises Firefox above TextEdit for 26–30 ms after the hold** in 6 of 11 tries; a pointerdown reaches the page | **succeeds, value set 3/3, no raise, no pointerdown** |
| select_text, unfocused field | succeeds; **raised 3/3**; a pointerdown reaches the page | **succeeds, selection right 3/3, no raise, no pointerdown** |
| set_value or select_text, field already focused | succeeds, no events | identical |
| Raises in any shared cell | as above | **none** |

- **What the page sees from B's press:** trusted mousedown, mouseup and click events, but no pointerdown. That is Gecko's own way of carrying AXPress, and it is the same on a page button.
- **What B posted:** nothing reached the page.

## Firefox, dedicated mode

Every cell gave the same answer and effect on both heads, with the same raise.

## Chrome for Testing and Safari, both modes

- **Same on both heads:** the answer, the element-click record, the effect, the page events, typing, and set_value.
- **Safari raises in shared mode** differed by one in a few cells, in both directions.
- **Safari's posted set_value fallback raises Safari 14–33 ms after the hold on both heads:** A 6 of 8 tries, B 5 of 8. That is main's behaviour, on a path B does not touch, and it is recorded on #324.

## Sidebar and devtools

Firefox's bookmarks sidebar and its devtools answer hits inside an AXWebArea:
- the sidebar's body: 307 of 308 grid points;
- devtools: 239 of 240 grid points;
- the toolbar: 0 of 124.

What lies outside every web area is only XUL chrome: the toolbar and the sidebar's header. B presses devtools' buttons through the element route, 2 of 2, and posts the sidebar header's button as main does. This is evidence for a later change that would count the toolbar as accepting the first mouse (#318).

## Error texts on B (final, 80ee16cf)

- **A Firefox page refusal:** "Firefox's web page does not accept a background click; use a dedicated desktop, or ask the person to bring Firefox forward. A text field on the page still works in the background: click the field by its element ID, which focuses it through accessibility, then type or set its value"
- **Chromium's refusal, now worded the same way:** "…use a dedicated desktop, or ask the person to bring <App> forward"
- **When the field can't be focused,** there are two texts. Each names dedicated mode and the person, and claims only what the code guarantees. See the #315 Decision Log entry.
