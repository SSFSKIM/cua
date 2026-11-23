| method | constant (ms) | set by | cells that held at no step | cells whose input never came at any step (set aside) |
|---|---:|---|---|---|
| perform_secondary_action | 10 | electron-input secondary_action background at idle | – | – |
| click | 100 | – | gtk4-button click_element background at idle; settle-qt6 click_element background at 2x; gtk4-button click_element background at 2x | gtk4-input click dedicated at 2x |
| clipboard_read | 0 | chrome-text clipboard_read background at idle; gedit clipboard_read background at idle; chrome-text clipboard_read background at 2x; gedit clipboard_read background at 2x | – | – |
| clipboard_write | 0 | chrome-text clipboard_write background at idle; gedit clipboard_write background at idle; chrome-text clipboard_write background at 2x; gedit clipboard_write background at 2x | – | – |
| drag | 10 | electron-input drag background at idle; electron-input drag desktop at idle; xterm drag background at 2x | – | gtk4-input drag dedicated at 2x |
| drag_handle | 10 | electron-input drag_handle desktop at idle; gedit drag_handle desktop at 2x | – | – |
| activate_window | 10 | kate activate_window background at 2x; qtcreator activate_window background at 2x | – | – |
| move | 0 | chrome-input move background at idle; chrome-input move desktop at idle; electron-input move background at idle; electron-input move desktop at idle; firefox-input move background at idle; settle-gtk3 move background at idle; settle-qt5 move background at idle; settle-qt6 move background at idle; gtk4-input move dedicated at idle; chrome-input move background at 2x; chrome-input move desktop at 2x; electron-input move background at 2x; electron-input move desktop at 2x; firefox-input move background at 2x; settle-gtk3 move background at 2x; settle-qt5 move background at 2x; settle-qt6 move background at 2x; gtk4-input move dedicated at 2x | – | – |
| move_relative | 0 | chrome-input move_relative desktop at idle; electron-input move_relative desktop at idle; chrome-input move_relative desktop at 2x; electron-input move_relative desktop at 2x | – | – |
| press_key | 100 | – | electron-input press_key background at idle; electron-input press_key desktop at 2x | – |
| key_down | 25 | writer key_down background at idle; gnome-terminal key_down background at idle; writer key_down background at 2x; gnome-terminal key_down background at 2x | – | – |
| key_up | 50 | chrome-input key_up desktop at 2x | – | – |
| scroll | 0 | chrome-input scroll background at idle; chrome-input scroll desktop at idle; electron-input scroll background at idle; electron-input scroll desktop at idle; firefox-input scroll background at idle; gnome-terminal scroll background at idle; xterm scroll background at idle; settle-gtk3 scroll background at idle; gtk4-input scroll dedicated at idle; chrome-input scroll background at 2x; chrome-input scroll desktop at 2x; electron-input scroll background at 2x; electron-input scroll desktop at 2x; firefox-input scroll background at 2x; gnome-terminal scroll background at 2x; xterm scroll background at 2x; settle-gtk3 scroll background at 2x | – | gtk4-input scroll dedicated at 2x |
| type_text | 0 | chrome-text type_text background at idle; electron-text type_text background at idle; firefox-text type_text background at idle; gedit type_text background at idle; writer type_text background at idle; gnome-terminal type_text background at idle; gnome-text-editor type_text dedicated at idle; chrome-text type_text background at 2x; electron-text type_text background at 2x; firefox-text type_text background at 2x; gedit type_text background at 2x; writer type_text background at 2x; gnome-terminal type_text background at 2x; gnome-text-editor type_text dedicated at 2x | – | – |
| launch_app | 100 (unmeasured) | – | – | – |

