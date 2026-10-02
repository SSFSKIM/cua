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

The model sees four tools: `js` and `js_reset` (OpenAI's own), `end_task`, and `secrets_list` (it reports that secret
storage is not configured yet). Calls on one connection form a task until the model calls `end_task`, which waits for
running JavaScript and then has the runtime complete the task. The plugin no longer installs `Stop`/`SubagentStop`
hooks for this; if completion cannot be confirmed, the connection fails closed and stops its runtime.

Be aware that binding an app hands the model that app's whole front window as text, chat lists and inboxes included.
For a messaging app, open the room you mean before asking.

## Verify

```sh
npm test            # Node only; no runtime, GUI or network
node verify.mjs     # the installed runtime in $CUA_HOME, through `cua serve`
```

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

Removed with the standalone runtime: `CUA_SHIM_PLUGIN_MCP` (the desktop launch recipe), `CUA_SHIM_CODEX_HOME` (the
runtime's home is always under `CUA_HOME`), `CUA_SHIM_SESSION_ID` (each connection has its own random session),
`CUA_SHIM_SURFACES` (native computer use only) and `CUA_SHIM_LOG` (it recorded whole transcripts). Apart from basic OS
variables (`HOME`, `USER`, `TMPDIR`, locale), nothing else in the server's environment reaches the runtime.

## For MAWS

MAWS does not load this as a plugin. It bundles `cua-shim.mjs` as an app resource and writes the same server entry
into the `--mcp-config` it passes to Claude Code, so the agent's computer use does not depend on what is installed in
the user's `~/.claude`.
