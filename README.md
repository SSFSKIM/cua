# cua — native macOS computer use for Claude Code

Lets Claude Code read and operate macOS apps (accessibility tree, screenshots, clicks, typing, menus) by hosting
OpenAI's Codex computer-use stack. `cua serve` (the plugin runs it through `cua-shim.mjs`) is a stdio MCP server: it
launches a pinned copy of OpenAI's `cua_repl` runtime that `cua install` verified and placed under `CUA_HOME`, not the
copy inside an installed ChatGPT.app, and nothing in ChatGPT.app or `~/.codex` is read or modified. With the browser
surface turned on it also drives your existing Chrome profiles, signed-in sessions included, through OpenAI's own
Chrome extension and native host (see Chrome), and with `cua agent` it serves a client on another machine (see Remote
control). The design and its status are in `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, and for
remote control in `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`.

## Requirements

- macOS on Apple silicon, or Linux on x64 or arm64 with an X11 desktop (see Linux; other platforms get
  `unsupported_platform`), and `node` 22 or newer on `PATH`. The one npm dependency, `ws`, is needed only for remote
  control through a relay (`npm ci`); everything else runs without `node_modules`.
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

A clean Mac without ChatGPT installed has been shown, in a macOS 27 VM (`docs/evidence/clean-machine-acceptance.md`).
There, the pinned helper started from cua's release tree, macOS asked for Accessibility and Screen Recording on the
helper's behalf once, the native slice passed (`accept-native` items 1 and 3–8, with item 2 shown by the download
installs and item 9 BLOCKED by design), and the Chrome acceptance passed C1–C7. The helper first shows its own "Enable
ChatGPT Computer Use" window, which lists the permissions. Not yet shown, and a release gate rather than a defect:
stable Developer ID signing of the Keychain helper (see Acceptance).

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

Settings (below) go in the server's environment, e.g. `claude mcp add ... -e CUA_SHIM_SECRETS=off -- ...`. For a
client on another machine, see Remote control.

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
API. The server adds host notes to the server instructions covering what that document leaves out: how to run a
task (see Operating guidance for agents) and the native quirks (one approval per app, index-first addressing,
dropping an app handle after quitting it, `typeText` and emoji, and so on).

The model sees four tools: `js` and `js_reset` (OpenAI's own), `end_task`, and `secrets_list` (the labels of your
stored secrets, never values; see Secrets). Calls on one connection form a task until the model calls `end_task`, which waits for
running JavaScript and then has the runtime complete the task. The plugin no longer installs `Stop`/`SubagentStop`
hooks for this; if completion cannot be confirmed, the connection fails closed and stops its runtime, and native
cleanup of what was already submitted is unconfirmed. In this pinned runtime a forwarded MCP cancellation does not stop
a running cell and `js_reset` waits behind it, so a cell's `timeout_ms` is what bounds runaway work; cancelling never
means control has been handed back.

Be aware that binding an app hands the model that app's whole front window as text, chat lists and inboxes included.
For a messaging app, open the room you mean before asking.

### What cua changes in results

cua relays `js` and `js_reset` results with two rewrites and no other filtering: what a cell returns, text,
screenshots and page content included, reaches the client's transcript as the runtime produced it.

- Image MIME types are corrected to what the bytes are (the runtime labels JPEG screenshots `image/png`).
- Token-bearing URLs are redacted in text content and structured content, at any depth. The value of a query or
  fragment parameter whose name ends in the word `token`, `key`, `secret` or `apikey` (`token`, `access_token`,
  `refresh_token`, `api_key`, `apiKey`, `key`, `client_secret`, `X-Refresh-Token`; not `monkey`, `keyword` or
  `tokens_left`; a percent-encoded name is decoded first) becomes `<redacted>`, also inside a redirect parameter, raw
  or URL-encoded, and in a bare `?…` or `#…` reference. A value runs to the next delimiter of its URL or to a closing
  bracket it did not open (the `)` of a Markdown link), less a trailing `}`, `,` or `.`. The Playwright MCP
  extension's connection URL (`chrome-extension://<id>/connect.html?mcpRelayUrl=…&token=…`) has every parameter value
  redacted, and a loopback relay URL (`ws://127.0.0.1:<port>/extension/…`) its path. The rest of the result is
  unchanged.

