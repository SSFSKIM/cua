# #171 M4 T18: the facade suites on the final sources

On the #171 VM (`dc-linux171-1e68`, Ubuntu 24.04, x86-64, 8 vCPU), 2026-11-13, at the final head **8ab1cc75**, with the
tree clean. Every suite ran on that one head and one engine build.

**The engine:** `cua-engine 0.4.0 (8ab1cc758983)`, SHA-256
`17a3893ed543bd05e99e2938a77d7c875a9bb80c79da19d7f9443f772539ac5f`, static-pie (`engine/`). It is a musl build of
8ab1cc75 made the release workflow's way: `cargo build --release --locked --target x86_64-unknown-linux-musl`, a
hermetic Cargo home, the remapped paths, the commit stamped, then stripped. It was named by `--engine-bin` for the
suites and by `CUA_LINUX_ENGINE_BIN` for the fixtures. The installed engine is 0.3.0, which the service refuses
(`MIN_ENGINE_VERSION` 0.4.0).

## The change of venue

**M3 ran these suites through device `cua-171` on the person's `:0`, with the `me` profile bound for repl-parity's
preparation and the acceptance fixtures in the default home. M4 runs them on a private display with run-owned homes and
no profile, so the numbers are not like for like with M3's.**

What each suite runs on:
- **The display.** It is the harness's own private X server (`startPrivateServer`: Xvfb `-displayfd`, 1280x800x24,
  watched by the run watchdog and marked `CUA171_PRIVATE_DISPLAY`) with Openbox. It is never `:0`. Every suite ran on
  `:1`. Each suite's `session.json` names the display, its environment, and the watchdog's verdict, which was clean for
  all five.
- **The session.** repl-parity, native-baseline and both acceptance fixtures run under a session bus of the run's
  (`startPrivateSession`), which can start only the accessibility bus launcher and has accessibility switched on. The
  two-services instrument starts its own session, as its `Desktop` does on any private display.
- **Profiles and homes:**
  - repl-parity prepares with `--native-only`: no profile listing, no Chrome backend alias, profile null. Its native and
    fixture serves bind no profile in M3 either.
  - native-baseline installs into its own home, as before.
  - `linux-native.mjs` and `linux-device-mode.mjs` run in a run-owned HOME, XDG directories and CUA_HOME (`cua install`
    there), with an empty `~/.config/claude-secrets` seeded, so the confinement check still probes a real store.
  - The services instrument keeps the differential harness's own run-profile Chrome (`chrome.mjs`).
- **What the change does to the numbers.** The private display holds only the run's windows. The vendor engine's
  inventory calls, which on the person's `:0` paid for every window there (M3: `warm.getState` and `warm.listApps` at
  24.3 and 23.8 ms against cua's 16.8 and 17.8), now take about as long as cua's (below).

## Results

| suite | evidence | result |
|---|---|---|
| `scripts/accept/linux-native.mjs`, `CUA_NATIVE_ENGINE=cua` | `accept/` | **PASS**, 11 of 11 steps. Over 3,360 samples of the process table, sky_linux was never seen. Both cua-engine processes were the build, one the trusted worker's child, one the supervisor's launcher shim |
| `scripts/accept/linux-device-mode.mjs` | `device/` | **PASS**, 18 of 18 steps, both negative controls included. sky_linux was never seen. All four cua-engine processes (two per device mode) were the build |
| two-services, `scripts/linux-engine-diff/services.mjs` (gedit, Chrome, over-budget) | `services/run/` | **PASS**, 26 of 26 steps, exit 0. The over-budget row: `getAXState`, `getAXState` after the query and the combined observation each end with the truncation line (`truncated {nodes 1263, depth 2, failed 0}`, line 1265) |
| repl-parity `--suite native`, vendor lane | `parity/vendor/` | complete, `RECORDED_VENDOR_DEFECT`: 31 of 34 cases covered, the 3 declared vendor defects (`app/typetext`, `app/paste`, `getaxstate/minimized`) |
| repl-parity `--suite native`, cua lane | `parity/cua/` | complete, **PASS**, 34 of 34 |
| `repl-parity diff … --expected native-linux.json` | `parity/diff.json` | **ok**, 0 differences. Declared: `linux-text-typetext-m2`, `linux-text-paste-m2`, `linux-getaxstate-minimized-m4` |
| native-baseline, 3 runs a lane interleaved, `compare --engines` | `baseline/`, `baseline/engines.md`, `baseline/engines-acceptance3.md` | every run complete, "Problems: none: both sides are complete, attested and comparable". **VERDICT: FAIL** under the original rule (`warm.getState` and `warm.listApps`, by 0.3 and 0.4 ms), and **VERDICT: FAIL** under Acceptance 3's rule (`warm.listApps` alone, undetermined; below) |

