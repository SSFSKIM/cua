# linux-engine-diff summary

## pinned-D1 (experiment drag; acceptance on the pinned release)

candidate: sha256 f1513e79f4efdb3dd950e108fec05ce59b090926907a3071ee65ca3899d4921f, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.3 (ba5b043834ce); the pin's x64 asset of linux-engine-v0.4.3; native/linux-engine as at ba5b043834ce8239936743ec8de395deca15bd43, the checkout at 048140a2bde0f6398cc910c1aa14ecf2e7e51004; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44966356899/attempts/1, built from ba5b043834ce8239936743ec8de395deca15bd43 (refs/heads/m5-engine-043) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44964231636/attempts/1, built from ba5b043834ce8239936743ec8de395deca15bd43 (refs/heads/m5-engine-043) on a github-hosted runner

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 320.8 | 455.1 | 454.8 | 460.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (191.5)/192 (16), newest 50 (50)/50 (7), cua 188 (183)/188 (8), cua:0ms 172 (157)/172 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 324.8 | 454.9 | 455.3 | 462 | clean | received, coalesced samples (events), raw/moves, median: pinned 240 (240)/240 (19.5), newest 51.5 (51.5)/51.5 (8), cua 235 (226)/235 (9), cua:0ms 213 (187.5)/213 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 1/30 | 262.7 | 455.1 | 454.9 | 279.9 | clean | reach (pinned mean 130.7 px): cua 30/30 (shortest 146, mean 146.4), cua:0ms 0/30 (shortest 0, mean 40.4); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 55 (54)/0 (0), cua:0ms 41.5 (40)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 337.9 | 368.7 | 365.8 | 510.9 | **changed** | speed (warm): cua **declared speed gap (#358)** [27.8, 32.7]: cua 368.7 ms against newest's 337.9 ms, the interval [27.8, 32.7] above 0; cua:0ms **declared speed gap (#358)** [22.8, 32.8]: cua:0ms 365.8 ms against newest's 337.9 ms, the interval [22.8, 32.8] above 0; received, coalesced samples (events), raw/moves, median: pinned 13 (12.5)/13 (2), newest 3 (3)/3 (1), cua 20 (19.5)/20 (1), cua:0ms 56 (52)/57 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 26/40 | 40/40 | 0/40 | 517.3 | 477.4 | 455.7 | 1156.9 | clean | speed (warm): cua faster [-44.2, -33.25], 477.4 ms against newest's 515.25 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (58), newest 196 (196)/196 (19), cua 764 (760)/764 (28), cua:0ms 748 (668.5)/748 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 368.7 ms against newest's 337.9 ms, the interval [27.8, 32.7] within the declared 40 ms.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11143 requests, 2337 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

