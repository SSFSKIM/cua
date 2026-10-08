# H3b evidence: live acceptance of cua's own Chrome extension route on this Mac

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, milestone H3b (acceptance 1–6). Run on
2026-10-07 23:38 to 2026-10-08 00:10 UTC, macOS 26 arm64, Node 22.23.2, pinned runtime `26.928.40906-darwin-arm64`,
branch `feat/own-chrome-extension`. The owner loaded `extension/` unpacked in Chrome profile `Default` ("personal");
its card shows id `jkejaaijdfpohkdhankllbekkhmnippb`, version 0.1.0.

**Result: acceptance 1–6 PASS.** Two full runs of the runner passed every step (40/40), and the restart run passed every
step (11/11). Getting there took three fixes to the runner; the host and the extension did not change (see "What the
live run changed"). One more full run, started 40 s after Chrome reopened, failed on CDP timeouts, and the next run
passed (see "Watch items").

## Scratch home (no login) and credentials

`CUA_HOME=/tmp/cua-h3.qCqI8E` was installed earlier in H3b, has profile `personal` added and was never logged in.
`test ! -e "$CUA_HOME/state/codex/auth.json"` held at the start and at the end, and every runner report records
`codexAuthPresent: false`. `cua login` was never run and `CODEX_HOME` was never set. No credential file or token was
opened or printed. Under the Chrome profile, the only check was whether
`Default/Local Extension Settings/jkejaaijdfpohkdhankllbekkhmnippb/` exists (it does).

## Acceptance 1: no-login browser surface, end to end (PASS)

- `node bin/cua.mjs chrome register --replace` → exit 0; `placed` for chrome, edge, brave, opera and vivaldi;
  `previous launcher recorded: none`. The manifest allows `chrome-extension://jkejaaijdfpohkdhankllbekkhmnippb/`.
- The host's socket `$CUA_HOME/chrome/b/28dfce02fcce.sock` appeared within 2 s of registering, because the extension
  was already retrying. Its status file names instance `d132fc92-…`, extension 0.1.0 and protocol 1.
- `node bin/cua.mjs profiles bind personal` → exit 0, `bound personal to extension instance d132fc92-… (this profile
  directory's extension store records exactly this live backend)`. This is the automatic binding by directory, with
  the extension loaded unpacked.
- `node bin/cua.mjs doctor --json` gives `codex.login: skip` ("not needed: the cua extension route needs no Codex
  login"), `chrome.extension.personal: pass`, `chrome.host.registered: pass` ("cua: io.github.ssfskim.cua names this
  home's launcher …") and `chrome.hosts.live: pass` ("1 cua host(s) serving"). `ok` is `false` because of one row
  outside the browser: `agent.enrolled: fail`. This Mac's launchd agent belongs to the default home, not the scratch
  home; H4's VM run hit the same scratch-home artifact. Every browser and runtime row passes.
- `CUA_SHIM_SURFACES=browser node verify.mjs` → exit 0, `problems: []`.
- `node scripts/accept-chrome.mjs --live --route cua --profile personal --report /tmp/cua-h3.json` → PASS, 40/40 steps,
  and 40/40 again in a later run. What the C2 cells showed:
  - Discovery lists one backend, named `cua`.
  - The host's raw `getInfo` has `type: extension` and `name: cua`, has no `agentRequestHeaderEnabled`, and its
    metadata keys are `[extensionInstanceId]`.
  - The `{{secret:…}}` fill reached the page: the page's digest matches the sentinel.
  - The induced failure carries no value (`secret_input_failed`, `failed`).
  - The screenshot (17 389 bytes) shows an empty field.
  - The cross-site iframe cell (`localhost:<port2>`) read the parent's and the frame's markers and clicked the frame's
    button.
  - The sentinel scan found the value on no channel: the MCP transport in both directions, serve's stderr, 5 710
    runtime files, the screenshot and the report.
- `node bin/cua.mjs chrome unregister` → exit 0. Each slot reports "removed … nothing to restore (cua placed it in an
  empty slot)".

**`goto` latency** (ms, measured inside the cell around `goto`):

| Run | C2 page | C2 framed page | turn end (3 tabs) | two clients A / B |
|---|---|---|---|---|
| full run 4 | 348 | 142 | 334, 326, 319 | 460 / 509 |
| full run 6 (after Chrome's restart) | 374 | 302 | 315, 330, 316 | 346 / 367 |
| C2-only reruns ×3 | 359, 341, 367 | 110, 236, 124 | — | — |
| restart scenario | 336 before the restart, 1 219 for the first after the reopen | — | — | — |

## Acceptance 2: the vendor manifest untouched (PASS)

sha256 of each browser's `NativeMessagingHosts/{com.openai.codexextension,io.github.ssfskim.cua}.json`, taken before
`register --replace` and again after `unregister`; `diff` of the two listings is empty.

| Browser | `com.openai.codexextension.json` before = after | `io.github.ssfskim.cua.json` before / after |
|---|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi | `58b89252…a8eb5704b6` (identical, all five) | absent / absent |

## Acceptance 3: user-tab claim (PASS; the infobar was not observed by the executor)

- The runner opened its own loopback page the way a user would: `open -n -a "Google Chrome" --args
  --profile-directory=Default <url>`, exit 0.
- The agent's `browser.user` API listed the page (one match, keys `id,title,url`) and claimed it.
- One origin-access elicitation for that origin reached the client and was accepted.
- The agent read the page's marker, and the tab ids agree.
- While the tab was claimed, the host's status showed it owned, `origin: claimed`, `attached: true`.
- After `end_task` the tab was open and owned by no session. The runner then closed it.

Chrome's debugger infobar is for the owner to observe: the executor cannot see Chrome's UI and did not look.

## Acceptance 4: turn end and handoff (PASS)

One task created three tabs and marked them none, deliverable and handoff. After `end_task` the host's status showed:

- the unmarked tab closed;
- the deliverable tab open and unowned;
- the handoff tab owned, with `mark: handoff` and `attached: false`.

The next task's `browser.tabs.list()` listed the handoff tab, and the user list showed the deliverable one. Cleanup
left no tab behind.

## Acceptance 5: several clients (PASS)

Two `cua serve` processes each created and drove their own tab.

- The host held two sessions with distinct vendor session ids (run 4: `ebab3e10-…` and `b124c70a-…`).
- Each process's `tabs.list()` listed its own tab and not the other's.
- A raw client's `getTabs` for another session returned 0 tabs.
- `executeCdp` on the other session's tab was refused with `tab owned by another session`.
- Both tabs closed and both tasks ended.

## Acceptance 6: Chrome after serve (PASS)

`node scripts/accept-chrome.mjs --live --route cua --chrome-restart --profile personal --report
/tmp/cua-h3-restart.json` → PASS, 11/11.

1. A task was open, with its tab on the runner's page and the marker read. The runner printed `OWNER STEP`.
2. The owner quit Chrome (Cmd-Q) and reopened it.
3. 61 s later a new host (pid 43863 replaced by 4524) served the same socket path, `28dfce02fcce.sock`.
4. The open task's next `js` call failed in 5 ms with `Browser is not available: 1` (the cell took 53 ms; the bound is
   15 s).
5. `end_task` returned `ended`.
6. A new task in the same `cua serve` selected the profile, created a tab, read its marker and closed it. `cua serve`
   was never restarted.

## Watch items

- **Distinct vendor session ids for two serves:** yes (acceptance 5).
- **An idle open task survives the restart wait:** yes. The task stayed open through the 61 s wait, and its next call
  failed fast with a classified error instead of hanging.
- **`Fetch.enable` stalls:** none in the passing runs. Every navigation took 0.1–0.5 s and no CDP command timed out.
  One full run started 40 s after Chrome reopened, while Chrome was restoring about 20 of the owner's tabs. It failed
  seven steps on host CDP timeouts (`Timed out after … waiting for CDP command`): a click with 377 ms of its budget
  left, a marker read, and one of three tab creations at 10 s. The run two minutes later passed 40/40. The host does
  not log CDP traffic, so which methods stalled is unknown. Tab-restore load is the likely cause; it is not confirmed.
- **`windows.create {focused:false}` stays unfocused:** not exercised. Chrome always had a normal window, so the host
  never created one.
- **The debugger bar's Cancel, one tab or all:** not observed. Checking it needs the owner to click Cancel on the
  infobar while two agent tabs are attached.
- **Host log on restart:** the new host's log replaces `<name>.log`, as designed (the log is truncated at start). After
  a Chrome restart the previous host's exit line is therefore gone.

## What the live run changed (runner only)

1. **The C2 field.** The first live run failed C2 after the fill. Chrome refused the debugger on the tab with "Cannot
   access a chrome-extension:// URL of different extension"; the vendor service reports this as "Google Chrome is
   blocking automation because another extension UI is open on this page". The click timed out, and the agent could
   not close the tab (the host closed it at turn end).

   A controlled comparison on fresh loopback origins:
   - With the runner's timing (the fill in its own call after the page loaded), a password input failed 3 of 4 fills
     and a text input masked with `-webkit-text-security` failed 2 of 3.
   - Plain text inputs failed 0 of 13, across both timings.
   - The opt-out attributes that password managers document (`data-1p-ignore`, `data-lpignore`, `data-bwignore`,
     `data-protonpass-ignore`, `data-form-type`) did not prevent it: one of three runner runs with them still failed.

   So a password-manager extension in the owner's Chrome draws its frame into the page when a password-like field is
   focused. This is Chrome's rule for any extension that uses `chrome.debugger`, so the vendor route hits the same
   thing in this profile.

   The fix: the page's field is now a plain text input labelled "Acceptance secret", with transparent text (set by a
   hashed `<style>` under the CSP). Three C2-only reruns and both full runs passed with it.
