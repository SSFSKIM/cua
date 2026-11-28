# #228 probes: the rows, as tables

Written by `probes/summarize.py` from the `.jsonl` files in this directory; each table names its file. Times are milliseconds.

## 1. At launch: the Electron fixture (`matrix.jsonl`)

Switches are `IsEnabled / ScreenReaderEnabled` as read back before the launch. "Nodes" is a structural read (role name, name, children). "After the request" is one
`Accessible.GetAttributes` on the application root; "app says" is the fixture's own record of `app.isAccessibilitySupportEnabled()`.

| condition | variable and arguments | switches | on the bus | nodes | page button | button after the request, ms | nodes after | app says |
|---|---|---|---|---|---|---|---|---|
| baseline |   | off / off | no |  |  |  |  | false |
| flag |  --force-renderer-accessibility | off / off | no |  |  |  |  | true |
| env-ACCESSIBILITY_ENABLED | ACCESSIBILITY_ENABLED=1  | off / off | yes | 2 | no | 35.9 | 29 | false |
| env-GNOME_ACCESSIBILITY | GNOME_ACCESSIBILITY=1  | off / off | yes | 2 | no | 41.6 | 29 | false |
| env-QT_ACCESSIBILITY | QT_ACCESSIBILITY=1  | off / off | yes | 2 | no | 31.5 | 29 | false |
| bus-IsEnabled |   | on / off | yes | 2 | no | 60.6 | 29 | false |
| bus-ScreenReaderEnabled |   | on / on | yes | 2 | no | 59.2 | 29 | false |
| gsettings-toolkit-accessibility |   | on / off | yes | 2 | no | 35.8 | 29 | false |
| flag+env | ACCESSIBILITY_ENABLED=1 --force-renderer-accessibility | off / off | yes | 29 | yes | not sent |  | true |
| flag+bus-IsEnabled |  --force-renderer-accessibility | on / off | yes | 29 | yes | not sent |  | true |
| flag=basic+bus-IsEnabled |  --force-renderer-accessibility=basic | on / off | yes | 29 | yes | not sent |  | false |
| bus-IsEnabled+orca-process |   | on / off | yes | 2 | no | 57.0 | 29 | false, then true |
| bus-IsEnabled+env=0 | ACCESSIBILITY_ENABLED=0  | on / off | no |  |  |  |  | false |
| bus-IsEnabled+disable-renderer-accessibility |  --disable-renderer-accessibility | on / off | yes | 2 | no |  | 2 | false |
| bus-IsEnabled+disable-platform-integration |  --disable-platform-accessibility-integration | on / off | yes | 2 | no |  | 2 | false |

## 2. On a running app (`running.jsonl`)

