# linux-engine-diff summary

## dev-p459-d1-b (experiment drag; development run, not a release gate)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:keepalive took | cua:ping took | cua:ping30 took | cua:keepalive-outlasted took | cua:ping-outlasted took | cua:ping30-outlasted took | newest warm ms | cua warm ms | cua:keepalive warm ms | cua:ping warm ms | cua:ping30 warm ms | cua:keepalive-outlasted warm ms | cua:ping-outlasted warm ms | cua:ping30-outlasted warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 339 | 366.9 | 382 | 370.7 | 400.7 | 369.1 | 371.1 | 371.1 | 507.7 | **changed** | speed (warm): cua **declared speed gap (#358)** [24.4, 31.2]: cua 366.9 ms against newest's 339 ms, the interval [24.4, 31.2] above 0; cua:keepalive **fail** [40.6, 46.7]: cua:keepalive 382 ms against newest's 339 ms, the interval [40.6, 46.7] above 0; cua:ping **declared speed gap (#358)** [27.8, 34.2]: cua:ping 370.7 ms against newest's 339 ms, the interval [27.8, 34.2] above 0; cua:ping30 **fail** [57.8, 64.4]: cua:ping30 400.7 ms against newest's 339 ms, the interval [57.8, 64.4] above 0; cua:keepalive-outlasted **declared speed gap (#358)** [25, 33.1]: cua:keepalive-outlasted 369.1 ms against newest's 339 ms, the interval [25, 33.1] above 0; cua:ping-outlasted **declared speed gap (#358)** [26.8, 34.8]: cua:ping-outlasted 371.1 ms against newest's 339 ms, the interval [26.8, 34.8] above 0; cua:ping30-outlasted **declared speed gap (#358)** [26.8, 34.1]: cua:ping30-outlasted 371.1 ms against newest's 339 ms, the interval [26.8, 34.1] above 0; received, coalesced samples (events), raw/moves, median: pinned 12 (12)/12 (2), newest 4 (4)/4 (1), cua 16.5 (16)/17 (1), cua:keepalive 21 (21)/21.5 (1), cua:ping 18.5 (18)/19 (1), cua:ping30 15.5 (15.5)/15.5 (1), cua:keepalive-outlasted 20.5 (20)/20.5 (1), cua:ping-outlasted 22.5 (22.5)/22.5 (1), cua:ping30-outlasted 23 (23)/23.5 (1) | cua declared speed gap (#358), cua:keepalive **FAIL**, cua:ping declared speed gap (#358), cua:ping30 **FAIL**, cua:keepalive-outlasted declared speed gap (#358), cua:ping-outlasted declared speed gap (#358), cua:ping30-outlasted declared speed gap (#358) |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 366.9 ms against newest's 339 ms, the interval [24.4, 31.2] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 8305 requests, 1493 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

