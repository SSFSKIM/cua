| settle | constant (ms) | set by | cells that held at no step | cells set aside |
|---|---:|---|---|---|
| perform_secondary_action | 0 | chrome-input secondary_action background at idle; electron-input secondary_action background at idle; firefox-input secondary_action background at idle; chrome-input secondary_action background at 2x; electron-input secondary_action background at 2x; firefox-input secondary_action background at 2x | – | – |
| click | 25 | gnome-terminal click background at 2x | – | – |
| click_element | 0 | chrome-input click_element background at idle; electron-input click_element background at idle; firefox-input click_element background at idle; settle-gtk3 click_element background at idle; chrome-input click_element background at 2x; electron-input click_element background at 2x; firefox-input click_element background at 2x; settle-gtk3 click_element background at 2x | – | – |
| animated_gtk4 | 250 | gtk4-button click_element background at idle; gtk4-button secondary_action background at idle; gtk4-button click_element background at 2x; gtk4-button secondary_action background at 2x | – | – |
| animated_qt | 125 | settle-qt6 secondary_action background at 2x | – | – |
| clipboard_read | 0 | chrome-text clipboard_read background at idle; gedit clipboard_read background at idle; chrome-text clipboard_read background at 2x; gedit clipboard_read background at 2x | – | – |
| clipboard_write | 100 (unmeasured) | – | – | – |
| drag | 10 | electron-input drag background at idle; electron-input drag desktop at idle; electron-input drag dedicated at idle; gedit drag background at idle; gedit drag desktop at 2x; xterm drag background at 2x | – | – |
| drag_handle | 10 | electron-input drag_handle desktop at idle; gedit drag_handle desktop at 2x | – | – |
| activate_window | 10 | chrome-text activate_window background at idle; electron-text activate_window background at idle; firefox-text activate_window background at idle; gedit activate_window background at idle; kate activate_window background at idle; qtcreator activate_window background at idle; writer activate_window background at idle; gnome-terminal activate_window background at idle; gnome-text-editor activate_window background at idle; chrome-text activate_window background at 2x; electron-text activate_window background at 2x; firefox-text activate_window background at 2x; gedit activate_window background at 2x; kate activate_window background at 2x; qtcreator activate_window background at 2x; writer activate_window background at 2x; gnome-terminal activate_window background at 2x; gnome-text-editor activate_window background at 2x | – | – |
| move | 75 | electron-input move desktop at idle; electron-input move desktop at 2x | – | – |
| move_relative | 0 | chrome-input move_relative desktop at idle; electron-input move_relative desktop at idle; chrome-input move_relative desktop at 2x; electron-input move_relative desktop at 2x | – | – |
| press_key | 100 (unmeasured) | – | – | – |
| key_down | 100 (unmeasured) | – | – | – |
| key_up | 100 (unmeasured) | – | – | – |
| scroll | 75 | electron-input scroll background at idle; electron-input scroll desktop at idle; electron-input scroll background at 2x | – | – |
| type_text | 100 (unmeasured) | – | – | – |
| launch_app | 100 (unmeasured) | – | – | – |

