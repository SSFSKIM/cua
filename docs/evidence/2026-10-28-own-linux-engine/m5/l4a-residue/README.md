# L4a's residue (ruling 827, 3b; task 102)

The rule, in `scripts/linux-engine-diff/drop-signals-judge.mjs` (`RESIDUE`, `residueBound`, `electronDropVerdict`):

- In the plain cell at twice the load (rows at load `load2`), each lane's plain cell may hold at most floor(2 × n / 100)
  honest unconfirmed non-landings in its n drops. For L4a's 100 drops that is 2, and a third fails. A short series rounds
  down and never up: 99 drops allow 1, 49 and a pilot's 2 allow none.
- **Honest** means the drag answered the unconfirmed notice, the next acting request was refused with it, and the page
  shows no drop: neither the zone nor this trial's own dragend.
- **Not residue:** an ok with nothing pending and no landing is a false ok and fails (ruling 650). So does a notice
  the refusal did not keep, another cause, an error, or a drop elsewhere on the page. Each of these still fails as a
  missing landing.
- **Where it applies:** no other load and no other cell. H1 (idle) and H2 (the gate's window load) are judged as before.
- **Reporting:** every covered cell's count and bound are printed in the verdict's findings, apart from the passes, as
  #364's are. A cell over its bound fails with its count and bound. The counts carry `residue`, one entry per covered
  cell.

## The re-judge (§8.1, point 4), read-only

`rejudge-l4a-residue.sh` runs `rejudge-l4a-residue.mjs`. That script judges each stored sitting twice from its own rows:
once by H's judge (fefe306c's `drop-signals-judge.mjs`, unchanged through H‴ = f6275fb6 and bca7f19e) and once by this
checkout's. Task 98's prototype rows are read from its branch (85886a76). The output is `rejudge-l4a-residue.txt`.

| sitting | H's judge | with the residue | residue (cua:handle plain / cua plain) |
|---|---|---|---|
| x64 T5's counted L4a (pinned 0.4.0, at H) | pass | pass, unchanged | 0 of 100, bound 2 / 0 of 100, bound 2 |
| x64 pilot's L4a (task 87, pilot 2) | pass | pass, unchanged | 0 of 2, bound 0 / 0 of 2, bound 0 |
| arm64 pilot's L4a (task 96, pilot 2, 0.4.0) | FAIL | FAIL, unchanged: the cua:handle left false ok | 0 of 2, bound 0 / 0 of 2, bound 0 |
| arm64 pilot's L4a rate run (task 96, pilot 100, 0.4.0; task 98's 0.4.0 column) | FAIL | FAIL, unchanged: the cua:handle left false ok (#20) stands; the missed landing (#20) becomes residue | 1 of 100, bound 2 / 0 of 100, bound 2 |
| task 98's L4a on the prototype (arm64, b74961ca, pilot 100) | FAIL | **pass: the verdict moves**. Its one fail, the missed landing (#0), becomes residue | 1 of 100, bound 2 / 0 of 100, bound 2 |
| H1 and H2: x64 T5 (counted), x64 pilot, arm64 pilot, arm64 H1 rate run, task 98's prototype H1 | pass | pass, unchanged | not covered |

The negative controls use the prototype's L4a rows. Each edits the stored rows one way, and all 7 edits fail:

- one more honest non-landing than the bound;
- the residue row answered ok, with no notice;
- its notice not kept by the refusal;
- its own dragend a drop elsewhere;
- the same rows at idle;
- the same rows at the gate's window load;
- a false ok added to the same series.

## The reach under §8.1

The judge `electronDropVerdict` is shared by H1, H2 and L4a, the gate's three T17 Electron steps (`t17-fix3`). The
residue can move only L4a's verdict, because only L4a's rows are at `load2`. No stored H1 or H2 verdict moved. C1, L4b
and L4c use `chromeDropVerdict`, which is unchanged.
