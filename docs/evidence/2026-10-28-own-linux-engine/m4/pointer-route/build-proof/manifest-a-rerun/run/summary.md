# linux-engine-diff summary

## t71-proof3-manifest-a (experiment predicates)

T19's adopted cases (predicates.mjs): Gecko's pointer kinds by the real pointer. Each allowed case 30 runs of cua as it ships, every one taking effect with the witness unchanged; each still-refused counterexample 10, every one the Device mode sentence with the witness unchanged; each leave case (the pointer moved out during the request) 20, none answered ok with no effect. Beside them the pinned build's counts and, on a refused case, cua's own events with the pointer unjudged (`cua:any-pointer`, `--ignore-pointer`).

| occlusion | pointer | kind | expected | cua | pinned took | cua:any-pointer took | why | verdict |
|---|---|---|---|---:|---:|---:|---|---|
| visible | in | click | allowed | took 30/30 | 30/30 | – | the real pointer in the window (unless_pointer_within), whatever covers the rest of it | PASS |
| visible | in | scroll | allowed | took 30/30 | 30/30 | – | the real pointer in the window (unless_pointer_within), whatever covers the rest of it | PASS |
| visible | out | click | refused | refused 10/10 | 0/10 | 0/10 | the real pointer outside the window | PASS |
| visible | out | scroll | refused | refused 10/10 | 0/10 | 0/10 | the real pointer outside the window | PASS |
| partial | in | click | allowed | took 30/30 | 30/30 | – | the real pointer in the window (unless_pointer_within), whatever covers the rest of it | PASS |
| partial | in | scroll | allowed | took 30/30 | 30/30 | – | the real pointer in the window (unless_pointer_within), whatever covers the rest of it | PASS |
| partial | under | click | refused | refused 10/10 | 0/10 | 0/10 | the real pointer under a window over it: outside it, by the server | PASS |
| partial | under | scroll | refused | refused 10/10 | 0/10 | 0/10 | the real pointer under a window over it: outside it, by the server | PASS |
| partial | out | click | refused | refused 10/10 | 0/10 | 0/10 | the real pointer outside the window | PASS |
| partial | out | scroll | refused | refused 10/10 | 0/10 | 0/10 | the real pointer outside the window | PASS |
| covered | under | click | refused | refused 10/10 | 0/10 | 0/10 | the real pointer under a window over it: outside it, by the server | PASS |
| covered | under | scroll | refused | refused 10/10 | 0/10 | 0/10 | the real pointer under a window over it: outside it, by the server | PASS |
| covered | out | click | refused | refused 10/10 | 0/10 | 0/10 | the real pointer outside the window | PASS |
| covered | out | scroll | refused | refused 10/10 | 0/10 | 0/10 | the real pointer outside the window | PASS |
| visible | leave | click | honest | took 0, left 20, refused 0, ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |
| visible | leave | scroll | honest | took 0, left 20, refused 0, ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |

Every case holds.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 55085 requests, 3774 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

