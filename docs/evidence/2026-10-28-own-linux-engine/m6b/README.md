# #171 M6b: acceptance 13, counted (T8, task 173)

The plan is the M6b pre-flight, [§5.2 and §5.3](../../../doperpowers/specs/2026-10-28-own-linux-engine-m6b-preflight.md),
ruling 1218. Every counted run below is at the frozen head:

- **H = 3722f2826ca8a8ff3c7a6e28e00ba765d10b077b** on `feat/171-m6b`: T1 to T7 merged, plugin 0.30.0, the Linux runtime
  `cua-linux-x64-e0.4.5-n24.22.0-s0.163.0-mb71dc1f8185d` (arm64 likewise), engine 0.4.5 pinned.
- **The older cua** is main **854103aa58b56521ba85afb4b392e1f3c5a8287d**, the cua before M6b (`APPROVED_OLDER`). On
  every leg its real install made the upgraded home (F11), and its own doctor passed that home's `runtime.vendor` row.
- **Evidence only.** This branch, `m6b-t8`, adds files under this directory and nothing else.

## Acceptance 13's cells: every cell passes on all three legs

The driver is `scripts/accept/linux-runtime.mjs` (T6), run inside `scripts/accept/linux-runtime-env.sh`'s environment:
a private Xvfb with Openbox, a private session bus, accessibility on, and the run's own homes. Each leg ran the full
selection (`--phases E,U`) with 20 first-answer samples a side. Every cell's verdict is the driver's own judge.

