# V5's unmet premise (the design session's rulings 823 and 825), re-judged read-only

Task 100, branch `m5-v5-823` from `feat/171-m5` at dec76845, with fix waves 1 to 4. The pieces:
- the rule: `scripts/linux-engine-diff/premise.mjs`;
- the judge that applies it: `device.mjs` `judgeDevice`, which also records the evidence;
- the negative controls, made through the real paths: `test/linux-engine-diff/premise.test.mjs`, with
  `premise-fixture.mjs`.

## A short V5 (route D, the design session's ruling 841)

Nothing reruns V5 on its own. The judge alone decides, inside the run:
- It excludes a sample proven premise-unmet and counts it. Each cell reports its rate, cold and warm apart
  (`premise_unmet.timed.quotas`).
- A cell left short of its planned count, of its cold or warm quota or of its audit's, fails with `incomplete` in the
  run's own verdict.
- When that is all the cell fails for, its first reason says so: "incomplete only by N proven premise-unmet samples (a
  whole V5 rerun under §8.2, the controller's call)". When it also fails for something else, its first reason reads
  "incomplete by N proven premise-unmet samples, and failing for more than that (below)", and the other failures follow
  as before.
- Whether V5 is rerun whole for a shortage is the controller's call. A rerun is another V5 step, judged as any is.

Only evidence bound to the run's own sidecar excludes:
- each timed row to exactly one line, its ok, error and notice the line's reply, and its slot the plan's;
- each audited request to its line, with both of a planned audit's requests bound;
- an audit the run skipped (`--no-audit`, the runner's sentinel) with no audit lines.

A binding error never excludes, and fails its cell. Without a sidecar nothing is excluded, and the samples are judged as
before.

The automated refill of fix waves 1 to 3 (`scripts/linux-engine-gate/premise-refill.mjs`, routes B, B′ and C) was
deleted at fix wave 4.

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

- `rejudge-823.sh <base device.mjs>` runs `rejudge-device.mjs --diagnostic --old` over each stored V5 step. Its output is
  `rejudge-823.jsonl`. The re-judge reads a step's `premise-evidence.jsonl` where it has one; none of these do.
- The replay is never release evidence for ruling 823's cells (task 100's fix wave 8): V5's premise cells pass only in
  a live run, on both architectures. A replayed pass of one reads "replayed pass: diagnostic only; V5's premise cells
  pass only in a live run", and each step's `exit` says only whether the replay reproduced its stored verdicts.
- `agree-823.mjs` compares the base judge with this one on every device verdict, as each judged. Its output is
  `agree-823.out`.
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

V4's device cases (the GTK 4, xterm and Qt scenes) are judged by the same `judgeDevice` and `check`, on paths the
diff leaves inert. So the same comparison ran over V4's stored rows (`agree-823-V4.out`): x64's
`out/V4.pinned-release` and the arm64 pilot's `out-zero-r1/V4…` each had 19 device verdicts, with 0 differing.

No stored sample reads premise unmet, and no stored verdict moves. The shape the ruling answers is the arm64 pilot's
`chrome_dnd_shared` audit pass, and its stored rows cannot show (ii): its first audited request, a plain-drag ok, kept no
page record. So it is judged as before and still fails. Only V5's rerun after 0.4.1, with the evidence, can tell
whether Chrome never took that drag. If it reads unmet there, the cell reads incomplete, its cause named (route D).

## The live check (fix wave 2): the real page tree and sidecar, on a private display

`live-fix2/` is a development run, never counted: the harness's own CLI on this branch (82925197), driving V5's five
premise cells (`--scene device-chrome-dnd --blocks 1 --dev --run v5pl`, no ballast) with the pinned x64 engine. It ran
on a private display of its own (`display.mjs` `runOnPrivateDisplay`, which refuses `:0`), on the x64 VM, under the
host lock. The scripts are `live-probe.mjs` and `live-check.mjs`. The run ended valid, with every verdict passing and
a clean display watchdog (`session.jsonl`, `stdout.log`).

`live-check.mjs` reads the real records with this checkout's own judge (its output is `live-check.json`, regenerated at
fix wave 4 by the judge alone):

| cell | page reads | the scene's label in the tree | one `dnd` and one `moves` line | parsed (`parsePageRead`) | sidecar lines bound | audit binding problems | classes |
|---|---:|---:|---:|---:|---:|---|---|
| chrome_dnd_shared | 10 | 10 | 10 | 10 | 5 of 5 | none | 3 + 2 started |
| chrome_dnd_late_shared | 10 | 10 | 10 | 10 | 5 of 5 | none | 3 + 2 started |
| chrome_dnd_obscured_in_front_shared | 10 | 10 | 10 | 10 | 5 of 5 | none | 3 + 2 started |
| chrome_dnd_late_take_shared | 10 | 10 | 10 | 10 | 5 of 5 | none | 3 + 2 started |
| chrome_dnd_obscured_in_front_late_shared | 10 | 10 | 10 | 10 | 5 of 5 | none | 3 + 2 started |

- **The page tree.** In Chrome's real AT-SPI tree for V5's drag page, every read carried the scene's label
  (`cua171-diff-v5pl-3b6cfeff-drag-device_cua`, with the run's nonce). Each status line appeared once, as premise.mjs
  reads them: one distinct `dnd` line and one `moves` line, each in the page's exact form.
- **The sidecar.** All 25 lines bind (5 cells × 3 timed + 2 audited). Each timed row binds to its one line, its
  reply the row's own and its slot the plan's (`bindTimed`). Each audited request binds by the label, the XID, the
  ordinal, ok/error and its case's follow-ups (`bindAudit`). Each line is on the cell's one fixture, with the reply's
  notice field present.
- **What it does not show.** Chrome took every drag in this run, so the records show the shape of a started drag:
  pointercancel and dragend, no pointerup, and the page's `ups` count up by one. A genuine no-take is still unseen
  live. Its lines are the same page's, in the same form, with the other tokens explicit.
- **Every cell passes** under the judge, judged from the sidecar.
