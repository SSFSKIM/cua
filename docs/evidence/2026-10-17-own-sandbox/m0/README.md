# #115 M0a: the mini oracles (2026-10-17)

The spec is `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md` (Plan of Work, M0). This directory holds what M0a ran on the mini (macOS 27.0, arm64) and the verdicts M1 and M2 build on. The Linux probes, the harness extensions and the baselines are M0b and M0c.

## Verdicts

| Unknown | Verdict | Evidence | Reading |
|---|---|---|---|
| Experiment A: does the public CLI (built from rust-v0.159.2) behave as the signed one? | **Yes.** The confinement cell gives identical outcomes in all four configurations (vendor and own host, scoped and default). The six native calls succeed under both. The helper accepts the public build's app-server: it asks the same three methods and gets the same answers. The public binary is ad hoc signed (no Team ID), and nothing checked that. | `experiment-a/expA-signed-public-*.json`, `experiment-a/exp-*.json` | Promote: the public original is a faithful oracle. The golden generator (built from the same crates) is a valid substitute for the signed binary. |
| Argv capture: what does the signed CLI hand sandbox-exec for cua's two inputs? | **Captured on the first try, both modes.** It is byte-equal to the golden generator's `argsSymbolic` for the same input, profile, `-D` parameters and command (the public build's capture is equal too). The child's environment differs only by the CLI's arg0 `PATH` entry and CoreFoundation's `__CF_USER_TEXT_ENCODING`. | `argv-capture/golden-vs-{signed,public}-{scoped,default}.json`, `argv-capture/capture-*.json` | Promote: the generator's fixtures are the signed binary's output for cua's inputs. eslogger is not needed. |
| App-server capture and replay: does the native helper accept recorded answers? | **Yes.** In every run the helper asked only `initialize`, `configRequirements/read` and `config/read`. Answered from the audited capture (no server notification, no other method), all six native calls succeed in scoped and default sessions, and Finder's approval arrives as before. The helper killed the replay after `config/read`, as it kills the real one. | `app-server/app-server-responses.json`, `app-server/exp-replay-vendor-*.json`, `app-server/replay-vs-signed-*.json` | Promote: M2's compat app-server answers exactly these three methods from this file. No `getAuthStatus` or other method is needed. |
| Fingerprint: the signed CLI against the public build | **Equal** for both modes: every `sandbox_check` row, every attempted link, clone, exec and connect, the environment (arg0 directory normalized), and the cwd. | `fingerprint/fp-compare-signed-public-{scoped,default}.json` | Promote: the fingerprint is the behavioural link M1 compares cua's launcher against. |

There is also a preview of the kernel profile. The original's renderer gets the spec's deny list (the scratch store, `~/.config/cua` and the whole cua home, with `runtimes/` and `node/` re-exposed and the run directory and its temp kept). The profile it renders is enforced by `sandbox-exec` (`fingerprint/fp-golden-kernel-{scoped,default}.json`):

- **Denied:** the home, `state/`, another session's `run/<id>`, the store and `~/.config/cua`.
- **Readable:** `runtimes/`, `node/` and the run directory.
- **Writable:** the run directory and its temp, under scoped only.
- **Link and clone of a store file:** both fail with EPERM.
- **Preferences:** cfprefs reads are denied.

**So the home's nesting is expressible on macOS, and the per-directory fallback (spec, "Policy") is not needed there.** The original renders a deny entry as a `require-not` exclusion of the `/` readable root, and each re-exposed path as its own allowed subpath. No explicit `deny` rule overrides the later allows (`test/fixtures/sandbox/seatbelt/home-nesting.json`).

## What ran

Scratch on the mini: `~/cua-115`.
- `repo`: a clone from GitHub of `feat/115-own-sandbox` with this work rsynced over it.
- `upstream`: openai/codex at `ff6aec96`.
- `home`: a scratch `CUA_HOME` with the pinned release installed from the pinned archive.
- `userhome`: a scratch HOME.

The resident checkout, its agent, the owner's runtime home and Chrome were not touched. Every native helper the runs started quit by itself after its session closed; none was running before any run.

1. **Experiment A.**
   - The public CLI was built with `cargo build --release -p codex-cli`: toolchain 1.95.0 from `rust-toolchain.toml`, 34 min 40 s, `codex-cli 0.159.2`.
   - `scripts/sandbox-probe/experiment.mjs` runs cua's real `serve` (`serve-slot.mjs`) with `CODEX_CLI_PATH` pointed at a per-run slot. The slot is a sh script that runs `cli-slot.mjs`. It execs the CLI under test for `sandbox` (process tree unchanged) and records the `app-server` exchange.
   - Each session runs the confinement cell (`confinementCell`) and, on the vendor host, the spike's six read-only native calls (counts only, Finder's approval accepted for the session).
2. **Golden generator.**
   - `scripts/sandbox-golden/generate.sh ~/cua-115/upstream --check …` wrote `test/fixtures/sandbox/seatbelt/`: 20 cases, 19 rendered and one refused by the original (`symlinked-write-root`).
   - Every rendered profile compiles and runs under `/usr/bin/sandbox-exec` in both TIOCSTI forms on macOS 27.0 (`golden/sandbox-exec-check.json`).
   - A second generation into another directory was byte-identical.
