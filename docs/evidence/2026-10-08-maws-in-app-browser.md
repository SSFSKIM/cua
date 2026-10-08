# MAWS's in-app browser driven by cua_repl: live acceptance (#13, M5)

Spec: `docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md`, "Acceptance" items 1-15, run as the
execution pre-flight entry allows: against a dev MAWS on its own userData and this worktree's `bin/cua.mjs`, never the
owner's packaged MAWS, plugin cache or Chrome profiles.

- MAWS: branch `e13-cua-in-app-browser` at `82bdf2be` (M4 head), `pnpm build` (electron-vite, not packaged), run by
  the bare Electron 44.4.5 binary with `spikes/cua-backend/serve-plain.cjs /tmp/mh13-m5 m5-A m5-B`: userData
  `/tmp/mh13-m5`, `MAWS_E2E=1` (only to open the two named sessions' sockets; these sessions have no engine), a
  transparent click-through window, no Playwright attached (so page dialogs reach the vendor; spec Surprises, M3).
- cua: branch `maws-in-app-browser-13` at `979899d` (plugin 0.5.0), `node bin/cua.mjs serve` started by the harnesses,
  `CUA_HOME=/tmp/cua-h13` with runtime `26.928.40906-darwin-arm64`. Node 22.23.2, macOS 26.6.2, 2026-10-08 23:14-23:22 UTC.
- Probes for the checks the committed harnesses do not cover are kept beside the outputs, in
  `2026-10-08-maws-in-app-browser/probes/`: `launch.cjs` (serve-plain.cjs plus, in-process, a SIGUSR2 dump of the
  seam's `inspect()` and the sessions' activity buffers, and a file trigger that makes the seam's `sendInput` click
  for the person), `reconnect.mjs` (13), `handoff.mjs` (11), `takeover.mjs` (8, needs `launch.cjs`), `cursor.mjs` (9),
  `proxy.mjs` (a byte-transparent socket proxy that records each `debugger.sendCommand` method, never params). Run
  MAWS as `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <probes>/launch.cjs /tmp/mh13-m5 m5-A m5-B`
  from the MAWS checkout, then each probe with `CUA_HOME=/tmp/cua-h13
  CUA_BROWSER_BACKENDS=/tmp/mh13-m5/browser/cua/m5-A.sock node <probe>`. Their outputs are the JSON files there.

| Item | Verdict | Where |
|---|---|---|
| 1 `profiles_list` inside MAWS | **BLOCKED** (inside the app); terminal equivalent PASS | harness `profiles` |
| 2 createTab, marker, panel, badge | **PASS** (vendor half); panel/badge **BLOCKED** (screenshot) | harness `createTab` |
| 3 fill/click, viewport, screenshot | **PASS** | harness `locator`, `viewport` |
| 4 download | **PASS**; deliverables listing **BLOCKED** | harness `download` |
| 5 alert, confirm | **PASS** | harness `alert`, `confirm` |
| 6 file chooser | **PASS** (S2 promoted) | harness `chooser` |
| 7 popup, end_task | **PASS** | harness `popup`, `cleanup` |
| 8 takeover | **PASS** with a finding (the refusal reaches a locator as the vendor's deadline, at 3 s); by hand **BLOCKED** | e2e; `takeover.json` |
| 9 cursor | **PASS** (e2e; live in an agent screenshot); by hand **BLOCKED** | e2e; `agent-screenshot-carries-cursor.jpg` |
| 10 transcript rows | **BLOCKED** (needs a session); main's feed live: **FINDING** (no Screenshot, no Typed for `fill`) | activity buffer |
| 11 end_task, handoff, two sessions | **PASS** from a terminal; two UI-started sessions **BLOCKED** | `turn-end-handoff.json`, harness `isolation` |
| 12 no `browser_*`; old journal renders | **PASS** | vitest |
| 13 reconnect | **PASS** (dev MAWS relaunched, 2.0 s); with a real engine **BLOCKED** | `reconnect.json` |
| 14 Chrome still drivable | **PASS** (cua half, Chrome-shaped fake peer); real profile **BLOCKED** | `selection.json` |
| 15 suites | **PASS**; `test:live` cited from M4 (39/40, engine drift) | below |

Findings are under "Findings" at the end; the owner's sitting for every BLOCKED item is under "The inside-MAWS
sitting". Everything above ran at MAWS `82bdf2be`; the steps a later MAWS fix affects are listed under "Re-run after the
MAWS fix", still open.

## 1. `profiles_list` inside MAWS — BLOCKED (terminal equivalent PASS)

From a terminal, `CUA_BROWSER_BACKENDS=/tmp/mh13-m5/browser/cua/m5-A.sock CUA_HOME=/tmp/cua-h13 node
scripts/accept/maws-features.mjs --report … --other …/m5-B.sock`, step `profiles`:

    {"status": "ok", "profiles": [{"key": "maws", "ready": true, "extensionInstanceId": "maws:m5-A"}]}

(`/tmp/cua-h13` has no registered Chrome profile, so nothing follows the `maws` entry.) Inside the app it needs a
session whose engine loads the 0.5.0 plugin: sitting step S2.

## 2. createTab — PASS; the panel and badge BLOCKED

Same run, step `createTab` (`cua.getBrowser()` with no id, then `cua.createBrowserTab(b.browserId, <features page>)`,
then `#marker`'s text):

    {"instance": "maws:m5-A", "profileName": "MAWS", "tabId": "1", "markerMatches": true}

The tab unselected in the session's panel with the "agent" badge is pinned by MAWS's unit tests (`retained.test.ts`,
`chrome.test.tsx`) and the e2e below ("a tab created unselected"); the screenshot is sitting step S3.

## 3. Locator, viewport, screenshot — PASS

    locator   {"state": "submitted:x"}
    viewport  {"during": {"format": "jpeg", "width": 800, "height": 600}, "after": {"format": "jpeg", "width": 1280, "height": 800}}

`after` is the parked size of a tab no pane shows (1280×800), which is that tab's pane size.

## 4. Download — PASS; the deliverables listing BLOCKED

    download  {"basename": "cua-report.pdf", "directory": "Downloads", "size": 7729,
               "sha256": "a3030829e7251330d53ac0d0a803039b8f82f6fa53d294b66e76d8fe3d8c6ec5", "sha256Match": true,
               "inDownloads": true, "elapsedMs": 274, "removed": {"deleted": true}}

No save dialog: the file was complete in `~/Downloads` 274 ms after the click with nobody answering anything (a save
panel would have held it), and MAWS's unit tests pin the dialog-free path for a leased tab. The
"Allow download from <origin>" elicitation was accepted by the harness's answer, as the plugin's hook does. Each of
the three download runs removed its own file; `ls ~/Downloads | grep -c cua-report` read `0` after every run. MAWS
logged `tab b_000000000001's download was not recorded: no engine host holds m5-A`: these sessions have no engine,
so the deliverable half needs sitting step S3.

## 5. alert and confirm — PASS

    alert    {"type": "alert", "closed": true, "state": "after-alert"}
    confirm  {"type": "confirm", "closed": true, "state": "confirm:false"}

No native box: the held route answered through the vendor (MAWS's activity buffer recorded both dialogs, `answered:
accepted` for the alert, `dismissed` for the confirm).

## 6. File chooser — PASS

    chooser  {"picked": "cua-upload.txt:1234", "expected": "cua-upload.txt:1234"}

## 7. Popup and end_task — PASS

    popup    {"added": [{"id": "2", "url": "http://127.0.0.1:58275/popup"}]}
    cleanup  {"createdListed": false, "popupListed": false}

Exactly one tab was added (no duplicate); after `end_task` neither the created tab nor the popup is listed.

## 8. Takeover — PASS, with a finding; by hand BLOCKED

MAWS e2e, `pnpm e2e:browser-cua` at `82bdf2be`: 2/2 passed, including "takeover and the cursor through a lease: …
the person's click takes the page, an acting command is refused within 2 s and a reading one passes, 3 s later the
same command goes through" (6.3 s).

With the real vendor runtime (`takeover.json`): the person's click arrived through the seam's `sendInput` (control
read `human`), then in the same second the agent's `locator('#submit').click()`:

    duringClick        {"ok": false, "ms": 3044, "error": "Error: Playwright selector deadline exceeded\nwaiting on click
                        for selector #submit\nLocator diagnostics: {\"kind\":\"action_failed\", …}"}
    stateAfterRefusal  "waiting"        (the agent's click never ran)
    afterClick         {"ok": true, "state": "submitted:x", "sincePersonMs": 3675}

The person keeps the page and the click goes through after hand-back, as specified. What the agent sees differs from
the item's wording: the vendor's locator retries a refused action until its own 3 s budget, so the error is the
vendor's deadline at about 3.0 s and MAWS's "A person is using this tab; wait and retry" never reaches the cell
(Finding B). The tab chrome's control states by hand are sitting step S4.

## 9. Cursor — PASS (e2e, and live in a screenshot); by hand BLOCKED

The e2e above draws the cursor for `cursor.move` and hides it when the lease goes. Live, an agent's
`locator('#submit').click()` followed by `tab.screenshot()` returned
[`agent-screenshot-carries-cursor.jpg`](2026-10-08-maws-in-app-browser/agent-screenshot-carries-cursor.jpg): the
agent's cursor is drawn in the page at the button. That proves the cursor shows, and also that an agent's
screenshot carries it, which Design §9 and M4's fix wave say it never does (Finding A). The pinned vendor's locator
has no `hover()` (`tab.playwright.locator(...).hover is not a function`); the cursor moves before every locator click
(`moveMouse`) and with `tab.cua.move({x, y})`. Watching it by hand is sitting step S4.

## 10. Transcript rows — BLOCKED; main's feed shows a finding

The rows render only in a session's transcript (sitting step S3). Main's half was read live from MAWS's activity
buffer (`cua.activities('m5-A')`, read in-process by the scratch launcher) after a full harness run:

    tabOpened about:blank · navigated http://127.0.0.1:58649/ · clicked "button Submit" · clicked "button Popup" ·
    tabOpened …/popup · clicked "a Download report" · download cua-report.pdf complete · clicked "button Alert" ·
    dialog alert "cua alert" accepted · clicked "button Confirm" · dialog confirm "cua confirm?" dismissed ·
    clicked "input 파일 선택" · tabClosed … · tabClosed …

Across four runs the buffer held no `screenshot` and no `typed` activity. The CDP census through a recording proxy
(`cdp-census.json`, one full harness run) explains both: zero `Page.captureScreenshot`, nine `Page.startScreencast`
(the vendor takes a screenshot as a screencast frame, BS:43941-44040), and no `Input.insertText` (the vendor's `fill`
sets the value by `Runtime.evaluate`). So "Screenshot" never appears (Finding A) and "Typed 1 character" appears only
for keyboard input, not for `fill` (Finding C).

## 11. end_task, handoff, two sessions — PASS from a terminal; two UI-started sessions BLOCKED

`turn-end-handoff.json`: three tabs (unmarked, `markDeliverable()`, `markHandoff()`), `end_task`, then the next task:

    agent tabs  {"unmarked": false, "deliverable": false, "handoff": true}
    user tabs   {"unmarked": false, "deliverable": true,  "handoff": false}
    closed afterwards, leftover []

Isolation, harness `--other` on m5-B (a second app session's socket):

    ours    {"mawsInstances": ["maws:m5-A"], "otherSelected": false, "otherError": "The Chrome instance is unavailable."}
    theirs  {"mawsInstances": ["maws:m5-B"], "otherSelected": false, "otherError": "The Chrome instance is unavailable."}

Each side lists only its own MAWS browser and cannot select the other's. Two sessions started in the app, each
creating a tab, is sitting step S5.

## 12. No `browser_*` tool; old journals render — PASS

`npx vitest run src/shared/maws/tools.test.ts src/engine-host/tool-server/server.test.ts
src/renderer/src/transcript/model/disk.test.ts src/main/index/replay-fixtures.test.ts
src/engine-host/conformance/fixtures.test.ts`: 5 files, 241 tests passed. `MAWS_TOOL_NAMES` is the seven non-browser
tools; `p1-maws-browser` renders the same seven `browser_action` rows from disk as from the journal, against its
committed snapshot.

## 13. Reconnect — PASS (dev MAWS); with a real engine BLOCKED

`reconnect.json`: one long-lived `cua serve` on m5-A's socket; the dev MAWS (pid 68605) stopped with SIGTERM, then
relaunched on the same userData:

    before        {"key": "maws", "ready": true, "extensionInstanceId": "maws:m5-A"}
    down          {"ready": false, "reason": "maws_unreachable", "afterMs": 253}
    back          {"ready": true, "extensionInstanceId": "maws:m5-A", "afterMs": 2022}    (after the relaunch)
    selectBefore / selectAfter  {"selected": "maws:m5-A", "heap": "mv05oc99-6avhz8fx8d3"}  (the same REPL heap)

Ready again 2.0 s after the relaunch, at the same path, without restarting `cua serve`. The fake-peer half
(`maws-selection.mjs`, below) reads 5.1 s and, for a `cua serve` started while MAWS was down, 4.6 s. The real
engine kept by the supervisor across a MAWS quit is sitting step S6.

## 14. Chrome still drivable — PASS (cua half); real Chrome profile BLOCKED

`CUA_HOME=/tmp/cua-h13 node scripts/accept/maws-selection.mjs`: PASS, 11/11 steps (`selection.json`). With the MAWS
fake peer stopped, `cua.getBrowser()` failed with `Browser is not available: maws:app-sel` (never the Chrome-shaped
peer), and `getBrowser({extensionInstanceId: <the Chrome-shaped peer's>})` created one tab there and closed it; the
default came back in the same heap when the peer returned. No Chrome was driven. A real bound profile is sitting step
S7.

## 15. Suites — PASS

- cua `npm test` at `979899d`: 1034 tests, 1033 passed, 0 failed, 1 skipped.
- MAWS at `82bdf2be`: `pnpm typecheck` and `pnpm lint` clean; `pnpm test`: 706 files passed (1 skipped), 9778 tests passed (1 skipped), exit 0 (load average 36).
- MAWS `pnpm e2e:browser-cua`: 2/2 passed (items 8, 9 and the M2 case).
- `pnpm test:live` was not re-run (it spends money): M4 ran it at the M4 head, 39/40, the failing case `W1 delivered
  next steer on disk` asserting an exact on-disk record while engine 2.1.295 adds `delivery_id` (engine drift, spec
  Decision Log M4); acceptance 15's live half reads "green except that case".

## Running inside MAWS without touching the plugin cache

A MAWS session can load the 0.5.0 plugin for itself while the installed one stays as it is. Claude Code's
`--plugin-dir` loads a plugin for one process, and a local copy overrides an installed plugin of the same name
(Claude Code changelog). Checked on this Mac, without a model call:

    ~/.local/bin/claude --plugin-dir /Users/new/Developer/GitHub/cua-wt-13 plugin list
      cua@cua      Version: 0.4.3  Scope: user  enabled          (the installed copy, untouched)
      cua@inline   Version: 0.5.0  Path: …/cua-wt-13  loaded
    CUA_HOME=/tmp/cua-h13 ~/.local/bin/claude --plugin-dir …/cua-wt-13 mcp list
      plugin:cua:cua_repl: node /Users/new/Developer/GitHub/cua-wt-13/cua-shim.mjs - ✔ Connected

MAWS's launch spec has no extra-arguments field, but its engine binary is the one Settings › Engine names
(`src/engine-host/binary-info.ts`; `MAWS_E2E_ENGINE_BIN` under `MAWS_E2E`), so a wrapper that adds the flag puts the
plugin in every session of that MAWS. This run did not drive a session that way: every remaining inside-MAWS check
needs prompts typed into a visible MAWS window and the transcript read and photographed, or a new Playwright live
spec in MAWS (new code outside M5, with Playwright's own CDP client dismissing page dialogs). The owner's
configuration also lists a user-scope `cua_repl` server running the main checkout (`cua_repl: node
…/GitHub/cua/bin/cua.mjs serve`), which predates M1; in a session the agent must use the plugin's tools
(`mcp__plugin_cua_cua_repl__*`).

## The inside-MAWS sitting (the owner's steps)

S1. Setup, before the merge (after it, skip the wrapper: `claude plugin update cua@cua` once the marketplace has
0.5.0, which is the dispatching session's step):

```sh
cd /Users/new/Developer/GitHub/MAWS-wt-13 && git checkout e13-cua-in-app-browser   # 82bdf2be or later
printf '#!/bin/sh\nexec "$HOME/.local/bin/claude" --plugin-dir /Users/new/Developer/GitHub/cua-wt-13 "$@"\n' > /tmp/claude-cua05
chmod +x /tmp/claude-cua05
MAWS_USER_DATA=/tmp/mh13-owner pnpm dev        # a second MAWS on its own userData; the packaged one keeps running
node -e "import('/Users/new/Developer/GitHub/cua-wt-13/scripts/accept/features-page.mjs').then(async m => console.log((await m.startFeaturesPage()).url))"
```

In the dev MAWS: Settings › Engine › binary `/tmp/claude-cua05` (it answers `2.1.295 (Claude Code)`). The dev
instance runs the detached engine supervisor by default (no `MAWS_E2E`), so S6 works there. Sessions use the owner's
`~/.claude` (sign-in and user settings), as the acceptance's "inside MAWS" requires.

S2 (items 1 and the env). Start session A in a scratch folder. Ask: "Run `echo $CUA_BROWSER_BACKENDS` in Bash, then
call the plugin cua_repl `profiles_list` tool and show its result verbatim." Expect
`/tmp/mh13-owner/browser/cua/<A's appSessionId>.sock`, then `maws` first, `ready: true`, `extensionInstanceId:
"maws:<the same id>"`, then the registered Chrome profiles. PASS if so.

S3 (items 2's panel and badge, 4's deliverable, 10). In session A ask for one cua_repl `js` cell: `const b = await
cua.getBrowser(); const t = await cua.createBrowserTab(b.browserId, '<features URL>'); await
t.playwright.locator('#name').fill('x'); await t.cua.type('y'); await t.playwright.locator('#submit').click(); await
t.screenshot(); const [d] = await Promise.all([t.playwright.waitForEvent('download'),
t.playwright.locator('#dl').click()]); return d.path()`. Screenshot: the Browser panel listing the tab unselected
with the "agent" badge; the transcript with the activity rows under the `js` row ("Navigated to 127.0.0.1",
"Clicked button Submit", "Typed 1 character" for the `type`, "Downloaded cua-report.pdf"; "Screenshot" is expected
missing until Finding A is fixed); the rows still in view after the turn folds and after a window reload (Cmd-R);
the tab's download line; the session's deliverables listing `cua-report.pdf`. Delete `~/Downloads/cua-report.pdf`
afterwards.

S4 (items 8 and 9 by hand). Ask for a cell that clicks `#submit` every 500 ms for 20 s. Watch the agent cursor in
the tab, then click inside the page: the takeover banner shows, the agent's clicks fail (as the vendor's deadline,
Finding B), and 3 s after your last click the agent resumes; after the turn the cursor is gone. Screenshot the
banner and the cursor.

S5 (item 11, two sessions). Start session B; in A and B each create one tab, then in each ask for
`cua.listTabs({browser: (await cua.getBrowser()).browserId})`: each lists only its own tab. Then in A, `end_task`
with one tab marked `markHandoff()`: that tab stays open and listed in A's next task.

S6 (item 13). With session A idle, quit the dev MAWS (Cmd-Q; the supervisor keeps A's engine), relaunch it with the
same command, resume A, and ask for `profiles_list`: `maws` ready within 10 s, and the spawn count in A's journal
unchanged (no new engine launch).

S7 (item 14). In session A, `cua.getBrowser({extensionInstanceId: <a bound Chrome profile's id from
profiles_list>})`, create one tab and close it: the owner's Chrome opens and closes the tab.

Afterwards: quit the dev MAWS, `rm -rf /tmp/mh13-owner /tmp/claude-cua05`, and reset Settings › Engine if the
packaged MAWS was pointed at the wrapper instead.

## Re-run after the MAWS fix (open)

The final review's MAWS fix (screencast screenshots hidden, rowed and classed reading; the cookie-jar `Network.*`
methods refused; agent downloads following `personHolds`) lands after this run. Its first commit, `38d4df7f` (the
cookie-jar refusal), was built once to check the committed probes: `takeover.mjs` (click first) and `reconnect.mjs`
(ready again in 2020 ms) read as at `82bdf2be`. Against a build of the fixed head, re-run and record here:

- Item 3: harness `viewport` (and `locator`): `<pending: MAWS head, result>`.
- Item 4: harness `download`, plus a download while the person holds the tab (the save dialog path, not the
  agent's): `<pending>`.
- Item 9: an agent screenshot after a locator click no longer shows the cursor (the cursor probe, image beside
  `agent-screenshot-carries-cursor.jpg`): `<pending>`.
- Item 10: the activity buffer holds a `screenshot` per agent screenshot; record whether the vendor took the
  screencast or the `Page.captureScreenshot` path (`cdp-census.json`'s method): `<pending>`.
- Item 8: a screenshot during the person's hold passes at once and leaves control `human` (`takeover.json`'s
  screenshot-first run read 2994 ms and `agent` at `82bdf2be`): `<pending>`.

## Findings

A. **An agent's screenshot is a screencast frame, which MAWS's cua server does not treat as a screenshot**
(`src/main/browser/cua/{filter,connection,activity}.ts`). The pinned vendor captures through `Page.startScreencast`
and one frame whenever the scale is 1 or the mode is `device` (BS:43941-44040); `Page.captureScreenshot` is only its
fallback. The census shows 9 `Page.startScreencast` and 0 `Page.captureScreenshot` in a full run. Consequences: (1)
the cursor is not hidden first, so the screenshot shows it (the JPEG above), against Design §9 and M4's fix; (2) no
`screenshot` activity row; (3) `Page.startScreencast`, `Page.screencastFrameAck` and `Page.stopScreencast` are
classed acting, so during the person's hold a screenshot waits for the hand-back (2994 ms live in
`takeover.json`'s screenshot-first run) and then turns control to `agent`, where the spec has screenshots pass as
reading commands. The fix belongs in MAWS: class the three screencast methods as reading, hide the cursor before
`Page.startScreencast`, emit `screenshot` once per `Page.startScreencast`, and add `Page.stopScreencast` to the
release reset. Being fixed on the MAWS branch after this run (the final review's fixer); see "Re-run after the MAWS
fix".

B. **The takeover refusal does not reach the agent's locator as MAWS's text.** The server refuses at 1.5 s as
specified (the e2e's raw command sees the text), but the vendor's locator treats the refusal as one failed attempt
and retries until its 3 s budget, then reports `Playwright selector deadline exceeded … action_failed`. The person is
protected; the agent cannot tell why it failed. README "For MAWS" now says what a held tab looks like to the agent.

C. **`fill` leaves no "Typed" row.** The vendor fills by script (`Runtime.evaluate`), which MAWS cannot tell from any
other evaluate, so only input sent as `Input.insertText` or key events yields "Typed N characters" (the vendor's
`tab.cua.type` and key presses send those, BS:19008-19034; read in source, not run here). Acceptance 10's "Typed 1
character" needs a typing step, not `fill`.

D. Minor: a bare-Electron MAWS says hello with `version: "44.4.5"` (Electron's `app.getVersion()` with no app
package); a packaged build sends its own version.
