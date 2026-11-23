# M6a T6: the cells' third pilot, after fix wave 1 (#171, task 152; a development run, not counted)

This pilot ran the driver with fix wave 1's judges at head ccfba5c29ebe6bda4f6d9f04765af381a527f1d8. The older cua was
0d19fdfadce47fc6ba88db180fb4845346c9be26. The fix wave changed these judges:

- the phases and the fixtures' identities;
- whole traces, and opens counted only after the kernel's exec;
- the validated by-name baseline;
- playwright's loaded graph;
- the vendor-tree boundaries and the loader in every cell derived from E2;
- the approved older checkout, U0's whole tree, and U1's four `changed: false`;
- refusals proved by exec evidence;
- the managed Node, and no inherited overrides.

**Runs:**

- x64 ran on this VM, on a private display under the host lock, with `--samples 20`. Its report is `x64/runtime.json`.
- arm64 and the hosted x64 control ran as [45248386560](https://github.com/SSFSKIM/cua/actions/runs/45248386560). Their
  reports are `arm64/runtime.json` and `x64-hosted/runtime.json`.

| Cell | x64 (VM) | arm64 | x64 (hosted control) |
|---|---|---|---|
| E0 | PASS | PASS | PASS |
| E1 | PASS | PASS | **FAIL** |
| E2 | PASS | PASS | PASS |
| E3 | PASS | PASS | PASS |
| E4 | PASS | PASS | PASS |
| E5 | PASS | PASS | PASS |
| U0 | PASS | PASS | PASS |
| U1 | PASS | PASS | PASS |
| U2 | PASS | PASS | PASS |
| U3 | PASS | PASS | **FAIL** |
| U4 | PASS | PASS | PASS |
| U5 | PASS | **FAIL** | PASS |

**All three failures have the same cause, in the 50 ms process watch.** They are:

- x64 hosted, E1: the item 6 witness under strace;
- x64 hosted, U3: the item 1 smoke;
- arm64, U5: the item 1 smoke.

In each, the fixture passed and every one of its steps passed. There was no sky_linux at any sample, and the trace,
where one was taken, was whole. The failing check is the watch's "the engine child is the home's cua-engine". It found
one cua-engine whose executable could not be read: `cua-engine <pid> ran null`. That run saw three cua-engine
processes where the passing runs of the same fixture see two.

The likely cause is a race in the sampler. It reads `/proc/<pid>/stat` first, and the process is alive then, not
exiting and not a zombie. It reads `/proc/<pid>/exe` a moment later. A short-lived cua-engine, such as the service's
version probe, can exit in between, so its executable is unread with nothing in the sample to say why. This was
reported to the coordinator with this evidence and not rerun.