| scenario | step | switches | on the bus | nodes | page button | button after, ms | the app's mode (`getAccessibilitySupportFeatures`) | `isAccessibilitySupportEnabled` |
|---|---|---|---|---|---|---|---|---|
| started-off | started | off / off | no |  |  |  |  |  |
| started-off | IsEnabled on, 3 s later | on / off | no |  |  |  |  |  |
| started-off | ScreenReaderEnabled on, 3 s later | on / on | no |  |  |  |  |  |
| started-off | a process named orca, 3 s later |  | no |  |  |  |  |  |
| started-off | a real key press, 3 s later |  | no |  |  |  |  |  |
| started-flag-only | started | off / off | no |  |  |  |  |  |
| started-flag-only | IsEnabled on, 3 s later | on / off | no |  |  |  |  |  |
| started-flag-only | a real key press, 3 s later |  | yes | 29 | yes |  |  |  |
| app-enables-itself | started | off / off | no |  |  |  |  | false |
| app-enables-itself | app.setAccessibilitySupportEnabled(true), 2 s later |  | no |  |  |  | nativeAPIs, webContents, inlineTextBoxes, extendedProperties | true |
| app-enables-itself | IsEnabled on, 3 s later | on / off | no |  |  |  |  |  |
| app-enables-itself | a real key press, 3 s later |  | yes | 25 | yes |  | nativeAPIs, webContents, inlineTextBoxes, extendedProperties | true |
| kick-attributes | started | on / off |  |  |  |  |  | false |
| kick-attributes | a structural read |  | yes | 2 | no |  |  | false |
| kick-attributes | GetAttributes on the application root |  |  | 25 | yes | 21.1 | nativeAPIs, webContents, extendedProperties | false |
| kick-attributes | 45 s later, untouched |  | yes | 25 | yes |  | nativeAPIs, webContents, extendedProperties | false |
| kick-relations | started | on / off |  |  |  |  |  | false |
| kick-relations | a structural read |  | yes | 2 | no |  |  | false |
| kick-relations | GetRelationSet on the application root |  |  | 25 | yes | 45.0 | nativeAPIs, webContents, extendedProperties | false |
| kick-on-frame | started | on / off |  |  |  |  |  | false |
| kick-on-frame | a structural read |  | yes | 2 | no |  |  | false |
| kick-on-frame | GetAttributes on the frame |  |  | 25 | yes | 26.6 | nativeAPIs, webContents, extendedProperties | false |
| kick-with-orca | started | on / off |  |  |  |  |  | false |
| kick-with-orca | a structural read |  | yes | 2 | no |  |  | false |
| kick-with-orca | GetAttributes on the application root |  |  | 25 | yes | 35.4 | nativeAPIs, webContents, inlineTextBoxes, extendedProperties, screenReader | true |
| app-enables-bridge-on | started | on / off | yes | 2 | no |  |  | false |
| app-enables-bridge-on | app.setAccessibilitySupportEnabled(true) |  |  | 25 | yes | 23.8 | nativeAPIs, webContents, inlineTextBoxes, extendedProperties | true |
| app-enables-bridge-on | app.setAccessibilitySupportEnabled(false), 2 s later |  | yes | 16 | no |  |  | false |
| orca-after-request | started, no process named orca | on / off |  |  |  |  |  | false |
| orca-after-request | GetAttributes on the application root |  |  |  |  |  | nativeAPIs, webContents, extendedProperties | false |
| orca-after-request | a process named orca starts, 3 s later |  |  |  |  |  | nativeAPIs, webContents, extendedProperties | false |
| orca-after-request | GetAttributes and GetRelationSet again, 5 s later |  | yes | 25 | yes |  | nativeAPIs, webContents, extendedProperties | false |
| orca-after-request | a real key press in the window, 3 s later |  |  |  |  |  | nativeAPIs, webContents, extendedProperties | false |

## 3. Cost on the probe app (`cost.jsonl`)

**Startup**, N fresh launches per mode, times from the spawn: median (min to max).

| mode | N | app ready | page loaded | window shown | on the bus | page button in a read |
|---|---|---|---|---|---|---|
| off | 6 | 328 (309 to 342) | 414 (383 to 439) | 426 (402 to 443) |  |  |
| bridge | 6 | 301 (291 to 344) | 402 (383 to 469) | 437 (397 to 473) | 371 (357 to 431) |  |
| kick | 6 | 312 (275 to 344) | 464 (389 to 551) | 468 (395 to 561) | 415 (345 to 494) | 502 (422 to 599) |
| flag | 6 | 348 (310 to 402) | 467 (402 to 542) | 495 (413 to 551) | 413 (372 to 504) | 533 (443 to 578) |

**The DOM benchmark** (2,000 rows built, rewritten 5 times, cleared), N runs after a warm-up: median (min to max). CPU seconds are the process's own, over the benchmark and 1.5 s after it.

