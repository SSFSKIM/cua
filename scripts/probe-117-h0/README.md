# #117 H0 (#175): cua's engine bundle and the vendor's helper, live on a GitHub-hosted macOS runner

The spike of the M4 and M5 pre-flight (`docs/doperpowers/specs/2026-10-18-own-native-engine-m4m5-preflight.md` §4 on
`docs/117-progress`), steps 1 to 10. Disposable: no product change, nothing merges.

- **Code under test: main b1b15484** (plugin 0.29.1, engine build 6f874040). The kit's branch is main plus
  `scripts/probe-117-h0/` and `.github/workflows/probe-117-h0.yml` only; each run records the diff from main
  (`steps.json` → `context.diffFromMain`). No witness ran M4's re-cut (`feat/117-m4-recut`, where `cua engine build`
  leaves the bundle in `<engine dir>/pending/` until approve): there, step 1 must approve or launch the build's
  `bundlePath`.
- **TCC writes:** only through `tcc.mjs`'s one writer, which exits before any write unless
  `RUNNER_ENVIRONMENT=github-hosted` and the owner's yes is in the design spec's Decision Log (O0, ruling 1111;
  docs/117-progress db775127). Never on a Mac of the owner's.
- **Kit:** `kit.mjs` (the steps), `tcc.mjs` (rows), `display.swift`; workflow `probe-117-h0` (`full` runs the kit,
  `label` reports what a runner label gives). Evidence: each run's artifact `probe-117-h0-<label>` (`steps.json`, every
  observation's tree and screenshot, desktop captures).

## Runs