3. **Argv capture.** `scripts/sandbox-probe/oracle.mjs capture` builds cua's own-host kernel launch with cua's own code (`hostSettings`, `kernelLaunch`, `sandboxState`, `sandboxPolicy`) and runs it under `capture-argv.c`. `oracle.mjs golden` renders the same input with the generator and compares (`compare.mjs compareCapture`).
4. **Fingerprint.** `oracle.mjs fingerprint` runs `fingerprint.c` in place of the kernel's command under the same launch. It adds as labelled targets the deny-list locations, another session's run directory, a synthetic store sentinel to link and clone, and harness TCP and Unix listeners. With `--generator`, it runs under the original's kernel-role argv instead.
5. **App-server.**
   - The signed CLI's exchange was recorded by the slot.
   - It was audited (`scripts/sandbox-probe/app-server.mjs audit`): paths rendered as `${CODEX_HOME}`/`${CUA_HOME}`/`${HOME}`, the server notification's `installationId` withheld, and four settings under credential-shaped names kept because they are on the audit's explicit allowlist (`SAFE_SETTINGS`: two flags and two credential-store choices, each by exact path and allowed value). After review, the audit reads camelCase and kebab-case keys and treats every `*_id` as an identifier. Re-running it over every committed exchange (`app-server.mjs reaudit`) changed only the reason recorded for `installationId`; no answer changed.
   - It was then replayed (`--app-server replay`) with the signed CLI still doing `sandbox`.

Commands, with `S` the scratch home's `CodexCLI.app/Contents/MacOS/codex` and `P` the public build. `xcrun clang` on the mini needs `SDKROOT` set to Xcode's SDK: the Command Line Tools' 27.0 SDK has a `libSystem.tbd` that Xcode's ld-1267 cannot read.

```
export SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk
xcrun clang -O2 -Wall -o ~/cua-115/bin-cua-fp scripts/sandbox-probe/fingerprint.c
xcrun clang -O2 -Wall -o ~/cua-115/bin-cua-cap scripts/sandbox-probe/capture-argv.c
node scripts/sandbox-probe/oracle.mjs capture --home ~/cua-115/home --user-home ~/cua-115/userhome --mode scoped --cli "$S" --cap ~/cua-115/bin-cua-cap --out capture-signed-scoped.json
node scripts/sandbox-probe/oracle.mjs golden --generator <cua-sandbox-golden> --capture capture-signed-scoped.json --out golden-vs-signed-scoped.json
node scripts/sandbox-probe/oracle.mjs fingerprint --home … --user-home … --mode scoped --cli "$S" --fp ~/cua-115/bin-cua-fp --label signed --out fp-signed-scoped.json
node scripts/sandbox-probe/oracle.mjs fingerprint --home … --user-home … --mode scoped --generator <cua-sandbox-golden> --fp … --out fp-golden-kernel-scoped.json
node scripts/sandbox-probe/experiment.mjs --home ~/cua-115/home --user-home "$HOME" --config-home ~/cua-115/userhome/.config --scratch ~/cua-115/scratch \
  --host vendor --mode scoped --cli "$S" --app-server forward --native --label signed-vendor-scoped --out exp-signed-vendor-scoped.json
node scripts/sandbox-probe/experiment.mjs … --app-server replay --responses app-server-responses.json --native --label replay-vendor-scoped --out exp-replay-vendor-scoped.json
node scripts/sandbox-probe/oracle.mjs compare-fingerprints|compare-experiments <a> <b> --out <file>
```

## Observations M1 and M2 inherit

- **node_repl does not forward a launch-environment variable to the kernel's sandbox launcher.** It runs the kernel's `codex sandbox` with the kernel's environment only: `CODEX_HOME`, `CUA_REPL_ENABLED_SURFACES`, `HOME`, `LANG`, `NODE_REPL_JS_BANNER`, `NODE_REPL_NODE_MODULE_DIRS`, `NODE_REPL_TRUSTED_RPC_ENABLED`, `NODE_REPL_UNTRUSTED_ENV_ALLOWLIST`, `PATH` and `TMPDIR`. The worker's launcher and the helper's `app-server` get node_repl's whole environment. The variables the spec has the compat executable read (`CUA_COMPAT_NODE`, `CUA_SANDBOX_DENY_READ`) would therefore be missing exactly for the kernel (`experiment-a/exp-signed-vendor-scoped.json`, `slot.invocations[].envNames`). The own host passes its kernel's settings in the same way (`exp-signed-cua-scoped.json`).
- **A native session needs the account's own HOME.** With a scratch HOME every native call failed with `Sky Computer Use native pipe startup failed`. With the account's HOME (and a scratch `XDG_CONFIG_HOME` and `CUA_HOME`) they pass. node_repl evidently finds the app-sandboxed helper's pipe through HOME.
- **Clone of a readable file is allowed by the original's scoped profile.** `clonefile` of a readable file into the run directory succeeds there (`fp-signed-scoped.json`). The deny holds because reading the source is denied: link and clone of the store sentinel fail with EPERM under the kernel profile. Node's `COPYFILE_FICLONE_FORCE` reports ENOSYS under scoped, so a clone test should use `cp -c` or `clonefile`.
- **sandbox_check needs existing targets.** It reports a missing path as denied whatever the profile says, and it cannot be asked about `process-exec` (EINVAL). `fingerprint.c` checks existing targets and attempts exec.
- **The strip list is case-insensitive.** The original strips its non-inheritable names case-insensitively (`node_repl_auth_token` is dropped too; see any fixture's `output.env`).
- **Under default, the kernel needs its run directory re-exposed.** Without it, a kernel whose run directory lies in the denied home cannot even `getcwd`. The spec's re-exposure of `run/<id>` and its temp, read-only under default, is required.
- **The app-server exchange's shape.**
  - Ids are strings (UUIDs) with no `jsonrpc` member.
  - `initialize.params.clientInfo` is `codex-computer-use` 26.924.1001281.
  - The helper sends no `initialized` notification.
  - `config/read`'s `origins` names `${CODEX_HOME}/config.toml`, which the helper writes with its `notify` entry under `${CUA_HOME}`.
  - The real server's object key order varies between runs; the values are equal.
