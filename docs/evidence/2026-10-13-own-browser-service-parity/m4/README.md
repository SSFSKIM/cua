# M4: cua's browser service under MAWS client mode and on the Linux route (acceptance 8 and 9)

Spec: `docs/doperpowers/specs/2026-10-13-own-browser-service-design.md`, M4. cua branch `feat/own-browser-service-m4`
(runs at 629cd6a: e2cfe57 plus the runners' service attestation). 2026-10-14, 12:35 to 13:50 UTC (the MAWS live reports re-run at 13:47 and 13:49 after the probe gained its verdict and shutdown path). Every run below
records which service answered: the runners' new step "the selected browser service answers" / `service` compares
CUA_BROWSER_SERVICE with the selected browser's documentation (`cua browser service 0.1.0` marker on cua's, none on
the vendor's), so a run cannot pass on the wrong service.

## Linux (acceptance 9): PASS on both services

The cua-linux Tart VM (aarch64, Ubuntu 24.04, Chrome 154, Node 22.23.3), user `admin`, over ssh with the X session's
environment `DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority`. The branch was cloned to `~/cua-m4` (`npm ci`). The cua
route's home is the VM's existing `CUA_HOME=/home/admin/.local/share/cua-h4` (profile `me` = Chrome `Default`, bound
2026-10-07 to extension instance ee43424f-…, cua extension 0.3.0 force-installed); for the runs its launcher was
re-registered from `~/cua-m4` (`node bin/cua.mjs chrome register`) so the host is this branch's, and restored to `~/cua`
afterwards. Chrome was started for the runs (`google-chrome --profile-directory=Default
--disable-extensions-file-access-check about:blank`) and stopped afterwards; the flag is the VM's known prerequisite
for `setFiles` (`docs/evidence/2026-10-08-downloads-dialogs-chooser.md`, "File chooser").

```
cd ~/cua-m4 && export DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority CUA_HOME=/home/admin/.local/share/cua-h4
CUA_BROWSER_SERVICE=cua    CUA_SHIM_SURFACES=browser node scripts/accept/linux-chrome.mjs me           # exit 0, PASS
CUA_BROWSER_SERVICE=cua    CUA_SHIM_SURFACES=browser node scripts/accept/linux-chrome-features.mjs me  # exit 0, PASS
CUA_BROWSER_SERVICE=vendor CUA_SHIM_SURFACES=browser node scripts/accept/linux-chrome.mjs me           # exit 0, PASS
CUA_BROWSER_SERVICE=vendor CUA_SHIM_SURFACES=browser node scripts/accept/linux-chrome-features.mjs me  # exit 0, PASS
```

Reports: `linux/linux-chrome-{cua,vendor}.json`, `linux/linux-features-{cua,vendor}.json`. Every step PASS on both
(route cua, profile ready, the host from `~/cua-m4` at its pre-listed socket, the attested service, example.com's
title, the features page's marker, the download's bytes by sha256, alert, confirm, the 1,234-byte upload, tab closed,
end_task with no owned tab left, serve exited cleanly, no run entry left). The one SKIP is informational on both (the
raw-CDP download alternative: the host announces no `cdp`). Elicitations: none on cua; three on the vendor (origin
access, download, upload, each accepted for the served page only).

A first pair of feature runs with Chrome started without the flag failed the chooser step identically on both services
("enable 'Allow access to file URLs'", the vendor's sentence naming the ChatGPT extension, cua's the cua extension):
the environment, not the service.

## MAWS client mode (acceptance 8)

MAWS worktree `/Users/new/Developer/GitHub/MAWS-wt-cua-browser-service`, detached at origin/master d33de1c4,
`pnpm install --frozen-lockfile`, unchanged (no file edited). Electron 44.4.5, Node 22.23.2.

### The e2e group as the acceptance names it: 7/7 on both selections, and it does not run cua

```
CUA_BROWSER_SERVICE=cua MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && MAWS_E2E_QUIET=1 /tmp/maws-review/with-slot.sh pnpm -C <MAWS worktree> e2e:browser-cua
(unset)                 MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && MAWS_E2E_QUIET=1 /tmp/maws-review/with-slot.sh pnpm -C <MAWS worktree> e2e:browser-cua
```

`maws/e2e-browser-cua-cua.txt` 7 passed (2.6 m); `maws/e2e-browser-cua-unset.txt` 7 passed (25.9 s). An earlier cua-
selection run under a 1-minute load near 70 timed out in scene 2 (`maws/e2e-browser-cua-cua-run1-under-load.txt`); that
scene drives MAWS with the fake host only, so it was load, and the re-run passed.

`e2e/browser-cua.spec.ts` drives MAWS's primitive server with MAWS's in-repo fake host (`test/support/cua-fake-host.ts`)
and, in its seventh scene, an engine stub that starts a connector (`test/support/cua-engine-stub.mjs`): no scene starts
`cua serve`, cua's host or a browser service, so CUA_BROWSER_SERVICE reaches nothing there and the group passes the same
whatever it says. The cua service's live proof under MAWS is therefore the run below.

### cua against a real MAWS: PASS on cua, with the vendor as control

`maws-live/launch.cjs` runs MAWS's own `spikes/cua-backend/serve-plain.cjs` (the worktree's built main under the bare
Electron binary, no Playwright client on its pages, the e2e seam, a transparent click-through window, a profile under
`/tmp`) for two app sessions `m4-A` and `m4-B`, and makes the driver's process a trusted root (the seam's `trustRoot`),
as an engine is for its own tree, so the `cua serve` the driver starts and that serve's own host in client mode pass
MAWS's peer check. It also answers the person's click on the session's leased tab (the seam's `sendInput`) and reads
the tab's control and the agent cursor's message count. `maws-live/run.mjs` drives it and judges the run
(`maws-live/verdict.mjs`, written into the report as `verdict` and returned as the exit code): no error, MAWS trusted
the probe, every maws-features step PASS with the service and popup steps named, `profileName` `MAWS`, the cursor
messages rising, the default-budget click stopping at the deadline with `#state` waiting, and the raised-budget click
going through no earlier than the 3 s hand-back on cua or stopping at the 3 s cap on the vendor. SIGINT, SIGTERM and
SIGHUP take the same shutdown path as a normal end (its own session, MAWS, the scratch directories, the report) and
exit nonzero; `test/maws-live-probe.test.mjs` proves the verdict and, with a fake Electron, the start-up failure and
both signals offline:

```
MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && MAWS_E2E_QUIET=1 /tmp/maws-review/with-slot.sh \
  env MAWS_CHECKOUT=<MAWS worktree> CUA_HOME=/tmp/cua-m4-home CUA_BROWSER_SERVICE=cua|vendor \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out <report>
```

`CUA_HOME=/tmp/cua-m4-home` is a scratch home holding only an APFS clone of the installed runtime
(26.928.40906-darwin-arm64) and `current.json`, so neither service can list or reach a Chrome host of this Mac; the
default selection is MAWS's by CUA_BROWSER_BACKENDS. No Chrome was launched or read.

| check | cua (`maws/maws-live-cua.json`) | vendor (`maws/maws-live-vendor.json`) |
|---|---|---|
| verdict, exit code | PASS, exit 0 | PASS, exit 0 |
| maws-features: profiles, service, createTab, locator, viewport, popup, download, alert, confirm, chooser, cleanup, isolation | all PASS; service `cua browser service 0.1.0` | all PASS; service `vendor` |
| `hello.profileName` | the browser's `profileName` `MAWS`, instance `maws:m4-A` | same |
| `tabs.adopted` (popup step) | exactly one tab added, `/popup`, listed as the agent's and closed by end_task | same |
| `cursor.move` | a locator click raised MAWS's cursor messages 0 → 4 | 0 → 4 |
| announced capabilities | browser `[viewport]`, tab `[]` | same |
| `browser.history({limit: 1})` | rejects "No handler registered for method: getUserHistory" (MAWS has none) | rejects: the vendor's history approval, declined by the harness's policy |
| takeover, default budget: the person clicks, then `locator('#submit').click()` | fails at 3,078 ms "Playwright selector deadline exceeded"; `#state` waiting | fails at 3,093 ms, same sentence; waiting |
| takeover, `click({timeoutMs: 15000})` | succeeds at 3,251 ms (3,269 ms after the person's click), `#state` submitted:x | fails at 3,039 ms, same sentence (the 3 s cap) |
| elicitations | none | origin access, download, upload (served page only) |
| serve exit | 0 | 0 |

The takeover rows are the hold through `debugger.sendCommand.timeoutMs` working end to end: MAWS holds each acting
command for at most min(1.5 s, the timeoutMs the host passes − 0.1 s) and refuses it while the person holds the tab;
cua's service carries the command's remaining budget into every host call and its resolution keeps retrying within
that budget, so with 15 s it goes through right after MAWS's 3 s hand-back, while at the default 3 s both services stop
with the vendor's sentence. The 15 s row's difference is the lifted clamp maximum (the spec's "Lifted"), the departure
`test/browser-parity/expected-differences.json` already records for `actions/slow-budget` and `evaluate/budget`.

Optional capabilities: MAWS's client mode (cua's host in client mode, `src/chrome/host.mjs` getInfo) announces only the
browser capability `viewport`, so the success paths of raw CDP, WebMCP, auth handoff (`browserAuth`) and history still
have no live host and stay proven by unit tests only; history's live answer is the host's refusal, as on the Chrome
route.

## Gates at the M4 head

```
HOME=/tmp/cua-scratch-home npm test     # tests 1654, pass 1646, fail 0, skipped 8
npm run test:mods                       # 32 pass
claude plugin validate .                # passed; the one known CLAUDE.md warning
```