Both repl-parity lanes recorded which engine answered on every native case:
- The vendor lane: `sky_linux_x64`, the trusted worker's child, behind `@oai/sky`.
- The cua lane: the build, the trusted worker's child, behind cua's service. Beside it, the build again as
  `launcher-shim`, the supervisor's child, naming its real parent (judged by 41070184, below).

### The native baseline's comparison, under two rules

The stored records (`baseline/cv/`, `baseline/cc/`) were judged twice. There was no new sitting.

1. **Acceptance 10's original rule** (`baseline/engines.md`, from the counted step): an engine-answered operation failed
   whenever cua's median was above the vendor's. **VERDICT: FAIL**, on `warm.getState` and `warm.listApps`, by 0.3 and
   0.4 ms.
2. **Acceptance 3's speed rule, as the design session ruled** (`baseline/engines-acceptance3.md`, the same records
   re-judged at bc67d611, the commit that adopted the rule): **VERDICT: FAIL**, on `warm.listApps` alone.

| operation (engine-answered) | samples a side | vendor, ms | cua, ms | interval of cua minus vendor, ms | bound, ms | old rule | Acceptance 3's rule |
|---|---:|---:|---:|---|---:|---|---|
| warm.getState | 90 | 17.6 | 17.9 | [-0.122, 0.834] | 1 | **fail** | pass, same (within noise) |
| warm.listApps | 90 | 16.8 | 17.2 | [-0.227, 1.124] | 1 | **fail** | **fail**, undetermined |
| bind.getApp | 3 | 580.6 | 123.3 | (median rule) | | pass | pass |
| warm.getAXState | 90 | 490.6 | 94.8 | [-409.197, -382.225] | 24.53 | pass | pass, faster |
| warm.getScreenshot | 90 | 632.6 | 117.7 | [-531.118, -491.918] | 31.63 | pass | pass, faster |
| task.act | 30 | 16743.6 | 4501.6 | [-12292.949, -12210.384] | 837.18 | pass | pass, faster |
| task.verify | 30 | 585.6 | 192.3 | [-449.001, -380.708] | 29.28 | pass | pass, faster |
| task.clear | 30 | 1320.1 | 308.1 | [-1032.288, -987.975] | 66.01 | pass | pass, faster |
| task.total (the pressKey task) | 30 | 18700.0 | 5003.1 | [-13818.763, -13633.258] | 935 | pass | pass, faster |
| method.typeText | 3 | 10247.9, every sample `editable Paste did not insert text` | 60.7, every sample returned, gedit alive, the text read back | (median rule) | | pass | pass |
| method.paste | 3 | 10231.4, the same failure | 59.9, the same success | (median rule) | | pass | pass |