| mode | N | page total | build | rewrite | renderer CPU s | browser CPU s | renderer MB after | browser MB after |
|---|---|---|---|---|---|---|---|---|
| off | 6 | 317 (316 to 351) | 109 (84 to 134) | 182 (166 to 233) | 0.31 (0.29 to 0.37) | 0.03 (0.01 to 0.04) | 191 | 150 |
| bridge | 6 | 316 (300 to 400) | 100 (89 to 117) | 183 (166 to 250) | 0.32 (0.30 to 0.36) | 0.03 (0.02 to 0.04) | 188 | 150 |
| kick | 6 | 516 (466 to 551) | 265 (250 to 271) | 223 (179 to 254) | 0.54 (0.50 to 0.61) | 0.20 (0.19 to 0.21) | 212 | 159 |
| flag | 6 | 633 (600 to 750) | 328 (298 to 442) | 272 (267 to 294) | 0.69 (0.65 to 0.79) | 0.26 (0.23 to 0.28) | 227 | 162 |
| kick+reader | 6 | 525 (484 to 584) | 281 (245 to 302) | 227 (177 to 248) | 0.55 (0.51 to 0.60) | 0.56 (0.52 to 0.59) | 211 | 164 |

**Idle**, 10 s with nothing happening: CPU seconds per process.

| mode | browser | renderer | GPU |
|---|---|---|---|
| off | 0.14 | 0.0 | 0.0 |
| bridge | 0.15 | 0.0 | 0.0 |
| kick | 0.15 | 0.0 | 0.0 |
| flag | 0.15 | 0.0 | 0.0 |

## 4. cua-engine on the fixture (`engine.jsonl`)

| state | engine | read | `ax_tree_source` | nodes | `truncated` | ms |
|---|---|---|---|---|---|---|
| bridge-off | cua-engine 0.4.5 (77ed101d43ea) | 1 | x11 | 1 |  | 10.8 |
| bridge-off |  | 2 | x11 | 1 |  | 1.1 |
| bridge-on | cua-engine 0.4.5 (77ed101d43ea) | 1 | at_spi | 1 | {"depth": 0, "failed": 1, "nodes": 0} | 4.2 |
| bridge-on |  | 2 | at_spi | 1 | {"depth": 0, "failed": 1, "nodes": 0} | 4.8 |
| bridge-on+kick | cua-engine 0.4.5 (77ed101d43ea) | 1 | at_spi | 28 |  | 12.1 |
| bridge-on+kick |  | 2 | at_spi | 28 |  | 11.0 |
| flag | cua-engine 0.4.5 (77ed101d43ea) | 1 | at_spi | 28 |  | 20.4 |
| flag |  | 2 | at_spi | 28 |  | 20.3 |

## 5. Other applications on the same bus (`others.jsonl`)

Per application: on the bus (nodes in a structural read) / CPU seconds so far / resident MB.

| scenario | step | variable | switches | gedit (GTK 3) | gnome-text-editor (GTK 4) | kate (Qt 5) | qtcreator (Qt 6) | fixture (Electron) |
|---|---|---|---|---|---|---|---|---|
| flip | started, 14 s later |  | off / off | yes (481) / 0.23 / 102.9 | yes (65) / 2.05 / 270.8 | yes (890) / 0.56 / 129.3 | no / 0.84 / 267.5 | no / 0.44 / 146.6 |
| flip | IsEnabled on, 5 s later |  | on / off | yes (481) / 0.32 / 103.9 | yes (65) / 2.08 / 270.8 | yes (890) / 0.88 / 129.7 | no / 0.86 / 267.5 | no / 0.45 / 146.6 |
| flip | ScreenReaderEnabled on, 5 s later |  | on / on | yes (481) / 0.42 / 103.9 | yes (65) / 2.13 / 270.8 | yes (890) / 1.23 / 129.7 | no / 0.86 / 267.5 | no / 0.47 / 147.1 |
| on-at-start | started, 14 s later |  | on / off | yes (481) / 0.22 / 100.2 | yes (65) / 2.02 / 270.3 | yes (890) / 0.47 / 129.5 | yes (1196) / 0.62 / 269.3 | yes (2) / 0.45 / 147.2 |
| qt-variable | started, 14 s later | QT_ACCESSIBILITY=1 | off / off | yes (481) / 0.26 / 102.9 | yes (65) / 2.14 / 270.5 | yes (890) / 0.49 / 129.6 | no / 0.68 / 280.8 | yes (2) / 0.47 / 147.0 |