The redaction exists because a first real run printed an extension connection URL with its token in a tab inventory
(`docs/evidence/2026-10-05-homework-1b-dogfooding.md`). It is a pattern list, not a data-loss filter: a credential in
any other shape (a cookie value, a header, a token in page text, a password typed into a field and read back), a URL
in an image, and JSON-RPC error replies pass unchanged, and nothing the agent sends is rewritten. In the other
direction, URL-like text that is not a URL (`x?key=1` in code or prose; a `&` or `?` after a space starts no
parameter) is rewritten too. Keep secrets out of
results with `{{secret:<label>}}` (see Secrets) and by asking for focused reads.

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
and the Chrome host notes: select only a profile `profiles_list` returned and never pick one for you, use Playwright
locators for input, loop short waits past the 3 s browser action cap, treat page evaluation as read-only, give tab
creation a long limit (see Operating guidance for agents).

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
node bin/cua.mjs profiles open personal          # open a window in that profile so its extension host comes back
node bin/cua.mjs profiles remove work
```

The registry is `$CUA_HOME/profiles.json`. A profile is ready when its directory exists, the extension is installed
there (file presence only), it is bound, and its bound extension instance is live now; otherwise `list` says why:
`profile_directory_missing`, `extension_not_installed` (install it in that profile yourself), `not_bound`,
`host_not_live` (no Chrome extension backend is live at all: wake it, below), `binding_stale` (the bound instance is
not among the live backends while others are: wake it or bind again, below), `backends_unlistable` (the listing launch
itself failed, so whether the binding is live cannot be told) or `chrome_data_unreadable` (below). The live part is
checked on every request: when some profile is bound, `list` and the agent's `profiles_list` each make the same
bounded launch as `bind` (below), without tab counts.

On macOS 26 and later, Chrome's data directory (`~/Library/Application Support/Google/Chrome`) can be behind privacy
protection: a terminal without Full Disk Access, and everything started from it (`cua serve` included), gets
"Operation not permitted" there. cua then reports the file checks as unreadable, never as a missing extension:
`add` still registers, `bind` skips the presence check, `doctor` blocks `chrome.extension.<key>` with the error code,
and a bound profile is ready whenever its bound extension instance is live, because the live check goes through the
runtime and does not need that access. A profile that is unbound or not live reads `chrome_data_unreadable`; to get
the file checks back, grant your terminal Full Disk Access (System Settings → Privacy & Security → Full Disk Access).

`bind` records which live extension instance is this profile, because the browser service selects a browser by that id
(`cua.getBrowser({extensionInstanceId})`). It makes one bounded, read-only launch of the runtime to list the live
extension backends with their tab counts. Only Google Chrome's backends are candidates: another browser's (Edge with
the OpenAI extension, say, or a backend that reports no browser family) is never offered or bound, and the listing
says only how many it left out. Beside each candidate it shows two things:

- the Chrome profile directory it belongs to (`Profile 12`, say) and that directory's display name, and whether that
  is this profile's directory or another's. cua works this out itself: for each profile in Chrome's `Local State` that
  has the OpenAI extension's settings store, it copies the store to a temporary directory under `$CUA_HOME/staging`,
  reads the extension's instance id from the copy with the installed runtime's own `classic-level`, and removes the
  copy. Chrome's own files are only read, never opened as a database or written. A candidate no store accounts for
  shows `profile directory unknown`;
- the profile label OpenAI's browser service gives it (the Chrome profile's display name, such as an account's name
  or domain), or `unlabelled` when there is none, and whether that is this profile's name or another's.

`bind` binds automatically in two cases. When this profile directory's own store records exactly one live backend,
that backend is this profile, even if another Chrome profile has the same display name. Otherwise (this profile's
store could not be read, or it has none) it binds when exactly one live backend carries this profile's display name,
no other Chrome profile has that name, and the store does not place that backend in another directory. When this
profile's store names an instance that is not live, nothing is bound: this profile's backend is not running. After an
automatic bind it prints the candidates with the bound one marked `<- likely match`, and says whether the directory
or the name decided it. Otherwise you pick: at a terminal `bind` shows the candidates and asks for the number of this
profile's backend (Enter cancels); elsewhere it prints the same listing and exits 1, and you pick with `cua profiles
bind <key> --extension-instance-id <id>`. A pick is accepted only for a backend that is live now, and refused when its
store places it in another profile directory or, with no placement, when the runtime labels it as another profile. A
single live backend is never bound without the store or the label; cua never chooses between profiles for you, and
neither does the agent (its host notes say so).

`--dry-run` makes the same decision and prints it as `would bind ...` without recording anything. `--json` returns the
listing with each candidate's `chromeProfile` (`{directory, name, thisProfile}`, or null when no store accounts for
it), `profileName` (the runtime's label, null when unlabelled), `label` (`this-profile`, `other-profile`, `unlabelled`,
or `comparison-unknown` when this profile's own name could not be read) and, after an automatic bind, `likelyMatch:
true` on the bound one with `by` (`directory` or `name`); `directoryMap.status` is `complete`, `partial` (some stores
could not be read; `unreadableStores` and `readError` say how many and why) or `unavailable` (with the `reason`). An
unbound result has `outcome: "pick_required"` and the `reason`.

The directories need Chrome's `Local State` and the extension's stores readable: without Full Disk Access for your
terminal (see above), every candidate is shown with `profile directory unknown`, `bind` adds a note with the fix, and
the label rule applies as before; it never fails `bind`. The label is the vendor's, found the same way inside the
runtime, so it also needs a sandbox that lets the runtime write a temporary directory (`CUA_SHIM_SANDBOX` `scoped`,
the default, or `disabled`); without one every candidate is unlabelled, silently.

A binding lasts only as long as the extension instance. Turning the OpenAI extension off and on again at
`chrome://extensions`, or reinstalling it, can give it a new instance id: the stored binding then points at an instance
that no longer exists, `cua.getBrowser({extensionInstanceId})` reports "The Chrome instance is unavailable.", and
`list` and `profiles_list` report the profile `binding_stale` (the agent is told to ask you to rebind). Run
`cua profiles bind <key>` again: it names the stale id beside the live backends and applies the rules above, so the
new instance is bound automatically when this profile's store records it, and otherwise the pick stays yours, even
when exactly one new unlabelled backend appeared.

