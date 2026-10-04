# cua — native macOS computer use for Claude Code

Lets Claude Code read and operate macOS apps (accessibility tree, screenshots, clicks, typing, menus) by hosting
OpenAI's Codex computer-use stack. `cua serve` (the plugin runs it through `cua-shim.mjs`) is a stdio MCP server: it
launches a pinned copy of OpenAI's `cua_repl` runtime that `cua install` verified and placed under `CUA_HOME`, not the
copy inside an installed ChatGPT.app, and nothing in ChatGPT.app or `~/.codex` is read or modified. With the browser
surface turned on it also drives your existing Chrome profiles, signed-in sessions included, through OpenAI's own
Chrome extension and native host (see Chrome). The design and its status are in
`docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`.

## Requirements

- macOS on Apple silicon (the only pinned runtime is `darwin-arm64`; other platforms get `unsupported_platform`) and
  `node` 22 or newer on `PATH`. There are no npm dependencies.
- The pinned runtime, installed into `CUA_HOME` (default `~/Library/Application Support/cua`) by `cua install`: it
  downloads OpenAI's pinned ChatGPT archive from its official URL (about 690 MB), or takes a local copy with
  `--archive <zip>`, and refuses anything whose length, SHA-256, layout or OpenAI code signatures (team `2DC432GLL2`)
  differ from `runtime/releases/*.json`. Vendor files are never modified or re-signed.
- Accessibility and Screen Recording for the native computer-use helper (`Codex Computer Use.app`, started by the
  runtime through LaunchServices). macOS asks on first use; `cua doctor` cannot see these grants and reports them as
  `blocked` until a live run shows them. Where ChatGPT's Computer Use already runs, its compatible helper serves this
  runtime too and is reused as it is, never stopped or replaced.
- For secrets only: Swift (Xcode or its command-line tools) to build the Keychain helper with `npm run build:helper`
  from a checkout; the build installs it into `CUA_HOME`, where the plugin finds it too.
  Native control needs no account: the runtime gets its own empty `CODEX_HOME` under `CUA_HOME`, and nothing is read
  from ChatGPT.app or `~/.codex`.
- For Chrome only: Google Chrome with OpenAI's Chrome extension (`hehggadaopoacecdllhhajmbjkdcmajg`) installed and
  enabled in each profile you want to use, and a Codex login of the server's own (`cua login`, once). cua never installs
  the extension or signs anything in for you.

Not yet shown, and release gates rather than defects: a first run on a clean Mac without ChatGPT installed, the pinned
helper's own cold start and first-run permission prompts, and stable Developer ID signing of the Keychain helper (see
Acceptance).

## Install

From a checkout (or after `npm link`, the same commands as `cua`):

```sh
npm test                                   # Node only; no Swift, runtime, GUI, network or credentials
node bin/cua.mjs install                   # or: install --archive <ChatGPT-darwin-arm64-26.928.40906.zip>
node bin/cua.mjs doctor                    # --json for the structured checks; exit 1 when one fails
npm run build:helper && npm run test:helper    # only for secrets: build the Swift Keychain helper (installed as
                                               # $CUA_HOME/bin/cua-keychain), then test it
```

`cua install` is idempotent for a verified release and never repairs one in place; `cua runtime use <release>`
switches between verified installed releases, including the release's Chrome host and its configuration where one is
placed. A release that no longer verifies is reported with its offline recovery: stop the servers using it, remove its
directory, install again.

`cua install` also places the pinned archive's Chrome plugin (OpenAI's signed native host and its scripts) in the
release, with the host's configuration beside it; it is used only if you register it (see Chrome). An installed
release without it gains it on the next `cua install`, and nothing already installed changes.

### As a Claude Code plugin

```sh
claude plugin marketplace add SSFSKIM/cua
claude plugin install cua@cua
```

The plugin runs `node cua-shim.mjs`, which is `cua serve`. Then allow the tools in your settings so each call does not
prompt: `"mcp__plugin_cua_cua_repl__*"` under `permissions.allow`. App approvals are a separate dialog; see the next
section. This repository is the plugin's source of truth.

