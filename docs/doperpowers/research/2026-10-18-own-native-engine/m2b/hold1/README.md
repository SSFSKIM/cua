# M2b hold 1 (2026-10-21, 20:27:30–20:37:28Z, the mini)

Engine b74949b3, approved 20:28:58Z. The spec's Decision Log entry "M2b hold 1" is the account; this file says what each directory is.

- `phase0.txt`: the baseline readings. Phase 4 matched them; the coordinator verified this by ssh at 20:37:55Z.
- `live/paste` (95a39eeb): paste PASS. The HID row's guard refused all three variants against stale bounds, so nothing was posted.
- `live/paste-hid` (bd53bd08): paste PASS. The HID row was refused on window identity, nothing was posted, and the refusal recorded nothing it had read.
- `live/paste-hid2`, `live/paste-hid3` (3e39d818): the HID row's readings. unicode reads rk, keyCodesOnly reads rk, ansiKeys reads 가. Each variant's probe JSON is at `check.steps.hidComposition.variants.<variant>.keys.output`.
- `live/route4` (95a39eeb), `live/minimized-select`, `live/enablement`, `live/menu` (3e39d818): the residue cells.
- `live/hscroll`, `live/hscroll-2` (3e39d818): **no horizontal reading in these means anything.** Both lanes measured a page that could not scroll horizontally: the bar was disabled, and the written 0.5 read back without the content moving. The vendor's vertical move (0.5 → 0) stands as the declared single-axis vendor defect. The adjudication is item 8 of the Decision Log entry: cua's `scroll` left/right were inverted (fixed in a5714898), and the scene and the lanes are fixed in 71393af8 and e43d32fd.
