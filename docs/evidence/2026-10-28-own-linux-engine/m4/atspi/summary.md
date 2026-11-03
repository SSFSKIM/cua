# linux-engine-diff summary

## t55-pass (experiment atspi)

On the probe's own private display :1, with cua-engine's per-element read of each window as the reference. "Same structure" is the same nodes in the same places with the same Name, Description and states, whatever libatspi's table makes of the role numbers.

### Who answers `Cache.GetItems`

| family | toolkit | tree | GetItems | signature (advertised) | items | window subtree: cache / read / both | only in the cache / only in the read | fields differing | same structure | -1 index / count (whole answer) |
|---|---|---|---|---|---:|---|---|---|---|---|
| gedit | gtk 3.24.41 | at_spi | Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist | – | – | – | – | – | – | – |
| gnome-text-editor | GTK 4.14.5 | at_spi | answers | current | 66 | 65 / 64 / 64 | 1 / 0 | role 58, children 3 | no | 2 / 0 |
| kate | Qt 5.15.13 | x11 | answers | legacy (advertised `a((so)(so)a(so)assusau)`) | 0 | – | – | – | – | 0 / 0 |
| qtcreator | Qt 6.4.2 | at_spi | answers | legacy (advertised `a((so)(so)a(so)assusau)`) | 0 | 0 / 1261 / 0 | 0 / 1261 | none | no | 0 / 0 |
| firefox | Gecko 159.0 | at_spi | Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist | – | – | – | – | – | – | – |
| chrome | Chromium 1.0 | at_spi | Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist | – | – | – | – | – | – | – |
| electron | Chromium 1.0 | at_spi | Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist | – | – | – | – | – | – | – |
| writer | gtk 3.24.41 | at_spi | Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist | – | – | – | – | – | – | – |
| writer-gen | – | x11 | no accessibility provider | – | – | – | – | – | – | – |
| gnome-terminal | gtk 3.24.41 | at_spi | Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist | – | – | – | – | – | – | – |
| xterm | – | x11 | no accessibility provider | – | – | – | – | – | – | – |

gnome-text-editor: the cache holds 1 node(s) the read does not: panel (GetRoleName generic) at index 1 under a parent whose child count is 1, not listed by the parent's GetChildren, GetIndexInParent 1.

atspi-gtk4 with its menu open: the cache holds 1 node(s) the read does not: panel (GetRoleName generic) at index 1 under a parent whose child count is 1, not listed by the parent's GetChildren, GetIndexInParent 1.

### Role numbers against `GetRoleName`, through libatspi's table (every node both reads hold, in the windows above and the open menus)

| number | libatspi | GetRoleName (nodes) |
|---:|---|---|
| 23 | frame | application (2) |
| 29 | label | label (6) |
| 33 | menu | menu (1) |
| 34 | menu bar | menu bar (1) |
| 35 | menu item | menu item (4) |
| 39 | panel | generic (46), group (11), tab panel (6) |
| 43 | push button | button (8) |
| 49 | scroll pane | generic (2) |
| 61 | text | text box (1) |
| 62 | toggle button | toggle button (4) |

92 nodes; the table names 76 of them otherwise than GetRoleName; numbers GetRoleName names several ways: 39.

### Open menus (the scene opens its own)

| scene | menu open | GetItems | items | menu nodes (cache / read) | only in the cache / only in the read | fields differing | equal to the read | same structure |
|---|---|---|---:|---|---|---|---|---|
| atspi-gtk4 | yes | current | 30 | 6 / 6 | 1 / 0 | role 18, children 1 | no | no |

### A changing tree (30 pairs: GetItems, then the per-element read; a pair is quiet when no change fell inside it or within 50 ms before it)

| scene | changes during the pairs | pairs | equal to the read | same structure | moving parts as the read has them |
|---|---:|---|---|---|---|
| atspi-gtk4 | 11 | 24 quiet | 0 | 0 | 24 |
| atspi-gtk4 | 11 | 6 straddling | 0 | 0 | 6 |

### Qt 5 and Qt 6 (the harness scene: its own menu open, then its tree changing)

| scene | toolkit | signature (advertised) | items with the menu open | read nodes (menu nodes) | items while changing |
|---|---|---|---:|---|---|
| atspi-qt5 | Qt 5.15.13 | legacy (advertised `a((so)(so)a(so)assusau)`) | 0 | 13 (10) | 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 |
| atspi-qt6 | Qt 6.4.2 | legacy (advertised `a((so)(so)a(so)assusau)`) | 0 | 13 (10) | 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 |

### GTK 4 `EditableText` (one XTEST key, then `InsertText`, then two XTEST Ctrl+Z; the control, in a window of its own: the key, then one Ctrl+Z)

| widget | role | EditableText methods | GetText(0, -1) gives the whole text | SetCaretOffset | control: Ctrl+Z takes the key back | InsertText answer | inserted | first Ctrl+Z takes the insert back | second takes the key back | the insert raised | the key raised |
|---|---|---|---|---|---|---|---|---|---|---|---|
| atspi-gtk4 text-view | text box | CopyText, CutText, DeleteText, InsertText, PasteText, SetTextContents | yes | error: Call failed: | yes | yes | yes | yes | yes | buffer insert-text, buffer changed | key-pressed, buffer begin-user-action, buffer insert-text, buffer changed, buffer end-user-action, buffer can-undo |
| atspi-gtk4 entry | text box | CopyText, CutText, DeleteText, InsertText, PasteText, SetTextContents | no | yes | yes | yes | yes | no | no | entry inserted-text, entry changed | key-pressed, entry inserted-text, entry changed |
| gnome-text-editor document | text box | CopyText, CutText, DeleteText, InsertText, PasteText, SetTextContents | yes | error: Call failed: | yes | yes | yes | yes | yes | not recorded | not recorded |

**Cache.GetItems: not adopted.** gedit does not answer GetItems (Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist), so its tree still needs the per-element read; kate answers GetItems (the legacy signature) with no items; qtcreator answers GetItems (the legacy signature) with no items; firefox does not answer GetItems (Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist), so its tree still needs the per-element read; chrome does not answer GetItems (Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist), so its tree still needs the per-element read; electron does not answer GetItems (Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist), so its tree still needs the per-element read; writer does not answer GetItems (Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist), so its tree still needs the per-element read; gnome-terminal does not answer GetItems (Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn't exist), so its tree still needs the per-element read; atspi-qt5 (its menu open) answers GetItems (the legacy signature) with no items; atspi-qt6 (its menu open) answers GetItems (the legacy signature) with no items; gnome-text-editor's window: the tree rebuilt from GetItems is not the per-element read; qtcreator's window: the tree rebuilt from GetItems is not the per-element read; atspi-gtk4 with its menu open: the tree rebuilt from GetItems is not the per-element read; atspi-gtk4 changing, quiet pairs: the tree rebuilt from GetItems is not the per-element read; 76 nodes' role numbers name another role through libatspi's table than GetRoleName does; numbers GetRoleName names several ways: 39.

desktop: started with no window active, ended with 0x00a00004 active (harness), neither acted on; holder none; the harness's own trace: 545 requests, 134 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests); left undone, the window not the run's then: close on 0x00a00002

