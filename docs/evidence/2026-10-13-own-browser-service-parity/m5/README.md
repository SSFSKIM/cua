# M5 (task 2): the capability-host group, and the MAWS probe and Linux runners on the default selection

Spec `docs/doperpowers/specs/2026-10-13-own-browser-service-design.md`, M5. 2026-10-14. The cua branch
`feat/own-browser-service-m5` after task 1 landed (a10dcac, 9cd4853: cua's service is the default); the runs below
leave CUA_BROWSER_SERVICE unset, so the default answers, and each attests which service that was.

## Capability-host group (raw CDP, WebMCP, auth handoff, history)

`capability-host/diff.txt`: how it runs and where (this Mac, real `cua serve` and REPL client, the test backend
`test/browser-parity/capability-host.mjs` as the only backend), vendor against vendor 0 differences, vendor against cua
0 unexpected differences (5 expected, all in the auth handoff's `qr` cell).

## MAWS client mode (acceptance 8), default selection: PASS

```
MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && MAWS_E2E_QUIET=1 /tmp/maws-review/with-slot.sh \
  env -u CUA_BROWSER_SERVICE MAWS_CHECKOUT=/Users/new/Developer/GitHub/MAWS-wt-cua-browser-service CUA_HOME=/tmp/cua-m4-home \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out .../m5/maws/maws-live-default.json
# exit 0
```

Same MAWS worktree (detached at origin/master d33de1c4, unchanged) and scratch home as M4, cua at 39192b0's tree.
`maws/maws-live-default.json`: verdict PASS, exit 0; service `cua` (the documentation's `cua browser service 0.1.0`
marker); every maws-features step PASS (profiles, service, createTab, locator, viewport, popup, download, alert,
confirm, chooser, cleanup, isolation); the browser's profileName `MAWS` (instance `maws:m4-A`); cursor messages 0 → 4
on a locator click; announced capabilities browser `[viewport]`, tab `[]`; history rejects "No handler registered for
method: getUserHistory" (MAWS has none); the takeover: default budget fails at 3,015 ms with "Playwright selector
deadline exceeded", `#state` waiting; `click({timeoutMs: 15000})` succeeds at 3,260 ms (3,269 ms after the person's
click), `#state` submitted:x; serve exited 0. No elicitations. The e2e group `pnpm e2e:browser-cua` was not re-run: it
drives MAWS's fake host and never starts cua (M4 README), so the default flip cannot reach it.

## Linux (acceptance 9), default selection: PASS

The cua-linux VM as in M4: `~/cua-m4` updated to 39192b0 (`git checkout --detach`, `npm ci`), its launcher registered
from `~/cua-m4` for the runs (`node bin/cua.mjs chrome register`, CUA_HOME=/home/admin/.local/share/cua-h4), Chrome
started with `--profile-directory=Default --disable-extensions-file-access-check about:blank` in the X session, then
stopped, and the launcher registered back to `~/cua` afterwards.

```
cd ~/cua-m4 && export DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority CUA_HOME=/home/admin/.local/share/cua-h4 CUA_SHIM_SURFACES=browser
unset CUA_BROWSER_SERVICE
node scripts/accept/linux-chrome.mjs me             # exit 0, status PASS
node scripts/accept/linux-chrome-features.mjs      # exit 0, status PASS
```

`linux/linux-chrome-default.json`, `linux/linux-features-default.json`: every step PASS; "the selected browser service
answers" PASS with requested `cua` (the default) and served `cua browser service 0.1.0`. The one SKIP is informational,
as in M4 (the raw-CDP download alternative: the host announces no `cdp`).
