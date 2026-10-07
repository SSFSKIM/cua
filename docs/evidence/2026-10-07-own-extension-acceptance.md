# H3b evidence: live acceptance of cua's own Chrome extension route on this Mac

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, milestone H3b (acceptance 1–6). Run on
2026-10-07, macOS 26 arm64, Node 22.23.2, pinned runtime `26.928.40906-darwin-arm64`, branch
`feat/own-chrome-extension`.

**Status: the live items are BLOCKED on the owner's one step.** The cua extension was not loaded unpacked in Chrome
profile `Default` ("personal") within the agreed window: the first request went out at 13:04 UTC and the presence
signal (`Default/Local Extension Settings/jkejaaijdfpohkdhankllbekkhmnippb/`, existence only) was still absent at 13:51
UTC. Everything that does not need the loaded extension ran and is recorded below; the commands to finish are at the end.

## Scratch home (no login)

```sh
export CUA_HOME=$(mktemp -d /tmp/cua-h3.XXXXXX)      # /tmp/cua-h3.qCqI8E (real path /private/tmp/cua-h3.qCqI8E)
node bin/cua.mjs install                              # 70 s; 26.928.40906-darwin-arm64 from the vendor zip
test ! -e "$CUA_HOME/state/codex/auth.json"           # negative control: holds (checked again at the end)
```

`cua login` was never run; no `CODEX_HOME` was set in the shell; no bypass variable was set.

## Acceptance 1 — registration (done), the rest BLOCKED

`node bin/cua.mjs chrome register --replace` → exit 0:

```
registered cua's Chrome host launcher /private/tmp/cua-h3.qCqI8E/chrome/host:
  chrome   placed     …/Google/Chrome/NativeMessagingHosts/io.github.ssfskim.cua.json
  edge     placed     …/Microsoft Edge/NativeMessagingHosts/io.github.ssfskim.cua.json
  brave    placed     …/BraveSoftware/Brave-Browser/NativeMessagingHosts/io.github.ssfskim.cua.json
  opera    placed     …/com.operasoftware.Opera/NativeMessagingHosts/io.github.ssfskim.cua.json
  vivaldi  placed     …/Vivaldi/NativeMessagingHosts/io.github.ssfskim.cua.json
previous launcher recorded: none
```

The launcher bakes `CUA_HOME='/private/tmp/cua-h3.qCqI8E'`, the nvm Node 22.23.2 and this checkout's
`src/chrome/host.mjs`. `cua profiles add personal --chrome-profile Default` → registered, "the cua extension is not
installed there" (correct: not loaded yet). The runner then reports, as it should:

```
node scripts/accept-chrome.mjs --live --route cua --profile personal --report /tmp/cua-h3-work/dry.json
H3b-cua-route-live: BLOCKED
  BLOCKED preconditions   ["profile \"personal\" is not ready (extension_not_installed)",
                           "no cua host serves this profile's socket (is the cua extension loaded and connected in it?)"]
codexAuthPresent: false
```

BLOCKED (need the loaded extension): the popup's "host: connected", `profiles bind`, the doctor rows, `verify.mjs`, and
the runner's scenarios.

## Acceptance 2 — the vendor manifest untouched: PASS for this run

sha256 of every `com.openai.codexextension.json` and the state of every `io.github.ssfskim.cua.json` under the five
browsers' `NativeMessagingHosts`, before `register --replace` and after `unregister`:

| Browser | `com.openai.codexextension.json` before = after | `io.github.ssfskim.cua.json` before / after |
|---|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi | `58b89252…a8eb5704b6` (identical, all five) | absent / absent |

`cua chrome unregister` → exit 0, each slot "removed … nothing to restore (cua placed it in an empty slot)";
`diff` of the before/after listings is empty. The default cua home (`~/Library/Application Support/cua`) was not
touched. (The register–unregister cycle ran without the extension loaded; the item is to be repeated around the full
live run.)

## Hand-off from H2: an empty `BROWSER_USE_BACKEND_PATHS` survives node_repl: PASS

On the cua route with nothing bound and no socket in `$CUA_HOME/chrome/b` (so `cua serve` sets the variable to the
empty list), a `cua serve` (browser surface) cell ran `cua.listBrowsers({emit:false})` → `{"n":0,"names":[]}` in
~0.3 s, while `/tmp/codex-browser-use` held hundreds of socket files including live ones (three `ChatGPT for Chrome`
vendor hosts were running for the owner's ChatGPT extension). The vendor scan was skipped: none of them was listed.
The scoped-sandbox reach to `$CUA_HOME/chrome/b/*.sock` is BLOCKED with the rest (no host was listening).

## Acceptance 3–6: BLOCKED

They need the extension loaded (3, 4, 5) and the owner's Chrome quit-and-reopen (6). The runner and its cells are in
place and unit-tested (`test/accept-chrome-cua.test.mjs`, `test/accept-chrome-run.test.mjs`,
`test/accept-chrome.test.mjs`); see "To finish".

## Repository checks run here

- `npm test`: 925 tests, 924 pass, 1 skipped (907 before H3b; +18 for the runner).
- `node scripts/probe-chrome-contract.mjs --fixtures`: 15/15 PASS.

## To finish (once the extension is loaded unpacked in `Default`)

```sh
export CUA_HOME=/tmp/cua-h3.qCqI8E          # or a fresh scratch home: mktemp + cua install, never cua login
test ! -e "$CUA_HOME/state/codex/auth.json"
# acceptance 2 baseline: sha256 of every NativeMessagingHosts/{com.openai.codexextension,io.github.ssfskim.cua}.json
node bin/cua.mjs chrome register --replace
# wait for $CUA_HOME/chrome/b/<12-hex>.sock (the extension reconnects within a minute) and the popup's "host: connected"
node bin/cua.mjs profiles bind personal                       # bound (automatic, by directory)
node bin/cua.mjs doctor --json | jq '.ok, (.checks[] | select(.id | startswith("chrome") or . == "codex.login"))'
CUA_SHIM_SURFACES=browser node verify.mjs
node scripts/accept-chrome.mjs --live --route cua --profile personal --report /tmp/cua-h3.json          # 1, 3, 4, 5
#   acceptance 3's "Chrome shows the debugger infobar" is the owner's observation while the user tab is claimed
#   (the runner reads the page and checks the origin-access approval reached it; it cannot see Chrome's own UI)
node scripts/accept-chrome.mjs --live --route cua --chrome-restart --profile personal --report /tmp/cua-h3-restart.json
#   prints "OWNER STEP: quit and reopen Chrome now …" and waits up to 15 min                           # 6
node bin/cua.mjs chrome unregister                            # then re-check the acceptance 2 hashes
```