| Run | Label, image | Kit | What it is |
|---|---|---|---|
| [45139175518](https://github.com/SSFSKIM/cua/actions/runs/45139175518) | macos-latest, macos26 20261117.0516.1 | 712502ef | First pass; the kit misread indented JSON, so grants and doctor rows are missing. Observations stand |
| [45141067063](https://github.com/SSFSKIM/cua/actions/runs/45141067063) | same | 8452c13a | Full read; approve before the product-launched session (the confirmation on approve) |
| [45142610176](https://github.com/SSFSKIM/cua/actions/runs/45142610176) | same | b320bef7 | The session before approve; desktop and front app after each step |
| [45144483807](https://github.com/SSFSKIM/cua/actions/runs/45144483807) | same | 8da2f4c5 | **The witness for the tables below**: the probe modes with rows before the bundle's first capture |
| [45146485145](https://github.com/SSFSKIM/cua/actions/runs/45146485145) | macos-27 | 8da2f4c5 | Step 5: queued 13 minutes with no runner, cancelled |
| [45148602059](https://github.com/SSFSKIM/cua/actions/runs/45148602059) | xcode-27, macos27 20261104.0337.1 | 4544f485 | macOS 27.0.1: the engine does not build (Swift 6.4 crashes); the kit stopped at the child relay |
| [45150346656](https://github.com/SSFSKIM/cua/actions/runs/45150346656) | same | ab0a8edf | Every Xcode on that image tried: none builds the engine. The vendor's steps ran |
| [45153602451](https://github.com/SSFSKIM/cua/actions/runs/45153602451) | same, the bundle built on macos-latest | 949f5ec6 | **The macOS 27 witness**: main's bundle built by `cua engine build --sign adhoc` on the macOS 26 image, carried over, and every step run on macOS 27 |

Runner (every macos-latest run): macOS 26.7.2 (25G332), arm64, image 20261117.0516.1; one display "Apple Virtual",
**1024 × 768 points, scale 1** (1024 × 768 pixels); console user `runner` in an Aqua session; SIP **disabled**;
passwordless sudo.

## Verdict (main b1b15484)

| §4 outcome | Verdict | Evidence (run 45144483807) |
|---|---|---|
| **Both pass in part 2** | **Yes** | cua's bundle through the product's own launch (step 8) and the vendor's helper (step 9) each bound all four scenes with a tree and a screenshot, and one click on TextEdit's text area returned ok |
| cua only | – | |
| Neither | – | |

Two conditions come with it, both measured: a row reaches only a process launched after it is written (steps 7, 10),
and every new TCC client's first capture raises replayd's confirmation, which stays on screen holding the front and the
key focus (steps 8, 9). Captures and Accessibility keep working under it; anything that needs the scene in front does
not.

## Per step (main b1b15484, run 45144483807 unless named)

| Step | Result | Evidence |
|---|---|---|
| 1. Bundle, no rows, `open -n -g -a` | The engine runs as its own TCC client (parent launchd). Its `status`: Accessibility, Screen Recording, Input Monitoring, post all **false**. A `cua serve` session (cua's host, `CUA_NATIVE_ENGINE=cua`) binding TextEdit answers `-10014: cua Engine needs the Accessibility permission`. doctor's engine row: fail, "Accessibility not granted". No capture confirmation | `step1-bundle-no-rows` |
| 2. Vendor's helper, no rows | `cua install` (26.928.40906-darwin-arm64, 23 s) places `Codex Computer Use.app` (`com.openai.sky.CUAService`). No helper running before. A `CUA_NATIVE_ENGINE=vendor` session binding TextEdit answers, after 115 s, "Computer Use permissions are still pending … in the ChatGPT Computer Use window" | `step2-vendor-no-rows` |
| 3. Child relay | The bundle's executable started by the job (parent: the kit's node) holds the runner's grants: all four **true**. A session on cua's host finds it at the socket: four scenes bound, tree and screenshot each, the click ok. **No capture confirmation** | `step3-child-relay`, `s3-*.txt/jpg` |
| 4. Scenes over the loopback device | `scenes-mac.mjs` over `ssh hosted-macos`: preflight clean; `up` TextEdit, Finder (200 files), Chrome for Testing 155.0.8059.84, the Electron fixture: all exit 0 and fit the 1024 × 768 display. `down all` leaves the run's Finder window (its teardown steps go through an engine) | `step4-scenes`, `step4-desktop.png` |
| 5. `macos-27` label | **No such label**: the dispatch queued 13 minutes with no runner and was cancelled. macOS 27 exists as **`xcode-27`** (public preview; macOS 27.0.1, 26A434, image 20261104.0337.1), where the whole kit passes with a bundle built on macOS 26 (below) | 45146485145, 45153602451 |
| 6. Can the job write a row (read only) | SIP disabled; authenticated root enabled; both databases take an immediate write lock under sudo (rolled back); Full Disk Access rows for `/bin/bash` and the provisioner. The image's own rows grant Accessibility and Screen Recording to `/bin/bash` and the provisioner, post to the provisioner, and no Input Monitoring row | `step6-tcc-readonly` |
| 7. Does tccd honour a written row | A user-database Accessibility row: **not** honoured. A system-database row: honoured **at the next launch only**; the running engine keeps reading false (also after a `tccd` restart, step 10). The Accessibility row alone also makes Input Monitoring and post read true | `step7-tccd-honours` |
| 8. Bundle with rows | Rows for `io.github.ssfskim.cua.engine` (four services, csreq from the ad hoc designated requirement), relaunch: all four **true**. A session with no engine running: the service launches the bundle (parent launchd), four scenes bound with tree and screenshot, the click ok. Its first capture raised replayd's confirmation ("cua Engine is requesting to bypass the system private window picker…", `desktop-step8-session.png`), which then held the front. `cua engine approve` with nobody at the console: approved, `captureConfirmation: none`, since the session had already raised it. In run 45141067063, where approve came first, approve failed `engine_capture_confirmation` and a second approve passed unattended. doctor's engine row: warn (ad hoc), the three permissions granted | `step8a-rows`, `step8-bundle-rows`, `step8b-approve` |
| C. Probe modes as their own LaunchServices instances | No rows: `focus` reads Accessibility false; `keystroke` exits 0 but nothing lands (absent from the next observation's tree); `watch-activations` saw both activations. With rows, before any capture: `focus` true; `keystroke` lands (the focused value's hash changed; `h0keys` in later trees); `watch-activations` saw both. In runs 45141067063 and 45142610176, run after the first capture, `keystroke` found TextEdit not focused: the confirmation held the focus | `stepC-probes-no-rows`, `stepC-probes-rows` |
| 9. Vendor's helper with rows | Rows for `com.openai.sky.CUAService` (csreq from its Developer ID requirement); no helper idle before. A vendor session: four scenes bound with tree and screenshot, the click ok; its first capture raised the same confirmation. Chrome for Testing must be named by path: the image preinstalls `/Applications/Google Chrome for Testing.app`, and the vendor refuses the bundle id as ambiguous (run 45139175518); cua's engine took it | `step9-vendor-rows`, `s9-*` |
| 10. Onboarding by rows (R5) | none: `-10014` Accessibility, doctor fail. Accessibility row written under the running engine: still false, also after a `tccd` restart, while a new probe instance reads true. Relaunched with Accessibility only (macOS 27 run only): Accessibility true, and the bind itself is refused `-10014 … needs the Screen Recording permission`, so main has no text-only observation. Screen Recording added: still false until the relaunch. Relaunched: all true, the observation returns tree and screenshot, doctor warn, `cua engine approve` passes unattended | `step10-onboarding` |

### Each launch path on its own

| Path | No rows | With rows |
|---|---|---|
| (a) the engine as a child of the job (relay) | Granted by the runner's own rows: all four true; four scenes observed, the click ok, no confirmation | not run (rows are not its grant) |
| (b) the bundle through LaunchServices (`open -n -g -a`, the product's launch) | All false; observation refused for Accessibility | All true after a relaunch; four scenes observed, the click ok; the first capture raises the confirmation |
| (c) the probe modes as LaunchServices instances | `focus` false; `keystroke` posts nothing that lands; `watch-activations` works | `focus` true; `keystroke` lands; `watch-activations` works |
| (d) the vendor's helper | "permissions are still pending" | Four scenes observed, the click ok; the first capture raises the confirmation |

A pass on (a) says nothing of (b) to (d): (a) borrows `/bin/bash`'s grants, and it is the only path that raised no
confirmation.

### macOS 27 (`xcode-27`, run 45153602451, main b1b15484)

Every result above holds on macOS 27.0.1 with the bundle built on macOS 26: step 1 refused for Accessibility; step 2
"permissions are still pending" after 114 s; step 3 granted, four scenes, the click ok, no confirmation; step 4 the four
scenes up; step 7 the system row honoured at the next launch only; step 8 all four grants after a relaunch, four
scenes through the product's launch, the click ok, the confirmation at its first capture, approve passed (doctor warn);
(c) `keystroke` lands with rows, not without; step 9 the vendor's helper with rows, four scenes, the click ok, the
confirmation; step 10 as on 26. Two differences: the image has **no user TCC database** at all (step 7's user half is
skipped), and **the engine cannot be built there**: `swift build -c release` crashes `swift-frontend` (a stack dump in
`cua engine build`'s error) with Xcode 27.0 and 27.1 (Swift 6.4) and 27.2 (Swift 6.4.2), the image's only toolchains
(run 45150346656). The macOS 26 image's default toolchain (Swift 6.3.3) builds it.

## What it means

**T10's shape: everything hosted.** The vendor comparison (acceptance 5, 6, 7, 9 and items 12 and 13 of 8) runs on a
runner, so O8 is not needed. The kit's order is the one T10 needs: rows for `io.github.ssfskim.cua.engine` and
`com.openai.sky.CUAService`, a relaunch of each, then the cells.

- **The capture confirmation must be dealt with before any cell that needs the scene in front** (keys, intervention,
  the front-app and non-interference oracles, `activate`). Each new client raises it at its first capture: the
  bundle, the vendor's helper, and presumably every rebuilt copy. It stays unanswered on a runner. Two routes, both
  beyond O0's "TCC rows", so they need a ruling: answer it (an AX press on UserNotificationCenter's Allow, by the
  harness, hosted only), or record the approval in replayd's store before the run. Without either, the sitting warms
  each client with one capture and runs only cells that need no focus. H0 did neither.
- Address Chrome for Testing by path on both engines.
- Item 1's hosted form: doctor's engine row reads the three permissions granted on the run's ad hoc bundle; the
  configured identity stays O1's.
- Item 8: the live items and 12, 13 are hosted. The staged onboarding (R5) is hosted only with a relaunch at every
  stage: a row written under a running engine is never seen by it, so "granted while running" has no hosted form,
  and "Screen Recording needs a relaunch" can be shown but not told apart from it.
- macOS 27 is available hosted as `xcode-27` (preview), not `macos-27`. A sitting there needs the bundle built on
  macos-latest and carried over (as run 45153602451 did) until the engine compiles with Swift 6.4, or the owner rules
  that hosted evidence stays macOS 26's.

## Findings for T1 and T4

- **T1.** `cua install --engine` is refused on macOS ("install takes --engine on Linux only …", exit 2; read on main's
  source and run with scratch homes); the kit used `cua engine build --sign adhoc`, as T1 replaces. `cua engine
  approve` with nobody at the console fails `engine_capture_confirmation` when the approve's own capture is the copy's
  first, even with every grant true and the capture made; a second approve passes. An unattended install (T1's,
  T4's, a runner's) approves twice or warms the copy with one capture first. The selection's refusal still names
  `cua install --engine` (`launch.mjs`), which this release refuses.
- **T4.** On the runner, `cua engine build --sign adhoc` (100 to 140 s), the bundle at the approved location under the
  runner's home, its LaunchServices launch and `status` all work; only grants are missing, and rows give them at the
  next launch. A gate step that writes the engine's rows, relaunches and runs one observation and `cua engine approve`
  (twice) is feasible under O0.
- **T4, macOS 27.** Swift 6.4 and 6.4.2 (every Xcode 27 on the `xcode-27` image) crash compiling `native/engine` in
  release; the crash's assertion is not in `cua engine build`'s error, which keeps the last 12 lines. A gate leg on
  `xcode-27` would fail today; a direct `swift build -c release` there gives the assertion to file or work around.
- **Harness.** `scenes-mac.mjs down all` exits 1 on Finder until the teardown steps are sent through an engine.
