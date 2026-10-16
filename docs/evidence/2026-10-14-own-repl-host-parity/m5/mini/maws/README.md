# M5 task 4, MAWS: the unchanged regression and the live probe on the mini

Acceptance 7's MAWS half, under MAWS's gate rule (MAWS gate-offload plan §3.5–3.6, Decision Log 45–46; this spec's
Decision Log "Four rulings shape M5's remaining live work", second bullet). Both runs used MAWS master
**`688fb0e350fcc71fa9b44b82bdf85cecbfcf7ac5`**. Nothing ran on the MacBook except `ci-gate.sh`, which only pushes the
gate's ref and watches the run.

| Item | Verdict |
|---|---|
| (a) `e2e:browser-cua` on the mini's ci runner, run [38936813609](https://github.com/SSFSKIM/MAWS/actions/runs/38936813609) | **success**: 7 passed (26.8 s). This is a fake-host regression. It never starts cua, so it is **not own-host evidence**. |
| (b) MAWS live probe, own host, attempt 1 | FAIL, on `viewport` only. Kept as a labelled diagnostic (see below). |
| (b) MAWS live probe, own host, attempts 2 and 3 | **PASS**, every check passing. Attested `cua-repl-host 0.5.0` at parity clone `8a134ab` on the managed Node v24.22.0 under the scratch home. Electron quit cleanly. |

## (a) The unchanged regression

The gate ran from a throwaway worktree, `git -C MAWS worktree add --detach /tmp/maws-cua-m5gate origin/master`, made
after a fetch. The MAWS main checkout was not touched.

```sh
scripts/ci-gate.sh 688fb0e350fcc71fa9b44b82bdf85cecbfcf7ac5 --gates e2e:browser-cua --label cua-m5
```

- The script pushed `ci/cua-m5-688fb0e3`, which is the sha plus the script's empty trailer commit `3190f954`.
- Run 38936813609 ran `plan` hosted and `e2e:browser-cua` on runner `ci-kit-mac-mini`, 17:04:17Z–17:05:51Z. The pre-job
  check read `frontmost is 터미널`.
- Conclusion: success, 7 passed. Every other job was skipped.
- The script deleted the ref (`ci-gate: removed ci/cua-m5-688fb0e3`), and `git ls-remote` confirmed it was gone.
- The worktree was removed afterwards.
- Transcript: `/tmp/maws-review/gates/ci-688fb0e3.log`, copied here as `ci-gate-e2e-browser-cua.txt`.

## (b) The live probe

Everything ran on the mini over `ssh -o BatchMode=yes mini`, in a scratch tree `~/.local/share/cua-parity-maws/`. That
tree is outside TMPDIR and outside both runners' `_work` directories, and it was deleted afterwards.

- **MAWS clone**: `~/.local/share/cua-parity-maws/688fb0e3`.
  - It was cloned from GitHub and detached at `688fb0e3`, with a clean tree.
  - `pnpm install --frozen-lockfile && pnpm build` ran between jobs, 17:09:55Z–17:10:44Z (`gate.txt`). It produced
    `out/main/index.js` and the Electron binary.
- **Scratch CUA_HOME**: `~/.local/share/cua-parity-maws/cua-home-KKa48r`.
  - It came from a fresh `cua install`, run in the prepared parity clone `~/Developer/GitHub/cua-parity` at `8a134ab`.
  - This is the mechanism `scripts/repl-parity/remote-device.mjs` `prepareEndpoint` uses:
    `env -u CUA_NODE CUA_HOME=<home> HOME=<home>/home node bin/cua.mjs install --json`, with the default pinned sources.
  - The record is in `cua-install.json`: release `26.928.40906-darwin-arm64`, managed Node `24.22.0` at
    `<home>/node/24.22.0/bin/node`, both `source: download`.
- **The mini's resident cua was not touched**: `~/Developer/GitHub/cua`, launchd `com.ssfskim.cua.agent` and its
  CUA_HOME. The parity clone stayed clean at `8a134ab`.

### The idle rule

`gate.sh` is the check. It requires all three:
- no `Runner.Worker` under `actions-runner-maws` or `actions-runner-ida-solution`;
- `gh -R SSFSKIM/MAWS run list --status queued` empty;
- `--status in_progress` empty.

`probe.sh` runs each attempt in this order:
1. The check, then `open -a Terminal`.
2. The check again, immediately before Electron launches.
3. The probe, with a watcher repeating the check every 5 s.
4. A final check, `open -a Terminal`, then a `ps` check.

