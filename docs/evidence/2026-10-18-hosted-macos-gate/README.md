# #159: cua's headless macOS live checks on GitHub's hosted macOS runner (2026-10-18)

Ticket SSFSKIM/cua#159, spawned by #115. Branch `feat/159-hosted-macos-gate`.

**The problem.** cua's headless macOS live checks ran only on the Mac mini. The mini is also MAWS's shared CI runner,
so each run either waited for MAWS's queue or needed a runner hold. #115's holds on 2026-10-18 kept MAWS's macOS lane
offline for about two hours.

**The result.** A new ci-kit gate, `sandbox-live` (lane `hosted-macos`, `.github/ci-kit.yml`), runs
`scripts/sandbox-probe/hosted-gate.sh` on GitHub's hosted macOS runner. It runs on every pull request that touches:

- `src/sandbox`, `src/runtime`, `src/secrets`, `src/repl-host` or `src/services`;
- `bin/cua-codex-compat` or `runtime/`;
- the checks' own scripts, or the records they judge against.

A run takes about 1.5 minutes, the runtime install included. A pull request that changes the sandbox policy gets the
oracles' and own-sandbox's results from this gate, with no mini time used.

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
  that run's fingerprints: copy them into `baseline/`.
- **The hosted image moves.** `macos-latest` can change, and a new OS can answer a check differently. The gate prints
  both images. When a baseline judgement fails on a different image, it says so. Record the new baseline from a run of
  main's code (`ci-gate <a main worktree> --gates sandbox-live` fails and uploads it).

## Harness changes

- **`compareFingerprints`** (`scripts/sandbox-probe/compare.mjs`) reads each side's env and cwd relative to that
  side's own roots. The roots are the targets it labels `cua-home`, `home` and `checkout`.
  - A root is matched whole, including inside a JSON value such as `CUA_SANDBOX_DENY_READ`, and never matches a
    sibling that shares its prefix.
  - Both machines' runs then compare even though their paths differ.
  - The mini's M4 judgements, recomputed with it, are unchanged (four ok).
- **`relocateCapture`**, and `oracle.mjs port-vs-capture --relocate <from>=<to>`, move a capture's root in both
  spellings: plain, and the regex-escaped one the original's profile uses for its carve-outs. They also move the
  protected daemon directory's euid.
  - Relocated locally, both modes give `equalButDeviations`.
- **`oracle.mjs fingerprint`** creates the cua home's `state/`. A fresh install has none, and `sandbox_check` reports a
  missing path as denied. The first hosted run read `cua-home/state` as denied for exactly that reason; the mini's home
  had task 1's `state/`.
- **Unit tests** in `test/sandbox-probe/compare.test.mjs` cover the root-relative comparison, the relocation and the
  `hosted-baseline/cua` pair.

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

**Flakiness.** Five of five runs with the baseline in place were green, three of them concurrent, and every step
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

The repository is public, so the gate's logs and its failure artifacts are public. They carry:

- step labels, PASS/FAIL, durations and counts;
- probe-secrets' step names and statuses;
- the image's macOS version;
- the runner's scratch paths;
- the undeclared differences of a failed judgement (check and label names, and environment values that are paths).

They carry no secret value:

- own-sandbox's sentinels never leave their cells, and own-sandbox refuses to write a report that contains one;
- probe-secrets scans its own report for both of its generated values and refuses to write it if either is found;
- the fingerprint's environment redacts credential-like names.

The store is always a scratch store, and no owner profile or real store exists on the runner. The artifact holds the
reports only (about 300 KB, checked: no runtime file).

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
- **The two spikes' items**, by the spike outcome below.

This list is also in `scripts/mini-rules.mjs`'s header and in `CLAUDE.md`'s working rules.

## Spikes

(Pending: cfprefs with a harness Chrome, and parity's browser lanes on a fresh profile.)

## Not done here

The vendor runtime is not cached. Install takes 16 to 21 s, so a cache would save little, and it would put the vendor
archive into Actions storage.
