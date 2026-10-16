# Viewport series: vendor, own, vendor, own, vendor, own (session ruling after attempt 1's 800×500)

The session ruled on `../attempt-1/`, in which `viewport.set({width: 800, height: 600})` followed by `tab.screenshot()`
returned 800×500. To settle it, the probe ran six more times on the mini, alternating vendor and own host. These are the
ways the results could read:
- **Host defect:** 800×500 appears only on the own host.
- **Environmental or MAWS flake on the mini:** 800×500 appears on the vendor host too, or never recurs.

The probe's earlier pass stands in either case.

## Verdict

**800×500 never recurred: 0 of 6.**
- Vendor host: 800×600 in 3 of 3 runs.
- Own host: 800×600 in 3 of 3 runs.

Every run's verdict was PASS. Under the ruling, attempt 1's 800×500 is an **environmental or MAWS flake on the mini**, not a
host defect.

Counts including attempt 1:
- The own host gave 800×500 once in 6 own runs on the mini (attempts 1–3 and runs 2, 4 and 6).
- The vendor host gave 0 in 3.

## Setup

**What every run shared:**
- MAWS master `688fb0e350fcc71fa9b44b82bdf85cecbfcf7ac5`.
- A fresh scratch clone `~/.local/share/cua-parity-maws/688fb0e3`, with `pnpm install --frozen-lockfile && pnpm build`
  run between jobs, 17:37:13Z–17:38:00Z (`wait.txt`).
- The parity clone `~/Developer/GitHub/cua-parity` at `8a134ab`, clean throughout.
- The probe `run.mjs` and `../probe.sh`, unchanged from the main section.
- `CUA_BROWSER_SERVICE=cua`, `CUA_SHIM_SURFACES=browser`, `MAWS_E2E_QUIET=1`, and `CUA_NODE` unset.

**What differed between runs:**
- **The host.** `CUA_REPL_HOST=vendor` for the vendor runs and `CUA_REPL_HOST=cua` for the own runs.
- **The scratch home.** Each run got its own fresh `cua install` scratch CUA_HOME (`<run>.install.json`), with release
  `26.928.40906-darwin-arm64` and the managed Node 24.22.0. The home was deleted after its run.

`series.sh` drives the series. For each slot it:
1. Waits for two consecutive idle checks, 30 s apart. Each check requires no `Runner.Worker` on either runner and nothing
   queued or in progress on SSFSKIM/MAWS.
2. Runs `probe.sh`, which applies the same idle check at start and again immediately before launch, puts Terminal in
   front, watches for overlap every 5 s, and checks `ps` afterwards.

A refused start, or a slot that overlapped a CI job, would have been rerun with a fresh home. None was: every slot counted
on its first try (`slots.txt`). Run 5 waited from 17:46Z to 18:00Z for a CI job to finish before it launched.

## Results

Full rows are in `series-summary.json`. Each run directory holds its report, attestation records, gate and ps logs.

| Run | Host | Window (UTC) | 1-min load at pre-launch | Screenshot after the 800×600 set | After reset | Verdict | Attestation | Electron quit | Stray processes |
|---|---|---|---|---|---|---|---|---|---|
| `1-vendor-try1` | vendor | 17:38:56–17:39:23 | 7.41 | **800×600** | 1280×800 | PASS | 3 sessions `rmcp 1.5.0`, 22 js answers, none with `cua/replHost` | SIGTERM only, exit 0, 167 ms | none |
| `2-cua-try1` | own | 17:40:38–17:41:01 | 3.43 | **800×600** | 1280×800 | PASS | `attest-cua-summary.json` ok: 3 sessions `cua-repl-host 0.5.0`, marker on all 22 js answers, managed Node `cua-home-aFBTlb/node/24.22.0/bin/node` answering | SIGTERM only, exit 0, 200 ms | none |
| `3-vendor-try1` | vendor | 17:43:17–17:43:40 | 3.67 | **800×600** | 1280×800 | PASS | 3 sessions `rmcp 1.5.0`, 22 js answers, no marker | SIGTERM only, exit 0, 186 ms | none |
| `4-cua-try1` | own | 17:44:57–17:45:20 | 3.35 | **800×600** | 1280×800 | PASS | ok, managed Node `cua-home-AWGdh3/node/24.22.0/bin/node` answering | SIGTERM only, exit 0, 177 ms | none |
| `5-vendor-try1` | vendor | 18:01:14–18:01:38 | 1.87 | **800×600** | 1280×800 | PASS | 3 sessions `rmcp 1.5.0`, 22 js answers, no marker | SIGTERM only, exit 0, 187 ms | none |
| `6-cua-try1` | own | 18:02:54–18:03:16 | 2.01 | **800×600** | 1280×800 | PASS | ok, managed Node `cua-home-AebB0p/node/24.22.0/bin/node` answering | SIGTERM only, exit 0, 178 ms | none |

How each column was judged:
- **Own-host attestation** is the main section's `../attest-summary.mjs`, run with version 0.5.0, the parity clone's HEAD
  and that run's home. Each summary checks that the supervisor which actually answered ran the managed Node under that
  home.
- **Vendor-host attestation** is the vendor control's recorded identity: `serverInfo` `rmcp 1.5.0` and no `cua/replHost`
  marker on any js answer. The recorder's own-host witness correctly finds no own supervisor on these runs.
- **Load** is the mini's 1-minute load from `uptime`, at the pre-launch idle check; full lines are in `<run>/gate.txt`.
- **Overlap:** every `gate.txt` line during every run reads idle, and no `overlap.txt` was written.

## Cleanup

- `ps-final.txt` (18:04:15Z) found no process naming the scratch tree, any Electron binary or the probe's user data, and no
  scratch home left.
- `open -a Terminal` ran after each run and at the end.
- The whole scratch tree `~/.local/share/cua-parity-maws` was deleted.
- The parity clone is still prepared and clean at `8a134ab`. The repl-parity and browser-parity homes
  (`~/.local/share/cua-parity-remote/parity-pmQfYc` and `parity-3nGo8m`) are in place.
- The mini's resident cua, its agent, the runners and Chrome were not touched.
