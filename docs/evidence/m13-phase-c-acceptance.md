# M13 evidence: Phase C acceptance (C1-C7)

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M13, acceptance C1-C7. Branch
`feat/chrome-existing-profile`, macOS 26 arm64, host Node 22, pinned runtime `26.928.40906-darwin-arm64`, default
`CUA_HOME`.

**Final verdict (2026-10-04, `be63a0a`): C1-C7 all PASS** (`accept-chrome --all` with the supplied C2 and C6 live
reports, exit 0). The first run (2026-10-03, `cb7b901`, before the live parts) is kept below as history: C1, C4, C5, C7
PASS; C2, C3, C6 BLOCKED on the live parts.

What the `--all` runs did not do: no tab was created, no profile was bound, `--live` and `chrome register --replace`
were not run by them, no native call was made, and `state/codex/auth.json` was never opened. The live parts were run
separately with the user (M11 and M12 evidence) and enter only through their reports.

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

## Final run (2026-10-04 00:27:41Z-00:29:29Z, `be63a0a`, clean tree, exit 0)

```sh
env -u CUA_HOME node scripts/accept-chrome.mjs --all --report /tmp/cua-accept-chrome-all.json \
  --c2-report /tmp/cua-accept-chrome.json --c6-report /tmp/cua-c6-replace.json
```

No runner change was needed after the whole-branch fix waves (no test title the runner names was renamed).

| Item | Status | Evidence |
|---|---|---|
| C1 | PASS | As in the first run: verify default four tools / no browser API; `computer,browser` five tools / browser API; the launch env has no browser variable by default and exactly `BROWSER_USE_AVAILABLE_BACKENDS` + `CUA_BROWSER_VENDOR_SERVICE` with the browser surface; four named tests passed. |
| C2 | PASS | `npm test` 341/341; all seven matrix tests ran and passed by name. Live: `/tmp/cua-accept-chrome.json` (3733 bytes, sha256 `f8825fd8b28bf90d…`, run 2026-10-03T23:59:57Z, the rerun after `1f0cae6`, M11 evidence part 4): profile `personal`, status PASS, all 17 expected steps PASS, leftover `none`. |
| C3 | PASS | Scratch home: add/list/human reasons/remove-only-the-entry/only `profiles.json` written, all PASS. Default home: personal ready after bind (the user's explicit pick, M11 part 4), work and school not ready (extension absent). Seven named tests passed. The live `remove school` on the real registry is recorded below. |
| C4 | PASS | Five tools, 0 js cells, `end_task` noop, exit 0, 0 elicitations; instructions 1990 characters with all four browser rules; `profiles_list` equal to the registry (personal ready, school/work not ready; no directories). |
| C5 | PASS | Doctor exit 0 `ok:true`; `chrome.extension.personal: pass`; `chrome.host.registered: pass (desktop)`; `chrome.hosts.live: pass` (2 hosts); `codex.login: pass`. |
| C6 | PASS | Placement, config and `chrome.host.config: pass`; no-op install (3398 entries identical); register refused with the desktop sentence, unregister all `not_ours (desktop)`, manifests unchanged. `--replace` gate: `/tmp/cua-c6-replace.json` (7470 bytes, sha256 `33554999d02e9e9b…`): serving host class `cua` (Chrome-launched from cua's manifest, socket-level mapping proven, M12 evidence), the round trip through it PASS 17/17 for personal with no leftover (run 2026-10-04T00:24:44Z), and `unregister` `restored/restored` in all five browsers with `blocked:false`. Note from that report: the round trip ran after `unregister` had already restored the desktop's manifests, through cua's host that Chrome had launched and kept running (a host keeps serving until the extension reconnects). |
| C7 | PASS | Clean clone of `be63a0a`: `npm test` 341/341; `build:helper` inside the clone; `test:helper` Swift 55 + Node 7; pack: 60 files, all 11 Phase C modules and every tracked `src/` module, nothing forbidden, no binary content, no token or user-home path, all tracked. |

Afterwards: no native helper process, `run/` empty.

## C3 on the real registry (2026-10-04, default `CUA_HOME`, once each)

Before (00:27:21Z): `profiles.json` held `personal` (Default, bound 2026-10-04T00:24:29Z), `work` (Profile 8, unbound),
`school` (Profile 6, unbound); `profiles list`: personal ready, school and work not ready (extension not installed).

```sh
env -u CUA_HOME node bin/cua.mjs profiles remove school    # exit 0: "removed the registration school; the Chrome profile itself is unchanged"
env -u CUA_HOME node bin/cua.mjs profiles list             # personal ready, work not ready; school gone
```

Afterwards `profiles.json` held exactly `personal` (same directory, binding and `boundAt`) and `work` (unchanged).
Chrome's `Profile 6` directory still existed with the same inode (2515648) and still had no OpenAI extension directory;
cua's commands only read that directory's presence.

```sh
env -u CUA_HOME node bin/cua.mjs profiles add school --chrome-profile "Profile 6"   # exit 0, extension not installed there
env -u CUA_HOME node bin/cua.mjs profiles list                                     # personal ready, school and work not ready
```

At 00:27:34Z the registry again held the user's three keys (`profiles.json` mode 0600), with personal's binding
untouched.

## First run, before the live parts (history)

### Result of the one run against the default home (07:45:57Z-07:47:45Z, exit 3)

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

## Other suites (this checkout)

At `be63a0a` (2026-10-04): `npm test` 341/341, `npm run test:helper` Swift 55 + Node 7 (helper not rebuilt, sha256
`fdad8e2e…` unchanged), probe tests 42/42, original fixtures 11/11, contract fixtures 15/15. At `cb7b901`:

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

## What remains

Nothing for C1-C7. Release gates outside Phase C acceptance stay open: desktop-absent operation on a clean machine,
user-tab operations, downloads, dialogs and frames (README Limitations).
