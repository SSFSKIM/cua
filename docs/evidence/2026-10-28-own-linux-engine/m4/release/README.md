# #171 M4: the release `linux-engine-v0.4.0` and the pinned engine (task 80), 2026-11-14

**Status: published, pinned and checked on the released asset.** The published x64 asset is byte-identical to the
gated one, candidate 3's build-only artifact (`751ec9be…`, `../gate/README.md`). So the gate judged exactly the bytes
that ship, and no device scene needed a rerun.

## The release

- **The branch:** `release/linux-engine-v0.4.0`, at the gated commit `c55c8e08d9cbbb057b8b95434787b1e45d41184c`,
  pushed from `scripts/publish.sh`. This repeats M3's procedure with `release/linux-engine-v0.3.0`.
- **The run:** `linux-engine.yml`, dispatched with `commit` c55c8e08… and `publish` true, as run
  [43637317960](https://github.com/SSFSKIM/cua/actions/runs/43637317960). It is a `workflow_dispatch` on the release
  branch at c55c8e08, conclusion success, 20:24:20–20:31:41Z. Every job is green:

  | job | started | finished |
  |---|---|---|
  | version | 20:24:24Z | 20:24:43Z |
  | build x86_64-unknown-linux-musl | 20:24:44Z | 20:31:13Z |
  | build aarch64-unknown-linux-musl | 20:24:54Z | 20:31:13Z |
  | attest | 20:31:15Z | 20:31:31Z |
  | publish | 20:31:33Z | 20:31:40Z |

- **The release:** `linux-engine-v0.4.0`. It targets c55c8e08, was published 2026-11-14T20:31:38Z, and is not a
  draft or a prerelease (`release-view.json`).

**The assets** were downloaded into a new empty directory (`verify.txt`, `scripts/verify.sh`):

| asset | bytes | sha256 | against |
|---|---:|---|---|
| `cua-engine-0.4.0-linux-x64` | 2,134,880 | `751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca` | **equal** to the gated artifact of build-only run 43608161213 |
| `cua-engine-0.4.0-linux-arm64` | 1,839,456 | `0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42` | **equal** to that run's arm64 subject |

- Both digests match the release's `SHA256SUMS` and GitHub's asset digests.
- `file` on x64: `ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), static-pie linked,
  BuildID[sha1]=291b1b02…, stripped`.
- `file` on arm64: `ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV), statically linked, …, stripped`.
- The x64's `--version`: `cua-engine 0.4.0 (c55c8e08d9cb)`.

**The attestations** (`attestation/`; `summary.txt` is the fields below). `gh attestation verify <asset> --repo
SSFSKIM/cua --signer-workflow SSFSKIM/cua/.github/workflows/linux-engine.yml --deny-self-hosted-runners --format json`
exits 0 for each asset. Each asset carries two attestations, because the bytes are the same:
- the release run's: signer `…/linux-engine.yml@refs/heads/release/linux-engine-v0.4.0`, run 43637317960 attempt 1;
- the build-only run's: signer `…@refs/heads/feat/171-m4`, run 43608161213 attempt 1.

Both have predicate `https://slsa.dev/provenance/v1`, source commit c55c8e08…, a GitHub-hosted runner, and the two
subjects above.

**The toolchain** is rustc 1.94.1 (`native/linux-engine/rust-toolchain.toml`), with targets
`x86_64-unknown-linux-musl` and `aarch64-unknown-linux-musl`. arm64 is covered only by the workflow's engine tests,
which ran natively on the arm64 runner (#266, M5).

## The pin

- `node scripts/linux-engine-pin.mjs linux-engine-v0.4.0` exits 0, verifying both attestations (`pin.txt`).
- The pin commit is **ed5bf1bc** ("#171 M4: pin linux-engine-v0.4.0 …"). It changes `runtime/engine/linux-engine.json`
  alone, from 0.3.0 to 0.4.0 with both URLs and hashes.
- `git diff --stat c55c8e08 ed5bf1bc -- native/linux-engine runtime` shows that one file, 6 insertions and 6
  deletions.
- `MIN_ENGINE_VERSION` was already 0.4.0 (`src/services/engine/linux/client.mjs`).
- The tests that read the pin pass at the pin: `linux-engine-pin`, `package-contents`, `linux-engine`,
  `cli-linux-engine` and `repl-parity/archive-cache`, 39 of 39.

## The checks on the released asset

Every check ran from `t80-release`, a git worktree detached at ed5bf1bc and clean, set up by `scripts/setup-release.sh`
(`npm ci`, then xprobe).

Each check ran under `locked.sh t80-release`. Each started only when `hold-sittings` was absent and the tree clean.
The lock's record (`~/.local/share/cua-171/host-lock.log`), with load at acquire, all with render host none:

| check | acquire | release | load at acquire |
|---|---|---|---|
| fresh | 20:34:27Z | 20:34:59Z | 0.78 |
| accept | 20:35:06Z | 20:38:25Z | 0.77 |
| device | 20:38:45Z | 20:39:45Z | 0.53 |
| old | 20:39:52Z | 20:39:56Z | 0.75 |
| old-install | 20:05:54Z | 20:06:24Z | 0.88 |

`scripts/checks.sh` is the procedure, and `scripts/run-part.sh` launches it.

**How this differs from M3's procedure (`../../m3/release/`), and why:**
- **The home.** M3 ran Acceptance 1 and the device fixture in the VM's default home, `HOME=/Users/new`. That home's
  trusted side can reach the owner's secret store, and its fresh-home doctor set only `CUA_HOME`, so it counted the
  owner's stored secrets.
- Here, every check runs in a home of the run's: `HOME`, the XDG directories, an empty `claude-secrets` and `CUA_HOME`,
  all under `~/.local/share/cua-171/task80/homes/<check>`, removed afterwards. Each home's engine is the one that
  home's own `cua install` fetched at the pin. Each check refuses to run if that engine's sha256 is not the pin's, and
  `CUA_LINUX_ENGINE_BIN` is never set. The bytes are the pin's either way. The owner's default home, still on 0.3.0,
  was not touched or upgraded (the controller's ruling).
- **The display and bus.** M3 ran on `:0` and the owner's session bus. Here each check runs inside the M4 facade's
  `private-desktop.mjs --session` (`../facade/scripts/`): a private Xvfb (`:1`), Openbox, and a private bus with
  accessibility on. This is how the gate's R3 and R4 ran, but without the candidate override. The doctor's `display`,
  `accessibility.bus` and `accessibility.enabled` rows therefore name `:1` and the private bus, not `:0` and
  `/run/user/501/bus`.
- Each private desktop's watchdog was clean.

### 1. Fresh home: `cua install --engine` and doctor (`fresh/transcript.txt`, the home shown as `<home>`)

- `install --engine` exits 0: `installed cua's Linux engine 0.4.0 (linux-engine-v0.4.0) at
  <home>/cua/engine/linux/cua-engine`. It also installed the runtime, the sandbox helper and Node.
- The installed engine is a static-pie with `--version` `cua-engine 0.4.0 (c55c8e08d9cb)`. Its sha256, `751ec9be…`,
  equals the pin, and `install.json` names `linux-engine-v0.4.0`, `"build": "pinned"`.
- `CUA_NATIVE_ENGINE=cua cua doctor` exits 0.
  - `PASS engine`: "… sessions here run the pinned cua-engine 0.4.0 (linux-engine-v0.4.0) at
    <home>/cua/engine/linux/cua-engine, SHA-256 751ec9be…, behind service cua (cua's own Linux service); device mode
    shared (…); capabilities, from cua-engine started for this check and stopped: backend x11, build c55c8e08d9cb,
    capture.desktop true, capture.window retained, desktop shared, input.background true, input.desktop true,
    text.literal true, text.paste verified, tree at_spi, version 0.4.0".
  - `PASS accessibility.enabled`: "org.a11y.Status IsEnabled is true on the session bus at <the private bus>, …".
  - `secrets.store` counts 0 secrets, in the run's empty store.
  - The three `chrome.*` rows are BLOCKED because a fresh home has no Chrome registration. They are not about the
    engine.
- No engine process of the home was left, and the home was removed.

### 2. Acceptance 1 on the installed engine (`accept/`)

- `CUA_NATIVE_ENGINE=cua node scripts/accept/linux-native.mjs` ran without `CUA_LINUX_ENGINE_BIN`, under the facade's
  50 ms sampler (`watch.mjs`). **PASS, 11 of 11 steps**, exit 0 (`accept-linux-native-cua.json`).
- The sampler (`watch.json`) took **3,355 samples with at most 0 `sky_linux`**. It saw two `cua-engine` processes,
  both the home's installed binary:
  - the engine, a child of `…/node/24.22.0/bin/node --experimental-vm-modules …/src/repl-host/trusted-worker.mjs`;
  - T7b's launcher shim under `src/repl-host/supervisor.mjs`. It is exempt and never the engine that answers
    (`../README.md`). The gate's R3 saw the same pair.

### 3. The device-mode fixture on the installed engine (`device/`)

- `CUA_NATIVE_ENGINE=cua node scripts/accept/linux-device-mode.mjs` ran unchanged, with no `--engine-bin` and no
  `CUA_LINUX_ENGINE_BIN` (the report's `engineBin` is null). **18 of 18 PASS**, exit 0 (`device-mode.json`).
- Both negative controls pass:
  - "shared, negative control: the editor activated and the front window restored during a shared call fails the
    shared judge";
  - "dedicated, negative control: a call that activates nothing fails the dedicated judge, even granted its effect".
- The sampler took **585 samples with at most 0 `sky_linux`**. It saw four `cua-engine` processes, all the installed
  binary: per mode's `cua serve`, one under the trusted worker and one launcher shim under the supervisor.

### 4. A home still on 0.3.0, after the merge, and its update (ruling 700; `old/`)

**The question:** how does a home whose engine is the old pin's behave under the merged code, now that
`MIN_ENGINE_VERSION` is 0.4.0? And what upgrades it?

**The home** (`old/old-install.txt`) is a run home set up like the others. `cua install` from a checkout whose pin is
linux-engine-v0.3.0 (cua-171 at 4d3085b3) installed `cua-engine 0.3.0 (cd4c929758ca)`, sha256
`5f4a1600e66b7f7b458948462fc4701942583af9674ad41798188d1312687b60`, which is the old pin's x64 asset, hash-checked.

**Under the pin checkout (ed5bf1bc), before the update** (`old/transcript.txt`):
- `CUA_NATIVE_ENGINE=cua cua doctor` **exits 1** ("unhealthy: see FAIL lines"), with:
  > FAIL engine — cua's engine is selected (CUA_NATIVE_ENGINE=cua): sessions here run cua-engine 0.3.0 from
  > linux-engine-v0.3.0 at <home>/cua/engine/linux/cua-engine (SHA-256 5f4a1600…), which is not this cua's pinned
  > 0.4.0: cua install --engine replaces it, behind service cua (cua's own Linux service); device mode shared (…); its
  > capability report could not be read, and sessions here fail the same way: cua-engine 0.3.0 is older than 0.4.0,
  > which this cua needs; run cua install --engine
- The first request, `cua.listApps({emit: false})` in a `js` cell through `cua serve` (`scripts/first-request.mjs`), is
  **refused**. The cell throws, `cua serve` itself stays up and exits 0, and nothing is asked:
  > cua-engine 0.3.0 is older than 0.4.0, which this cua needs; run cua install --engine

**The update.** The exact command is **`cua install --engine`** (here `node bin/cua.mjs install --engine` from the
checkout). It exits 0. The runtime, the sandbox helper and Node were already installed and verified, so it only
replaced the engine: "installed cua's Linux engine 0.4.0 (linux-engine-v0.4.0) at <home>/cua/engine/linux/cua-engine".
The engine is now `cua-engine 0.4.0 (c55c8e08d9cb)`, sha256 `751ec9be…`, equal to the pin.

**After the update:**
- `cua doctor` exits 0, with `PASS engine` "… the pinned cua-engine 0.4.0 (linux-engine-v0.4.0) …, capabilities …
  version 0.4.0".
- The same first request **answers**: `{"ok": true, "apps": 17, "running": 0}`.

**For the owner, after the merge.** On a machine whose cua home still holds 0.3.0, sessions that select cua's engine
(`CUA_NATIVE_ENGINE=cua`, or `"engine": "cua"` in `engine.json`) are refused at their first request with the sentence
above. That sentence names the remedy, and so does the doctor's FAIL row. The fix is to run `cua install --engine`
once. Sessions on the default selection (`vendor`, until M5) do not drive `cua-engine`.

## Files

- `verify.txt`, `release-view.json`, `attestation/`, `pin.txt`: the release, its download, its attestations, the pin.
- `fresh/`, `accept/`, `device/`, `old/`: each check's transcript (`transcript.txt`, with the run home shown as
  `<home>`), its private desktop's `session.json`, and the fixtures' reports and sampler records as they came out.
- `scripts/`: the procedure as it ran: `publish.sh`, `verify.sh`, `attest-summary.mjs`, `setup-release.sh`,
  `checks.sh`, `run-part.sh`, `first-request.mjs`, and `copy-evidence.sh`, which copied this directory and scanned it
  for token-shaped strings (none). Every home here was the run's, with an empty secret store.
- `old-install` ran twice. The first install went into `homes/old-install`, which `old` does not read, because of a
  path bug in `checks.sh` that is fixed in the copy here. That home was removed, and the second run is the record.