| cell | settle | held (idle) | held (2x) | series (idle) | series (2x) |
|---|---|---:|---:|---|---|
| chrome-input click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input click_element background | click_element | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input right_click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input secondary_action background | perform_secondary_action | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input move background | move | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| chrome-input scroll background | scroll | 50 | 0 | 0:26 misses (26 late, 0 never) in 31, 10:20 misses (20 late, 0 never) in 31, 25:9 misses (9 late, 0 never) in 37, 50:held (idle) | 0:held (load2) |
| chrome-input drag background | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-text clipboard_read background | clipboard_read | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-text activate_window background | activate_window | 10 | 10 | 0:13 misses (13 late, 0 never) in 34, 10:held (idle) | 0:13 misses (13 late, 0 never) in 33, 10:held (load2) |
| chrome-input click desktop | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input move desktop | move | 50 | 0 | 0:31 misses (31 late, 0 never) in 31, 10:29 misses (29 late, 0 never) in 31, 25:13 misses (13 late, 0 never) in 32, 50:held (idle-2) | 0:held (load2) |
| chrome-input move_relative desktop | move_relative | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| chrome-input scroll desktop | scroll | 25 | 0 | 0:16 misses (16 late, 0 never) in 31, 10:14 misses (14 late, 0 never) in 36, 25:held (idle) | 0:held (load2) |
| chrome-input drag desktop | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input drag_handle desktop | drag_handle | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input drag dedicated | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input click background | click | 10 | 0 | 0:5 misses (5 late, 0 never) in 37, 10:held (idle) | 0:held (load2) |
| electron-input click_element background | click_element | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input right_click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input secondary_action background | perform_secondary_action | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input move background | move | 10 | 0 | 0:2 misses (2 late, 0 never) in 31, 10:held (idle-2) | 0:held (load2) |
| electron-input scroll background | scroll | 75 | 75 | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:29 misses (29 late, 0 never) in 31, 50:10 misses (10 late, 0 never) in 33, 75:held (idle) | 0:30 misses (30 late, 0 never) in 31, 10:27 misses (27 late, 0 never) in 31, 25:19 misses (19 late, 0 never) in 33, 50:4 misses (4 late, 0 never) in 39, 75:held (load2) |
| electron-input drag background | drag | 10 | 0 | 0:8 misses (8 late, 0 never) in 32, 10:held (idle) | 0:held (load2) |
| electron-text activate_window background | activate_window | 10 | 10 | 0:25 misses (25 late, 0 never) in 31, 10:held (idle) | 0:10 misses (10 late, 0 never) in 31, 10:held (load2) |
| electron-input click desktop | click | 10 | 0 | 0:8 misses (8 late, 0 never) in 36, 10:held (idle) | 0:held (load2) |
| electron-input move desktop | move | 75 | 75 | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:31 misses (31 late, 0 never) in 31, 50:29 misses (29 late, 0 never) in 32, 75:held (idle-2) | 0:30 misses (30 late, 0 never) in 31, 10:28 misses (28 late, 0 never) in 32, 25:28 misses (28 late, 0 never) in 31, 50:10 misses (10 late, 0 never) in 35, 75:held (load2) |
| electron-input move_relative desktop | move_relative | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| electron-input scroll desktop | scroll | 75 | 50 | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:29 misses (29 late, 0 never) in 31, 50:4 misses (4 late, 0 never) in 38, 75:held (idle) | 0:24 misses (24 late, 0 never) in 32, 10:28 misses (28 late, 0 never) in 33, 25:13 misses (13 late, 0 never) in 32, 50:held (load2) |
| electron-input drag desktop | drag | 10 | 0 | 0:8 misses (8 late, 0 never) in 31, 10:held (idle) | 0:held (load2) |
| electron-input drag_handle desktop | drag_handle | 10 | 0 | 0:4 misses (4 late, 0 never) in 34, 10:held (idle) | 0:held (load2) |
| electron-input drag dedicated | drag | 10 | 0 | 0:6 misses (6 late, 0 never) in 31, 10:held (idle) | 0:held (load2) |
| firefox-input click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input click_element background | click_element | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input right_click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input secondary_action background | perform_secondary_action | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input move background | move | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| firefox-input scroll background | scroll | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input drag background | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-text activate_window background | activate_window | 10 | 10 | 0:28 misses (28 late, 0 never) in 32, 10:held (idle) | 0:12 misses (12 late, 0 never) in 36, 10:held (load2) |
| firefox-input click dedicated | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input right_click dedicated | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input move dedicated | move | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| firefox-input scroll dedicated | scroll | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input drag dedicated | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gedit click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gedit drag background | drag | 10 | 0 | 0:5 misses (5 late, 0 never) in 32, 10:held (idle) | 0:held (load2) |
| gedit activate_window background | activate_window | 10 | 10 | 0:6 misses (6 late, 0 never) in 34, 10:held (idle) | 0:6 misses (6 late, 0 never) in 37, 10:held (load2) |
| gedit clipboard_read background | clipboard_read | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gedit click desktop | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gedit drag desktop | drag | 0 | 10 | 0:held (idle) | 0:2 misses (2 late, 0 never) in 42, 10:held (load2) |
| gedit drag_handle desktop | drag_handle | 0 | 10 | 0:held (idle) | 0:3 misses (3 late, 0 never) in 57, 10:held (load2) |
| kate click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| kate key_click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| kate drag background | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| kate activate_window background | activate_window | 10 | 10 | 0:25 misses (25 late, 0 never) in 32, 10:held (idle) | 0:10 misses (10 late, 0 never) in 35, 10:held (load2) |
| qtcreator click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| qtcreator key_click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| qtcreator drag background | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| qtcreator activate_window background | activate_window | 10 | 10 | 0:28 misses (28 late, 0 never) in 31, 10:held (idle) | 0:14 misses (14 late, 0 never) in 31, 10:held (load2) |
| writer click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| writer activate_window background | activate_window | 10 | 10 | 0:18 misses (18 late, 0 never) in 32, 10:held (idle) | 0:15 misses (15 late, 0 never) in 31, 10:held (load2) |
| gnome-terminal click background | click | 10 | 25 | 0:31 misses (31 late, 0 never) in 31, 10:held (idle) | 0:31 misses (31 late, 0 never) in 31, 10:8 misses (8 late, 0 never) in 31, 25:held (load2) |
| gnome-terminal scroll background | scroll | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gnome-terminal activate_window background | activate_window | 10 | 10 | 0:14 misses (14 late, 0 never) in 32, 10:held (idle) | 0:12 misses (12 late, 0 never) in 31, 10:held (load2) |
| xterm click background | click | 0 | 10 | 0:held (idle) | 0:3 misses (3 late, 0 never) in 31, 10:held (load2) |
| xterm scroll background | scroll | 0 | 10 | 0:held (idle) | 0:4 misses (4 late, 0 never) in 42, 10:held (load2) |
| xterm drag background | drag | 0 | 10 | 0:held (idle) | 0:5 misses (5 late, 0 never) in 32, 10:held (load2) |
| settle-gtk3 click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 activate_click background | activate_window | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 activate_click dedicated | activate_window | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 click_element background | click_element | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 move background | move | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 scroll background | scroll | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt5 click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt5 key_click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt5 click_element background | animated_qt | 100 | 100 | 0:31 misses (31 late, 0 never) in 31, 100:held (idle) | 0:31 misses (31 late, 0 never) in 31, 100:held (load2) |
| settle-qt5 move background | move | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt5 secondary_action background | animated_qt | 100 | 100 | 0:31 misses (31 late, 0 never) in 31, 100:held (idle) | 0:31 misses (31 late, 0 never) in 31, 100:held (load2) |
| settle-qt5 scroll dedicated | scroll | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt6 click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt6 key_click background | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt6 click_element background | animated_qt | 100 | 100 | 0:31 misses (31 late, 0 never) in 31, 100:held (idle) | 0:31 misses (31 late, 0 never) in 31, 100:held (load2) |
| settle-qt6 move background | move | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt6 secondary_action background | animated_qt | 100 | 125 | 0:31 misses (31 late, 0 never) in 31, 100:held (idle) | 0:31 misses (31 late, 0 never) in 31, 100:3 misses (3 late, 0 never) in 40, 125:held (load2) |
| settle-qt6 scroll dedicated | scroll | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gtk4-button click_element background | animated_gtk4 | 250 | 250 | 0:31 misses (31 late, 0 never) in 31, 100:31 misses (31 late, 0 never) in 31, 125:31 misses (31 late, 0 never) in 31, 150:31 misses (31 late, 0 never) in 31, 175:31 misses (31 late, 0 never) in 31, 200:31 misses (31 late, 0 never) in 31, 225:31 misses (31 late, 0 never) in 31, 250:held (idle) | 0:31 misses (31 late, 0 never) in 31, 100:31 misses (31 late, 0 never) in 31, 125:31 misses (31 late, 0 never) in 31, 150:31 misses (31 late, 0 never) in 31, 175:31 misses (31 late, 0 never) in 31, 200:31 misses (31 late, 0 never) in 31, 225:23 misses (23 late, 0 never) in 32, 250:held (load2) |
| gtk4-button secondary_action background | animated_gtk4 | 250 | 250 | 0:31 misses (31 late, 0 never) in 31, 100:31 misses (31 late, 0 never) in 31, 125:31 misses (31 late, 0 never) in 31, 150:31 misses (31 late, 0 never) in 31, 175:31 misses (31 late, 0 never) in 31, 200:31 misses (31 late, 0 never) in 31, 225:31 misses (31 late, 0 never) in 31, 250:held (idle) | 0:31 misses (31 late, 0 never) in 31, 100:31 misses (31 late, 0 never) in 31, 125:31 misses (31 late, 0 never) in 31, 150:31 misses (31 late, 0 never) in 31, 175:31 misses (31 late, 0 never) in 31, 200:31 misses (31 late, 0 never) in 31, 225:28 misses (28 late, 0 never) in 31, 250:held (load2) |
| gtk4-input click dedicated | click | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gtk4-input move dedicated | move | 10 | 10 | 0:10 misses (10 late, 0 never) in 34, 10:held (idle) | 0:6 misses (6 late, 0 never) in 33, 10:held (load2) |
| gtk4-input scroll dedicated | scroll | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gtk4-input drag dedicated | drag | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gnome-text-editor activate_window background | activate_window | 10 | 10 | 0:5 misses (5 late, 0 never) in 40, 10:held (idle) | 0:7 misses (7 late, 0 never) in 37, 10:held (load2) |

| settle | chrome | electron | firefox | gedit | kate | qtcreator | writer | gnome-terminal | xterm | gtk3 | qt5 | qt6 | gtk4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| click | 0 / 0 | 10 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 10 / 25 | 0 / 10 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| click_element | 0 / 0 | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | 0 / 0 | · / · | · / · | · / · |
| perform_secondary_action | 0 / 0 | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| move | 50 / 0 | 75 / 75 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | 0 / 0 | 0 / 0 | 0 / 0 | 10 / 10 |
| scroll | 50 / 0 | 75 / 75 | 0 / 0 | · / · | · / · | · / · | · / · | 0 / 0 | 0 / 10 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| drag | 0 / 0 | 10 / 0 | 0 / 0 | 10 / 10 | 0 / 0 | 0 / 0 | · / · | · / · | 0 / 10 | · / · | · / · | · / · | 0 / 0 |
| clipboard_read | 0 / 0 | · / · | · / · | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| activate_window | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | · / · | 0 / 0 | · / · | · / · | 10 / 10 |
| move_relative | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| drag_handle | 0 / 0 | 10 / 0 | · / · | 0 / 10 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| animated_qt | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | 100 / 100 | 100 / 125 | · / · |
| animated_gtk4 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | 250 / 250 |