A binding also needs its extension host to be running. Chrome starts the OpenAI host when the extension connects and
ends it when the profile unloads, which happens when the profile's last window closes; with Chrome closed there is
none. When no
Chrome backend is live at all, `list` and `profiles_list` report the profile `host_not_live` and name the step, with
the profile's Chrome directory: open a window in that Chrome profile, click the OpenAI (ChatGPT) extension's icon if
it still has no backend, then retry. Chrome unloads a profile, and with it the extension and its host, when the
profile's last window closes; a cua task in a profile that had no window opens one for its tab, so closing that tab, or
ending the task without marking the tab handoff, unloads the profile again (issue #41). Turning the extension off and
on at `chrome://extensions` wakes it too, but can mint a new instance id, so run `cua profiles bind <key>` afterwards.
cua never opens a window or wakes the extension on its own; it does not drive Chrome.

`cua profiles open <key>` opens that window for you when you ask, which saves a trip to the screen on a Mac whose
Chrome runs without a window (started with `--no-startup-window`, say). It runs
`open -n -a "Google Chrome" --args --profile-directory=<directory>` with the registered directory and prints that
command (`-n` because a running Chrome takes `--args` only from a newly started process, which hands them to it and
exits), then checks the key's readiness as `list` does, at 5, 10 and 20 seconds, each check one bounded runtime
launch, stopping as soon as it is ready or nothing a window changes is left to wait for. It prints the last readiness
line and exits 0 only when the profile is ready: `host_not_live` turning `ready` is the expected outcome, and a
`binding_stale` that stays may need `cua profiles bind <key>`. `--json` gives `{ok, key, directory, opened, command,
readiness}`. An unknown key or a profile directory that no longer exists is refused before anything opens. Only you
run it: the agent has no tool for it, and nothing in cua calls it.

When other profiles' backends are live but not the bound one, the backends' missing labels leave two causes cua cannot tell
apart (this profile's host asleep, or a new instance id), so `binding_stale` names both steps, the wake first.

### Using it

The agent calls `profiles_list` (keys, readiness, and the instance id of each ready profile), selects the profile you
mean with `cua.getBrowser({extensionInstanceId})` (calling `profiles_list` again if that fails), and opens its own tab
with `cua.createBrowserTab(...)`. `profiles_list` is the readiness gate: it hands out only a live profile's instance
id, and for one that is not ready it tells the agent to pass the reason's step on to you. A host that exits after
that check makes the selection fail inside the runtime with OpenAI's own "The Chrome instance is unavailable."; the
agent's next `profiles_list` then names the cause. Three rules, also in the host notes:

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
  `CUA_HOME`. If any browser holds a manifest cua did not write (the desktop's, another host's, or one that does not parse),
  it refuses as a whole, names each browser with the class of host found there, and writes nothing anywhere. For the
  desktop's it says the desktop's registration is in use and already works with `cua serve`. If such a manifest
  appears, or anything else fails, partway through a run, `register` undoes what it already wrote in that run (putting
  back the bytes that were there, newest first) so that "Nothing was changed." stays true; if it cannot finish that
  undo (another program wrote the slot meanwhile, say), it fails with `registration_partial`, names each unfinished
  path, keeps the backup and record, and tells you to run `cua chrome unregister`.
- A browser directory this process may not read (a terminal without Full Disk Access on macOS 26 and later; see
  Profiles) makes `register` and `unregister` refuse as a whole with `chrome_data_unreadable`, naming each browser's
  directory, its error code and the Full Disk Access fix, before anything is written. What such a slot holds is
  unknown, so it is never reported as empty, removed, or another host's.
- `--replace` first copies each existing manifest byte-for-byte to `$CUA_HOME/chrome/manifest-backup/<browser>.json`
  and records it, prints two consequences before the first replacement, then writes cua's. The consequences: while
  cua's host is registered, the desktop's Codex side panel and app-server features in Chrome stop working (no desktop
  registry entry names cua's host, and that registry gates the app-server; cua writes none); and the desktop app writes
  its own manifest back when it next runs, which silently undoes cua's registration. Only a whole native-messaging
  manifest is backed up: an empty, partly written or unparseable one (another program may be writing it right then)
  is left in place and, if it still is after three attempts a moment apart, reported as `registration_contended`
  with how to move a damaged one aside. A backup from an earlier run is never replaced by such a read.
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

- Without the desktop app, `cua chrome register` is required: the extension needs a manifest to launch any host, and
  until one exists it reports that the ChatGPT app is required. This has been shown on a clean VM
  (`docs/evidence/clean-machine-acceptance.md`). There, cua's placed host served the live round trip, and C1–C7 passed
  with it registered.
- Only tabs the agent creates have been exercised. Operations on your existing tabs, downloads, file choosers,
  dialogs, frames, saved-password autofill and Chrome tab-group side effects are untested.
- When the vendor's profile label is absent (Chrome's directory unreadable, or `CUA_SHIM_SANDBOX=default`) or shared
  by two profiles, `bind` needs your explicit pick (above).
- A profile without the extension stays not ready; cua never installs it.
- The Playwright-extension route explored earlier is parked, not shipped.

## Remote control

`cua agent` lets an MCP client on another machine, typically a Claude Code session in a cloud VM, drive this Mac with
exactly the tools and host notes it would have locally (`js`, `js_reset`, `end_task`, `secrets_list` and, with the
browser surface, `profiles_list`), one runtime per session, cleaned up the same way. The Mac runs a resident agent in
your GUI login session (a launchd job; on Linux a systemd user unit, see "Linux"), and the client reaches it over MCP Streamable HTTP in one of two ways: directly
on an address of the Mac (`--http`, for a LAN or a tailnet), or through a small relay you host that the Mac dials out
to (`--relay`), so the Mac needs no open port. The design is
`docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`; the live proof (Mac mini driven from a MacBook, LAN
and relay) is `docs/evidence/2026-10-06-phase-e-remote-acceptance.md`.

**While a remote agent drives it, the Mac must be unlocked and awake.** A locked screen or a session that is not the
one on the screen cannot receive input or render screenshots, so the agent refuses `js` and `js_reset` there with the
tool error `console_locked` ("the Mac's screen is locked or the session is not on the console; unlock it and retry"),
and `cua doctor`'s `agent.console` row reads `fail`. A sleeping Mac drops its relay connection (clients get
`503 device offline`) or stops answering on its address. Secrets need the same, since the login Keychain locks with
the screen. Whether to leave a Mac unlocked and unattended is your call; cua only names the state.

### 1. Enrol the Mac

```sh
node bin/cua.mjs remote enroll                                   # LAN or tailnet only
node bin/cua.mjs remote enroll --relay wss://relay.example/ws    # through a relay (see 3)
node bin/cua.mjs remote show                                     # device id, relay URL, enrolment time, devices.json line
```

`enroll` writes `$CUA_HOME/remote/device.json` (mode 0600) holding a random device id and a secret, and prints, this
once, the **client credential** (what a client presents as its bearer), the `claude mcp add` line that registers it
(on the relay's endpoint when a relay is enrolled, else on this Mac's address; see 4) and the line for the relay's
`devices.json` (SHA-256 hashes only); `--json` prints `{deviceId, clientCredential, devicesEntry, relayUrl,
relayEndpoint}`. Nothing prints the client credential again: keep it where the client will use it. Both legs get their
own credential derived from the secret, so the copy a client holds cannot be used to pose as the Mac to the relay.

The relay URL is `wss://` (the relay behind TLS), or `ws://` only to a loopback address such as a relay on the same
Mac; anything else is refused (`invalid_relay_url`), because over `ws://` the Mac's credential and every client's
bearer would cross the network in the clear.

On an enrolled Mac, `enroll` refuses (`remote_already_enrolled`) unless given `--relay <url>` alone, which updates the
relay URL in place (nothing rotated, no credential shown), or `--rotate`, which replaces the secret under the same
device id. A running agent follows `device.json`, so neither needs the agent restarted: after `--relay`, an agent that
dials a relay moves to the new one by itself (an installed job that does not dial a relay yet needs `cua agent
install` once, and `enroll` says so); after `--rotate`, the agent refuses the old client credential at once, ends
every open session (so whoever held the old credential loses its open streams too; your client initializes again),
and presents the new device credential at its next connection to the relay. Then replace the relay's line and restart
the relay (the agent reconnects with the new credential), and re-register the client with the new credential.

### 2. Run the agent

```sh
node bin/cua.mjs agent install --http <the Mac's address>:7801   # LAN or tailnet; add --surfaces <list> to narrow it
node bin/cua.mjs agent install                                   # relay only (enrolled with --relay)
node bin/cua.mjs agent status                                    # the job, the node it runs, running (pid)
node bin/cua.mjs doctor                                          # agent.installed, agent.running, agent.enrolled, agent.console
node bin/cua.mjs agent uninstall                                 # stop the job and remove it
```

`agent install` writes `~/Library/LaunchAgents/com.ssfskim.cua.agent.plist` and loads it into your GUI session
(`launchctl bootstrap gui/<uid>`). The job runs `<node> <this checkout>/bin/cua.mjs agent run`, with `--relay` when the
Mac is enrolled with a relay and `--http <host:port>` when given; with neither it refuses (`agent_nothing_to_serve`).
It starts at login, is restarted after a crash but not after a deliberate stop, logs to `$CUA_HOME/state/agent.log`,
and its environment carries `CUA_HOME` (when set), `CUA_SHIM_SURFACES` (default `computer,browser`) and each of the
agent's settings (`CUA_AGENT_*`, below) set in the environment `install` runs in. Running `install` again replaces the
job. A GUI-session job is the point: TCC grants, the login Keychain and the screen belong
to that session. It can be installed over SSH while you are logged in at the Mac (the job still runs in your GUI
session), but a first-use permission prompt needs someone at the screen. The relay path needs the `ws` package: run `npm ci` in the checkout,
or `install` refuses with `relay_unavailable`.

**After upgrading or moving node, run `cua agent install` again.** The job runs the node that ran `install` (shown by
`agent status`); a Homebrew or nvm upgrade that removes it breaks the job, and `agent.installed` then fails naming it.
With `--http` and macOS's application firewall on, that node binary is what the firewall judges for incoming
connections: allow it, or install with a node that is already allowed (otherwise macOS asks at the console the first
time the agent listens). Relay mode only dials out and is unaffected.

`--http` binds exactly the address given: `127.0.0.1:7801` serves this Mac only, the Mac's LAN or tailnet address
serves that network; do not use `0.0.0.0`. It is plain HTTP, so the bearer crosses the network in the clear: use it
on a network you trust or a tailnet, and the relay behind TLS otherwise. Instead of the job, `cua agent run [--http
<host:port>] [--relay]` serves from a terminal until a signal (`cua serve --http <host:port>` is the same as `agent run
--http`). Only one agent runs per `CUA_HOME`: a second refuses with `agent_already_running` naming the first's pid
(the launchd job retries and takes over once a terminal agent stops).

### 3. The relay

The relay (`relay/` in this repository, its own `npm ci`) is the meeting point when the client cannot reach the Mac
directly. It holds one WebSocket per enrolled Mac and carries each HTTP request to it; it keeps no session state, so
restarting it costs a reconnect, never a session.

```sh
cd relay && npm ci
node server.mjs --port 7800 --devices devices.json      # listens on 127.0.0.1; --host <address> to change that
```

Paste each Mac's `devices.json` line (from `enroll` or `remote show`) into that file and restart the relay after
editing it. Agents connect to `wss://<relay>/ws`, clients to `https://<relay>/d/<deviceId>/mcp`. The relay never
terminates TLS: put it behind a proxy that does, which must pass WebSocket upgrades on `/ws`, forward `/d/` with the
`Authorization` header intact, neither buffer nor compress responses (MCP answers are server-sent events; with nginx,
`proxy_buffering off`), and allow a read timeout of at least 10 minutes. `relay/README.md` has an nginx block and the
meaning of every answer and close code. The acceptance ran the relay on loopback behind `ngrok http 127.0.0.1:7800`;
a quick tunnel like that suits a test, not a standing setup.

For a standing relay, `relay/deploy/` creates a Hetzner Cloud server with Caddy in front (TLS from Let's Encrypt on an
`<ip-with-dashes>.sslip.io` name until a real domain replaces it) in one command, `relay/deploy/create-server.sh`, and
`relay/deploy/update.sh --devices devices.json` installs the device lines; `relay/README.md` (Hosting) has the details
and `docs/evidence/2026-10-06-hosted-relay-acceptance.md` the acceptance run through it.

### 4. Register the client

On the client machine, under the name **`cua_repl`** (`enroll` prints the line with the URL filled in, and `remote
show` prints the relay one again):

```sh
claude mcp add --transport http cua_repl https://<relay>/d/<deviceId>/mcp --header "Authorization: Bearer <client credential>"
claude mcp add --transport http cua_repl http://<the Mac's address>:7801/mcp --header "Authorization: Bearer <client credential>"   # direct
```

The name matters: permission rules (`"mcp__cua_repl__*"` under `permissions.allow`) and the app-approval hook above
(matcher `cua_repl`) match the server name; under another name the hook does not answer, and every first use of an
app waits on a dialog that a headless `claude -p` session has nobody to answer. On a machine that already has a local `cua_repl`, register the
remote one in another scope, or start Claude Code with `--strict-mcp-config --mcp-config <file>` naming it. Approvals
remembered per session (`CUA_SHIM_PERSIST=session`) are asked again by each new remote session.

**Where the client credential can be seen.** In plaintext in the client's Claude Code configuration (`~/.claude.json`
for the local and user scopes; never use `--scope project`, which writes it into the repository's `.mcp.json`): the
client machine is the credential store. In the shell history of whoever ran `claude mcp add`, and in the terminal
that ran `enroll`. By the relay's operator: the relay and its TLS proxy see every MCP payload after TLS, screenshots
and the `Authorization` header included. On the network, in direct `--http` mode without a tailnet. The Mac's
`device.json` holds the secret both credentials derive from. To revoke, `cua remote enroll --rotate` (steps in 1);
there are no per-client credentials.

### Sessions: limits, and how they end

Each `initialize` opens a session, which is one runtime on the Mac. Two numbers bound them:

- **At most 1 session at a time** (`CUA_AGENT_MAX_SESSIONS`), because every session drives the same mouse, keyboard,
  front window and Chrome. An `initialize` at the cap first evicts the oldest Idle session: nothing in flight, and
  either no task open (its last `js` was followed by `end_task`) or no stream from its client for 60 seconds (a live
  Claude Code holds a standing stream open for its whole life, so a session without one for a minute has lost its
  client, even mid-task). Only when none is Idle is it answered `503` (`cua: session limit reached (1)`).
- **Idle close after 15 minutes** (`CUA_AGENT_IDLE_MINUTES`) without a request and with nothing in flight. A long `js`
  cell never counts as idle, nor does an approval waiting for a human while the call it blocks is in flight and the
  client is connected; an approval left pending after its call ended, or by a client that went away, does not hold the
  session.

Neither Claude Code mode ends its session: headless `claude -p` sends no `DELETE` when it exits, and interactive
Claude Code none on `/exit` (seen with 2.1.287 and 2.1.291). Their sessions end by the idle close or when the next
client's `initialize` evicts them: at once when the task was ended, and a minute after the client left when it was
not, so a client that stopped without `end_task` holds a one-session Mac for that minute (newcomers get `503`
meanwhile). The host notes tell agents to call `end_task`. A client that reconnects its standing stream (after a
silent network drop, say) replaces the one the Mac still holds. A session the agent has ended answers
`404`, and the client must initialize a new one. Restarting the agent (`agent install`, a reboot, a crash) ends every
session; restarting the relay ends none.

The agent's other settings: `CUA_AGENT_ALLOWED_ORIGINS` (browser origins allowed to call, comma-separated; none by
default; requests without an `Origin`, as from Claude Code, pass) and `CUA_AGENT_CONSOLE_CHECK` (`on` by default;
`off` stops the `console_locked` refusal, for a Mac whose console state cua misreads). Every server setting under
Configuration applies to each session too. An invalid value stops `agent run` at start (`invalid_setting`). These are
read from the agent's environment: for the launchd job, set them when running `agent install` (for example
`CUA_AGENT_MAX_SESSIONS=2 cua agent install --http <address>:7801`), which checks them as `agent run` does and carries
those set into the job; an `install` without them leaves them out, back to the defaults. Fixed
bounds: a request body over 4 MB is `413`; a session whose undelivered server messages would pass 16 MB is closed.

