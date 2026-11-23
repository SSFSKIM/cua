# #374: Show Menu confirmed, or menuUnconfirmed (hosted, 2026-11-16)

The full measurement for #374 is run 44012053373: `probe-374` dispatched at reps 10 from kit `probe/374-measure`
be48e33a, on the GitHub-hosted macos-latest image 20261102.0473.1 (macOS 26.7.2). It compares the candidate engine
7ad0362b (the ancestor and focus rule, rulings 1ea561bc:752 and 753) with main before the fix, b99232de, as the
control. App versions: Chrome for Testing 155.0.8059.84, Electron 44.9.0, Firefox 159.0, Safari 27.2, and the kit's
AppKit fixture.

The kit's README (`scripts/probe-374/README.md` on the kit branch) describes the cells and the oracle. The oracle is
independent of the engine: it reads the process's pop-up windows and AX menus at least 1.2 s after the send, and the
fixture page reports its own counters and menus. Each row is classed against the oracle and the page, never against
the engine's answer. Before this run there were three smoke runs:

- 44001129810 found the kit's Escape counted as the user's input.
- 44004726498 was the diagnostic that located each family's menu in the AX tree (the Decision Log's "#374's menu
  hosts").
- 44010453311 first ran the negative controls.

## Against the gate (the candidate)

- **False ok: 0 of 400** on the request cells (native, popup, blocking, aria, own, ignored), across 5 families, both
  placements, 10 reps each. The control's false ok on the same cells: 120 of 400. Every own row (80) and every AppKit
  ignored row (20) answered ok there.