The plugin's copy of cua has no Keychain helper build of its own, so for secrets build it once from a checkout with
`npm run build:helper` (Swift needed). The build installs the helper as `$CUA_HOME/bin/cua-keychain`, and every copy
of cua using that `CUA_HOME` (the plugin's included) runs it from there. Use the same `CUA_HOME` for the build as the
plugin's server (both default to `~/Library/Application Support/cua`), and run the build again after the helper's
sources change. `cua doctor`'s `secrets.helper` row names the helper it found and where.

### As a plain MCP server (any host)

`cua serve` speaks MCP over stdin/stdout. Register it yourself under a name you do not already use; nothing in this
repository registers or replaces a server for you. For Claude Code, for example:

```sh
claude mcp list                                                       # check what is already registered
claude mcp add --scope user cua -- node /absolute/path/to/cua/bin/cua.mjs serve
```

Settings (below) go in the server's environment, e.g. `claude mcp add ... -e CUA_SHIM_SECRETS=off -- ...`.

## App approvals

Apart from Claude Code's tool permission, OpenAI's stack asks before an app is first used, `Allow Computer Use to use
"X"?`, as an MCP elicitation that Claude Code shows as a dialog. Where an accepted answer is remembered depends on
`CUA_SHIM_PERSIST`:

- `session` (the default) writes `$CUA_HOME/state/codex/computer-use/sessions/<session id>.toml`; each server
  connection has its own random session id, so every new connection asks once more per app, and the file is removed
  when its connection closes.
- `always` adds the app to the machine-wide list Codex Desktop's own "Always allow" uses,
  `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/Library/Application Support/Software/ComputerUseAppApprovals.json`;
  an app on that list is never asked about again from any session or host. One more accept per app, then silence.

To never see the dialog, answer it from an `Elicitation` hook: Claude Code runs the hook before showing the dialog and
takes its answer as the user's.

`~/.claude/hooks/cua-approve.sh`:

```sh
#!/usr/bin/env bash
exec jq -c 'if (.message // "" | startswith("Allow Computer Use to use ")) then {hookSpecificOutput:{hookEventName:"Elicitation",action:"accept",content:{}}} else empty end'
```

`~/.claude/settings.json`:

```json
"hooks": {
  "Elicitation": [
    {
      "matcher": "cua_repl|plugin:cua:cua_repl",
      "hooks": [{ "type": "command", "command": "bash $HOME/.claude/hooks/cua-approve.sh", "timeout": 10 }]
    }
  ]
}
```

The `startswith` test limits the hook to app approvals; anything else the server asks (audio recording) still shows
the dialog. To silence only some apps, match their names instead, for example `test("\"(Notes|TextEdit)\"")`. Be
clear about what the hook removes: the model can then bind any app OpenAI's policy allows, and binding hands it that
app's whole front window (see Use).

## Use

Ask for the task in plain words: "open Notes and read my latest note", "in Preview, rotate this image and save".
The first call returns OpenAI's API document to the model, which then writes small JavaScript cells against the `cua`
API. The server adds host notes to the server instructions covering what that document leaves out (one approval per
app, index-first addressing, dropping an app handle after quitting it, `typeText` and emoji, and so on).

The model sees four tools: `js` and `js_reset` (OpenAI's own), `end_task`, and `secrets_list` (the labels of your
stored secrets, never values; see Secrets). Calls on one connection form a task until the model calls `end_task`, which waits for
running JavaScript and then has the runtime complete the task. The plugin no longer installs `Stop`/`SubagentStop`
hooks for this; if completion cannot be confirmed, the connection fails closed and stops its runtime, and native
cleanup of what was already submitted is unconfirmed. In this pinned runtime a forwarded MCP cancellation does not stop
a running cell and `js_reset` waits behind it, so a cell's `timeout_ms` is what bounds runaway work; cancelling never
means control has been handed back.

Be aware that binding an app hands the model that app's whole front window as text, chat lists and inboxes included.
For a messaging app, open the room you mean before asking.

## Secrets

Credentials live in your login Keychain (service `cua.secrets`, one item per label), managed by a small Swift helper
built from `native/keychain`:

```sh
npm run build:helper                 # needs Swift (Xcode or its command-line tools)
node bin/cua.mjs secrets set work-password     # typed hidden, twice, at your terminal
node bin/cua.mjs secrets list                  # labels only
node bin/cua.mjs secrets remove work-password  # asks for confirmation; --yes skips it
```

A value is only ever typed at the terminal: `set` refuses arguments, flags, environment and piped input, and nothing
prints or exports a value. Labels are 1-128 letters, digits, `.`, `_` or `-`, starting with a letter or digit. Each
server connection runs its own private broker (`cua-keychain broker`) that hands values only to trusted code holding
that connection's random token; `secrets_list` lists labels through it.

To have the agent enter a stored secret, authorize it to use the label; it then passes the exact reference
`{{secret:<label>}}` as an input argument:

| `cua` API call | runtime command | expanded field |
|---|---|---|
| `app.paste(text)` (text format) | `paste` | the whole `text` |
| `app.typeText(text)` | `type_text` | the whole `text` |
| `app.setValue(index, value)` | `set_value` | the whole `value` |
| Chrome tab `tab.playwright.<locator>.fill(value)` | `playwright_locator_fill` | the whole `value` |
| Chrome tab accessibility paste/type/set-value action | `tab_ax_action` | the whole `text` (paste, type_text) or `value` (set_value) |

The substitution happens inside the runtime's trusted service process (`src/services/sky.mjs`, and
`src/services/browser.mjs` for Chrome), after the agent's
code and the MCP call have passed: the value comes from the connection's broker and goes only to the native input
command, never into the agent's code, the tool result or an error. Only an argument that is entirely one reference
expands; text that merely contains `{{secret:…}}`, any other method or field, and JavaScript strings in general are
left alone. A reference fails before anything is entered, with a value-free error code, when its label is invalid or
unknown, the Keychain is locked or denies access, secrets are off (`CUA_SHIM_SECRETS=off`: `secrets_disabled`) or
unavailable (helper not built, broker gone: `secrets_unavailable`), or the command is not in its pinned shape
(`unsupported_secret_shape`). If the native command fails after substitution, the error is a fixed diagnostic
(`secret_input_failed`, with the runtime's error name when it is one of its fixed codes); the runtime's own message is
withheld because it can contain the value, and the input may have been partly entered.

This is input substitution, not a vault around the value: once entered, a secret can be seen in screenshots, the
app's accessibility text or the app itself, and `paste` uses the system clipboard as the runtime always does (it
restores the previous contents; a clipboard manager may record it). `typeText` enters the value as keystrokes, so an
ordinary text view's own substitutions (autocorrect, automatic capitalization, smart dashes) can change it, and even
text typed before it, as they would for a person typing; password fields do not do this. Only authorize secrets for
apps you would type them into yourself. In Chrome the same rules apply to the two browser rows above, only on
OpenAI's pinned browser service version (`unsupported_browser_runtime` otherwise); script evaluation, CDP commands and
every other browser command are never scanned. A failed `locator.fill` makes the vendor's client read back
diagnostics of the matched elements (tag, role, type, label, text; not the input's value).

cua runs the helper installed at `$CUA_HOME/bin/cua-keychain` when there is one, else this checkout's build output,
`native/keychain/.build/release/cua-keychain`; `npm run build:helper` writes both, the installed one being a copy of the
build with the same signature. Nothing else (in particular not the generic `security` tool) is ever used in its place.
A locally built helper is ad-hoc signed, and Keychain items trust the exact helper that created them: after a rebuild,
macOS may ask whether the new helper may use them. Signing with a stable identity avoids that on one machine (`npm run
build:helper -- --sign "Apple Development: …"`); a distributable release needs a Developer ID Application signature,
which is not set up yet. `cua doctor` reports the helper's build and signature as `secrets.helper` (which also names
where it found the helper) and `secrets.signing`: not built, ad-hoc or Apple Development is `blocked`, a stale protocol
or broken signature `fail`, Developer ID `pass`.