## 6. Chrome, an instance of the run's own (`chrome.jsonl`)

| version | class | role | on the bus | toolkit | name | nodes, no flag | roles | page button | button after the request, ms | nodes after | closed by shortcut | Chrome processes left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Google Chrome 156.0.8078.73 | "google-chrome (/tmp/t177-chrome-k00inq5s/chrome-profile)", "Google-chrome" | "browser" | yes | Chromium 1.0 | Google Chrome | 4 | [["frame", 3], ["application", 1]] | no | 269.8 | 239 | yes | 0 |

## 7. Real applications (`apps.jsonl`, and `apps-nwjs-forced.jsonl` for the last row)

Each started once with IsEnabled on, no flag, no network; the last row is NW.js again with `ACCESSIBILITY_ENABLED=1` and `--force-renderer-accessibility`.
"Chromium files" is the check of the running executable's directory (detect.py's D3). `apps-first-run.jsonl` is an earlier run of the same probe, kept for its
timings (VS Code: the document 680 ms after the request, the tree still growing until 2,146 ms); its `child_types` is empty by a parsing fault since fixed, and its
`screen_reader_optimized` matched the editor's own label, not the mode.

| sample | Electron and Chromium | note | class | role | on the bus | toolkit | name on the bus | nodes before | document after the request, ms | stable, ms | nodes after | Chromium files | children by `--type=` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| code | Electron/43.8.10 Chrome/150.0.7871.250 |  | "code", "code" | "browser-window" | yes | Chromium 1.0 | code | 2 | 542.4 | 542.4 | 394 | yes | {"gpu-process": 1, "renderer": 1, "utility": 5, "zygote": 3}, 0 unreadable |
| obsidian | Electron/43.8.9 Chrome/150.0.7871.250 |  | "md.obsidian.obsidian", "md.obsidian.Obsidian" | "browser-window" | yes | Chromium 1.0 | obsidian | 2 | 110.9 | 110.9 | 105 | yes | {"gpu-process": 1, "renderer": 1, "utility": 1, "zygote": 3}, 0 unreadable |
| mattermost | Electron/45.2.1 Chrome/156.0.8078.75 |  | "com.mattermost.desktop", "com.Mattermost.Desktop" | "browser-window" | yes | Chromium 1.0 | com.Mattermost.Desktop | 2 | 133.0 | 133.0 | 95 | yes | {"gpu-process": 1, "renderer": 7, "utility": 1, "zygote": 3}, 0 unreadable |
| bitwarden | Electron/43.8.6 Chrome/150.0.7871.250 |  | "bitwarden", "bitwarden" | "browser-window" | yes | Chromium 1.0 | bitwarden-app | 2 | 95.6 | 95.6 | 65 | yes | {"gpu-process": 1, "renderer": 1, "utility": 1, "zygote": 3}, 0 unreadable |
| joplin | Electron/42.11.18 Chrome/148.0.7778.280 |  | "appimagekit-joplin", "appimagekit-joplin" | "browser-window" | yes | Chromium 1.0 | joplin | 4 | 288.8 | 288.8 | 253 | yes | {"gpu-process": 1, "renderer": 4, "utility": 1, "zygote": 3}, 0 unreadable |
| signal | Electron/45.4.1 Chrome/156.0.8078.100 | a GTK dialog first: WM_CLASS(STRING) = "signal-desktop", "Signal-desktop" / WM_WINDOW_ROLE:  not found. / _NET_WM_NAME(UTF8_STRING) = | "signal-desktop", "Signal-desktop" |  | yes | Chromium 1.0 | signal-desktop | 1 |  | 1.2 | 1 | yes | {"gpu-process": 1, "utility": 1, "zygote": 3}, 1 unreadable |
| nwjs |   |  | "cua-a11y-probe-nw", "cua-a11y-probe-nw" | "pop-up" | no |  |  |  |  |  |  | yes | {"gpu-process": 1, "renderer": 1, "utility": 2, "zygote": 2}, 0 unreadable |
| github-desktop |   | no window in 60 s; on the bus all the same: github-desktop (Chromium) |  |  |  |  |  |  |  |  |  |  |  |
| element |   | the app ended when its first dialog was answered; a GTK dialog first: "System unsupported" |  |  |  |  |  |  |  |  |  |  |  |
| cefsimple-dialog |  Chrome/152.0.7977.169 |  | WM_CLASS:  not found. |  | yes | Chromium 1.0 | Chromium | 1 |  | 11.0 | 11 | yes | {"gpu-process": 1, "utility": 1, "zygote": 3}, 0 unreadable |
| cefsimple |  Chrome/152.0.7977.169 |  | WM_CLASS:  not found. |  | yes | Chromium 1.0 | Chromium | 4 | 236.9 | 236.9 | 207 | yes | {"gpu-process": 1, "renderer": 3, "utility": 2, "zygote": 3}, 0 unreadable |
| nwjs, variable and flag |   |  | "cua-a11y-probe-nw", "cua-a11y-probe-nw" | "pop-up" | no |  |  |  |  |  |  | yes | {"gpu-process": 1, "renderer": 1, "utility": 2, "zygote": 2}, 0 unreadable |

