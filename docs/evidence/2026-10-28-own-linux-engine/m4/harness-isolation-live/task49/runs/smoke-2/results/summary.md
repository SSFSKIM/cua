# linux-engine-diff summary

## t49-smoke (development run, not a release gate)

commit 297f8c20736f2ec1ef53c2ac55b58fa7719fe4c0; cua-engine 0.3.0 (7ad6f03d2966); occlusion covered; 1 blocks; 1 warm tree reads and 5 warm inputs per block

candidate: sha256 5b7e38cf299e3e7f105321612de68919fcdd27ee93b52b6a298fcb58a37cd9cf, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (7ad6f03d2966); attestation not checked (a development run); checkout not clean

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| chrome | tree | pinned | 413.7 | 452.4 | 20 | 2203 / 2203 | 2203 / 2203 | – | 40/40 | clean | – | 40/40 |  |
| chrome | tree | newest | 442.2 | 413.2 | 20 | 2203 / 2203 | 2203 / 2203 | – | 40/40 | clean | – | 39/40 |  |
| chrome | tree | cua | 63 | 56.9 | 20 | 2203 / 2202 | 26 / 21 | 0 | 40/40 | clean | – | 40/40 | PASS (cold faster [-460.695, -329.985]; warm faster [-413.865, -321.765]) |
| chrome | tree | **bar** | 413.7 | 413.2 | | | | | | | | | |

Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):
- chrome cua: within

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 120 samples, against the run's cap of 1% (1.2).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-03T08:47:41.871Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 172 requests, 17 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests)

