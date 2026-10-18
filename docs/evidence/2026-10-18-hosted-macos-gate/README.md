# #159: cua's headless macOS live checks on GitHub's hosted macOS runner (2026-10-18)

Ticket SSFSKIM/cua#159, spawned by #115. Branch `feat/159-hosted-macos-gate`.

**The problem.** cua's headless macOS live checks ran only on the Mac mini. The mini is also MAWS's shared CI runner,
so each run either waited for MAWS's queue or needed a runner hold. #115's holds on 2026-10-18 kept MAWS's macOS lane
offline for about two hours.

**The result.** A new ci-kit gate, `sandbox-live` (lane `hosted-macos`, `.github/ci-kit.yml`), runs
`scripts/sandbox-probe/hosted-gate.sh` on GitHub's hosted macOS runner. It runs on every pull request that touches:

- `src/sandbox`, `src/runtime`, `src/secrets`, `src/repl-host` or `src/services`;
- `src/mcp` (own-sandbox's connection, probe-secrets' server) or `src/cua-api` (the own host's API, which the kernel
  reads);
- `src/cli.mjs` or `bin/cua.mjs` (install and doctor);
- `bin/cua-codex-compat` or `runtime/`;
- the checks' own scripts, or the records they judge against (M0's, and the hosted baseline).

A run takes about 1.5 minutes, the runtime install included. A pull request that changes the sandbox policy gets the
oracles' and own-sandbox's results from this gate, with no mini time used.

