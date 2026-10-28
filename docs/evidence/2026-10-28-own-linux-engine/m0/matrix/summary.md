# linux-engine-diff summary

## m04-matrix-covered (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m04-matrix-covered |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | m04-matrix-covered |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m04-matrix-covered |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m04-matrix-covered |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | partial: takes keys; ignores clicks | m04-matrix-covered |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m04-matrix-covered |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m04-matrix-covered |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1962) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m04-matrix-covered |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 / ?/5 | 5/5 / 5/5 / 5/5 | ?/2 (2 failed) / ?/2 | clean | partial: takes keys; clicks unknown | m04-matrix-covered |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m04-matrix-covered |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m04-matrix-covered |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-covered |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 | 0/5 / 0/5 |  | clean | ignores | m04-matrix-covered |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-covered |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-covered |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m04-matrix-covered |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 4/5 | 5/5 / 0/5 |  | clean | partial: partial | m04-matrix-covered |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 0/5 | 5/5 / 0/5 |  | clean | partial: partial | m04-matrix-covered |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1962) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-covered |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 | 5/5 / 5/5 |  | clean | partial: takes keys; clicks unknown | m04-matrix-covered |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m04-matrix-covered |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m04-matrix-covered |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `m04-matrix-covered`)
- Firefox (Navigator / firefox; Gecko): takes keys; ignores clicks (run `m04-matrix-covered`)
- LibreOffice Writer (gen, X11 only) (libreoffice / libreoffice-writer; no AT-SPI provider): takes keys; clicks unknown (run `m04-matrix-covered`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m04-matrix-covered`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m04-matrix-covered`)

The run is complete.

## m04-matrix-visible (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m04-matrix-visible |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / 0/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | m04-matrix-visible |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m04-matrix-visible |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 (2 failed) | clean | takes | m04-matrix-visible |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m04-matrix-visible |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m04-matrix-visible |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 | clean | takes | m04-matrix-visible |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1962) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 2/2 / 2/2 | clean | takes | m04-matrix-visible |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 / ?/5 | 5/5 / 5/5 / 5/5 | ?/2 (2 failed) / ?/2 | clean | partial: takes keys; clicks unknown | m04-matrix-visible |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m04-matrix-visible |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m04-matrix-visible |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (498) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-visible |
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 | 0/5 / 0/5 |  | clean | ignores | m04-matrix-visible |
| Qt 5 kate | Qt 5.15.13 | kate / kate | x11 | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-visible |
| Qt 6 qtcreator | Qt 6.4.2 | qtcreator / QtCreator | at_spi (1261) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-visible |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-visible |
| Chrome | Chromium 1.0 | google-chrome / Google-chrome | at_spi (222) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-visible |
| Electron (cua fixture) | Chromium 1.0 | cua-electron-fixture / cua-electron-fixture | at_spi (28) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-visible |
| LibreOffice Writer (gtk3) | gtk 3.24.41 | libreoffice / libreoffice-writer | at_spi (1962) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | m04-matrix-visible |
| LibreOffice Writer (gen, X11 only) | none (no AT-SPI provider) | libreoffice / libreoffice-writer | x11 | ?/5 / ?/5 | 5/5 / 5/5 |  | clean | partial: takes keys; clicks unknown | m04-matrix-visible |
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m04-matrix-visible |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m04-matrix-visible |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `m04-matrix-visible`)
- LibreOffice Writer (gen, X11 only) (libreoffice / libreoffice-writer; no AT-SPI provider): takes keys; clicks unknown (run `m04-matrix-visible`)
- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m04-matrix-visible`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m04-matrix-visible`)

The run is complete.

## m04-qt-bridge (experiment qt-bridge)

On the VM, as found: `IsEnabled` true, `ScreenReaderEnabled` false.

| application | condition | registered with the registry | frame named for the document | cua-engine tree | pinned tree |
|---|---|---|---|---|---|
| kate | as found | true | true | x11 | x11 |
| qtcreator | as found | true | true | at_spi | at_spi |
| kate | IsEnabled false | true | true | x11 | x11 |
| qtcreator | IsEnabled false | false | false | x11 | x11 |
| kate | IsEnabled false, QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 | true | true | x11 | x11 |
| qtcreator | IsEnabled false, QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 | true | true | at_spi | at_spi |
| kate | IsEnabled false, ScreenReaderEnabled true | true | true | x11 | x11 |
| qtcreator | IsEnabled false, ScreenReaderEnabled true | true | true | at_spi | at_spi |

## m04-capture-readiness (experiment capture-readiness)

| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | poll 1 ms: stop median / premature | poll 2 ms: stop median / premature | poll 5 ms: stop median / premature | poll 10 ms: stop median / premature | poll 20 ms: stop median / premature |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|
| gedit | visible | 20 | 6.4 | 10 | 10.3 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 3 | 20 / 0 |
| gedit | covered | 20 | 14.9 | 20.3 | 24.9 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 3 |
| gnome-text-editor | visible | 20 | 6.1 | 6.4 | 8.7 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 0 | 20 / 0 |
| gnome-text-editor | covered | 20 | 6.1 | 6.8 | 9.2 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 19 | 10 / 0 | 20 / 0 |
| kate | visible | 20 | 6.1 | 8.5 | 10.1 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 19 | 10 / 1 | 20 / 0 |
| kate | covered | 20 | 12.2 | 12.8 | 21.1 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 19 | 40 / 1 |
| qtcreator | visible | 20 | 16.8 | 25.1 | 26.8 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 5 |
| qtcreator | covered | 20 | 15.5 | 24.4 | 26 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 5 |
| firefox | visible | 20 | 20.4 | 22.6 | 32 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 13 |
| firefox | covered | 20 | 20.2 | 31 | 33.3 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 11 |
| chrome | visible | 20 | 7.9 | 8.3 | 13 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 2 | 20 / 0 |
| chrome | covered | 20 | 15.6 | 17.4 | 26.8 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 2 |
| electron | visible | 20 | 6.6 | 9.4 | 11.7 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 2 | 20 / 0 |
| electron | covered | 20 | 12.1 | 18.1 | 20.8 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 2 |
| writer | visible | 20 | 19.7 | 29 | 35 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 9 |
| writer | covered | 20 | 21.1 | 35.6 | 36.4 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 13 |
| writer-gen | visible | 20 | 19.7 | 31.1 | 32.7 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 9 |
| writer-gen | covered | 20 | 21.7 | 26.2 | 38.4 | 0/20 | 0/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 14 |
| xterm | visible | 20 | 2.6 | 3.9 | 4.8 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 0 | 10 / 0 | 20 / 0 |
| xterm | covered | 20 | 5.1 | 6 | 10.5 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 12 | 20 / 1 | 40 / 0 |

- gedit: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- gnome-text-editor: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- kate: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- qtcreator: the covered window's final capture differs from the visible one's in 0 of 836000 pixels
- firefox: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- chrome: the covered window's final capture differs from the visible one's in 0 of 819000 pixels
- electron: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- writer: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- writer-gen: the covered window's final capture differs from the visible one's in 2 of 999680 pixels (box 1232,89,1232,455, largest channel difference 128)
- xterm: the covered window's final capture differs from the visible one's in 0 of 252160 pixels
- **the slowest real contents: 38.4 ms after RedirectWindow (writer-gen, covered); against the fixed 40 ms wait the margin is 1.6 ms, over the 30 ms line: the wait must be raised**

## m04-key-pace (experiment key-pace)

