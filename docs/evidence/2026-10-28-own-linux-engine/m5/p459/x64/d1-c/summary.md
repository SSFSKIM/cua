# linux-engine-diff summary

## dev-p459-d1-c (experiment drag; development run, not a release gate)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:keepalive took | cua:ping took | cua:ping30 took | cua:keepalive-outlasted took | cua:ping-outlasted took | cua:ping30-outlasted took | newest warm ms | cua warm ms | cua:keepalive warm ms | cua:ping warm ms | cua:ping30 warm ms | cua:keepalive-outlasted warm ms | cua:ping-outlasted warm ms | cua:ping30-outlasted warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 338 | 364.9 | 381.1 | 372 | 401.4 | 368.6 | 366 | 369 | 508.7 | **changed** | speed (warm): cua **declared speed gap (#358)** [24.9, 32.4]: cua 364.9 ms against newest's 338 ms, the interval [24.9, 32.4] above 0; cua:keepalive **fail** [40.1, 45.4]: cua:keepalive 381.1 ms against newest's 338 ms, the interval [40.1, 45.4] above 0; cua:ping **declared speed gap (#358)** [31, 36.1]: cua:ping 372 ms against newest's 338 ms, the interval [31, 36.1] above 0; cua:ping30 **fail** [58.9, 65.8]: cua:ping30 401.4 ms against newest's 338 ms, the interval [58.9, 65.8] above 0; cua:keepalive-outlasted **declared speed gap (#358)** [26, 33.7]: cua:keepalive-outlasted 368.6 ms against newest's 338 ms, the interval [26, 33.7] above 0; cua:ping-outlasted **declared speed gap (#358)** [25.6, 33]: cua:ping-outlasted 366 ms against newest's 338 ms, the interval [25.6, 33] above 0; cua:ping30-outlasted **declared speed gap (#358)** [28.4, 33.6]: cua:ping30-outlasted 369 ms against newest's 338 ms, the interval [28.4, 33.6] above 0; received, coalesced samples (events), raw/moves, median: pinned 9.5 (9)/9.5 (2), newest 5 (5)/5 (1), cua 16 (15.5)/16 (1), cua:keepalive 19 (19)/19 (1), cua:ping 22.5 (22.5)/22.5 (1), cua:ping30 20 (20)/20.5 (1), cua:keepalive-outlasted 19.5 (19)/20 (1), cua:ping-outlasted 14.5 (14.5)/14.5 (1), cua:ping30-outlasted 20 (20)/20 (1) | cua declared speed gap (#358), cua:keepalive **FAIL**, cua:ping declared speed gap (#358), cua:ping30 **FAIL**, cua:keepalive-outlasted declared speed gap (#358), cua:ping-outlasted declared speed gap (#358), cua:ping30-outlasted declared speed gap (#358) |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 364.9 ms against newest's 338 ms, the interval [24.9, 32.4] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 8301 requests, 1493 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

