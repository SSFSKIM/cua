# linux-engine-diff summary

## m4-dev-P4-pilot (experiment predicates; development run, not a release gate)

T19's adopted cases (predicates.mjs): Gecko's pointer kinds by the real pointer. Each run's effect is read whatever it answered, and a run counts only when its park held at the request and its effect was read (the rest are left out and listed). Each allowed case 30 such runs of cua as it ships, every one taking effect, but a drag and drop's honest misses, judged by one-sided Fisher against the pinned build's 30 or more at p ≥ 0.05 (P6's rule; an ok with no effect fails); each still-refused counterexample 10, every one the Device mode sentence with no effect; each leave case (the pointer moved out during the request) 20, none answered ok with no effect and no refusal taking effect; every run with the witness unchanged. Beside them the pinned build's counts and, on a refused case, cua's own events with the pointer unjudged (`cua:any-pointer`, `--ignore-pointer`).

| occlusion | pointer | kind | expected | cua | pinned took | cua:any-pointer took | why | verdict |
|---|---|---|---|---:|---:|---:|---|---|
| visible | leave | select | honest | ok and took 0, left 20 (0 took), refused 0 (0 took), ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |

Every case holds.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 4500 requests, 391 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

