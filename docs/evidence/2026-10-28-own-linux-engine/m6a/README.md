# M6a T8: acceptance 12, counted (#171, task 155)

**H, the frozen head:** `feat/171-m6a` at **f41546d082714bf9bea87a82b30f570ef62d755e**. Every run below ran once, at
H, and none was rerun. The cua before M6a, which installs the upgraded home, is main's
0d19fdfadce47fc6ba88db180fb4845346c9be26.

**Verdict:** acceptance 12 passes on both venues. Every cell passes on x64 (this VM) and on arm64 (hosted run
[45273664518](https://github.com/SSFSKIM/cua/actions/runs/45273664518)), and on the hosted x64 control too. Each leg's
driver verdict is `{pass: true, scope: full, acceptance: true}`. The x64 regression at H passes: R1, R3, R4 and the
`fallback` part. F10's credit holds (`f10-credit.txt`).

## The runs

- **x64, this VM** (`x64/runtime.json`). A fresh worktree detached at H, with real `node_modules` from `npm ci`, and a
  clean checkout at 0d19fdfa with its own `npm ci --omit=dev`. The driver's full selection, `--phases E,U --samples
  20`, ran inside `scripts/accept/linux-runtime-env.sh` on a private Xvfb (`:99`), under
  `locked.sh t8-x64 timeout -s TERM -k 60 60m`. It took 21 minutes, from 21:51 to 22:12 UTC on 2026-11-23.
- **arm64 and the hosted x64 control:** `gh workflow run linux-runtime.yml --ref feat/171-m6a -f commit=<H> -f
  suite=acceptance -f older=0d19fdfa…`, run **45273664518**. Both legs succeeded. The artifact's two reports are
  `arm64/runtime.json` and `x64-hosted/runtime.json`, kept as downloaded.

Each `runtime.json` holds every cell's checks and runs (its report). The raw streams stay in each run's scratch:
`~/.local/share/cua-171/t8/runs/x64/scratch` on the VM, and the runner's temp on the hosted legs, which is never
uploaded.

## Cells

| Cell | x64 (VM) | arm64 (45273664518) | x64 hosted control (45273664518) |
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

Each leg's release is `cua-linux-<arch>-e0.4.4-n24.22.0-s0.163.0-mb71dc1f8185d`.

On every leg, `sky_linux` appeared only in E5's rollback run, which is the vendor selection that cell requires. It
appeared in no other run.

The sampler judged each cua-engine it read alive. It also skipped some short-lived ones, whose executable can no longer
be read:

| Leg | cua-engines seen | Skipped |
|---|---|---|
| x64 (VM) | 24 | 3, all exiting: E1's smoke twice, E1's witness |
| arm64 | 22 | 1, gone: E1's smoke |
| x64 hosted | 21 | 1, exiting: U5's smoke |

On no leg was a cua-engine alive with an executable the sampler could not read.

**Measured, not judged:**

| | x64 (VM) | arm64 | x64 (hosted) |
|---|---|---|---|
| Module step | 0.8 s, 23 tarballs, 14.25 MB | 1.1 s, 23, 14.52 MB | 1.0 s, 23, 14.25 MB |
| `modules/<lock>` size | 39.9 MB | 39.6 MB | 39.9 MB |
| Serve start to first answer at H, median of 20 [min, max] | 742 ms [706, 833] | 572 ms [568, 597] | 493 ms [485, 502] |
| The same under the cua before M6a | 783 ms [709, 854] | 550 ms [542, 577] | 488 ms [477, 501] |
| H minus the older cua | −41 ms | +22 ms | +5 ms |

No difference reaches the pre-flight's 50 ms threshold for a finding. T6's pilot 4 saw +43 ms on the x64 VM, and this
counted run sees −41 ms there, so the VM's spread between sittings is about ±40 ms. On every leg, the six by-name import
outcomes at H equal the older cua's (`measured.importsHere` and `measured.importsOlder`).

## The x64 regression at H (§5.2)

Each part ran once, counted (`LABEL=counted`, a clean tree), through the gate's runner `scripts/linux-engine-gate/
suites.sh` on a private desktop (`:1`), under `locked.sh t8-x64 timeout -s TERM -k 60 45m`. Before each part, the
runner checked that no hold-sittings file was present and that more than 20G was free on `/`
(`x64/regression/chain.log`). Every home was the run's own.

- **R1, repl-parity's native suite on both engine lanes** (`x64/regression/parity/`). `PARITY_HOME` was a temporary
  home where H's `cua install` placed the own runtime and the vendor tree (`source-install.txt`). The prepared home
  passed the pinned rule. The results:
  - **Vendor lane:** 34 cases, complete, `RECORDED_VENDOR_DEFECT`, with 31 covered and the 3 declared x64 defects. These
    are typeText not inserted, paste not inserted, and the minimized window unavailable. Its engine was the scratch
    home's `runtimes/26.928.40906-linux-x64/…/sky_linux_x64`.
  - **cua lane:** 34 cases, assertions PASS, 34 covered. Both text cases are positive. Its engine was the scratch home's
    `engine/linux/cua-engine`, behind cua's service.
  - **The diff:** ok, 0 differences, with the 3 declarations applied.
  - **Both lanes' metadata:** `runtimeRelease cua-linux-x64-e0.4.4-n24.22.0-s0.163.0-mb71dc1f8185d` and
    `vendorRelease 26.928.40906-linux-x64`.
  - **Cleanup:** exit 0.
- **R3, `scripts/accept/linux-native.mjs`, default selection** (`x64/regression/accept/`). All 14 steps passed. Doctor
  says the default selected `cua`. The engine watch passed: only the run home's `cua-engine` ran, under the trusted
  worker, and no `sky_linux` ran.
- **R4, `scripts/accept/linux-device-mode.mjs`, default selection** (`x64/regression/device/`). All 20 steps passed,
  both negative controls among them. In `dedicated` mode, `typeText` of acceptance 6's string
  (`cua171 안녕 é 🙂\nline2`, with a combining acute) reads back exactly, once, in gnome-text-editor, and the editor is
  brought forward. In `shared` mode, click, key and `typeText` are refused with the device sentence and nothing is sent.
  The engine watch passed.
- **The `fallback` part in its new form** (`x64/regression/fallback/`). It ran five homes, each with `cua install` at H
  and then shaped. In each, the default refused cua's engine for the home's own reason, by doctor's row and by a
  refused open, with no session started. Each refusal named `node <H's checkout>/bin/cua.mjs install --engine`:

  | Home | Refusal |
  |---|---|
  | none | `engine_not_installed` |
  | previous (0.4.3) | `engine_outdated` |
  | released (0.4.0) | `engine_outdated` |
  | older (0.3.0) | `engine_outdated` |
  | unrecorded | `engine_unrecorded` |

  All five passed.

R2 is not rerun (§5.2: M6a changes neither the engine nor the service).

## F10's credit

Recorded in `f10-credit.txt`, with the commands and their output:

- `git diff --stat linux-engine-v0.4.3 linux-engine-v0.4.4 -- native/linux-engine`. The diff touches the drop settle and
  the handle end (`pointer.rs`, `handle.rs`, `drop_settle.rs`), a test seam on the drop's cursor watch
  (`drop_cursor.rs`), one test-module call in `engine.rs`, the version and the README. It touches no text, clipboard or
  paste source.
- H's `native/linux-engine` equals the `linux-engine-v0.4.4` tag (an empty diff).
- The engine pin's two hashes at H are `eff8befc…4d67ca` (x64) and `f54b2aeb…c7da3e` (arm64). Each equals the digest of
  the published 0.4.4 asset.
- `git diff da7585c3 H -- src/services/engine/linux/` touches only `client.mjs`. It holds 0.4.4's `MIN_ENGINE_VERSION`
  with its comment line, and F9's remedy text.

So item 6 beyond the witness is credited to M5's evidence through 0.4.4's diff, as ruling 1110 states it. The witness
itself, `linux-text.mjs`, passed on both architectures in every home state (E1, E3, U3 and U5). R4's gnome-text-editor
case and R1's two text cases passed on x64.

## Scan

The scan found no secrets or token-shaped strings, and nothing from a `:0` display: the displays named are `:1` and
`:99`. The one window title is a harness gedit's scratch file. The evidence holds no raw key codes and names no `claude-secrets`
path; every secret store was the run's own, empty.