## 8. Older Electron builds, the probe app (`versions.jsonl`)

| Electron | Chromium | started with | error | on the bus | nodes before | button after the request, ms | nodes after | `isAccessibilitySupportEnabled` after | features after |
|---|---|---|---|---|---|---|---|---|---|
| 22.3.27 | 108.0.5359.215 | IsEnabled on, no variable |  | no |  |  |  |  |  |
| 22.3.27 | 108.0.5359.215 | switches off, ACCESSIBILITY_ENABLED=1 |  | yes | 2 | 168.8 | 24 | true | not offered |
| 32.3.0 | 128.0.6613.186 | IsEnabled on, no variable |  | yes |  |  |  |  |  |
| 32.3.0 | 128.0.6613.186 | switches off, ACCESSIBILITY_ENABLED=1 |  | yes | 2 | 35.1 | 26 | true | not offered |
| 36.0.0 | 136.0.7103.48 | IsEnabled on, no variable |  | yes |  |  |  |  |  |
| 36.0.0 | 136.0.7103.48 | switches off, ACCESSIBILITY_ENABLED=1 |  | yes | 2 | 31.8 | 26 | true | not offered |
| 37.0.0 | 138.0.7204.35 | IsEnabled on, no variable |  | yes |  |  |  |  |  |
| 37.0.0 | 138.0.7204.35 | switches off, ACCESSIBILITY_ENABLED=1 |  | yes | 2 | 28.8 | 26 | false | not offered |
| 44.9.0 | 152.0.7977.167 | IsEnabled on, no variable |  | yes |  |  |  |  |  |
| 44.9.0 | 152.0.7977.167 | switches off, ACCESSIBILITY_ENABLED=1 |  | yes | 2 | 42.1 | 25 | false | nativeAPIs, webContents, extendedProperties |

## 9. The launch route (`launch.jsonl`)

| condition | switches | error | `gio launch` | accessibility variables the app got | on the bus | nodes | button after the request, ms | nodes after |
|---|---|---|---|---|---|---|---|---|
| as-cua-launches, switch on | on / off |  | exit 0 after 17.8 ms |  | yes | 2 | 33.3 | 29 |
| as-cua-launches, switch off | off / off |  | exit 0 after 17.9 ms |  | no |  |  |  |
| session-variable, switch off | off / off |  | exit 0 after 17.2 ms |  | yes | 2 | 41.6 | 29 |
| cua-variable, switch off | off / off |  | exit 0 after 9.8 ms |  | yes | 2 | 33.9 | 29 |
| through cua's runGioLaunch, switch on |  |  | {"settled":"resolved","ms":30036} |  |  |  |  |  |