| window | burst | key pace ms | teardown ms | runs | all keys arrived in order | median burst ms |
|---|---|---:|---:|---:|---|---:|
| gedit | letters | 33 | 100 | 3 | 3/3 | 3450 |
| gedit | letters | 33 | 0 | 3 | 3/3 | 1449 |
| gedit | letters | 8 | 0 | 3 | 3/3 | 449 |
| gedit | letters | 0 | 100 | 3 | 3/3 | 2125 |
| gedit | letters | 0 | 50 | 3 | 3/3 | 1127 |
| gedit | letters | 0 | 33 | 3 | 3/3 | 783 |
| gedit | letters | 0 | 20 | 3 | 3/3 | 522 |
| gedit | letters | 0 | 10 | 3 | 3/3 | 319 |
| gedit | letters | 0 | 0 | 3 | 3/3 | 114 |
| gedit | chords | 33 | 100 | 3 | 3/3 | 2112 |
| gedit | chords | 33 | 0 | 3 | 3/3 | 1108 |
| gedit | chords | 8 | 0 | 3 | 3/3 | 354 |
| gedit | chords | 0 | 100 | 3 | 3/3 | 1115 |
| gedit | chords | 0 | 50 | 3 | 3/3 | 613 |
| gedit | chords | 0 | 33 | 3 | 3/3 | 444 |
| gedit | chords | 0 | 20 | 3 | 3/3 | 314 |
| gedit | chords | 0 | 10 | 3 | 3/3 | 214 |
| gedit | chords | 0 | 0 | 3 | 3/3 | 110 |
| kate | letters | 33 | 100 | 3 | 3/3 | 3450 |
| kate | letters | 33 | 0 | 3 | 3/3 | 1448 |
| kate | letters | 8 | 0 | 3 | 3/3 | 443 |
| kate | letters | 0 | 100 | 3 | 3/3 | 2123 |
| kate | letters | 0 | 50 | 3 | 3/3 | 1123 |
| kate | letters | 0 | 33 | 3 | 3/3 | 783 |
| kate | letters | 0 | 20 | 3 | 3/3 | 520 |
| kate | letters | 0 | 10 | 3 | 3/3 | 322 |
| kate | letters | 0 | 0 | 3 | 3/3 | 117 |
| kate | chords | 33 | 100 | 3 | 3/3 | 2107 |
| kate | chords | 33 | 0 | 3 | 3/3 | 1107 |
| kate | chords | 8 | 0 | 3 | 3/3 | 356 |
| kate | chords | 0 | 100 | 3 | 3/3 | 1113 |
| kate | chords | 0 | 50 | 3 | 3/3 | 614 |
| kate | chords | 0 | 33 | 3 | 3/3 | 445 |
| kate | chords | 0 | 20 | 3 | 3/3 | 319 |
| kate | chords | 0 | 10 | 3 | 3/3 | 213 |
| kate | chords | 0 | 0 | 3 | 3/3 | 111 |
| qtcreator | letters | 33 | 100 | 3 | 3/3 | 3449 |
| qtcreator | letters | 33 | 0 | 3 | 3/3 | 1446 |
| qtcreator | letters | 8 | 0 | 3 | 3/3 | 443 |
| qtcreator | letters | 0 | 100 | 3 | 3/3 | 2122 |
| qtcreator | letters | 0 | 50 | 3 | 3/3 | 1124 |
| qtcreator | letters | 0 | 33 | 3 | 3/3 | 782 |
| qtcreator | letters | 0 | 20 | 3 | 3/3 | 524 |
| qtcreator | letters | 0 | 10 | 3 | 3/3 | 321 |
| qtcreator | letters | 0 | 0 | 3 | 3/3 | 116 |
| qtcreator | chords | 33 | 100 | 3 | 3/3 | 2107 |
| qtcreator | chords | 33 | 0 | 3 | 3/3 | 1107 |
| qtcreator | chords | 8 | 0 | 3 | 3/3 | 355 |
| qtcreator | chords | 0 | 100 | 3 | 3/3 | 1113 |
| qtcreator | chords | 0 | 50 | 3 | 3/3 | 614 |
| qtcreator | chords | 0 | 33 | 3 | 3/3 | 441 |
| qtcreator | chords | 0 | 20 | 3 | 3/3 | 313 |
| qtcreator | chords | 0 | 10 | 3 | 3/3 | 212 |
| qtcreator | chords | 0 | 0 | 3 | 3/3 | 111 |
| firefox | letters | 33 | 100 | 3 | 3/3 | 3453 |
| firefox | letters | 33 | 0 | 3 | 3/3 | 1448 |
| firefox | letters | 8 | 0 | 3 | 3/3 | 460 |
| firefox | letters | 0 | 100 | 3 | 3/3 | 2124 |
| firefox | letters | 0 | 50 | 3 | 3/3 | 1128 |
| firefox | letters | 0 | 33 | 3 | 3/3 | 781 |
| firefox | letters | 0 | 20 | 3 | 3/3 | 522 |
| firefox | letters | 0 | 10 | 3 | 3/3 | 322 |
| firefox | letters | 0 | 0 | 3 | 3/3 | 191 |
| firefox | chords | 33 | 100 | 3 | 3/3 | 2108 |
| firefox | chords | 33 | 0 | 3 | 3/3 | 1106 |
| firefox | chords | 8 | 0 | 3 | 3/3 | 361 |
| firefox | chords | 0 | 100 | 3 | 3/3 | 1112 |
| firefox | chords | 0 | 50 | 3 | 3/3 | 615 |
| firefox | chords | 0 | 33 | 3 | 3/3 | 443 |
| firefox | chords | 0 | 20 | 3 | 3/3 | 317 |
| firefox | chords | 0 | 10 | 3 | 3/3 | 212 |
| firefox | chords | 0 | 0 | 3 | 3/3 | 157 |
| chrome | letters | 33 | 100 | 3 | 3/3 | 3451 |
| chrome | letters | 33 | 0 | 3 | 3/3 | 1448 |
| chrome | letters | 8 | 0 | 3 | 3/3 | 445 |
| chrome | letters | 0 | 100 | 3 | 3/3 | 2126 |
| chrome | letters | 0 | 50 | 3 | 3/3 | 1125 |
| chrome | letters | 0 | 33 | 3 | 3/3 | 784 |
| chrome | letters | 0 | 20 | 3 | 3/3 | 524 |
| chrome | letters | 0 | 10 | 3 | 3/3 | 324 |
| chrome | letters | 0 | 0 | 3 | 0/3 | 120 |
| chrome | chords | 33 | 100 | 3 | 2/3 | 2109 |
| chrome | chords | 33 | 0 | 3 | 3/3 | 1107 |
| chrome | chords | 8 | 0 | 3 | 3/3 | 357 |
| chrome | chords | 0 | 100 | 3 | 3/3 | 1114 |
| chrome | chords | 0 | 50 | 3 | 3/3 | 614 |
| chrome | chords | 0 | 33 | 3 | 3/3 | 444 |
| chrome | chords | 0 | 20 | 3 | 3/3 | 313 |
| chrome | chords | 0 | 10 | 3 | 3/3 | 213 |
| chrome | chords | 0 | 0 | 3 | 0/3 | 110 |
| electron | letters | 33 | 100 | 3 | 3/3 | 3455 |
| electron | letters | 33 | 0 | 3 | 3/3 | 1453 |
| electron | letters | 8 | 0 | 3 | 3/3 | 446 |
| electron | letters | 0 | 100 | 3 | 3/3 | 2126 |
| electron | letters | 0 | 50 | 3 | 3/3 | 1124 |
| electron | letters | 0 | 33 | 3 | 3/3 | 786 |
| electron | letters | 0 | 20 | 3 | 3/3 | 524 |
| electron | letters | 0 | 10 | 3 | 1/3 | 323 |
| electron | letters | 0 | 0 | 3 | 0/3 | 118 |
| electron | chords | 33 | 100 | 3 | 2/3 | 2110 |
| electron | chords | 33 | 0 | 3 | 3/3 | 1108 |
| electron | chords | 8 | 0 | 3 | 3/3 | 356 |
| electron | chords | 0 | 100 | 3 | 3/3 | 1114 |
| electron | chords | 0 | 50 | 3 | 3/3 | 613 |
| electron | chords | 0 | 33 | 3 | 3/3 | 445 |
| electron | chords | 0 | 20 | 3 | 3/3 | 314 |
| electron | chords | 0 | 10 | 3 | 3/3 | 213 |
| electron | chords | 0 | 0 | 3 | 1/3 | 111 |
| writer | letters | 33 | 100 | 3 | 3/3 | 3448 |
| writer | letters | 33 | 0 | 3 | 3/3 | 1446 |
| writer | letters | 8 | 0 | 3 | 3/3 | 464 |
| writer | letters | 0 | 100 | 3 | 3/3 | 2123 |
| writer | letters | 0 | 50 | 3 | 3/3 | 1122 |
| writer | letters | 0 | 33 | 3 | 3/3 | 783 |
| writer | letters | 0 | 20 | 3 | 3/3 | 530 |
| writer | letters | 0 | 10 | 3 | 3/3 | 326 |
| writer | letters | 0 | 0 | 3 | 3/3 | 119 |
| writer | chords | 33 | 100 | 3 | 3/3 | 2108 |
| writer | chords | 33 | 0 | 3 | 3/3 | 1108 |
| writer | chords | 8 | 0 | 3 | 3/3 | 358 |
| writer | chords | 0 | 100 | 3 | 3/3 | 1113 |
| writer | chords | 0 | 50 | 3 | 3/3 | 613 |
| writer | chords | 0 | 33 | 3 | 3/3 | 443 |
| writer | chords | 0 | 20 | 3 | 3/3 | 316 |
| writer | chords | 0 | 10 | 3 | 3/3 | 216 |
| writer | chords | 0 | 0 | 3 | 3/3 | 109 |
| xterm-allow | letters | 33 | 100 | 3 | 3/3 | 3456 |
| xterm-allow | letters | 33 | 0 | 3 | 3/3 | 1451 |
| xterm-allow | letters | 8 | 0 | 3 | 3/3 | 444 |
| xterm-allow | letters | 0 | 100 | 3 | 3/3 | 2127 |
| xterm-allow | letters | 0 | 50 | 3 | 3/3 | 1123 |
| xterm-allow | letters | 0 | 33 | 3 | 3/3 | 783 |
| xterm-allow | letters | 0 | 20 | 3 | 3/3 | 530 |
| xterm-allow | letters | 0 | 10 | 3 | 3/3 | 320 |
| xterm-allow | letters | 0 | 0 | 3 | 3/3 | 116 |
| xterm-allow | chords | 33 | 100 | 3 | 3/3 | 2109 |
| xterm-allow | chords | 33 | 0 | 3 | 3/3 | 1110 |
| xterm-allow | chords | 8 | 0 | 3 | 3/3 | 355 |
| xterm-allow | chords | 0 | 100 | 3 | 3/3 | 1113 |
| xterm-allow | chords | 0 | 50 | 3 | 3/3 | 613 |
| xterm-allow | chords | 0 | 33 | 3 | 3/3 | 442 |
| xterm-allow | chords | 0 | 20 | 3 | 3/3 | 311 |
| xterm-allow | chords | 0 | 10 | 3 | 3/3 | 210 |
| xterm-allow | chords | 0 | 0 | 3 | 3/3 | 110 |

