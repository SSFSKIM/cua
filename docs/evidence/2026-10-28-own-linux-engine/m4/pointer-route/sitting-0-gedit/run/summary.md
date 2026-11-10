# linux-engine-diff summary

## t71-person3 (experiment pointer-route)

T19's sitting (pointer-route.mjs): each cell 10 runs a lane, the real pointer parked before each run and read before each request; cua's lane with `--ignore-cover`, so the counts are the application's. Occlusions: `visible` (raised, nothing over it), `partial` (a window over its bottom half), `covered` (a window over the whole screen). Pointer: `in` the window's visible part, `under` the cover inside its geometry, `out` of its geometry, on the front window.

| family | kind | occlusion | pointer | cua took | pinned took |
|---|---|---|---|---:|---:|
| GTK3 gedit | click | visible | in | 10/10 | – |
| GTK3 gedit | scroll | visible | in | 10/10 | – |
| GTK3 gedit | move | visible | in | 10/10 | – |
| GTK3 gedit | click | visible | out | 10/10 | – |
| GTK3 gedit | scroll | visible | out | 10/10 | – |
| GTK3 gedit | move | visible | out | 10/10 | – |
| GTK3 gedit | click | partial | in | 10/10 | – |
| GTK3 gedit | scroll | partial | in | 10/10 | – |
| GTK3 gedit | move | partial | in | 10/10 | – |
| GTK3 gedit | click | partial | under | 10/10 | – |
| GTK3 gedit | scroll | partial | under | 10/10 | – |
| GTK3 gedit | move | partial | under | 5/10 (5 ok with no effect) | – |
| GTK3 gedit | click | partial | out | 10/10 | – |
| GTK3 gedit | scroll | partial | out | 10/10 | – |
| GTK3 gedit | move | partial | out | 10/10 | – |
| GTK3 gedit | click | covered | under | 10/10 | – |
| GTK3 gedit | scroll | covered | under | 10/10 | – |
| GTK3 gedit | move | covered | under | 10/10 | – |
| GTK3 gedit | click | covered | out | 10/10 | – |
| GTK3 gedit | scroll | covered | out | 10/10 | – |
| GTK3 gedit | move | covered | out | 10/10 | – |
| GTK3 gedit | select | visible | in | 10/10 | – |
| GTK3 gedit | select | visible | out | 10/10 | – |
| GTK3 gedit | select | partial | in | 10/10 | – |
| GTK3 gedit | select | partial | under | 10/10 | – |
| GTK3 gedit | select | partial | out | 10/10 | – |
| GTK3 gedit | select | covered | under | 10/10 | – |
| GTK3 gedit | select | covered | out | 10/10 | – |

The park held at every request.

desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x0160000e; the harness's own trace: 19198 requests, 1258 changes of a window, every one of its own; the run's record: not run (the whole-run RECORD runs only on a private display marked CUA171_PRIVATE_DISPLAY: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead)

