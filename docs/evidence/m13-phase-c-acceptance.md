# M13 evidence: Phase C acceptance (C1-C7), non-live part

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M13, acceptance C1-C7. Branch
`feat/chrome-existing-profile`, run on 2026-10-03 at `cb7b901` (clean working tree), macOS 26 arm64, host Node 22,
pinned runtime `26.928.40906-darwin-arm64`, default `CUA_HOME`.

What this run did not do: no tab was created, no profile was bound, `--live` and `chrome register --replace` were not
run, no native call was made (no native helper ran before or after), `profiles remove school` was not run in the
default home, and `state/codex/auth.json` was never opened. The live parts (C2's round trip, C6's `--replace` gate)
need the user and are BLOCKED below with their exact steps.

## The runner

```sh
node scripts/accept-chrome.mjs --all --report <file> [--c2-report <live C2 report>] [--c6-report <--replace gate report>]
```

`scripts/accept-chrome.mjs` dispatches `--all` to `scripts/accept/chrome-all.mjs` before its own (unchanged) `--live`
code; the verdict rules are pure functions in `scripts/accept/chrome-all-lib.mjs`, tested by
`test/accept-chrome-all.test.mjs` (20 tests). Each item rolls up its checks the native runner's way: PASS only when every
check ran and passed; a skipped, missing or human-dependent check is FAIL or BLOCKED and names the command. A live part
enters only as a supplied report: `--c2-report` takes an `accept-chrome --live` report (scenario, profile `personal`,
overall PASS, all 17 expected steps PASS, leftover `none`); `--c6-report` takes
`{scenario: "C6-replace-live-gate", servingHost: {pathClass: "cua"}, roundTrip: <a passing --live report run while cua's
host was registered>, unregister: <cua chrome unregister --json>}` with every replaced manifest `restored`. The live
`register` refusal and the `unregister` no-op run only while no browser's manifest names cua's host (so a `--replace`
gate in progress is never disturbed); the five manifests and `<home>/chrome` are fingerprinted (sha256, mtime, inode)
before and after each.

## Result of the one run against the default home (07:45:57Z-07:47:45Z, exit 3)

```sh
env -u CUA_HOME node scripts/accept-chrome.mjs --all --report /tmp/cua-accept-chrome-all.json
```

| Item | Status | Evidence |
|---|---|---|
| C1 | PASS | `verify.mjs` default: four tools, browser API not documented, no problems; with `computer,browser`: five tools incl. `profiles_list`, browser API documented, no problems. The launch `cua serve` builds (buildLaunch, not spawned): by default `CUA_REPL_ENABLED_SURFACES=computer`, trusted services `sky`, no browser variable; with both, `computer,browser`, services `sky, browser`, browser variables exactly `BROWSER_USE_AVAILABLE_BACKENDS` (chrome) and `CUA_BROWSER_VENDOR_SERVICE`. Four named surface/launch tests passed. |
| C2 | BLOCKED | Hermetic: `npm test` 332/332, and each of the seven matrix tests (both shapes, ordinary values, invalid/unknown labels, secrets off/unavailable, unsupported shape, vendor rejection, `{ok:false}` envelope) ran and passed by name. Live: BLOCKED, "personal not bound; user pick pending": the user picks personal's backend, then `node bin/cua.mjs profiles bind personal --extension-instance-id <id>`, then `node scripts/accept-chrome.mjs --live --profile personal --report /tmp/cua-accept-chrome.json`, then rerun `--all --c2-report /tmp/cua-accept-chrome.json`. |
| C3 | BLOCKED | Scratch home (deleted afterwards): `add personal Default` (extension installed), `add work "Profile 8"`, `add school "Profile 6"` (extension absent); `list --json` personal `not_bound`, work/school `extension_not_installed`; the human list names each reason; `remove school` removed only that entry (others byte-equal, Chrome's `Profile 6` still present); only `profiles.json` written. Default home (read only): work and school not ready (extension absent); **personal ready after bind: BLOCKED** (not bound; user pick pending). Seven named registry/bind tests passed. |
| C4 | PASS | One `cua serve` connection (computer,browser, secrets off): five tools, 0 js cells, `end_task` noop, exit 0, 0 elicitations, no connection directory left. Instructions 1990 characters, carrying `cua.getBrowser({extensionInstanceId})`, `tab.playwright`, `timeout_ms of at least 60000` and the leftover-tab rule. `profiles_list` equalled the registry (personal not_bound, school/work extension_not_installed; no directories, no instance ids). |
| C5 | PASS | `doctor --json` exit 0, `ok:true`; `chrome.extension.personal: pass`; `chrome.host.registered: pass (desktop)` naming the desktop's plugin-cache host; `chrome.hosts.live: pass` (1 host); `codex.login: pass`. |
| C6 | BLOCKED | Placement: host, `extension-host-config.json` and `component.json` present; `codexHome` is `$CUA_HOME/state/codex`; doctor `chrome.host.config: pass`. A no-op `cua install` (archive argument that does not exist): `changed:false`, `chromeHost.changed:false`, 3398 release entries identical. `chrome register` without `--replace`: exit 1, `registration_in_use`, "…in chrome (desktop), edge (desktop), brave (desktop), opera (desktop), vivaldi (desktop): the desktop's registration is in use and already works with `cua serve`. Nothing was changed."; manifests unchanged. `chrome unregister`: exit 0, all five `not_ours (desktop)`, manifests unchanged. **`--replace` live gate: BLOCKED** with the steps of `docs/evidence/m12-host-placement.md` (register --replace, doctor, extension reconnect by the user, `ps` for cua's host, `--live` round trip, unregister, doctor, then `--c6-report`). |
| C7 | PASS | Clean clone of `cb7b901` in `/tmp` (removed): `npm test` 332/332; `build:helper` exit 0 inside the clone; `test:helper` Swift 55 + Node 7 passed; `npm pack --dry-run`: 60 files, all 11 Phase C modules and every tracked `src/` module present, no forbidden path (archive, runtime, host binary, plugin tree, registration, backup, `profiles.json`, state, credential), no Mach-O/zip/gzip content, no token-like string or user-home path, every file tracked. |

After the run: no native helper process, `run/` empty, no `<home>/chrome/` created, this checkout's helper unchanged
(sha256 `fdad8e2e…` before and after).

## Other suites (this checkout, same commit range)

```sh
npm test                                                     # 332/332 (311 at 12f174f; +1 profiles, +20 runner)
npm run test:helper                                          # Swift 55 + Node 7; production helper not rebuilt
node --test 'scripts/probe/chrome/original/test/*.test.mjs'  # 42/42
node scripts/probe-chrome-original.mjs --fixtures --report /tmp/m13-orig-fixtures.json      # 11/11
node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/m13-contract-fixtures.json  # 15/15
```

Two development runs of `--all` used a throwaway scratch home (`install --archive` into `/tmp`, deleted afterwards);
there the register refusal and unregister no-op ran against the same real desktop manifests (cua's host path in a
scratch home is never the manifests' path) and changed nothing.

## What remains for the user

1. Pick personal's backend; bind it with `--extension-instance-id`; run `--live`; rerun `--all --c2-report` (C2, C3).
2. The `--replace` gate with the user, assembled into a `--c6-report` (C6).
