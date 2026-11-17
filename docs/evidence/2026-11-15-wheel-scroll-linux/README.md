# The wheel scroll on Linux VM Chrome (#141, #168), 2026-11-15

#141's Linux proof is this probe, not a full repl-parity Linux run. It runs cua's browser service on this VM's Chrome
(dc-linux171-1e68, x86-64), through `cua serve` over MCP, with the corpus's own scroll cells run verbatim:
`input/coordinates`' and `input/dom`'s `scroll` cells, on the fixture's input page. The old gesture route and the
wheel route ran side by side on the same Chrome.

- **Isolation** (`run.sh`): a scratch HOME under `/tmp`, short enough for the host socket. It holds its own cua home
  (`cua install`, `cua chrome register`), an empty `~/.config/claude-secrets`, and its own Chrome user-data dir. Chrome
  for Testing 157.0.8103.78 runs with cua's extension unpacked; branded Chrome 156 no longer takes `--load-extension`.
  It runs on a private Xvfb display (`:168`). Profile `harness` is added and bound there. The VM's own Chrome and its
  `me` profile were not touched. The script stopped only what it started (its Xvfb, its Chrome, its burners), all under
  the host lock.
- **Routes:** `old` is the tree at d988641e, which scrolls with `Input.synthesizeScrollGesture`. `new` is the tree at
  d5960d35 (first table) and at 5711371c (the rerun), which scrolls with a mouse wheel and reads the effect back (`src/browser-service/wheel-scroll.mjs`).
- **Conditions** (`probe.mjs`), each preceded by a scroll back to the top:
  - `coordinates-front` and `dom-front`: the agent's tab in front of its window.
  - `coordinates-behind`: the window's first tab (about:blank) in front, the agent's tab behind it. That is where cua's
    agent tab opens, so this is #141's case.
  - `coordinates-front-unfocused`: the agent's tab in front, with the X focus moved to the root window.
  - The front tab is set with the keyboard (xdotool, on the probe's own display) and read back from the window title
    in each row. Under the service's focus emulation the page's `visibilityState` reads `visible` either way
    (`explore.mjs` showed it).
- **Loads:** idle, and cpu2 (16 `yes` burners on 8 cores).

| route | load | front | dom front | behind | front, unfocused |
|---|---|---|---|---|---|
| old (gesture) | idle | 10/10, median 116 ms | 10/10, 122 ms | **0/10**, `Timed out after 10000ms waiting for CDP command Input.synthesizeScrollGesture.` | **0/10**, `Debugger unattached` (the trial before it timed out, and the host detached the tab) |
| old (gesture) | cpu2 | 10/10, 154 ms | 10/10, 152 ms | **0/10**, the same 10 s timeout | **0/10**, the same detach |
| new (wheel) | idle | 10/10, 83 ms | 10/10, 87 ms | 10/10, 86 ms | 10/10, 84 ms |
| new (wheel) | cpu2 | 10/10, 107 ms | 10/10, 118 ms | 10/10, 96 ms | 10/10, 112 ms |

**Rerun on the review fix wave (5711371c)**, the code that merges, with the same harness and the gesture beside it (`trials-5711371c.jsonl`, `run-5711371c.log`):

| route | load | front | dom front | behind | front, unfocused |
|---|---|---|---|---|---|
| old (gesture) | idle | 10/10, 119 ms | 10/10, 122 ms | **0/10**, the 10 s timeout | **0/10**, `Debugger unattached` |
| old (gesture) | cpu2 | 10/10, 141 ms | 10/10, 154 ms | **0/10**, the 10 s timeout | **0/10**, `Debugger unattached` |
| new (wheel, 5711371c) | idle | 10/10, 80 ms | 10/10, 87 ms | 10/10, 82 ms | 10/10, 87 ms |
| new (wheel, 5711371c) | cpu2 | 10/10, 125 ms | 10/10, 137 ms | 10/10, 109 ms | 10/10, 114 ms |

**Rerun on the second fix wave (98c77619)**, where the probe starts from Chrome's own hit test (`trials-98c77619.jsonl`): the wheel moved **80/80** (median 84–141 ms; front, behind, unfocused and dom, idle and cpu2). The gesture again failed 0/10 behind another tab, and 0/10 on the detach cascade.

The fix waves' own tests, in a real headless Chrome, are in `review-fix/`. The second wave's are `red-at-daa74a58.txt` (the overlap and closed-shadow tests fail) and `covering-suites-wave2.txt` (471/473, 2 skipped).: `red-at-bcf80db7.txt` (the five finding tests fail, the four others pass), `green-real-chrome.txt` (9/9), and `covering-suites.txt`.

"10/10" means the cell answered `{before: 0, moved: true}`. The times are each cell's own duration (median). Every row
is in `trials.jsonl`.

Reading: the gesture stalls whenever the agent's tab is behind another tab, idle or loaded. That stall is #141. When
the gesture times out, the host detaches the tab, and the next action in it fails. The wheel moved the page in every
condition, in about 0.1 s.
