# H7: `t14-late` per architecture, with the freeze/identification race closed (#171 M5, task 125)

**A development run, not a release gate.** These are the rulings 954, 955 and 956 for C1 and L4c's plan. Everything ran
on the x64 VM, on private displays, against the pinned linux-engine 0.4.2 in a run-owned home (task 121's,
`cua-engine 0.4.2 (9371d2348cf8)`). Each run was held under the host lock as `m5-h7` (`logs/host-lock-m5-h7.txt`). No
engine change.

## The race and its fix

**At H6, a freeze cell stopped the run's browser 60 ms after the drag's send.** The engine identifies a Chromium
source before it presses. In `pointer.rs`, the hold's `browser_source(source)` is read when the hold is built, before
the press goes out. That identification asks the browser's own process over AT-SPI, bounded at 50 ms (ruling 912). A
stop that landed while it ran failed it closed: the source was unidentified, and the fixed 450 hold applied. arm64 at
twice the load hit this on 4 of L4c's 40 drags.

**At H7 the stop waits for the browser's own mark of the press.** That mark is `_NET_WM_USER_TIME` on its window:
Chromium's X11 window sets it on each button press it reads, and the harness watches it with `xprop -spy`. The mark
follows the identification by construction. The stop begins at the later of two points:
- 60 ms after the send (the cells' design);
- 55 ms after the mark (`FREEZE_PRESS_LEAD`). That is the press-to-stop gap the cells had at idle on x64, in which the
  browser reads the path's steps past Blink's drag threshold and hands them to the renderer.

**The thaw stays where each cell puts it, `to` ms after the send.** The thaw is now set from the send itself, rather than
from the stop plus the span. A stop delayed by a late press is shorter by the delay; at idle on x64 nothing moved (see
the dev run).

**A stop is skipped, and its row says why (rulings 955 and 956), when either holds:**
- no mark is seen by the thaw, or one is seen only after it;
- the computed start falls at or past the thaw.

It is never shortened to nothing, and never started from the 60 ms alone. The spy's first line, which shows the
property's value at spy start, is never taken as a press.

**The judge counts such a row as unexercised for its band.** It does the same for any row whose source ended
unidentified. An unexercised row is counted and shown in the verdict (a column in the band table, and a finding),
never counted as its band's outcome. That is the judge's only change, and it can only fail closed. The red runs are in
`logs/red-judge-unexercised.txt`.

**The press mark was probed on both Chromes** (`probe/usertime-156-158.txt`). On Chrome 156.0.8078.73 and 158.0.8127.36,
an XTEST click and a synthetic (SendEvent) click each changed `_NET_WM_USER_TIME`, and the spy saw each change. Neither
Chrome sets `_NET_WM_USER_TIME_WINDOW`.

**C1 and L4c use each VM's installed `google-chrome`:** 156.0.8078.73 on x64. Only K2 runs 158.

## The inside freeze: 600 on both architectures (rulings 954 and 957's companion decision)

- **Ruling 954 planned a per-architecture inside freeze**, since arm64 at twice the load landed only 6 of 10 at 600 at
  H6.
- **Task 122's sweep on 348cae0f, with the race fixed, landed 10 of 10 at every freeze.** It ran on arm64 at twice the
  load, Chrome 156, plan `freeze-042-inside`: freeze-500, -550 and -600, each a take inside the hold, then a landing.
  - 0 notices, 0 unidentified, 0 skipped.
  - Every stop came 54–58 ms after the press mark; the marks came 15–148 ms after the send.
  - Rows are on the VM, in `~/.local/share/cua-171/m5/s954-arm64-h7/`.
- **H6's arm64 misses at 600 were the race's, not the thaw's.** So, by the controller's decision, both architectures
  keep 600 and the per-architecture mechanism is removed. `freeze-042-inside` and its 500 and 550 cells stay, as the
  sweep's record.

## The byte comparison against H6 (`comparison/`)

**What the comparison covers.** `scripts/linux-engine-gate/launch-plan.mjs` prints, for every step and on a given
architecture (`--arch`):
- what `gate.mjs run` would launch: the print line, script, arguments, directory and environment;
- for each drop-signals step, its plan's contents: every cell, its count, and its freeze with its start rule.

It ran on H6 (69bd7993) and on H7, for both x64 and arm64, from one fixed path under `env -i`.

**Result: on both architectures, C1 and L4c differ, and nothing else does** (53 steps; `steps-differ.txt`).
- The only difference is in the plan contents: each freeze cell's schedule gains `"afterPress":55`.
- The launches are identical. C1 and L4c still run `--plan t14-late`.

## The x64 development run (`dev-run/`, `dev-run/race.md`)

`gate.mjs run C1 --pinned <home> --dev`, at idle, at 348cae0f: **PASS**.

| cell | n | identified | press marked (ms after send) | stop began | thawed | stop before mark + 55 | skipped | landed | late takes | notice, no drop |
|---|---:|---:|---|---|---|---:|---:|---:|---:|---:|
| freeze-600 | 10 | 10 | 4–16 (median 5) | 59–71 | 600–604 | 0 | 0 | 10 | 0 | 0 |
| freeze-646 | 5 | 5 | 5–16 | 60–72 | 647–650 | 0 | 0 | 5 | 0 | 0 |
| freeze-648 | 5 | 5 | 4–8 | 60–64 | 649–652 | 0 | 0 | 4 | 1 | 0 |
| freeze-650 | 5 | 5 | 4–9 | 59–64 | 652–654 | 0 | 0 | 1 | 3 | 1 |
| freeze-652 | 5 | 5 | 5–11 | 60–66 | 653–656 | 0 | 0 | 1 | 2 | 2 |
| freeze-700 | 10 | 10 | 5–8 | 59–63 | 700–701 | 0 | 0 | 0 | 0 | 10 |

- **No identified cell froze during identification.** All 40 sources were identified. Every stop began after the
  browser's press mark plus 55 ms, and none was skipped. The 59 ms minima are the 1 ms tick of the wall clock.
- **Every band showed its outcome:**
  - inside: 10 of 10 landed after a take inside the hold;
  - past: 10 of 10 gave the hold notice, with no drop and nothing sent after it;
  - 0 unexercised, 0 false oks, 0 unjudged.
- **The edge band made 6 late takes, all 6 reported.**
