# #171 M4 T18: the facade suites on the final sources

DRAFT. The pilots are below. The counted runs come once the T18 executor names the final head; their results replace
the pilot tables here.

On the #171 VM (`dc-linux171-1e68`, Ubuntu 24.04, x86-64, 8 vCPU). The suites are Acceptance 10's facade suites and
T18's row:
- repl-parity's native suite on both engine lanes, with `getaxstate/minimized`, and its diff against
  `scripts/repl-parity/expected/native-linux.json`;
- native-baseline on both lanes, then `compare --engines`;
- `scripts/accept/linux-native.mjs` with `CUA_NATIVE_ENGINE=cua`;
- `scripts/accept/linux-device-mode.mjs`;
- the two-services instrument (`scripts/linux-engine-diff/services.mjs`), whose over-budget row carries the truncation
  line.

## The change of venue

**M3 ran these suites through device `cua-171` on the person's `:0`, with the `me` profile bound for repl-parity's
preparation and the acceptance fixtures in the default home. M4 runs them on a private display with run-owned homes and
no profile, so the numbers are not like for like with M3's.**

What each suite runs on:
- **The display.** It is the harness's own private X server (`startPrivateServer`: Xvfb `-displayfd`, 1280x800x24,
  watched by the run watchdog and marked `CUA171_PRIVATE_DISPLAY`) with Openbox. It is never `:0`. Each suite's
  `session.json` names the display and records the watchdog's verdict.
- **The session.** repl-parity, native-baseline and both acceptance fixtures run under a session bus of the run's
  (`startPrivateSession`), which can start only the accessibility bus launcher and has accessibility switched on. The
  two-services instrument starts its own session, as its `Desktop` does on any private display.
- **Profiles and homes:**
  - repl-parity prepares with `--native-only`: no profile listing, no Chrome backend alias, profile null. Its native and
    fixture serves bind no profile in M3 either.
  - native-baseline installs into its own home, as before.
  - `linux-native.mjs` and `linux-device-mode.mjs` run in a run-owned HOME, XDG directories and CUA_HOME, with an empty
    `~/.config/claude-secrets` seeded, so the confinement check still probes a real store.
  - The services instrument keeps the differential harness's own run-profile Chrome (`chrome.mjs`).
- **The engine.** It is a musl build of the final head made the release workflow's way, named by `--engine-bin` and
  `CUA_LINUX_ENGINE_BIN`. The installed engine is 0.3.0, which the service refuses.

## Harness changes (fe0a26b4, cf785980, 75377a53, 41070184)

Only the last one changes what a suite judges, and the coordinator accepted it with conditions.
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
- `discoverDesktopEnvironment(fs, {display})` (`scripts/repl-parity/desktop.mjs`) takes the session on the named
  display. Before, it took the first openbox in `/proc`, which is the person's.
- repl-parity's device shells (`topology.mjs` `linuxSessionFor`) name the controller's `CUA_PARITY_DISPLAY`, which must
  be `:N` and never `:0`.
- native-baseline's `--display` now names the session the run takes. Before, it only asserted it.
- `repl-parity prepare --native-only` is for a declared Linux device and refuses `--profile`. A run refuses any suite
  but `native` on such a preparation. The engine-lane diff does not compare `meta.profile`.
- The runner, in `scripts/` beside this file:
  - `private-desktop.mjs` brings the private desktop up around one suite and down after it.
  - `facade.sh` runs the five parts.
  - `watch.mjs` is M3's 50 ms process sampler.
- **Not changed, and worth knowing:** `linux-native.mjs`'s confinement check probes `$XDG_RUNTIME_DIR/bus`, which is the
  person's session-bus path, not the run's private bus. It still shows that the kernel cannot connect to a session bus,
  but not to this run's bus.

## Pilots (not counted)

Engine `cua-engine 0.4.0 (cc18a6f7cd58)`, SHA-256 `df5a257a3ea1f496e56dcc5a291e526e8baa1c9fe23abc41f5556f9ad6a822ab`,
built from cc18a6f7. The harness heads were cc18a6f7 for accept, 75377a53 for services, and 41070184 for parity and baseline. The later two
change only the runner and the judge. The tree was clean apart from this draft.

| suite | result |
|---|---|
| `linux-native.mjs` | PASS, 11 of 11 steps. sky_linux was never seen. Both cua-engine processes were the build, children of the run home's supervisor and trusted worker. Private `:1`, watchdog clean |
| `linux-device-mode.mjs` (earlier pilot, fe0a26b4, engine 292b6509) | PASS, 18 of 18 steps. sky_linux 0. Every cua-engine was the build. Watchdog clean |
| two-services | PASS, 26 of 26 steps. On the over-budget page, `truncated {nodes 1263, depth 2, failed 0}`, line 1265 |
| repl-parity native | vendor lane complete, `RECORDED_VENDOR_DEFECT`: 31 of 34 cases covered, 3 declared defects (typetext, paste, getaxstate/minimized). cua lane complete, **PASS**, 34 of 34. `diff --expected native-linux.json`: **ok**, 0 differences. The prepared preparation's profile was null; the session was the private `:1` with the run's bus |
| native-baseline `compare --engines` | **VERDICT: PASS**, "both sides are complete, attested and comparable". Medians, vendor against cua: getAXState 504.3 / 97.0 ms, getScreenshot 664.8 / 118.4 ms, bind.getApp 601.6 / 143.0 ms, task.total 18715.6 / 5033.6 ms. typeText and paste: the vendor threw `editable Paste did not insert text` (10.2 s) on every sample; cua returned with the text inserted on every sample (63 and 70 ms) |

## Host lock (`~/.local/share/cua-171/host-lock.log`)

mawsd's render host ran during none of these steps (`render-host=none`).

```
2026-11-12T09:48:53Z acquire task74-w5 load=15.63 6.24 2.47 render-host=none :: facade.sh accept
2026-11-12T09:52:13Z release task74-w5 status=0 load=1.23 3.58 2.14 render-host=none :: facade.sh accept
2026-11-12T10:34:17Z acquire task74-w5 load=1.43 1.10 1.18 render-host=none :: facade.sh services
2026-11-12T10:34:37Z release task74-w5 status=0 load=1.71 1.18 1.21 render-host=none :: facade.sh services
2026-11-12T11:37:04Z acquire task74-w5 load=0.97 1.01 1.17 render-host=none :: facade.sh baseline
2026-11-12T11:58:37Z release task74-w5 status=0 load=0.25 0.41 0.66 render-host=none :: facade.sh baseline
2026-11-12T12:51:06Z acquire task74-w5 load=0.69 0.51 0.72 render-host=none :: facade.sh parity
2026-11-12T13:28:41Z release task74-w5 status=0 load=1.20 1.27 1.22 render-host=none :: facade.sh parity
```

The first parity pilot (11:24Z, judged before the shim fix) failed its cua lane on the shim, as described above. A
rerun at 12:07Z stopped at setup: a longer log path pushed the bus socket path past the Unix limit of 108 bytes. The
counted runs use a short root.

The accept pilot took the lock at a 1-minute load of 15.63, left by the previous holder. That is far above the idle load
(about 0.2 to 1.5), so a counted sitting taken that way would be rerun. A pilot stands as it is.
