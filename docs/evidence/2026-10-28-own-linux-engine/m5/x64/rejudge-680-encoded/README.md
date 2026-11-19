# Ruling 680 encoded in the live judge: x64's stored V5 rows re-judged (task 108, rulings 867 and 870)

The late-take cell's rule from ruling 680's script (`../scripts/rejudge-680/rejudge-late-take-window.mjs`) now lives in
`scripts/linux-engine-diff/device.mjs` `judgeDevice` (`spanLimitMisses`). Both x64 V5 runs' stored rows were re-judged
read-only with it, beside the base judge it replaces (`feat/171-m5` at e6026b56, H⁗'s judge; both judges given the
same rows, premise sidecar and recorded plan) and beside the script's output on the same rows. Ruling 870 (fix wave 1)
tightened the rule: the span-limited sample's page must count this press's own drag start and dragend, so its `dur`
(ms from that dragstart to that dragend) is this drag's, and its drop counter must be read rising; the case's recorded
drop needs the counter read rising too. Fix wave 2 bound the dragend to this press (no drag outstanding at the
baseline, its starts equal to its ends, and this press's own log carrying its dragstart and dragend) and the witness to
what it saw (a recorded drop is an observed change, never a `protocol` failure; the limit needs a span the witness
watched clean). Both stored span-limited samples carry those fields and meet them (H⁗ 2/0: starts/ends 96/96 → 97/97,
drops 65 → 66, its log's dragend at 220.7 ms; H 0/0: 23/23 → 24/24, drops 18 → 19, 189.9 ms). The outputs below are
the tightened judge's. `scan-stored.mjs` (output `scan-stored.txt`) is a diagnostic scan of every stored late-take cell
on this host, each bound as rejudge-device binds it.

    node compare.mjs <checkout> <base checkout> <step dir> <the 680 script's output>
    node controls.mjs <checkout> <step dir>

| step | rows | encoded vs the 680 script | moved against the base judge | output |
|---|---|---|---|---|
| V5 at H⁗ (task 105), `../h4/zero/V5.pinned-release` | 52 | 52 of 52 | `chrome_dnd_late_take_shared`: fail → pass (2/0 the span's limit: dragend 221 ms after its dragstart, answer 164.02 + 20) | `h4-V5.txt` |
| V5 at H, re-judged at H′ (T5), `../out-rerun1/V5.pinned-release` | 52 | 51 of 52; `chrome_dnd_shared` differs, see below | `chrome_dnd_late_take_shared`: fail → pass (0/0: dragend 190 ms after its dragstart, answer 162.14 + 20) | `t5-V5-rerun1.txt` |

On T5's rows the script ran H's judge, which predates ruling 756, so its table keeps `chrome_dnd_shared`'s stored fail.
That cell passes by 756 under H′'s judge (`../out-rerun1/V5-rejudge-756/`) and under the base judge alike, before this
change. Against T5's record (H′'s re-judge, with the late-take cell by 680) the encoded judge agrees on 52 of 52.

The base judge reproduces every stored verdict on H⁗'s rows, and all but `chrome_dnd_shared` (756) on T5's. A premise
cell's replayed pass reads "replayed pass: diagnostic only" (rejudge-device.mjs, wave 8). `controls.txt`: the
script's four case controls and ruling 870's two (stale end timing, an unread counter) on each step's real rows, each failing the cell under the encoded judge, the stored rows
passing it. The run-wide controls are tests (`test/linux-engine-diff/late-take-span-680.test.mjs`).