| Leg | Where | Report | When (UTC) |
|---|---|---|---|
| x64 | dc-linux171-1e68, a private display, `locked.sh t173 timeout -s TERM -k 60 75m` | [x64/runtime.json](x64/runtime.json) | 18:58 to 19:17 |
| arm64 | hosted `ubuntu-24.04-arm`, run [46052854181](https://github.com/SSFSKIM/cua/actions/runs/46052854181), job `acceptance 13 arm64` | [arm64/runtime.json](arm64/runtime.json) | 18:54 to 19:14 (the job) |
| x64, the hosted control | hosted `ubuntu-24.04`, the same run, job `acceptance 13 x64` | [x64-hosted/runtime.json](x64-hosted/runtime.json) | 18:54 to 19:14 (the job) |

The hosted run was dispatched on `feat/171-m6b` with `commit` set to H and `older` set to 854103aa5. Both jobs concluded
`success`.

| Cell | What it shows | x64 | arm64 | x64 hosted |
|---|---|---|---|---|
| E0 | `cua install` at H in an empty home, under the fetch log and the trace | PASS | PASS | PASS |
| E1 | the item 1 smoke and the item 6 witness, plain and traced | PASS | PASS | PASS |
| E2 | the browser-only session, plain and traced, and the profile map's loader | PASS | PASS | PASS |
| E3 | the vendor selected by the variable, by `engine.json` and by both, and a 0.4.4 override: under each of the four, the open and doctor refused. Under `CUA_NATIVE_ENGINE=vendor`, a browser-only session passes and `cua install` places every part, then exits `engine_retired`; with the variable unset, a session opens | PASS | PASS | PASS |
| U0 | the upgraded home before any install: the item 1 smoke traced, then the vendor selection | PASS | PASS | PASS |
| U1 | doctor, plain and traced: E0's rows plus `runtime.retired`, `skip` | PASS | PASS | PASS |
| U2 | `cua install` with two entries added to `runtimes/` | PASS | PASS | PASS |
| U3 | doctor; E1 and E2 plain; install again | PASS | PASS | PASS |
| U4 | a copy of the release whose record has one hash digit changed: not named | PASS | PASS | PASS |
| U5 | a copy with no `install.json`: not named | PASS | PASS | PASS |
| Verdict | | `{pass, scope: full, acceptance: true}` | the same | the same |

Every traced run used `strace -f --seccomp-bpf` (`TRACE_ARGS`). Each leg's `traces.txt` holds every traced run's
process-path witness beside its counts: [x64](x64/traces.txt), [arm64](arm64/traces.txt),
[x64 hosted](x64-hosted/traces.txt). The witness is each program a successful exec ran, by path, with a count. All 18
traced runs on each leg are whole: no unread line and no orphan.

### What the witnesses show (x64; the hosted legs alike)

- **The fetch log, and its control.** The older cua's install, logged the same way, fetched the vendor's deb in full:
  559,026,979 bytes in all on x64, 535,657,124 on arm64. E0's log holds exactly this arch's 26 pinned assets (the 23
  tarballs, the helper, Node and the engine): 84,128,025 bytes on x64, 82,179,426 on arm64. None was asked of OpenAI,
  and none answered from there.
- **E0's trace.** The install executed `node` ×2, `gzip` and `tar`, and no `ar` or `xz`. Its one call under
  `runtimes/` is retired-tree's `lstat` of the absent directory. Doctor was ok, with none of the vendor rows. `file -bL`
  says the engine is statically linked (item 9).
- **E3's opens and doctor runs.**
  - Under each of the three vendor sources, the open executed `node` and `git` only.
  - Under the same sources, doctor executed `node`, `git`, `dbus-send` ×2, `xdpyinfo`, and `bwrap` with `true` (the
    `sandbox.userns` probe).
  - Under the 0.4.4 override, each open and each doctor run executed exactly one more program: the override's
    `cua-engine`, run with `--version`.
  - Every sentence and hint equals its literal, built from H's installer.
- **U1's doctor and U2's installs.** Under `runtimes/` they made 2,675 `lstat`s, 327 directory opens, one open of
  `install.json` and one `fstat` of it. Nothing outside the two release names was touched, and nothing there was
  executed or written. The row reads:

  > cua 0.30.0 no longer uses the vendor's release at `<run>/upgraded/cua/runtimes/26.928.40906-linux-x64` for sessions:
  > 211.1 MB as it is now, where a cua install recorded placing it on 2026-11-27. cua leaves it in place and has not
  > checked what it holds. Before deleting it by hand, check that no older cua (another checkout on this home) still runs
  > from it, and for files added to it

  Its `bytes` equal the driver's own `find` count:

  | Leg | Bytes |
  |---|---|
  | x64 | 211,063,821 |
  | arm64 | 205,071,356 |
  | x64 hosted | 211,063,821 |

### Measured, not judged

| | x64 (VM) | arm64 (hosted) | x64 (hosted) |
|---|---|---|---|
| The older cua's install: seconds, bytes fetched | 32.5 s, 559,026,979 | 26.7 s, 535,657,124 | 32.9 s, 559,026,979 |
| E0's install: seconds, bytes fetched | 6.7 s, 84,128,025 | 3.5 s, 82,179,426 | 2.9 s, 84,128,025 |
| Doctor, E0 against U1 (the walk) | 0.5 s against 0.6 s | 0.4 s against 0.5 s | 0.4 s against 0.4 s |
| Serve start to a first answer at H, median of 20 [min, max] | 748 ms [712, 820] | 613 ms [600, 631] | 491 ms [482, 501] |
| The same under the older cua | 762 ms [686, 906] | 587 ms [562, 614] | 489 ms [482, 504] |
| H minus the older cua | −14 ms | **+26 ms** | +2 ms |

- **arm64's first answer.** T6's hosted pilot measured 635 ms against 580 (+55 ms), over §5.2's line of about 50 ms.
  This counted run measures +26 ms, so the pilot's difference did not hold. No second sample was taken; the brief asked
  for one only if the difference held.
- **The offset predates M6b.** M6a's counted arm64 run read +22 ms against the cua before M6a
  ([m6a/README.md](../m6a/README.md), "Serve start to first answer"). Neither run reaches the line. x64 shows no
  difference on either venue.

## The x64 regression at H (§5.2)

Each part ran once, counted (`LABEL=counted`, a clean tree), through the gate's runner
`scripts/linux-engine-gate/suites.sh`. It ran on the private desktop `:1` under `locked.sh t173 timeout -s TERM -k 60
<N>m`, with `ENGINE=installed` and `DEVICE=cua-171`. Every home was the run's own. Before each part, the pinned rule
checked that part's home: the pin's x64 bytes `ef714179…119a`, the attestation of release run 45335176072, and
`native/linux-engine` as at 77ed101d4.

| Part | What | Result | Evidence |
|---|---|---|---|
| R1 | repl-parity's native suite, cua lane, by its own verdict (`parity-verdict.mjs`); `PARITY_HOME` a home H's `cua install` made in a fresh `HOME` and `CUA_HOME`, with no `runtimes/` ([source-install.json](x64/regression/source-install.json)) | **PASS:** the lane exited 0, complete, 34 cases, 34 covered, assertions PASS. Both text cases (`native/app/typetext`, `native/app/paste`) are positive. Each of the 20 native cases was answered by its own scratch capability home's `cua-engine` under the trusted worker. The prepared home passed the pinned rule, and cleanup exited 0 | [x64/regression/parity/](x64/regression/parity/verdict.json) |
| R3, default | `scripts/accept/linux-native.mjs`, `SELECTION=default` | **PASS:** 14 of 14 steps. Doctor says the default selected `cua`. The engine watch shows only the run home's `cua-engine`, under the trusted worker, and no `sky_linux` | [accept-default/](x64/regression/accept-default/accept-linux-native-cua.json) |
| R3, `CUA_NATIVE_ENGINE=cua` | the same, explicit | **PASS:** 12 of 12 steps, with the same engine watch | [accept-explicit/](x64/regression/accept-explicit/accept-linux-native-cua.json) |
| R4 | `scripts/accept/linux-device-mode.mjs`, `SELECTION=default` | **PASS:** 20 of 20 steps, the negative controls among them, with the same engine watch | [device/](x64/regression/device/device-mode.json) |
| fallback | the five homes, `SELECTION=default` | **PASS, 5 of 5.** Each was refused by doctor and by an open, for its own reason, ending with ``: run `node <H's checkout>/bin/cua.mjs install --engine` ``: none was `engine_not_installed`; previous (0.4.3), released (0.4.0) and older (0.3.0) were `engine_outdated`; unrecorded was `engine_unrecorded` | [fallback/](x64/regression/fallback/none.json) |
| FB | below, on the fixture alone | **PASS** | below |

The part logs are in [x64/regression/logs/](x64/regression/logs/r1.log.txt). R1's log ends with `cleanup exit 0`. The
chain's own log is [x64/chain.log.txt](x64/chain.log.txt). The logs end in `.log.txt` because the repository ignores
`*.log`.

The chain's first pass at 19:17 failed every regression and fixture phase at its start. `xprobe`, the harness's X
client, had not been built in this new worktree. That was my setup, and it ran nothing: each phase stopped at its own
precondition. Its logs are [x64/setup-fail-1/](x64/setup-fail-1/r1.log.txt):
- `private-desktop` refused to start its watchdog;
- the gate refused "the harness's X client is not built".

`chain.log.txt` marks the end of that pass and the rerun after it. The client was built (`cargo build --release`), and
every phase then ran from 19:19. Every counted result here is from that rerun.

**#558's and #565's first counted runs** (§5.3) are these:

- R1's cua lane reads its trees through #558's renderer.
- R1, R3 and R4 run through #565's framing, and so do E1 and U3 on all three legs.

All of them pass.

## The differential harness on the fixture alone (§4.4, §5.2)

- **The fixture was verified first,** before any step ran ([x64/fixture/fixture-verify.txt](x64/fixture/fixture-verify.txt)):
  - `sha256sum -c` of the tar: `2e620986…5914`, 214,425,600 bytes;
  - `tree-sha256.txt`: `7886c5dc…b54f`, 2,345 lines;
  - `fixture-check.mjs` and `verifyVendorFixture` against `scripts/linux-engine-gate/vendor-fixture.json`: every
    extracted file checked.
- **The two steps** ran through `gate.mjs run <step> --pinned <source home> --vendor-fixture
  ~/.local/share/cua-171/vendor-x64-pinned --newest <26.1023's sky_linux_x64>`. These are counted runs, labelled
  "acceptance on the pinned release": the pinned rule checked the engine's bytes and attestation.
- **The homes.** `HOME` and `CUA_HOME` were the source home, which holds no `runtimes/`
  ([bindings.txt](x64/fixture/bindings.txt)).

| Step | Plain | Traced (`strace -f -qq --seccomp-bpf -e trace=%file`) | Lines naming a `runtimes/` path |
|---|---|---|---|
| E1, the events experiment | exit 0, complete; every judged desktop group faster than the faster vendor build or within the bound ([summary](x64/fixture/plain/E1/summary.md)) | exit 0, complete ([summary](x64/fixture/traced/E1/summary.md)) | 0 of 225,615 |
| FB, the over-budget scene through the facade | exit 0: 10 of 10 steps pass, the two services equal on every step, and the truncation line judged in each lane ([summary](x64/fixture/plain/FB/summary.md)) | exit 0, the same 10 of 10 ([summary](x64/fixture/traced/FB/summary.md)) | 0 of 160,247 |

The bindings come from each step's `step.json` (`vendor_fixture`) and from the traced runs' process-path witness
([E1](x64/fixture/traced/E1/process-paths.txt), [FB](x64/fixture/traced/FB/process-paths.txt)):

- **E1.** The step ran the fixture's `sky_linux_x64` 511 times, `7ac3c2ae…f1cd`, the list's hash. It ran the newest
  build 511 times, from its own path outside the fixture, `88ce5e0a…2991`. It ran the source home's `cua-engine` 512
  times, `ef714179…119a`, the pin's x64 hash. No other `sky_linux` ran. It opened the fixture's `service.js` once.
- **FB.** The step ran the source home's `cua-engine` 5 times and no vendor binary, since both services drive cua's
  engine by design. `--vendor-js` is the fixture's `@oai/sky`, whose `service.js` is the list's `5b2fa2f0…5993`, opened
  twice.
- **Both steps** also ran a copy of the engine once, at `/tmp/cua171-candidate-*/cua-engine`. That copy is the pinned
  rule's check of the bytes and their `--version`. What the step measured is the installed file itself.

E1's speed verdict is reported here and not judged (§5.2). It passed in both runs.

## The gates at H

| Run | Selection | Gates that ran | Result |
|---|---|---|---|
| `ci-gate 3722f2826…` | its own, by the changed files | harness-dbus, plugin, sandbox-live, engine-swift, parity-browser, **test-1**, **test-2**, sandbox-denials: all PASS | **GREEN**, [run 46052942014](https://github.com/SSFSKIM/cua/actions/runs/46052942014) ([log](ci-gate-default.log.txt)) |
| `ci-gate 3722f2826… --gates engine-linux` | by name (N8) | engine-linux: PASS in 10m45s | **GREEN**, [run 46056294731](https://github.com/SSFSKIM/cua/actions/runs/46056294731) ([log](ci-gate-engine-linux.log.txt)) |

`engine-linux` ran by name and passed, so N8's fallback (citing #585's pass) is not needed. [credit.txt](credit.txt)
§5 still records that `git diff 854103aa5..H` over the gate's three paths prints nothing.

## Items 1 to 10 (§5.3): what reran and what is cited

**Rerun at H:**

- item 1: E1, U0 and U3 on three legs, R3 by default and explicit, and R1's engine binding;
- item 9: E0 on three legs;
- item 10: R1's cua lane, R3, R4, `test-1`, `test-2` and `engine-linux`.

Items 2 to 8 are cited cell by cell from M5's per-item table ([m5/README.md](../m5/README.md#L213), L213–225). Each is
bridged to H by the table after the next one.

**What M5 counted.** Each cell stands on the release the table gives it. H to H8 are M5's heads, and "the events step"
is the gate's `E1`.

| Item | x64 | arm64 | In M6b |
|---|---|---|---|
| 2, the same answers | V1–V4 on 0.4.1 at H⁗; V5 on 0.4.3 at H8, 52 of 52; the events step on 0.4.1 ([m5/x64/README.md](../m5/x64/README.md#L539), [L1396](../m5/x64/README.md#L1396), [L578](../m5/x64/README.md#L578)) | V1–V4 on 0.4.1 at H⁵; V5 on 0.4.3 at H8; the events step on 0.4.0 at H‴ ([m5/arm64/README.md](../m5/arm64/README.md#L489), [L1213](../m5/arm64/README.md#L1213), [L200](../m5/arm64/README.md#L200)) | cited; the events step also ran again at H on x64, from the fixture (above) |
| 3, at or below the bar | the seven operations on 0.4.1; Chrome's canvas and thumb, D1 on 0.4.3 at H8 ([summary](../m5/x64/h8/out/D1.pinned-release/run/summary.md)); Electron's thumb, D2 on 0.4.2 at H6 ([summary](../m5/x64/h6/out/D2.pinned-release/run/summary.md)); Firefox's canvas, D3 on 0.4.0 at H; desktop moves, the events step on 0.4.1 | the same steps: 0.4.1 at H⁵; D1 at H8 ([summary](../m5/arm64/h8/out/D1.pinned-release/run/summary.md)); D2 at H6 ([summary](../m5/arm64/h6/out/D2.pinned-release/run/summary.md)); D3 and the events step on 0.4.0 at H‴ | cited |
| 4, the same elements | V2 on 0.4.1 ([L540](../m5/x64/README.md#L540)); the truncation line through the facade, FB on 0.4.0 at H ([L176](../m5/x64/README.md#L176)) | V2 on 0.4.1 ([L490](../m5/arm64/README.md#L490)); FB on 0.4.0 at H‴ ([L199](../m5/arm64/README.md#L199)) | V2 cited. **FB reran at H on x64 and passes** (above). arm64's FB is task 165's run, below |
| 5, background left alone | V1–V5 and Z0 on 0.4.1; V5 on 0.4.2 at H6 and on 0.4.3 at H8 ([L630](../m5/x64/README.md#L630), [L962](../m5/x64/README.md#L962), [L1396](../m5/x64/README.md#L1396)) | V1–V4, Z0 and V5 on 0.4.1; V5 on 0.4.2 and on 0.4.3 ([L497](../m5/arm64/README.md#L497), [L712](../m5/arm64/README.md#L712), [L1213](../m5/arm64/README.md#L1213)) | cited |
| 6, text arrives once | V1 and V4 on 0.4.1 ([L539](../m5/x64/README.md#L539), [L542](../m5/x64/README.md#L542)) | V1 and V4 on 0.4.1 ([L489](../m5/arm64/README.md#L489)) | cited through M6a's F10 credit ([m6a/f10-credit.txt](../m6a/f10-credit.txt)). Its witness reran on all three legs (E1, U3), and so did R4's case on x64: all pass |
| 7, identity and minimized | V3 on 0.4.1; V5 on 0.4.3; R1's case on 0.4.0 ([L541](../m5/x64/README.md#L541), [L172](../m5/x64/README.md#L172)) | the same ([L491](../m5/arm64/README.md#L491), [L195](../m5/arm64/README.md#L195)) | cited; R1's minimized case reran at H on x64 and passes |
| 8, device mode | V4 on 0.4.1; V5 on 0.4.3; P1–P6 and R4 on 0.4.0 ([L542](../m5/x64/README.md#L542), [L186](../m5/x64/README.md#L186), [L175](../m5/x64/README.md#L175)) | the same ([L492](../m5/arm64/README.md#L492), [L209](../m5/arm64/README.md#L209), [L198](../m5/arm64/README.md#L198)) | cited; R4 reran at H on x64 and passes |

**The reach inside M5.**

- Steps that stand on 0.4.0 to 0.4.2 do so under rulings 827, 828, 929 and 990: 0.4.1 to 0.4.3 changed only how a drop
  is confirmed and ended ([m5/README.md](../m5/README.md#L243), L243–246).
- Main's 34 commits during the acceptance stand under ruling 1089 (L248).
- The acceptance itself is ruling 1090's.
- T10's runs at the flip commit are in [m5/t10/README.md](../m5/t10/README.md#L87).

**The bridges from there to H.** Every file the change touched is assigned to a row, with its output, in
[credit.txt](credit.txt) §6: 33 files, none without a row.

| Since M5 | What it changed | The bridge | In M6b |
|---|---|---|---|
| #493, #494, #503 (435420cce, c02bbaea9, a14d5c1d7) | the browser's ids and first-use document, the macOS agent-cursor document and the loader both platforms share, two lines of `core.md`, the host's identity string | in M6a's head: its R1 on both lanes with a diff of 0, and its R3 and R4 at f41546d08 ([m6a/README.md](../m6a/README.md#L80)) | cited; R1's cua lane, R3 and R4 reran at H and pass |
| #526 (cf02ca3c5) | the macOS renderer and two macOS documents | its file list: a Linux session reads `core.md`, then `linux-engine.md` | cited |
| 0.4.4 (#516, da927265e) | the Electron drop's settle rest, the handle end's settle and tail | its reach at H9 = cd03a47b ([engine-044/reach/](../engine-044/reach/)); text-neutral by [m6a/f10-credit.txt](../m6a/f10-credit.txt) | cited |
| #558 (0e7f3de4a) | the Linux facade's tree text: VT, FF, U+001C to U+001E, NEL, LS and PS as escapes | `test/cua-api/facade-scenarios.mjs`, `test/cua-api/core-documentation.test.mjs` and `test/services-engine-render.test.mjs` in `test-1`/`test-2`, GREEN at H | **FB reran at H and passes**, and so does R1's cua lane, which reads its trees through this renderer. No vendor diff on it is claimed |
| M6a (#568, cb9973e82) | the runtime, launch, install, doctor | acceptance 12 ([m6a/README.md](../m6a/README.md)) | items 1, 9 and 10 reran (above) |
| #565 (f6a6002ef) | one JSONL framing for the host, the kernel, the worker and the service's two pipes | `test/repl-host/jsonl.test.mjs`, `test/repl-host/line-separators.test.mjs`, `test/mcp-server.test.mjs`, `test/mcp-upstream.test.mjs` and `test/linux-engine-diff/engine-stats.test.mjs` in the gates | **the lanes through the host reran at H:** R1's cua lane, R3 and R4 on x64, and cells E1 and U3 on three legs. These are its first counted runs, and all pass |
| 0.4.5, #512 (854103aa5) | a Chrome drop whose path overran takes the after-path tail, and a dropped visit answers unconfirmed | its reach at H10 = 2c66966bd ([engine-045/reach/x64/](../engine-045/reach/x64/), [engine-045/reach/arm64/](../engine-045/reach/arm64/), [engine-045/x300-arm64/](../engine-045/x300-arm64/)) | cited |
| 0.4.5, #572 | `wire.rs`: every line the engine writes carries U+2028 and U+2029 as escapes | the engine's own tests, required in `engine-linux` | cited; `engine-linux` ran at H and passes |
| M6b | the selection, install, doctor, the harness | – | rerun (above) |

**arm64's FB** (1217, N9) is task 165's run: the gate's FB on the arm VM at main 854103aa5. Its evidence is on branch
`m6b-fb-arm64` at f18235d8e, under `docs/evidence/2026-10-28-own-linux-engine/m6b/fb-arm64-main/`. Its commit says every
step passes. It is cited as arm64's witness for item 4's facade half, and T9 fills its result in here.

**The credit check** ([credit.txt](credit.txt)) passes:

1. `git diff --stat linux-engine-v0.4.5 H -- native/linux-engine` prints nothing.
2. Both hashes of `runtime/engine/linux-engine.json` equal the release's asset digests (`gh release view`).
3. `git diff 854103aa5 H` over the service, the facade, the host and `docs/cua-api` prints nothing.
4. The da7585c31..854103aa5 stat lists 33 files, and each is assigned to a row of the bridge table above.

**Item 10 in full.**

- **Rerun at H on x64:** R1's cua lane by its own verdict, R3 and R4.
- **Rerun by `ci-gate`:** `test-1`, `test-2` and `engine-linux`.
- **Cited, for the diff against the vendor lane:**
  - R1 counted on 0.4.0 at H and H‴ ([m5/README.md](../m5/README.md#L224));
  - T10's flip checks on 0.4.3 ([m5/t10/README.md](../m5/t10/README.md#L97));
  - M6a's run on 0.4.4 at f41546d08, x64, a diff of 0 with its 3 declared defects.
- **Cited, for `compare --engines`:** R2 counted on 0.4.0, and T10's on 0.4.3.
- No vendor diff on the code at H is claimed.

## The provenance records, again at H

[provenance.txt](provenance.txt) is T4's record. This task added one section at its end: `scripts/modules-pin.mjs` on
both real debs again, at H. The written `runtime/modules/provenance.json` is H's file byte for byte (`9f18d46c…c9d1`),
and the tree stayed clean.

## Where the rest is

- **Scripts.** [x64/scripts/](x64/scripts/t8.sh) holds every phase: `t8.sh` and `chain.sh`. It holds the evidence
  collectors too: `credit.sh`, `credit-files.sh`, `witness.mjs`, `fx-witness.sh`, `collect.sh`, `prov-append.sh` and
  `fw1-logs.sh`.
- **`chain.sh`, as fixed in fix wave 1.** It now builds `xprobe` in its default sequence. It does not run the
  regression or fixture phases without that build, and it exits nonzero when any phase fails or is skipped. The
  counted run used the earlier version, with `xprobe` named in `STEPS` for the rerun.
- **The citation check.** `cites.mjs` and its output `cites.txt` cover every path this README cites. The check reads
  the README from a commit and looks for each path in that commit's tree, never in a working tree. `cites.txt` names
  the commit it checked, and that commit is the one before the file's own.
  - Two targets are not in that tree: task 165's directory, which exists at f18235d8e, and two case ids, which are not
    paths.
  - `cites-c9eb8cf79.txt` is its negative control. The first evidence commit misses four links, the logs that
    `.gitignore`'s `*.log` kept out of it.
- **Raw streams.** These stay on dc-linux171-1e68 under `~/.local/share/cua-171/t173/run/`: the strace files, the
  fetch logs, each fixture's own report, and E1's `results.jsonl` and `settle-counts.json`.
- **The default home.** This VM's default home still holds its vendor tree (1216). No step here read it: every traced
  run says so.
