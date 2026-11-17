# Task 63's follow-up: `activate_window` waits only for the normal layer

The design session's ruling on the fix wave's concern 2 (2026-11-06): "The activation wait ends when no normal-layer
managed window covers the target. ABOVE, DOCK, NOTIFICATION and other clients' override-redirect windows neither hold
the wait nor fail it. It errors at the bound only for a normal cover", and "the activation's success must not stand in
for reachability".

## How the layer is read (engine 5138f698)

- `cover::covers` lists the windows stacked above the target or an ancestor that overlap the part of the target on the
  screen and could be managed windows of another client: viewable, InputOutput, not override-redirect, not the
  target's own client's (its resource-id base).
- `X11::on_top` reads, for each, the client the window manager framed: the window with `WM_STATE` inside the frame,
  searched depth-first as the engine already finds a frame's client (`client_in`); with no `WM_STATE` (no window
  manager), the window itself. It reads `_NET_WM_STATE` and `_NET_WM_WINDOW_TYPE` there. A window whose client says
  `_NET_WM_STATE_ABOVE`, or `_NET_WM_WINDOW_TYPE_DOCK` or `_NET_WM_WINDOW_TYPE_NOTIFICATION`, neither holds the wait nor
  fails it. A covering window gone before its properties are read covers nothing.
- The wait ends when no other window is left; still covered by a normal window at 1 s, the answer is `the activation of
  window <id> was requested, but a normal window still covered it after 1000 ms; nothing else was sent`.
- The foreground route's pointer wait (`cover::reach`) still counts every window: viewable, InputOnly and
  override-redirect windows of other clients included. A click at a point under a dock or an ABOVE window is decided by
  that click's own rules, whatever the activation answered.

## The tests that fail on c5aa8ea5 (`native/linux-engine/tests/live_device.rs`, the gate's flags)

```
test activation_waits_for_no_window_kept_above_the_normal_layer_and_a_click_under_one_is_not_sent ... FAILED
  the ABOVE window and the dock neither hold nor fail the activation: "window 2097152 was not brought to the front:
  another window still covered it 1000 ms after its activation was requested; nothing else was sent"
test activate_window_answers_once_its_window_is_on_top_so_a_pipelined_click_lands_in_it ... FAILED
  (the reworded error)
```

On 5138f698 both pass. A window manager's stand-in keeps an ABOVE window and a dock strip on top. The activation
answers once the normal cover is lowered, in both modes. The click under the strip is refused in shared mode (the
Device mode sentence: Gecko takes no click while covered). In dedicated mode it is held to the foreground route's 1 s
bound and refused. Nothing reaches the strip, the window or the cover. A normal window that never lowers makes the
activation error at 1 s with the new sentence.

## The sittings at twice the load (engine 5138f698, harness f0b96f1c)

- `activate-click-load2/`, the settle experiment's `activate_click` in both modes, `settle-0` and `shipped`:
  - 120 of 120 landed, 0 refused.
  - 0 of 120 presses reached the old top window.
  - The raise came at most 8.6 ms after the activation request.
- `device-load2/`, the device cases with the minimized scenes, under 16 stress-ng workers on 8 cores
  (`scripts/followup-chain.sh` starts the load, since the differential run takes no `--load`; load average 17.6 at the
  end):
  - The run is valid, and every audit is clean.
  - Every foreground and activation case passes, `minimized_activate` included, with its witness as at idle.
  - Two verdicts fail, both outside the activation path:
    - `desktop launch_app` cold and warm, on speed: cua 13.15 against the bar's 9.14 ms cold. A speed bar measured
      under load; `launch_app` touches no window.
    - `chrome_dnd_short_in_front_shared`, on 1 of 9 samples: its cold sample was the drag Chrome never began within the
      250 ms hold (the page saw one move of 0 px, then the release). It is a shared-mode background drag; the harness
      puts Chrome in front with xdotool, and no `activate_window` or wait is on its path. This is the short-drop take at
      load that T14 owns (#264; "drops landing at twice the load").