- gedit: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 0 ms
- kate: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 0 ms
- qtcreator: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 0 ms
- firefox: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 0 ms
- chrome: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 10 ms
- electron: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 20 ms
- writer: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 0 ms
- xterm-allow: every burst arrived at 0 ms pacing with the 100 ms teardown; the lowest teardown with every burst arriving at it and above: 0 ms

## m04-capture-readiness-loaded (experiment capture-readiness)

| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | poll 1 ms: stop median / premature | poll 2 ms: stop median / premature | poll 5 ms: stop median / premature | poll 10 ms: stop median / premature | poll 20 ms: stop median / premature |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|
| gedit | visible | 20 | 9.8 | 12.6 | 14.1 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 9 | 20 / 0 |
| gedit | covered | 20 | 22.4 | 25.3 | 26.9 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 16 |
| gnome-text-editor | visible | 20 | 9.3 | 12.6 | 13.1 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 5 | 20 / 0 |
| gnome-text-editor | covered | 20 | 9.6 | 12.5 | 13 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 8 | 20 / 0 |
| kate | visible | 20 | 9.7 | 12.7 | 15.6 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 7 | 20 / 0 |
| kate | covered | 20 | 21 | 22 | 24.9 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 13 |
| qtcreator | visible | 20 | 28.6 | 32.3 | 40.9 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| qtcreator | covered | 20 | 28.2 | 29.2 | 32.7 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 19 |
| firefox | visible | 20 | 36.4 | 39.9 | 53.2 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| firefox | covered | 20 | 35.5 | 39.3 | 40.9 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| chrome | visible | 20 | 14.1 | 17 | 19.8 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 19 | 20 / 0 |
| chrome | covered | 20 | 31.9 | 34.5 | 36.4 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| electron | visible | 20 | 9.3 | 12.1 | 12.9 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 5 | 20 / 0 |
| electron | covered | 20 | 20.6 | 25.8 | 33.2 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 12 |
| writer | visible | 20 | 35.5 | 37.9 | 42.3 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 19 |
| writer | covered | 20 | 37.4 | 39.3 | 46.1 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer-gen | visible | 20 | 34.6 | 36.9 | 39.9 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer-gen | covered | 20 | 44.3 | 50.7 | 56.2 | 0/20 | 0/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| xterm | visible | 20 | 3.8 | 6 | 7.3 | 20/20 | 20/20 | none | 1 / 20 | 2 / 19 | 5 / 9 | 10 / 0 | 20 / 0 |
| xterm | covered | 20 | 7.4 | 10.1 | 12.1 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 20 / 4 | 40 / 0 |

