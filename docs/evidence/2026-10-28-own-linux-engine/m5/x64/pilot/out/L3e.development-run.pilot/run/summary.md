# linux-engine-diff summary

## m4-dev-L3e-pilot (experiment settle; development run, not a release gate)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| xterm click desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| xterm scroll desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| xterm drag desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| xterm click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| xterm scroll background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| xterm drag background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| xterm press_key dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-gtk3 move desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-gtk3 click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-gtk3 activate_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-gtk3 activate_click dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-gtk3 click_element background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-gtk3 move background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-gtk3 scroll background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt5 move desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt5 click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt5 key_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt5 click_element background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt5 move background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt5 secondary_action background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt5 scroll dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt6 move desktop | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt6 click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt6 key_click background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt6 click_element background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt6 move background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt6 secondary_action background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| settle-qt6 scroll dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gtk4-button click_element background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gtk4-button secondary_action background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gtk4-input press_key dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gtk4-input click dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gtk4-input move dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gtk4-input scroll dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gtk4-input drag dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-text-editor type_text dedicated | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |
| gnome-text-editor activate_window background | shipped | 2 | 0 (0 / 0 / 0 / 0) | 2 | 2 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| xterm click background | clean | 300 | 5 of 5 | 0 |
| xterm scroll background | clean | 245 | 5 of 5 | 0 |
| xterm drag background | clean | 2151 | 5 of 5 | 0 |
| settle-gtk3 click background | clean | 16506 | 5 of 5 | 0 |
| settle-gtk3 click_element background | clean | 21757 | 5 of 5 | 0 |
| settle-gtk3 move background | clean | 43387 | 5 of 5 | 0 |
| settle-gtk3 scroll background | clean | 16438 | 5 of 5 | 0 |
| settle-qt5 click background | clean | 21796 | 5 of 5 | 0 |
| settle-qt5 key_click background | clean | 21924 | 5 of 5 | 0 |
| settle-qt5 click_element background | clean | 21652 | 5 of 5 | 0 |
| settle-qt5 move background | clean | 46365 | 5 of 5 | 0 |
| settle-qt5 secondary_action background | clean | 21657 | 5 of 5 | 0 |
| settle-qt6 click background | clean | 21792 | 5 of 5 | 0 |
| settle-qt6 key_click background | clean | 21924 | 5 of 5 | 0 |
| settle-qt6 click_element background | clean | 21653 | 5 of 5 | 0 |
| settle-qt6 move background | clean | 40999 | 5 of 5 | 0 |
| settle-qt6 secondary_action background | clean | 21651 | 5 of 5 | 0 |
| gtk4-button click_element background | clean | 38686 | 5 of 5 | 0 |
| gtk4-button secondary_action background | clean | 38686 | 5 of 5 | 0 |

**Incomplete or failed:** xterm click desktop (shipped): a development series of 2, not the 30 the rule needs; xterm scroll desktop (shipped): a development series of 2, not the 30 the rule needs; xterm drag desktop (shipped): a development series of 2, not the 30 the rule needs; xterm click background (shipped): a development series of 2, not the 30 the rule needs; xterm scroll background (shipped): a development series of 2, not the 30 the rule needs; xterm drag background (shipped): a development series of 2, not the 30 the rule needs; xterm press_key dedicated (shipped): a development series of 2, not the 30 the rule needs; settle-gtk3 move desktop (shipped): a development series of 2, not the 30 the rule needs; settle-gtk3 click background (shipped): a development series of 2, not the 30 the rule needs; settle-gtk3 activate_click background (shipped): a development series of 2, not the 30 the rule needs; settle-gtk3 activate_click dedicated (shipped): a development series of 2, not the 30 the rule needs; settle-gtk3 click_element background (shipped): a development series of 2, not the 30 the rule needs; settle-gtk3 move background (shipped): a development series of 2, not the 30 the rule needs; settle-gtk3 scroll background (shipped): a development series of 2, not the 30 the rule needs; settle-qt5 move desktop (shipped): a development series of 2, not the 30 the rule needs; settle-qt5 click background (shipped): a development series of 2, not the 30 the rule needs; settle-qt5 key_click background (shipped): a development series of 2, not the 30 the rule needs; settle-qt5 click_element background (shipped): a development series of 2, not the 30 the rule needs; settle-qt5 move background (shipped): a development series of 2, not the 30 the rule needs; settle-qt5 secondary_action background (shipped): a development series of 2, not the 30 the rule needs; settle-qt5 scroll dedicated (shipped): a development series of 2, not the 30 the rule needs; settle-qt6 move desktop (shipped): a development series of 2, not the 30 the rule needs; settle-qt6 click background (shipped): a development series of 2, not the 30 the rule needs; settle-qt6 key_click background (shipped): a development series of 2, not the 30 the rule needs; settle-qt6 click_element background (shipped): a development series of 2, not the 30 the rule needs; settle-qt6 move background (shipped): a development series of 2, not the 30 the rule needs; settle-qt6 secondary_action background (shipped): a development series of 2, not the 30 the rule needs; settle-qt6 scroll dedicated (shipped): a development series of 2, not the 30 the rule needs; gtk4-button click_element background (shipped): a development series of 2, not the 30 the rule needs; gtk4-button secondary_action background (shipped): a development series of 2, not the 30 the rule needs; gtk4-input press_key dedicated (shipped): a development series of 2, not the 30 the rule needs; gtk4-input click dedicated (shipped): a development series of 2, not the 30 the rule needs; gtk4-input move dedicated (shipped): a development series of 2, not the 30 the rule needs; gtk4-input scroll dedicated (shipped): a development series of 2, not the 30 the rule needs; gtk4-input drag dedicated (shipped): a development series of 2, not the 30 the rule needs; gnome-text-editor type_text dedicated (shipped): a development series of 2, not the 30 the rule needs; gnome-text-editor activate_window background (shipped): a development series of 2, not the 30 the rule needs.

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 4548 requests, 323 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