## Chrome (browser surface)

With `CUA_SHIM_SURFACES=computer,browser` (or `browser` alone) in the server's environment, `cua serve` also hosts
OpenAI's browser service. It reaches your running Chrome through OpenAI's Chrome extension and its native host, so the
agent works in your real profiles: their cookies, signed-in sessions, settings and password manager stay where they
are, and nothing is copied or migrated. The default (`computer`) is unchanged: no browser API, no browser environment.

With the browser surface the model gets a fifth tool, `profiles_list`, OpenAI's browser API in the `js` description,
and three host notes: pick a registered profile, use Playwright locators for input, give tab creation a long limit.

### The server's Codex login

OpenAI's browser service only serves an identified session, so the server needs a Codex login of its own, made once at
a terminal:

```sh
node bin/cua.mjs login                 # opens the browser sign-in; --device-auth for the device-code flow
node bin/cua.mjs login --status        # whether the server has a login (never shows it)
```

It runs the bundled Codex CLI with `CODEX_HOME=$CUA_HOME/state/codex`, so the login lives there, never in or from your
desktop `~/.codex`. cua never reads, prints or copies the login file; `cua login --status` and the doctor's
`codex.login` check report only whether it exists. Native control does not need it. The doctor asks the CLI only when
the same run found the release's vendor signatures valid; otherwise `codex.login` is `blocked` naming
`runtime.signatures`, and nothing from the release is executed.