## 10. VS Code, through cua-engine (`vscode.jsonl`)

| variant | step | source | nodes | elements that mention a screen reader | picture |
|---|---|---|---|---|---|
| request | start | at_spi | 1 |  | vscode-request-start.jpg |
| request | after-5s | at_spi | 393 | entry: The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F4 | vscode-request-after-5s.jpg |
| request | after-15s | at_spi | 393 | entry: The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F4 | vscode-request-after-15s.jpg |
| request | argv.json at the end |  |  | {"home/.vscode/argv.json": []} |  |
| flag | start | at_spi | 404 | section: Screen Reader Optimized; push button: Screen Reader Optimized | vscode-flag-start.jpg |
| flag | argv.json at the end |  |  | {"home/.vscode/argv.json": ["\"force-renderer-accessibility\": true"]} |  |

## 11. Before launch, from files (`detect.jsonl`)

D1 `resources/app.asar` beside the executable; D2 the executable holds `ELECTRON_RUN_AS_NODE`; D3 Chromium's runtime files beside it.

| sample | is | Exec or program | program is | executable found through | D1 | D2 | D3 | versions in the files |
|---|---|---|---|---|---|---|---|---|
| code | electron | /usr/share/code/code %F | elf | exec | yes | yes | yes | Electron/43.8.10 Chrome/150.0.7871.250 |
| obsidian | electron | /opt/Obsidian/obsidian %U | elf | exec | yes | yes | yes | Electron/43.8.9 Chrome/150.0.7871.250 |
| mattermost | electron | /opt/Mattermost/com.Mattermost.Desktop %U | elf | exec | yes | yes | yes | Electron/45.2.1 Chrome/156.0.8078.75 |
| github-desktop | electron | github-desktop %U | elf | exec | yes | yes | yes | Electron/32.3.0 Chrome/128.0.6613.186 |
| bitwarden | electron | /opt/Bitwarden/bitwarden %U | script | script | yes | yes | yes | Electron/43.8.6 Chrome/150.0.7871.250 |
| joplin | electron | /opt/Joplin/joplin %U | elf | exec | yes | yes | yes | Electron/42.11.18 Chrome/148.0.7778.280 |
| discord | electron | /usr/bin/discord --url -- %u | elf | exec | no | no | no |   |
| signal | electron | /opt/Signal/signal-desktop %U | elf | exec | yes | yes | yes | Electron/45.4.1 Chrome/156.0.8078.100 |
| element | electron | /opt/Element/element-desktop %U | elf | exec | yes | yes | yes | Electron/40.6.1 Chrome/144.0.7559.220 |
| logseq | electron | app.AppImage | appimage | program |  |  |  |   |
| cef152 | cef | cef_binary_152.0.15+gb3d72fb+chromium-152.0.7977.169_linux64 | elf | program | no | no | yes |  Chrome/152.0.7977.169 |
| nwjs | nwjs | nwjs-v0.120.0-linux-x64/nw | elf | program | no | no | yes |   |
| org.gnome.gedit.desktop | gtk3 | gedit %U | elf | exec | no | no | no |   |
| org.gnome.TextEditor.desktop | gtk4 | gnome-text-editor %U | elf | exec | no | no | no |   |
| org.kde.kate.desktop | qt5 | kate -b %U | elf | exec | no | no | no |   |
| org.qt-project.qtcreator.desktop | qt6 | qtcreator %F | elf | exec | no | no | no |   |
| google-chrome.desktop | chrome | /usr/bin/google-chrome-stable %U | script | script | no | no | yes |   |
| libreoffice-writer.desktop | vcl | libreoffice --writer %U | script | script | no | no | no |   |
| libreoffice-calc.desktop | vcl | libreoffice --calc %U | script | script | no | no | no |   |
| debian-xterm.desktop | xt | xterm | elf | exec | no | no | no |   |
| firefox_firefox.desktop | gecko | /snap/bin/firefox %u | elf | exec | no | no | no |   |
| org.gnome.Terminal.desktop | gtk3 | gnome-terminal | script | script | no | no | no |   |
| org.gnome.Zenity.desktop | gtk | zenity | elf | exec | no | no | no |   |
| x11vnc.desktop | x11 | x11vnc -gui tray=setpass -rfbport PROMPT -bg -o %%HOME/.x11v | elf | exec | no | no | no |   |
| htop.desktop | terminal | htop | elf | exec | no | no | no |   |
| vim.desktop | terminal | vim %F | elf | exec | no | no | no |   |
| openjdk-21-java.desktop | java | cautious-launcher %f /usr/bin/java -jar | missing |  |  |  |  |   |
| yad-icon-browser.desktop | gtk3 | yad-icon-browser | elf | exec | no | no | no |   |

