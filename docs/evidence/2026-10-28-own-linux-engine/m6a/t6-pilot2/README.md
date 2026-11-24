# M6a T6: the cells' second pilot on both venues (#171, task 152; a development run, not counted)

This pilot runs the browser-only fixture's import step as ruled. The first pilot is beside this directory, in
`../t6-pilot/`. The ruling is the coordinator's on F7, with the design session's addition, ruling 1162:

- pixelmatch, pngjs, jpeg-js and classic-level are judged by name.
- playwright and sharp pass only when all of these hold:
  - the entry the kernel's resolver selects is the one under `modules/<lock>/`;
  - playwright loads through `require` from the kernel's base. Its entry and playwright-core's come from the tree,
    and so does every file of either that the require cache holds. Under trace, the kernel opens both entries;
  - sharp runs through `require`, with its addon and libvips mapped from the tree;
  - their by-name `import()` outcome equals the outcome under the cua before M6a. The older cua's outcome comes from a
    browser-only session of that cua in the upgraded home, taken before any cell runs. Paths are set aside when the
    outcomes are compared. Each browser-only run's projection carries the comparison, as `imports.comparison`.

**Runs:**

- Head: d9ec05c23c2fbc8cc2fc112f70139fb47d58d709. Older cua: 0d19fdfadce47fc6ba88db180fb4845346c9be26.
- x64 ran on this machine, the #171 VM, on a private Xvfb display under the host lock, with `--samples 20`. Its report
  is `x64/runtime.json`.
- arm64 and the hosted x64 control ran as [45235515356](https://github.com/SSFSKIM/cua/actions/runs/45235515356). Their
  reports are `arm64/runtime.json` and `x64-hosted/runtime.json`.

Each report carries labels, outcomes, counts and scratch paths. The fixtures' raw reports and the strace files stayed
in each run's scratch directory.

| Cell | x64 (VM) | arm64 | x64 (hosted control) |
|---|---|---|---|
| E0 | PASS | PASS | PASS |
| E1 | PASS | PASS | PASS |
| E2 | PASS | PASS | PASS |
| E3 | PASS | PASS | PASS |
| E4 | PASS | PASS | PASS |
| E5 | PASS | PASS | PASS |
| U0 | PASS | PASS | PASS |
| U1 | PASS | PASS | PASS |
| U2 | PASS | PASS | PASS |
| U3 | PASS | PASS | PASS |
| U4 | PASS | PASS | PASS |
| U5 | PASS | PASS | PASS |

Every check of every cell passed on all three legs. In E2's traced run, the kernel opened all eight watched entries:
the six selected ones, plus playwright's and playwright-core's entries as `require` loaded them. Nothing in the serve's
process tree named a path under `runtimes/`.

**Measured, not judged:**

| | x64 (VM) | arm64 | x64 (hosted) |
|---|---|---|---|
| module step | 0.8 s, 23 tarballs, 14,250,576 B | 1.2 s, 23, 14,515,969 B | 0.8 s, 23, 14,250,576 B |
| serve start to first answer, median of 20, at the head | 765 ms | 559 ms | 469 ms |
| the same under the cua before M6a | 770 ms | 550 ms | 457 ms |

The largest difference is 12 ms, below the pre-flight's 50 ms threshold for a finding.
