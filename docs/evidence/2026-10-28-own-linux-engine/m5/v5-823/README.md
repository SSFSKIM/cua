# V5's unmet premise (the design session's ruling 823), re-judged read-only

Task 100, branch `m5-v5-823` from `feat/171-m5` at dec76845. The rule is in `scripts/linux-engine-diff/premise.mjs`,
applied by `device.mjs` `judgeDevice` and refilled by `run.mjs`. Its negative controls are in
`test/linux-engine-diff/premise.test.mjs`.

## The evidence for (ii)

A sample shows that Chrome never started a drag session only through the drag page's own record of the sample's press
(`drop_status`, pages/drag.html). The press must be the sample's own, with the source's press count up by one and the
pointer log numbered with it. It must have ended in a pointerup, with no dragstart, pointercancel or dragend in its log,
and the page's drag-start, drag-end and drop counts must be unmoved when read 400 ms after the answer.

Chrome's renderer fires dragstart before its browser process starts the X session (takes `XdndSelection`, grabs the
pointer). Once a drag starts, the press ends in pointercancel and dragend, never a pointerup. So this rests on the order
of events, not on timing. A missing or unread record never shows it.

Any contrary record keeps the sample judged as before:
- the engine's take (`dnd.started`, an outcome other than `no_start`, `press.taken`);
- a pending notice or late-take record, on the sample or on the next request on its engine;
- a drop, or a changed desktop.

The engine's own records could not serve as (ii). `dnd.outcome` `no_start` means only "no take by the release", and a
late take is recorded only on the next request (ruling 756). The audit pass runs the engine without `--stats`, so its
rows kept no take record at all. Until now its rows also kept no page record. That is the recording added here: each
audited request of the five cells now keeps the page's record, the reply's notice and the case's reads.

## The re-judge

`rejudge-823.sh <base device.mjs>` runs `rejudge-device.mjs --old` over each stored V5 step, and its output is
`rejudge-823.jsonl`. `agree-823.mjs` compares the base judge with this one on every device verdict, and its output is
`agree-823.out`. The base judge is `git show dec76845:scripts/linux-engine-diff/device.mjs`, placed beside
`device.mjs` and removed after.

| step | device verdicts | moved by 823 | unmet premise |
|---|---:|---:|---|
| x64 `out/V5.pinned-release` (first attempt, stopped by wrap71) | 0 | 0 | none |
| x64 `out-rerun1/V5.pinned-release` (the rerun, re-judged at H′) | 52 | 0 | none |
| arm64 pilot `out-zero-r1/V5…` (stopped by wrap71) | 0 | 0 | none |
| arm64 pilot `out-zero-z1/V5…` (the third sitting) | 52 | 0 | none |

The five cells, by how each sample reads under the rule. Of the timed samples, `started` means a record shows Chrome
started a session, and `not-plain-ok` means a refusal or another answer. Of the audited requests, `unshown` means a
plain-drag ok whose stored entry keeps no page record.

| step | cell | verdict | timed samples | audited requests |
|---|---|---|---|---|
| x64 rerun | chrome_dnd_shared | pass, as at H′ (756) | 1 started (0/0's late take), 8 not-plain-ok | 2 not-plain-ok |
| x64 rerun | chrome_dnd_obscured_in_front_shared | pass | 9 not-plain-ok | 2 not-plain-ok |
| x64 rerun | chrome_dnd_late_shared | pass | 9 not-plain-ok | 2 not-plain-ok |
| x64 rerun | chrome_dnd_obscured_in_front_late_shared | pass | 9 not-plain-ok | 2 not-plain-ok |
| x64 rerun | chrome_dnd_late_take_shared | fail, 680's witness span | 9 started | 2 unshown |
| arm64 z1 | chrome_dnd_shared | **fail, unchanged** | 3 not-plain-ok | 1 unshown (audit/0), 1 not-plain-ok |
| arm64 z1 | chrome_dnd_obscured_in_front_shared | pass | 3 not-plain-ok | 2 not-plain-ok |
| arm64 z1 | chrome_dnd_late_shared | pass | 3 not-plain-ok | 2 not-plain-ok |
| arm64 z1 | chrome_dnd_obscured_in_front_late_shared | pass | 3 not-plain-ok | 2 not-plain-ok |
| arm64 z1 | chrome_dnd_late_take_shared | fail, 680's witness span | 3 started | 2 unshown |

No stored sample reads premise unmet. The arm64 pilot's `chrome_dnd_shared` audit pass, the shape the ruling answers,
cannot show (ii) from its stored rows: its first audited request, a plain-drag ok, kept no page record. So it is judged
as before and still fails. Only V5's rerun after 0.4.1, with the recording, can tell whether Chrome never took that
drag. The late-take cells' audited oks read `unshown` too. They pass that cell's audit as before: its audit expects
success.
