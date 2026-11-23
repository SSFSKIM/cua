# M4, T11: the motion model of Chromium and Gecko drags (task 66)

T11's row: plot each Chromium thumb drag's distance against the motions Chrome received; on per-motion rounding send
coarse segments that keep every vertex, otherwise pace by elapsed time; prove it with the drag experiment idle (every
family and kind 30 of 30, cua judged absolutely; Chrome's and Electron's thumbs at or past the pinned mean 30 of 30;
Chrome's and Firefox's canvas paths passing on speed; the floor and the hold unchanged). The design session added two
gaps T10 found (2026-11-07, 2026-11-08): Firefox's held `drag_handle` moves, and Firefox's plain drop on private
displays against M1a.4's `:0`.

Every sitting ran on a private display (`scripts/private-run.mjs`: Xvfb, Openbox, no whole-run RECORD), never `:0`,
with Firefox from the Mozilla deb beside the run (task 59), with `scripts/drag.sh <harness> <name> <candidate> <args>`.
Candidates were musl builds made the release workflow's way (`scripts/build-musl.sh`, development runs, not release
gates), named by commit; `scripts/build-tree.sh` built the working tree for the first development sittings.

## The answer

**No per-motion rounding: the browsers take pointer input once a frame.** So the row's branch is "pace by elapsed
time", with one addition the measurements required: a rest of a frame at the path's sharp corners and at its end, the
point then visited again.

- **Chromium's thumb** (`cc/input/scrollbar_controller.cc`): the compositor's scrollbar takes at most one move a frame
  (`drag_processed_for_current_frame_`, reset in `WillBeginImplFrame`) and drops the rest; the delta is computed from
  the drag's origin, with no rounding; and `HandlePointerUp` takes no position. A thumb therefore stops where the last
  frame's first move left it. That is why M1a.4's dwell before the release changed nothing (no move came after it) and
  why the distance spreads 30 px and more at a constant count of motions.
- **A page's moves** (Chromium and Gecko): one move a frame reaches the page, the latest, so a stroke drawn from them
  cuts a corner the pointer passes within a frame.
- **Gecko's drop target** (GTK 3 `gtkdnd.c`, `gtk_drag_button_release_cb`): the source drops only if the target's last
  status accepted, and it sends a position only on a motion; Firefox's target answers a position with the action its
  content gave for an earlier one. So a drop whose motions over the target all arrive before the content answers drops
  nothing.

The model as built (`native/linux-engine/src/engine/pointer.rs` `drag_plan`, `next_due`, `rests_before`;
`desktop.rs` `held_points`; `families.rs` `BROWSER_REST`), in Chromium's and Gecko's rows only:
- the pinned build's samples, paced by elapsed time (Chromium 500 µs a sample, Gecko 300 µs; each sample due a step
  after the previous one was due);
- a rest of 30 ms (a 60 Hz frame and the margin twice the load needs; 20 ms took every kind idle) at each joint that
  turns 30° or more, between its two visits, and at the end, which is then visited once more; none on a Chromium
  drop's floor after a take, which already spaces the steps to its end and holds the pointer there with keepalives
  (`dnd.rs`; the floor and the hold are unchanged);
- Gecko keeps its 30 ms before the release (without it the drop took 3 of 30, `firefox-rest/`);
- a held `drag_handle` move rests 30 ms at its end and visits it again, with no pause after its leading motion
  (`held_rest`; `held_lead_pause` off), and the handle's end rests and visits the pointer's place once more before the
  release dwell. Chromium's held moves too: rerun as controls, they merged their points as Gecko's did.

Every other family keeps the pinned build's events with no wait. The flags `--drag-elapsed`, `--drag-rest-ms`,
`--held-step-ms`/`-us`, `--held-rest-ms` and `--held-lead-pause` measure the model.

## The plot (`analysis/*-chrome.*`, `analysis/*-electron.*`)

Each Chromium thumb drag's content distance against the motions the page received (the coalesced `pointerrawupdate`
samples, T10's count). Within a lane the count is near-constant and the distance is not: at 54–57 motions, the
shipped 500 µs pacing lands 87–147 px, and the same count with a rest before the end's second visit lands 146–147 every
run. The newest build lands 146 with 17 motions. Spearman within each lane is −0.13 to 0.27.