Two more gates, `sandbox-denials` (the cfprefs denial check) and `parity-browser` (parity's browser lanes), run on a
harness Chrome for Testing on the same hosted runner. They are described in their own section below.
`sandbox-denials` runs on pull requests. `parity-browser` runs by hand only (`ci-gate --gates parity-browser`, or a
dispatch) until two racy parity cells are fixed: 3 of its first 6 runs went red on them, not on the change.

## What the gate runs

Every run starts from a fresh runner. The pinned runtime and Node are fetched at run time by `cua install` into a
scratch `CUA_HOME` (16 to 21 s). The scratch root is removed at the end, and the runtime is never uploaded.

| Step | #115 acceptance | On the mini, before | Hosted form |
|---|---|---|---|
| install; no Codex CLI in the tree; doctor `sandbox.launcher` pass with no Codex CLI row | 1, 10 | `m2-mini.sh headless`, M4 group A | the same, on a fresh install |
| fingerprint under cua's launcher, kernel and worker, scoped and default (each kernel run pins the metadata grant) | 8 | `m1-mini.sh oracles`, judged against M0's golden-kernel and signed-CLI fingerprints | judged **equal to the hosted baseline** (below) |
| port-vs-capture: cua's port rendering M0's two signed-CLI argv captures | 8 | `m1-mini.sh oracles` | the same captures, relocated from the mini's scratch root to the runner's (`oracle.mjs port-vs-capture --relocate`) |
| own-sandbox, cua's own host (76 checks) and the vendor host (86 checks) | 1 to 5 | `m2-mini.sh headless` | unchanged |
| probe-secrets against its own synthetic store (37 steps) | 6, 7 (live roundtrip) | accept-native `--live-secrets` | unchanged; its one native-helper call (an absent app's lookup, `invalidApp`) needs no grant |

Already hosted before this ticket, in gate `test` (the unit suite): the golden fixtures, the fail-closed suites, and
tier discovery against synthetic stores (`test/sandbox/policy.test.mjs`).

## The OS finding, and why the oracles judge against a hosted baseline

The first hosted runs judged the hosted fingerprints against M0's mini records. Once the harness bug below was fixed, the
only remaining difference was `file-link` on six system paths: `/Applications`, `/Library/Preferences`, `/System/Library`,
`/Users`, `/private/var/db` and `/usr/bin`. The mini denies it and the hosted runner allows it.

The same difference shows between **the same cua code** on the two machines: the mini's M4 `fp-cua-*` against this
branch's hosted ones, with no other row and no environment difference. So the cause is the OS, not the profile:

- the mini runs macOS 27.0;
- the hosted image `macos26` 20261013.0424.1 runs macOS 26.6.2 (25G83).

The dispatching session ruled (2026-10-18): don't widen the M0 pairs' deviations to absorb an OS difference. Instead:

- The hosted fingerprints are judged **equal**, with nothing declared, to a baseline recorded on the hosted image
  (`baseline/`; pair `hosted-baseline/cua` in `scripts/sandbox-probe/compare.mjs`).
- The baseline was recorded by run 39152309889 from this branch, whose sandbox code is main's: the branch changes only
  harness files.
- The M0 pairs stay a mini check (`scripts/mini-rules.mjs` header).
- port-vs-capture compares argv renderings, not OS answers, so it holds on any Mac.

**Re-recording the baseline.** Two cases need it:

- **A change moves a fingerprint on purpose.** It records the new baseline in the same pull request, so the review sees
  the behavioural diff. The failing gate's artifact (`sandbox-live`, `oracles/fp-cua-*.json` and `image.json`) holds
  that run's fingerprints in the baseline's form: copy them into `baseline/`.
- **The hosted image moves.** `macos-latest` can change, and a new OS can answer a check differently. The gate prints
  both images. When a baseline judgement fails on a different image, it says so. Record the new baseline from a run of
  main's code (`ci-gate <a main worktree> --gates sandbox-live` fails and uploads it).

## Harness changes

- **`compareFingerprints`** (`scripts/sandbox-probe/compare.mjs`) reads each side's env and cwd relative to that
  side's own roots, taken from the targets the harness passed the probe: `cua-home`, `checkout`, and the user home as
  the grandparent of `config-cua` (`<userHome>/.config/cua`). Not fingerprint.c's own `home` target: that is the
  child's `HOME`, so a regression moving the kernel's `HOME` would also move the root that erases it (review finding;
  a unit test pins it).
  - A root is matched whole, including inside a JSON value such as `CUA_SANDBOX_DENY_READ`, and never matches a
    sibling that shares its prefix.
  - Both machines' runs then compare even though their paths differ.
  - The mini's M4 judgements, recomputed with it, are unchanged (four ok).
- **`relocateCapture`**, and `oracle.mjs port-vs-capture --relocate <from>=<to>`, move a capture's root in both
  spellings: plain, and the regex-escaped one the original's profile uses for its carve-outs. They also move the
  protected daemon directory's euid.
  - One pass replaces each occurrence once, by the spelling it was found in, so a destination under the original root
    is never moved twice.
  - A root with no regex-lite metacharacter spells both ways alike, so an occurrence cannot say which spelling of the
    destination it needs: when the destination's two spellings differ, the relocation is refused. The mini's root
    (`/Users/new/cua-115`) has one, so M0's captures relocate.
  - Relocated locally, both modes give `equalButDeviations`.
- **`oracle.mjs fingerprint`** creates the cua home's `state/`. A fresh install has none, and `sandbox_check` reports a
  missing path as denied. The first hosted run read `cua-home/state` as denied for exactly that reason; the mini's home
  had task 1's `state/`.
- **`scripts/sandbox-probe/hosted-public.mjs`** writes the public form of each report the gate publishes (below). The
  committed baseline is in the fingerprint's public form, converted from the recorded one by it; the recorded and the
  converted baseline judge equal, and the mini's M4 judgements are unchanged.
- **Unit tests** in `test/sandbox-probe/compare.test.mjs` cover the root-relative comparison, the relocation and the
  `hosted-baseline/cua` pair. `test/sandbox-probe/hosted-public.test.mjs` plants a value in each free-text field, an
  unknown variable and an extra check field and shows no public form carries it; shows two runs under different
  scratch roots publish the same fingerprint, and that the public forms still catch a check row, the deny list and
  `HOME` moving; and shows a report that cannot be published fails with the fixed line only.

## Runs (hosted macOS, image macos26 20261013.0424.1, Node 24.21.0)

| Run | Commit | Result | Why |
|---|---|---|---|
| [39151820084](https://github.com/SSFSKIM/cua/actions/runs/39151820084) | c196f0f | RED 1m28s | four M0 judgements: the OS difference and the missing `state/` (above); everything else PASS |
| [39152036261](https://github.com/SSFSKIM/cua/actions/runs/39152036261) | 0e4b8ba | RED | the same, now named in the log (the reports had not uploaded: upload-artifact skips a dotted directory) |
| [39152309889](https://github.com/SSFSKIM/cua/actions/runs/39152309889) | 93032a9 | RED (no baseline yet) | recorded the baseline |
| [39152577157](https://github.com/SSFSKIM/cua/actions/runs/39152577157) | f0cd3de | GREEN 1m52s | |
| [39152580339](https://github.com/SSFSKIM/cua/actions/runs/39152580339) | f0cd3de | GREEN 1m32s | concurrent with the run above and below |
| [39152583978](https://github.com/SSFSKIM/cua/actions/runs/39152583978) | f0cd3de | GREEN 1m20s | |
| [39153110600](https://github.com/SSFSKIM/cua/actions/runs/39153110600) | 242f662 | GREEN 1m20s | |
| [39153113713](https://github.com/SSFSKIM/cua/actions/runs/39153113713) | 242f662 | GREEN 1m46s | |
| [39154681618](https://github.com/SSFSKIM/cua/actions/runs/39154681618) | afc659a | GREEN 1m23s | the review fixes: judged against the reduced baseline, public forms only in the artifact |
| [39156236619](https://github.com/SSFSKIM/cua/actions/runs/39156236619) | 7f3a398 | GREEN 1m30s | the second review's fixes: judged against the baseline in the explicit public form; the gate's log is only step lines, `hosted-gate:` lines and own-sandbox's labels |

**Flakiness.** Seven of seven runs with the baseline in place were green, three of them concurrent, and every step
passed in each. No result was intermittent. Each of the first three reds was deterministic, a harness or record
problem, and each is fixed above. own-sandbox's 76 and 86 checks have no timing bound that a slower runner could miss:
each takes 4 to 9 s.

**Negative control.** A throwaway commit dropped `~/.config/cua` from the deny list (`src/sandbox/policy.mjs`, never
merged). Run [39152820629](https://github.com/SSFSKIM/cua/actions/runs/39152820629) went RED with 6 failed steps:

- the four baseline judgements: the kernels read `config-cua` (`file-read-data` and `file-read-metadata`
  `deny/allow`), and the workers' `CUA_SANDBOX_DENY_READ` changed;
- own-sandbox on both hosts.

So the gate catches a policy regression.

## Public output

The repository is public, so the gate's log and its failure artifact are public. The raw reports stay in the scratch
root, which is removed at exit: the oracle records (the launch's args, environment and rendered profiles, the checks'
target paths), own-sandbox's free-text details, probe-secrets' stderr excerpts, and install's and doctor's JSON. So does
every producer's stderr: an oracle's child stderr, install's and doctor's own, and the publisher's.

The log carries only:

- each step's PASS/FAIL line, its duration, and the summary;
- own-sandbox's `PASS <label>` and `FAIL <label>` lines;
- the gate's own `hosted-gate:` lines:
  - the run's and the baseline's macOS version and image name;
  - the count of Codex CLI files in the installed tree, and doctor's `sandbox.launcher` status;
  - probe-secrets' step names and statuses;
  - of a failed baseline judgement, the undeclared checks (operation, label, both results) and the **names** of the
    environment variables that differ, never their values;
  - of a command that failed, its exit status and how many stderr lines were withheld, never a line;
- `hosted-public.mjs`'s one failure line, which names the form and the two files' basenames, never the input.

A step whose report could not be published fails, keeping the producer's status when both failed.

The artifact (`hosted-gate-out/`, uploaded only when the gate fails) holds only the allowlisted forms
`scripts/sandbox-probe/hosted-public.mjs` writes:

| File | Holds |
|---|---|
| `oracles/fp-cua-*.json` | `{launcher, fingerprint: {sandboxed, cwd, env, checks: [{op, filter, label, result, errno?}]}, pins?: {ok, rows: [{label, op, want, got}]}}`. `cwd` and the values of the launcher's own variables (`HOME`, `PATH`, `TMPDIR`, `LANG`, `CODEX_SANDBOX`, `CODEX_SANDBOX_NETWORK_DISABLED`, `CODEX_HOME`, `CUA_REPL_NODE_PATH`, `CUA_REPL_NODE_MODULE_DIRS`, `CUA_REPL_SANDBOX_EXEC`, `CUA_SANDBOX_DENY_READ`) are read relative to the run's own roots by `compare.mjs`'s `relativeToRoots`: `<cua-home>/…`, `<home>/…`, `<checkout>/…`, and `<session>` for a session id. Any other variable is published by name with the value `<withheld>`. No check's target, no launch `input`. The baseline's form, and what the gate judges |
| `oracles/image.json` | the runner's macOS and image |
| `oracles/port-vs-signed-*.json` | the comparison's booleans (argv, profile, command equal; `equalButDeviations`), the TIOCSTI form, the first differing profile line's number, the count of differing parameters, the names of differing environment variables; never the args or profiles |
| `own-sandbox-*.json` | `{ok, checks: [{label, pass, code?}]}`; `code` only when it is an error code or a number |
| `probe-secrets.json` | `{status, steps: [{name, status}]}` |
| `doctor.json` | `{ok, checks: [{name, status}]}` |

Judged public form against public form, the fingerprints still show what the raw records did: a check's result or
errno, a change in the workers' `CUA_SANDBOX_DENY_READ` (the negative control below was caught on the workers only
there), `HOME` moving, a variable appearing or going. Both sides arrive relativized, so the comparison finds no root
in either and compares them as they are.

Nothing of install's is published beyond its step line. No secret value is in either:

- own-sandbox's sentinels never leave their cells, and own-sandbox refuses to write a report that contains one;
- probe-secrets scans its own report for both of its generated values and refuses to write it if either is found;
- the fingerprint's environment redacts credential-like names, and the public form withholds every value but the
  launcher's own.

The store is always a scratch store, and no owner profile or real store exists on the runner. The runtime is never
copied out of the scratch root.

## What stays on the mini

Only what needs the owner, a TCC grant or the mini's own state:

- **The native helper's grants.** Anything that needs the native computer-use helper's Screen Recording or
  Accessibility grant: accept-native's native items, native-baseline's computer runs, and parity's computer lanes. The
  grants are per copy and per machine, and a hosted runner cannot grant them at run time.
- **The owner's sittings**: accept-native's TextEdit and secret-delivery items.
- **M0's fingerprint pairs** (golden kernel and signed CLI). They were taken on the mini's macOS 27, which answers
  `file-link` differently from the hosted macOS 26.
- **The measured bounds**: native-baseline's latency comparisons.
- **Checks of the owner's real store.** #115's tier discovery ran against the mini's real store; against synthetic
  stores it is unit-tested.
- **Branded Google Chrome and the owner's real profile.** The hosted browser checks below run Chrome for Testing on a
  fresh profile; a check whose point is the branded browser, its update channel or the owner's profile stays here.

The cfprefs denial check and parity's browser lanes (suites `api` and `docs-profiles`) no longer come to the mini: they
run hosted, in gates `sandbox-denials` and `parity-browser` (below).

This list is also in `scripts/mini-rules.mjs`'s header and in `CLAUDE.md`'s working rules.

## The browser gates: `sandbox-denials` and `parity-browser`

Two more items left the mini, first proven by a spike (branch `spike/159-parity`, commits `bd34cb8..045e040`) and now
two gates in `.github/ci-kit.yml`, lane `hosted-macos`, on ci refs and dispatch, and `sandbox-denials` on pull requests
too (`parity-browser` not yet, below). They are separate gates
so they run on two runners at once. Both run `scripts/repl-parity/hosted/hosted.sh`, which refuses to run anywhere but
a GitHub-hosted macOS runner (`RUNNER_ENVIRONMENT=github-hosted`): it edits `~/.ssh`, starts an sshd and registers a
native host under the real `HOME`, which is acceptable only on a throwaway machine.

**The shared setup** (about 1.5 minutes):

- **A harness Chrome.** Chrome for Testing is preinstalled on the hosted image (`/Applications/Google Chrome for
  Testing.app`, 155.0.8059.39 in these runs). It runs with cua's extension loaded unpacked (`--load-extension`) on
  `$HOME/Library/Application Support/Google/Chrome`, the user-data directory `cua chrome register` looks for. The
  directory is made before register, which otherwise finds no browser (the spike's first run, below).
- **cua's profile `harness`**, after `cua install` and `cua chrome register`: `profiles add harness` on the Default
  profile, then `profiles bind` once a backend is live. Binding answers `pick_required`, reason `unlabelled`, whenever
  it runs before the extension's store records the live backend's instance: the backend is then neither placed in the
  profile's directory nor labelled, and cua never binds an unlabelled backend on its own (`src/profiles/bind.mjs`). The
  step then binds that one backend by its id (`--extension-instance-id`), the pick a user makes. This fallback is
  load-bearing. The spike needed it in 2 of its 3 green runs. The gates' first commit (1f3110d) waited until cua
  would bind on its own, which a review showed can wait out its 90 s for a backend that is live but unlabelled; since
  ed01b17 the wait ends at the first live backend, and all 8 jobs at ed01b17 then bound through the fallback.
- **The runner as its own parity device.** A user-mode sshd on loopback port 2222, reached as the ssh alias
  `hosted-macos`, declared in `scripts/repl-parity/devices.mjs` (darwin). The device's `node` must be the job's.
  `repl-parity prepare --device hosted-macos --profile harness`, and `cleanup-prepared` at the end. Prepare checks the
  tested commit out in the device's parity clone (`$HOME/Developer/GitHub/cua-parity`), which it would clone from
  GitHub and refresh with a plain `git fetch origin`; a pull request's merge commit is on no GitHub ref, so neither
  would bring it. The step therefore makes that clone first from the job's own checkout, fetches the job's `HEAD` into
  it and points its `origin` back at GitHub.

**`sandbox-denials`** (the cfprefs check; timeout 60 minutes): cua's own host runs the `cells` (150 cases) and
`services` (41 cases) suites under `sudo log stream --style ndjson --predicate 'sender == "Sandbox"'`. It passes when:

- both suites' assertions pass;
- node's denials hold no preferences denial: a cfprefsd lookup, a `user-preference-*` operation, or a file in any
  `Preferences` directory, looked for in the raw events before the reduction could class such a file as `<other>`;
- the denials, reduced by `scripts/sandbox-probe/denials.mjs` (node processes only, filesystem targets as classes, ports
  normalised), are each of a declared kind;
  the declared set is #115 M1's accepted after side (`scripts/repl-parity/hosted/denials-declared.json`, judged by
  `denials-within.mjs`);
- the stream stayed up until the suites ended and recorded at least one Sandbox event, so the judgement is never
  vacuous;
- every record parses. The stream is stopped with SIGINT, on which `log` exits 0, and the file is read only once it
  has exited (after 30 s it is killed and the step fails). `log stream` writes each record whole, so a well-behaved
  capture has no partial line: stopped by SIGTERM or SIGKILL mid-stream ten times on a Mac, it left none. The only other
  lines it writes are its banner (`Filtering the log data using …`, first) and a blank line on SIGINT. A record that
  does not parse, mid-stream or last, could be the denial that matters, so it fails the judgement and is reported only
  as a count (`malformed records <n>`).

In every green run of the spike and the gate the reduction held the same kinds, all declared, with no preferences
denial: `file-write-create` (`<other>`, and in most runs `<run directory>`), `file-write-data <other>`, three mach lookups (`com.apple.diagnosticd`,
`com.apple.logd`, `com.apple.system.notification_center`), `network-outbound remote:*:<port>`, and three sysctl reads
(`kern.bootargs`, `kern.iossupportversion`, `security.mac.lockdown_mode_state`).

**`parity-browser`** (timeout 40 minutes): the vendor host and cua's own host run the `api` (290 cases) and
`docs-profiles` (12 cases) suites; each pair is diffed with `test/repl-parity/expected-differences.json` and must show
no undeclared difference (1072 and 36 declared differences matched).

Each gate runs on a pull request only when a change can move what it catches (the dispatching session's ruling,
2026-10-18; the timeouts, 60 and 40 minutes, leave room over the runs below):

- `sandbox-denials` (about 21 minutes): what the kernel and the worker can reach, `src/sandbox/**`, the launch code
  that builds the sandboxed launch (`src/runtime/sandbox.mjs`, `src/runtime/launch.mjs`, `src/runtime/run-dir.mjs`,
  `src/repl-host/supervisor.mjs`), the inputs of its profile (`src/runtime/layout.mjs`, the home's roots;
  `src/secrets/store.mjs` and `src/secrets/label.mjs`, the store and projects folder it denies;
  `src/runtime/managed-node.mjs`, the kernel's Node), the kernel child's spawn (`src/repl-host/kernel-child.mjs`), the
  launches the supervisor brokers (`src/repl-host/launch-services.mjs`) and `bin/cua-codex-compat`; the gate's own files
  (`scripts/repl-parity/hosted/**`) and the reduction (`scripts/sandbox-probe/denials.mjs`); `.github/ci-kit.yml`.
- `parity-browser` (about 9 minutes; the filter selects it on a ci ref, not yet on a pull request): the browser route
  (`src/chrome/**`, `src/browser-service/**`, `src/services/browser.mjs`), cua's own REPL host (`src/repl-host/**`),
  the browser side of its API (`src/cua-api/browser-api.mjs`, `browser-client.mjs`, `bind-tab.mjs`, and
  `documentation.mjs` with `docs/cua-api/**`, which `docs-profiles` reads), `extension/**`, parity's harness and suites
  (`scripts/repl-parity.mjs`, `scripts/repl-parity/**`, `test/repl-parity/**`), and what they import: the browser
  harness repl-parity runs on (`scripts/browser-parity/**`: its runner, comparator, topology and MCP client), the
  browser scenarios and fixture server (`test/browser-parity/**`), the pause gate (`scripts/mini-pause.mjs`,
  `scripts/mini-rules.mjs`, `scripts/accept/key-guard.mjs`), `scripts/harness-home.mjs`, and the server both hosts run
  under (`test/repl-parity/serve-production.mjs`: `src/mcp/**`, `src/profiles/**`, `src/remote/**`, `src/runtime/**`,
  `src/sandbox/**`, `src/secrets/**`, `src/services/secret-input.mjs`, `src/services/sky.mjs`); the pinned runtime
  `cua install` fetches, the vendor host among it (`runtime/releases/**`); `.github/ci-kit.yml`.

A change elsewhere that can still break the shared setup (`cua install`, `chrome register`, `profiles`) is caught by
a dispatch or `ci-gate --gates`, not on its pull request.

**Public output.** The same discipline as `sandbox-live`. The log carries each step's PASS/FAIL/SKIP line with its
duration, the summary, and `hosted-parity:` lines holding only the image and versions, booleans, exit statuses, cua's
outcome and reason codes, each run's counts and failed case ids, each diff's counts and undeclared differences' ids, and
the denial kinds (`scripts/repl-parity/hosted/public.mjs`; an undeclared kind's target shows only when it is a class or
a plain service, sysctl or domain name). Every command's stderr goes to the scratch root; the log gets `stderr withheld
(<n> lines)` only. A run's free-text error is reported only as present. The raw `log stream` output is reduced and
deleted as soon as it is judged, and the scratch root at exit. Neither gate uploads an artifact. Every step's failure
fails the gate; a step that depends on a failed one is reported SKIP. `test/repl-parity/hosted.test.mjs` covers the
judge on doubles (declared kinds pass; an undeclared kind or any preferences denial fails; an empty stream fails; a
truncated or otherwise malformed record fails, mid-stream or last, and its text is never printed), the
readers withholding planted free text, and the refusal off a hosted runner.

### Runs (hosted macOS 26.6.2 (25G83), image macos26 20261013.0424.1, Node 24.21.0)

The spike, one job running both items in sequence:

| Run | Result | Job | Notes |
|---|---|---|---|
| [39151836656](https://github.com/SSFSKIM/cua/actions/runs/39151836656) | RED | 5m26s | `cua chrome register` found no browser user-data directory (Chrome for Testing had not run yet), so no backend went live. Fixed by making the directory first |
| [39152352353](https://github.com/SSFSKIM/cua/actions/runs/39152352353) | GREEN | 29m22s | |
| [39154699163](https://github.com/SSFSKIM/cua/actions/runs/39154699163) | GREEN | 22m45s | cells 604 s, services 357 s; api 179 s vendor and 142 s cua, docs-profiles 13 s each |
| [39154713120](https://github.com/SSFSKIM/cua/actions/runs/39154713120) | GREEN | 30m42s | concurrent with the run above |

The gates: two concurrent runs of both at 1f3110d, two more after the review fixes at ed01b17, two more of
`parity-browser` alone at ed01b17, and after the second review's fixes at 4948394 (the parity clone made from the job's
checkout, the malformed-record check, the SIGINT stop) one run of both and one of `parity-browser` on a probe commit.
The probe (da59e03, never on a branch) differs from 4948394 only in `hosted.sh` committing an empty commit on the
runner before prepare, so the tested `HEAD` was on no GitHub ref, as a pull request's merge commit is; prepare checked
it out. Locally, against a scratch copy with such a commit, the harness's own clone-and-fetch failed (`unable to read
tree`) and succeeded once the clone was made from the checkout.

| Run | Commit | `sandbox-denials` | `parity-browser` |
|---|---|---|---|
| [39158313474](https://github.com/SSFSKIM/cua/actions/runs/39158313474) | 1f3110d | GREEN 20m54s (cells 705 s, services 460 s) | GREEN 10m03s |
| [39158338768](https://github.com/SSFSKIM/cua/actions/runs/39158338768) | 1f3110d | GREEN 20m20s | RED 10m12s: the `waitfor` race (below) |
| [39159480640](https://github.com/SSFSKIM/cua/actions/runs/39159480640) | ed01b17 | GREEN 21m32s | RED 8m36s: cua's `api/browser-cuaapi/drag` assertion (below) |
| [39159500411](https://github.com/SSFSKIM/cua/actions/runs/39159500411) | ed01b17 | GREEN 20m31s (cells 714 s, services 433 s) | GREEN 7m29s |
| [39160825416](https://github.com/SSFSKIM/cua/actions/runs/39160825416) | ed01b17 | | GREEN 9m08s |
| [39160839452](https://github.com/SSFSKIM/cua/actions/runs/39160839452) | ed01b17 | | RED 10m06s: the `waitfor` race |
| [39163456859](https://github.com/SSFSKIM/cua/actions/runs/39163456859) | 4948394 | GREEN 22m03s (cells 781 s, services 447 s; 2,143 Sandbox events, 10 kinds, malformed records 0; `log` exited 0 on SIGINT) | GREEN 9m27s |
| [39163467915](https://github.com/SSFSKIM/cua/actions/runs/39163467915) | da59e03 (probe) | | GREEN 8m37s (`HEAD` a runner-made commit; prepare 23 s) |

Every `sandbox-denials` run passed: 9 or 10 node denial kinds, all declared, no preferences denial, from about 2,100
to 2,200 Sandbox events per run. A run takes about 21 minutes, of which the setup is about 1.5 and the two suites 19.
A `parity-browser` run takes 7.5 to 10 minutes: the setup about 1.5, each host's `api` suite 165 to 265 s, the
`docs-profiles` pair under a minute.

**`parity-browser` is intermittent: 3 of its first 6 runs were red, each for a reason its harness does not control**
(the 2 runs since were green).

- **The `waitfor` race (2 of 6).** One undeclared `semantic` difference in `api/browser-playwrightlocator/waitfor`,
  cell `locator-contract-diagnostics-no-matches`, with both hosts' assertions passing. The cell waits 100 ms for an
  absent selector. Which of two deadlines fires first decides the error's first line: the locator's
  (`Playwright selector deadline exceeded`) or the CDP command's (`Timed out after 1ms waiting for CDP command
  Runtime.evaluate.`). The diagnostics line the cell checks is the same either way, so both sides pass and the diff
  still differs. This was already recorded from the GCE box (`tech-debt-tracker.md`, "A parity cell races two 100 ms
  deadlines"), which names the fix: in the scenario, compare only the diagnostics line or give the cell a deadline
  the CDP command cannot reach first; not a comparison allowance. Until then the gate inherits the race.
- **cua's `drag` assertion (1 of 6).** cua's own host failed the case-level assertion of `api/browser-cuaapi/drag`
  once (1 of 6 cua `api` runs; the other 289 cases passed). The gate withholds the assertion's free-text detail, so the
  failing predicate is not in the log. The likely cause is timing: the drag cell waits only 1.5 s for the page's
  `ended` before reading it (`test/browser-parity/scenarios/input/coordinates.mjs`).

`sandbox-denials` showed no intermittent result in 5 runs, and none in the spike's 3 green ones.

**So `parity-browser` does not run on pull requests yet** (`on: [ci-ref, dispatch]`; ruled by this ticket's executor
under the brief's rule that a flaky gate is worse than none, after the dispatching session had asked for both long gates
on pull requests before the flake was known). It runs by hand: `ci-gate <worktree> --gates parity-browser`, or a
workflow dispatch. Adding `pr` to its `on:` list is the one-line change once the `waitfor` cell is fixed in the scenario
and the `drag` cell's cause is read on a rerun (`tech-debt-tracker.md`).

### What a hosted pass does not show

- **Branded Google Chrome or the owner's real profile.** The harness is Chrome for Testing on a fresh profile. Anything
  that turns on the branded browser (its update channel, its policies) or on the owner's profile and its state stays a
  mini check.
- **The cfprefs before/after comparison.** #115 M1 compared the Codex CLI's profile (before) with cua's (after). The
  Codex CLI profile is gone, so the comparison can no longer run anywhere. The hosted check is one-sided: cua's denials
  stay within M1's accepted after side, with no preferences denial.
- **macOS 27.** Hosted results are evidence for the hosted image's macOS 26.6.2; the mini runs macOS 27, which already
  answers some sandbox checks differently (the `file-link` finding above). A denial kind the newer OS adds would show
  only on the mini.

## Not done here

The vendor runtime is not cached. Install takes 16 to 21 s, so a cache would save little, and it would put the vendor
archive into Actions storage.
