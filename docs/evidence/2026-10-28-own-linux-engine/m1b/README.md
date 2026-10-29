# #171 M1b: the facade suites on both Linux engine lanes (M1b.3)

The facade-level suites run on the #171 VM (`dc-linux171-1e68`, the declared device `cua-171`: Ubuntu 24.04.4, x86-64,
8 vCPU, X11 on `:0`), each on the vendor engine lane and on the cua engine lane, before the first release: the cua lane
runs the locally built engine through `--engine-bin` (`native/linux-engine/target/release/cua-engine`,
`cua-engine 0.1.0 (639aaa718878)`; the engine's sources are unchanged since). The commands are the spec's Concrete Steps,
"The facade suites" (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md). `scripts/accept/linux-native.mjs`
and the doctor row on the installed, pinned engine come after the release and are not here.

## repl-parity, the native suite (`parity/`)

Prepared at, and run from, `4afae3e5` (prepared commit and harness commit the same). 33 cases: the 19 native cases and
the 14 `secrets/native-live/*` cases of the suite.

| Lane | Command | Result |
|---|---|---|
| vendor | `run --suite native --host cua --engine vendor` | complete, `RECORDED_VENDOR_DEFECT`: 31 covered, 2 declared vendor defects |
| cua | `run --suite native --host cua --engine cua --engine-bin <build>` | complete, `PASS`: 31 covered, 2 temporary candidate expectations |
| diff | `diff parity/vendor parity/cua --expected scripts/repl-parity/expected/native-linux.json` | `ok: true`, 0 differences, 2 declared (`linux-text-typetext-m1b`, `linux-text-paste-m1b`) |

- Which engine answered, per native case (`meta.json` `engineAnswered`, 19 entries a lane): the only engine process
  below the case's serve, read through `/proc/<pid>/exe`, was the scratch runtime's `sky_linux_x64` on the vendor lane
  and the named `cua-engine` on the cua lane, each a child of `trusted-worker.mjs`.
- The two text cases (`native/app/typetext`, `native/app/paste`). On the vendor lane, after 10 s of
  `EditableText.PasteText`, the error is `editable Paste did not insert text`: the marker never reaches the text and
  gedit survives (`linux-x64-vendor-engine-*-not-inserted`, test/repl-parity/vendor-defects.json).
  On the cua lane, `type_text is not available in this engine build` comes back at once: the marker never reaches the
  text and gedit survives (`linux-cua-engine-*-refused-until-m2`, the temporary candidate expectations).
  Every other case is equal between the lanes.

## Native baseline (`baseline/`)

Prepared at, and run from, `41db78a2`; experiment `171-m1b-20261029`; three runs a lane, interleaved
(`cv/run-n`, then `cc/run-n`), the default plan (5 cold, 30 warm, 10 tasks). The research fixture's gedit on
`scratch.txt` was ended first.

`compare --engines cv cc` (`baseline/engines.md`): **VERDICT: PASS**. The engine is the only attested difference;
every run is complete, and its engine attestation holds (the requested engine alone below the run's serves).

| Operation (engine-answered) | vendor median, ms | cua median, ms |
|---|---|---|
| warm.getAXState | 522.9 | 97.2 |
| warm.getScreenshot | 654.8 | 117.1 |
| bind.getApp | 538.8 | 128.8 |
| task.total (pressKey task) | 19003.2 | 9538.1 |
| warm.getState / warm.listApps | 23.8 / 20.9 | 17.7 / 17.7 |
| method.typeText / method.paste | 10238.8 / 10244.5 (fail after PasteText) | 17.8 / 16.8 (refused; `declared`, until M2) |

No cua median is above the vendor's on an operation the engine answers. Eleven operations that no engine answers (the
cold-connection phases, end_task, the binder's setValue, selectText and scroll-by-pages refusals) have cua medians
0.1 to 19 ms above the vendor lane's, inside the tolerance rule. They are listed in `engines.md` under "Where cua's
median is above the vendor engine's".

## The first release and the pinned engine (`release/`)

`linux-engine.yml` was dispatched with `publish: true` on the reviewed head 0546538a, run
https://github.com/SSFSKIM/cua/actions/runs/40969350911. That run built, tested and attested both arches natively,
then published `linux-engine-v0.1.0`. `node scripts/linux-engine-pin.mjs linux-engine-v0.1.0` verified both
attestations and wrote `runtime/engine/linux-engine.json`:

| arch | SHA-256 |
|---|---|
| x64 | `9778334a18f2abdfd201d70fc146399d2abecba1709d2596185161da44836cfc` |
| arm64 | `aabe1ce08a2e456abc99154153c79701b25ff3a2bb572fde45f7e16c8aa15b5d` |

On the #171 VM (x86-64), on the pinned asset:

- **Acceptance 9, fresh home.** `CUA_HOME=<fresh> cua install --engine` installed cua's Linux engine 0.1.0 at
  `<fresh>/engine/linux/cua-engine`.
  - `file` reports `ELF 64-bit LSB pie executable, x86-64, static-pie linked, stripped`.
  - `--version` prints `cua-engine 0.1.0 (0546538ac6c2)`, and its SHA-256 is the pin's.
  - With `CUA_NATIVE_ENGINE=cua`, `cua doctor` passes the engine row: "sessions here run the pinned cua-engine 0.1.0
    (linux-engine-v0.1.0) … SHA-256 9778334a…". With the default selection the row is SKIP and names the default,
    the vendor's engine.
- **Acceptance 1 and the Linux acceptance fixture, VM default home.** After `cua install --engine`, the fixture ran
  as `CUA_NATIVE_ENGINE=cua node scripts/accept/linux-native.mjs`, under `release/accept-watch.mjs`. The watcher
  sampled the process table every 50 ms (3,423 samples). Report: `release/accept-linux-native-cua.json`.
  - All 11 steps passed: bind gedit by X11 id, type and read back, kernel confinement, screenshot, `launch_app`
    outside the sandbox, `end_task`, approvals, clean exit, no run entry left, `CUA_REPL_HOST=vendor` refused.
  - The most `sky_linux` processes seen at once was 0.
  - The one engine process was `/Users/new/.local/share/cua/engine/linux/cua-engine`, the child of the trusted
    worker (`src/repl-host/trusted-worker.mjs`).
- **Not run here:** the arm64 install. Acceptance 9 on arm64 runs at M5 on the arm64 VM (Decision Log, "M1b
  pre-flight"). The release run tested the arm64 asset natively on GitHub's `ubuntu-24.04-arm` runner.

## Verified head

The `ci-gate` runs on the committed heads are recorded in the task reports and the pull request.
