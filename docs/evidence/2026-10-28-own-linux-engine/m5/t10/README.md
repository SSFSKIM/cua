# M5 T10: the Linux default flip, shown live (task 137)

T10 makes cua's own engine the Linux default, with F5's fallback for homes that can't run it yet (the M5 pre-flight,
§3). The flip merges only on the owner's yes, at T9. The design session accepted T10 in rulings 1062 and 1063, and carried it to main 33c8dd09 in ruling 1088.

## Where the checks ran, and how they reach the head

The live checks ran on the twins **A 8f070d5c** and **B 51f6b281**. Both sit on `m5-main-merge-2` at 5c07fb1c, which is
feat 28f22e8a (H8 048140a2, linux-engine-v0.4.3) with main 9c6368ce merged. The twins stay on
`m5-t10-r3-live-9c6368ce`.

Main then moved twice, and each time main was merged into `m5-main-merge-2` and A and B were carried onto it:

| main | merge | A | B |
|---|---|---|---|
| dfe6f443 (#476, 0.28.28) | 460df13a | 7cb308cd | f99f727f |
| 33c8dd09 (#477 and #484, 0.28.30) | d26f0e80 | **3e2e5d5f** | **2e6f309f** |

The last row is the head of `m5-t10-r3`, which carries only A and B. This README and the evidence live on feat's side
(`m5-t10-evidence`), so they land whatever the owner decides. The live checks were not rerun on either (rulings
1063 and 1088). Their reach to 2e6f309f rests on diff identity, checked with `git diff`:

- **Outside `.claude-plugin/`, B minus its twin matches main's own diff.** `git diff 51f6b281 2e6f309f` changes the
  same 23 files, with 3,626 insertions and 128 deletions, as main's own 9c6368ce..33c8dd09.
  - Its added and removed lines, compared as sorted multisets (3,754 lines), are identical to main's.
  - Only context and placement differ: the two diffs are not byte-identical.
- **T10's own change is unchanged.** `git diff d26f0e80 2e6f309f` adds and removes the same lines as
  `git diff 5c07fb1c 51f6b281`.
- **Inside `.claude-plugin/`,** B and its twin are identical (0.29.0).

What main changed after 9c6368ce reaches no Linux path (the reach table, task 137's report §2):

- the macOS engine (Swift);
- its agent-cursor document;
- the docs oracle's darwin lane;
- the macOS engine service's meta keys (`src/services/engine/service.mjs`, which the launch selects only off Linux);
- the tracker.

## How the checks ran

Every part was one `scripts/linux-engine-gate/suites.sh` part:

- with `ENGINE=installed LABEL=counted PINNED_RULE=enforce`;
- on a private display the runner started, never `:0`;
- in the runner's run-owned homes: a temporary HOME and XDG dirs, an empty claude-secrets, and a temporary `CUA_HOME`
  from its own `cua install` at the pin.

| | x64 (dc-linux171) | arm64 (cua-171-arm64) |
|---|---|---|
| When | 2026-11-22 06:00–07:25Z | 2026-11-22 06:01–06:56Z |
| Lock holder | `locked.sh m5-t10-r3` | `locked.sh task137-arm64` |
| Device | `DEVICE=cua-171` | `DEVICE=cua-171-arm64` |
| Engine asset at the pin | `f1513e79…` | `dd74e19b…` |
| Commits | A and B | B only |

The pinned check exited 0 on every home holding the current engine.

## The evidence here

Each part's directory holds what `suites.sh` wrote for it: its fixture or probe reports, the sampler's `watch.json`
and `engine-watch.txt`, `pinned.txt`, the private desktop's `session.json` and watchdog, and the part's logs. The
logs include `suites.log`, each home's `install.out` and the fallback homes' `<kind>-home.json`. R1's parity lanes
and R2's baseline runs are in `explicit/parity/` and `explicit/baseline/`.

| Directory | Host | Commit | Parts |
|---|---|---|---|
| `x64/a-8f070d5c/default/` | x64 | A 8f070d5c | accept, device, fallback |
| `x64/b-51f6b281/default/` | x64 | B 51f6b281 | accept, device, fallback |
| `x64/b-51f6b281/explicit/` | x64 | B 51f6b281 | accept, device, parity, baseline |
| `arm64/b-51f6b281/default/` | arm64 | B 51f6b281 | accept, device, fallback |
| `arm64/b-51f6b281/explicit/` | arm64 | B 51f6b281 | accept, device, parity, baseline |

They were copied unchanged from `~/.local/share/cua-171/task137/live/` on each VM. Before they were committed they
were scanned the way the M5 sets are, across 319 files:

- **Token-shaped strings** (`m5/arm64/scripts/scan-evidence.sh`'s patterns, plain and gz): 0 hits.
- **Secret-adjacent words** (claude-secrets, auth.json, password, cookie, MIT-MAGIC, XAUTHORITY, `_TOKEN`, secret):
  only parity's case names (`secrets/native-live/*`), its double's `NATIVE_SECRET:` status lines, the confirmations
  policy's text, the tool descriptions and `CUA_SHIM_SECRETS: off`. There are no values, every run home's secret store
  was empty, and no file was excluded.
- **Key codes:** none.
- **Window titles:** only the harness's own gedit files (`fallback-…txt`, `fixture-…txt` under `/tmp`).
- **Displays:** every display recorded is the private `:1`. There is no `:0`, and no X socket or `DISPLAY=` other than
  the run's.
- **Screenshots:** none were kept.

## Results

| Commit | Part | Mode | x64 | arm64 |
|---|---|---|---|---|
| A 8f070d5c | R3, R4 | default | **FAIL, as required.** Each stops at "the default selects cua's engine": `the session selects vendor (default), not cua's engine by default`. The selection reads `{mode: default, selected: vendor, reason: default, row: skip}`, and the engine watch fails (no cua-engine) | not run |
| A | fallback ×5 | default | **Exit 1 on all five: the expected negative control** (note 1) | not run |
| B 51f6b281 | R3 | default | **PASS 13/13**, `{selected: cua, reason: default, row: pass}`. Watch PASS: 3,359 samples, sky_linux 0 | **PASS 13/13**. Watch PASS: 3,360 samples, sky_linux 0 |
| B | R4 | default | **PASS 20/20**. Watch PASS: 593 samples, sky_linux 0 | **PASS 20/20**. Watch PASS: 557 samples, sky_linux 0 |
| B | fallback none / previous / released / older / unrecorded | default | **PASS 9/9 each**: `vendor` with `engine_not_installed` / `engine_outdated` ×3 / `engine_unrecorded`, row `warn`. Answered by the home's pinned vendor `sky_linux` under the trusted worker, with no cua-engine | **PASS 9/9 each** |
| B | R3 / R4 | explicit | **PASS 11/11 / 18/18**. Watches PASS (3,355 / 587 samples, sky_linux 0) | **PASS 11/11 / 18/18**. Watches PASS (3,355 / 552 samples, sky_linux 0) |
| B | R1 (parity) | explicit | **PASS.** Vendor: 34 cases, `RECORDED_VENDOR_DEFECT` (3 declared). cua: 34 cases, assertions PASS. Diff exit 0 | **PASS**, the same |
| B | R2 (baseline) | explicit | **PASS**: VERDICT PASS without a top-up, `unproved.txt` empty | **PASS**, the same |

### The fallback homes

`scripts/linux-engine-gate/fallback-home.mjs` makes each home in a run home of its own:

| Home | What it holds | x64 hash | arm64 hash | Reason the default keeps the vendor's engine |
|---|---|---|---|---|
| `none` | no engine | – | – | `engine_not_installed` |
| `previous` | linux-engine-v0.4.2, the pin just before 0.4.3 | `a1314106…` | `25035ca1…` | `engine_outdated` |
| `released` | linux-engine-v0.4.0, what main's released plugin pins | `751ec9be…` | `0cbde8f0…` | `engine_outdated` |
| `older` | linux-engine-v0.3.0 | `5f4a1600…` | `57e699b4…` | `engine_outdated` |
| `unrecorded` | 0.3.0's file beside the current (0.4.3) install.json; verified version null | – | – | `engine_unrecorded` |

0.4.1 is a unit-test row only: it was pinned only on feat, so no released home holds it.

## Notes

1. **A's five fallback probes exiting 1 is the expected negative control.**
   - The probe requires doctor's `warn`, naming the home's reason and `cua install --engine`.
   - Before the flip, `vendor` is the ordinary default, so doctor's engine row is `skip` with reason `default`. There
     is no warning to observe.
   - Each probe fails exactly there: `the session selects vendor (default), not the vendor's engine for
     engine_<reason>`.
   - The r3 brief's "each fallback home passes" on A was wrong (ruling 1063 (1)). The probes pass on B, after the flip.
2. **The fallback homes' asset hashes are observed, not proved by a full pinned check.**
   - Each older engine is placed by cua's own `installLinuxEngine` from that release's pin, which checks the file's
     SHA-256 against the pin.
   - The shaped home's file hash, record and verified version are then read and recorded (`<kind>-home.json`).
   - No `gate.mjs check --pinned` runs on a fallback home. It holds no current pinned engine by design, so there is
     no attestation, version or engine-tree check for it.
