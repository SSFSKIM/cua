# linux-engine-diff summary

## t71-proof2-controls (experiment pointer-route)

T19's sitting (pointer-route.mjs): each cell 10 runs a lane, the real pointer parked before each run and read before each request; cua's lane with `--ignore-cover` and `--ignore-pointer`, so the counts are the application's. Occlusions: `visible` (raised, nothing over it), `partial` (a window over its bottom half), `covered` (a window over the whole screen). Pointer: `in` the window's visible part, `under` the cover inside its geometry, `out` of its geometry, on the front window.

| family | kind | occlusion | pointer | cua took | pinned took |
|---|---|---|---|---:|---:|
| Chrome | click | visible | in | 10/10 | – |
| Chrome | scroll | visible | in | 10/10 | – |
| Chrome | move | visible | in | 10/10 | – |
| Chrome | click | visible | out | 10/10 | – |
| Chrome | scroll | visible | out | 10/10 | – |
| Chrome | move | visible | out | 10/10 | – |
| Chrome | click | partial | in | 10/10 | – |
| Chrome | scroll | partial | in | 10/10 | – |
| Chrome | move | partial | in | 10/10 | – |
| Chrome | click | partial | under | 10/10 | – |
| Chrome | scroll | partial | under | 10/10 | – |
| Chrome | move | partial | under | 10/10 | – |
| Chrome | click | partial | out | 10/10 | – |
| Chrome | scroll | partial | out | 10/10 | – |
| Chrome | move | partial | out | 10/10 | – |
| Chrome | click | covered | under | 10/10 | – |
| Chrome | scroll | covered | under | 10/10 | – |
| Chrome | move | covered | under | 10/10 | – |
| Chrome | click | covered | out | 10/10 | – |
| Chrome | scroll | covered | out | 10/10 | – |
| Chrome | move | covered | out | 10/10 | – |
| Chrome | select | visible | in | 10/10 | – |
| Chrome | select | visible | out | 0/10 (10 not ok) | – |
| Chrome | select | partial | in | 10/10 | – |
| Chrome | select | partial | under | 0/10 (10 not ok) | – |
| Chrome | select | partial | out | 0/10 (10 not ok) | – |
| Chrome | select | covered | under | 0/10 (10 not ok) | – |
| Chrome | select | covered | out | 0/10 (10 not ok) | – |
| Electron (cua fixture) | click | visible | in | 10/10 | – |
| Electron (cua fixture) | scroll | visible | in | 10/10 | – |
| Electron (cua fixture) | move | visible | in | 10/10 | – |
| Electron (cua fixture) | click | visible | out | 10/10 | – |
| Electron (cua fixture) | scroll | visible | out | 10/10 | – |
| Electron (cua fixture) | move | visible | out | 10/10 | – |
| Electron (cua fixture) | click | partial | in | 10/10 | – |
| Electron (cua fixture) | scroll | partial | in | 10/10 | – |
| Electron (cua fixture) | move | partial | in | 10/10 | – |
| Electron (cua fixture) | click | partial | under | 10/10 | – |
| Electron (cua fixture) | scroll | partial | under | 10/10 | – |
| Electron (cua fixture) | move | partial | under | 10/10 | – |
| Electron (cua fixture) | click | partial | out | 10/10 | – |
| Electron (cua fixture) | scroll | partial | out | 10/10 | – |
| Electron (cua fixture) | move | partial | out | 10/10 | – |
| Electron (cua fixture) | click | covered | under | 10/10 | – |
| Electron (cua fixture) | scroll | covered | under | 10/10 | – |
| Electron (cua fixture) | move | covered | under | 10/10 | – |
| Electron (cua fixture) | click | covered | out | 10/10 | – |
| Electron (cua fixture) | scroll | covered | out | 10/10 | – |
| Electron (cua fixture) | move | covered | out | 10/10 | – |
| Electron (cua fixture) | select | visible | in | 10/10 | – |
| Electron (cua fixture) | select | visible | out | 0/10 (10 not ok) | – |
| Electron (cua fixture) | select | partial | in | 10/10 | – |
| Electron (cua fixture) | select | partial | under | 0/10 (10 not ok) | – |
| Electron (cua fixture) | select | partial | out | 0/10 (10 not ok) | – |
| Electron (cua fixture) | select | covered | under | 0/10 (10 not ok) | – |
| Electron (cua fixture) | select | covered | out | 0/10 (10 not ok) | – |

The park held at every request.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 48724 requests, 3149 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