- gedit: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- gnome-text-editor: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- kate: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- qtcreator: the covered window's final capture differs from the visible one's in 0 of 836000 pixels
- firefox: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- chrome: the covered window's final capture differs from the visible one's in 0 of 819000 pixels
- electron: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- writer: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- writer-gen: the covered window's final capture differs from the visible one's in 2 of 999680 pixels (box 1232,89,1232,455, largest channel difference 128)
- xterm: the covered window's final capture differs from the visible one's in 0 of 252160 pixels
- **the slowest real contents: 56.2 ms after RedirectWindow (writer-gen, covered); against the fixed 40 ms wait the margin is -16.1 ms, over the 30 ms line: the wait must be raised**

## m04-capture-readiness-2 (experiment capture-readiness)

| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | poll 1 ms: stop median / premature | poll 2 ms: stop median / premature | poll 5 ms: stop median / premature | poll 10 ms: stop median / premature | poll 20 ms: stop median / premature |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|
| gedit | visible | 20 | 6.4 | 7.7 | 11.1 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 1 | 20 / 0 |
| gedit | covered | 20 | 12.1 | 13.4 | 24 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 19 | 40 / 1 |
| gnome-text-editor | visible | 20 | 6.3 | 10.2 | 11.3 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 19 | 10 / 4 | 20 / 0 |
| gnome-text-editor | covered | 20 | 6.4 | 7.3 | 11.6 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 1 | 20 / 0 |
| kate | visible | 20 | 6.3 | 7 | 7.5 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 0 | 20 / 0 |
| kate | covered | 20 | 12 | 12.7 | 19.1 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 0 |
| qtcreator | visible | 20 | 15.7 | 26.3 | 29.1 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 3 |
| qtcreator | covered | 20 | 15.9 | 25.1 | 26.3 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 3 |
| firefox | visible | 20 | 20.5 | 21.3 | 32.1 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 13 |
| firefox | covered | 20 | 19.3 | 20.7 | 20.8 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 4 |
| chrome | visible | 20 | 7.8 | 8.2 | 8.5 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 0 | 20 / 0 |
| chrome | covered | 20 | 16.1 | 16.9 | 26.5 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 1 |
| electron | visible | 20 | 6.2 | 6.8 | 8.3 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 0 | 20 / 0 |
| electron | covered | 20 | 12.1 | 15.4 | 19.3 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 0 |
| writer | visible | 20 | 18.3 | 19.6 | 22.5 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 1 |
| writer | covered | 20 | 20.3 | 29.7 | 34.5 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 11 |
| writer-gen | visible | 20 | 19.8 | 30 | 30.6 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 40 / 9 |
| writer-gen | covered | 20 | 21 | 29.3 | 34 | 0/20 | 0/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 12 |
| xterm | visible | 20 | 2.6 | 4.1 | 4.7 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 0 | 10 / 0 | 20 / 0 |
| xterm | covered | 20 | 5 | 7.7 | 8.4 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 7.5 / 10 | 20 / 0 | 40 / 0 |