`chromium-rest/` (development build, idle, 30 a side; the pinned build's mean distance of the same sitting):

| lane | Chrome: received, distance | at or past the mean | Electron: received, distance | at or past the mean |
|---|---|---:|---|---:|
| pinned | 60, 127 [117–146] | 14/30 | 61, 130 [115–146] | 15/30 |
| newest | 17, 146 [146–147] | 30/30 | 17, 146 [146–147] | 30/30 |
| 500 µs a sample (0.3.0 and the head) | 55, 115.5 [93–144] | 9/30 | 56, 111 [87–147] | 8/30 |
| 500 µs by elapsed time, no rest | 55, 104.5 [65–147] | 8/30 | 56, 100 [71–146] | 5/30 |
| 500 µs a sample, rest 20 ms | 56, 146 [146–147] | 30/30 | 57, 146 [146–147] | 30/30 |
| 500 µs by elapsed time, rest 20 ms (the row's shape; it ships with 30 ms) | 56, 146 [146–147] | 30/30 | 57, 146 [146–147] | 30/30 |

The rest decides, not the count and not the pace. On the canvas the rest decides too: by elapsed time without it the
stroke missed 12 of 40 (Chrome) and 5 of 30 (Electron); with it 40 of 40 and 30 of 30.

## The final sittings (`final-idle/`, d92a56f6, idle, visible: every Chromium and Gecko kind, plain and held)

The engine as it ships from this task (rest 30 ms), beside each family's pacing before T11 (`cua:before`, the control).
The other families' drags did not change after 16e2c7b4 and are proven in the proof sitting below.

| family | kind | pinned | newest | cua | cua:before | cua warm ms | newest | pinned |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 122.9 | 323.7 | 466.4 |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 122.1 | 325.1 | 461.6 |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 81.2 | 263.5 | 281.3 |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 19/30 | 140.8 | 342.6 | 521.4 |
| Firefox | canvas | 30/30 | 24/30 | 30/30 | 28/30 | 354.3 | 522.3 | 1174.5 |
| Firefox | handle-canvas | 30/30 | 30/30 | 30/30 | 5/30 | 208.4 | 291.9 | 299.3 |
| Firefox | handle-dnd | 30/30 | 30/30 | 30/30 | 4/30 | 204.8 | 181.6 | 182.8 |
| Chrome | select | 30/30 | 30/30 | 30/30 | 30/30 | 130.2 | 319.8 | 451.0 |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 130.9 | 323.0 | 455.4 |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 23/30 | 62.8 | 262.3 | 279.9 |
| Chrome | dnd (in front) | 30/30 | 30/30 | 30/30 | 30/30 | 365.1 | 339.0 | 510.3 |
| Chrome | canvas | 40/40 | 20/40 | 40/40 | 40/40 | 476.7 | 512.8 | 1171.4 |
| Chrome | handle-canvas | 30/30 | 30/30 | 30/30 | 20/30 | 184.6 | 291.3 | 298.6 |
| Chrome | handle-dnd | 30/30 | 30/30 | 30/30 | 24/30 | 174.3 | 182.3 | 182.8 |
| Electron | select | 30/30 | 30/30 | 30/30 | 30/30 | 254.1 | 322.1 | 453.1 |
| Electron | range | 30/30 | 30/30 | 30/30 | 30/30 | 253.9 | 324.8 | 455.7 |
| Electron | scroller | 30/30 | 30/30 | 30/30 | 27/30 | 254.3 | 262.3 | 277.6 |
| Electron | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 366.7 | 339.8 | 513.2 |
| Electron | canvas | 30/30 | 18/30 | 30/30 | 30/30 | 476.7 | 510.2 | 1147.6 |
| Electron | handle-canvas | 30/30 | 30/30 | 30/30 | 19/30 | 184.1 | 291.5 | 298.0 |
| Electron | handle-dnd | 30/30 | 30/30 | 30/30 | 24/30 | 174.6 | 181.5 | 182.8 |

- **Effect**: cua took every run of every cell; the held cells' no-press control took 0 of 30 in each.
- **Thumbs**: Chrome 30 of 30 at or past the pinned mean 132.4 px (shortest 146; `cua:before` 7 of 30), Electron 30 of
  30 past 133.3 (shortest 146; `cua:before` 8 of 30). The plots: `analysis/final-idle-chrome.*`,
  `analysis/final-idle-electron.*`.
- **Long paths on speed**: Firefox's canvas **faster**, 354.3 ms against the newest build's 521.2, [−170.9, −160.2];
  Chrome's canvas **faster**, 476.7 against the pinned build's 1171.4, [−705.6, −683.4], the newest build having given
  the bar up (18 usable of 40; its median 512.8 is above cua's too).
- **Chrome's drop** fails speed, 365.1 against 339.0 [+23.6, +32.2]: the floor, as in the proof sitting below (T14's).
  The Chromium sitting exits 1 on it alone; the Firefox sitting exits 0.

## The proof sitting (`proof-idle/`, 16e2c7b4, rest 20 ms, idle, visible, every family and kind of the drag experiment)

| family | kind | pinned | newest | cua | cua:0ms | cua warm ms | newest | pinned |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Chrome | select | 30/30 | 30/30 | 30/30 | 28/30 | 120.1 | 322.5 | 459.5 |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 120.0 | 325.3 | 459.3 |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 5/30 | 52.5 | 263.1 | 281.7 |
| Chrome | dnd (in front) | 30/30 | 30/30 | 30/30 | 30/30 | 365.5 | 337.7 | 508.1 |
| Chrome | canvas | 40/40 | 22/40 | 40/40 | 1/40 | 446.4 | 518.5 | 1161.1 |
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 112.8 | 324.1 | 455.6 |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 112.1 | 325.8 | 459.0 |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 72.0 | 263.1 | 282.3 |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 0/30 | 130.7 | 347.8 | 521.4 |
| Firefox | canvas | 40/40 | 25/40 | 40/40 | 0/40 | 324.0 | 519.6 | 1180.3 |
| Electron | select | 30/30 | 30/30 | 30/30 | 29/30 | 253.7 | 322.6 | 460.6 |
| Electron | range | 30/30 | 30/30 | 30/30 | 30/30 | 253.7 | 324.3 | 452.9 |
| Electron | scroller | 30/30 | 30/30 | 30/30 | 5/30 | 253.7 | 264.2 | 278.0 |
| Electron | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 367.7 | 340.8 | 513.7 |
| Electron | canvas | 30/30 | 18/30 | 30/30 | 1/30 | 446.4 | 521.3 | 1147.9 |
| gedit | select, scrollbar | 30/30 each | 30/30 each | 30/30 each | 30/30 each | 18.3, 18.7 | | |
| GTK 3 scale | scale | 30/30 | 30/30 | 30/30 | 30/30 | 43.2 | | |
| kate | select, scrollbar | 30/30 each | 30/30 each | 30/30 each | 30/30 each | 21.3, 25.6 | | |
| qtcreator | select, scrollbar | 30/30 each | 30/30 each | 30/30 each | 30/30 each | 29.3, 46.5 | | |
| xterm, xterm with allowSendEvents | select | 30/30 each | 29/30, 30/30 | 30/30 each | 30/30 each | 12.9, 15.7 | | |
| gnome-terminal | select | 30/30 | 30/30 | 30/30 | 30/30 | 20.6 | | |
| Writer (gen) | select | 30/30 | 30/30 | 30/30 | 30/30 | 20.8 | | |
| gnome-text-editor (GTK 4), GTK 4 scale, Writer (gtk3) | select, scale4, select | 0/30 | 0/30 | 0/30 | 0/30 | | | |

- **Effect**: cua took every run of every cell the pinned build takes. The three cells no engine takes are not judged:
  GTK 4 ignores background drags and gives no text geometry (M1a.4, M3.1), and Writer's primed drag selects nothing on
  a private display in any engine (T10's finding, T16's question).
- **Thumbs**: Chrome 30 of 30 at or past the pinned mean 132.7 px (shortest 146), Electron 30 of 30 past 131.9
  (shortest 146).
- **Long paths on speed** (Acceptance 3's interval rule, warm): Chrome's canvas **faster**, 446.4 ms against the newest
  build's 517.5, [−80.2, −65.0]; Firefox's canvas **faster**, 324.0 against 517.3, [−195.5, −190.3].
- **Chrome's drop** fails speed, 365.5 ms against the newest build's 337.7 [+25.9, +31.0]: the drop's floor (350 ms
  after the take, `dnd::RELEASE_AFTER_TAKE`), unchanged by this task and owned by T14 (#263, #269). It is the head's
  own (T10's `idle-head`: 364.8 against 337.4). The first build of this model (71eabe9a, `proof-idle-71eabe9a-stopped/`,
  stopped after Chrome's cells) rested at the end of a drop on its floor too and pushed it to 383.8 ms; 16e2c7b4 takes
  that rest away on the floor (`rests_before`).
- The run exits 1 on Chrome's drop alone (its verdict line).

## Firefox's plain drop: private displays against `:0`

T10 measured 17 to 20 of 30 on 0.3.0 and 16 of 30 on the head here, against M1a.4's 30 of 30 on `:0`.

**What decides a drop is how long the motions over the target last, against how soon Firefox's target answers.** The
time a drag takes on a display sets it, and `:0` was slower:

- On `:0`, M1a.4's engine (7a860320) took 458–486 ms per Firefox drop drag (`m1a/`, `m1a4-drag-browsers`), and M3.1's
  (007c2640) 474 ms with the drag and drop running (`m3/kinds/`, `m31-drag-partial`, 10 of 10) but 261 ms on the same
  path under full cover, where no drag and drop starts (`m31-drag-covered`). The same engines' canvas strokes took the
  same time on `:0` as here (646 ms in M1a.4, 670 on 0.3.0 here). So on `:0`, a running Firefox drag and drop slowed
  each of the engine's motions (two round trips each on the background route) to about 1.5 ms.
- Here no such slowdown shows: M1a.4's own engine takes 274 ms and lands 21 of 30 (`ffdnd-m1a4-engine/`); the head 176
  ms, 22 of 30 (`ffdnd-pace/`).
- Paced to `:0`'s speed by the step alone, the head lands every drop here: 1000 µs a sample, 345.7 ms, 30 of 30;
  1500 µs, 473.8 ms (`:0`'s pace), 30 of 30 (`ffdnd-pace/`).
- At the fast pace, hit or miss does not follow the drag's own time (hits 178.8 ms, misses 177.3; drag and drop
  durations 145 against 140.5): it is a race with the target's answer, which a slower pace removes.
- The X server is not the difference: Xorg with the dummy driver, on a seat with no devices, at 1280×800×24 under
  Openbox (`ffdnd-xorg-dummy/`, `scripts/xorg-dummy.conf`, `scripts/xtools-xorg.patch` on a probe copy of the harness)
  behaves as Xvfb does: 176.6 ms, 17 of 30.
- The same Firefox build ran in both (159.0~build1, the Mozilla deb installed 2026-10-28; the snap replaced it on
  2026-11-04), on the same screen size and window manager.

**What is not proven here:** which part of `:0` slowed the motions during a drag and drop. The differences left are the
display's hardware path (Xorg's modesetting driver on the VM's virtual GPU, `RHT 1234` on `/dev/dri/card0`, software
rendering, a real 60 Hz vblank; `/var/log/Xorg.0.log`), its input devices (libinput: a QEMU tablet, a VMware mouse, a
keyboard), and the person's session (Firefox's home and session bus, other clients). A private display matches none of
them without root (the GPU is `:0`'s, and a virtual one needs a kernel module); separating them needs a sitting on
`:0`. The fix does not lean on that answer: it gives the target a position after a rest at the end of every drag, so
the drop no longer depends on how fast a display delivers the motions. With it the drop lands 30 of 30 here at 130.7
ms (`proof-idle/`), against the pinned build's 30 of 30 at 521.4.

## Firefox's held moves, and Chromium's as controls

T10: cua landed Firefox's held canvas stroke 5 of 30 and the drop 4 of 30; Firefox received 23 coalesced samples in
2–3 events against the vendor builds' 30–32 in 16. Every lane sends its `drag_handle` requests 10 ms apart (cua's
service's settle), the tightest an agent can send them.

**The spacing sweep** (`held-spacing/`, `held-rest/`: development builds, idle, 30 a side; the lane names the spacing
between a held move's points, `L` with the pause after its leading motion; rows from both sittings, the 300 µs row
giving each sitting's count):

| lane | canvas | drop | canvas warm ms | drop warm ms | canvas events received |
|---|---:|---:|---:|---:|---:|
| pinned (8 ms, lead step) | 30/30 | 30/30 | 299.4 | 183.5 | 16 |
| 300 µs, lead pause (0.3.0 and the head) | 7/30, 4/30 | 2/30, 6/30 | 89.6 | 112.1 | 2–3 |
| 1 ms | 9/30 | 11/30 | 108.1 | 119.2 | 3 |
| 2 ms | 10/30 | 26/30 | 134.6 | 129.8 | 5 |
| 4 ms | 15/30 | 30/30 | 188.7 | 149.0 | 8 |
| 6 ms | 16/30 | 30/30 | 243.3 | 169.2 | 12 |
| 8 ms | 22/30 | 30/30 | 297.8 | 188.9 | 15 |
| 4 ms L | 27/30 | 30/30 | 201.7 | 157.5 | 9 |
| 6 ms L | 30/30 | 30/30 | 261.1 | 181.3 | 13 |
| 7 ms L | 30/30 | 30/30 | 292.6 | 193.9 | 14 |
| 8 ms L | 30/30 | 30/30 | 322.4 | 205.3 | 16 |
| 300 µs, rest 10 ms at the end | 22/30 | 23/30 | 118.8 | 132.4 | 4 |
| 300 µs, rest 20 ms at the end | 30/30 | 30/30 | 149.9 | 152.4 | 6 |
| 300 µs, rest 20 ms, lead pause | 30/30 | 30/30 | 149.9 | 154.3 | 6 |

Spacing alone lands both only with the lead pause at 6 ms and up: the corner a held move ends on must stay put into a
frame, which the 10 ms between requests plus a 6 ms pause give. The rest gives that directly, at about half the cost.
On 16e2c7b4 (`held-idle-16e2c7b4/`) the rest alone landed the canvas 30 of 30 but the drop 29 of 30: its one miss was the
window's first held drop, whose drag began 47 ms after the press, after every motion of the path. ae04d620 adds the
rest and second visit before the release, and **lands both 30 of 30** (`held-idle/firefox/`):

| lane | canvas | drop | canvas warm ms | drop warm ms |
|---|---:|---:|---:|---:|
| pinned | 30/30 | 30/30 | 299.1 | 183.5 |
| newest | 30/30 | 30/30 | 292.6 | 183.1 |
| **cua (ae04d620)** | **30/30** | **30/30** | 169.6 | 174.1 |
| cua:before (Gecko's held pacing before T11: 300 µs, lead pause; the control at today's spacing) | 4/30 | 3/30 | 90.0 | 113.2 |
| cua:h6L (6 ms with the lead pause, the spacing alternative) | 30/30 | 30/30 | 262.5 | 181.7 |

The no-press control lane took 0 of 30 in every cell.

**Chromium's held moves, rerun as controls, showed the same merging** (`held-idle-16e2c7b4/chromium/`, its pacing before
T11): three pointermove events against the vendor builds' seventeen, Chrome's stroke 19 of 30 and drop 24, Electron's
16 and 23. By the design session's rule they then take the change. On ae04d620 (`held-idle/chromium/`):

| cell | pinned | newest | cua | cua:before (500 µs, no rest) | cua warm ms | pinned warm ms |
|---|---:|---:|---:|---:|---:|---:|
| Chrome handle-canvas | 30/30 | 30/30 | 30/30 | 22/30 | 144.6 | 299.3 |
| Chrome handle-dnd | 30/30 | 30/30 | 30/30 | 27/30 | 145.0 | 182.8 |
| Electron handle-canvas | 30/30 | 30/30 | 30/30 | 17/30 | 144.3 | 299.1 |
| Electron handle-dnd | 30/30 | 30/30 | 30/30 | 24/30 | 144.8 | 183.5 |

**The cost** (as shipped, 30 ms): a held move adds 30 ms at its end, and the handle's end adds 30 ms before its release.
Its points take their steps and their sends: the longest held move sends twelve motions (the vendor's eleven points, the
pointer's own included, then the end once more after the rest) with a step before nine of them, 2.7 ms of sleeps on
Gecko (300 µs) and 4.5 ms on Chromium (500 µs); by the server's clock its first motion to its end's first visit takes 5
to 6 ms on Gecko and 6 to 7 ms on Chromium, and its request answers in 35.6 and 36.4 ms (medians of 40, idle; corrected
by the fix wave, `fix/held-cost/`, where this line first said "under 3 ms"). The vendor's held move spends 8 ms before
each point, up to 88 ms for a long move. In `final-idle/` the handle stroke of three moves takes 208.4 ms (Firefox) and
184.6 (Chromium) against the pinned build's 299.3 and 298.6, and the handle drop of two moves 204.8 and 174.3 against
182.8: a short held move costs more than the vendor's, a long one less. **`held_lead_pause`**: dropped; with the rest it
changes nothing (30 of 30 either way, 149.9 ms either way, `held-rest/`).

## At twice the load (two stress-ng workers per core, 40 a side; the landed counts decide, cua's at least the pinned build's)

The row asks for idle; the gate runs every Chromium and Gecko kind under the new model at twice the load, and the
design session asked for the held moves at twice the load. These sittings set the rest at 30 ms.

`held-load2/` (ae04d620, rest 20 ms): Firefox's held stroke 37 of 40 and drop 38 against the pinned build's 38 and 40
(the control at the old spacing 9 and 3; the spacing alternative 38 and 40); Chrome's held stroke and drop 40 and 40
against 39 and 40, Electron's 40 and 36 against 40 and 38 (the controls 26, 22, 27 and 16).

`held-rest-load2/` (ae04d620 with the held rest as a variant; Firefox):

| lane | stroke | drop | stroke warm ms | drop warm ms |
|---|---:|---:|---:|---:|
| pinned | 36/40 | 39/40 | 325.2 | 195.3 |
| held rest 20 ms (ae04d620) | 37/40 | 40/40 | 189.4 | 185.6 |
| held rest 30 ms | 40/40 | 40/40 | 225.9 | 215.3 |
| held rest 40 ms | 40/40 | 40/40 | 273.4 | 247.2 |
| 6 ms with the lead pause | 35/40 | 39/40 | 283.5 | 197.6 |

`load2/` (ae04d620, every kind, plain and held; `cua:r30` is the 30 ms rest for drags and held moves alike):

| family | kind | pinned | cua (20 ms) | cua:r30 | cua warm ms | r30 warm ms | pinned warm ms |
|---|---|---:|---:|---:|---:|---:|---:|
| Firefox | select | 40/40 | 40/40 | 40/40 | 116.8 | 129.6 | 474.7 |
| Firefox | range | 40/40 | 40/40 | 40/40 | 136.1 | 148.6 | 556.5 |
| Firefox | scroller | 40/40 | 40/40 | 40/40 | 73.6 | 86.4 | 284.4 |
| Firefox | dnd | 40/40 | **38/40** | 40/40 | 137.0 | 143.4 | 566.2 |
| Firefox | canvas | 40/40 | **38/40** | 40/40 | 344.2 | 409.9 | 1227.4 |
| Firefox | handle-canvas | 39/40 | 39/40 | 39/40 | 186.6 | 227.7 | 325.5 |
| Firefox | handle-dnd | 40/40 | 40/40 | 40/40 | 185.1 | 216.4 | 196.0 |
| Chrome | select | 40/40 | 40/40 | 40/40 | 130.7 | 140.6 | 485.4 |
| Chrome | range | 40/40 | 40/40 | 40/40 | 129.5 | 138.5 | 488.4 |
| Chrome | scroller | 40/40 | 40/40 | 40/40 | 55.9 | 66.4 | 285.2 |
| Chrome | dnd (in front) | 40/40 | 40/40 | 40/40 | 371.6 | 369.0 | 529.4 |
| Chrome | canvas | 40/40 | 40/40 | 40/40 | 455.8 | 486.2 | 1168.9 |
| Chrome | handle-canvas | 39/40 | 40/40 | 40/40 | 158.9 | 197.2 | 307.8 |
| Chrome | handle-dnd | 40/40 | 40/40 | 40/40 | 155.2 | 182.8 | 191.2 |
| Electron | select | 40/40 | 40/40 | 40/40 | 255.7 | 255.2 | 487.3 |
| Electron | range | 39/40 | 40/40 | 40/40 | 255.1 | 255.3 | 494.5 |
| Electron | scroller | 40/40 | 40/40 | 40/40 | 256.0 | 253.9 | 284.2 |
| Electron | dnd | 40/40 | 40/40 | 40/40 | 371.7 | 369.4 | 536.6 |
| Electron | canvas | 40/40 | 40/40 | 40/40 | 451.0 | 480.8 | 1150.9 |
| Electron | handle-canvas | 40/40 | 40/40 | 40/40 | 158.6 | 193.6 | 308.5 |
| Electron | handle-dnd | 38/40 | **37/40** | **37/40** | 154.5 | 184.5 | 189.8 |

So the rest is 30 ms (d92a56f6): it lands every Firefox cell at or above the pinned build, and costs Chromium nothing it
needed. Chrome's and Electron's thumbs and ranges landed 40 of 40 under load in every lane here (#265's 34–36 of 40 on
0.3.0, T10); T12 owns that judgement. **Electron's held drop under load** stays one short of the pinned build in both
lanes (37 against 38; 36 in `held-load2/`): Chromium accepts a drop only once its renderer has answered a position, and
under load that answer comes later than any rest of a frame. Plain Chromium drops have the floor for it (350 ms after
the take, `dnd.rs`); `drag_handle` has none, and its Chromium protections are T17's (#250).

## Engine tests

- `cargo test --release` (unit): 336 passed.
- The live suite as the gate runs it (`scripts/live-suite.sh`, `--release --locked --target x86_64-unknown-linux-musl
  --features live`, on a private Xvfb): every test passed on ae04d620's and on d92a56f6's sources, the new
  `a_browser_s_drag_handle_rests_at_each_held_move_s_end_and_before_its_release` included; the floor's tests
  (`a_drag_and_drop_the_engine_lets_drop_is_released_no_sooner_than_350_ms_after_the_take` and the take after a short
  path) unchanged and passing.

## Sittings

| directory | candidate | what |
|---|---|---|
| `ffdnd-pace/` | 04732370 | Firefox's drop at the head's pace, 1000 µs and 1500 µs a sample |
| `ffdnd-m1a4-engine/` | 7a860320 (M1a.4's engine) | Firefox's drop on a private display |
| `ffdnd-xorg-dummy/` | 04732370 | Firefox's drop and canvas on a private Xorg with the dummy driver |
| `chromium-rest/` | a development build of the working tree before 71eabe9a | Chromium's thumbs and canvas: rest and elapsed-time lanes |
| `firefox-rest/` | the same development build | Firefox's every kind: rest lanes, with and without the release dwell |
| `held-spacing/` | the same development build | Firefox's held moves: the spacing sweep |
| `held-rest/` | a second development build (its held rest given by `--drag-rest-ms`) | Firefox's held moves: spacing with the lead pause, and the rest |
| `proof-idle-71eabe9a-stopped/` | 71eabe9a | the proof sitting, stopped after Chrome's cells (the rest on the floor) |
| `proof-idle/` | 16e2c7b4 | the proof sitting: every family and kind, idle |
| `held-idle-16e2c7b4/` | 16e2c7b4 | Firefox's held moves; Chromium's before the change (the controls) |
| `held-idle/` | ae04d620 | Firefox's and Chromium's held moves with the 20 ms rest |
| `held-load2/` | ae04d620 | the same at twice the load, 40 a side |
| `held-rest-load2/` | ae04d620 | Firefox's held moves at twice the load: the held rest at 20, 30 and 40 ms |
| `load2/` | ae04d620 | every Chromium and Gecko kind, plain and held, at twice the load: 20 ms against 30 |
| `final-idle/` | d92a56f6 | every Chromium and Gecko kind, plain and held, as shipped (30 ms), idle |
| `fix/` | 6e9e5b20 (the engine of db379829) | the fix wave after the review: the repeated-point corner, the handle end on another screen, the held-move cost, an idle sitting |
