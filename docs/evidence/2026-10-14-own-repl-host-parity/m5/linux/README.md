# M5 task 6: the cua-linux correctness sitting (2026-10-16)

cua-linux (Tart VM on this Mac, linux-arm64, 4 vCPU / 8 GB in this sitting, X on :0 with openbox), Chrome profile `me` on the H4 home
(`/home/admin/.local/share/cua-h4`, discovery only), parity clone `~/Developer/GitHub/cua-parity`. The VM's `~/cua`,
`~/cua-m4`, default home and H4 home were not modified; no shell profile or service was changed; VM Chrome was never
started or stopped.

**Status (resumed at `fabfb11`, 2026-10-16/17):** the archive-cache fix (fabfb11) and the confirmed Linux over-limit
oracle (1c2f41e) landed, the preparations were redone at `fabfb11`, and the sandwich's first two runs are recorded:
vendor `fabfb11/all-vendor-1` and own `fabfb11/all-cua`, **0 differences** (below). The trailing vendor control is still
owed: one attempt failed a vendor assertion and one aborted on a fixture bound under this Mac's load (both kept as
diagnostics). The sitting paused there for the VM's resize. Steps 3–7 (services, runners, lifeline, native-pipe tests,
selection, doctor) stand as recorded at `b3cb6db`, with the same product code `e24a1cd`; the first part of this README
describes them.

**VM size.** Everything up to this pause ran on cua-linux at **4 vCPU / 8 GB**. The owner directed a resize to
**2 vCPU / 4 GB** (restart by the session) before the trailing vendor control, the remote endpoint and cleanup.

## The sandwich at `fabfb11` (`fabfb11/`)

Both CLIs were cleaned up (`cleanup-prepared`, both `removed: true`) and prepared again at `fabfb11` (product code still
`e24a1cd`): repl-parity home `parity-mbqFmF`, browser-parity `parity-bNZR1P`, managed Node v24.22.0, no `CUA_NODE`,
discovery on the H4 home; each prepare took 77–78 s, including fetching and verifying the two archives once.
A fixture install from the cache (`cua install --archive … --node-archive …`) takes **22–24 s** (three timed,
`fabfb11/cached-install-timing.txt`), against 51–76 s downloading.

Runs: `scripts/repl-parity.mjs run --host <h> --device cua-linux --suite all --through M4 --pending-cell 'input/coordinates#scroll'
--pending-cell 'input/dom#scroll' --pending-reason '<the #141 reason>'`, then `diff … --through M5 --expected
test/repl-parity/expected-differences.json`. Runs are `--through M4` because the #141 pending declaration is approved only
through M4 (`test/repl-parity/pending-environment.json`); on Linux the M4 and M5 selections are the same 493 cases.

| Run | Window (UTC) | Result |
|---|---|---|
| `all-vendor-1` | 22:07–22:51 | 493 cases complete, 490 covered; the #135 vendor defect recorded; 91 connections `rmcp 1.5.0`, no `cua/replHost` |
| `all-cua` | 22:51–23:36 | 493 complete, assertions PASS, 491 covered; 91 connections `cua-repl-host 0.5.0` with the result marker, every one answering on its fresh capability home's managed Node v24.22.0 |
| `diff-vendor-1-cua.json` | | **`ok: true`, 0 differences**, 490 cases, 1,394 cells; 1,362 expected = 1,361 identity slots + the #135 security departure; the 14 #141 pending cells blocked on both sides, 0 unexpected passes; 0 provisional cells (`connect-over-limit` now counts, identical on both hosts) |
| trailing vendor control | | **owed** |

Diagnostics (`fabfb11/diagnostics/`, not evidence):
- `all-vendor-2-browser-tab-back/` (23:36–00:26): complete, but the vendor failed its own assertion in
  `api/browser-tab/back`: `back()` stayed on `/reload.html` where vendor-1 and the own run reached `/counter.html`; every
  other cell matched. Its diffs against the own run and vendor-1 show only that case.
- `all-vendor-3-fixture-readiness-timeout/` (00:26–01:27): aborted after 1,413 rows on the harness's 60 s owned-fixture
  readiness bound (`scripts/browser-parity/resources.mjs`) while this Mac's 1-minute load was 144. The VM-side fixture
  finished and cleaned up on its own afterwards (`~/.cp` empty).

## Heads and Node