### When the relay or the Mac is offline

| What the client sees | Why | What happens next |
|---|---|---|
| `503` `cua-relay: device offline` | the Mac has no live connection to the relay: asleep, off the network, its agent not running | check `cua agent status`, `cua doctor` and `$CUA_HOME/state/agent.log` on the Mac |
| the proxy's own error, or no connection | the relay itself is down | the agent retries from 1 s doubling to 30 s and logs `reconnected`; sessions survive, and the next call on the same session works without a new `initialize` |
| a call in flight across a relay restart | its stream was cut | Claude Code resumes it twice, 15 s apart (the server's `retry` hint), and receives the answer the Mac kept for it; an outage longer than that fails the call in the client, although the cell ran on the Mac |
| `502` from the relay | the Mac's connection dropped before it answered | as above |
| `console_locked` on `js` | the Mac is locked or another user is at the screen | unlock it and retry |
| `401` | wrong credential, or the device is missing from `devices.json` (after `--rotate`, both change, and the Mac refuses the old client credential at once) | re-register the client or update the relay's line |
| connection refused or timing out (direct `--http`) | the Mac is asleep, its agent stopped, or the firewall blocks node | as for `device offline`; see the firewall note in 2 |

An agent whose relay connection is replaced by another connection for the same enrolment (close code `4001`, such as
a copied `device.json` on a second Mac) stops and stays stopped rather than fight for it; `relay/README.md` lists the
rest.

## Linux

cua runs on Linux from OpenAI's official Linux package of the same ChatGPT release, the `chatgpt` deb for amd64 or
arm64 (pins `26.928.40906-linux-x64` and `26.928.40906-linux-arm64`). The `@oai/*` JavaScript is the macOS release's
byte for byte; the platform binaries are Linux ones: `node_repl`, the computer-use helper `sky_linux`, the Chrome
native host and `codex`. It has been shown on an Ubuntu 24.04 arm64 VM with Xorg and Openbox
(`docs/evidence/2026-10-06-linux-acceptance.md`): install, doctor, `verify.mjs`, a native action in gedit, and the
Chrome host, profile binding and a browser round trip. The x64 pin and the agent as a systemd user unit, driven
through the hosted relay, are shown in `docs/evidence/2026-10-06-linux-agent-and-x64.md`.

What it needs:

- **An X11 session.** Use Xorg, Xvfb or a VNC session, with an EWMH window manager (Openbox is enough) and the XTEST,
  Composite and XFIXES extensions. Wayland is not supported; the helper has no Wayland code. cua passes `DISPLAY` and
  `XAUTHORITY` through to the runtime. Over SSH, export `DISPLAY` (and `XAUTHORITY` when the file is not
  `~/.Xauthority`). When `DBUS_SESSION_BUS_ADDRESS` is unset, cua derives the session bus from `XDG_RUNTIME_DIR`.
- **A session bus with AT-SPI** (`at-spi2-core`). Without it, accessibility trees fall back to window-level X11
  entries.
- **Packages.** On Debian or Ubuntu:

  ```sh
  sudo apt-get install binutils xz-utils x11-utils dbus-x11 at-spi2-core bubblewrap
  ```

  `ar`, `tar` and `xz` unpack the deb, `xdpyinfo` and `dbus-send` are doctor's probes, and `bwrap` is the sandbox.
  `cua install` refuses with `missing_tool`, naming the package, when one is absent.
- **Google Chrome as a deb or rpm, never Flatpak or snap.** A Flatpak or snap Chrome cannot start a native host outside
  its own sandbox. Install OpenAI's extension in each profile you want to use, as on macOS.

Install and register from a checkout. The default `CUA_HOME` is `${XDG_DATA_HOME:-~/.local/share}/cua`:

```sh
node bin/cua.mjs install --archive ~/mirror/chatgpt_26.928.40906_arm64.deb   # or no --archive: download the pinned deb
node bin/cua.mjs doctor
node bin/cua.mjs chrome register         # writes ~/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json
node bin/cua.mjs login                   # in the X session (it opens the browser through xdg-open); over SSH: --device-auth
```

**Keep a copy of the deb.** The repository's signed `Packages` index lists only the newest version, and keeping old
pool files is not promised (the pinned file still downloaded on 2026-10-06). `--archive` takes the copy and checks it
against the pin as it would a download. Trust is the archive's pinned length and SHA-256, because nothing in the deb
is code-signed. Doctor's `runtime.signatures` says so. Each deb's own OpenPGP signature (`_gpgorigin`) was checked
against OpenAI's repository key when the pin was written; the pin's `notes` record the check.

**The sandbox.** With the computer surface, `CUA_SHIM_SANDBOX` defaults to `disabled` on Linux. Under any
`node_repl` sandbox, no runtime process may connect to a socket. On Linux that applies to the helper too, so it could
not reach the X display or the session bus, and every computer-use call would fail. So, with the computer surface,
JavaScript cells can write wherever your account can and reach the network. Doctor's `sandbox` row says so. A
connection's own `profiles_list` check runs under the connection's mode, so with `computer,browser` it is `disabled`
too.

The browser surface alone (`CUA_SHIM_SURFACES=browser`) keeps `scoped`, which works there, and so do `cua profiles
list` and `bind` unless `CUA_SHIM_SANDBOX` says otherwise. `scoped` needs bubblewrap to create unprivileged user
namespaces, and Ubuntu 23.10 and later restrict those through AppArmor. Where they are refused, the vendor's sandbox
fails open: the runtime would run cells with no sandbox at all. So `cua serve` and the profile listing refuse a scoped
launch there with `sandbox_unavailable`, before anything starts. Doctor fails `sandbox` for a scoped setup and reads
`sandbox.userns` `blocked` whenever the browser surface is on and the mode is not explicitly something other than
`scoped`, since `cua profiles list` and `bind` would be refused. To lift the restriction:

```sh
echo 'kernel.apparmor_restrict_unprivileged_userns = 0' | sudo tee /etc/sysctl.d/60-cua-userns.conf
sudo sysctl --system
```

The other way is an AppArmor profile that grants `userns` to bubblewrap alone, which keeps Ubuntu's restriction for
everything else:

```sh
printf 'abi <abi/4.0>,\ninclude <tunables/global>\nprofile bwrap /usr/bin/bwrap flags=(unconfined) {\n  userns,\n}\n' \
  | sudo tee /etc/apparmor.d/bwrap && sudo apparmor_parser -r /etc/apparmor.d/bwrap
```

A profile on the release's `codex` instead also sandboxes the runtime, but cua's own check runs bubblewrap outside
it, so cua still refuses.

**Remote control (the agent as a systemd user unit).** Enrol and pick a relay or an address as in "Remote control"
above, then, in the user's own login (SSH is fine):

```sh
node bin/cua.mjs agent install                       # relay (enrolled with --relay); or --http <address>:7801
node bin/cua.mjs agent status                        # the unit, the node it runs, running (pid), linger
sudo loginctl enable-linger "$USER"                  # once: run the unit from boot and keep it after logout
node bin/cua.mjs agent uninstall                     # stop and disable the unit and remove it
```

`agent install` writes `~/.config/systemd/user/cua-agent.service` and runs `systemctl --user daemon-reload`, `enable`
and `restart`. The unit runs the same `<node> <checkout>/bin/cua.mjs agent run --relay|--http …` as the macOS job,
with the same environment plus the X display: `DISPLAY` from `--display`, else the installing session's, else `:0`,
and `XAUTHORITY` from `--xauthority` or the session's (unset, X clients read `~/.Xauthority`). The session bus is
derived from the `XDG_RUNTIME_DIR` the user manager gives every unit. `Restart=on-failure` restarts a crash or a
refusal after 10 s, never a deliberate stop, as `KeepAlive` does on macOS; its log is `$CUA_HOME/state/agent.log`.
`WantedBy=default.target` starts it with the user's systemd manager: at login, or at boot once linger is on (cua does
not turn linger on, because logind may ask for a password; `agent status` and doctor's `agent.running` say whether it
is). Apps the agent starts live in the unit's cgroup and stop with it. Doctor reads the unit as it reads the launchd
job: `agent.installed`, `agent.running` (with linger), `agent.enrolled`, and `agent.console`, which checks the
unit's own `DISPLAY` and `XAUTHORITY`, so it is meaningful from an SSH session where doctor's `display` row fails for
lack of `DISPLAY`.

