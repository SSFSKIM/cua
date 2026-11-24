# M6b T6: acceptance 13's driver, pilot runs (#171, task 170)

**Development runs, not counted.** They show that acceptance 13's driver (`scripts/accept/linux-runtime.mjs`, the M6b
pre-flight §5.2) runs every cell on both venues, and they found one harness fault, fixed before round 2. T8 runs the
counted acceptance at the frozen head.

## Round 2: every cell passes on all three legs

**The tip.** `m6b-t6-pilot-tip` at **f01e891f62e11607a7d22bbe90efe42afdd580b1**. It merges T4 (`m6b-t4` at 13c6557d5,
in review then) into T6's head 34290bec5, so the pilots ran with the Linux pins gone from `runtime/releases/` (§6,
"at the tip that holds T4"). The tip exists for these pilots alone. The older cua is main 854103aa5 (APPROVED_OLDER).

| Leg | Where | Report | Cells | Verdict |
|---|---|---|---|---|
| x64 | this VM, private Xvfb, `locked.sh t170 timeout -s TERM -k 60 75m`, 16:17 to 16:36 UTC | `x64/runtime.json` | E0 to E3, U0 to U5: PASS | `{pass, scope: full, acceptance: true}` |
| arm64 | hosted `ubuntu-24.04-arm`, run [45435311418](https://github.com/SSFSKIM/cua/actions/runs/45435311418) | `arm64/runtime.json` | all PASS | the same |
| x64, hosted control | hosted `ubuntu-24.04`, the same run | `x64-hosted/runtime.json` | all PASS | the same |

Each driver ran its full selection (`--phases E,U`, 20 samples a side) inside `scripts/accept/linux-runtime-env.sh`.
The raw streams (fixture reports, strace files, fetch logs) stay in each run's scratch: on this VM under
`~/.local/share/cua-171/t170/pilot/x64-tip/scratch`, on the runners in their temp, never uploaded.

### What the witnesses show (x64; the hosted legs alike)

- **The fetch log and its control.** The older cua's install under the preload logged the vendor's deb
  (`chatgpt_26.928.40906_amd64.deb`, 474,898,954 bytes; arm64's 453,477,698), asked for and answered whole. That was
  §9's unverified point: the installers' `fetch` is the global one at call time. E0's log then held exactly the 26
  pinned assets (23 tarballs, the helper, Node, the engine), answered from `registry.npmjs.org`, `nodejs.org` and
  `release-assets.githubusercontent.com`: 84,128,025 bytes on x64 against the older install's 559,026,979.
- **E0's trace.** Whole (no unresolved path, nothing unfinished, every process ended). The process-path witness is
  `node` ×2, `gzip`, `tar`: no `ar`, no `xz`. One call under `runtimes/`, retired-tree's `lstat` of the absent
  directory.
- **E3.** Every refusal's sentence and hint equal the literals built from this head's installer. Under the three
  vendor sources the open's trace and doctor's exec no engine, helper, worker or host. Doctor runs `bwrap` on `true`
  (sandbox.userns), `dbus-send`, `xdpyinfo` and `git`. Under the 0.4.4 override, one more exec appears in each, the
  override's path with `--version`.
- **U1 and U2's calls under `runtimes/`.** Each traced doctor run and the install made 2,675 `lstat`s, 327 directory
  opens (the tree's 327 directories), one open of `install.json` and one `fstat` of it. Nothing outside the two
  release names, and nothing executed or written there.
- **U2.** The line was §3.3's literal, once. The two added entries were named nowhere. `runtimes/` was unchanged:
  listing, hashes and mtimes. The fetch log was empty, and the managed parts were unchanged.

### Measured, not judged

| | x64 (VM) | arm64 (hosted) | x64 (hosted) |
|---|---|---|---|
| older cua's install: seconds, bytes fetched | 35.3 s, 559,026,979 | 25.2 s, 535,657,124 | 24.5 s, 559,026,979 |
| E0's install: seconds, bytes fetched | 5.8 s, 84,128,025 | 3.5 s, 82,179,426 | 3.0 s, 84,128,025 |
| doctor, E0 vs U1 (the walk) | 0.5 s vs 0.5 s | 0.4 s vs 0.5 s | 0.4 s vs 0.4 s |
| serve start to a first answer, median of 20: head vs older | 767 vs 766 ms | 635 vs 580 ms | 494 vs 496 ms |
| the tree by `find` (§3.2) | 211,063,821 bytes | 205,071,356 bytes | 211,063,821 bytes |

- **arm64's first answer** is 55 ms slower at the head than under the older cua. §5.2 calls a difference above about
  50 ms a finding. It is one pilot's medians on a shared hosted runner, against 1 ms on both x64 legs, and T8's counted
  run measures it again.
- **The tree is one byte over** the pre-flight's 211,063,820. That figure is a home installed on 2026-10-28, and each
  install writes its own `install.json`.

## Round 1: one harness fault, on every leg

- **The heads.** x64 ran here at 4daf80a48 (`round1/x64/runtime.json`). Hosted run
  [45430922952](https://github.com/SSFSKIM/cua/actions/runs/45430922952) ran at the same head
  (`round1/arm64/`, `round1/x64-hosted/`).
- **The result.** Every cell passed on all three legs but U1 and U2, which failed on one call: `statx(<fd of
  install.json>, "", AT_EMPTY_PATH)`. That is Node's `fstat` of the record `retired-tree.mjs` had just opened, and the
  judge had read it as a stat that follows a link.
- **The fix** (34290bec5): the reader calls it `fstat`, and the judge allows it inside a release name, since it looks
  up no path. A following stat still fails, by test.

An earlier x64 attempt stopped at the driver's preconditions with `CUA_HOME is unset`. It had run through a
symbolic link to the worktree. `linux-runtime-env.sh` computed its directory logically, so node did not run
`linux-runtime-env.mjs`'s main block, the wrapper exported nothing, and the command would have run in the caller's
homes. The wrapper now resolves physical paths (34290bec5).