| cell | held (idle) | held (2x) | series (idle) | series (2x) |
|---|---:|---:|---|---|
| chrome-input press_key background | 0 | 10 | 0:held (idle-2) | 0:4 misses (4 late, 0 never) in 35, 10:held (load2) |
| chrome-input key_down background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input key_up background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input click_element background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input right_click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input secondary_action background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input move background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input scroll background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input drag background | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| chrome-text type_text background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-text clipboard_read background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-text clipboard_write background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-text activate_window background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input press_key desktop | 0 | 75 | 0:held (idle-2) | 0:8 misses (8 late, 0 never) in 35, 10:7 misses (7 late, 0 never) in 39, 25:5 misses (5 late, 0 never) in 31, 50:2 misses (2 late, 0 never) in 52, 75:held (load2) |
| chrome-input key_down desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input key_up desktop | 0 | 50 | 0:held (idle) | 0:8 misses (8 late, 0 never) in 33, 10:3 misses (3 late, 0 never) in 31, 25:3 misses (3 late, 0 never) in 51, 50:held (load2) |
| chrome-input click desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input move desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input move_relative desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input scroll desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| chrome-input drag desktop | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| chrome-input drag_handle desktop | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| electron-input press_key background | **none** | 0 | 0:18 misses (18 late, 0 never) in 31, 10:11 misses (11 late, 0 never) in 37, 25:11 misses (11 late, 0 never) in 33, 50:10 misses (10 late, 0 never) in 45, 75:7 misses (7 late, 0 never) in 35, 100:8 misses (8 late, 0 never) in 31 (idle-2) | 0:held (load2) |
| electron-input key_down background | 10 | 0 | 0:4 misses (4 late, 0 never) in 31, 10:held (idle) | 0:held (load2) |
| electron-input key_up background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input click background | 10 | 0 | 0:12 misses (12 late, 0 never) in 44, 10:held (idle) | 0:held (load2) |
| electron-input click_element background | 10 | 0 | 0:6 misses (6 late, 0 never) in 38, 10:held (idle) | 0:held (load2) |
| electron-input right_click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input secondary_action background | 10 | 0 | 0:3 misses (3 late, 0 never) in 40, 10:held (idle) | 0:held (load2) |
| electron-input move background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input scroll background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input drag background | 10 | 0 | 0:9 misses (9 late, 0 never) in 32, 10:held (idle-2) | 0:held (load2) |
| electron-text type_text background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-text activate_window background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input press_key desktop | 0 | **none** | 0:held (idle-2) | 0:3 misses (3 late, 0 never) in 38, 10:8 misses (8 late, 0 never) in 41, 25:10 misses (10 late, 0 never) in 31, 50:8 misses (8 late, 0 never) in 34, 75:6 misses (6 late, 0 never) in 34, 100:5 misses (5 late, 0 never) in 40 (load2) |
| electron-input key_down desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input key_up desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input click desktop | 10 | 0 | 0:7 misses (7 late, 0 never) in 35, 10:held (idle) | 0:held (load2) |
| electron-input move desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input move_relative desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input scroll desktop | 0 | 0 | 0:held (idle) | 0:held (load2) |
| electron-input drag desktop | 10 | 0 | 0:5 misses (5 late, 0 never) in 31, 10:held (idle-2) | 0:held (load2) |
| electron-input drag_handle desktop | 10 | 0 | 0:9 misses (9 late, 0 never) in 31, 10:held (idle-2) | 0:held (load2) |
| firefox-input press_key background | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| firefox-input key_down background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input key_up background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input click_element background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input right_click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input secondary_action background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input move background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input scroll background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-input drag background | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| firefox-text type_text background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| firefox-text activate_window background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gedit press_key background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit key_down background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit click background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit drag background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit activate_window background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit type_text background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit clipboard_read background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit clipboard_write background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit press_key desktop | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit click desktop | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit drag desktop | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gedit drag_handle desktop | 0 | 10 | 0:held (idle-4) | 0:2 misses (2 late, 0 never) in 32, 10:held (load2-4) |
| kate press_key background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| kate key_down background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| kate click background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| kate key_click background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| kate drag background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| kate activate_window background | 0 | 10 | 0:held (idle-4) | 0:11 misses (11 late, 0 never) in 33, 10:held (load2-4) |
| qtcreator press_key background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| qtcreator key_down background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| qtcreator click background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| qtcreator key_click background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| qtcreator drag background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| qtcreator activate_window background | 0 | 10 | 0:held (idle-4) | 0:12 misses (12 late, 0 never) in 33, 10:held (load2-4) |
| writer press_key background | 25 | 25 | 0:16 misses (16 late, 0 never) in 32, 10:7 misses (7 late, 0 never) in 32, 25:held (idle-4) | 0:16 misses (16 late, 0 never) in 32, 10:10 misses (10 late, 0 never) in 36, 25:held (load2-4) |
| writer key_down background | 25 | 25 | 0:16 misses (16 late, 0 never) in 32, 10:6 misses (6 late, 0 never) in 32, 25:held (idle-4) | 0:16 misses (16 late, 0 never) in 32, 10:12 misses (12 late, 0 never) in 34, 25:held (load2-4) |
| writer click background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| writer activate_window background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| writer type_text background | 0 | 0 | 0:held (idle-4) | 0:held (load2-4) |
| gnome-terminal press_key background | 25 | 25 | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:held (idle) | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:held (load2) |
| gnome-terminal key_down background | 25 | 25 | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:held (idle) | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:held (load2) |
| gnome-terminal click background | 10 | 25 | 0:31 misses (31 late, 0 never) in 31, 10:held (idle) | 0:31 misses (31 late, 0 never) in 31, 10:4 misses (4 late, 0 never) in 37, 25:held (load2) |
| gnome-terminal scroll background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gnome-terminal type_text background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gnome-terminal activate_window background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| xterm click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| xterm scroll background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| xterm drag background | 0 | 10 | 0:held (idle) | 0:2 misses (2 late, 0 never) in 52, 10:held (load2) |
| xterm press_key dedicated | 0 | 10 | 0:held (idle) | 0:5 misses (5 late, 0 never) in 31, 10:held (load2) |
| settle-gtk3 click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 click_element background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 move background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-gtk3 scroll background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt5 click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt5 key_click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt5 click_element background | 100 | 100 | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:31 misses (31 late, 0 never) in 31, 50:31 misses (31 late, 0 never) in 31, 75:31 misses (31 late, 0 never) in 31, 100:held (idle) | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:31 misses (31 late, 0 never) in 31, 50:31 misses (31 late, 0 never) in 31, 75:26 misses (26 late, 0 never) in 31, 100:held (load2) |
| settle-qt5 move background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt6 click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt6 key_click background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| settle-qt6 click_element background | 100 | **none** | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:31 misses (31 late, 0 never) in 31, 50:31 misses (31 late, 0 never) in 31, 75:31 misses (31 late, 0 never) in 31, 100:held (idle) | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:31 misses (31 late, 0 never) in 31, 50:31 misses (31 late, 0 never) in 31, 75:23 misses (23 late, 0 never) in 31, 100:3 misses (3 late, 0 never) in 57 (load2) |
| settle-qt6 move background | 0 | 0 | 0:held (idle) | 0:held (load2) |
| gtk4-button click_element background | **none** | **none** | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:31 misses (31 late, 0 never) in 31, 50:31 misses (31 late, 0 never) in 31, 75:31 misses (31 late, 0 never) in 31, 100:31 misses (31 late, 0 never) in 31 (idle) | 0:31 misses (31 late, 0 never) in 31, 10:31 misses (31 late, 0 never) in 31, 25:31 misses (31 late, 0 never) in 31, 50:31 misses (31 late, 0 never) in 31, 75:31 misses (31 late, 0 never) in 31, 100:31 misses (31 late, 0 never) in 31 (load2-2) |
| gtk4-input press_key dedicated | 0 | 0 | 0:held (idle) | 0:held (load2-2) |
| gtk4-input click dedicated | 0 | **none** | 0:held (idle) | 0:10 misses (0 late, 10 never) in 31, 10:9 misses (0 late, 9 never) in 32, 25:7 misses (0 late, 7 never) in 33, 50:7 misses (0 late, 7 never) in 31, 75:7 misses (0 late, 7 never) in 31, 100:12 misses (0 late, 12 never) in 34 (load2-2) |
| gtk4-input move dedicated | 0 | 0 | 0:held (idle) | 0:held (load2-2) |
| gtk4-input scroll dedicated | 0 | **none** | 0:held (idle) | 0:7 misses (0 late, 7 never) in 33, 10:7 misses (0 late, 7 never) in 33, 25:12 misses (0 late, 12 never) in 31, 50:11 misses (0 late, 11 never) in 36, 75:13 misses (0 late, 13 never) in 32, 100:12 misses (0 late, 12 never) in 34 (load2-2) |
| gtk4-input drag dedicated | 0 | **none** | 0:held (idle) | 0:9 misses (0 late, 9 never) in 31, 10:18 misses (0 late, 18 never) in 38, 25:11 misses (0 late, 11 never) in 34, 50:9 misses (0 late, 9 never) in 35, 75:11 misses (0 late, 11 never) in 34, 100:10 misses (0 late, 10 never) in 38 (load2-2) |
| gnome-text-editor type_text dedicated | 0 | 0 | 0:held (idle) | 0:held (load2-2) |
| gnome-text-editor activate_window background | 0 | 0 | 0:held (idle) | 0:held (load2-2) |
| chrome-text press_key background | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
| electron-text press_key background | 10 | 0 | 0:3 misses (3 late, 0 never) in 35, 10:held (idle-2) | 0:held (load2) |
| firefox-text press_key background | 0 | 0 | 0:held (idle-2) | 0:held (load2) |