**What differs from macOS:**

- **Apps are bound by window.** Use `cua.getApp({windowId})` with an id from `listWindows()`. No app asks for
  approval, so one connection can drive every window of the session. `DISPLAY` and `XAUTHORITY` reach the runtime, so
  a model cell can talk to X directly. The trusted wrapper is not a boundary on Linux. The host notes say so.
- **Typing.** The helper's `typeText` and `paste` insert text through AT-SPI. In GTK3 text views (gedit, mousepad)
  they crashed the app on arm64, and on x64 failed without inserting ("editable Paste did not insert text").
  `pressKey`, one X keysym per character, types there on both. In GTK4 they inserted the text and then threw.
- **No secrets.** Linux has no secrets backend. `secrets_list` reports `secrets_unsupported_platform`, a
  `{{secret:…}}` reference is refused with that code before anything is typed, and `cua secrets` exits 1.
- **Doctor's rows.** `display`, `accessibility.bus` and `sandbox.userns` replace the macOS helper rows, and
  `secrets.helper` reads `skip`.
- **Remote control.** `cua remote enroll`, `cua agent run` and the relay work as on macOS, and `cua agent install`
  runs the agent as a systemd user unit (below). The agent reads no console state on Linux: there is no portable
  screen-lock signal, so `console_locked` is never answered, and doctor's `agent.console` checks instead that the
  agent's X display answers with the extensions the helper needs.

