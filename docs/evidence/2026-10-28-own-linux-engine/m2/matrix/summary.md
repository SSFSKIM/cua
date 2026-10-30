# linux-engine-diff summary

## m2-final-matrix (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest / cua | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 / 2/2 | clean | takes | m2-final-matrix |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | m2-final-matrix |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 / 2/2 | clean | partial: takes keys; ignores clicks | m2-final-matrix |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 / 2/2 | clean | takes | m2-final-matrix |
| gnome-terminal (VTE) | gtk 3.24.41 | gnome-terminal-server / Gnome-terminal | at_spi (49) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) / 2/2 | clean | takes | m2-final-matrix |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m2-final-matrix |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m2-final-matrix |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 | 0/5 / 0/5 |  | clean | ignores | m2-final-matrix |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m2-final-matrix |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 4/5 | 5/5 / 0/5 |  | clean | partial: partial | m2-final-matrix |
| gnome-terminal (VTE) | gtk 3.24.41 | gnome-terminal-server / Gnome-terminal | at_spi (49) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m2-final-matrix |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m2-final-matrix |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `m2-final-matrix`)
- Firefox (Navigator / firefox; Gecko): takes keys; ignores clicks (run `m2-final-matrix`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m2-final-matrix`)

Background left alone (Acceptance 5): every request in a witness span; each engine's keys and clicks audited through xtrace in an untimed pass:

| family | witness pinned / newest / cua | audit pinned / newest / cua | cua |
|---|---|---|---|
| GTK3 gedit | clean / clean / clean | clean / clean / clean | PASS |
| GTK4 gnome-text-editor | clean / clean / clean | clean / clean / clean | PASS |
| Firefox | clean / clean / clean | clean / clean / clean | PASS |
| Chrome | clean / clean / clean | clean / clean / clean | PASS |
| gnome-terminal (VTE) | clean / clean / clean | clean / clean / clean | PASS |
| xterm | clean / clean / clean | clean / clean / clean | PASS |

The run is complete.

