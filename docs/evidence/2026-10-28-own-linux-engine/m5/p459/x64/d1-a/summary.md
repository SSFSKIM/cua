# linux-engine-diff summary

## dev-p459-d1-a (experiment drag; development run, not a release gate)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:keepalive took | cua:ping took | cua:ping30 took | cua:keepalive-outlasted took | cua:ping-outlasted took | cua:ping30-outlasted took | newest warm ms | cua warm ms | cua:keepalive warm ms | cua:ping warm ms | cua:ping30 warm ms | cua:keepalive-outlasted warm ms | cua:ping-outlasted warm ms | cua:ping30-outlasted warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 338.2 | 366.8 | 380.7 | 372.7 | 401 | 370.1 | 371.6 | 367.4 | 508.4 | **changed** | speed (warm): cua **declared speed gap (#358)** [24.1, 33.7]: cua 366.8 ms against newest's 338.2 ms, the interval [24.1, 33.7] above 0; cua:keepalive **fail** [39.4, 45.3]: cua:keepalive 380.7 ms against newest's 338.2 ms, the interval [39.4, 45.3] above 0; cua:ping **declared speed gap (#358)** [30.6, 35.9]: cua:ping 372.7 ms against newest's 338.2 ms, the interval [30.6, 35.9] above 0; cua:ping30 **fail** [59.5, 67]: cua:ping30 401 ms against newest's 338.2 ms, the interval [59.5, 67] above 0; cua:keepalive-outlasted **declared speed gap (#358)** [24.8, 33]: cua:keepalive-outlasted 370.1 ms against newest's 338.2 ms, the interval [24.8, 33] above 0; cua:ping-outlasted **declared speed gap (#358)** [29.6, 36.3]: cua:ping-outlasted 371.6 ms against newest's 338.2 ms, the interval [29.6, 36.3] above 0; cua:ping30-outlasted **declared speed gap (#358)** [26.7, 32.7]: cua:ping30-outlasted 367.4 ms against newest's 338.2 ms, the interval [26.7, 32.7] above 0; received, coalesced samples (events), raw/moves, median: pinned 11.5 (11.5)/11.5 (2), newest 4 (4)/4 (1), cua 15 (14.5)/15 (1), cua:keepalive 19 (18.5)/19 (1), cua:ping 24 (23)/24 (1), cua:ping30 19 (19)/19 (1), cua:keepalive-outlasted 20.5 (20.5)/20.5 (1), cua:ping-outlasted 25 (25)/25.5 (1), cua:ping30-outlasted 15 (14)/15 (1) | cua declared speed gap (#358), cua:keepalive **FAIL**, cua:ping declared speed gap (#358), cua:ping30 **FAIL**, cua:keepalive-outlasted declared speed gap (#358), cua:ping-outlasted declared speed gap (#358), cua:ping30-outlasted declared speed gap (#358) |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 366.8 ms against newest's 338.2 ms, the interval [24.1, 33.7] within the declared 40 ms.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 8306 requests, 1493 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

