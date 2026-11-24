# M6a T6: the cells' pilot on both venues (#171, task 152; a development run, not counted)

The driver `scripts/accept/linux-runtime.mjs` ran every cell of the pre-flight's §5.2 at
496a0ce218e4ab1e44de4eccc8424f9f03e801e0. The upgraded home was installed by the cua before M6a at
0d19fdfadce47fc6ba88db180fb4845346c9be26: main's tip, which this branch merged (0.4.4's pin, plugin 0.29.9).

- **x64:** this machine (the #171 VM), on a private Xvfb display under the host lock. Both homes ran in one wrapper
  invocation, with `--samples 20`. Report: `x64/runtime.json`.
- **arm64:** [45230169281](https://github.com/SSFSKIM/cua/actions/runs/45230169281), `linux-runtime.yml` dispatched
  on `m6a-t6` with `commit=496a0ce2…` and `older=0d19fdfa…`. The `ubuntu-24.04-arm` leg's report is
  `arm64/runtime.json`. The `ubuntu-24.04` control leg's report is `x64-hosted/runtime.json`.

Each `runtime.json` is the driver's artifact as written. It carries labels, outcomes, counts and scratch paths. The
fixtures' own reports, the strace files and doctor's output stayed in each run's scratch directory.

| Cell | x64 (VM) | arm64 (hosted) | x64 (hosted control) |
|---|---|---|---|
| E0 | PASS | PASS | PASS |
| E1 | PASS | PASS | PASS |
| E2 | FAIL | FAIL | FAIL |
| E3 | FAIL | FAIL | FAIL |
| E4 | FAIL | FAIL | FAIL |
| E5 | PASS | PASS | PASS |
| U0 | PASS | PASS | PASS |
| U1 | PASS | PASS | PASS |
| U2 | PASS | PASS | PASS |
| U3 | FAIL | FAIL | FAIL |
| U4 | FAIL | FAIL | FAIL |
| U5 | FAIL | FAIL | FAIL |

**One failure explains every FAIL, the same on all three legs.** In each browser-only run, the step "each of the six
imports by name" fails, and every other step of the run passes. The kernel's loader refuses two of the six packages
by name:

- `import('playwright')`: "The requested module './index.js' does not provide an export named 'default'";
- `import('sharp')`: "Unsupported import specifier "../package.json" in node_repl. Only .js and .mjs files are
  supported."

The cua before M6a fails both imports with the same words, from its vendor tree. The driver recorded this as
`measured.importsOlder` beside `measured.importsHere`, and the two are equal on all three legs. The entry files are
byte-identical in the two trees. So this is a property of the kernel's loader, not of M6a. What the spec asks for, a
cell that imports each of the six by name, has never worked for these two.

These runs show the module tree's code loading inside the sandbox:

- the kernel's resolver selects all six entries from `modules/<lock>/`;
- the traced run opens each entry;
- sharp is loaded by `require` from the same base, and it resizes an image;
- classic-level writes and reads a key;
- sharp's addon, libvips and classic-level's addon are mapped from the module tree.

**Measured, not judged** (`measured` in each report):

| | x64 (VM) | arm64 | x64 (hosted) |
|---|---|---|---|
| module step | 1.0 s, 23 tarballs, 14,250,576 B | 0.7 s, 23, 14,515,969 B | 0.8 s, 23, 14,250,576 B |
| `modules/<lock>` size | 39,875,835 B | 39,628,528 B | 39,875,835 B |
| serve start to first answer, median of 20, at the head (E) | 771 ms | 545 ms | 491 ms |
| the same under the cua before M6a (U) | 765 ms | 550 ms | 500 ms |

The serve-to-first-answer difference is at most 9 ms on every leg, below the pre-flight's 50 ms threshold for a
finding.
