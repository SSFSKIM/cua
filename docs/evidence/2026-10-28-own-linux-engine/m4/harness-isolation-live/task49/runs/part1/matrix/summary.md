# linux-engine-diff summary

## t49-matrix (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest / cua | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (486) | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | 0/1 (1 failed) / 1/1 / 1/1 | clean | takes | t49-matrix |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | ?/1 / 0/1 / ?/1 (1 failed) | ?/1 / 0/1 / ?/1 (1 failed) | ?/1 (1 failed) / 0/1 (1 failed) / 0/1 (1 failed) | clean | ignores | t49-matrix |
| GTK 4 button (harness scene) | GTK 4.14.5 |  /  | at_spi (3) | ?/1 / ?/1 / ?/1 (1 failed) | ?/1 / ?/1 / ?/1 (1 failed) | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| GTK 4 input (harness scene) | GTK 4.14.5 |  /  | at_spi (11) | ?/1 / ?/1 / ?/1 (1 failed) | ?/1 / ?/1 / ?/1 (1 failed) | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| Qt 5 input (harness scene) | Qt 5.15.13 | qt-input.py / qt-input.py | at_spi (1) | ?/1 / ?/1 / ?/1 | ?/1 / ?/1 / ?/1 | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| Qt 6 input (harness scene) | Qt 6.4.2 | qt-input.py / qt-input.py | at_spi (1) | ?/1 / ?/1 / ?/1 | ?/1 / ?/1 / ?/1 | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| Qt 5 Breeze (harness scene) | Qt 5.15.13 | qt-input.py / qt-input.py | at_spi (2) | ?/1 / ?/1 / ?/1 | ?/1 / ?/1 / ?/1 | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| Qt 5 Fusion (harness scene) | Qt 5.15.13 | qt-input.py / qt-input.py | at_spi (2) | ?/1 / ?/1 / ?/1 | ?/1 / ?/1 / ?/1 | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| GTK 3 scale (harness scene) | gtk 3.24.41 | gtk-scale.py / Gtk-scale.py | at_spi (2) | ?/1 / ?/1 / ?/1 | ?/1 / ?/1 / ?/1 | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| Qt 5 kate | Qt 5.15.13 | kate / kate | at_spi (893) | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 (1 failed) / 1/1 (1 failed) | clean | takes | t49-matrix |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 (1 failed) / 1/1 (1 failed) | clean | takes | t49-matrix |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/1 / 0/1 / ?/1 (1 failed) | 1/1 / 1/1 / 1/1 | 0/1 (1 failed) / 1/1 / 1/1 | clean | partial: takes keys; ignores clicks | t49-matrix |
| Chrome | Chromium 1.0 | google-chrome (/tmp/cua171-task49-80xSNE/cua171-diff-t49-matrix-oYLZ9p/chrome-profile) / Google-chrome | at_spi (222) | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | clean | takes | t49-matrix |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | 0/1 (1 failed) / 1/1 / 1/1 | clean | takes | t49-matrix |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 (1 failed) | clean | takes | t49-matrix |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/1 / ?/1 / ?/1 | 1/1 / 1/1 / 1/1 | ?/1 (1 failed) / ?/1 / ?/1 (1 failed) | clean | partial: takes keys; clicks unknown | t49-matrix |
| GTK 3 tree view, 10,000 rows (harness scene) | gtk 3.24.41 | gtk-table.py / Gtk-table.py | at_spi (41) | ?/1 / ?/1 / ?/1 | ?/1 / ?/1 / ?/1 | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| LibreOffice Calc (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-calc | at_spi (2431) | ?/1 / ?/1 / ?/1 | ?/1 / ?/1 / ?/1 | ?/1 (1 failed) / ?/1 (1 failed) / ?/1 (1 failed) | clean | unknown | t49-matrix |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 1/1 / 1/1 / 1/1 | 0/1 / 0/1 / ?/1 (1 failed) | 0/1 (1 failed) / 0/1 (1 failed) / 0/1 (1 failed) | clean | partial: takes clicks; ignores keys | t49-matrix |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/1 / 0/1 / 0/1 | 1/1 / 1/1 / ?/1 (1 failed) | 0/1 (1 failed) / 0/1 (1 failed) / 0/1 (1 failed) | clean | partial: takes keys; ignores clicks | t49-matrix |
| gnome-terminal (VTE) | gtk 3.24.41 | gnome-terminal-server / Gnome-terminal | at_spi (49) | 1/1 / 1/1 / 1/1 | 1/1 / 1/1 / 1/1 | 0/1 (1 failed) / 0/1 (1 failed) / 1/1 | clean | takes | t49-matrix |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (486) | 1/1 / 1/1 | 1/1 / 1/1 |  | clean | takes | t49-matrix |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | ?/1 (1 failed) / ?/1 (1 failed) | ?/1 (1 failed) / ?/1 (1 failed) |  | clean | unknown | t49-matrix |
| GTK 4 button (harness scene) | GTK 4.14.5 |  /  | at_spi (3) | ?/1 (1 failed) / ?/1 (1 failed) | ?/1 (1 failed) / ?/1 (1 failed) |  | clean | unknown | t49-matrix |
| GTK 4 input (harness scene) | GTK 4.14.5 |  /  | at_spi (11) | ?/1 (1 failed) / ?/1 (1 failed) | ?/1 (1 failed) / ?/1 (1 failed) |  | clean | unknown | t49-matrix |
| Qt 5 input (harness scene) | Qt 5.15.13 | qt-input.py / qt-input.py | at_spi (1) | ?/1 / ?/1 | ?/1 / ?/1 |  | clean | unknown | t49-matrix |
| Qt 6 input (harness scene) | Qt 6.4.2 | qt-input.py / qt-input.py | at_spi (1) | ?/1 / ?/1 | ?/1 / ?/1 |  | clean | unknown | t49-matrix |
| Qt 5 Breeze (harness scene) | Qt 5.15.13 | qt-input.py / qt-input.py | at_spi (2) | ?/1 / ?/1 | ?/1 / ?/1 |  | clean | unknown | t49-matrix |
| Qt 5 Fusion (harness scene) | Qt 5.15.13 | qt-input.py / qt-input.py | at_spi (2) | ?/1 / ?/1 | ?/1 / ?/1 |  | clean | unknown | t49-matrix |
| GTK 3 scale (harness scene) | gtk 3.24.41 | gtk-scale.py / Gtk-scale.py | at_spi (2) | ?/1 / ?/1 | ?/1 / ?/1 |  | clean | unknown | t49-matrix |
| Qt 5 kate | Qt 5.15.13 | kate / kate | at_spi (893) | 1/1 / 1/1 | 1/1 / 1/1 |  | clean | takes | t49-matrix |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 1/1 / 1/1 | 1/1 / 1/1 |  | clean | takes | t49-matrix |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | ?/1 (1 failed) / ?/1 (1 failed) | 1/1 / 1/1 |  | clean | partial: takes keys; clicks unknown | t49-matrix |
| Chrome | Chromium 1.0 | google-chrome (/tmp/cua171-task49-80xSNE/cua171-diff-t49-matrix-oYLZ9p/chrome-profile) / Google-chrome | at_spi (222) | 1/1 / 0/1 | 1/1 / 0/1 |  | clean | partial: partial | t49-matrix |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 1/1 / 0/1 | 1/1 / 0/1 |  | clean | partial: partial | t49-matrix |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1964) | 1/1 / 1/1 | 1/1 / 1/1 |  | clean | takes | t49-matrix |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/1 / ?/1 | 1/1 / 1/1 |  | clean | partial: takes keys; clicks unknown | t49-matrix |
| GTK 3 tree view, 10,000 rows (harness scene) | gtk 3.24.41 | gtk-table.py / Gtk-table.py | at_spi (41) | ?/1 / ?/1 | ?/1 / ?/1 |  | clean | unknown | t49-matrix |
| LibreOffice Calc (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-calc | at_spi (2431) | ?/1 / ?/1 | ?/1 / ?/1 |  | clean | unknown | t49-matrix |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 1/1 / 1/1 | ?/1 (1 failed) / ?/1 (1 failed) |  | clean | partial: takes clicks; keys unknown | t49-matrix |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/1 / 0/1 | ?/1 (1 failed) / ?/1 (1 failed) |  | clean | partial: ignores clicks; keys unknown | t49-matrix |
| gnome-terminal (VTE) | gtk 3.24.41 | gnome-terminal-server / Gnome-terminal | at_spi (49) | 1/1 / 1/1 | 1/1 / 1/1 |  | clean | takes | t49-matrix |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `t49-matrix`)
- GTK 4 button (harness scene) ( / ; GTK): unknown (run `t49-matrix`)
- GTK 4 input (harness scene) ( / ; GTK): unknown (run `t49-matrix`)
- Qt 5 input (harness scene) (qt-input.py / qt-input.py; Qt): unknown (run `t49-matrix`)
- Qt 6 input (harness scene) (qt-input.py / qt-input.py; Qt): unknown (run `t49-matrix`)
- Qt 5 Breeze (harness scene) (qt-input.py / qt-input.py; Qt): unknown (run `t49-matrix`)
- Qt 5 Fusion (harness scene) (qt-input.py / qt-input.py; Qt): unknown (run `t49-matrix`)
- GTK 3 scale (harness scene) (gtk-scale.py / Gtk-scale.py; gtk): unknown (run `t49-matrix`)
- Firefox (Navigator / firefox; Gecko): takes keys; ignores clicks (run `t49-matrix`)
- LibreOffice Writer (gen, X11 only) (libreoffice / libreoffice-writer; no AT-SPI provider): takes keys; clicks unknown (run `t49-matrix`)
- GTK 3 tree view, 10,000 rows (harness scene) (gtk-table.py / Gtk-table.py; gtk): unknown (run `t49-matrix`)
- LibreOffice Calc (gtk3) (libreoffice / libreoffice-calc; gtk): unknown (run `t49-matrix`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `t49-matrix`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `t49-matrix`)

