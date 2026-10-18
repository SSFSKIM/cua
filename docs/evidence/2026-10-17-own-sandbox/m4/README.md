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
symbolic link, and leaves node_repl's own state (`config.toml`, `computer-use/sessions`, `node_repl/active_execs`). A
release's Codex CLI is removed only while no `cua serve` or profile listing of that home runs (checked right before,
then again after renaming it aside, putting it back if a session appeared); otherwise the prune says so and a later
one finishes the job. A session starting in the instant after the second check is not seen; only an older cua would
launch the CLI then, and that launch fails rather than running unconfined. A symbolic link at the home's `run/`,
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

- **Acceptance 1, 10 (macOS, mini).** A fresh scratch `CUA_HOME`, `node bin/cua.mjs install --archive <pinned zip>`:
  the tree holds `cua_node` and `install.json` only. `cua doctor`: `sandbox.launcher` pass, `runtime.leftovers` pass,
  no row naming the Codex CLI.
- **Acceptance 10, the prune live (mini; launches nothing, so no prompt).** In a second fresh scratch home, install
  from a pre-M2 checkout (90cbfe0) with the pinned zip and `--no-node`: that places `CodexCLI.app`. Plant synthetic
  files by the prune's names in `state/codex` (never a real `auth.json`) and node_repl's three keepers, and point the
  shell's `CODEX_HOME` at a second planted directory with the same names. At the final SHA: `cua doctor` shows
  `runtime.leftovers` warn naming them and the command; a plain `cua install --archive <pinned zip> --no-node` removes
  nothing and says so; `cua install --archive <pinned zip> --no-node --prune-leftovers` prints each removal; doctor
  then passes the row; the environment's planted directory is intact; the keepers remain; `du -sh` of the tree drops by about 229 MB; the native
  helper's `SkyComputerUseService` keeps its inode (`stat -f %i` before and after). Repeat with a session record of a
  live pid in `run/` first: the prune defers the `CodexCLI.app` with the sentence, removes the `state/codex` names.
- **Acceptance 10 (Linux, GCE).** The same with a pre-M3 install (the tree's `codex` file) and the Linux prune; and
  M3's helper rows as before.
- **Acceptance 2 to 9, 12 (both platforms).** As M1 to M3 ran them, at the final SHA: `scripts/accept-native.mjs
  --live-secrets --live-textedit` on the mini (items 11 to 13 PASS, the rest as on main 94366c1 and M2), own-sandbox
  and the compat route; on GCE `scripts/accept/linux-native.mjs`, own-sandbox, `linux-helper-compare.mjs` (with the
  vendor `codex` copied out first, above); parity `--suite all` on the mini (vendor vs own) and on GCE (own vs
  `m0/gce-vendor-control`) with `test/repl-parity/expected-differences.json`.
- **Acceptance 11 (latency).** `scripts/native-baseline.mjs run` three times per configuration into
  `m4/mini-vendor-computer/`, `m4/mini-cua-browser/` and `m4/gce-cua-computer/`, with the arguments M0 used, then
  `compare --same-host m0/<config> m4/<config>`. First check that the controller's and devices' OS and Node versions
  equal those recorded in the M0 runs (Surprises & Discoveries: a change is a re-baseline, not a loosened rule).
- **Acceptance 13 (#138).** No sitting is planned: the line ships off (above). When a reproduction appears, on the
  mini, per role, the denying control and the grant:
  `node scripts/sandbox-probe/tz-probe.mjs --launcher cua --home real --role kernel --runs 80 --bound-ms 15000
  --notification-center deny --out <control.json>`, the same with `--notification-center allow --out <grant.json>`,
  then `node scripts/sandbox-probe/tz-probe.mjs verdict <control.json> <grant.json>`; repeat with `--role worker`. A
  `keep` for both roles is what would turn `NOTIFICATION_CENTER_GRANT` on.
- **Acceptance 14.** `HOME=$(mktemp -d) npm test`, `npm run test:mods`, `claude plugin validate .` at the final SHA
  (CI runs them on the PR), and a read of README's sandbox, `CODEX_HOME`, Linux and configuration text against the
  behaviour observed above.