Every attempt's `gate.txt` shows idle from start to end. No `overlap.txt` was written, so no job overlapped a counted
probe.

One start was refused. A first try at attempt 2, at 17:13:01Z, found a run in progress (it then showed as queued:
38937942252 on `ci/h-page-e-fix-1f8c85dc`) and never launched Electron. The attempt waited until three checks in a row
showed idle (`wait.txt`, 17:18:57Z–17:19:59Z), then ran.

### The command

This is the dispatch's command. It ran from the parity clone with no `CUA_NODE`:

```sh
env MAWS_CHECKOUT=<clone> CUA_HOME=<scratch> CUA_BROWSER_SERVICE=cua CUA_REPL_HOST=cua CUA_SHIM_SURFACES=browser \
  MAWS_E2E_QUIET=1 CUA_ATTEST_OUT=<out>/attest-cua.jsonl NODE_OPTIONS=--import=file://<scratch tree>/attest/attest-serve.mjs \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out <out>/maws-live-cua.json
node docs/evidence/2026-10-14-own-repl-host-parity/m5/mini/maws/attest-summary.mjs <out>/attest-cua.jsonl 0.5.0 \
  8a134abb538def03605bc1a52a26d48a5f4cb23c <scratch CUA_HOME> > <out>/attest-cua-summary.json
```

The probe `run.mjs`, its `launch.cjs`, `verdict.mjs` and `maws-features` are unchanged.

### The recorder, adapted for M5

This directory's `attest-serve.mjs` and `attest-summary.mjs` are copies of `../../../m3/maws/`. They are adapted only for
the managed-Node and scratch-home rules:

- **Where it lives.** The recorder is loaded from outside the clone, so the source record's clean-tree check holds. It
  imports the clone's modules from the working directory.
- **The source record.** It resolves the own host's Node with the session's CUA_HOME, as `connection.mjs` does. M3's call
  named no home, so it could not see the managed Node. The record also notes the home and that `CUA_NODE` is unset.
- **The answering process.** On each session's first js answer, the recorder records the process that actually answered.
  It must be exactly one descendant of that `cua serve` whose argv is `<resolved Node> --disable-sigusr1
  <clone>/src/repl-host/supervisor.mjs`. This is the witness the M5 remote endpoints use. The recorder also records that
  Node's `--version` and whether its real path lies under `<home>/node/`.
- **Electron's quit.** The recorder observes Electron's lifecycle as the probe's child: the signals the probe sent it, its
  exit code and signal, and how long after SIGTERM it ended.
- **The summary.** It keeps every M3 requirement. It adds, per session, the expected home, `CUA_NODE` unset, and an
  answering witness on Node v24 under `<home>/node/` that matches the resolved Node. Once per run, it also requires
  Electron to be spawned once, sent SIGTERM and never SIGKILL, and to exit with code 0 and no signal.
- **Mutation check.** Before the run, the summary was checked against synthetic records. It rejected each of these: a
  Node outside the home, a device-side outside verdict, `CUA_NODE` set, a missing witness, a witness version mismatch,
  Electron killed, SIGKILL sent, a stale 0.4.0 marker and a dirty tree.

### Results

| Attempt | Window (UTC) | Verdict | Takeover: default budget / `timeoutMs: 15000` | Attestation summary |
|---|---|---|---|---|
| `attempt-1/` | 17:11:43–17:12:07 | **FAIL**, `viewport` only; the other 11 features PASS, cursor PASS | 3,015 ms, `waiting` / 3,268 ms, `submitted:x` | ok |
| `attempt-2/` | 17:20:08–17:20:29 | **PASS** | 3,014 ms, `waiting` / 3,244 ms, `submitted:x` | ok |
| `attempt-3/` | 17:21:03–17:21:23 | **PASS** | 3,014 ms, `waiting` / 3,277 ms, `submitted:x` | ok |

The verdict's checks all passed in attempts 2 and 3: profiles, service, createTab (profile identity), locator, viewport,
popup adoption, download, alert, confirm, chooser, cleanup and isolation. The cursor message count rose from 0 to 4. The
takeover behaved as #113 M4 recorded and the earlier MAWS probes saw: at the default budget the click is refused at about
3 s while the person holds the tab, and with the raised budget it goes through.

**Attestation** (`attempt-<n>/attest-cua-summary.json`, `ok: true` in all three attempts). Each run had three `cua serve`
sessions:

- The probe's own session, with 11 js answers.
- maws-features' session on socket B, with 1.
- maws-features' session on socket A, with 10.