Background left alone (Acceptance 5): every request in a witness span; each engine's keys and clicks audited through xtrace in an untimed pass:

| family | witness pinned / newest / cua | audit pinned / newest / cua | cua |
|---|---|---|---|
| GTK3 gedit | clean / clean / clean | clean / clean / clean | PASS |
| GTK4 gnome-text-editor | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| GTK 4 button (harness scene) | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| GTK 4 input (harness scene) | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| Qt 5 input (harness scene) | clean / clean / clean | clean / clean / clean | PASS |
| Qt 6 input (harness scene) | clean / clean / clean | clean / clean / clean | PASS |
| Qt 5 Breeze (harness scene) | clean / clean / clean | clean / clean / clean | PASS |
| Qt 5 Fusion (harness scene) | clean / clean / clean | clean / clean / clean | PASS |
| GTK 3 scale (harness scene) | clean / clean / clean | clean / clean / clean | PASS |
| Qt 5 kate | clean / clean / clean | clean / clean / clean | PASS |
| Qt 6 qtcreator | clean / clean / clean | clean / clean / clean | PASS |
| Firefox | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| Chrome | clean / clean / clean | clean / clean / clean | PASS |
| Electron (cua fixture) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gtk3) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Writer (gen, X11 only) | clean / clean / clean | clean / clean / clean | PASS |
| GTK 3 tree view, 10,000 rows (harness scene) | clean / clean / clean | clean / clean / clean | PASS |
| LibreOffice Calc (gtk3) | clean / clean / clean | clean / clean / clean | PASS |
| xterm | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| xterm, allowSendEvents on | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| gnome-terminal (VTE) | clean / clean / clean | clean / clean / clean | PASS |

