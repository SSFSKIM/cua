# #115 M0 baseline: the own host's Linux computer session on `cua-gce`

Acceptance 11's third configuration (spec `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`): cua's own REPL host, computer surface, on the GCE box (`../gce-box/`), before any production change. M4 repeats it into `m4/gce-cua-computer/` with the same arguments, and `compare --same-host` judges `cold.miss.first_js` and `cold.hit.first_js` (the permitted differences: the launcher `codex-cli → cua`, TMPDIR `unset → session`, and the Linux sandbox mode `disabled → scoped`).

```sh
node scripts/native-baseline.mjs prepare --device cua-gce --commit aacc675
for n in 1 2 3; do   # each after the box's 1-minute load was at or below 0.30 (sitting-load.log)
  node scripts/native-baseline.mjs run --device cua-gce --experiment 115-m0 --host cua --display :0 --out docs/evidence/2026-10-17-own-sandbox/m0/gce-cua-computer/run-$n
done
node scripts/native-baseline.mjs summary docs/evidence/2026-10-17-own-sandbox/m0/gce-cua-computer
```

**Commit.** The box's parity clone at `aacc6755b46b1898b6b102d32a2a15b6e50e9cd0` (the branch with M0b's reviewed harness and the Linux probes; no production code differs from base). The controller ran the harness from this worktree at the same commit.

**Result.** All three runs complete, every connection attested `cua-repl-host 0.5.0` answering on the run's managed Node v24.22.0; `summary.md` lists no problems. Default plan (5 cold, 30 warm, 10 tasks). The judged rows' medians over the three runs: **`cold.miss.first_js` 666.5 ms** (6 samples, max 689.3) and **`cold.hit.first_js` 773.6 ms** (9 samples, max 992.4). Every row is in `summary.md`.

**Configuration recorded in every `meta.json`:** runtime `26.928.40906-linux-arm64`, fresh in each run's scratch home; sandbox `disabled` (the Linux default with the computer surface, not explicit); launch witness `{launcher: codex-cli, tmpdir: unset}` (prepared serves start from `env -i`); display `:0` 1280 × 800 depth 24; gedit 46.2 under `LANG=C.UTF-8`.

| Run | Started (UTC) | Device load before | Device load after | Controller 1-min load before → after | Complete | Leftovers | Scratch home removed |
|---|---|---|---|---|---|---|---|
| run-1 | 08:32:00 | 0.48, 0.20, 0.18 | 0.16, 0.22, 0.19 | 58.37 → 107.36 | yes | none | yes |
| run-2 | 08:39:02 | 0.47, 0.29, 0.22 | 0.12, 0.16, 0.17 | 127.26 → 111.81 | yes | none | yes |
| run-3 | 08:46:02 | 0.42, 0.23, 0.20 | 0.20, 0.20, 0.19 | 103.57 → 124.62 | yes | none | yes |

"Device load before" is the run's own preflight, taken after its fresh `cua install`; `sitting-load.log` has the sitting's pre-run checks (0.05 to 0.26). **The controller (this MacBook) was heavily loaded by other sessions throughout** (1-minute load 58 to 127); `ssh.roundtrip` medians 2,624 ms. The judged first_js rows are the time of the first cell over an already open MCP connection; M4 should record its controller load beside its own and read any difference against it.

**Notes.**
- typeText and paste end their gedit windows on this box as on `cua-bench` (`method.*` rows; the vendor helper's crash). Run-1's typeText produced the box's first apport report (`meta.gedit.crashReportsAfter`, 08:37:38Z), left in `/var/crash`.
- `method.scroll.pages` throws by design on Linux ("Linux scroll accepts { pixels }, not pages."), as before.
- Only harness-owned gedit windows were bound or typed into; nothing remained after each run.