Each session:
- answered `initialize` as `{name: cua-repl-host, version: 0.5.0}`;
- carried `{host: cua, version: 0.5.0}` on every js answer;
- has one source record: commit `8a134abb538def03605bc1a52a26d48a5f4cb23c`, clean tree, release
  `26.928.40906-darwin-arm64`, home the scratch CUA_HOME, `CUA_NODE` unset.

**The answering Node is the managed executable under the scratch home.** In every session, the witnessed supervisor is
`/Users/new/.local/share/cua-parity-maws/cua-home-KKa48r/node/24.22.0/bin/node --disable-sigusr1
/Users/new/Developer/GitHub/cua-parity/src/repl-host/supervisor.mjs`. That Node reports v24.22.0, and its real path lies
under the home's `node/` (`underHomeNode: true`). It is not the mini's nvm Node v24.18.0 that ran the probe and `cua serve`.

**Electron quit cleanly** (maws-fe's condition). In each attempt the probe sent SIGTERM once and never SIGKILL, and
Electron exited with code 0 and no signal, 171, 166 and 177 ms after SIGTERM. That is `serve-plain.cjs`'s SIGTERM
handler running `app.quit()`. The quiet, click-through window closes with the app.

**No process left.** After each attempt, `ps -axww` found no process naming the scratch MAWS clone, an Electron binary, or
the probe's `/tmp/mcua-m4-*` user data (`attempt-<n>/ps-after.txt`). It found none again at 17:22:14Z before cleanup, also
searching for anything naming the scratch tree, which covers `cua serve` and supervisors on the scratch home
(`ps-final.txt`).

**`mawsInspectAtQuit` is `null`** in all three reports. It was also `null` in M2's and M3's committed reports, so this is
the probe's existing behaviour, not a change.

### Attempt 1's viewport failure (labelled diagnostic, not counted)

`viewport.set({width: 800, height: 600})`, then `tab.screenshot()`, returned an **800×500** image. 800×500 is the parked
1280×800 view's aspect ratio. The reset screenshot was 1280×800, as expected.

Ruled out:
- **CI overlap.** None: idle at start, pre-launch, during and end.
- **A MAWS change.** The MAWS browser agent and cua paths are unchanged between `d45452f1` (M3's MAWS) and `688fb0e3`.

The same clone, home and command then gave 800×600 in attempts 2 and 3. Every earlier committed MAWS probe also recorded
800×600:
- #113 M4 and M5, both hosts;
- this spec's M2 and M3.

Those all ran on the MacBook, so this is the first time the probe has run on the mini.

The viewport capability goes from the facade to cua's browser service to MAWS's `Emulation.setDeviceMetricsOverride`. The
REPL host only relays it. The likely cause is a race in which the screenshot lands before MAWS applies the emulation on a
parked view.

One failure in three is not enough to say whether the vendor host shows the same thing on the mini. Attempt 1 stays
committed as evidence of the intermittent.

### The viewport series (settled: environmental or MAWS flake)

By the session's ruling, `viewport-series/` ran an alternating series on the mini: vendor, own, vendor, own, vendor, own.
- Each run had a fresh managed `cua install` home with `CUA_NODE` unset, and the same idle gates.
- Every run was a counted first try, with a clean quit and no stray processes.

**The 800×600 set gave 800×600 in all six runs:** vendor 3/3, own 3/3. Every verdict was PASS.
- Vendor runs attested `rmcp 1.5.0` with no marker.
- Own runs attested `cua-repl-host 0.5.0` on the managed Node under each run's home.

Under the ruling ("never recurs"), attempt 1's 800×500 is an environmental or MAWS flake on the mini, not a host defect. The
counts, including attempt 1:

| Host | Runs on the mini | 800×500 |
|---|---|---|
| Own | 6 | 1 |
| Vendor | 3 | 0 |

Per-run rows, loads and cleanup are in `viewport-series/README.md`.

## Cleanup

- `open -a Terminal` ran after every attempt and again before deletion.
- Deleted: the whole scratch tree on the mini, `~/.local/share/cua-parity-maws`, which held the MAWS clone, the scratch
  CUA_HOME, the outputs and the recorder copies.
- `/tmp/maws-cua-m5gate` was removed with `git worktree remove`.
- No `ci/cua-m5-*` ref remains on SSFSKIM/MAWS.
- Left as they were: the mini's resident cua and its agent, the runners, Chrome, and the repl-parity and browser-parity
  preparations (`../README.md`, "Left in place").