**The run is incomplete:** gnome-text-editor: the pinned window's field was not found; gnome-text-editor: 3 effects could not be read (pinned key, pinned type_text, pinned click); gnome-text-editor: cua's audited requests failed, so the audit did not exercise them; gtk4-button: 7 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua type_text); gtk4-button: cua's audited requests failed, so the audit did not exercise them; gtk4-input: 7 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua type_text); gtk4-input: cua's audited requests failed, so the audit did not exercise them; qt5-input: 11 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua key, cua type_text, cua click, cua:none key, cua:none click); qt6-input: 11 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua key, cua type_text, cua click, cua:none key, cua:none click); qt5-breeze: 11 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua key, cua type_text, cua click, cua:none key, cua:none click); qt5-fusion: 11 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua key, cua type_text, cua click, cua:none key, cua:none click); gtk-scale: 11 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua key, cua type_text, cua click, cua:none key, cua:none click); firefox: cua's audited requests failed, so the audit did not exercise them; gtk-table: 11 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua key, cua type_text, cua click, cua:none key, cua:none click); calc: 11 effects could not be read (pinned key, pinned type_text, pinned click, newest key, newest type_text, newest click, cua key, cua type_text, cua click, cua:none key, cua:none click); xterm: cua's audited requests failed, so the audit did not exercise them; xterm-allow: cua's audited requests failed, so the audit did not exercise them

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 5040 requests, 571 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests); left undone, the window not the run's then: close on 0x00e0001a; close on 0x00e00017; close on 0x00e00014; close on 0x00e00011

