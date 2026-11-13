# linux-engine-diff summary

## m4-gate-P5 (experiment predicates; release gate)

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

T19's adopted cases (predicates.mjs): Gecko's pointer kinds by the real pointer. Each run's effect is read whatever it answered, and a run counts only when its park held at the request and its effect was read (the rest are left out and listed). Each allowed case 30 such runs of cua as it ships, every one taking effect; each still-refused counterexample 10, every one the Device mode sentence with no effect; each leave case (the pointer moved out during the request) 20, none answered ok with no effect and no refusal taking effect; every run with the witness unchanged. Beside them the pinned build's counts and, on a refused case, cua's own events with the pointer unjudged (`cua:any-pointer`, `--ignore-pointer`).

| occlusion | pointer | kind | expected | cua | pinned took | cua:any-pointer took | why | verdict |
|---|---|---|---|---:|---:|---:|---|---|
| visible | leave | click | honest | ok and took 0, left 20 (19 took), refused 0 (0 took), ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |
| visible | leave | scroll | honest | ok and took 0, left 20 (20 took), refused 0 (0 took), ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |
| visible | leave | move | honest | ok and took 6, left 5 (3 took), refused 9 (0 took), ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |
| visible | leave | select | honest | ok and took 0, left 20 (0 took), refused 0 (0 took), ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |
| visible | leave | dnd | honest | ok and took 0, left 20 (19 took), refused 0 (0 took), ok with no effect 0 (of 20) | 0/20 | – | the real pointer in the window at the request, moved out while it runs | PASS |

Every case holds.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 21577 requests, 1855 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