- **Chrome's own window.** Read through the native route, it exposes no accessibility tree by default. Chrome joins
  AT-SPI when toolkit accessibility is on (`gsettings set org.gnome.desktop.interface toolkit-accessibility true`).
  Web content appears only when Chrome is also started with `--force-renderer-accessibility`. The browser surface
  needs neither.

## Operating guidance for agents

The first real task run through `cua serve`, a graded ten-question assignment in an existing signed-in Chrome profile,
finished with full marks and was still slow and rough, mostly from agent technique and undocumented API semantics
rather than transport faults (`docs/evidence/2026-10-05-homework-1b-dogfooding.md`). These rules come from it. The
host notes carry each one in a line (the server instructions are capped at 2,048 characters, the runtime's own
included); this section is the longer form, for whoever writes prompts, skills or controllers around cua.

Every surface:

- **Finish with `end_task`.** Call it as soon as the task is done, before the final reply. It is what has the runtime
  complete the task and clean up; the run above never called it, so its cleanup is unverified. If `end_task` reports
  an error, the connection takes no more work: report it, do not retry.
- **One serial controller.** One agent drives a task, one `js` call at a time. The server queues concurrent calls on
  a connection anyway, so parallel calls gain nothing and blur which observation follows which action.
- **Observe, act, verify.** A call that returns without an error is not a success signal: a click on "Begin
  Experiment" returned and did nothing. Check the state the action should have changed. If it is unchanged, stop and
  find out why (focus, the wrong target, a key the widget ignores) instead of repeating the input; the run above lost
  minutes answering a prompt that never advanced.