| Role | Commit |
|---|---|
| Product code | `e24a1cd` |
| Oracle | `1d1ed89` |
| Prepared clone, every run's `commit` | `b3cb6db` (both CLIs) |
| Harness commit recorded by runs | `b3cb6db`, later `2f837fa` (another executor's evidence-only commits; no `src/`, `scripts/` or `test/` change) |

```sh
CUA_PARITY_SCRATCH_PREFIX=cua-m5t6- node scripts/repl-parity.mjs   prepare --device cua-linux --commit b3cb6dbfde346a7e1e90bd2bc065052853aec056 --profile me --out m5/linux/prepare-repl
CUA_PARITY_SCRATCH_PREFIX=cua-m5t6- node scripts/browser-parity.mjs prepare --device cua-linux --commit b3cb6dbfde346a7e1e90bd2bc065052853aec056 --profile me --out m5/linux/prepare-browser
```

Both are fresh `cua install` scratch homes with the managed Node (`nodeMode: managed`, `nodeOverride: null`, no
`CUA_NODE`); discovery read the H4 home (`discoveryHome`), whose cua route and `me` binding the prepare facts record.
- repl-parity home `~/.local/share/cua-parity-remote/parity-PMhCs6`, browser-parity home `…/parity-EN3voP`.
- Proxy (cua) Node: the VM's system Node v22.23.3 (`/usr/local/bin/node`). Vendor runtime `26.928.40906-linux-arm64`
  (its node v24.21.0).
- **The own host answered on the managed Node v24.22.0 every time**: every own connection of the services suite under
  its fresh capability home's `node/24.22.0/bin/node` (41/41 `answeringHost` records), the three runners and the
  lifeline sessions on the prepared or capability home's managed Node (recorded from the live supervisor process).

## Results

| Step | Item | Verdict |
|---|---|---|
| 2 | `--suite all` vendor/own/vendor | at `b3cb6db` held by the bound below; recorded at `fabfb11` ("The sandwich at `fabfb11`" above): vendor-1 vs own 0 differences, trailing vendor control owed |
| 2 | services suite, vendor `services-vendor/` and own `services-cua/` | both 40/40 recorded, complete, assertions PASS; 41 connections each (`rmcp 1.5.0`; `cua-repl-host 0.5.0` with the result marker). `services-diff.json`: **0 differences**, 75 cells, 74 expected (identity slots only) |
| 2 | Linux `stat-missing` | vendor and own byte-identical: `native pipe path unavailable: No such file or directory (os error 2)`, the oracle's Linux value |
| 2 | Linux `connect-over-limit` (provisional) | **the live Linux vendor does exactly what the disassembly predicted**: `{bytes:[], message:'failed to connect native pipe: path must be shorter than SUN_LEN', pathBytes:192, peer:{accepted:0, received:[]}, platform:'linux', status:'refused', sunPathBytes:108}`. The own host is byte-identical. The case stays provisional (not counted) until the oracle owner cites this control |
| 3 | `linux-native` (prepared scratch home, no `CUA_NODE`) | **PASS**, exit 0; 1 session, `cua-repl-host 0.5.0`, 3 host results marked; supervisor on the scratch home's managed v24.22.0 |
| 3 | `linux-chrome me` (H4 home, `CUA_NODE` = the prepared home's managed Node) | **PASS**, exit 0; attested as above |
| 3 | `linux-chrome-features` (same) | **PASS**, exit 0 (raw-CDP download alternative SKIP, informational by design); 8 host results marked |
| 4 | Lifeline under the real Linux sandbox launcher | **PASS** (`lifeline/result.json`, `ok:true`): busy kernel and worker ended **251 ms** after SIGKILL to the supervisor, **223 ms** after SIGKILL to proxy, anchor and supervisor; nothing left, nothing reparented |
| 5 | `node --test test/repl-host/native-pipe.test.mjs test/repl-host/native-pipe-long-path.test.mjs` | 26 tests: 18 pass, 0 fail, 8 skipped (the macOS-only long-path connector tests); the Linux 192-byte refusal and the non-UTF-8 directory case ran and passed (`native-pipe-tests/node24.22.0.tap`) |
| 6 | Selection lane, `--node22 /usr/local/bin/node` | **260/260 rows**, 0 failures; cache `sameSelection`, `staleVersionMiss`, `crossHostMiss` true; job `explicitNodePersisted`, `implicitNodeOmitted` true. Own answers on the selection home's managed v24.22.0 |
| 7 | `doctor --json` (unset / cua / vendor / invalid) | agrees with the table and the real calls, below |
| 8 | `cleanup-prepared` | **not run**: the preparations stay for the held step 2 and the remote endpoint |

### The all-suite bound at `b3cb6db` (resolved by fabfb11's archive cache)

In managed mode every harness fixture connection (serve-cells, serve-native, the boundary probes, the capability lane)
makes a fresh capability home with `cua install`, which downloads the 453 MB ChatGPT deb and the 58 MB Node tarball. On
the VM one install takes 51–76 s (five timed). The boundary probe `cells/lifecycle/eof-settles-no-replay` opens two
connections, so it needs two installs, and `scripts/repl-parity/boundaries.mjs` gives a probe 120 s
(`timeout:120000`). Run by hand at `b3cb6db` the vendor probe passes in **148 s**. The vendor all-suite therefore stops
there (`diagnostics/all-vendor-1-boundary-probe-timeout/`, 327 rows in 43 min, every recorded assertion passing).
Other two-connection probes and the 150 s MCP initialize bound of a native connection are at the same risk. This is the
oracle's bound, not the subject's, and was not changed here.

### Doctor (`doctor/run-doctor.mjs`, `doctor/doctor.json`)

Prepared session environment (scratch `CUA_HOME`, private `HOME`, X session, secrets off), `CUA_NODE` unset; surfaces
computer, browser and computer,browser, each browser surface with `CUA_BROWSER_SERVICE=cua` and unset (route from the
scratch home's cua registration):

| `CUA_REPL_HOST` | `repl.host` on every surface/service combination |
|---|---|
| unset | pass: `cua host (linux) on Node <home>/node/24.22.0/bin/node` |
| `cua` | pass: `cua host (explicit) on Node <home>/node/24.22.0/bin/node` |
| `vendor` | pass: `vendor host (explicit)` |
| `bogus` | fail, `ok:false`: `refused (invalid_repl_host): CUA_REPL_HOST must be cua or vendor` |

Real calls agree: unset and explicit `cua` answered as `cua-repl-host 0.5.0` on the managed Node (services, runners,
lifeline, selection), explicit `vendor` as `rmcp 1.5.0`, and the selection lane's rows show the same per route.

## Transport (`ssh-direct/ssh`)

Under this Mac's load (1-minute load 14–102 during the sitting), about one ssh connection in eight to `cua-linux`
through `~/.ssh/config`'s `ProxyCommand nc "$(tart ip cua-linux)" 22` hung: the ssh client spun at 100% CPU with its
`nc` in CLOSE_WAIT holding 96 unread bytes, and the session never reached the VM's sshd. Measured: 3/25 through the
proxy, 0/75 direct to the VM's address. Two harness connections hung this way (`diagnostics/all-vendor-1-*initialize-timeout`,
`diagnostics/native-probe-vendor-ssh-hang`). From then on every command ran with `ssh-direct/` first on `PATH` and
`CUA_LINUX_ADDR=192.168.64.3` (`tart ip cua-linux`): the same host and user, straight to its address. Nothing else in the
harness or the device changed.

## Scripts

- `accept/run.mjs`, `accept/attest-serve.mjs`, `accept/attest-summary.mjs`: M5 copies of M4's wrapper. `linux-native`
  runs on the prepared scratch home with `CUA_NODE` unset; the two browser runners run on the H4 home, as at M4, because
  their host-identity step reads `me`'s host pid and status from `$CUA_HOME` (on the scratch home, which only links the
  backend socket, that one step failed and every other passed: `diagnostics/accept-browser-runners-on-scratch-home/`).
  The H4 home has no managed Node and is never installed into, so `CUA_NODE` names the prepared home's managed Node
  there. The serve recorder also records the Node that actually ran the supervisor, and the summary requires it to be
  that managed Node.
- `lifeline/device.mjs`, `lifeline/run.mjs`: M4's lifeline check adapted to Linux (lifeline counted on the named
  `cua-lifeline-*/lifeline` FIFO from `/proc/<pid>/fd`; the launcher's sandbox layers, `codex` → `codex-linux-sandbox` →
  `bwrap` → `codex-linux-sandbox`, told apart from the Node child; reparenting judged outside the recorded tree; a fresh
  managed capability home; the supervisor must run on its managed Node). The first run counted those layers as
  children (`diagnostics/lifeline-first-run-layers-as-children.json`). `test/repl-parity/lifeline-linux-verdict.test.mjs`
  pins the recorded result and its mutations.
- `doctor/run-doctor.mjs`: the mini's doctor runner adapted to Linux.
- These scripts run on the VM from scratch copies whose relative imports are rewritten to the prepared clone, so the
  clone stays clean at `b3cb6db`.

## Load and readiness

`load/*.txt`: this Mac's and the VM's `uptime` and `me`'s readiness (key, ready, reason) before and after each item.
This Mac: 1-minute load 14–102. VM: 0.05–1.7. `me` was `ready:true` at all 18 checks; no `host_not_live`.

## Left in place

- repl-parity: journal `.doperpowers/sde/repl-parity/cua-linux.json`, home `/home/admin/.local/share/cua-parity-remote/parity-mbqFmF` (`fabfb11`).
- browser-parity: journal `.doperpowers/sde/browser-parity/cua-linux.json`, home `/home/admin/.local/share/cua-parity-remote/parity-bNZR1P` (`fabfb11`).
- The `b3cb6db` preparations (`parity-PMhCs6`, `parity-EN3voP`) were removed by `cleanup-prepared`.
- No capability, selection or scratch home remains on the VM (`~/.cp` empty; no `/tmp/cua-m5t6-*`). The selection lane leaves its empty parent `~/.local/share/cua-parity-selection` by design.