### Profiles

Register each Chrome profile you want the agent to use under a key of your choice. A key names an existing profile
directory (`chrome://version` shows it as the last part of "Profile Path"); registering creates nothing in Chrome and
`remove` deletes only cua's entry, never profile data.

```sh
node bin/cua.mjs profiles add personal --chrome-profile Default
node bin/cua.mjs profiles add work --chrome-profile "Profile 8"
node bin/cua.mjs profiles bind personal          # needs Chrome open on that profile with the extension enabled
node bin/cua.mjs profiles list                   # --json for the structured list
node bin/cua.mjs profiles remove work
```

The registry is `$CUA_HOME/profiles.json`. A profile is ready when its directory exists, the extension is installed
there (file presence only) and it is bound; otherwise `list` says why: `profile_directory_missing`,
`extension_not_installed` (install it in that profile yourself) or `not_bound`.

`bind` records which live extension instance is this profile, because the browser service selects a browser by that
id (`cua.getBrowser({extensionInstanceId})`). It makes one bounded, read-only launch of the runtime to list the live
extension backends with their tab counts. Only Google Chrome's backends are candidates: another browser's (Edge with
the OpenAI extension, say, or a backend that reports no browser family) is never offered or bound, and the listing
says only how many it left out. It binds automatically only when OpenAI's browser service labels exactly one
live backend with the profile's display name and no other profile has that name. In practice that label is usually
absent (the vendor's lookup fails silently; it reads Chrome's `Local State` and copies the extension's settings store
to a temporary directory to do so), so expect to pick: at a terminal `bind` shows the backends and asks which one is
this profile; elsewhere it prints the listing and exits 1, and you pick with
`cua profiles bind <key> --extension-instance-id <id>`. A pick is accepted only for a backend that is live now, and
refused when the runtime labels that backend as another profile. A single live backend is never bound without the
label; cua never chooses between profiles for you, and neither does the agent (its host notes say so).

A binding lasts only as long as the extension instance. Turning the OpenAI extension off and on again at
`chrome://extensions`, or reinstalling it, gives it a new instance id: the stored binding then points at an instance
that no longer exists, `cua.getBrowser({extensionInstanceId})` reports "The Chrome instance is unavailable.", and
`profiles_list` still shows the old id as ready (readiness is not a live check). Run `cua profiles bind <key>` again
after any such toggle or reinstall.

### Using it

The agent calls `profiles_list` (keys, readiness, and the instance id of each ready profile), selects the profile you
mean with `cua.getBrowser({extensionInstanceId})`, and opens its own tab with `cua.createBrowserTab(...)`. Three rules,
also in the host notes:

- Tabs the extension creates are DOM-only: fill and click with `tab.playwright` locators (for example
  `tab.playwright.getByLabel("Email").fill(...)`, `tab.playwright.getByRole("button", {name: "Sign in"}).click()`).
  Native `typeText`/`click` throw there.