**How Acceptance 3's rule is applied here** (`scripts/native-baseline/compare.mjs` `linuxEngineSpeed`, Linux only):
- It reuses the gate's own implementation: `scripts/linux-engine-diff/stats.mjs` `judgeSeriesSpeed` over `events.mjs`
  `medianDifferenceInterval` (2,000 rounds, seed 171, unstratified, as the gate's per-operation series are).
- With at least 20 successful samples a side, a series passes only when the upper end of the bootstrap 95% interval of
  cua's median minus the vendor engine's is within max(5% of the vendor's median, 1 ms). It is labelled `faster`,
  `same (within noise)` or `within the bound`.
- A comparison cannot top a series up, so the samples it has are final. An interval that includes 0 but reaches past
  the bound is undetermined, and fails, as Acceptance 3 fails one still undetermined at 40.
- A series with fewer than 20 a side (`bind.getApp` and the method cases, one sample a run) keeps Acceptance 10's
  median rule.
- macOS (#117) is untouched: its comparisons are pinned byte for byte (`test/native-baseline/fixtures/macos-lanes.json`).

**What the remaining FAIL is.** `warm.listApps`'s interval includes 0 and reaches 0.124 ms past its 1 ms bound, so the
rule cannot call it a tie at 90 samples a side. The evidence still points to a tie:
- The per-run medians interleave: cv 17.2, 14.1 and 18.2 ms against cc 17.5, 16.7 and 18.0.
- Inside the cell, cua is faster: 3.43 against 3.88 ms.
- The pilot at 41070184 had cua below the vendor (17.2 against 17.5).
- On M3's `:0`, where the vendor paid for the person's windows, the vendor took 23.8 ms against cua's 17.8.

Neither rule's verdict was rerun to make it pass. Whether to sample further, declare a speed gap, or rule otherwise is
the T18 executor's and the coordinator's call.

## Harness changes (fe0a26b4, cf785980, 75377a53, 41070184)

Only the last one changes what a suite judges, and the coordinator accepted it with conditions.
- `discoverDesktopEnvironment(fs, {display})` (`scripts/repl-parity/desktop.mjs`) takes the session on the named
  display. Before, it took the first openbox in `/proc`, which is the person's.
- repl-parity's device shells (`topology.mjs` `linuxSessionFor`) name the controller's `CUA_PARITY_DISPLAY`, which must
  be `:N` and never `:0`.
- native-baseline's `--display` now names the session the run takes. Before, it only asserted it.
- `repl-parity prepare --native-only` is for a declared Linux device and refuses `--profile`. A run refuses any suite
  but `native` on such a preparation. The engine-lane diff does not compare `meta.profile`.
- **The launcher shim (41070184).** Since T7b fix 4 (81ae2732, task 57), the supervisor starts the trusted worker's
  launcher through `cua-engine launcher-shim <its own pid> …`. That makes the shim a `cua-engine` child of
  `supervisor.mjs` on the cua lane. The engine-answered judge (`scripts/repl-parity/engine-answered.mjs`, which
  native-baseline's judge also uses) took the shim for a stray engine, so no cua lane could pass.
  - A process now counts as the shim only when its own argv[1] is `launcher-shim` and its argv[2] names its real
    parent.
  - A shim is sound only as the lane's expected engine under `supervisor.mjs`.
  - Shims are set aside before the judge checks the answering engine, which must still be the trusted worker's child.
  - The vendor lane's launch sets no `CUA_ENGINE_BIN`, so no shim runs there, and a shim seen there fails.
  - No cua-lane facade pass is claimed after 81ae2732. The only M4 runs with engine observations are T4's
    `m4/minimized/parity*/`, from 2026-11-02, before the shim.
- The runner, in `scripts/` beside this file:
  - `private-desktop.mjs` brings the private desktop up around one suite and down after it.
  - `facade.sh` runs the five parts.
  - `watch.mjs` is M3's 50 ms process sampler.
  - `driver.txt` records the order the counted steps ran in.
- **Not changed, and worth knowing:** `linux-native.mjs`'s confinement check probes `$XDG_RUNTIME_DIR/bus`, which is the
  person's session-bus path, not the run's private bus. It still shows that the kernel cannot connect to a session bus,
  but not to this run's bus.

## Host lock (`~/.local/share/cua-171/host-lock.log`)

Each suite was its own locked step. mawsd's render host ran during none of them (`render-host=none`). Before each step
the driver checked `hold-sittings` and waited for a 1-minute load below 0.8. No load at acquire or release is more than
1.0 above idle, so no step was rerun.

```
2026-11-13T06:13:13Z acquire task74-w5 load=0.80 0.38 0.36 render-host=none :: build-musl.sh 8ab1cc75…
2026-11-13T06:14:05Z release task74-w5 status=0 load=1.33 0.63 0.45 render-host=none :: build-musl.sh 8ab1cc75…
2026-11-13T06:14:43Z acquire task74-w5 load=0.68 0.55 0.43 render-host=none :: facade.sh accept
2026-11-13T06:18:03Z release task74-w5 status=0 load=1.04 0.83 0.57 render-host=none :: facade.sh accept
2026-11-13T06:19:43Z acquire task74-w5 load=0.79 0.86 0.62 render-host=none :: facade.sh device
2026-11-13T06:20:43Z release task74-w5 status=0 load=1.18 0.98 0.68 render-host=none :: facade.sh device
2026-11-13T06:23:13Z acquire task74-w5 load=0.74 1.01 0.74 render-host=none :: facade.sh services
2026-11-13T06:23:35Z release task74-w5 status=0 load=1.31 1.13 0.79 render-host=none :: facade.sh services
2026-11-13T06:24:25Z acquire task74-w5 load=0.71 1.00 0.76 render-host=none :: facade.sh parity
2026-11-13T07:01:58Z release task74-w5 status=0 load=1.29 1.32 1.27 render-host=none :: facade.sh parity
2026-11-13T07:02:48Z acquire task74-w5 load=0.77 1.17 1.23 render-host=none :: facade.sh baseline
2026-11-13T07:24:09Z release task74-w5 status=1 load=0.33 0.51 0.74 render-host=none :: facade.sh baseline
```

## Pilots (before the final head, not counted)

All five suites were piloted on the same kind of private display: on the engine cc18a6f7, and device-mode on 292b6509.
Each passed, the native baseline included (VERDICT: PASS). The first parity pilot failed its cua lane on the launcher
shim, which led to 41070184.
