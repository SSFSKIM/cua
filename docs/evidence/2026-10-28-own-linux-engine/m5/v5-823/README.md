# V5's unmet premise (the design session's rulings 823 and 825), re-judged read-only

Task 100, branch `m5-v5-823` from `feat/171-m5` at dec76845, with fix wave 1. The pieces:
- the rule: `scripts/linux-engine-diff/premise.mjs`;
- the judge that applies it: `device.mjs` `judgeDevice`, which also records the evidence;
- the refill, by more runs of the unchanged runner: `scripts/linux-engine-gate/premise-refill.mjs`;
- the negative controls, made through the real paths: `test/linux-engine-diff/premise.test.mjs` and
  `premise-refill.test.mjs`, with `premise-fixture.mjs`.

## The evidence for (ii)

Only the drag page's own status lines can show that Chrome never started a drag session. Each premise sample keeps
them as the page wrote them, before and after the sample, and parses them strictly:
- the press is the sample's own: the source's press count is up by one, the pointer log is numbered with it, and its
  time falls inside the sample's attempt;
- its log carries an explicit pointerup time and an explicit `-1` for dragstart, pointercancel and dragend;
- no drag start, end or drop is counted;
- each line is the one distinct line of its kind, in a tree that carries the scene's own page title.

Chrome's renderer fires dragstart before its browser process starts the X session (it takes `XdndSelection` and grabs
the pointer). Once a drag starts, the press ends in pointercancel and dragend, never a pointerup. So the proof rests on
the order of events, not on timing.

Anything missing, truncated, doubled or foreign proves nothing, and the sample is judged as before. So is a sample the
engine's own records contradict: its drag and press records, or its after-release watch's record of a late take. A
reply or notice that claims or implies a drop, where the page proves no session, fails its cell.

The engine's records can't serve as (ii). `no_start` means only "no take by the release", and a late take is recorded
only on the next request. The audit pass runs the engine without `--stats`, and run.mjs keeps none of its samples'
rows. So each sample's evidence also goes into the run's own `premise-evidence.jsonl`. Each line is bound to its sample:
- its run, scene, case, block and request number;
- its engine lifecycle and request id;
- its window and page;
- the run's head, engine sha256 and load.

## The re-judge

- `rejudge-823.sh <base device.mjs>` runs `rejudge-device.mjs --old` over each stored V5 step. Its output is
  `rejudge-823.jsonl`. The re-judge reads a step's `premise-evidence.jsonl` where it has one; none of these do.
- `agree-823.mjs` compares the base judge with this one on every device verdict. Its output is `agree-823.out`.
- The base judge is `git show dec76845:scripts/linux-engine-diff/device.mjs`, placed beside `device.mjs` and removed
  after.

| step | device verdicts | moved by 823 | unmet premise |
|---|---:|---:|---|
| x64 `out/V5.pinned-release` (first attempt, stopped by wrap71) | 0 | 0 | none |
| x64 `out-rerun1/V5.pinned-release` (the rerun, re-judged at H′) | 52 | 0 | none |
| arm64 pilot `out-zero-r1/V5…` (stopped by wrap71) | 0 | 0 | none |
| arm64 pilot `out-zero-z1/V5…` (the third sitting) | 52 | 0 | none |

The five cells below show how each sample reads under the rule. The classes are:
- `started`: the engine's records, or the page's counts, show Chrome took the drag;
- `not-plain-ok`: a refusal with no take record of its own;
- `unshown`: a plain-drag ok whose stored entry keeps no page record.

| step | cell | verdict | timed samples | audited requests |
|---|---|---|---|---|
| x64 rerun | chrome_dnd_shared | pass, as at H′ (756) | 8 started, 1 not-plain-ok (0/1, the late notice's refused request) | 2 not-plain-ok |
| x64 rerun | chrome_dnd_obscured_in_front_shared | pass | 9 started | 2 not-plain-ok |
| x64 rerun | chrome_dnd_late_shared | pass | 9 started | 2 not-plain-ok |
| x64 rerun | chrome_dnd_obscured_in_front_late_shared | pass | 9 started | 2 not-plain-ok |
| x64 rerun | chrome_dnd_late_take_shared | fail, 680's witness span | 9 started | 2 unshown |
| arm64 z1 | chrome_dnd_shared | **fail, unchanged** | 3 started | 1 unshown (audit/0), 1 not-plain-ok |
| arm64 z1 | chrome_dnd_obscured_in_front_shared | pass | 3 started | 2 not-plain-ok |
| arm64 z1 | chrome_dnd_late_shared | pass | 3 started | 2 not-plain-ok |
| arm64 z1 | chrome_dnd_obscured_in_front_late_shared | pass | 3 started | 2 not-plain-ok |
| arm64 z1 | chrome_dnd_late_take_shared | fail, 680's witness span | 3 started | 2 unshown |

No stored sample reads premise unmet, and no stored verdict moves. The shape the ruling answers is the arm64 pilot's
`chrome_dnd_shared` audit pass, and its stored rows cannot show (ii): its first audited request, a plain-drag ok, kept no
page record. So it is judged as before and still fails. Only V5's rerun after 0.4.1, with the evidence, can tell
whether Chrome never took that drag. If it reads unmet there, `premise-refill.mjs` refills it.