- `createBrowserTab` can take more than 30 s: give that `js` call `timeout_ms` of at least 60000.
- A timed-out `createBrowserTab` can still have opened a tab. The agent should tell you rather than retry blindly;
  close a leftover tab yourself.

OpenAI's service asks you for access to each new website origin, as a dialog (an MCP elicitation), like an app
approval. `end_task` completes the task as for native work; what the service then does with the tabs it opened is its
own behaviour (by its source, it detaches from them) and has not been verified separately.

### What the browser service does on the network and on disk

This is OpenAI's own browser service, run as Codex runs it, and it behaves as it does there: with the browser surface
it makes its identity and telemetry calls to OpenAI's endpoints, and identity initialization starts `codex app-server`
inside the server's own `CODEX_HOME` (`$CUA_HOME/state/codex`), which writes its sqlite, skills and cache state there
and contacts port-443 endpoints. cua does not switch any of this off (no ambient-network or security override) and
claims no control over it. The browser surface is opt-in for that reason.

### The native host: placement and registration

The extension connects to one native-messaging name, `com.openai.codexextension`. Each browser holds one manifest for
that name, naming one host executable. Where the ChatGPT desktop app is installed, its manifest is already there, and
`cua serve` works with the desktop's host as it is: you need not register anything.

To have Chrome launch cua's own placed host instead (for a machine without the desktop app, or to test it):

```sh
node bin/cua.mjs chrome register             # writes cua's manifest where none exists
node bin/cua.mjs chrome register --replace   # replaces another host's manifest, after backing it up
node bin/cua.mjs chrome unregister           # removes cua's manifests and restores what they replaced
```

- Coexistence rule: `register` writes only into empty slots or over a manifest that already names cua's host in this
  `CUA_HOME`. If any browser holds a manifest cua did not write (the desktop's, another host's, or an unreadable one),
  it refuses as a whole, names each browser with the class of host found there, and writes nothing anywhere. For the
  desktop's it says the desktop's registration is in use and already works with `cua serve`. If such a manifest
  appears, or anything else fails, partway through a run, `register` undoes what it already wrote in that run (putting
  back the bytes that were there, newest first) so that "Nothing was changed." stays true; if it cannot finish that
  undo (another program wrote the slot meanwhile, say), it fails with `registration_partial`, names each unfinished
  path, keeps the backup and record, and tells you to run `cua chrome unregister`.
