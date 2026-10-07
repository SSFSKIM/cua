# H1 evidence: the vendor browser service against cua's host, with a fake cua extension

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, milestone H1 (ii). Run on 2026-10-07, macOS
26 arm64, host Node 22.23.2, pinned runtime `26.928.40906-darwin-arm64` in a scratch `CUA_HOME` (`cua install`, never
`cua login`).

**No Chrome.** `src/chrome/host.mjs` runs as its own process, spawned the way Chrome spawns it: stdin/stdout are the
native-messaging port and its environment is exactly `{CUA_HOME}`. On that port is the fake cua extension
(`test/helpers/fake-cua-extension.mjs`): synthetic windows, tabs, groups and debuggees, and a blank-page CDP
responder (`scripts/probe/chrome/host-layer.mjs` `blankPageCdp`) that answers the service's own page reads and emits
the load events a blank page fires. The vendor service is launched with M7's allowlisted environment, network at the
vendor default, `BROWSER_USE_AVAILABLE_BACKENDS=chrome`, `BROWSER_USE_BACKEND_PATHS=$CUA_HOME/chrome/b/<name>.sock`,
and a fresh `CODEX_HOME` with no `auth.json`.

```sh
export CUA_HOME=/tmp/cua-s0.XXXXXX      # the S0 scratch home, runtime installed
node scripts/probe-chrome-contract.mjs --vendor --backend host --report /tmp/cua-h1.json   # ~8 s
```

## Results (four runs, all PASS)

| Scenario | Result |
|---|---|
| `h1-launch`: the host listened after hello; no token, security-mode or ambient-network switch reached the vendor; host env `{CUA_HOME}` only; no `auth.json` | PASS |
| `h1-getinfo-kept-as-chrome`: `listBrowsers` lists exactly the host, `type:"extension"`, the fake's instance id | PASS |
| `h1-create-and-attach`: `createBrowserTab` returned tab 101; the host asked for `tabs.create {url:"about:blank", group:{key:<session_id>, title:"cua"}}`, then `debugger.attach {tabId:101}` | PASS |
| `h1-cdp-roundtrip`: `Runtime.evaluate` reached the extension; the agent's `tab.playwright.evaluate(...)` returned the fake's `h1-roundtrip:…` answer | PASS |
| `h1-turn-end`: `turn_ended` → the host detached and closed tab 101; `<name>.json` lists the session with no tab | PASS |
| `h1-header-policy-skipped`: no identity error in any cell; session requests reached the host | PASS |
| `h1-host-exit`: the port closing → exit 0, socket and status file removed | PASS |
| `sentinel-non-disclosure` | PASS |

What the extension was asked, in order (one run): `tabs.query ×2` (the service's `getUserTabs` and `getTabs`),
`windows.query`, `tabs.create`, `debugger.attach`, then CDP through `debugger.sendCommand`:
`Emulation.setFocusEmulationEnabled, Page.enable, Runtime.enable, Fetch.enable, Target.setAutoAttach,
Runtime.evaluate (location probe), Page.enable, Page.getFrameTree, Page.getNavigationHistory, Page.navigate,
Page.getFrameTree`, `tabs.get` (the service's `getCommittedTabUrl`, answered by the host, not its fallback),
`Runtime.evaluate ×2` (Playwright helper injection, aria snapshot), `Page.startScreencast, screencastFrameAck,
stopScreencast, getLayoutMetrics, captureScreenshot`, `tabs.get`, `Page.getFrameTree, Page.createIsolatedWorld,
Runtime.evaluate` (the agent's evaluate), and at turn end `debugger.detach`, `tabs.remove`.

The host's log for that run: `start`, `hello instance=… protocol=1 socket=a829d0928844`, `listening
$CUA_HOME/chrome/b/a829d0928844.sock`, `session … opened`, `session … turn … ended`, `session … closed with its
client`, `native port closed (end)`, `exit 0 (port_closed)`; 2.9 s from start to exit.

The shared launch helper (`launchVendor` in `scripts/probe/chrome/vendor-layer.mjs`) left the earlier layers as they
were: `--vendor` (M7) 12 PASS, 1 BLOCKED as recorded; `--vendor --network default` (S0) 6 PASS; `--fixtures` 15 PASS.