- gedit: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- gnome-text-editor: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- kate: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- qtcreator: the covered window's final capture differs from the visible one's in 0 of 836000 pixels
- firefox: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- chrome: the covered window's final capture differs from the visible one's in 0 of 819000 pixels
- electron: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- writer: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- writer-gen: the covered window's final capture differs from the visible one's in 2 of 999680 pixels (box 1232,89,1232,455, largest channel difference 128)
- xterm: the covered window's final capture differs from the visible one's in 0 of 252160 pixels
- **the slowest real contents: 34.5 ms after RedirectWindow (writer, covered); against the fixed 40 ms wait the margin is 5.5 ms, over the 30 ms line: the wait must be raised**

## m04-capture-readiness-loaded-discarded (experiment capture-readiness)

**Discarded run.** The first loaded capture-readiness run (harness e7eb40b2): it ended before its summary and its trial rows were lost; only its margin row survives, copied from the session's console: the slowest real contents were 94.9 ms after RedirectWindow (Chrome, covered), load average 8.42 at the end. Its re-run is m04-capture-readiness-loaded; m04-capture-readiness-loaded-2 and -3 repeat it.

## m04-element-click (experiment element-click)

The GTK 4 probe (the window focused and on top; the real input path against the synthetic one):

| window | input | route | arrived |
|---|---|---|---|
| gnome-text-editor (focused, on top) | key q | XTEST | true |
| gnome-text-editor (focused, on top) | key x | SendEvent (background route) | false |
| GTK 4 button (focused, on top) | left click | XTEST | true |
| GTK 4 button (focused, on top) | left click | SendEvent (background route) | false |
| GTK 4 button (focused, on top) | element click | DoAction 0 (AT-SPI) | true |

Element clicks (`DoAction` 0) against coordinate clicks (synthetic events), per engine, effects seen / clicks:

| window | condition | engine | element click | coordinate click | witness clean |
|---|---|---|---|---|---|
| gtk4-button | covered | pinned | 5/5 | 0/5 | 10/10 |
| gtk4-button | covered | newest | 5/5 | 0/5 | 10/10 |
| gtk4-button | covered | cua | 5/5 | 0/5 | 10/10 |
| gtk4-button | visible | pinned | 5/5 | 0/5 | 10/10 |
| gtk4-button | visible | newest | 5/5 | 0/5 | 10/10 |
| gtk4-button | visible | cua | 5/5 | 0/5 | 10/10 |
| firefox | covered | pinned | 5/5 | 0/5 | 10/10 |
| firefox | covered | newest | 5/5 | 0/5 | 10/10 |
| firefox | covered | cua | 5/5 | 0/5 | 10/10 |
| firefox | visible | pinned | 5/5 | 5/5 | 10/10 |
| firefox | visible | newest | 5/5 | 5/5 | 10/10 |
| firefox | visible | cua | 5/5 | 5/5 | 10/10 |

## m04-partial-cover (experiment partial-cover)

Firefox on the matrix page, one window per engine at the same place; the click point is the button's centre (window-relative 640, 220). Effects seen / coordinate clicks:

