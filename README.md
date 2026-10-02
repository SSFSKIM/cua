# cua — native macOS computer use for Claude Code

Lets Claude Code read and operate macOS apps (accessibility tree, screenshots, clicks, typing, menus) by hosting
OpenAI's Codex computer-use stack. `cua serve` (the plugin runs it through `cua-shim.mjs`) is a stdio MCP server: it
launches a pinned copy of OpenAI's `cua_repl` runtime that `cua install` verified and placed under `CUA_HOME`, not the
copy inside an installed ChatGPT.app, and nothing in ChatGPT.app or `~/.codex` is read or modified. The design and its
status are in `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`.

## Requirements

- macOS on Apple silicon and `node` 22 or newer on `PATH` (no npm dependencies).
- The pinned runtime, installed once from a checkout: `node bin/cua.mjs install` (downloads OpenAI's pinned archive;
  `--archive <ChatGPT zip>` uses a local copy of it), then `node bin/cua.mjs doctor` to check it.
- The native computer-use helper needs Accessibility and Screen Recording. Where ChatGPT's Computer Use already runs,
  its helper serves this runtime too; a first-run permission flow without ChatGPT installed is not yet verified.

## Install

```sh
claude plugin marketplace add SSFSKIM/cua
claude plugin install cua@cua
```

(Inside a MAWS checkout, the repo root is also a local marketplace: `claude plugin marketplace add <path to MAWS>`
then `claude plugin install cua@maws`. The plugin's source of truth is `plugins/cua` in MAWS, published to
`github.com/SSFSKIM/cua` with `git subtree push --prefix plugins/cua`.)

Then allow the tools in your settings so each call does not prompt: `"mcp__plugin_cua_cua_repl__*"` under
`permissions.allow`. App approvals are a separate dialog; see the next section.

## App approvals

Apart from Claude Code's tool permission, OpenAI's stack asks before an app is first used, `Allow Computer Use to use
"X"?`, as an MCP elicitation that Claude Code shows as a dialog. Where an accepted answer is remembered depends on
`CUA_SHIM_PERSIST`:

- `session` (the default) writes `$CUA_HOME/state/codex/computer-use/sessions/<session id>.toml`; each server
  connection has its own random session id, so every new connection asks once more per app.
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

The substitution happens inside the runtime's trusted service process (`src/services/sky.mjs`), after the agent's
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
restores the previous contents; a clipboard manager may record it). Only authorize secrets for apps you would type them
into yourself. Browser input (`playwright_locator_fill`, tab paste/type/set-value) has a planned mapping for the
Chrome phase but is not implemented or available in this release.

A locally built helper is ad-hoc signed, and Keychain items trust the exact helper that created them: after a rebuild,
macOS may ask whether the new helper may use them. Signing with a stable identity avoids that (`npm run build:helper --
--sign "Apple Development: …"`); a distributable release needs Developer ID signing. `cua doctor` reports the helper's
build and signature as `secrets.helper` and `secrets.signing`.

## Verify

```sh
npm test                  # Node only; no Swift, runtime, GUI or network
npm run build:helper      # the Keychain helper
npm run test:helper       # the actual helper: in-memory storage and pseudo-terminals, no Keychain access
node verify.mjs           # the installed runtime in $CUA_HOME, through `cua serve`
npm run test:keychain-live   # opt-in: one disposable Keychain item with generated values, removed afterwards
node scripts/probe-secrets.mjs   # opt-in: {{secret:…}} substitution through the runtime to a fake target, no GUI
```

`scripts/probe-secrets.mjs` stores generated values in one disposable Keychain item (removed afterwards), sends
references through `cua serve` and the runtime's trusted service to a fake input target, and checks that the values
arrive there and nowhere else (MCP traffic, the server's and runtime's stderr, files under `$CUA_HOME`).

`verify.mjs` completes the MCP handshake, checks the tool surface, and runs trivial cells that bind no app (the first
loads OpenAI's API, which contacts the native helper read-only) to check task identity and `end_task`. It reports which
executables served and which helper answered. A non-zero exit names what failed.

## Configuration (environment of the server)

| variable | default | meaning |
|---|---|---|
| `CUA_HOME` | `~/Library/Application Support/cua` | the installed runtime, its config and approvals (`state/codex`), and per-connection directories (`run/`) |
| `CUA_SHIM_PERSIST` | `session` | `session`, `always` or `none`: how an accepted approval is remembered |
| `CUA_SHIM_HOST_NOTES` | built in | replacement host notes; `none` disables them |
| `CUA_SHIM_MODEL` | the client's name from `initialize` | model label sent in the runtime's turn metadata |
| `CUA_SHIM_SECRETS` | `on` | `off` starts no secrets broker; `secrets_list` then reports secrets as disabled and a `{{secret:…}}` reference fails with `secrets_disabled` |

Removed with the standalone runtime: `CUA_SHIM_PLUGIN_MCP` (the desktop launch recipe), `CUA_SHIM_CODEX_HOME` (the
runtime's home is always under `CUA_HOME`), `CUA_SHIM_SESSION_ID` (each connection has its own random session),
`CUA_SHIM_SURFACES` (native computer use only) and `CUA_SHIM_LOG` (it recorded whole transcripts). Apart from basic OS
variables (`HOME`, `USER`, `TMPDIR`, locale), nothing else in the server's environment reaches the runtime.

## For MAWS

MAWS does not load this as a plugin. It bundles `cua-shim.mjs` as an app resource and writes the same server entry
into the `--mcp-config` it passes to Claude Code, so the agent's computer use does not depend on what is installed in
the user's `~/.claude`.