- **own (preventDefault, the page's own menu):** 80 of 80 `menuUnconfirmed`, the page's contextmenu counter risen in
  every row.
- **ignored (AppKit, takes the action, shows nothing):** 20 of 20 `menuUnconfirmed`.
- **native and popup, where the oracle saw a menu:** 119 of 120 confirmed. Native menus go through `ancestor` in
  Chrome for Testing, Electron, Firefox and Safari, and through `element` in AppKit; popup menus through `element`. The
  one false unconfirmed was Firefox's first Show Menu of its job (foreground, rep 0). Its single poll took 1.44 s, and
  the menu came up after that poll had read the host. Smoke 44010453311 had the same shape once, in Safari (foreground,
  rep 0, 1.16 s). Overall that is 1 in 100 browser native rows in this run. Counting only the first Show Menu of each
  job's session, it is 1 of 5 here and 1 of 5 in that smoke.
- **ARIA (focused role=menu):** 80 of 80 confirmed through `focus`, in all four web families.
- **blocking (AppKit's menu run inside the action):** 20 of 20 `actionError` −25204 (cannotComplete) with the menu
  open, answered ok, seen on the first read. The control answered `actionFailed` ("did not accept") in 20 of 20. This
  verifies the Decision Log's #374 item 4.
- **Latency,** the `cua/menu` ms from the action's return to the sighting, p50/p95:
  - AppKit native 26–30 / 35–657; popup 12–13 / 16–20; blocking 4 / 4.
  - Chrome for Testing native 123–160 / 229–616; Electron 20–23 / 36–136; Firefox 188–260 / 296–408; Safari 99–123 /
    151–694.
  - ARIA 3–84 / 5–159.
  - `menuUnconfirmed` rows end at 1004–1073 ms, apart from the one 1.44 s row above.

## The negative controls (ruling 1ea561bc:752; the stated limit of ruling 1ea561bc:753)

Each control sends a Show Menu to a target that opens nothing, while another menu comes up in the same window 300 ms
into the wait.

| control | where it confirmed | held (not confirmed) | did not fire |
|---|---|---|---|
| a focused ARIA menu the page opens on a timer | 80 of 80 (all four web families, through `focus`) | 0 | 0 |
| a context menu popped up in the window's content view (AppKit) | 20 of 20 (through `ancestor`) | 0 | 0 |
| the text view's own context menu, a sibling of the target (AppKit) | 0 | 20 of 20 | 0 |
| the page's `<select>` opened on a timer (showPicker) | Firefox 20 of 20 (through `ancestor`) | 0 | Chrome for Testing, Electron, Safari: 60 (showPicker needs user activation) |
| the datalist's suggestions, raised by a typed letter | Firefox 1 (through `ancestor`) | Chrome for Testing 20, Firefox 6 | Electron and Safari 40, Firefox 12, plus one Firefox row the harness's key made `userIntervened` |

These are the measured instances of the stated limit: a success means a menu appeared, not which one. The rule does
exclude a sibling view's own menu, Chrome's datalist (an AXList in a layer-999 window), and, in 6 of 7 rows, Firefox's
datalist (an AXMenu inside an AXPopover). Once, Firefox put its suggestions under a host, and that row confirmed.

## The candidate's table

| family | cell | placement | n | verdict | classes | seen | actionError | reached | ok ms p50/p95 | unconfirmed ms p50/max |
|---|---|---|---|---|---|---|---|---|---|---|
| appkit | native | foreground | 10 | pass | confirmed 10 | element 10 | - | 0 | 29.9/657.2 | -/- |
| appkit | popup | foreground | 10 | pass | confirmed 10 | element 10 | - | 0 | 11.8/19.6 | -/- |
| appkit | ignored | foreground | 10 | pass | honestUnconfirmed 10 | - | - | 10 | -/- | 1020.5/1056.5 |
| appkit | blocking | foreground | 10 | pass | confirmed 10 | element 10 | -25204 10 | 10 | 3.7/3.9 | -/- |
| appkit | nc-host | foreground | 10 | fail | ncConfirmed 10 | ancestor 10 | - | 10 | 403/451.3 | -/- |
| appkit | nc-sibling | foreground | 10 | pass | ncHeld 10 | - | - | 10 | -/- | 1020/1062 |
| appkit | native | background | 10 | pass | confirmed 10 | element 10 | - | 0 | 25.5/34.4 | -/- |
| appkit | popup | background | 10 | pass | confirmed 10 | element 10 | - | 0 | 12.7/16.3 | -/- |
| appkit | ignored | background | 10 | pass | honestUnconfirmed 10 | - | - | 10 | -/- | 1015/1054.6 |
| appkit | blocking | background | 10 | pass | confirmed 10 | element 10 | -25204 10 | 10 | 3.6/3.9 | -/- |
| appkit | nc-host | background | 10 | fail | ncConfirmed 10 | ancestor 10 | - | 10 | 388.3/468.6 | -/- |
| appkit | nc-sibling | background | 10 | pass | ncHeld 10 | - | - | 10 | -/- | 1020/1048.1 |
| cft | native | foreground | 10 | pass | confirmed 10 | ancestor 10 | - | 10 | 159.8/615.9 | -/- |
| cft | aria | foreground | 10 | pass | confirmed 10 | focus 10 | - | 10 | 15.1/159.1 | -/- |
| cft | own | foreground | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1039.2/1062.4 |
| cft | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 374.6/436.6 | -/- |
| cft | nc-timer-select | foreground | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1031.8/1072.1 |
| cft | nc-datalist | foreground | 10 | pass | ncHeld 10 | - | - | 0 | -/- | 1020/1069.9 |
| cft | native | background | 10 | pass | confirmed 10 | ancestor 10 | - | 10 | 122.7/228.6 | -/- |
| cft | aria | background | 10 | pass | confirmed 10 | focus 10 | - | 10 | 20.6/112.3 | -/- |
| cft | own | background | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1027.2/1068.5 |
| cft | nc-timer-aria | background | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 328.4/382.2 | -/- |
| cft | nc-timer-select | background | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1015.8/1052.4 |
| cft | nc-datalist | background | 10 | pass | ncHeld 10 | - | - | 0 | -/- | 1020.4/1057.1 |
| electron | native | foreground | 10 | pass | confirmed 10 | ancestor 10 | - | 10 | 20/136.2 | -/- |
| electron | aria | foreground | 10 | pass | confirmed 10 | focus 10 | - | 10 | 3.3/36.5 | -/- |
| electron | own | foreground | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1011.5/1061.4 |
| electron | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 351.1/403.8 | -/- |
| electron | nc-timer-select | foreground | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1016.9/1053.3 |
| electron | nc-datalist | foreground | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1013.3/1044 |
| electron | native | background | 10 | pass | confirmed 10 | ancestor 10 | - | 10 | 22.5/35.9 | -/- |
| electron | aria | background | 10 | pass | confirmed 10 | focus 10 | - | 10 | 3.5/4.6 | -/- |
| electron | own | background | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1023/1064.9 |
| electron | nc-timer-aria | background | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 377/419.8 | -/- |
| electron | nc-timer-select | background | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1021.1/1052 |
| electron | nc-datalist | background | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1030.6/1048.9 |
| firefox | native | foreground | 10 | review | falseUnconfirmed 1, confirmed 9 | ancestor 9 | - | 10 | 259.5/408.1 | 1444.6/1444.6 |
| firefox | aria | foreground | 10 | pass | confirmed 10 | focus 10 | - | 10 | 13.7/30.5 | -/- |
| firefox | own | foreground | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1020.6/1073.3 |
| firefox | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 292/375.3 | -/- |
| firefox | nc-timer-select | foreground | 10 | fail | ncConfirmed 10 | ancestor 10 | - | 0 | 411.7/621.7 | -/- |
| firefox | nc-datalist | foreground | 10 | fail | error 1, ncNotFired 7, ncHeld 1, ncConfirmed 1 | ancestor 1 | - | 0 | 448.5/448.5 | 1021.2/1052 |
| firefox | native | background | 10 | pass | confirmed 10 | ancestor 10 | - | 10 | 188.4/295.9 | -/- |
| firefox | aria | background | 10 | pass | confirmed 10 | focus 10 | - | 10 | 83.8/106.6 | -/- |
| firefox | own | background | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1020.4/1067 |
| firefox | nc-timer-aria | background | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 306.1/356.6 | -/- |
| firefox | nc-timer-select | background | 10 | fail | ncConfirmed 10 | ancestor 10 | - | 0 | 383.7/439.7 | -/- |
| firefox | nc-datalist | background | 10 | review | ncHeld 5, ncNotFired 5 | - | - | 0 | -/- | 1042.2/1067.2 |
| safari | native | foreground | 10 | pass | confirmed 10 | ancestor 10 | - | 10 | 98.8/693.7 | -/- |
| safari | aria | foreground | 10 | pass | confirmed 10 | focus 10 | - | 10 | 4.1/5.6 | -/- |
| safari | own | foreground | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1015.5/1045.1 |
| safari | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 307.5/378.8 | -/- |
| safari | nc-timer-select | foreground | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1020/1033.3 |
| safari | nc-datalist | foreground | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1020/1042.8 |
| safari | native | background | 10 | pass | confirmed 10 | ancestor 10 | - | 10 | 123.3/151.3 | -/- |
| safari | aria | background | 10 | pass | confirmed 10 | focus 10 | - | 10 | 4.1/4.8 | -/- |
| safari | own | background | 10 | pass | ownUnconfirmed 10 | - | - | 10 | -/- | 1048.8/1065.6 |
| safari | nc-timer-aria | background | 10 | fail | ncConfirmed 10 | focus 10 | - | 0 | 324.4/401.7 | -/- |
| safari | nc-timer-select | background | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1020/1058 |
| safari | nc-datalist | background | 10 | review | ncNotFired 10 | - | - | 0 | -/- | 1024.2/1059.3 |

## The control's table (main, b99232de)

| family | cell | placement | n | verdict | classes |
|---|---|---|---|---|---|
| appkit | native | foreground | 10 | pass | confirmed 10 |
| appkit | popup | foreground | 10 | pass | confirmed 10 |
| appkit | ignored | foreground | 10 | fail | falseOk 10 |
| appkit | blocking | foreground | 10 | review | error 10 |
| appkit | nc-host | foreground | 10 | fail | ncConfirmed 10 |
| appkit | nc-sibling | foreground | 10 | fail | ncConfirmed 10 |
| appkit | native | background | 10 | pass | confirmed 10 |
| appkit | popup | background | 10 | pass | confirmed 10 |
| appkit | ignored | background | 10 | fail | falseOk 10 |
| appkit | blocking | background | 10 | review | error 10 |
| appkit | nc-host | background | 10 | fail | ncConfirmed 10 |
| appkit | nc-sibling | background | 10 | fail | ncConfirmed 10 |
| cft | native | foreground | 10 | pass | confirmed 10 |
| cft | aria | foreground | 10 | pass | confirmed 10 |
| cft | own | foreground | 10 | fail | falseOk 10 |
| cft | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 |
| cft | nc-timer-select | foreground | 10 | fail | ncConfirmed 10 |
| cft | nc-datalist | foreground | 10 | fail | ncConfirmed 10 |
| cft | native | background | 10 | pass | confirmed 10 |
| cft | aria | background | 10 | pass | confirmed 10 |
| cft | own | background | 10 | fail | falseOk 10 |
| cft | nc-timer-aria | background | 10 | fail | ncConfirmed 10 |
| cft | nc-timer-select | background | 10 | fail | ncConfirmed 10 |
| cft | nc-datalist | background | 10 | fail | ncConfirmed 10 |
| electron | native | foreground | 10 | pass | confirmed 10 |
| electron | aria | foreground | 10 | pass | confirmed 10 |
| electron | own | foreground | 10 | fail | falseOk 10 |
| electron | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 |
| electron | nc-timer-select | foreground | 10 | fail | ncConfirmed 10 |
| electron | nc-datalist | foreground | 10 | fail | ncConfirmed 10 |
| electron | native | background | 10 | pass | confirmed 10 |
| electron | aria | background | 10 | pass | confirmed 10 |
| electron | own | background | 10 | fail | falseOk 10 |
| electron | nc-timer-aria | background | 10 | fail | ncConfirmed 10 |
| electron | nc-timer-select | background | 10 | fail | ncConfirmed 10 |
| electron | nc-datalist | background | 10 | fail | ncConfirmed 10 |
| firefox | native | foreground | 10 | pass | confirmed 10 |
| firefox | aria | foreground | 10 | pass | confirmed 10 |
| firefox | own | foreground | 10 | fail | falseOk 10 |
| firefox | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 |
| firefox | nc-timer-select | foreground | 10 | fail | ncConfirmed 10 |
| firefox | nc-datalist | foreground | 10 | fail | ncConfirmed 10 |
| firefox | native | background | 10 | pass | confirmed 10 |
| firefox | aria | background | 10 | pass | confirmed 10 |
| firefox | own | background | 10 | fail | falseOk 10 |
| firefox | nc-timer-aria | background | 10 | fail | ncConfirmed 10 |
| firefox | nc-timer-select | background | 10 | fail | ncConfirmed 10 |
| firefox | nc-datalist | background | 10 | fail | ncConfirmed 10 |
| safari | native | foreground | 10 | pass | confirmed 10 |
| safari | aria | foreground | 10 | pass | confirmed 10 |
| safari | own | foreground | 10 | fail | falseOk 10 |
| safari | nc-timer-aria | foreground | 10 | fail | ncConfirmed 10 |
| safari | nc-timer-select | foreground | 10 | fail | ncConfirmed 10 |
| safari | nc-datalist | foreground | 10 | fail | ncConfirmed 10 |
| safari | native | background | 10 | pass | confirmed 10 |
| safari | aria | background | 10 | pass | confirmed 10 |
| safari | own | background | 10 | fail | falseOk 10 |
| safari | nc-timer-aria | background | 10 | fail | ncConfirmed 10 |
| safari | nc-timer-select | background | 10 | fail | ncConfirmed 10 |
| safari | nc-datalist | background | 10 | fail | ncConfirmed 10 |
