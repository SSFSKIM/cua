# linux-engine-diff summary

## task50-run-bus (experiment matrix)

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click pinned / newest / cua | key pinned / newest / cua | type_text pinned / newest / cua | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | 0/5 / 0/5 / ?/5 (5 failed) | 0/5 / 0/5 / ?/5 (5 failed) | 0/2 (2 failed) / 0/2 (2 failed) / 0/2 (2 failed) | clean | ignores | task50-run-bus |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | 0/5 / 0/5 / ?/5 (5 failed) | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 / 2/2 | clean | partial: takes keys; ignores clicks | task50-run-bus |
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (486) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 2/2 / 2/2 | clean | takes | task50-run-bus |
| gnome-terminal (VTE) | gtk 3.24.41 | gnome-terminal-server / Gnome-terminal | at_spi (49) | 5/5 / 5/5 / 5/5 | 5/5 / 5/5 / 5/5 | 0/2 (2 failed) / 0/2 (2 failed) / 2/2 | clean | takes | task50-run-bus |

Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:

| family | ToolkitName | X11 class (instance / class) | tree (nodes) | click cua / cua:none | key cua / cua:none | type_text  | witness | background route | run |
|---|---|---|---|---|---|---|---|---|---|
| GTK4 gnome-text-editor | GTK 4.14.5 | gnome-text-editor / gnome-text-editor | at_spi (64) | ?/5 (5 failed) / ?/5 (5 failed) | ?/5 (5 failed) / ?/5 (5 failed) |  | clean | unknown | task50-run-bus |
| Firefox | Gecko 159.0 | Navigator / firefox | at_spi (68) | ?/5 (5 failed) / ?/5 (5 failed) | 5/5 / 5/5 |  | clean | partial: takes keys; clicks unknown | task50-run-bus |
| GTK3 gedit | gtk 3.24.41 | gedit / Gedit | at_spi (486) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | task50-run-bus |
| gnome-terminal (VTE) | gtk 3.24.41 | gnome-terminal-server / Gnome-terminal | at_spi (49) | 5/5 / 5/5 | 5/5 / 5/5 |  | clean | takes | task50-run-bus |

Families that do not take the background route:

- GTK4 gnome-text-editor (gnome-text-editor / gnome-text-editor; GTK): ignores (run `task50-run-bus`)
- Firefox (Navigator / firefox; Gecko): takes keys; ignores clicks (run `task50-run-bus`)

Background left alone (Acceptance 5): every request in a witness span; each engine's keys and clicks audited through xtrace in an untimed pass:

| family | witness pinned / newest / cua | audit pinned / newest / cua | cua |
|---|---|---|---|
| GTK4 gnome-text-editor | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| Firefox | clean / clean / clean | clean / clean / **requests failed** | **FAIL**: cua's audited requests failed, so the audit did not exercise them |
| GTK3 gedit | clean / clean / clean | clean / clean / clean | PASS |
| gnome-terminal (VTE) | clean / clean / clean | clean / clean / clean | PASS |

**The run is incomplete:** gnome-text-editor: cua's audited requests failed, so the audit did not exercise them; firefox: cua's audited requests failed, so the audit did not exercise them

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 1220 requests, 119 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests)

