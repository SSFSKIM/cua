# linux-engine-diff summary

## t5-fix-control-noactive (development run, not a release gate)

commit 7fe5f226d0f68612dacc512f7d2cbfc55ff1a453; cua-engine 0.3.0 (unknown); occlusion covered; 3 blocks; 7 warm tree reads and 5 warm inputs per block

candidate: sha256 2db6f2dd38c40c4a5f428147aad3063eb8df456b9f353041094825b5ef925d54, x86_64-unknown-linux-musl static-pie, cua-engine 0.3.0 (unknown); attestation not checked (a development run); checkout not clean

negative check: the witness failed the activating stub (stacking, active, focus); the X request audit failed it (_NET_ACTIVE_WINDOW ClientMessage, XTEST FakeInput, 122 requests traced)

| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| identity-gtk3 | identity_apart | cua | 31.7 | 42.5 | 9 | – | – | 0 | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked | cua | 18.7 | 18.1 | 9 | – | – | – | 12/12 | clean | – | – | PASS |
| identity-gtk3 | identity_stacked_self_active | cua | 17.1 | 22.3 | 9 | – | – | – | 12/12 | clean | – | – | FAIL: not answered as expected (its own tree, or the duplicates sentence) on 12 of 12 samples (0/0, 0/1, 0/2); the background audit's requests did not answer as the case expects (Window 37748739 matches several accessibility windows; close or retitle the duplicates; Window 37748743 matches several accessibility windows; close or retitle the duplicates) |
| identity-gtk3 | identity_stacked_other_active | cua | 16.9 | 21 | 9 | – | – | – | 12/12 | clean | – | – | PASS |

Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 48 samples, against the run's cap of 1% (0.48).

Text restores (the oracle put the scene's first word back before a sample's preparation): pinned 0, newest 0, cua 0.

run valid; development run, not a release gate: **FAIL**: identity-gtk3 identity_stacked_self_active cua; text restores (the first word put back before a sample): pinned 0, newest 0, cua 0, finished 2026-11-02T19:33:56.285Z

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0220000e; the harness's own trace: 2449 requests, 603 changes of a window, every one of its own; the run's record: 638 requests of the harness's and the engines' clients, 609 changes of a window, every one of its own

