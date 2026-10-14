# M5 (task 2): the capability-host group, and the MAWS probe and Linux runners on the default selection

Spec `docs/doperpowers/specs/2026-10-13-own-browser-service-design.md`, M5. 2026-10-14. The cua branch
`feat/own-browser-service-m5` at 237f91e, after task 1 and its refinement landed (a838239: with CUA_BROWSER_SERVICE
unset, a home with cua's Chrome registration, or MAWS client mode, gets cua's service; otherwise the vendor's). The
MAWS and Linux cua passes leave CUA_BROWSER_SERVICE unset, so that default answers; each has a control run with
CUA_BROWSER_SERVICE=vendor; every run attests which service served it (the documentation's `cua browser service`
marker against the requested selection).

## Capability-host group (raw CDP, WebMCP, auth handoff, history)

`capability-host/diff.txt`: how it runs and where (this Mac, real `cua serve` and REPL client, the test backend
`test/browser-parity/capability-host.mjs` as the only backend), vendor against vendor 0 differences, vendor against cua
0 unexpected differences (5 expected, all in the auth handoff's `qr` cell).

## MAWS client mode (acceptance 8): PASS on the default (cua), vendor control PASS

Run from a clean detached worktree of 237f91e (`/tmp/cua-m5-clean`, removed afterwards; the shared worktree had another
task's uncommitted edits), the same MAWS worktree (detached at origin/master d33de1c4, unchanged) and scratch home
`/tmp/cua-m4-home` (the runtime only; no Chrome registration, so MAWS client mode is what selects cua) as M4:

```
MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && MAWS_E2E_QUIET=1 /tmp/maws-review/with-slot.sh \
  env -u CUA_BROWSER_SERVICE MAWS_CHECKOUT=<MAWS worktree> CUA_HOME=/tmp/cua-m4-home \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out m5/maws/maws-live-default.json   # exit 0
... the same with env CUA_BROWSER_SERVICE=vendor --out m5/maws/maws-live-vendor.json                                    # exit 0
```

| check | default (`maws/maws-live-default.json`) | vendor control (`maws/maws-live-vendor.json`) |
|---|---|---|
| verdict, exit code | PASS, 0 | PASS, 0 |
| service: requested / served | cua / `cua browser service 0.1.0` | vendor / vendor |
| maws-features (profiles, service, createTab, locator, viewport, popup, download, alert, confirm, chooser, cleanup, isolation) | all PASS | all PASS |
| `hello.profileName` | `MAWS` (instance `maws:m4-A`) | same |
| `cursor.move` | messages 0 → 4 on a locator click | 0 → 4 |
| announced capabilities | browser `[viewport]`, tab `[]` | same |
| takeover, default budget | fails at 3,014 ms "Playwright selector deadline exceeded", `#state` waiting | fails at 3,033 ms, same |
| takeover, `click({timeoutMs: 15000})` | succeeds at 3,251 ms (3,269 ms after the person's click), `#state` submitted:x | fails at 3,025 ms (the 3 s cap) |
| serve exit | 0 | 0 |

The e2e group `pnpm e2e:browser-cua` was not re-run: it drives MAWS's fake host and never starts cua (M4 README), so
the default cannot reach it. (Earlier the same day, at e14c74c, a default run was taken from the shared worktree while
task 1's route-aware default was uncommitted there; it is superseded by the run above.)

## Linux (acceptance 9): PASS on the default (cua), vendor control PASS

The cua-linux VM as in M4: `~/cua-m4` at 237f91e (`git checkout --detach`, `npm ci`), its launcher registered from
`~/cua-m4` for the runs (`node bin/cua.mjs chrome register`, CUA_HOME=/home/admin/.local/share/cua-h4, a home with
cua's registration record and no vendor record; `cua doctor`'s new row reads "browser.service: cua ... CUA_BROWSER_SERVICE
is unset and this home has cua's Chrome registration"), Chrome started with `--profile-directory=Default
--disable-extensions-file-access-check about:blank` in the X session, then stopped, and the launcher registered back to
`~/cua` afterwards.

```
cd ~/cua-m4 && export DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority CUA_HOME=/home/admin/.local/share/cua-h4 CUA_SHIM_SURFACES=browser
unset CUA_BROWSER_SERVICE
node scripts/accept/linux-chrome.mjs me                                   # exit 0, PASS
node scripts/accept/linux-chrome-features.mjs                             # exit 0, PASS
CUA_BROWSER_SERVICE=vendor node scripts/accept/linux-chrome.mjs me        # exit 0, PASS
CUA_BROWSER_SERVICE=vendor node scripts/accept/linux-chrome-features.mjs  # exit 0, PASS
```

`linux/linux-{chrome,features}-default.json`: every step PASS, "the selected browser service answers" requested `cua`
(the default), served `cua browser service 0.1.0`. `linux/linux-{chrome,features}-vendor.json`: every step PASS,
requested and served `vendor`. The one SKIP on the features runs is informational, as in M4 (the raw-CDP download
alternative: the host announces no `cdp`).