- `--replace` first copies each existing manifest byte-for-byte to `$CUA_HOME/chrome/manifest-backup/<browser>.json`
  and records it, prints two consequences before the first replacement, then writes cua's. The consequences: while
  cua's host is registered, the desktop's Codex side panel and app-server features in Chrome stop working (no desktop
  registry entry names cua's host, and that registry gates the app-server; cua writes none); and the desktop app writes
  its own manifest back when it next runs, which silently undoes cua's registration.
- `unregister` removes only manifests that name cua's host. Where cua replaced one, it restores the backup only when
  cua's record holds that backup's SHA-256 and the backup matches it, then verifies the restored bytes. With no backup,
  no record (or no hash for that browser), a backup that does not match, or a restore that does not read back
  identically, it removes cua's manifest, keeps the backup without installing it, and reports restoration BLOCKED
  (exit 1) with the exact command or step to fix it.
- Writes never clobber a manifest another program writes at the same moment: cua takes aside exactly the file it read,
  compares it, and publishes only into an empty slot, putting the original back on any mismatch or failure. A slot that
  stays contended after three attempts is reported (`registration_contended`), not overwritten.
- Two cua commands sharing a `CUA_HOME` never interleave: `register` and `unregister` hold
  `$CUA_HOME/chrome/registration.lock` for their whole run. A second one waits up to 5 s, then refuses with
  `registration_contended` before changing anything; a lock left by a process that no longer runs is cleared.
- Browsers covered: Chrome, Edge, Brave, Opera and Vivaldi whose user-data directory exists. Chromium and Chrome for
  Testing are left alone.
- Chrome starts the host on the extension's next connection; switching the extension off and on at
  `chrome://extensions` forces one (then rebind your profiles, above). A host Chrome already started keeps running and
  serving: after `register` the old host serves until the extension reconnects, and after `unregister` cua's host
  likewise keeps serving until the next reconnection launches the desktop's again. cua never launches, stops or
  signals a host or a browser.

`cua doctor` reports the Chrome side passively, beside runtime health: `chrome.extension.<key>` (extension present per
registered profile), `chrome.host.registered` (whether the manifest exists and whose host it names: `desktop`, `cua`
or `other`), `chrome.hosts.live` (hosts running under Chrome), `chrome.host.config` (the placed host and its
configuration) and `codex.login`.

### Limitations

- Desktop absence is not shown. Every live run so far had the ChatGPT desktop app installed, and the extension was
  served by the desktop's registered host; cua's own host serving the extension needs `chrome register --replace` with
  you present, and a machine without the desktop app is a separate release gate.
- Only tabs the agent creates have been exercised. Operations on your existing tabs, downloads, file choosers,
  dialogs, frames, saved-password autofill and Chrome tab-group side effects are untested.
- The vendor's profile label is usually absent, so `bind` needs your explicit pick (above).
- A profile without the extension stays not ready; cua never installs it.
- The Playwright-extension route explored earlier is parked, not shipped.

## Verify and acceptance

```sh
npm test                  # Node only; no Swift, runtime, GUI or network
npm run build:helper      # the Keychain helper
npm run test:helper       # the actual helper: in-memory storage and pseudo-terminals, no Keychain access
node verify.mjs           # the installed runtime in $CUA_HOME, through `cua serve`
CUA_SHIM_SURFACES=computer,browser node verify.mjs   # the same with the browser surface (five tools)
```

`verify.mjs` completes the MCP handshake, checks the tool surface for the configured surfaces, and runs trivial cells
that bind no app (the first loads OpenAI's API document) to check task identity and `end_task`. It reports which
executables served and which helper held the native socket; its cells do not open the native helper themselves (a
native call such as `cua.getState()` does), and with the browser surface it reads `profiles_list` but opens no tab. A
non-zero exit names what failed.

The acceptance runner checks the whole native + secrets slice against an explicit scratch home and writes a report
with PASS, FAIL or BLOCKED for each acceptance item of the spec (metadata only, never a secret value):

```sh
export CUA_HOME="$(mktemp -d /tmp/cua-accept.XXXXXX)"
node bin/cua.mjs install --archive <ChatGPT-darwin-arm64-26.928.40906.zip>
node scripts/accept-native.mjs --report "$CUA_HOME/acceptance.json"
node scripts/accept-native.mjs --live-keychain --report "$CUA_HOME/acceptance-keychain.json"
node scripts/accept-native.mjs --live-textedit --report "$CUA_HOME/acceptance-live.json"
node scripts/accept-native.mjs --live-keychain --live-textedit --report "$CUA_HOME/acceptance-keychain-ui.json"
```

Without a flag it runs the suites, install/reinstall, doctor, `verify.mjs`, the read-only lifecycle probe
(`scripts/probe-lifecycle.mjs`), packaging checks and a clean clone of `HEAD` that runs `npm test`, `build:helper` and
`test:helper` (deleted afterwards). The opt-in flags add live scenarios:

- `--live-keychain` runs `scripts/probe-secrets.mjs`: one uniquely labelled disposable Keychain item holding generated
  values, created and replaced through a test-only pseudo-terminal driver typing into the production `set`, read
  through the real helper → broker → trusted service → a controlled fake input target, and deleted at the end. It
  checks every input method, the failures, failing closed with secrets off or no broker, and that neither value
  appears in the MCP traffic, the server's and runtime's stderr, files under `$CUA_HOME` or the report.
- `--live-textedit` opens a new empty temporary document under `$CUA_HOME` in TextEdit, types a marker through
  `cua serve`, reads it back (accessibility text and a screenshot, recorded as metadata), closes only that window and
  deletes the file. It never touches another document and never quits TextEdit. It accepts the app-approval
  elicitation only when it is exactly the request for `com.apple.TextEdit`, for the session only, and declines
  anything else; that answer lives in the test harness, not in `cua serve`. With both flags it also types a
  disposable secret into that document; reading it back is observation of the target, not confidentiality evidence.

A macOS permission or Keychain prompt is never answered by these scripts: the step stops and is reported BLOCKED
with the human action needed. Release gates that need another environment (a clean Mac without ChatGPT, the pinned
helper's own cold start, first-run permission prompts, Developer ID signing across an upgrade) are always reported
BLOCKED here. `npm run test:keychain-live` is the narrower Keychain-only roundtrip from the helper's milestone.

The Chrome acceptance (spec C1-C7) has its own runner, against `$CUA_HOME` (by default your real home: it needs the
server's login and your registered profiles):

```sh
node scripts/accept-chrome.mjs --all --report /tmp/cua-accept-chrome-all.json
node scripts/accept-chrome.mjs --live --profile personal --report /tmp/cua-accept-chrome.json
node scripts/accept-chrome.mjs --all --c2-report /tmp/cua-accept-chrome.json --report /tmp/cua-accept-chrome-all.json
```

`--all` never opens a tab, binds a profile or registers a host. It runs `npm test`, `verify.mjs` with each surface,
the profile commands in a scratch home (and reads your home's registry), one `cua serve` connection for
`profiles_list` and the host notes, `cua doctor`, a no-op `cua install`, `cua chrome register` without `--replace`
(which must refuse) and `cua chrome unregister` (which must change nothing; both are skipped while cua's own host is
registered), and a clean clone running the suites and `npm pack --dry-run`. The live parts enter only as reports:
`--c2-report` takes a `--live` run's report, and `--c6-report` the record of the `--replace` gate run with you (its
shape and steps are in `scripts/accept/chrome-all-lib.mjs` and `docs/evidence/m12-host-placement.md`). Without them
those parts are BLOCKED with the exact steps, never passed.

`--live` is the browser secret round trip: through `cua serve` it selects the registered profile by its instance id,
creates one tab, opens the runner's own loopback page, fills its password field with `{{secret:<label>}}` for a
disposable generated Keychain item (removed at the end), and compares the page's own digest of what it received with
the generated value's. It accepts only the access request for that page's exact origin, for the session; it closes the
tab it created and reports any it could not close, and it scans the MCP traffic, stderr, the screenshot and
`$CUA_HOME/state` for the value.

## Configuration (environment of the server)

| variable | default | meaning |
|---|---|---|
| `CUA_HOME` | `~/Library/Application Support/cua` | the installed runtime, its config and approvals (`state/codex`), and per-connection directories (`run/`) |
| `CUA_SHIM_SURFACES` | `computer` | `computer`, `browser` or `computer,browser`: with `browser` the agent also gets the vendor's browser API for your existing Chrome profiles (through the original OpenAI extension and host, with the server's own Codex login), the `profiles_list` tool and `{{secret:…}}` in Chrome fills; registered with `cua profiles add`/`bind` |
| `CUA_SHIM_PERSIST` | `session` | `session`, `always` or `none`: how an accepted approval is remembered |
| `CUA_SHIM_HOST_NOTES` | built in | replacement host notes; `none` disables them |
| `CUA_SHIM_MODEL` | the client's name from `initialize` | model label sent in the runtime's turn metadata |
| `CUA_SHIM_SECRETS` | `on` | `off` starts no secrets broker; `secrets_list` then reports secrets as disabled and a `{{secret:…}}` reference fails with `secrets_disabled` |

Removed with the standalone runtime: `CUA_SHIM_PLUGIN_MCP` (the desktop launch recipe), `CUA_SHIM_CODEX_HOME` (the
runtime's home is always under `CUA_HOME`), `CUA_SHIM_SESSION_ID` (each connection has its own random session) and
`CUA_SHIM_LOG` (it recorded whole transcripts). Apart from basic OS variables (`HOME`, `USER`, `TMPDIR`, locale),
nothing else in the server's environment reaches the runtime.

## For MAWS

MAWS does not load this as a plugin. It bundles `cua-shim.mjs` as an app resource and writes the same server entry
into the `--mcp-config` it passes to Claude Code, so the agent's computer use does not depend on what is installed in
the user's `~/.claude`.
