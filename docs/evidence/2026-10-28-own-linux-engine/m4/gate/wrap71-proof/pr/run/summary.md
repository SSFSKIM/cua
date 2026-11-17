# linux-engine-diff summary

## m4-gateproof-wrap71 (release gate)

commit 514f5c62dd6c74b1ed24c48f112ca9c35a70eece; cua-engine 0.4.0 (514f5c62dd6c); occlusion covered; 1 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| desktop | list_apps | pinned | 67.8 | 52.7 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | newest | 55.6 | 58.1 | 21 | – | – | – | – | – | – | 41/41 |  |
| desktop | list_apps | cua | 7.5 | 6.5 | 21 | – | – | – | – | – | – | 41/41 | PASS (cold faster [-57.06, -44.61]; warm faster [-56.78, -41.24]) |
| desktop | list_apps | **bar** | 55.6 | 52.7 | | | | | | | | | |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 123 samples, against the run's cap of 1% (1.23).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; release gate: every verdict PASS; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-13T10:05:51.624Z

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 132 requests, 8 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

