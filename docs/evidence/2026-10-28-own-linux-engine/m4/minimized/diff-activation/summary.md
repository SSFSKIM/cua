# linux-engine-diff summary

## t4-minimized-activation (development run, not a release gate)

commit 2f79b7607d4ddd4177011e035c47d33a6578ba55; cua-engine 0.3.0 (81a1ba773b0a); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 02787b64a1dac1056e127544a5fe8b0fb63bffda809d8291a6f151f58f124c42, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (81a1ba773b0a); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 124 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| minimized | minimized_activate | cua | 8.7 | 9.8 | 6 | – | – | – | 0/9 | clean | – | – | PASS |
| minimized | minimized_activate_withdrawn | cua | 1003.9 | 1004.7 | 6 | – | – | – | 9/9 | clean | – | – | PASS |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 18 samples, against the run's cap of 1% (0.18).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T08:41:39.168Z