## 12. What setting the switches writes (`switch.jsonl`)

| step | switches | `org.gnome.desktop.interface toolkit-accessibility` | `org.gnome.desktop.a11y.applications screen-reader-enabled` |
|---|---|---|---|
| both set off | off / off | false | false |
| IsEnabled set on | on / off | true | false |
| IsEnabled set off, then ScreenReaderEnabled set on | on / on | true | true |
| ScreenReaderEnabled set off | on / off | true | false |

## 13. Read from files (`facts.jsonl`)

How often each variable's name occurs in a library or executable, and what the Chromium-family ones link.

| file of | `ACCESSIBILITY_ENABLED` | `GNOME_ACCESSIBILITY` | `QT_ACCESSIBILITY` | `SAL_ACCESSIBILITY_ENABLED` | links (ATK and AT-SPI libraries) |
|---|---|---|---|---|---|
| GTK 3 | 0 | 0 | 0 | 0 |  |
| GTK 4 | 0 | 0 | 0 | 0 |  |
| Qt 5 Gui | 0 | 0 | 0 | 0 |  |
| Qt 6 Gui | 0 | 0 | 0 | 0 |  |
| Qt 5 Core | 0 | 0 | 0 | 0 |  |
| Qt 6 Core | 0 | 0 | 0 | 0 |  |
| ATK | 0 | 0 | 0 | 0 |  |
| the ATK bridge | 0 | 0 | 0 | 0 |  |
| libatspi | 0 | 0 | 0 | 0 |  |
| LibreOffice | 0 | 0 | 0 | 1 |  |
| Firefox (snap) libxul | 0 | 1 | 0 | 0 |  |
| Google Chrome | 1 | 1 | 1 | 0 | libatk-1.0.so.0, libatk-bridge-2.0.so.0, libatspi.so.0 |
| Electron 44.9.0 | 1 | 1 | 1 | 0 | libatk-1.0.so.0, libatk-bridge-2.0.so.0, libatspi.so.0 |
| CEF 152 libcef | 1 | 1 | 1 | 0 | libatk-1.0.so.0, libatk-bridge-2.0.so.0, libatspi.so.0 |
| NW.js 0.120 libnw | 0 | 0 | 0 | 0 | libatk-1.0.so.0, libatspi.so.0 |

- `/etc/X11/Xsession.d/90qt-a11y` (at-spi2-core): `QT_ACCESSIBILITY=1; export QT_ACCESSIBILITY`.
- `google-chrome` on PATH is `/usr/local/bin/google-chrome`: `exec /usr/bin/google-chrome-stable --force-renderer-accessibility --password-store=basic --no-first-run --no-default-browser-check "$@"`.
- The samples' desktop entries (10 files of 9 samples): DBusActivatable in 0, the word Electron in 0.
- `native/linux-engine/src`: lines outside comments that name `GetAttributes` or `GetRelationSet`: 0.
- The person's dconf file was last written 2026-11-02T08:06:32Z (read 2026-11-28T00:48:18Z, after every probe).