| front window | its real geometry | click point | window visible | pinned | newest | cua |
|---|---|---|---:|---|---|---|
| over everything | 2,40,1276,797 | covered | 3% | 0/5 | 0/5 | 0/5 |
| over the top half | 2,40,1276,420 | covered | 46% | 0/5 | 0/5 | 0/5 |
| over the top third | 2,40,1276,251 | covered | 68% | 5/5 | 5/5 | 5/5 |
| small, over the click point | 542,220,196,108 | covered | 98% | 5/5 | 5/5 | 5/5 |
| medium, over the click point | 342,160,598,251 | covered | 85% | 5/5 | 5/5 | 5/5 |
| large, over the click point | 142,100,1000,498 | covered | 50% | 0/5 | 0/5 | 0/5 |
| over the bottom fifth | 2,640,1276,199 | visible | 80% | 5/5 | 5/5 | 5/5 |
| over the bottom 45% | 2,490,1276,342 | visible | 60% | 5/5 | 5/5 | 5/5 |
| over the bottom 52% | 2,420,1276,420 | visible | 52% | 0/5 | 0/5 | 0/5 |
| over the bottom 57% | 2,380,1276,459 | visible | 46% | 0/5 | 0/5 | 0/5 |
| over the bottom 62% | 2,340,1276,498 | visible | 41% | 0/5 | 0/5 | 0/5 |
| over the bottom 67% | 2,300,1276,537 | visible | 36% | 0/5 | 0/5 | 0/5 |
| over the left 47% | 2,40,598,797 | visible | 55% | 5/5 | 5/5 | 5/5 |
| over the left 78% | 2,40,1000,797 | covered | 24% | 0/5 | 0/5 | 0/5 |
| in a corner | 1072,680,196,147 | visible | 98% | 5/5 | 5/5 | 5/5 |

## m04-capture-readiness-loaded-2 (experiment capture-readiness)

| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | poll 1 ms: stop median / premature | poll 2 ms: stop median / premature | poll 5 ms: stop median / premature | poll 10 ms: stop median / premature | poll 20 ms: stop median / premature |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|
| gedit | visible | 20 | 9.7 | 13.2 | 14.4 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 9 | 20 / 0 |
| gedit | covered | 20 | 24.5 | 25.4 | 27.7 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 19 |
| gnome-text-editor | visible | 20 | 9.1 | 10.1 | 12.4 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 4 | 20 / 0 |
| gnome-text-editor | covered | 20 | 9.4 | 12.6 | 15.6 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 4 | 20 / 0 |
| kate | visible | 20 | 10.1 | 12.7 | 13.4 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 10 | 20 / 0 |
| kate | covered | 20 | 22 | 25.6 | 26.5 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 15 |
| qtcreator | visible | 20 | 28 | 29.5 | 31.9 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| qtcreator | covered | 20 | 28.2 | 31.6 | 34.8 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| firefox | visible | 20 | 37.5 | 43.1 | 67.9 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| firefox | covered | 20 | 34.9 | 40.1 | 44.2 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| chrome | visible | 20 | 14.4 | 14.9 | 17 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 0 |
| chrome | covered | 20 | 31.2 | 35.6 | 36.6 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| electron | visible | 20 | 10.2 | 14.7 | 15 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 11 | 20 / 0 |
| electron | covered | 20 | 20.9 | 26.7 | 29.4 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 11 |
| writer | visible | 20 | 33.8 | 37.8 | 38.8 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer | covered | 20 | 35.7 | 38.5 | 39 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer-gen | visible | 20 | 34.4 | 37.9 | 39.9 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer-gen | covered | 20 | 44.6 | 53.6 | 59.4 | 0/20 | 0/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| xterm | visible | 20 | 5.4 | 6.3 | 8.7 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 18 | 10 / 0 | 20 / 0 |
| xterm | covered | 20 | 8.2 | 11.1 | 11.8 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 20 / 4 | 40 / 0 |

- gedit: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- gnome-text-editor: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- kate: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- qtcreator: the covered window's final capture differs from the visible one's in 0 of 836000 pixels
- firefox: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- chrome: the covered window's final capture differs from the visible one's in 0 of 819000 pixels
- electron: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- writer: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- writer-gen: the covered window's final capture differs from the visible one's in 2 of 999680 pixels (box 1232,89,1232,455, largest channel difference 128)
- xterm: the covered window's final capture differs from the visible one's in 0 of 252160 pixels
- **the slowest real contents: 67.9 ms after RedirectWindow (firefox, visible); against the fixed 40 ms wait the margin is -27.9 ms, over the 30 ms line: the wait must be raised**

## m04-capture-readiness-loaded-3 (experiment capture-readiness)

| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | poll 1 ms: stop median / premature | poll 2 ms: stop median / premature | poll 5 ms: stop median / premature | poll 10 ms: stop median / premature | poll 20 ms: stop median / premature |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|
| gedit | visible | 20 | 9.3 | 13.2 | 13.7 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 6 | 20 / 0 |
| gedit | covered | 20 | 21.8 | 25.5 | 28.3 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 18 |
| gnome-text-editor | visible | 20 | 10 | 13.2 | 15.2 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 10 | 20 / 0 |
| gnome-text-editor | covered | 20 | 9.4 | 12.5 | 16.3 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 6 | 20 / 0 |
| kate | visible | 20 | 9.5 | 12.9 | 13.2 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 9 | 20 / 0 |
| kate | covered | 20 | 20.8 | 23.2 | 27.7 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 12 |
| qtcreator | visible | 20 | 29.4 | 36.4 | 43.3 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| qtcreator | covered | 20 | 29.8 | 33.8 | 38.2 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| firefox | visible | 20 | 34.9 | 39.1 | 44.2 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| firefox | covered | 20 | 37.8 | 40.6 | 43 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| chrome | visible | 20 | 14.8 | 17 | 21.7 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 1 |
| chrome | covered | 20 | 30.7 | 35.2 | 39.7 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| electron | visible | 20 | 10.5 | 13 | 15 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 12 | 20 / 0 |
| electron | covered | 20 | 21.7 | 26.4 | 28.9 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 14 |
| writer | visible | 20 | 34.6 | 36.6 | 38.1 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer | covered | 20 | 37.6 | 39.9 | 42.5 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer-gen | visible | 20 | 33.6 | 38.8 | 42 | 0/20 | 20/20 | 0/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| writer-gen | covered | 20 | 44.7 | 48.5 | 53.6 | 0/20 | 0/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 10 / 20 | 20 / 20 |
| xterm | visible | 20 | 4.9 | 6.2 | 8.7 | 20/20 | 20/20 | none | 1 / 20 | 2 / 20 | 5 / 10 | 10 / 0 | 20 / 0 |
| xterm | covered | 20 | 8.8 | 11 | 11.3 | 0/20 | 20/20 | 20/20 | 1 / 20 | 2 / 20 | 5 / 20 | 20 / 4 | 40 / 0 |

- gedit: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- gnome-text-editor: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- kate: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- qtcreator: the covered window's final capture differs from the visible one's in 0 of 836000 pixels
- firefox: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- chrome: the covered window's final capture differs from the visible one's in 0 of 819000 pixels
- electron: the covered window's final capture differs from the visible one's in 0 of 630000 pixels
- writer: the covered window's final capture differs from the visible one's in 0 of 999680 pixels
- writer-gen: the covered window's final capture differs from the visible one's in 2 of 999680 pixels (box 1232,89,1232,455, largest channel difference 128)
- xterm: the covered window's final capture differs from the visible one's in 0 of 252160 pixels
- **the slowest real contents: 53.6 ms after RedirectWindow (writer-gen, covered); against the fixed 40 ms wait the margin is -13.6 ms, over the 30 ms line: the wait must be raised**

## m04-matrix-covered-xterm-r2 (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m04-matrix-covered-xterm-r2 |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m04-matrix-covered-xterm-r2 |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m04-matrix-covered-xterm-r2 |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m04-matrix-covered-xterm-r2 |

Families that do not take the background route:

- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m04-matrix-covered-xterm-r2`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m04-matrix-covered-xterm-r2`)

The run is complete.

## m04-matrix-visible-xterm-r2 (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 / 5/5 | 0/5 / 0/5 / 0/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes clicks; ignores keys | m04-matrix-visible-xterm-r2 |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 / 0/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) | clean | partial: takes keys; ignores clicks | m04-matrix-visible-xterm-r2 |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| xterm | none (no AT-SPI provider) | xterm / XTerm | x11 | 5/5 / 5/5 | 0/5 / 0/5 |  | clean | partial: takes clicks; ignores keys | m04-matrix-visible-xterm-r2 |
| xterm, allowSendEvents on | none (no AT-SPI provider) | xterm / XTerm | x11 | 0/5 / 0/5 | 5/5 / 5/5 |  | clean | partial: takes keys; ignores clicks | m04-matrix-visible-xterm-r2 |

Families that do not take the background route:

- xterm (xterm / XTerm; no AT-SPI provider): takes clicks; ignores keys (run `m04-matrix-visible-xterm-r2`)
- xterm, allowSendEvents on (xterm / XTerm; no AT-SPI provider): takes keys; ignores clicks (run `m04-matrix-visible-xterm-r2`)

The run is complete.