- **Wait for readiness, not for time.** Wait for a visible condition (the element, text or state the next step
  needs) in a bounded poll, not a fixed delay; navigation can return before the page is usable. Batch the
  deterministic steps between two observations into one call, which cuts model round trips, where most of the run's
  wall time went.
- **`timeout_ms` bounds a cell.** Cancelling a call does not stop a running cell, and `js_reset` waits for it.
- **Cells have no network and write only scratch space.** Under the default sandbox (`scoped`, Configuration) `fetch`,
  sockets and DNS fail in a cell, and files can be written only under the connection's run directory and `$TMPDIR`.
  Do the work through the computer or browser API instead; an `EPERM` there is the sandbox, not a transient fault.

Chrome (browser surface):

- **Never pick or bind a profile for the user.** Use only an instance id `profiles_list` returned, for the profile the
  user named; if selection fails, call `profiles_list` again; if the profile is not ready or which one is meant is
  unclear, ask. Binding is the user's act (`cua profiles bind`, see Profiles). The run above bound a profile itself
  by matching tab contents, which proved nothing about the profile and broke this rule.
- **Browser actions stop at 3 s.** Locator actions, waits and `playwright.evaluate` are capped at 3 s by OpenAI's
  browser service, whatever their `timeoutMs` or the `js` call's `timeout_ms` say: a per-call `timeoutMs` can only
  shorten the cap, and there is no session setting (spike, issue #25; `pressSequentially` gets 5 s, downloads and
  file choosers 120 s). To wait longer, loop short waits inside the cell up to a deadline of your own, and give the
  `js` call a `timeout_ms` above that deadline: a cell that hits its `timeout_ms` resets the kernel and loses the tab
  handle.
- **Page evaluation is read-only.** `evaluate` on a page or locator runs in a read-only scope: no `fetch`, no
  `require`, and its objects are non-extensible, so instrumentation and downloads from there fail. Read the DOM with
  it and act through locators.
- Tabs the extension creates are DOM-only, `createBrowserTab` needs a long `timeout_ms`, and a timed-out creation can
  leave a tab (Chrome, Using it).