2. **`browser-surface`.** The check looked for the `getBrowser({extensionInstanceId})` rule in the server's
   instructions, but #73 moved that rule into `profiles_list`'s description. The check now accepts either place.
3. **`closeOwnTab`.** The cell listed the tabs once, right after `close()`. `close()` returns when Chrome accepts
   `Target.closeTarget`, which is before the tab leaves Chrome's tab list, and one of two concurrent closes was still
   listed. The cell now polls the listing for up to 2 s, and the cleanup step records `stillListed`.

## Left in the owner's Chrome

- The cua extension stays loaded, and its host is unregistered again. The running host keeps serving until Chrome
  closes its port. Running `cua chrome register` from a home re-enables it.
- One "CUA acceptance page" tab on `127.0.0.1` (a dead loopback page) remains. It is the restart scenario's first tab,
  which was open when Chrome quit and which Chrome restored on reopen. It is now an ordinary user tab: close it by hand.
- No other runner tab is open. This was counted through the host's `getUserTabs`, filtered to loopback pages, without
  printing the other tabs.

## Data seen in passing

A diagnostic cell called `cua.listTabs`. On an extension backend that call also lists unowned tabs, as the vendor's
does, so the titles and URLs of the owner's open tabs were printed once into the executor's session transcript. They
were not written to any file or to this record.

## Repository checks

- The runner's suites (`test/accept-chrome*.test.mjs`): 88/88.
- `npm test` after the runner fixes (at c0cf490 plus this record): 945 tests, 944 pass, 0 fail, 1 skipped.
