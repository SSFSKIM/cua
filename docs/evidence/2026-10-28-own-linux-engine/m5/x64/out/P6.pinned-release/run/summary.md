# linux-engine-diff summary

## pinned-P6 (experiment predicates; acceptance on the pinned release)

candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner

T19's adopted cases (predicates.mjs): Gecko's pointer kinds by the real pointer. Each run's effect is read whatever it answered, and a run counts only when its park held at the request and its effect was read (the rest are left out and listed). Each allowed case 30 such runs of cua as it ships, every one taking effect, but a drag and drop's honest misses, judged by one-sided Fisher against the pinned build's 30 or more at p ≥ 0.05 (P6's rule; an ok with no effect fails); each still-refused counterexample 10, every one the Device mode sentence with no effect; each leave case (the pointer moved out during the request) 20, none answered ok with no effect and no refusal taking effect; every run with the witness unchanged. Beside them the pinned build's counts and, on a refused case, cua's own events with the pointer unjudged (`cua:any-pointer`, `--ignore-pointer`).

| occlusion | pointer | kind | expected | cua | pinned took | cua:any-pointer took | why | verdict |
|---|---|---|---|---:|---:|---:|---|---|
| visible | in | dnd | allowed | took 30/30, 0 honest misses, one-sided Fisher p = 1.0000 against the pinned build | 30/30 | – | the real pointer in the window (unless_pointer_within), whatever covers the rest of it | PASS |
| visible | out | dnd | refused | refused 10/10, 0 took | 0/10 | 0/10 | the real pointer outside the window | PASS |
| partial | in | dnd | allowed | took 30/30, 0 honest misses, one-sided Fisher p = 1.0000 against the pinned build | 30/30 | – | the real pointer in the window (unless_pointer_within), whatever covers the rest of it | PASS |
| partial | under | dnd | refused | refused 10/10, 0 took | 0/10 | 0/10 | the real pointer under a window over it: outside it, by the server | PASS |
| partial | out | dnd | refused | refused 10/10, 0 took | 0/10 | 0/10 | the real pointer outside the window | PASS |
| covered | under | dnd | refused | refused 10/10, 0 took | 0/10 | 0/10 | the real pointer under a window over it: outside it, by the server | PASS |
| covered | out | dnd | refused | refused 10/10, 0 took | 0/10 | 0/10 | the real pointer outside the window | PASS |
| visible | leave | dnd | honest | ok and took 0, left 20 (19 took), refused 0 (0 took), ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |

Every case holds.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 27862 requests, 1911 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

