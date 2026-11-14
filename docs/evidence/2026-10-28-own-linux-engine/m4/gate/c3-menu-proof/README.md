# Candidate 3's menu detection, proven live per family (task 78; development runs, not counted)

This is the evidence for the Decision Log entry "a requested context menu is confirmed, or answered menuUnconfirmed;
candidate 3" (rulings 684–690).

- **Display and engine:** a private display (the harness's own X server), openbox, each family's harness scene opened
  through `openFamily`.
- **Candidate:** a musl release build of the fix's working tree before its commit, `cua-engine 0.4.0 (7c600386ced5)`
  plus the uncommitted fix, sha256 `cfc60ad1…` (`candidate-version.txt`).
- **Scripts:** `scripts/menu-proof.mjs` (its page is `scripts/menu-proof.html`), run by `scripts/proof.sh` and
  `scripts/proof-chrome.sh` under the host lock. The forced stall is task 77's `freeze-check.mjs`, unchanged, pointed
  at this candidate.

| Run | What |
|---|---|
| `proof3-cua`, `proof3-pinned` | Chrome: cua and the pinned vendor build. Chrome's popups were sampled every ~15 ms through each request. |
| `proof4-menus` | Electron, Firefox, GTK 4, Qt 6. Qt 5 and LibreOffice are in `proof5` (here an `xdotool --sync` hang ended their step, and a Firefox step failed). |
| `proof4-frz` | Chrome's forced stall. The browser was stopped 2.6 s after the Copy item's activation, and the Copy was answered `clipboard update timed out; the application may still complete the Copy later, and its menus on this window may stay unresponsive`. Chrome served the Copy late, and the next reads were ok. |
| `proof5-menus` | Chrome with the window in front and the coordinate routes; Firefox, GTK 4, Qt 5, Qt 6, LibreOffice. |

Each family's result is in task 78's report (the per-family table). Tickets C, D and E are drafted from these runs.

`settle-pilot/` is a development run of the redefined settle cells, 5 trials each, idle, on the experiment's own
display (`settle-pilot.sh`, the same candidate):
- `chrome-input` and `electron-input` `secondary_action`, showContextMenu on the Native button: 5/5 ok, confirmed in
  33–57 ms, the page's context counter on `native`, its Escape count still 0, the desktop clean;
- `menu_unconfirmed`, the Menu button whose menu the page cancels: 5/5 menuUnconfirmed after 1.01–1.06 s, the counter
  on `menu`;
- `right_click` beside them: 5/5;
- the audits clean.
It exits 1 only because a series of 5 is not the rule's 30.
