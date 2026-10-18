# #115 M4: release notes, and what the final acceptance runs

Spec: `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`, Plan of Work M4, Design "Removal, CODEX_HOME and the
install" and "#138: the time-zone hang", acceptance 1 to 14. Branch `feat/115-own-sandbox-m4`, prepared from M3's head
(43c543d) while M3 (PR #160) is under review; it takes main by a merge once #160 lands.

The repository keeps no changelog, so the plugin's release notes live here.

## 0.15.0

**cua's own sandbox replaces the Codex CLI's (#115).** Nothing from OpenAI's Codex CLI is installed or launched any
more: `cua install` no longer places `CodexCLI.app` (macOS) or `codex` (Linux), and no `codex` process runs in a
session. Both REPL hosts confine both of their JavaScript children, the kernel that runs the model's cells and the
trusted worker that runs cua's trusted services, with cua's own launcher:

- **macOS:** `/usr/bin/sandbox-exec` with a seatbelt profile cua renders itself, ported from openai/codex rust-v0.159.2
  (Apache-2.0) and byte-for-byte equal to the original's output but for the deviations its header names. cua's own
  host runs it directly; the vendor host (macOS computer sessions, until #117) reaches it through cua's compat
  executable, `bin/cua-codex-compat`, which node_repl runs as its `CODEX_CLI_PATH` and which also answers the native
  helper's three policy reads from recorded answers.
- **Linux:** the upstream `codex-linux-sandbox` helper, unmodified, built from rust-v0.163.0 by this repository's
  workflow with a build-provenance attestation, released as `linux-sandbox-rust-v0.163.0`. `cua install` fetches it
  (or takes `--sandbox-helper <file>`), checks it against `runtime/sandbox/linux-sandbox.json`, and places it under
  `$CUA_HOME/sandbox/`; every launch checks its hash again and refuses a missing or altered helper
  (`sandbox_unavailable`).

**Cells can no longer read your secrets.** Under `scoped` (the default) and `default`, the kernel gets its own
profile: it is denied the secret store and every project tier (by real path), `~/.config/cua` and cua's own home.
On macOS that is the whole home except the runtime, cua's Node and the connection's own run directory; on Linux it is
the home's `state/`, `remote/`, `chrome/` and `run/` except the connection's own run directory (the rest of the home,
`profiles.json`, `current.json`, `staging/` and `bin/` among it, stays readable there). A cell's read there fails with
`EPERM` or `EACCES`; the trusted worker still reads the store, so `{{secret:KEY}}` still types the value. Other
sessions' run directories, the remote-control enrolment and Chrome's registration are out of a cell's reach on both
platforms. Under `CUA_SHIM_SANDBOX=disabled` nothing changes: cells read everywhere.

**Each connection has its own `TMPDIR`**, `$CUA_HOME/run/<session>/tmp`, removed with the connection, instead of the
account's shared temp directory. On Linux under `default` the kernel's is `$CUA_HOME/kernel/<session>/tmp` (its own
directory outside `run/`, which is denied to it whole), removed with the session too.

**Linux computer sessions are sandboxed by default.** `CUA_SHIM_SANDBOX` now defaults to `scoped` on Linux for the
computer surface too (it was `disabled`). The cells' kernel has no socket at all, so a cell can no longer reach the X
display, the session bus or the network directly; only the trusted worker has the network, so `sky_linux` still drives
the desktop. `launch_app` starts applications outside the sandbox through `gio launch`, after checking the id against
`sky_linux`'s own list. `CUA_SHIM_SANDBOX=disabled` in `cua serve`'s environment is the explicit opt-out. Cells can no
longer start a child process with piped stdio there (the helper's seccomp refuses `socketpair`).

**The vendor REPL host is retired on Linux.** `CUA_REPL_HOST=vendor` is refused there (`repl_host_refused`), and a
Linux machine with no Node 24 is refused (`repl_host_node`) rather than falling back; `cua install` places the pinned
Node 24. This closes #135, the vendor host's fail-open path.

**Cleaning up after the Codex CLI: update first, then `cua install --prune-leftovers`.** A plain `cua install` removes
nothing, because an older cua sharing the same `CUA_HOME` (an earlier plugin version, a long-running `cua serve`,
shim or agent from an older checkout) may still launch the release's `CodexCLI.app`. Once the plugin, and every other
cua using that home, is updated, `cua install --prune-leftovers` removes, by name, what the CLI left in cua's own
`$CUA_HOME/state/codex` (`auth.json`, `installation_id`, the `*.sqlite` files with their `-wal` and `-shm`,
`models_cache.json`, `cache/`, `plugins/`, `skills/`, `log/`, `tmp/arg0`, `browser/sessions`), and the unused
`CodexCLI.app` (about 229 MB; on Linux the `codex` file) from each installed release whose pin no longer lists it. It
prints each name, never a file's content; it never reads the environment's `CODEX_HOME` or `~/.codex`, never follows a
symbolic link (a linked directory on the way to a leftover is named as not inspected, never taken as clean), and leaves node_repl's own state (`config.toml`, `computer-use/sessions`, `node_repl/active_execs`). A
release's Codex CLI is removed only while no `cua serve` or profile listing of that home runs (checked right before,
then again after renaming it aside, putting it back if a session appeared); otherwise the prune says so and a later
one finishes the job. A session starting in the instant after the second check is not seen; only an older cua would
launch the CLI then. On macOS that older cua's launch fails; on Linux an older cua on the vendor host may run its
kernel unconfined after a failed launch (#135). Updating every cua that shares the home before pruning is therefore a
precondition, not a nicety, for as long as the home is used. A symbolic link at the home's `run/`,
`state/`, `state/compat/` or `kernel/` refuses the prune, and an unreadable directory or install record is reported,
never taken as clean. A CLI renamed aside but not deleted (`.CodexCLI.app.pruning-<hex>`) stays a leftover that doctor
names and the next prune removes.

**The run/ sweep never follows a link.** `cua serve`, the agent and doctor sweep the leftovers of dead sessions at
start; a symbolic link at `run/`, `state/`, `state/compat/` or `kernel/` now refuses the sweep (it is reported) and a
session's own cleanup, instead of letting them remove files outside the home. This exposure predates 0.15.0. Until then `cua doctor`'s new `runtime.leftovers` row names what is left and the
command (`warn`, never a failure), and a plain install says the same. `CODEX_HOME` itself stays only for the macOS
vendor host.

**`cua doctor`** has a `sandbox.launcher` row (macOS: `sandbox-exec`, the compat executable and its Node; Linux: the
placed helper against its pin) and no Codex CLI rows.

**Behaviour changes to know about:**

- **macOS: nested layouts refuse.** A confined connection (`scoped` or `default`) refuses with `sandbox_conflict` when
  `CUA_HOME`, the secret store or `~/.config/cua` lie inside one another, for example a custom `CUA_HOME` under
  `~/.config`, because the kernel's denial of one would cut through another. This worked before 0.15.0. `cua doctor`'s
  `sandbox` row names the directories; move them apart, or run the connection `disabled`.
- **A secret store whose tiers cannot be listed** (broken permissions on the store or `projects/`) now refuses confined
  launches (`sandbox_state_invalid`), naming the store and the remedy, since its tiers could not be denied.
- **macOS: kernel cells' `os_log` output goes nowhere.** The kernel's profile denies `logd` and `diagnosticd`, as the
  original's profile does for a profile with denied paths; nothing fails without them.
- **One screen-capture confirmation per new helper copy.** macOS asks once per machine to confirm screen capture the
  first time a new on-disk copy of the native helper captures the screen. The darwin release keeps its id, so an
  existing install keeps its helper where it is and sees no new prompt, and the prune never touches the helper. A
  new `CUA_HOME`, or a machine installing for the first time, places a new copy and sees the confirmation once.
- **Kernel exit status.** On cua's own host the kernel is Node itself, so a killed kernel reports Node's own exit
  (`signal=9`), not a launcher's.
- Linux: the first cell of a session starts ~50–70 ms slower, the cost of the confined kernel
- macOS vendor host: a cached session's first cell is ~60 ms slower, likely the launcher's Node startup

**#138 (the time-zone hang) stays open, not reproduced.** The one grant that would address it,
`(allow mach-lookup (global-name "com.apple.system.notification_center"))` in both macOS roles' profiles, is ready
behind a switch in `src/sandbox/seatbelt.mjs` (`NOTIFICATION_CENTER_GRANT`) and **ships off**. M0 measured no hang
without it (0 of 80 for the kernel and 0 of 80 for the worker under the real HOME, 0 of 160 under a scratch one), and
a widening grant needs evidence that it fixes something. `scripts/sandbox-probe/tz-probe.mjs` renders cua's final
profiles with the line and without it, so a reproduction can decide it by acceptance 13's rule. The own host's
time-zone warm-up stays.

## What the final acceptance needs (run later against this branch's final state)

Nothing here was run on the mini, GCE or any remote machine. Every live item below runs at the branch's final SHA,
after #160 has merged and main has been merged in, under the mini's rules (Decision Log, "native runs on the mini",
"one load threshold") and on the GCE box as M3 ran it.

**Hazard first: the prune removes oracles.** `cua install --prune-leftovers` removes `CodexCLI.app` and `codex` from
any installed tree of this release (a plain `cua install` no longer touches them). Several harnesses take the signed
Codex CLI from such a tree: the mini's approved scratch runtime `~/cua-115/home` (the M0 oracles: argv capture,
fingerprint, `tz-probe --launcher codex`, `scripts/sandbox-probe/m2-mini.sh`'s `SIGNED_CLI`, `scripts/mini-rules.mjs`'s
`tz` items) and, on Linux, the vendor `codex` that `linux-helper-compare.mjs --vendor` ran in M3. Never prune a home
whose CLI is still an oracle (or copy the CLI out first); prune only fresh scratch homes. The mini's resident home is
shared by the long-lived 0.5.0, 0.9.0 and 0.11.0 shims and a checkout's serve and agent, so it is pruned only after
all of them run this release, by the dispatching session.

The macOS acceptance runs in three groups (the spec's Decision Log, "M4's macOS acceptance runs in three groups"). No
group types into any window: there is no live typing anywhere in M4's acceptance.

**Group A, headless (mini): items 1 to 5, 8, 9 and 10.**

- **Item 1.** A fresh scratch `CUA_HOME`, `node bin/cua.mjs install --archive <pinned zip>`: the tree holds `cua_node`
  and `install.json` only; during the runs below `ps` shows no process named `codex`.
- **Items 2 to 5** on both macOS hosts, as M1 and M2 ran them headless: own-sandbox (`scripts/accept/own-sandbox.mjs`:
  the deny list, no bypass by link, writes confined to the session, no network for cells) on cua's own host, and the
  compat route on the vendor host.
- **Item 8.** The golden fixtures and argv parity run in the unit suite; the fingerprint under cua's launcher as M1 ran
  it (`scripts/sandbox-probe/m1-mini.sh`).
- **Item 9.** The fail-closed cases as M1 and M2 ran them (own host and compat).
- **Item 10.** `cua doctor`: `sandbox.launcher` pass, `runtime.leftovers` pass, no row checking for a Codex CLI. Then
  the prune, live but launching nothing (so no prompt): in a second fresh scratch home, install from a pre-M2 checkout
  (90cbfe0) with the pinned zip and `--no-node`, which places `CodexCLI.app`; plant synthetic files by the prune's
  names in `state/codex` (never a real `auth.json`) and node_repl's three keepers, and point the shell's `CODEX_HOME`
  at a second planted directory with the same names. At the final SHA: `cua doctor` shows `runtime.leftovers` warn
  naming them and the command; a plain `cua install --archive <pinned zip> --no-node` removes nothing and says so;
  `cua install --archive <pinned zip> --no-node --prune-leftovers` prints each removal; doctor then passes the row;
  the environment's planted directory is intact; the keepers remain; `du -sh` of the tree drops by about 229 MB; the
  native helper's `SkyComputerUseService` keeps its inode (`stat -f %i` before and after). Repeat with a session
  record of a live pid in `run/` first: the prune defers the `CodexCLI.app` with the sentence and removes the
  `state/codex` names.

**Group B, in a CI-opt hold (mini), in this order:**

1. **Item 11, latency.** `scripts/native-baseline.mjs run` three times each into `m4/mini-vendor-computer/` and
   `m4/mini-cua-browser/`, with the arguments M0 used, then `compare --same-host m0/<config> m4/<config>`. First
   check that the controller's and the mini's OS and Node versions equal those recorded in M0's runs (Surprises &
   Discoveries: a change is a re-baseline, not a loosened rule). A regression on either host's cold rows beyond M0's
   run-to-run spread goes to the dispatching session before the merge.
2. **Item 12, parity.** `scripts/repl-parity.mjs` `--suite all` on the mini, the vendor host against cua's own, diffed
   with `test/repl-parity/expected-differences.json`.
3. **accept-native.** `scripts/accept-native.mjs` **without** `--live-textedit`: its #115 items (11 to 13) PASS and the
   rest as in M2's run, re-proving the macOS computer route (acceptance 6) read-only. `--live-secrets` may run as in
   M2: its value goes to a controlled fake input target, never a window.

**Methodology note: the guarded task's timings (as of 9173dbf).** Each native-baseline task on macOS now opens its
document and types into it in two cells, `TASK_NEW` and `TASK_TYPE`, each sent only after the frontmost guard (#162),
so `task.act` includes one more cell round trip and one more AX observation than before. `task.act` and `task.total`
are therefore not comparable like-for-like with M0's baselines unless fresh guarded baselines are taken to match.
Acceptance 11 judges only the cold `first_js` rows, which are unchanged. A `task.total` row's `cells` still counts the
task's rows (act, verify, close: 3), while a successful task now dispatches four cells.

**Group C, the owner's TextEdit sitting: skipped.** The three reasons, as recorded in the Decision Log:

- M4 does not touch the macOS computer route or the compat executable;
- M2's sitting proved typing and approvals at its SHA;
- group B re-proves the route read-only.

**Linux (GCE), at 7b87873 (`gce/`, its README per item).** Linux acceptance 12 (parity) rests on M3's full run at
bf7739f: M4's merge changed no Linux launch code. On cua-gce, 2026-10-18 15:03–15:34Z: item 1 (no `codex` installed;
no `codex` process in 883 `ps` samples), items 2 to 5 (own-sandbox 82/82, the four creation cases included), item 7
(linux-native PASS; `CUA_REPL_HOST=vendor` refused with its sentence) and item 10 (the prune of a pre-M3 tree's `codex`
and the planted `state/codex` names, with and without a live session record) all pass.

Item 11 on Linux, the own host's computer session against M0's `gce-cua-computer` with M0's arguments:
`compare --same-host` **PASS** (`cold.miss.first_js` 735.1 ms against a limit of 1166.5, `cold.hit.first_js` 825.8
against 1273.6), after the harness learned to take a `memoryBytes` difference under 0.1% as the same hardware (the
first comparison read NO VERDICT on 4 KiB of MemTotal between two boots; both are kept in `gce/gce-cua-computer/`).
Against M0's run-to-run spread both cold rows are slower:

| Row | M0 per-run medians (ms) | M0 pooled | M4 per-run medians (ms) | M4 pooled |
|---|---|---|---|---|
| cold.miss.first_js | 661.1, 678.1, 591.1 | 666.5 | 744.6, 729.0, 728.3 | 735.1 (+68.6, +10.3%) |
| cold.hit.first_js | 771.4, 818.8, 749.2 | 773.6 | 825.8, 810.8, 899.9 | 825.8 (+52.2, +6.7%) |

The cause: the first cell starts the kernel through the helper, bubblewrap and seccomp, where M0 ran it unconfined.
**Ruled accepted by the dispatching session (2026-10-18):** the cost is the confinement itself; acceptance 11 names
`disabled → scoped` as the change being measured; both rows are inside the spec's limit; and the owner's "no
regression" was set for the browser service and the macOS GUI. The release notes say it under behaviour changes;
`tech-debt-tracker.md` keeps the candidates for the cost.

- **Acceptance 13 (#138).** No sitting is planned: the line ships off (above). When a reproduction appears, on the
  mini, per role, the denying control and the grant:
  `node scripts/sandbox-probe/tz-probe.mjs --launcher cua --home real --role kernel --runs 80 --bound-ms 15000
  --notification-center deny --out <control.json>`, the same with `--notification-center allow --out <grant.json>`,
  then `node scripts/sandbox-probe/tz-probe.mjs verdict <control.json> <grant.json>`; repeat with `--role worker`. A
  `keep` for both roles is what would turn `NOTIFICATION_CENTER_GRANT` on.
- **Acceptance 14.** `HOME=$(mktemp -d) npm test`, `npm run test:mods`, `claude plugin validate .` at the final SHA
  (CI runs them on the PR), and a read of README's sandbox, `CODEX_HOME`, Linux and configuration text against the
  behaviour observed above.

## Results on the mini (macOS), 2026-10-18

The mini (Mac14,12, macOS 27.0 26A428, runtime 26.928.40906-darwin-arm64), a scratch clone and scratch homes under
`~/cua-115/`, the gate and its sitting log in `mini-rules/` (the pause watcher's readings in `mini-rules/watch-log.txt`).
Group A ran under the headless rule; group B ran inside a CI-opt hold, where busy=false with no Runner.Worker counted
as idle, the queue was ignored and one reading sufficed. No TCC dialog, password prompt or system dialog appeared.

**Group A, headless, at 7b87873 (item 10 at a920e2f), 15:06–15:41Z (`headless/`, `group-a/`, `oracles/`).**

| Item | Result |
|---|---|
| 1 fresh install | PASS: the tree holds `cua_node` and `install.json`; doctor's `sandbox.launcher` and `runtime.leftovers` pass; no `codex` process during the own-sandbox runs, where the kernel is Node, a child of the supervisor or of node_repl |
| 2 to 5 | PASS: own-sandbox 76/76 on cua's host, 86/86 on the vendor host |
| 8 | PASS: golden 18/18, the oracles ok; the switch-off profiles are byte-identical to M2's once the checkout path and session UUIDs are normalised (`group-a/tests/item8-render-normalised-*.json`) |
| 9 | PASS: the fail-closed suites 153/153, compat-launch 6/6 |
| 10 | PASS: a plain install removes nothing; `--prune-leftovers` removes the names and `CodexCLI.app` (229 MB freed), doctor goes warn → pass; the keepers and the environment's `CODEX_HOME` are untouched; the helper's inode is unchanged; a live session record defers `CodexCLI.app`; a linked `state/codex/tmp` is reported by doctor, and the marker and the link survive |

`m2-mini.sh headless` exits 1 on the approved home only because its doctor step judges `runtime.leftovers`, which
warns there: that home keeps `CodexCLI.app` and the task-1 state as the M0 oracles. Item 1 is judged on the fresh home.

**Group B, in the CI-opt hold, at 8782604, 15:43–16:17Z.** The OS and hardware equal M0's runs (the comparisons'
header rows). The frontmost key guard (9173dbf, #162) landed after group B; nothing here ran with it.

*Item 11, latency (`mini-vendor-computer/`, `mini-cua-browser/`, each with `comparison.md`).* `compare --same-host`
**PASS** for both configurations. The judged rows, milliseconds:

| Configuration, row | M0 per-run medians | M0 pooled | M4 per-run medians | M4 pooled | Limit |
|---|---|---|---|---|---|
| vendor computer, cold.miss.first_js | 1264, 1240, 363 | 400.9 | 283, 320, 250 | 258.7 (−142) | 900.9 |
| vendor computer, cold.hit.first_js | 412, 460, 472 | 429.3 | 489, 466, 513 | 489.0 (+59.7) | 929.3 |
| cua browser, cold.miss.first_js | 1192, 1152, 1168 | 1160.5 | 311, 207, 230 | 229.6 (−931) | 1660.5 |
| cua browser, cold.hit.first_js | 317, 344, 314 | 316.6 | 298, 300, 303 | 301.0 (−15.6) | 816.6 |

The vendor host's cold.hit row is +60 ms, beyond M0's run-to-run spread (412–472) but well inside the limit. **Ruled
accepted by the dispatching session (2026-10-18) on the basis of the three runs**, with that configuration's miss row
140 ms faster. The likely cause is the compat executable's Node startup: on the vendor host, `bin/cua-codex-compat` is
a shell wrapper that runs `src/sandbox/codex-compat.mjs` on the pinned Node, which then `process.execve`s
`sandbox-exec`, where M0 started the signed Codex CLI. This is not measured: the
spawn-to-execve timing (`/usr/bin/true` against the compat's refusal path, no input, no native calls) was prepared,
but the hold's gate requires Terminal in front, parity left Chrome in front, and the hold was released at about
16:37Z before it got a slot. It did not run.

Three extra vendor runs, planned to firm up the cold.hit row, were **not run**. A vendor computer run sends synthetic
keys through the native helper (`super+n`, `typeText`, `super+w` ×10, `super+q`), and a `super+q` that reached Chrome
would quit the owner's Chrome. The extra runs wait for the frontmost key guard (#162).

*The ssfs window's closure (tab log).* The coordinator saw the ssfs Profile 1 window's last tab closed between about
15:43Z and 15:48Z; it was reopened at 15:52:25Z, with 1 tab at 15:52:45Z. From our logs, our runs did not close it:

- The browser latency runs used their own scratch HOME and CUA_HOME with no Chrome registration or extension host, and
  made only the cold rows (initialize, tools/list, a banner cell, end_task).
- The vendor runs' keys all landed in TextEdit by AX confirmation: task.act 10/10, task.close 10/10,
  setup.newDocument 1/1 and guard.scratch 2/2 in each run; TextEdit launched and quit by the run; Terminal in front
  after each run; Chrome's pid unchanged.
- Our last tab count before group B was at 07:02:21Z, so our logs cannot place the closure inside the window
  themselves.
- One correlation: both recent closures followed a run whose native helper typed into TextEdit (the 03:15Z sitting,
  and these vendor runs). Every key we sent is confirmed in TextEdit, so this is a correlation, not a mechanism; #157's
  last-tab guard would not cover it, since nothing of ours closes tabs.

*HID idle.* The reading of 329 s at 15:52:25Z puts the last input at 15:46:56Z, the end of vendor run-3 and its
`super+q`. The helper's synthetic keys count as HID input, so an HID-idle reading cannot by itself show that a human
is present.

*Item 12, parity (`parity/`), 15:52:50–16:16:36Z, profile ssfs.* **PASS**: vendor host 479 cases complete, cua's
host 479 complete, every assertion passed; the diff with `test/repl-parity/expected-differences.json` is ok with 0
undeclared differences, 0 vendor defects, nothing pending or provisional. The 1367 expected differences are all one
declared field, `meta.cua/replHost` (the own host's result attestation). This is identical to M2's run at 249a2a9
(479/479, 1380 cells, 1367 expected). No pause occurred. Chrome: pid 36513 with 1 tab before and after. Parity's
browser cases left Chrome in front from about 16:04Z, and Terminal was not raised afterwards (the hold had ended, and
no further mini action was authorised).

*accept-native, without `--live-textedit`, with `--live-secrets` (`accept-native/acceptance.json`),
15:49:13–15:51:41Z, run while ssfs was down.* Against M2's table (`../m2/README.md`):

| Item | M2 6de47ae | M4 8782604 | Same as M2? |
|---|---|---|---|
| 1 npm test | FAIL (2) | FAIL: the same 2 tests (unit proof must exist; selected-stage completeness) | yes |
| 2, 3, 8 | FAIL (cascade) | FAIL (cascade from item 1; item 2's download mode BLOCKED as in M2) | yes; item 8 also BLOCKS "per-connection app approvals observed", which needs the TextEdit fixture |
| 4 | PASS | PASS 3/3 | yes |
| 5 | PASS 11/11 | BLOCKED: the TextEdit fixture, not requested | **differs, by design** (no `--live-textedit`) |
| 6, 7 | FAIL (cascade only; live probe-secrets pass) | FAIL (cascade only; live probe-secrets pass) | yes; item 6 has 16 checks, not 20: the four optional UI-delivery checks type into TextEdit and were not run |
| 9 | BLOCKED | BLOCKED (the same three) | yes |
| 10 | FAIL (two checks) | FAIL (the same two: tracked files naming the home; the clean clone's `HEAD`) | yes; the tracked-files list no longer names `scripts/sandbox-probe/m2-mini.sh` |
| 11 own sandbox | PASS 76/76 | PASS 76/76 | yes |
| 12 vendor-host sandbox | PASS 86/86 | PASS 86/86 | yes |
| 13 computer route via compat | PASS 18/18 | PASS 18/18 | yes |

The #115 items (11 to 13) pass and acceptance 6, the macOS computer route, is re-proved read-only. The only item
that differs is 5, which needs the live TextEdit run that group B leaves out.