- **Press keys on a focusable element, never a frame's body.** `press` focuses its target and insists the focus took,
  which a frame's `body` can never satisfy, so it retries until the 3 s deadline and reports only `selector deadline
  exceeded` (spike, issue #26). Target the focusable widget (an input, or an element with `tabindex`), or click it with
  `tab.cua.click` and send keys with `tab.cua.keypress`. `press('F')` sends key `F` without Shift; use `'Shift+F'` when
  the page checks `shiftKey`. `tab.cua.type` pastes and fires no key events.
- **A menu that was open in an earlier call is not closed by cua.** The browser service keeps focus emulation on while
  the task runs, and a blur-sensitive listbox stayed open across idle gaps of up to two minutes (issue #26). A
  `no_matches` on it means the site closed it (a timer, hover-out, a re-render): open and select in the same call.

Beyond the host notes, the report's other lessons for task design: prefer focused reads (one tab, one element) over
whole inventories and full snapshots, which cost time and expose unrelated content; hand timed tasks whose subject is
the user's own response to the user rather than simulate them; and before a consequential, irreversible click,
confirm with the user and do not retry it blindly after a timeout.

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
with PASS, FAIL or BLOCKED for each acceptance item of the spec (metadata only, never a secret value; a row that only
records an accepted consequence is `INFO` and does not change its item's status):

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
  appears in the MCP traffic, the server's and runtime's stderr, files under `$CUA_HOME` or the report. Item 7 also
  carries two trusted-root rows, where a cell tries to create a module in each trusted code root and, for
  comparison, in its own run directory and `$TMPDIR`. "sandbox scoped (default): trusted roots unwritable, run
  directory and `$TMPDIR` writable" runs on a connection with the default sandbox and is the guarantee, PASS or FAIL.
  The informational row runs on a second connection that asks for `CUA_SHIM_SANDBOX=disabled` and records which roots
  the cell could write there, the accepted consequence described under Configuration; it is `INFO`, never a failure.
  Either way the probe removes every file the cell wrote and checks it is gone, and a file it could not remove fails
  the row.
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

`--profile <key>` (default `personal`) tells `--all` which registered profile the live reports drove: it must be
registered and bound in your home, be ready, and be the `profile` of the `--c2-report`/`--c6-report` runs. Nothing
else assumes a key or a Chrome directory: the scratch profile commands run against a fixture Chrome user-data
directory the runner creates (and deletes), and your home's registry is checked key by key against `cua doctor`.

`--all` never opens a tab, binds a profile or registers a host. It runs `npm test`, `verify.mjs` with each surface,
the profile commands in a scratch home (and reads your home's registry), one `cua serve` connection for
`profiles_list` and the host notes, `cua doctor` (C5 expects the desktop's registration, or, on a Mac without the desktop app, cua's own or none), a no-op
`cua install`, `cua chrome register` without `--replace`
(which must refuse) and `cua chrome unregister` (which must change nothing; both are skipped while cua's own host is
registered for the `--replace` gate, and reported `N/A` on a Mac without the desktop app, where nothing else is
registered), and
a clean clone running the suites and `npm pack --dry-run`. The live parts enter only as reports: `--c2-report` takes a
`--live` run's report, and `--c6-report` the record of the live registration gate run with you. Where the desktop's
(or another host's) registration is present, that is the `--replace` gate (its shape and steps are in
`scripts/accept/chrome-all-lib.mjs` and `docs/evidence/m12-host-placement.md`). Without the desktop app it is the
desktop-absent gate: `cua chrome register` writes cua's manifests into empty slots with nothing backed up, Chrome
launches cua's placed host when the extension wakes, the `--live` round trip passes through it, and `cua chrome
unregister` leaves every slot absent again; `node scripts/accept-chrome.mjs --c6-slots` prints the slots for the
before, registered and after snapshots the report carries. Without a report those parts are BLOCKED with the exact
steps for the machine they run on, never passed.

On a Mac without the desktop app, cua's own registration is the steady state: the extension needs a manifest to
launch any host, and there is nothing else to defer to. The flow there is the desktop-absent gate (ending with every
slot absent), then `node bin/cua.mjs chrome register` again, then `--all` with the gate's report while registered. C5
then reports class `cua` as expected (or no manifest, saying which it saw), and the refusal and no-op are `N/A`. cua's
record that it replaced nothing (`$CUA_HOME/chrome/registration.json`) is what tells this state from a `--replace`
gate left mid-run, which stays BLOCKED.

`--live` is the browser secret round trip: through `cua serve` it selects the registered profile by its instance id,
creates one tab, opens the runner's own loopback page, fills its password field with `{{secret:<label>}}` for a
disposable generated Keychain item (removed at the end), and compares the page's own digest of what it received with
the generated value's. It accepts only the access request for that page's exact origin, for the session; it closes the
tab it created and reports any it could not close, and it scans the MCP traffic, stderr, the screenshot and
`$CUA_HOME/state` for the value.

## Configuration (environment of the server)

| variable | default | meaning |
|---|---|---|
| `CUA_HOME` | `~/Library/Application Support/cua`; on Linux `${XDG_DATA_HOME:-~/.local/share}/cua` | the installed runtime, its config and approvals (`state/codex`), and per-connection directories (`run/`: each connection's working directory, broker socket and a record of the process that owns them; a process killed before it could remove them is found dead by the next `cua serve` or `cua doctor`, which removes its entries and says so, `doctor` in its `run.stale` row) |
| `CUA_SHIM_SURFACES` | `computer` | `computer`, `browser` or `computer,browser`: with `browser` the agent also gets the vendor's browser API for your existing Chrome profiles (through the original OpenAI extension and host, with the server's own Codex login), the `profiles_list` tool and `{{secret:…}}` in Chrome fills; registered with `cua profiles add`/`bind` |
| `CUA_SHIM_PERSIST` | `session` | `session`, `always` or `none`: how an accepted approval is remembered |
| `CUA_SHIM_HOST_NOTES` | built in | replacement host notes; `none` disables them |
| `CUA_SHIM_MODEL` | the client's name from `initialize` | model label sent in the runtime's turn metadata |
| `CUA_SHIM_SECRETS` | `on` | `off` starts no secrets broker; `secrets_list` then reports secrets as disabled and a `{{secret:…}}` reference fails with `secrets_disabled` |
| `CUA_SHIM_SANDBOX` | `scoped`; on Linux with the computer surface `disabled` (see Linux) | the sandbox node_repl applies to the runtime's JavaScript: `scoped` lets it write only its connection's run directory and `$TMPDIR`, with no network; `disabled` turns the sandbox off; `default` leaves node_repl's own default, which denies every write. Also read by `cua profiles list` and `bind` and reported by `cua doctor` |

cua sends node_repl a sandbox state, in the field Codex uses for it (`_meta["codex/sandbox-state-meta"]`), on every call
it makes, including the bounded launch behind `cua profiles list`/`bind` and `profiles_list`. Any sandbox state a client
puts in its own `_meta` is replaced by cua's.

With the `scoped` default (on Linux the default only for the browser surface alone; see Linux), JavaScript cells and
the vendor's trusted services can read everywhere your account can,
but write only to the connection's own run directory (`$CUA_HOME/run/<session>`, removed when the connection closes)
and `$TMPDIR`, which is where the vendor features that need scratch space write, such as the profile labels behind
`cua profiles bind`. Everything else refuses the write with `EPERM`: your home folder, `~/Downloads`, `/tmp`, the
runtime's files under `$CUA_HOME` and cua's own trusted code (`src/services` and `src/secrets` in the checkout that
serves, where the trusted secret-substitution code lives), so model cells cannot plant code in a trusted root. Cells
also have **no network**: `fetch`, sockets and DNS lookups fail (node_repl denies every connection from the kernel
under this kind of profile, whatever the profile says about the network). cua's own channels do not need it: the
native helper, the secrets broker and the Chrome extension are reached through node_repl's pipes.

`scoped` places one requirement on where things live: `CUA_HOME` and the cua checkout must not be inside `$TMPDIR`
(the per-user `/var/folders/…/T` directory; `mktemp -d` without a template puts things there), and nothing of cua's
may sit under `$CUA_HOME/run`. A checkout there would make cua's trusted code writable, and node_repl then refuses to
start the kernel, so every cell fails; a `CUA_HOME` there would let cells rewrite the runtime's configuration and
approvals. The default `CUA_HOME` and a directory under `/tmp` are both fine. `cua serve` and the profile listing
refuse such a layout with `sandbox_conflict`, naming each directory involved, and `cua doctor`'s `sandbox` check
fails with the same explanation.

`CUA_SHIM_SANDBOX=disabled` is the way to give cells the network and writes everywhere else: cua sends the
`disabled` permission profile, so cells and trusted services can write wherever your account can and the sandbox no
longer refuses their network connections. This fits the trust model (the agent is trusted, and cua adds no policy
against exfiltration), but it also lets a cell write cua's trusted code roots, the runtime's configuration and
approvals in `state/codex` and the vendor's modules in the installed release; you accept that cua no longer protects
the integrity of that code from the agent. With `default`, cua sends nothing. node_repl then allows reads and denies
all writes, including to `$TMPDIR` and `/tmp`, as well as network connections, and the features that need scratch
space fail.

The remote agent's own variables (`CUA_AGENT_MAX_SESSIONS`, `CUA_AGENT_IDLE_MINUTES`, `CUA_AGENT_ALLOWED_ORIGINS`,
`CUA_AGENT_CONSOLE_CHECK`) are described under Remote control.

Removed with the standalone runtime: `CUA_SHIM_PLUGIN_MCP` (the desktop launch recipe), `CUA_SHIM_CODEX_HOME` (the
runtime's home is always under `CUA_HOME`), `CUA_SHIM_SESSION_ID` (each connection has its own random session) and
`CUA_SHIM_LOG` (it recorded whole transcripts). Apart from basic OS variables (`HOME`, `USER`, `TMPDIR`, locale),
nothing else in the server's environment reaches the runtime.

## For MAWS

MAWS does not load this as a plugin. It bundles `cua-shim.mjs` as an app resource and writes the same server entry
into the `--mcp-config` it passes to Claude Code, so the agent's computer use does not depend on what is installed in
the user's `~/.claude`.
