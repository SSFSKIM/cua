# M5 task 4: the mini sitting (browser-only)

Mini (Mac mini, darwin-arm64), Chrome profile `ssfs` (Profile 1), `CUA_SHIM_SURFACES=browser`, cua browser service on both
hosts. Only the parity clone `~/Developer/GitHub/cua-parity`, over `ssh -o BatchMode=yes mini`; the resident agent and
checkout were not touched.

## Heads

| Role | Commit |
|---|---|
| Product code head (recorded) | `e24a1cd` |
| Oracle head (recorded) | `d49e6da` |
| Prepared clone (branch head, spec-only above d49e6da) | `8a134ab` (every run's `commit`) |
| Expected differences used by the `--suite all` diff | `4d38318` (adds `stat-missing` and `connect-over-limit` to the absolute-path identity entry; data and test only) |

Runs record `harnessCommit` as this worktree's HEAD when they started (`8a134ab`, later `4d38318` and evidence-only
commits); none of those changes `src/` or the runner. Earlier attempts at `86471c6` and `5f188d9` are under
`diagnostics/` and are not evidence for this head.

## Preparation and Node

```sh
node scripts/repl-parity.mjs   prepare --device mini --commit 8a134abb538def03605bc1a52a26d48a5f4cb23c --profile ssfs
node scripts/browser-parity.mjs prepare --device mini --commit 8a134abb538def03605bc1a52a26d48a5f4cb23c --profile ssfs
```

Each creates a fresh `cua install` scratch home with the managed Node; no `CUA_NODE`, no `--node` (`nodeMode: managed`,
`nodeOverride: null`). Harness/cua Node on the mini: v24.18.0; vendor runtime 26.928.40906-darwin-arm64 (its node v24.21.0).
**The own host answered on the managed Node v24.22.0 every time**, at `<answering home>/node/24.22.0/bin/node`:
- repl-parity home `~/.local/share/cua-parity-remote/parity-pmQfYc` and the per-lane capability homes it installs under
  `~/.cp/cua-cap-*` (each also a fresh `cua install` with its own managed v24.22.0);
- browser-parity home `~/.local/share/cua-parity-remote/parity-3nGo8m` (corpus and scripted runs).
Each own connection's `hostAttestations[].answeringHost` records the home and that executable.

## Results

| Item | Command (from this worktree) | Verdict |
|---|---|---|
| Vendor `--suite all`, control | `repl-parity.mjs run --host vendor --device mini --suite all --through M5 --out all-vendor-2` | 479/479 cases pass, complete, 59 connections `rmcp 1.5.0`, no `cua/replHost` |
| Own `--suite all` | `... --host cua ... --out all-cua` | 479/479 pass, complete, 59 connections `cua-repl-host 0.5.0` with the result marker |
| Diff | `repl-parity.mjs diff all-vendor-2 all-cua --through M5 --expected test/repl-parity/expected-differences.json` (`all-diff.json`) | **0 unexpected differences**, 1,380 cells, 1,367 expected (identity slots), all assertions pass. The services suite's `stat-missing` cell is byte-identical on both hosts: `native pipe path unavailable: No such file or directory (os error 2)`, the M5 oracle's vendor sentence; the over-limit connect cell is identical too |
| M5 completeness gate | `CUA_REPL_PARITY_THROUGH=M5 node --test test/repl-parity/inventory.test.mjs` (`inventory-through-m5.txt`) | 8/8; "through M5: 542 due; 542 executable-linked; 0 uncovered" |
| docs-profiles, own host | `repl-parity.mjs run --host cua --device mini --suite docs-profiles --out docs-profiles-cua` | 12/12 pass, 4 connections `cua-repl-host 0.5.0` |
| Browser corpus | `browser-parity.mjs run --device mini --service cua --repl-host vendor\|cua --out corpus-*-host` | 59/59 cases ok on every run (3 vendor, 1 own); 61/61 attestations each, `cua-repl-host 0.5.0` on the own run. With the recalibrated tolerance (89496dd), **0 unexpected differences** against each of the three vendor runs (151 cells; 3, 6 and 2 expected trace counts) |
| Scripted benchmark | `browser-parity.mjs run --device mini --service cua --repl-host <h> --corpus bench --out scripted/<h>/ep-<n>`, n=1..3, alternating vendor then cua; `bench-scripted-summary.mjs scripted --axis host` (`scripted/summary.txt`) | **equal: every scripted episode passes on both hosts**: drag-box vendor 3/3, cua 3/3; drag-items vendor 3/3, cua 3/3; raw reward 1 on all 12, identical drag paths (121,114)->(76,93) and (77,98)->(77,191) |
| Selection lane | `scripts/repl-parity/selection.mjs --device mini --node22 /Users/new/.nvm/versions/node/v22.18.0/bin/node` | **open**: stopped at row 4 (see `diagnostics/selection-invalid-setting/`) |
| Doctor matrix | `doctor/run-doctor.mjs` (`doctor/doctor.json`) | agrees with the selection table and the answered runs (below) |
| Package contents | `package/` (recorded at 5f188d9; no package-affecting change since) | ok |

### Browser corpus diffs (closed at 89496dd: vendor trace-count variance, recalibrated mechanically)

`corpus-diffs/` holds each vendor run against the own run (`--expected test/browser-parity/repl-host-expected-differences.json`)
and each vendor pair. Every non-zero line is a trace count, never content:

- vendor-1 vs own: 1 unexpected, `waits/zero-budget` `idle` `Page.lifecycleEvent` 6/5 (2 expected).
- vendor-2 vs own: 2 unexpected, `input/coordinates` `double` `Runtime.evaluate` 2/1, `Runtime.releaseObject` 1/0 (4 expected).
- vendor-3 vs own: 2 unexpected, `actions/locators` `select` `Runtime.evaluate` 4/3, `Runtime.releaseObject` 2/1.
- The vendor against itself: 1 vs 2, 5 differences; 1 vs 3, 5; 2 vs 3, 8 (the same cells, plus `actions/wait-for` `visible`
  and `actions/slow-budget` `late`). In each cell above the own host's count equals another vendor run's.

No allowance was added. By the session's ruling the oracle owner recalibrated the derived tolerance mechanically from these
three vendor runs (pinned at f7ac87d): 89496dd adds five vendor-derived slots, each maxDelta 1, and grows no prior bound. Re-run
with `test/browser-parity/repl-host-expected-differences.json` at 89496dd, recordings unchanged
(`corpus-diffs/vendor-<n>-vs-cua-at-89496dd.txt`):

- vendor-1 vs own: **0 unexpected differences** (59 cases, 151 cells, 3 expected)
- vendor-2 vs own: **0 unexpected differences** (59 cases, 151 cells, 6 expected)
- vendor-3 vs own: **0 unexpected differences** (59 cases, 151 cells, 2 expected)

The pre-recalibration diffs stay beside them as `vendor-<n>-vs-cua.txt`.

### Selection lane (open)

Rows 1–3 passed. Row 4 (`CUA_REPL_HOST=invalid`, ordinary lane): doctor refuses with `invalid_repl_host`; the real `cua serve`
refuses before launch with the same sentence and code `invalid_setting` (M0's documented split). The lane stopped at that
first failure, so rows 5–260, the cache and the job checks did not run. Ruling: the oracle changes (per-lane codes, every row
evaluated and reported); the lane is re-run on the mini at that fix head. Product code is unchanged.

### Doctor (`node bin/cua.mjs doctor --json`, prepared session environment, `CUA_NODE` unset)

Run on the mini in the repl-parity scratch environment (`CUA_HOME`, private `HOME`, browser-only, secrets off), with
`CUA_BROWSER_SERVICE=cua` as `serve` sets it and with it unset (route from the scratch home's cua registration):

| `CUA_REPL_HOST` | `repl.host` | Doctor |
|---|---|---|
| unset | pass | `cua host (browser_only) on Node <home>/node/24.22.0/bin/node`; listing the same |
| `cua` | pass | `cua host (explicit) on Node <home>/node/24.22.0/bin/node` |
| `vendor` | pass | `vendor host (explicit)` |
| `bogus` | fail, `ok:false` | `refused (invalid_repl_host): CUA_REPL_HOST must be cua or vendor` |

Both service settings give the same host and reason; the route names `CUA_BROWSER_SERVICE=cua` or "the cua route, by cua's
registration". Real calls agree: explicit `cua` answered as `cua-repl-host 0.5.0` on that managed Node (all-cua, corpus, scripted),
explicit `vendor` as `rmcp 1.5.0`, and an invalid value refuses before launch (`invalid_setting`, above). The unset row's real
answer is the selection lane's to show once it re-runs.

## Diagnostics kept (not evidence)

- `diagnostics/all-vendor-1-debugger-unattached/`: the first vendor `--suite all` at this head, 478/479. `api/browser-tab/cua`
  cell `type` was interrupted by Chrome (`playwright.evaluate was interrupted: Debugger unattached`). Re-run as `all-vendor-2`
  (the control). Also its diffs against vendor-2 (only that case) and against the own run, before and after `4d38318`.
- `diagnostics/scripted-no-fixture/`: the first 3+3 scripted episodes; the archive bench fixture (127.0.0.1:48731) had not
  been started, so every setup failed with `net::ERR_CONNECTION_REFUSED` on both hosts. The recorded runs then started
  `/opt/homebrew/bin/node /tmp/bench-browser/fixture/serve.mjs` on the mini (MiniWoB 33c3b4d) as a tracked PID, and stopped
  only that PID afterwards (`scripted/fixture.txt`).
- `diagnostics/selection-invalid-setting/`: the selection lane's stopped run, above.
- `diagnostics/sitting-at-5f188d9/`, `diagnostics/all-vendor-1-at-86471c6-secrets-live-capability-home/`: earlier heads.

## Load and Chrome readiness

`load/<run>.txt` holds `uptime` on the mini and on this Mac before and after every run. Mini: 1-minute load 2.2–11.7
(11.7 only between vendor-1 and the own all-suite run; otherwise 2.2–4.2). This Mac (controller only, nothing timed here):
10.6–26.3. The scripted episodes are outcome evidence, not timing.

`ssfs-readiness.txt`: `profiles list` (key, ready and reason only) before and after every run and every 5 minutes while runs
were going, 95 checks from 14:32Z to 16:50Z. ssfs was `ready:true` at every one; the standing Profile 1 reopen was never
used. (`school` reported `binding_stale` throughout; it is not used.)

## Left in place

No `cleanup-prepared` was run: the MAWS task and task 5 reuse these preparations.
- repl-parity: journal `.doperpowers/sde/repl-parity/mini.json`, owned home `/Users/new/.local/share/cua-parity-remote/parity-pmQfYc`.
- browser-parity: journal `.doperpowers/sde/browser-parity/mini.json`, owned home `/Users/new/.local/share/cua-parity-remote/parity-3nGo8m`.
The `~/.cp` capability homes, the selection homes and the bench fixture are gone.
