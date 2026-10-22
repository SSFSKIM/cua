# #117 M3: the Linux parity suite with approvals, on cua-linux

Spec `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`, M3's Proves line "the Linux parity suite with
approvals at 0 unexpected differences", run as maws-3f set it: `--suite native` twice in one VM boot, at M3's base
(027179bc, no approvals) and at M3's head, each diffed against #115 M0's recorded vendor control
(`docs/evidence/2026-10-17-own-sandbox/m0/gce-vendor-control/`: cua-gce, 2026-10-17, box commit 8afd143, runtime
26.928.40906-linux-arm64), and base against head, so a difference the device makes (cua-linux against cua-gce) shows in
both and is never declared as M3's.

**Device.** cua-linux, the Tart VM on the MacBook (2 vCPU, 4 GB, Ubuntu 24.04 arm64, lightdm autologin, openbox),
started headless 2026-10-22T00:37:31Z and stopped 01:42:39Z; size unchanged, disk usage 9 → 11 GB (Node and the parity
clones' npm trees). Same runtime release as the control. Two device preparations, both inside the VM: the discovery home
`~/.local/share/cua-h4` predated the managed Node, so `cua install` placed Node 24.22.0 and the pinned sandbox helper
there (runtime unchanged, `changed: false`); and the VM's own Chrome was started on its bound `me` profile in the VM's
X session so prepare's profile listing finds a ready profile. No owner step.

**Runs** (`node scripts/repl-parity.mjs prepare --device cua-linux --commit <c> --profile me`, then
`run --device cua-linux --host cua --suite native --out <dir>`, each from a controller worktree at the same commit):

| dir | commit | cases | assertions |
|---|---|---|---|
| `base-027179bc/` | 027179bc (M3's base) | 33 | PASS, complete |
| `head-7539d5cd-superseded/` | 7539d5cd (feat/117-m3 + m3/linux, before M3.1's fix round 3) | 33 | PASS, complete |
| `head-10846dfd/` | 10846dfd (M3's head: M3.1–M3.4 reviewed) | 33 | PASS, complete |

**Diffs** (`diff <a> <b> --expected test/repl-parity/expected-differences.json`; the control is a whole-suite run, so
each raw diff also lists the cases these runs did not cover; `diffs.json` keeps the rows of the run's own 33 cases):

| diff | rows in the run's cases | what they are |
|---|---|---|
| base vs control | 1 | `configuration/backend`: the run-level backend (`fixture-services+native`, a subset run against the whole-suite control) |
| head vs control | 1 | the same `backend` row, also in base vs control: the device and lane, not M3 |
| base vs head | 19 | `caseConfigurations` on the 19 native cases, each `{computer, scoped}` identically on both sides: the diff tool accepts only the control → own-host transition (#115) and flags any own-host pair; no real difference |

So head vs control's only difference is also in base vs control, and no cell of any native or `secrets/native-live`
case differs with approvals on: nothing is declared for M3. The superseded head showed 14 more rows, one per
`secrets/native-live/*` exercise cell, all from an `approvalMatches` key M3.1's fixture had added to the compared report
(harness output, not behaviour); M3.1's fix round 3 (2707402d) folded the approval check into `requestMatches`, so a
passing report carries the control's keys and a wrong approval still fails the case.

**The window lookup's cost.** Window methods are keyed by the app sky_linux's own `list_windows` names, one extra
`list_windows` per window action; the `native/cua/listwindows` exercise cell's in-cell time is 11–13 ms (both runs), and
the window-action exercise cells take 0.5–6 s; per-cell head − base deltas (one sample each) range −315 to +255 ms, median
about +30 ms, inside the noise.
