# cua — native macOS computer use for Claude Code

Lets Claude Code read and operate macOS and Linux apps (accessibility tree, screenshots, clicks, typing, menus).
`cua serve` (the plugin runs it through `cua-shim.mjs`) is a stdio MCP server: supported sessions now use cua's own
JavaScript REPL host and vendor-compatible `cua` API. macOS computer sessions default to OpenAI's engine and host;
`CUA_NATIVE_ENGINE=cua` opts into cua's own native engine and host (see Install and Use). The default has not switched.
Both routes still need the pinned runtime that `cua install` verifies and places under `CUA_HOME`, for retained modules
and the vendor compatibility route. The sandbox that confines the model's JavaScript is cua's own on both platforms, and no Codex CLI is
installed or launched (#115; see Configuration). Vendor files stay unmodified, and nothing in ChatGPT.app or `~/.codex`
is read or modified. With the browser surface turned on it also drives your existing Chrome profiles,
signed-in sessions included, through cua's own browser service, Chrome extension and native host, with no ChatGPT
account or Codex login (see Chrome), and with `cua agent` it serves a client on another machine (see Remote control).
The design and its status are in `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, for the sandbox in
`docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`, for remote control in
`docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`, for the Chrome extension in
`docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, for the browser service in
`docs/doperpowers/specs/2026-10-13-own-browser-service-design.md`, and for the REPL host in
`docs/doperpowers/specs/2026-10-14-own-repl-host-design.md`.

## Requirements

- macOS on Apple silicon, or Linux on x64 or arm64 with an X11 desktop (see Linux; other platforms get
  `unsupported_platform`), and Node matching `^22.14 || >=23.7` as `node` on `PATH` for cua itself (the plugin starts
  the server with `--disable-sigusr1`, which those versions introduced). cua's own REPL host needs Node 24 or later:
  `cua install` places a pinned official Node 24 for it under `$CUA_HOME/node`, and `CUA_NODE`, the node running cua or
  `PATH` can supply one too (see Use); sessions on the vendor host keep the pinned vendor Node. The one npm dependency,
  `ws`, is needed only for remote control through a relay (`npm ci`); everything else runs without `node_modules`.
- The pinned runtime, installed into `CUA_HOME` (default `~/Library/Application Support/cua`) by `cua install`: it
  downloads OpenAI's pinned ChatGPT archive from its official URL (about 690 MB), or takes a local copy with
  `--archive <zip>`, and refuses anything whose length, SHA-256, layout or OpenAI code signatures (team `2DC432GLL2`)
  differ from `runtime/releases/*.json`. Vendor files are never modified or re-signed.
- For the default vendor engine: Accessibility and Screen Recording for `Codex Computer Use.app`, started through
  LaunchServices. Doctor cannot read that helper's grants and reports them as `blocked` until a live run shows them.
  An already-running compatible helper is reused, never stopped or replaced.
- For cua's opt-in macOS engine: Xcode's Swift toolchain and a configured Apple Development signing identity, then
  Accessibility, Screen & System Audio Recording, and Input Monitoring for **cua Engine**. The owner grants them in
  System Settings; automation never answers a prompt. Input Monitoring enables user-intervention detection; without
  it the engine reports detection off. Doctor reads these grants from the engine. See [new-Mac onboarding](docs/onboarding-new-mac.md).
- Native control needs no account, and nothing is read from ChatGPT.app or `~/.codex`. macOS computer sessions, the one
  place the vendor's `node_repl` still runs, give it its own `CODEX_HOME` under `CUA_HOME` (`state/codex`, its config
  and app approvals) until #117; cua's own host and Linux use none.
- For Chrome only: Google Chrome with the cua extension in each profile you want to use (loaded unpacked from the
  checkout's `extension/` today; it will be listed on the Chrome Web Store) and `cua chrome register` run once (see
  Chrome). No account or login is needed. cua never installs the extension for you.

A clean Mac without ChatGPT installed has been shown, in a macOS 27 VM (`docs/evidence/clean-machine-acceptance.md`).
There, the pinned helper started from cua's release tree, macOS asked for Accessibility and Screen Recording on the
helper's behalf once, the native slice passed (`accept-native` items 1 and 3–8, with item 2 shown by the download
installs and item 9 BLOCKED by design), and the Chrome acceptance passed C1–C7. The helper first shows its own "Enable
ChatGPT Computer Use" window, which lists the permissions.

## Install

From a checkout (or after `npm link`, the same commands as `cua`):

```sh
npm test                                   # Node only; no runtime, GUI, network or credentials
node bin/cua.mjs install                   # or: install --archive <ChatGPT-darwin-arm64-26.928.40906.zip>
node bin/cua.mjs doctor                    # --json for the structured checks; exit 1 when one fails
```

`cua install` is idempotent for a verified release and never repairs one in place; `cua runtime use <release>`
switches between verified installed releases. A release that no longer verifies is reported with its offline recovery:
stop the servers using it, remove its directory, install again. On Linux it also fetches cua's sandbox helper (see
Linux).

### Opt into cua's macOS engine

Configure the signing identity first using [the owner steps](docs/onboarding-new-mac.md#7-macos-permissions-for-the-native-surface).
Then, with no session using the engine:

```sh
node bin/cua.mjs install --engine          # builds/signs at the one approved engine location
node bin/cua.mjs engine approve            # owner at the console for first grants and any capture confirmation
CUA_NATIVE_ENGINE=cua node bin/cua.mjs doctor --json
CUA_NATIVE_ENGINE=cua node bin/cua.mjs serve
```

The bundle is always `~/Library/Application Support/cua/engine/cua Engine.app`, independent of `CUA_HOME`.
`install --engine` calls the same staged builder as `engine build`: it stops an idle old engine through its protocol
before replacing it; if another connection is open, replacement fails and the approved bundle stays untouched.
An unchanged build and signature are a no-op. A changed build is pending until `engine approve` proves capture and
records it in `approved.json`; a harness serves that approved copy in place, never installs another one.

Without `--engine`, install builds only when the engine selection is `cua` (`CUA_NATIVE_ENGINE`, then the `engine`
setting in `~/.config/cua/engine.json`, then the current `vendor` default). An implicit engine build failure leaves the
runtime installation done and prints its diagnostic; explicit `--engine` makes a build failure fatal. `--engine` does
not change the selection. `--engine-sign adhoc` is for hosted CI with no lasting grants, not an everyday signing
identity. `--sign-wait <ms>` or `CUA_SIGN_WAIT_MS` sets the signing wait as for `engine build` (45 s by default;
600000 for an attended first sign, at most 1800000). On an already-onboarded Mac, GUI-domain signing over SSH is
normally silent. If a password prompt appears, automation stops and the owner handles it at that Mac's console.

Only explicit `engine approve` requests the Accessibility and Screen Recording system prompts. It prints the by-hand
`+`/bundle-path steps when macOS shows no prompt, then relaunches to take the grants. Ordinary missing-grant checks do
not request system prompts: they fail with `permissionsPending`, naming **cua Engine** and the exact Settings steps.
After a Screen Recording refusal, the next observation attempts an idle relaunch and retries once; another open
connection prevents the relaunch and leaves the permission diagnostic visible. Observations include screenshots,
so there is no text-only observation fallback without Screen Recording. Ordinary session launches stay in the background.

On cua's engine, `typeText` keys Latin-layout characters and sends unkeyable characters as Unicode rather than dropping
them. Korean input, or an unknown background per-document input source, uses paste; newline is a Return event. Verify
what the app received: app substitutions and input-method behavior still matter. Secret references never use paste on
cua's engine: use `typeText` with a reliable Latin source or `setValue` on a settable field (see Secrets).

**Removing the Codex CLI's leftovers.** This cua no longer uses what the Codex CLI left in its home (#115), but an
older cua sharing the same `CUA_HOME` may: an earlier plugin version, a long-running `cua serve` or agent from an
older checkout, whose vendor host still launches the release's `CodexCLI.app`. So a plain `cua install` removes
nothing and only says what is there. Update the plugin, and every other cua that uses this home, first; then run:

```sh
node bin/cua.mjs install --prune-leftovers
```

It removes, by name, and prints each name, never its content: in `CUA_HOME/state/codex` (cua's own `CODEX_HOME`; the
environment's `CODEX_HOME` and `~/.codex` are never looked at), `auth.json`, `installation_id`, the `*.sqlite` files
with their `-wal` and `-shm`, `models_cache.json`, `cache/`, `plugins/`, `skills/`, `log/`, `tmp/arg0` and
`browser/sessions` (what `node_repl` keeps there, `config.toml`, `computer-use/sessions` and `node_repl/active_execs`,
stays); and in each installed release whose pin no longer lists it, the unused `CodexCLI.app` (about 229 MB; on Linux
the `codex` file). A release's Codex CLI is removed only while no `cua serve` or profile listing of this home runs:
the prune checks right before removing it, renames it aside in one step, checks again, and puts it back if a session
appeared; otherwise it says so and leaves it for a later prune. A session that starts in the instant after that
second check is not seen; only an older cua would launch the CLI then. On macOS that older cua's launch fails; on
Linux an older cua on the vendor host may run its kernel unconfined after a failed launch (#135). So updating every
cua that shares the home before pruning is a precondition, not a nicety, and it holds for the whole time after the
prune, not only that instant. If `run/`, `state/`, `state/compat/` or
`kernel/` in the home is a symbolic link, the prune refuses and removes nothing, and a directory it cannot read is
reported, never taken as clean. A Codex CLI the prune renamed aside but could not delete
(`.CodexCLI.app.pruning-<hex>` beside the release's files) stays a leftover: doctor names it and the next prune
removes it. Nothing is followed through a symbolic link: a leftover
that is itself a link is unlinked and its target left, and a linked directory on the way to one (`state/codex`, its
`tmp/` or `browser/`, `runtimes/`, a release directory) is skipped and named as not inspected, by doctor, the prune
and a plain install alike, so it never reads as clean. Until then
`cua doctor`'s `runtime.leftovers` row names what is left and the command (`warn`, never a failure).

`cua install` does not take the pinned archive's Chrome plugin (OpenAI's native host for the ChatGPT extension): the
route that used it was removed (#79), and cua's own host comes from the checkout (`cua chrome register`; see Chrome). A
release installed earlier keeps the `chrome-plugin` directory it was given; nothing reads or launches it.

### As a Claude Code plugin

```sh
claude plugin marketplace add SSFSKIM/cua
claude plugin install cua@cua
```

This repository is its own marketplace, so the installed plugin follows `main` (`claude plugin marketplace update cua`
picks up a new version). The plugin runs `node --disable-sigusr1 cua-shim.mjs`, which is `cua serve`, as the MCP server
`plugin:cua:cua_repl` with `CUA_SHIM_SURFACES=computer,browser`; its tools are `mcp__plugin_cua_cua_repl__*`. The
installed copy needs no `npm ci`: `ws`, the one dependency, is loaded only on the relay path of `cua agent`, never by
`serve` (the suite checks that; a copy without `node_modules` reaches the runtime check). The plugin cannot install the runtime: run
`cua install` from a checkout once (Install, above), into the same `CUA_HOME`. If you registered `cua serve` yourself
before (Plain MCP server, below), remove that registration under the name you gave it (`claude mcp remove cua -s user`
for the example there, or `cua_repl`), or two servers drive the same Mac.

The same server drives other machines too: `devices_list` and `devices_use` switch its tools to a device you
registered with `cua devices` (Remote control, 4), with no registration in Claude Code per device. The plugin also
carries the `cua-remote` skill, the procedure for setting up or driving another computer through cua
(Remote control), and, where function hooks are enabled (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`), the `/secret KEY`
command: a value typed into a masked field and stored for the session's project (`/secret -g KEY`: for every
project; mode 600, see Secrets), which the model sees only by its key, and a secrets guard that redacts secrets in
what the model reads (`hooks/mods/README.md`). Allow the tools in your settings so each call does not prompt:
`"mcp__plugin_cua_cua_repl__*"` under `permissions.allow`. App approvals are a separate dialog; see the next section.
This repository is the plugin's source of truth.

Secrets need nothing extra: every copy of cua, the plugin's included, reads the same store in your home directory
(see Secrets).

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
"X"?`, as an MCP elicitation that Claude Code shows as a dialog; on Linux cua's trusted wrapper asks the same per app
(see Linux). An app declined is remembered for the connection; whether one accepted is depends on `CUA_SHIM_PERSIST`:

- `session` (the default): the connection remembers it until it closes, through the runtime's idle stops, so every
  new connection asks once more per app. (The vendor's host, which macOS computer sessions run, also writes
  `$CUA_HOME/state/codex/computer-use/sessions/<session id>.toml`, removed when its connection closes.)
- `none`: an accepted app is asked about again on every use.
- `always` is refused at start (`invalid_setting`): cua remembers an approval for its connection only. To stop being
  asked, let the plugin's `Elicitation` hook answer (below); a stricter hook is where a veto lives.

**The plugin answers these dialogs for you, by design.** Its `Elicitation` hook (`hooks/hooks.json`, matcher
`cua_repl|plugin:cua:cua_repl`) runs `hooks/cua-approve.sh`, which accepts every elicitation cua_repl sends (cua's
browser service sends none of its own; see Chrome, Using it); Claude Code runs the hook before it would show the dialog
and takes its answer as the user's. This follows the owner's trust model (the agent is trusted and cua adds no policy of
its own; issues #20 and #36), and it is what lets an unattended or headless session (`claude -p`, a remote client) use
an app at all. Other servers' elicitations are untouched. The script uses `jq` when present and prints the same answer
without it, so a missing `jq` never leaves a dialog nobody answers.

Be clear about what it removes: the model can bind any app OpenAI's policy allows, and binding hands it that
app's whole front window (see Use). To narrow it, edit `hooks/cua-approve.sh` in your copy to test `.message` and
print nothing for the rest (empty output leaves the dialog to you), for example
`jq -c 'if (.message // "" | startswith("Allow Computer Use to use ")) then {hookSpecificOutput:{hookEventName:"Elicitation",action:"accept",content:{}}} else empty end'`;
to drop it, remove the `Elicitation` entry from the plugin's `hooks/hooks.json` (an edit to the installed copy lasts
until the next plugin update). Without the plugin, register the same script yourself under `hooks.Elicitation` in
`~/.claude/settings.json` with that matcher and `"command": "bash /path/to/cua/hooks/cua-approve.sh"`.

## Use

Ask for the task in plain words: "open Notes and read my latest note", "in Preview, rotate this image and save".
The first call returns the `cua` API document to the model, which then writes small JavaScript cells against that API.
On cua's own host the document is a port of OpenAI's, with the recorded exclusions (Licences and sources). That first
call is also when `cua serve` launches the runtime (a few seconds; see Process footprint below), so it takes longer than
the ones after it. The server adds rules covering what that document leaves out: how to run a task, in the host notes
it appends to the server instructions (see Operating guidance for agents), and the native quirks (index-first
addressing, dropping an app handle after quitting it, `typeText` and emoji, and so on), ahead of the REPL's text in the
`js` description.

The model sees four tools: `js` and `js_reset` (the vendor-compatible REPL tools), `end_task`, and `secrets_list` (the
keys of your stored secrets, never values; see Secrets). Calls on one connection form a task until the model calls
`end_task`, which waits for running JavaScript and then has the runtime complete the task. The plugin no longer
installs `Stop`/`SubagentStop` hooks for this; if completion cannot be confirmed, the connection fails closed and stops
its runtime, and native cleanup of what was already submitted is unconfirmed. With either host a forwarded MCP
cancellation does not stop a running cell and `js_reset` waits behind it, so a cell's `timeout_ms` is what bounds
runaway work; cancelling never means control has been handed back.

**REPL host.** cua now supplies its own execution host (`src/repl-host/`) and model-facing API (`src/cua-api/`, with
the documents in `docs/cua-api/`). The choice is fixed when a connection opens, including its later idle relaunches.
With `CUA_REPL_HOST` unset or empty, the defaults are:

| session | REPL host | why |
|---|---|---|
| Linux | `cua`, with Node 24+ | The owned host serves Linux computer and browser sessions (`linux`); it is the only host there: the vendor host is retired on Linux (#115), so `CUA_REPL_HOST=vendor` is refused (`repl_host_refused`) and a missing Node 24 refuses (`repl_host_node`) |
| macOS, browser only (MAWS and profile listing included) | `cua`, with Node 24+ | No native-helper peer is needed (`browser_only`) |
| macOS, computer enabled, vendor engine (default) | `vendor` | The vendor helper accepts only the vendor host's `node_repl` as a peer (`macos_native_peer_requires_vendor`) |
| macOS, computer enabled, `CUA_NATIVE_ENGINE=cua` | `cua`, with Node 24+ | Serves the approved cua engine; a missing approved engine refuses rather than silently using vendor |

Either host runs cua's own browser service with the browser surface (Chrome).

The own host takes the first Node 24 or later it finds through `CUA_NODE` (an absolute path), the Node `cua install`
placed under `$CUA_HOME/node`, the node running cua, then the first `node` on `PATH`, never the vendor's pinned Node.
cua itself keeps running on your Node; only the own host's processes use the installed one. After the runtime,
`cua install` downloads the official nodejs.org tarball of the pinned Node 24 for this platform (or takes a local copy
with `--node-archive <tarball>`), refuses it unless its length and SHA-256 match `runtime/releases/node/*.json` (on
macOS also unless `bin/node` carries the OpenJS Foundation's Developer ID signature, team `HX7739G8FX`) and its
`--version` is the pinned one, and keeps only `bin/node` and its licence in `$CUA_HOME/node/<version>`, recording the
binary's SHA-256: a `bin/node` that no longer matches its record is never run, neither by a later install nor as a
candidate. Like the runtime, a verified Node makes it a no-op, and a damaged one is reported, never repaired in place. If that step fails,
the command fails after the runtime is in place and says so; `--no-node` skips it, as for an offline install without
the tarball. If no candidate qualifies, a macOS session that would default to cua keeps the vendor host with reason
`own_host_node_unavailable`, and a Linux session is refused: run `cua install`, install Node 24 or later yourself, or
set `CUA_NODE` to one. This is selection before launch, not a retry on another host after a failed launch. On macOS
`CUA_REPL_HOST=vendor` is the rollback. An explicit `CUA_REPL_HOST=cua` instead refuses when no suitable Node is found (`repl_host_node`) or when the
computer surface uses the vendor engine on macOS (`repl_host_refused`); select `CUA_NATIVE_ENGINE=cua` with its approved
bundle to use the own host for computer sessions. It is never silently downgraded. This replaces the host and
facade on supported sessions, not the installed vendor runtime.

`cua doctor`'s `repl.host` row names the host and reason for the configured session and the separate browser-only
profile listing. It reads `pass` for usable selections, `fail` for a setting or explicit
selection that refuses, and `warn` when either would use cua's host but cannot find Node 24, naming the candidates
tried and the remedies above. A `warn` does not make `ok` false or the exit nonzero: on macOS the session keeps working
on the vendor host.

**Process footprint.** Claude Code starts the plugin's server in every session, used or not, so `cua serve` holds no
runtime until a call needs one. It answers the MCP handshake and the tool list itself and launches the selected host
on the first `js` or `js_reset`: cua's supervisor on user Node, with its kernel and trusted worker, or the vendor's
`node`, `node_repl` and their children. Both hosts confine their children with cua's own sandbox (Configuration); no
`codex` process runs.
A runtime that goes 15 minutes (`CUA_RUNTIME_IDLE_MS`, in milliseconds; `0` keeps it for the session's life) without a
`js`, `js_reset`, `end_task` or `profiles_list` live check is stopped as a task's end and a session's close stop it: an
open task is completed first (its app and Chrome attachments released, a MAWS browser's lease included), the processes are torn down
and the connection's working directory under `run/` removed, while the session's MCP connection, its MAWS socket and
its app approvals (which the connection remembers, not the runtime) stay. A running call never counts as idle. The next `js` or `js_reset` launches a fresh runtime, and
its result opens with a line telling the model that the runtime restarted after idling and its REPL state (variables,
app handles, tabs) is gone, ahead of the API document a fresh runtime returns; a call that arrives while the runtime is
being stopped waits for the fresh one. `secrets_list`, `devices_list`,
`devices_use`, an `end_task` with no task open and the registry part of `profiles_list` never launch it (a bound
profile's live check makes its own short launch, see Profiles), and a session that never used cua exits with nothing to
tear down. The handshake answers come from the selected host itself: the first connection of an installed release
(per host and host/API version, enabled surfaces and client protocol version) launches at its handshake, as every
connection used to, and its answers are recorded under `$CUA_HOME/state/handshake/<release>/` for the connections
after it. A vendor answer cannot stand in for cua's, or an older host/API version for a new one.

`cua serve` (the plugin's server) adds two more: `devices_list` and `devices_use`, which switch every other tool to a
remote machine and back (Remote control, 4). The agent's HTTP sessions never list them.

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
results with `{{secret:<KEY>}}` (see Secrets) and by asking for focused reads.

## Secrets

Secrets are plain files, one value per file, in the directory the plugin's `/secret` mod writes
(`hooks/mods/secrets.tsx`): `~/.config/claude-secrets/<KEY>` (file mode 0600, directory 0700; `$HOME` decides where
`~` is). A KEY is letters, digits and `_`, not starting with a digit. One store serves cua on macOS and Linux, locally
and through the remote agent, and any other tool that reads that directory.

The store has two tiers. That directory is the global one, for every project. Each project has its own beside it,
`~/.config/claude-secrets/projects/<slug>/<KEY>`, the slug being the project's path in the form Claude Code names its
`~/.claude/projects/` folders (every character other than a letter or digit becomes `-`: `/Users/me/repo` is
`-Users-me-repo`). The project is the main checkout of the git repository around the working directory, so every
worktree of a repository shares its secrets, and outside a repository the directory itself. A key stored in both is
read from the project's tier: the project's value shadows the global one. Device credentials (`CUA_DEVICE_…`, Remote
control) live in the global tier only, and so does everything a device's remote agent serves: it has no project.
Existing files stay where they are; nothing moves between tiers.

The preferred way to store one is `/secret KEY` in Claude Code (the plugin's mod, where function hooks are enabled):
it opens a masked field, writes the file in the session's project tier (`/secret -g KEY` or `--global`: the global
tier), and the model sees only the key. The model's system prompt lists the keys of both tiers, each marked
`(project)` or `(global)`, a global key the project shadows included. Without the mod, cua does the same at a
terminal, on the global tier unless told `--project`:

```sh
node bin/cua.mjs secrets set WORK_PASSWORD             # typed twice at a masked prompt, nothing echoed
node bin/cua.mjs secrets set WORK_PASSWORD --project   # the same, for the project of this directory
node bin/cua.mjs secrets list                          # keys only, both tiers, each marked; --project or --global for one
node bin/cua.mjs secrets remove WORK_PASSWORD          # asks for confirmation; --yes skips it; --project for that tier
```

A value is only ever typed at a terminal: `set` refuses arguments, flags and piped input, and nothing prints or
exports a value. `secrets_list` lists the keys of both tiers, once each: the names of the stores' regular files that follow the KEY rule, whatever their mode
(a key whose file is not 0600 is listed, then refused with `secret_insecure_mode` when used). `cua serve` learns its
project from its own working directory, which Claude Code sets to the session's. `cua doctor` reports the global store
(`secrets.store`) and the working directory's project tier (`secrets.project`).

To have the agent enter a stored secret, authorize it to use the key; it then passes the exact reference
`{{secret:<KEY>}}` as an input argument:

| `cua` API call | runtime command | expanded field |
|---|---|---|
| `app.paste(text)` (text format) | `paste` | the whole `text` |
| `app.typeText(text)` | `type_text` | the whole `text` (on Linux also `app.paste`, which the vendor sends as `type_text {window, text}`) |
| `app.setValue(index, value)` | `set_value` | the whole `value` |
| Chrome tab `tab.playwright.<locator>.fill(value)` | `playwright_locator_fill` | the whole `value` |
| Chrome tab accessibility paste/type/set-value action | `tab_ax_action` | the whole `text` (paste, type_text) or `value` (set_value) |

The substitution happens inside the runtime's trusted service process (`src/services/sky.mjs`, and
`src/services/browser.mjs` for Chrome), after the agent's
code and the MCP call have passed: the trusted service reads the file (from the store directories `cua serve` resolved
from its own `$HOME` and working directory, the project's first) and hands the value only to the native input command, never to the agent's code, the tool
result or an error. Only an argument that is entirely one reference expands; text that merely contains `{{secret:…}}`,
any other method or field, and JavaScript strings in general are left alone. A reference fails before anything is
entered, with a value-free error code, when its key is invalid (`invalid_secret_label`) or unknown
(`secret_not_found`), its file is not a regular file owned by you with mode 0600 (`secret_not_regular_file`,
`secret_wrong_owner`, `secret_insecure_mode`: cua never reads such a file; `chmod 600` it), is over 256 KiB or not
UTF-8 text (`secret_too_large`, `secret_unsupported_value`), is empty (`secret_empty`: neither writer stores an empty
value, so it is an interrupted write) or cannot be read (`secret_unreadable`), secrets are off
(`CUA_SHIM_SECRETS=off`: `secrets_disabled`), or the command is not in its pinned shape (`unsupported_secret_shape`).
Exactly one trailing newline is dropped from a file's contents, so a file written with `echo` works. If the native command fails after substitution, the error is a fixed diagnostic
(`secret_input_failed`, with the runtime's error name when it is one of its fixed codes); the runtime's own message is
withheld because it can contain the value, and the input may have been partly entered.

On cua's macOS engine, a substituted `typeText` is marked concealed: it uses keys/Unicode only under a reliable Latin
input source (the per-document source preference off, or the app frontmost). Otherwise it fails before input with
`concealedInputUnavailable`; use `setValue` on a settable field instead. A substituted `paste` is refused too, so secret
text never enters the clipboard through this engine's input service. The vendor route's `paste` still uses the system
clipboard, restores it afterwards, and may be recorded by clipboard managers.

This is input substitution, not a vault around the value: once entered, a secret can be seen in screenshots, the
app's accessibility text or the app itself. `typeText` enters the value as keystrokes, so an
ordinary text view's own substitutions (autocorrect, automatic capitalization, smart dashes) can change it, and even
text typed before it, as they would for a person typing; password fields do not do this. Only authorize secrets for
apps you would type them into yourself. In Chrome the same rules apply to the two browser rows above, only on the
pinned version of cua's browser service (`src/browser-service/VERSION`; `unsupported_browser_runtime` otherwise);
script evaluation, CDP commands and every other browser command are never scanned. A failed `locator.fill` makes the
REPL client read back diagnostics of the matched elements (tag, role, type, label, text; not the input's value).

**What the store does not protect against.** The store is as private as your account: any process running as you can
read it. The agent's JavaScript cells cannot, under the `scoped` default and `default` (#115): cua's sandbox gives the
cells' kernel its own profile, which denies the store and every project tier (by real path, a symlinked tier's target
too), `~/.config/cua` and cua's own home (on macOS all of it but the runtime, its Node and the connection's own run
directory; on Linux its `state/`, `remote/`, `chrome/` and `run/` but that run directory: see Configuration), so a
cell's read fails with `EPERM` or `EACCES`, while the trusted worker, which fills `{{secret:KEY}}` in, still reads it.
Under `CUA_SHIM_SANDBOX=disabled` nothing is denied and cells read everywhere your account can. Bash in Claude Code is
not sandboxed this way: nothing keeps the model from reading the directory there, so the plugin's secrets guard (not a
sandbox) redacts what it reads instead, and cua's host notes tell the agent never to read it. Until 0.15.0 cells could
read the store under every mode.

**The secrets guard.** Where function hooks are enabled, the plugin carries devcloud's secrets guard (vendored from
the doperpowers marketplace; `hooks/mods/guard/VENDORED.md`). It redacts and never refuses: no tool call is refused
for touching the store, and a value a tool prints reaches the model and the transcript as a handle. Stored values of
every tier become `[secret:KEY]` (an encoding of one, `[secret:KEY~b64]` and the like), values in well-known
credential files (`gh`, `codex`, `gcloud`, `.netrc`, `.pgpass` and others) `[secret:<file>:<field>]`, and
token-shaped strings anywhere `[redacted:<kind>#<id>]`. A handle written into a Write, Edit, MultiEdit or
NotebookEdit call is restored to its exact bytes before the call runs, and in Bash where it stands as a plain value
in a plain position. Until 0.14.0 cua had a stricter guard of its own, which refused any tool call naming the store.
When devcloud's own plugin is loaded beside cua, cua's copy stands down and devcloud's guard decides every handle;
only devcloud's loaded module's own answer to its marker stands it down, so from the first event after devcloud is
disabled and the plugins reloaded cua's guard acts, and anything else leaves it acting (`hooks/mods/README.md`).

`cua doctor`'s `secrets.store` row reports the store from metadata only: `blocked` while nothing is stored, `fail`
for a directory open to others or a key file cua would refuse (named by key), `pass` with the number of keys.
Until issue #66 the store was the macOS login Keychain behind a Swift helper and a per-connection broker; both are
gone, and Keychain items stored by older versions are not read (store them again with `/secret` or `cua secrets set`).

## Chrome (browser surface)

With `CUA_SHIM_SURFACES=computer,browser` (or `browser` alone) in the server's environment, `cua serve` also gives the
agent the browser API: cua's owned REPL client on its own host, the pinned vendor client on the vendor host (the same
API the model learns from its first call's document), served by cua's own browser service (`src/browser-service/`, in
the runtime's trusted worker) on either host. The service reaches your running Chrome through cua's own Chrome
extension, named "cua", and a native host cua runs itself, so the agent works in your real profiles: their cookies,
signed-in sessions, settings and password manager stay where they are, and nothing is copied or migrated. It needs no
ChatGPT or OpenAI account and no Codex login. The default (`computer`) is unchanged: no browser API, no browser
environment.

cua's browser service is a port of OpenAI's (the one pinned in the runtime): it serves every command OpenAI's serves on
the Chrome route with the same results, apart from recorded differences in cua's favour, as a differential harness
(`scripts/browser-parity.mjs`) measures through the real client against both. The harness loads OpenAI's service from
the pinned runtime for its comparison lane (`test/browser-parity/vendor-oracle.mjs`, test-only); no production launch
selects it since #79 removed it with the ChatGPT extension route. cua's service drops what belonged to OpenAI's
products: the per-URL site-status check that ended a session on sites OpenAI blocks, the telemetry, the Codex app-server
and its stored grants, and every approval prompt of its own. It lifts two of the vendor's limits: each phase of a
locator action, wait or `evaluate` takes the caller's `timeoutMs` up to 120 s (3 s by default), and `evaluate` runs in
the page's own world as Playwright's does. The REPL host is a separate choice (Use): browser-only macOS and Linux
sessions default to cua's host when Node 24+ resolves; macOS sessions that also enable `computer` use the vendor host
for the default vendor engine, or cua's host for the opt-in cua engine, with the same cua browser service.

With the browser surface the model gets a fifth tool, `profiles_list`, whose description carries the Chrome rules:
select only a profile `profiles_list` returned and never pick one for you, use Playwright locators for input, give a
slow wait its own `timeoutMs` and the `js` call a `timeout_ms` above it, expect `evaluate` to act on the page and run
once, give tab creation a long limit (see Operating guidance for agents). The browser API is in the `js`
description, and in full in the document the first `js` call returns.

Setting it up, once per machine and once per Chrome profile:

```sh
# the cua extension in each Chrome profile you want to use (below), then:
node bin/cua.mjs chrome register                     # cua's native host, for this CUA_HOME
node bin/cua.mjs profiles add personal --chrome-profile Default
node bin/cua.mjs profiles bind personal              # Chrome open on that profile with the extension
node bin/cua.mjs doctor                              # chrome.* rows pass, chrome.route first
```

This is the only Chrome route. A home registered for the ChatGPT extension route that cua used before (removed in
#79), or with no registration at all, is told what to do by doctor's `chrome.route` row and every `cua profiles`
command (Moving a home off the ChatGPT extension route, below).

### The cua extension

- **From the Chrome Web Store:** not listed yet; the link goes here once it is.
- **Until then, load it unpacked:** in each Chrome profile you want to use, open `chrome://extensions`, turn on
  Developer mode, click "Load unpacked" and choose the `extension` directory of your cua checkout. Chrome keeps loading
  it from there, so use a checkout at a stable path (not the plugin's cache, which every plugin update replaces), and
  after an update that changes `extension/`, click the extension's reload button on that page. Branded Google Chrome
  137 and later ignore `--load-extension`, so this is a step in Chrome's own UI, once per profile.
- **On a Linux VM:** the template in `deploy/cloud-vm/` force-installs it by policy, from a self-hosted CRX until the
  Store listing exists, then from the Store.

Every form has the same id, `jkejaaijdfpohkdhankllbekkhmnippb` (the manifest carries the public key), so registration,
binding and doctor do not care which one is installed. It asks for `debugger`, `nativeMessaging`, `tabs`, `tabGroups`,
`storage` and `alarms` and has no host permissions. It adds no scripts to web pages; the agent acts in a tab only
through Chrome's debugger, while Chrome shows its debugging bar. Its toolbar popup shows whether its host is connected
(`host: connected io.github.ssfskim.cua`, or why not), the first 8 characters of its instance id (to match against `cua
profiles bind`'s output) and how many tabs or frames it holds a debugger on. While the agent drives a tab, Chrome shows
its own "cua started debugging this browser" bar; that is the consent surface, and cancelling it detaches the agent from
that tab for good.

`npm run extension:pack` builds `dist/cua-extension-<version>.zip`, the Store upload (`extension/` without the
manifest's `key`, which the Store refuses). With `CUA_EXTENSION_KEY=<path of the owner's private key>` it also writes
the CRX signed with that key and the `update.xml` that names it, which Linux VMs install from
(`relay/deploy/update.sh --ext dist` publishes both). The key is only read to sign; `dist/` is not in git.

### Registering cua's host

```sh
node bin/cua.mjs chrome register             # writes the launcher and the browsers' manifests
node bin/cua.mjs chrome register --replace   # also takes over manifests another cua home wrote, after backing them up
node bin/cua.mjs chrome unregister           # removes this home's manifests and restores what --replace replaced
```

`register` writes `$CUA_HOME/chrome/host`, a launcher that runs this checkout's `src/chrome/host.mjs` with the current
`node` and with this `CUA_HOME` baked in (Chrome starts a native host with its own environment), and the
native-messaging manifest `io.github.ssfskim.cua.json`, which names that launcher and admits only the cua extension's
id, into the `NativeMessagingHosts` directory of every browser whose user-data directory exists (Chrome, Edge, Brave,
Opera and Vivaldi). It prints each browser's manifest and, on `--replace`, the launcher each replaced one named. The
ChatGPT extension's manifest (`com.openai.codexextension.json`) has another name and is never touched; what the removed
route left there is yours to remove (Moving a home off the ChatGPT extension route, below).

- **One home per browser.** A manifest of this name that names another home's launcher (or does not parse) makes
  `register` refuse as a whole with `other_home`, writing nothing. `--replace` backs each one up byte for byte and
  records it; `unregister` removes only manifests that name this home's launcher and puts each backup back, verified
  byte for byte. Both hold `$CUA_HOME/chrome/registration.lock`, and a manifest another program writes at the same
  moment is never clobbered.
- **Run it again after the checkout moves or `node` is upgraded.** The launcher names both by path; doctor's
  `chrome.host.registered` blocks, naming the missing one, when either is gone.
- **The home's path.** A host socket path must fit the 103-byte Unix limit: the default home does for a username of up
  to 37 characters, and a longer home is refused with `socket_path_too_long`. A home containing `:` is refused with
  `home_path_unsupported`.
- **Bindings made on the ChatGPT extension.** Profiles bound there read `rebind_required` until `cua profiles bind
  <key>` runs again; `register` names them in a `note:` (`rebindRequired` in `--json`).

Chrome starts the host when the cua extension connects: when its profile loads, again every 5 s while no host answers,
and from a one-minute alarm. The host exits when that connection closes (the profile unloads, the extension is disabled
or reloaded), so there is one host per loaded profile; `register` and `unregister` never stop a running one. The host
listens on `$CUA_HOME/chrome/b/<12 hex digits>.sock` (named for the profile's extension instance; the directory is
0700) and keeps `<name>.json` beside it: the instance id, the extension's version, its pid and, per agent session, the
tabs it holds, so doctor, the acceptance runner and you can see its state without the popup. It logs to
`$CUA_HOME/chrome/logs/`. `cua serve` gives the browser service the socket paths of every bound profile and of every
socket present when it starts, so a Chrome that opens after `cua serve` started (or restarts) is found at its socket on
the next browser call. Nothing is shared under `/tmp`, so several users of one machine each have their own.

`cua doctor` reports Chrome passively, beside runtime health (these rows never make `ok` false): `chrome.route`
(whether this home is registered for the cua extension and what is left from the removed route; below),
`chrome.extension.<key>` (the extension in each registered profile: installed, or loaded unpacked, by file presence
only), `chrome.host.registered` (`cua: io.github.ssfskim.cua names this home's launcher …`, and whether its `node` and
host files are still there) and `chrome.hosts.live` (how many host sockets accept a connection within 500 ms; a socket
file whose host is gone is removed).

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

The registry is `$CUA_HOME/profiles.json`. A profile is ready when its directory exists, the cua extension is
installed there (file presence only; a profile where it was loaded unpacked counts), it is bound, and its bound
extension instance is live now; otherwise `list` says why: `profile_directory_missing`, `extension_not_installed`
(install it in that profile yourself), `not_bound`, `rebind_required` (bound on the ChatGPT extension: bind it again,
below), `host_not_live` (no Chrome extension
backend is live at all: wake it, below), `binding_stale` (the bound instance is not among the live backends while others
are: wake it or bind again, below), `backends_unlistable` (the listing launch itself failed, so whether the binding is
live cannot be told) or `chrome_data_unreadable` (below). The live part is checked on every request: when some profile
is bound, `list` and the agent's `profiles_list` each make the same bounded launch as `bind` (below), without tab
counts.

Inside MAWS (`CUA_BROWSER_BACKENDS` set; see For MAWS), `list` and `profiles_list` show the session's in-app browser
first, under the key `maws`, ready or `maws_unreachable`; it is never written to the registry, and the keys `maws`,
`maws-2`, … are reserved: `cua profiles add maws` is refused with `reserved_key`. `bind` never offers a MAWS backend.

On macOS 26 and later, Chrome's data directory (`~/Library/Application Support/Google/Chrome`) can be behind privacy
protection: a terminal without Full Disk Access, and everything started from it (`cua serve` included), gets "Operation
not permitted" there. cua then reports the file checks as unreadable, never as a missing extension: `add` still
registers, `bind` skips the presence check, `doctor` blocks `chrome.extension.<key>` with the error code, and a bound
profile is ready whenever its exact bound extension instance is live, because the live check goes through the runtime
and does not need that access. A profile that is unbound or not live reads `chrome_data_unreadable`; its guidance
distinguishes no live Chrome backend, a different live instance, and a failed live listing (including its error code). A
binding made on the ChatGPT extension reads `rebind_required` even when files are unreadable: bind it again. Directory
and display-name labels from Chrome data help choose a binding; they are not required to confirm an existing binding
live. To get the file checks back, grant the process doing those reads Full Disk Access (System Settings → Privacy &
Security → Full Disk Access): your terminal for `cua serve`, **the installed agent's node binary for remote control**,
not the SSH terminal. `cua agent status` prints that exact node path (for example
`~/.nvm/versions/node/<version>/bin/node`).

On macOS, doctor's `chrome.agent` row reports the resident agent's own recorded Chrome readability beside the
calling process's `chrome.extension.*` / `chrome.profiles` file checks. It names the node from the installed launchd
plist and its last observation time; a terminal's successful read never makes the agent row pass. The agent records
actual Chrome directory and Local State reads, registered-profile access and registry failures in `state/agent.json`
at startup and each `profiles_list`. A record from an old pid or node, an older agent without a record, or a stopped
job is blocked rather than guessed. After granting access, call `profiles_list` again to refresh it; no doctor
network probe, TCC edits or automatic restart is involved.

`bind` records which live extension instance is this profile, because the browser service selects a browser by that id
(`cua.getBrowser({extensionInstanceId})`). It makes one bounded, read-only launch of the runtime to list the live
extension backends with their tab counts. Only Google Chrome's backends are candidates: another browser's (Edge with
the extension, say, or a backend that reports no browser family) is never offered or bound, and the listing
says only how many it left out. Beside each candidate it shows two things:

- the Chrome profile directory it belongs to (`Profile 12`, say) and that directory's display name, and whether that
  is this profile's directory or another's. cua works this out itself: for each profile in Chrome's `Local State` that
  has the cua extension's settings store (`Local Extension Settings/<id>`, where the extension keeps its instance
  id), it copies the store to a temporary directory under `$CUA_HOME/staging`,
  reads the extension's instance id from the copy with the installed runtime's own `classic-level`, and removes the
  copy. Chrome's own files are only read, never opened as a database or written. A candidate no store accounts for
  shows `profile directory unknown`;
- the profile label the browser service gives it (the Chrome profile's display name, such as an account's name
  or domain), or `unlabelled` when there is none, and whether that is this profile's name or another's. Every Chrome
  candidate is unlabelled: the service labels a backend only from the extension id that cua's host does not give it,
  so the directory decides.

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
neither does the agent (the rules in `profiles_list`'s description say so).

`--dry-run` makes the same decision and prints it as `would bind ...` without recording anything. `--json` returns the
listing with each candidate's `chromeProfile` (`{directory, name, thisProfile}`, or null when no store accounts for
it), `profileName` (the runtime's label, null when unlabelled), `label` (`this-profile`, `other-profile`, `unlabelled`,
or `comparison-unknown` when this profile's own name could not be read) and, after an automatic bind, `likelyMatch:
true` on the bound one with `by` (`directory` or `name`); `directoryMap.status` is `complete`, `partial` (some stores
could not be read; `unreadableStores` and `readError` say how many and why) or `unavailable` (with the `reason`). An
unbound result has `outcome: "pick_required"` and the `reason`.

The directories need Chrome's `Local State` and the extension's stores readable: without Full Disk Access for your
terminal (see above), every candidate is shown with `profile directory unknown`, `bind` adds a note with the fix, and
with no label to fall back on either (above) the pick is yours; it never fails `bind`.

A binding lasts only as long as the extension instance. The cua extension keeps its instance id in its own storage:
turning it off and on keeps the id, while reinstalling it (or removing an unpacked load and loading it again) mints a
new one. The stored binding then points at an instance that no longer exists, `cua.getBrowser({extensionInstanceId})`
reports "The Chrome instance is unavailable.", and `list` and `profiles_list` report the profile `binding_stale` (the
agent is told to ask you to rebind). Run `cua profiles bind <key>` again: it names the stale id beside the live backends
and applies the rules above, so the new instance is bound automatically when this profile's store records it, and
otherwise the pick stays yours, even when exactly one new unlabelled backend appeared.

A binding also needs its extension host to be running. Chrome starts the host when the extension connects and ends it
when the profile unloads, which happens when the profile's last window closes; with Chrome closed there is none. When no
Chrome backend is live at all, `list` and `profiles_list` report the profile `host_not_live` and name the step, with the
profile's Chrome directory: open a window in that Chrome profile, open the cua extension's popup if it still has no
backend (that wakes it and shows whether its host is connected, and if not why), then retry. Chrome unloads a profile,
and with it the extension and its host, when the profile's last window closes. cua's extension never closes a window's
last tab: when a task's end, or the agent itself, closes the last tab of a normal window, a New Tab page opens in that
window first, so the window and the profile stay (issue #148). cua never opens a window or wakes the extension on its
own; it does not drive Chrome.

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
that check makes the selection fail inside the runtime with the REPL client's own "The Chrome instance is
unavailable."; the agent's next `profiles_list` then names the cause. Three rules, also in `profiles_list`'s description:

- Tabs the extension creates are DOM-only: fill and click with `tab.playwright` locators (for example
  `tab.playwright.getByLabel("Email").fill(...)`, `tab.playwright.getByRole("button", {name: "Sign in"}).click()`).
  Native `typeText`/`click` throw there.
- `createBrowserTab` can take more than 30 s: give that `js` call `timeout_ms` of at least 60000.
- A timed-out `createBrowserTab` can still have opened a tab. The agent should tell you rather than retry blindly;
  close a leftover tab yourself.

cua's browser service asks nothing of you: no dialog for a new website origin, a download, an upload or the history,
and no site is refused by a policy of its own; the permission Claude Code applies to the `js` call is the gate.
`end_task` completes the task as for native work, and cua's host then settles the task's tabs as the browser API
teaches the agent: a tab the agent created and did not mark is closed, a tab marked `deliverable` stays open and is
let go, and a tab marked `handoff` stays with the same agent session, debugger detached, and is listed again in its
next task (unless another session claimed it). The agent's tabs open in the background, without taking focus, in a tab
group named for its session, so you can tell which tabs not to touch; several Claude Code sessions each own their own
tabs, and one is refused another's. The agent can also list tabs you opened and claim one; a claimed tab is never
closed, only let go at the end.

### What the browser service does on the network and on disk

cua's browser service makes no network call of its own. It calls no OpenAI endpoint (no site-status check of the
URLs you visit, no identity lookup, telemetry or crash reporting) and reads no policy through the Codex app-server;
its fake-runtime test (`test/browser-service/no-network.test.mjs`) fails on any use of the runtime's `fetch`,
configuration or telemetry hooks. What reaches the network does so from the page, as your own browsing would:
navigations, the page's own requests, `evaluate` scripts that call `fetch`, and the features that fetch inside the
page with your session (a Google Docs or YouTube export, and a page asset the page itself references that Chrome has
not already loaded, cross-origin included). On disk it keeps nothing under `CODEX_HOME` (no stored grants or
sessions); exports and page-asset bundles are written under the system temporary directory (`$TMPDIR/browser-use/`),
and downloads land where Chrome puts them.

The REPL host around it depends on the session (Use). cua's own host does not call the vendor's telemetry, account or
app-server APIs, and it confines its children with cua's own sandbox (#115). The vendor host runs unmodified, with
cua's compat executable as its `CODEX_CLI_PATH`: it confines node_repl's children with the same sandbox and answers the
native helper's three app-server policy reads from recorded answers, with no network. In the launches measured before cua's browser service existed,
node_repl's process group also ran `codex app-server` in the server's own `CODEX_HOME` (`$CUA_HOME/state/codex`), which
keeps its own state there and does its own fetching (`docs/evidence/2026-10-07-s0-no-header-spike.md`); those launches
ran OpenAI's browser service, which made the app-server's config and auth requests and OpenAI's site-status, telemetry
and identity calls. No launch runs that service since #79.

### Limitations

- cua's host leaves out what the browser service treats as optional and answers it as unsupported, so the service
  takes the vendor's fallbacks: page events, WebMCP, browser management, history, bookmarks and top sites, and the
  coordinate and DOM `download_media` variants. There is no cursor overlay or favicon badge, and the profile label is
  not given (above).
- Downloads land where Chrome puts them (the profile's download directory) and the agent's wait for a download
  answers that path; Chrome's "Ask where to save each file" setting would stop the agent at the Save dialog. JavaScript
  dialogs work through the relay. So does the file chooser (paths on the computer running Chrome), once "Allow access
  to file URLs" is on for the cua extension at `chrome://extensions` → Details: Chrome refuses the upload to an
  extension without it, and the agent's error says so
  (`docs/evidence/2026-10-08-downloads-dialogs-chooser.md`).
- cua's browser service lifts the vendor's 3 s cap and its read-only page evaluation (Operating guidance for agents),
  but keeps the visible-DOM listing's caps (20,000 characters, 200 elements): neither REPL client can ask for more, and
  #116 preserves that API rather than adding a configurable cap. A navigation to a document whose response arrives
  while a JavaScript dialog is open stays paused until the tab is detached, as on the vendor's service.
- Any process of your user that can open `$CUA_HOME/chrome/b` (0700) can talk to the host. The ChatGPT extension's host
  checks its peer's code signature; cua's does not, the same trust cua gives your user's processes elsewhere
  (allow-all approvals, a 0600 secret store).
- When Chrome's directory cannot be read (see above), `bind` cannot tell the profile from the extension's store and
  needs your explicit pick.
- A profile without the extension stays not ready; cua never installs it, except by policy on a VM the cloud template
  provisions.
- Shown on Linux, unattended, on a Tart VM and a throwaway Hetzner VM with the force-installed CRX and no sign-in
  (`docs/evidence/2026-10-07-own-extension-linux.md`); the live acceptance on a Mac is recorded in
  `docs/evidence/2026-10-07-own-extension-acceptance.md`.
- The Playwright-extension route explored earlier is parked, not shipped.

### Moving a home off the ChatGPT extension route (#79)

Before cua had its own extension, it drove Chrome through OpenAI's ChatGPT extension
(`hehggadaopoacecdllhhajmbjkdcmajg`) and its native host (`com.openai.codexextension`), registered with `cua chrome
register --vendor`, with OpenAI's browser service and a Codex login of the server's own. #79 removed that route with the
service and the login: cua no longer writes, restores or launches anything of it, and the profile commands,
`profiles_list` and doctor know only cua's extension.

A home that still has that route's record (`$CUA_HOME/chrome/registration.json`), or no registration at all, is told
what to do: doctor's `chrome.route` row, a `note:` on stderr from every `cua profiles` command, and a `note:` from
`cua chrome register` (`leftover` in its `--json`). The row's code says which case it is:

| code | `chrome.route` | case |
|---|---|---|
| `chrome_not_registered` | `blocked` | no registration of either route |
| `chatgpt_route_removed` | `blocked`; `warn` when cua's registration exists but is older | the ChatGPT route's registration is the only one or the newest |
| `chatgpt_route_leftover` | `warn` | cua's registration is the newer; the old route's record is still there |
| `rebind_required` | `warn` | cua's registration alone, with profiles still bound on the ChatGPT extension |

The message names the steps that apply, in order, with this home's paths:

1. `cua chrome register` (again, where the ChatGPT route's registration is newer, so cua's is the current one).
2. Install or load the cua extension in each Chrome profile you use (The cua extension, above).
3. `cua profiles bind <key>` again for each profile bound on the ChatGPT extension; until then it reads
   `rebind_required`.
4. For each `com.openai.codexextension.json` manifest the old record lists that still names a host under this home
   (cua's relocated copy of OpenAI's host): where cua had replaced the ChatGPT desktop app's manifest and the backup is
   there with the hash the record holds for it, put it back with `cp <backup> <manifest>`, the backup being
   `$CUA_HOME/chrome/manifest-backup/<browser>.json` (quitting and reopening the desktop app also rewrites its own);
   where cua placed it, `rm <manifest>`. A backup that is missing or does not match the record cannot be verified and
   is never recommended: the step is to `rm` cua's manifest and quit and reopen the desktop app (or inspect the backup
   and put it back yourself). A manifest that is gone or names another host now is left alone;
   one this process may not read is named with the access to give it, and doctor is run again once it is readable.
5. Remove the old record and its backups: `rm -rf <record> <backups>`, `$CUA_HOME/chrome/registration.json` and
   `$CUA_HOME/chrome/manifest-backup`. This step is listed only once every manifest in step 4 is resolved; while one
   is unreadable or its backup unverified, the record and backups are kept for manual recovery, and a later doctor run,
   after those manifests are dealt with, lists it.

The message prints each path in these commands as a single-quoted shell word with the home's real path, so pasting
them expands nothing in it.

With cua's registration in place, the old record gone and every profile bound on the cua extension, `chrome.route`
passes. A release installed before #79 keeps its `chrome-plugin` directory (OpenAI's host); nothing reads or launches
it, and a new release does not get one.

## Remote control

`cua agent` lets an MCP client on another machine, typically a Claude Code session in a cloud VM, drive this Mac with
exactly the tools and rules it would have locally (`js`, `js_reset`, `end_task`, `secrets_list` and, with the
browser surface, `profiles_list`), one runtime per session, cleaned up the same way. The Mac runs a resident agent in
your GUI login session (a launchd job; on Linux a systemd user unit, see "Linux"), and the client reaches it over MCP Streamable HTTP in one of two ways: directly
on an address of the Mac (`--http`, for a LAN or a tailnet), or through a small relay you host that the Mac dials out
to (`--relay`), so the Mac needs no open port. Sections 1 to 3 set up the machine to be driven (the device).

A client then reaches it in one of two ways. **With the plugin** (or any `cua serve`), nothing is registered per
device: you add the device once to cua's device list (`cua devices`), and the plugin's own `cua_repl` switches its tools
to it with `devices_use` and back to this machine with `devices_use local`, in any session, without a reconnect (4).
**Without the plugin**, the client registers the device's endpoint as an HTTP MCP server named `cua_repl` (5). The
design is `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`; the live proofs are
`docs/evidence/2026-10-06-phase-e-remote-acceptance.md` (Mac mini driven from a MacBook, LAN and relay) and
`docs/evidence/2026-10-07-device-multiplexing-acceptance.md` (the plugin route, each Mac driving the other). An agent
asked to set up a device or drive one follows the plugin's `cua-remote` skill (`skills/cua-remote/SKILL.md`), which
runs these steps in order.

**While a remote agent drives it, the Mac must be unlocked and awake.** A locked screen or a session that is not the
one on the screen cannot receive input or render screenshots, so the agent refuses `js` and `js_reset` there with the
tool error `console_locked` ("the Mac's screen is locked or the session is not on the console; unlock it and retry"),
and `cua doctor`'s `agent.console` row reads `fail`. A sleeping Mac drops its relay connection (clients get
`503 device offline`) or stops answering on its address. Whether to leave a Mac unlocked and unattended is your call; cua only names the state.

### 1. Enrol the Mac

```sh
node bin/cua.mjs remote enroll                                   # LAN or tailnet only
node bin/cua.mjs remote enroll --relay wss://relay.example/ws    # through a relay (see 3)
node bin/cua.mjs remote show                                     # device id, relay URL, enrolment time, devices.json line
```

`enroll` writes `$CUA_HOME/remote/device.json` (mode 0600) holding a random device id and a secret, and prints, this
once, the **client credential** (what a client presents as its bearer), the `claude mcp add` line that registers it
(on the relay's endpoint when a relay is enrolled, else on this Mac's address; see 5) and the line for the relay's
`devices.json` (SHA-256 hashes only); `--json` prints `{deviceId, clientCredential, devicesEntry, relayUrl,
relayEndpoint, clientSecretKey, clientRegisterCommand, devicesAddCommand}`: the `/secret` key a client keeps the
credential under, the standalone registration that reads it from there (5) and the `cua devices add` line for a
client with the plugin (4) (`remote show --json` prints the last three again; both commands are `null` without a
relay, since the address a direct client uses is one only you know). Nothing
prints the client credential again: keep it where the client will use it. Both legs get their
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
node bin/cua.mjs doctor                                          # agent.installed, agent.running, agent.enrolled, agent.console, agent.relay
node bin/cua.mjs agent uninstall                                 # stop the job and remove it
```

`agent install` writes `~/Library/LaunchAgents/com.ssfskim.cua.agent.plist` and loads it into your GUI session
(`launchctl bootstrap gui/<uid>`). The job runs `<node> <this checkout>/bin/cua.mjs agent run`, with `--relay` when the
Mac is enrolled with a relay and `--http <host:port>` when given; with neither it refuses (`agent_nothing_to_serve`).
The passive doctor's `agent.relay` row reads `$CUA_HOME/state/agent.json`, beside the log: the relay URL,
connection state, last error, first failure and last connection timestamps. Connects, reconnects, failures and relay
pings update it atomically. A connected record confirmed within 90 s passes; failures, missing records (including an
older agent) and stale records block with the cause. No enrolled relay means skip; doctor never dials.

It starts at login, is restarted after a crash but not after a deliberate stop, logs to `$CUA_HOME/state/agent.log`,
and its environment carries `CUA_HOME` (when set), `CUA_SHIM_SURFACES` (default `computer,browser`) and each of the
agent's settings (`CUA_AGENT_*`, below) and `CUA_RUNTIME_IDLE_MS` set in the environment `install` runs in.
`CUA_REPL_HOST` and `CUA_NODE` are carried only when explicitly nonempty, never as resolved defaults: unset, each
connection resolves its host and own-host Node afresh (Configuration). `CUA_NODE` must be
an absolute path and is stored as given, not probed at install. To pin the installed agent's rollback, set
`CUA_REPL_HOST=vendor` when running `cua agent install` again with the same flags; a setting in a client's shell does
not change a running job. Reinstall with `CUA_REPL_HOST` unset to restore automatic selection, and supply any
`CUA_NODE` you want the job to keep. Running `install` again replaces the job. A GUI-session job is the point: TCC
grants and the screen belong to that session. It can be installed over SSH while you are logged in at the Mac (the job still runs in your GUI
session), but a first-use permission prompt needs someone at the screen. The relay path needs the `ws` package: run `npm ci` in the checkout,
or `install` refuses with `relay_unavailable`.

**After upgrading or moving node, run `cua agent install` again.** The job runs the node that ran `install` (shown by
`agent status`); a Homebrew or nvm upgrade that removes it breaks the job, and `agent.installed` then fails naming it.
**For the Chrome profile route, that exact agent node binary needs Full Disk Access**, independently of your
terminal's grant. `agent install` prints the full path and the System Settings step (also `chromeAccess` in `--json`);
`agent status` shows the installed path again. On an nvm install this is `~/.nvm/versions/node/<version>/bin/node`.
Grant the new path at the screen after node moves. `chrome.agent` in doctor reports what the agent last read.

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

### 4. Connect a client with the plugin: `cua devices`

On the client machine, register the device once in cua's device list, `~/.config/cua/devices.json` (mode 0600; one
entry per device, `{"<name>": {"deviceId": "…", "relayUrl": "https://<relay>"}}`), and keep its client credential in
the secret store under the device's key, `CUA_DEVICE_` and the device id with `-` as `_` (`clientSecretKey` in
`enroll --json`). There are two ways, and neither prints the credential: from a client config you already have, or
by storing the credential with the plugin's `/secret <clientSecretKey>` (typed into its masked field) and then adding
the entry with the `devicesAddCommand` that `enroll --json` printed.

```sh
cua devices import ~/.config/cua-relay/mini.mcp.json    # registers "mini" and stores the credential from the config
cua devices add mini --relay https://<relay> --device=<deviceId>     # or, after /secret: the entry alone
cua devices list                                        # name, device id, relay, whether the credential is stored
cua devices remove mini                                 # the entry only; cua secrets remove <key> drops the credential
```

`import` reads a client config of the shape the standalone route uses (5): `mcpServers.cua_repl` (or its one server)
with `type: http`, the URL `https://<relay>/d/<deviceId>/mcp` and an `Authorization: Bearer` header; it takes the
device id and the relay from the URL, the name from `--name` or the file's name less `.mcp.json`, and reports the
credential `stored`, `unchanged` or `replaced`. `add` takes the relay as its origin or as the agent's `wss://<relay>/ws`
and warns when the credential is not stored yet. Names are lower-case letters, digits, `-` and `_` (`local` is this
machine); `--replace` overwrites an existing name. The list and the credential are read at every `devices_list` and
`devices_use`, so a device added under a running session is usable at once. The route goes through a relay (an
`http://` one only on a local network); a device served only on its own address (`--http`) is reached the standalone
way (5).

Then, in any session of the plugin's server (`mcp__plugin_cua_cua_repl__*`):

- `devices_list` probes every device at once (3 s each) and shows which one the tools drive now:
  `{"current": "local", "devices": [{"name": "local", "status": "online"}, {"name": "mini", "deviceId": "…", "relay":
  "https://<relay>", "status": "online"}]}`. A status is `online`, `offline`, `locked` (the device's screen) or
  `unauthorized`, with a `code` where it says more (`credential_missing`, `relay_unreachable`, `timeout`). A probe is
  one authenticated `ping` without a session; it never starts the device's runtime or evicts its client.
- `devices_use {"device": "mini"}` opens a session on the device and answers with the device's own host notes and its
  own `js` and `profiles_list` descriptions, where its surface rules are (a Linux device's differ); they apply while it
  is the target. From then on `js`, `js_reset`, `end_task`,
  `secrets_list` and `profiles_list` run there; their results come back as the device produced them, tagged
  `_meta["cua/device"]`. The device's approvals reach this client as elicitations, which the plugin's hook answers as
  it does local ones (App approvals).
- `end_task` there also ends the device session, so the device's runtime is free for its other clients the moment a
  task ends; the next `js` opens a new session, and its result says the device's REPL state is new (apps and tabs are
  bound again).
- `devices_use local` (or another device) while a task is open is refused `task_open`: `end_task` first. Closing the
  session or the connection ends the device session too (`DELETE`), so this route leaves no session behind on the
  device, unlike a standalone client (Sessions, below).

A call in flight across a relay restart or a dropped connection is resumed from the device's kept events
(`Last-Event-ID`, retried from 1 s doubling to 15 s for up to 90 s); a request that failed before the device could
have received it is never sent again, so a `js` cell never runs twice. What a device tool can answer instead of a
result:

| Code | Meaning | Next |
|---|---|---|
| `task_open` | a task is open on the current target | `end_task`, then `devices_use` |
| `device_unknown` | no device of that name in `~/.config/cua/devices.json` | `cua devices list`; `devices_list` |
| `credential_missing` | the device's key is not in the secret store | `/secret <key>`, or `cua devices import` |
| `device_unauthorized` | the relay or the device refused the credential (`401`) | store the current credential; check the relay's line |
| `device_offline` | the relay reports the device offline, the relay is unreachable, or a resumed call ran out of its 90 s | on the device: `cua agent status`, `cua doctor` |
| `session_limit` | another client holds the device (one session at a time) | wait, or end the task there |
| `device_session_ended` | the device ended the session while a task was open there; its REPL state is gone | bind again; the next call opens a new session |
| `device_failed` | the device could not open a session (for example, no runtime installed there) | `cua doctor` on the device |
| `console_locked` | the device's screen is locked (passed through from the device) | unlock it and retry |

The credential is read by the server itself at each session open and probe, never by a JavaScript cell, and keys
starting `CUA_DEVICE_` (any letter case) are reserved for device credentials: `secrets_list` leaves them out and a
`{{secret:CUA_DEVICE_…}}` reference is refused `secret_reserved` with nothing typed, on this machine and on a device
running this version or later (`cua secrets list` in your terminal still shows them). On this route the credential sits only in the secret store's file (mode 0600),
not in Claude Code's configuration or the shell history; the exception is `cua devices import <file>`, which copies it from a client config and leaves that file untouched, so after `import` the config still holds the credential in plaintext: delete it unless the standalone route still uses it.

### 5. Connect a client without the plugin: register the endpoint

For an MCP client without cua (a cloud VM's Claude Code, any other host), or a device served on its own address,
register the device's endpoint under the name **`cua_repl`** (`enroll` prints the line with the URL filled in, and
`remote show` prints the relay one again):

```sh
claude mcp add --transport http cua_repl https://<relay>/d/<deviceId>/mcp --header "Authorization: Bearer <client credential>"
claude mcp add --transport http cua_repl http://<the Mac's address>:7801/mcp --header "Authorization: Bearer <client credential>"   # direct
```

To keep the credential out of shell history and the transcript, store it on the client with `/secret <clientSecretKey>`
(the key `enroll --json` names: `CUA_DEVICE_` and the device id, `-` as `_`) and register with the
`clientRegisterCommand` it printed, which reads it in place:
`--header "Authorization: Bearer $(cat ~/.config/claude-secrets/<clientSecretKey>)"` (for direct `--http`, write that
header into the second line above yourself). The shell expands it once, at registration, so after a `--rotate` store
the new value, `claude mcp remove cua_repl` in the scope it was added to (`claude mcp add` refuses a name that
exists), and register again.

The name matters: permission rules (`"mcp__cua_repl__*"` under `permissions.allow`) and the app-approval hook above
(matcher `cua_repl`) match the server name; under another name the hook does not answer, and every first use of an
app waits on a dialog that a headless `claude -p` session has nobody to answer. On a machine that has the plugin, use
4 instead: a second server whose tools differ from the plugin's only by name is easy for an agent to mix up. On a
machine that already has a local `cua_repl` registered by hand, register the remote one in another scope, or start
Claude Code with `--strict-mcp-config --mcp-config <file>` naming it. Approvals
remembered per session (`CUA_SHIM_PERSIST=session`) are asked again by each new remote session.

**Where the client credential can be seen.** In plaintext in the client's Claude Code configuration (`~/.claude.json`
for the local and user scopes; never use `--scope project`, which writes it into the repository's `.mcp.json`): the
client machine is the credential store. In the shell history of whoever ran `claude mcp add`, and in the terminal
that ran `enroll`. By the relay's operator: the relay and its TLS proxy see every MCP payload after TLS, screenshots
and the `Authorization` header included. On the network, in direct `--http` mode without a tailnet. The Mac's
`device.json` holds the secret both credentials derive from. To revoke, `cua remote enroll --rotate` (steps in 1);
there are no per-client credentials.

### Sessions: limits, and how they end

Each `initialize` opens a session, which launches one runtime on the Mac at its first `js` or `js_reset` and stops it
after `CUA_RUNTIME_IDLE_MS` without a tool call (as `cua serve` does, see Process footprint; `cua agent install`
carries the variable into the job when it is set). Two numbers bound them:

- **At most 1 session at a time** (`CUA_AGENT_MAX_SESSIONS`), because every session drives the same mouse, keyboard,
  front window and Chrome. An `initialize` at the cap first evicts the oldest Idle session: nothing in flight, and
  either no task open (its last `js` was followed by `end_task`) or no stream from its client for 60 seconds (a live
  Claude Code holds a standing stream open for its whole life, so a session without one for a minute has lost its
  client, even mid-task). Only when none is Idle is it answered `503` (`cua: session limit reached (1)`).
- **Idle close after 15 minutes** (`CUA_AGENT_IDLE_MINUTES`) without a request and with nothing in flight. A long `js`
  cell never counts as idle, nor does an approval waiting for a human while the call it blocks is in flight and the
  client is connected; an approval left pending after its call ended, or by a client that went away, does not hold the
  session.

A client of the plugin route (4) ends its device session itself, at `end_task`, at `devices_use` away and when it
closes. A standalone Claude Code client (5) never does: headless `claude -p` sends no `DELETE` when it exits, and interactive
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

`devices_list` distinguishes `timeout` / `relay_unreachable` (the relay origin is not answering, or its proxy cannot
reach the device) from a bare `offline` (the relay answered but the device has no link). When every registered device
on one relay reports the former, one guidance line points to that relay host. Check `curl https://<relay>/` and the
hosting provider (`hcloud server list`) before troubleshooting every device. `relay/README.md` documents rebuilding
on the same IP and a loopback relay over SSH as a temporary recovery.

What a standalone client (5) sees; through the plugin (4) the same conditions arrive as the codes in 4's table.

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

cua still installs its retained native engine from OpenAI's official Linux package of the same ChatGPT release, the
`chatgpt` deb for amd64 or arm64 (pins `26.928.40906-linux-x64` and `26.928.40906-linux-arm64`). The `@oai/*`
JavaScript is the macOS release's byte for byte; the platform binary cua uses is the computer-use helper `sky_linux`
(the deb's `codex` and its Chrome native host are no longer installed: #115, #79). Every Linux session runs cua's own
REPL host on Node 24 or later (Use): the vendor host is retired on Linux, `CUA_REPL_HOST=vendor` is refused
(`repl_host_refused`), and a machine with no Node 24 is refused (`repl_host_node`) until `cua install` places one. The
own host drives the pinned `sky_linux` and confines its children with cua's sandbox helper (below). The computer
surface under that sandbox is shown on an Ubuntu 24.04 arm64 GCE box with Xvfb and Openbox
(`docs/evidence/2026-10-17-own-sandbox/m3/`: gedit through `sky_linux` with the kernel confined, the #116 parity
suites). The vendor host was shown earlier on an Ubuntu 24.04 arm64 VM with Xorg and Openbox
(`docs/evidence/2026-10-06-linux-acceptance.md`), and the x64 pin and the agent as a systemd user unit, driven through
the hosted relay, in `docs/evidence/2026-10-06-linux-agent-and-x64.md`.

**A cloud VM in one step.** `deploy/cloud-vm/` turns a fresh Ubuntu 24.04 cloud VM into such a machine from user data:
the X11 desktop with autologin, deb Chrome with the extension by policy and AT-SPI on, Node 22, a checkout with the
pinned runtime installed, the host registered and a profile `me` bound, the user-namespace sysctl, and with a relay the
enrolment and the agent unit; it prints doctor's summary and the steps left to you (with a relay, the relay's table;
nobody signs in to anything). `deploy/cloud-vm/create-hetzner.sh` does it on Hetzner Cloud in about four minutes;
`deploy/cloud-vm/render.sh` prints the user data for any other provider. See `deploy/cloud-vm/README.md` and
`docs/evidence/2026-10-07-cloud-vm-provisioning.md`. Its `cua install` also places the pinned Node 24 the own host
runs on. A Node 22-only machine installed with `--no-node` has its sessions refused (`repl_host_node`) until `cua
install` runs again, Node 24 or later is installed, or its absolute path is passed as `CUA_NODE` when installing the
agent.

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

  `ar`, `tar` and `xz` unpack the deb, `xdpyinfo` and `dbus-send` are doctor's probes, and `bwrap` is what cua's
  sandbox helper runs (the system's, from a fixed `PATH`).
  `cua install` refuses with `missing_tool`, naming the package, when one is absent.
- **Google Chrome as a deb or rpm, never Flatpak or snap.** A Flatpak or snap Chrome cannot start a native host outside
  its own sandbox. Put the cua extension in each profile you want to use: loaded unpacked as on macOS, or by policy
  as the cloud template does (`ExtensionInstallForcelist` naming its id and an update URL, in one file under
  `/etc/opt/chrome/policies/managed/`: Chrome does not merge that policy across files there).

Install and register from a checkout. The default `CUA_HOME` is `${XDG_DATA_HOME:-~/.local/share}/cua`:

```sh
node bin/cua.mjs install --archive ~/mirror/chatgpt_26.928.40906_arm64.deb   # or no --archive: download the pinned deb
node bin/cua.mjs doctor
node bin/cua.mjs chrome register    # writes ~/.config/google-chrome/NativeMessagingHosts/io.github.ssfskim.cua.json
```

**Keep a copy of the deb.** The repository's signed `Packages` index lists only the newest version, and keeping old
pool files is not promised (the pinned file still downloaded on 2026-10-06). `--archive` takes the copy and checks it
against the pin as it would a download. Trust is the archive's pinned length and SHA-256, because nothing in the deb
is code-signed. Doctor's `runtime.signatures` says so. Each deb's own OpenPGP signature (`_gpgorigin`) was checked
against OpenAI's repository key when the pin was written; the pin's `notes` record the check.

**The sandbox.** cua confines both of the own host's children with its sandbox helper, `codex-linux-sandbox`: OpenAI's
open-source Linux sandbox (openai/codex `rust-v0.163.0`, Apache-2.0), unmodified, built by this repository's GitHub
Actions workflow (`.github/workflows/linux-sandbox-helper.yml`) with a build-provenance attestation and published as
the release `linux-sandbox-rust-v0.163.0`. The pin `runtime/sandbox/linux-sandbox.json` names each architecture's
asset, length and SHA-256. `cua install` fetches the one for this machine, or takes a local copy with
`--sandbox-helper <file>`, checks it against the pin and places it at `$CUA_HOME/sandbox/<tag>/codex-linux-sandbox`;
every child launch hashes it again, and a helper that is missing, not executable or not the pinned bytes is refused
(`sandbox_unavailable`), never run. A placed helper whose bytes differ is not replaced in place: remove its directory
and install again. To check the attestation yourself: `gh attestation verify <asset> --repo SSFSKIM/cua`. The helper
runs the system's `bwrap` with seccomp and fails closed on any setup error.

`CUA_SHIM_SANDBOX` defaults to `scoped` on Linux for every surface, the computer surface included (until 0.15.0 the
computer surface defaulted to `disabled`). The cells' kernel gets no socket of any kind (seccomp denies `connect` on
every family), so a cell can no longer reach the X display, the session bus or the network directly, and it is denied
the secret store, `~/.config/cua` and cua's `state/`, `remote/`, `chrome/` and `run/` but its own run directory (on
Linux the denial is per directory: `profiles.json`, `current.json`, `staging/` and `bin/` stay readable). With the
computer surface the trusted worker has the network, so `sky_linux`, its child, reaches X and the session bus; it
keeps the same filesystem limits. `launch_app` on Linux starts the application outside the sandbox: cua checks the id
against `sky_linux`'s own `list_apps`, resolves it to a desktop entry outside every sandbox write root, and runs it
with `gio launch` in the desktop session, so the application is not confined with the worker. A connection's own
`profiles_list` check runs under the connection's mode. `CUA_SHIM_SANDBOX=disabled`, set in `cua serve`'s environment,
is the operator's explicit opt-out: nothing is confined and cells reach X and the network again (doctor's `sandbox`
row says which applies).

Confined cells cannot start a child process with piped stdio (seccomp also refuses the `socketpair` it needs, `EPERM`);
use files or ignored stdio, or the computer API. Under `default` nothing is writable, so features that stage files
fail there; the kernel then works in its own directory, `$CUA_HOME/kernel/<session>`, removed with the session.

Every confined launch needs bubblewrap to create unprivileged user namespaces, and Ubuntu 23.10 and later restrict
those through AppArmor. Where they are refused, `cua serve` and the profile listing refuse a `scoped` or `default`
launch with `sandbox_unavailable`, before anything starts; doctor fails `sandbox` and `sandbox.userns`. Nothing falls
back to running unconfined (the vendor host's fail-open path, #135, is gone with it). To lift the restriction:

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

A profile on cua's helper instead does not help: cua's own check runs bubblewrap outside it, so cua still refuses.

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

- **Apps are bound by window.** Use `cua.getApp({windowId})` with an id from `listWindows()`. Approval is per app, as
  on macOS (App approvals), asked by cua's trusted wrapper: a window's app as `listWindows()` names it, `launch_app`'s
  id (so a launch and the first action on its window are two approvals), and "the whole desktop" for input that names
  no window. `DISPLAY` and `XAUTHORITY` reach the runtime; under `scoped` and `default` a model cell has no socket to
  use them with, but under `disabled` it can talk to X directly, and the trusted wrapper is then not a boundary.
- **Typing.** The helper's `typeText` and `paste` insert text through AT-SPI. In GTK3 text views (gedit, mousepad)
  they crashed the app on arm64, and on x64 failed without inserting ("editable Paste did not insert text").
  `pressKey`, one X keysym per character, types there on both. In GTK4 they inserted the text and then threw.
- **Secrets.** The same file store as on macOS (see Secrets): `secrets_list` lists `~/.config/claude-secrets` and the project's tier, and a
  `{{secret:KEY}}` reference is substituted as the whole text of `typeText` or `paste` (both arrive as `type_text
  {window, text}`). The typing caveat above applies: in a GTK3 text view the substituted `type_text` is what crashes.
- **Doctor's rows.** `display`, `accessibility.bus` and `sandbox.userns` replace the macOS helper rows, and
  `sandbox.launcher` checks the placed helper against its pin.
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
model gets each one as a line, in one of two places. The rules for every call on every surface (when to use cua,
`end_task`, one controller, observe-act-verify, batching and bounded waits, cancellation, approvals, secrets, devices)
are the host notes in the server instructions, which Claude Code caps at 2,048 characters with the runtime's own
line included; they stay under 1,000, with room to grow. A surface's own rules are in the description of the tool
they govern, which the model reads before calling it: the Chrome rules in `profiles_list`'s, the computer rules
(macOS or Linux) in `js`'s, ahead of OpenAI's text, and the device rule in `devices_use`'s. Claude Code keeps a
description's first 2,048 characters too, so cua's lines come first. OpenAI's `js` text with the browser surface
(2,847 characters with the browser alone, 2,952 with both, on the current pin) runs past that and loses its tail
either way; what cua's lines push out is its in-app, MCP Apps and named-browser options, which cua's Chrome route does
not use, and the first `js` call returns the whole API document. This section is the longer form, for whoever writes
prompts, skills or controllers around cua.

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
  sockets and DNS fail in a cell, files can be written only under the connection's run directory and `$TMPDIR` (the
  connection's own, inside it), and the secret store, `~/.config/cua` and cua's own home cannot be read. Do the work
  through the computer or browser API instead; an `EPERM` or `EACCES` there is the sandbox, not a transient fault.

Chrome (browser surface):

- **Never pick or bind a profile for the user.** Use only an instance id `profiles_list` returned, for the profile the
  user named; if selection fails, call `profiles_list` again; if the profile is not ready or which one is meant is
  unclear, ask. Binding is the user's act (`cua profiles bind`, see Profiles). The run above bound a profile itself
  by matching tab contents, which proved nothing about the profile and broke this rule. For a profile that is not
  ready, `profiles_list` returns the reason and the step to pass on to the user in its `guidance` field, in the
  structured result Claude Code shows the model as well as in the text.
- **Give a slow step its own budget.** Locator actions, waits and `playwright.evaluate` take `timeoutMs` per phase:
  3 s by default, at most 120 s, and `timeoutMs: 0` makes one attempt per phase bounded by 3 s (`pressSequentially`
  has 5 s in all; downloads and file choosers wait up to 120 s). A locator action gives finding its element up to
  `timeoutMs`, then the action and any page load it starts up to `timeoutMs` again (`src/browser-service/actions.mjs`),
  so one call can take a few times its `timeoutMs`. On a slow page, raise `timeoutMs` (for example
  `locator('#late').click({timeoutMs: 15000})`) rather than looping short waits, and give the `js` call a `timeout_ms`
  that covers the whole sequence of calls it awaits, each phase at its full budget: a cell that hits its `timeout_ms`
  resets the kernel and loses the tab handle.
- **`evaluate` acts on the page, once.** `evaluate` on a page or locator runs in the page's main world, as the page's
  own scripts do: it can change the DOM, call `fetch` with the page's cookies and navigate (there is no `require`). A
  script is sent once and never re-run: if it times out or the page navigates or loses its context meanwhile, the call
  fails saying the script may have run, and a timeout cannot roll back what it already did, so inspect the page before
  running it again (a form it may have submitted, say).
- **A failed call is a plain `Error` with the service's sentence.** Model code sees no error code: match on the
  sentence (`A <type> JavaScript dialog is active in this tab.`, `Playwright selector deadline exceeded`, `strict mode
  violation: …`, `playwright.evaluate was interrupted: …`). The first `js` call's document lists them.
- Tabs the extension creates are DOM-only, `createBrowserTab` needs a long `timeout_ms`, and a timed-out creation can
  leave a tab (Chrome, Using it).
- **Press keys on a focusable element, never a frame's body.** `press` focuses its target and insists the focus took,
  which a frame's `body` can never satisfy, so it retries until its budget runs out (3 s by default) and reports only
  `selector deadline exceeded` (spike, issue #26). Target the focusable widget (an input, or an element with `tabindex`), or click it with
  `tab.cua.click` and send keys with `tab.cua.keypress`. `press('F')` sends key `F` without Shift; use `'Shift+F'` when
  the page checks `shiftKey`. `tab.cua.type` pastes and fires no key events.
- **A menu that was open in an earlier call is not closed by cua.** The browser service keeps focus emulation on while
  the task runs, and a blur-sensitive listbox stayed open across idle gaps of up to two minutes (issue #26). A
  `no_matches` on it means the site closed it (a timer, hover-out, a re-render): open and select in the same call.

Beyond these rules, the report's other lessons for task design: prefer focused reads (one tab, one element) over
whole inventories and full snapshots, which cost time and expose unrelated content; hand timed tasks whose subject is
the user's own response to the user rather than simulate them; and before a consequential, irreversible click,
confirm with the user and do not retry it blindly after a timeout.

## Verify and acceptance

```sh
npm test                  # Node only; no runtime, GUI or network
node verify.mjs           # the installed runtime in $CUA_HOME, through `cua serve`
CUA_SHIM_SURFACES=computer,browser node verify.mjs   # the same with the browser surface (five tools)
```

`verify.mjs` completes the MCP handshake, checks the tool surface for the configured surfaces, and runs trivial cells
that bind no app (the first loads the `cua` API document) to check task identity and `end_task`. It reports which
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
node scripts/accept-native.mjs --live-secrets --report "$CUA_HOME/acceptance-secrets.json"
node scripts/accept-native.mjs --live-textedit --report "$CUA_HOME/acceptance-live.json"
node scripts/accept-native.mjs --live-secrets --live-textedit --report "$CUA_HOME/acceptance-secrets-ui.json"
# with a key you stored yourself in a scratch store home (never your own ~/.config/claude-secrets):
HOME="$STORE_HOME" node bin/cua.mjs secrets set CUA_TEST_SECRET
node scripts/accept-native.mjs --live-secrets --live-textedit --secret-key CUA_TEST_SECRET --secret-home "$STORE_HOME" --report …
```

Without a flag it runs the suites, install/reinstall, doctor, `verify.mjs`, the read-only lifecycle probe
(`scripts/probe-lifecycle.mjs`), the secrets CLI against a temporary store home, packaging checks and a clean clone of
`HEAD` that runs `npm test` (deleted afterwards). Every secret these runs store lives in a temporary `$HOME` store that
is removed afterwards; the server they start resolves its store from that home and runs the runtime with your real
home (`scripts/accept/serve-with-store.mjs`), because the vendor finds the computer-use helper's socket under `$HOME`.
The opt-in flags add live scenarios:

- `--live-secrets` runs `scripts/probe-secrets.mjs`: one generated key in a temporary store holding generated values,
  created and replaced by typing into the production `cua secrets set` at a pseudo-terminal, read by the trusted
  service and delivered to a controlled fake input target. It checks every input method, the failures, failing closed
  with secrets off or an unreadable store, and that neither value
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
  anything else; that answer lives in the test harness, not in `cua serve`. With both flags it also types
  `{{secret:KEY}}` into that document (a generated key, or `--secret-key`) and checks that the document holds exactly
  the stored value by comparing SHA-256 digests inside the cell, so the value never crosses the MCP stream; the
  transcript and stderr are scanned for it before and after.

On Linux, `scripts/accept/linux-secret.mjs --key KEY [--app zenity|gedit]` is the same check against a key in your
store: it types `{{secret:KEY}}` into a zenity entry dialog (whose printed answer is compared outside the MCP stream)
or a gedit window (whose GTK3 text view the helper's text input crashes on arm64; the fixture records it).

A macOS permission prompt is never answered by these scripts: unattended runs report BLOCKED with the owner action
needed. Item 9 retains the clean-Mac and vendor cold-start release gates. Cua's fresh onboarding is item 14,
`--items 14 --engine cua --fresh-onboarding`, in an interactive terminal with the owner at the console. The owner
removes only cua Engine's three permission entries, then re-adds Accessibility, Screen Recording (Later, so the service
proves its relaunch), and Input Monitoring as prompted. The runner observes the permission errors, PID change and
intervention status, then approves the build; it never edits TCC. An item selection missing its suite dependencies is
refused rather than reporting checks against a suite that never ran.

The Chrome acceptance has its own runner, `scripts/accept-chrome.mjs`, against `$CUA_HOME` on cua's extension route,
the only one (spec `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, H3b). It refuses a home not
registered with `cua chrome register`, and one holding a Codex credential file (the no-login control), so it runs in a
scratch home (`CUA_HOME=$(mktemp -d …)`, `cua install`, `cua chrome register`, the profile added and bound), as
acceptance 1 of the spec does.

```sh
node scripts/accept-chrome.mjs --live --profile personal --report /tmp/cua-accept-chrome.json
node scripts/accept-chrome.mjs --live --only c2,turn-end --profile personal --report /tmp/cua-accept-chrome-c2.json
node scripts/accept-chrome.mjs --live --chrome-restart --profile personal --report /tmp/cua-accept-chrome-restart.json
```

`--live` is the browser secret round trip: through `cua serve` it selects the registered profile by its instance id,
creates one tab, opens the runner's own loopback page, fills its password field with `{{secret:<KEY>}}` for a
generated key in a temporary store home (removed at the end), and compares the page's own digest of what it received
with the generated value's. Around it run the spec's cells: cua's hosts alone in the browser listing, the host's own
`getInfo`, a cross-site frame, a viewport change, the user-tab claim, turn end and handoff, and two `cua serve` clients
(`--only c2,user-tab,turn-end,two-clients` narrows them). `--chrome-restart` runs only the Chrome restart under a
running server, for which you quit and reopen Chrome while the runner waits (it prints an `OWNER STEP:` line). The
runner accepts only an access request for one of its own pages' origins, for the session, and declines anything else,
which stops further input; it closes the tabs it created and reports any it could not close, and it scans the MCP
traffic, stderr, the screenshot and the files under `$CUA_HOME/state` and `run` for the value.

The ChatGPT extension route's whole-phase runner (`--all`: C1–C7 with the host-placement gates) went with that route
(#79); what it showed is recorded in `docs/evidence/clean-machine-acceptance.md` and
`docs/evidence/m12-host-placement.md`.

## Configuration (environment of the server)

| variable | default | meaning |
|---|---|---|
| `CUA_HOME` | `~/Library/Application Support/cua`; on Linux `${XDG_DATA_HOME:-~/.local/share}/cua` | the installed runtime (`runtimes/`), the Node `cua install` places for cua's own host (`node/`), on Linux cua's sandbox helper (`sandbox/<tag>/`), on macOS the vendor host's config and approvals (`state/codex`, its `CODEX_HOME`) and its per-session compat settings (`state/compat`), the runtime's recorded handshake answers (`state/handshake`), and per-connection directories (`run/`: each connection's working directory, with its session temp `run/<session>/tmp`, which is the connection's `TMPDIR`, and a record of the process that owns it; on Linux under `default` also `kernel/<session>`; a process killed before it could remove them is found dead by the next `cua serve` or `cua doctor`, which removes its entries and says so, `doctor` in its `run.stale` row). JavaScript cells cannot read it under `scoped` or `default` but the runtime, the Node and their own run directory (see below) |
| `CUA_SHIM_SURFACES` | `computer` | `computer`, `browser` or `computer,browser`: with `browser` the agent also gets the browser API for your existing Chrome profiles (through cua's own extension and host and cua's own browser service, no login needed), the `profiles_list` tool and `{{secret:…}}` in Chrome fills; registered with `cua profiles add`/`bind` |
| `CUA_BROWSER_BACKENDS` | unset | with the browser surface: MAWS's in-app browser sockets, absolute paths separated by `:` (MAWS sets it for its sessions' engines; see For MAWS) |
| `CUA_REPL_HOST` | per session, engine and Node availability (Use) | `cua` or `vendor`: selects the JavaScript host and facade, not the browser service. macOS computer sessions default to vendor with the vendor engine, cua with the cua engine; explicit own-host + vendor-engine is refused. Linux uses cua only. An explicit cua host needs Node 24+ and never silently downgrades. With no explicit host, eligible macOS sessions may use the vendor host when Node 24 is unavailable (`own_host_node_unavailable`); Linux refuses. Doctor reports the selection in `repl.host` |
| `CUA_NATIVE_ENGINE` | `vendor` on macOS | `vendor` or `cua`; takes precedence over `~/.config/cua/engine.json`'s `engine`. Explicit/settings-selected cua requires the approved engine; no vendor fallback for an absent or pending bundle. `install --engine` builds but does not change this selection |
| `CUA_SIGNING_IDENTITY` | `engine.json`'s `signingIdentity` | Apple Development identity's common name or SHA-1; used only to build/sign cua's engine, never printed in reports. No identity means a build refusal, not ad-hoc fallback |
| `CUA_SIGN_WAIT_MS` | `45000` | signing wait in milliseconds, overridden by `--sign-wait`, at most `1800000`; use `600000` for the owner-attended first sign |
| `CUA_NODE` | unset | absolute path to a Node executable to try first for cua's own host (24+), before the Node `cua install` placed under `$CUA_HOME/node`, the node running cua and the first `node` on `PATH`. A missing, unreadable or older candidate falls through to the next; a relative path refuses (`invalid_setting` at start). Never selects the vendor's pinned Node. `cua agent install` stores an explicit nonempty path as given, validated as absolute but not resolved or probed; unset or empty is omitted, so each later connection resolves afresh |
| `CUA_SHIM_PERSIST` | `session` | `session` or `none`: whether an accepted approval is remembered for the connection (App approvals); `always` is refused (`invalid_setting` at start), its sentence naming the plugin's `Elicitation` hook (`hooks/cua-approve.sh`) |
| `CUA_SHIM_HOST_NOTES` | built in | replacement host notes; `none` disables them (the separate feedback opt-in below still applies) |
| `CUA_FEEDBACK_DIR` | unset | opt-in directory for agent-written cua_repl feedback: problems, friction, overall experience and feature requests; one Markdown file per task, problems first, before the final reply. Set it in the client's server environment (for example `~/cua-feedback`); the path is JSON-quoted as data, preserving spaces and `~`, and remains on the client when `devices_use` selects a remote device. Adds one host-note line, including alongside replaced/disabled built-in notes; unset, empty, or a value containing an ASCII control character (U+0000–U+001F or U+007F) adds nothing. This is an instruction to the agent, not an automatic file writer |
| `CUA_SHIM_MODEL` | the client's name from `initialize` | model label sent in the runtime's turn metadata |
| `CUA_SHIM_SECRETS` | `on` | `off` hands the runtime no secret store; `secrets_list` then reports secrets as disabled and a `{{secret:…}}` reference fails with `secrets_disabled` |
| `CUA_RUNTIME_IDLE_MS` | `900000` (15 minutes) | how long a launched runtime may go without a `js`, `js_reset`, `end_task` or `profiles_list` live check before it is stopped (the next `js` or `js_reset` launches a fresh one, its REPL state gone; see Process footprint); `0` keeps it for the connection's life; maximum `2147483647` (about 24.8 days) |
| `CUA_SHIM_SANDBOX` | `scoped` | the sandbox either host applies to its JavaScript children (cua's own, below): `scoped` lets them write only the connection's run directory and its session temp (`$TMPDIR`), with no network for cells; `default` denies every write; under both, cells cannot read the secret store, `~/.config/cua` or cua's home. `disabled` turns the sandbox off. Set it in `cua serve`'s environment; no client can change it per call. Also read by `cua profiles list` and `bind` and reported by `cua doctor` |

cua sends the selected host a sandbox state, in the field Codex uses for it (`_meta["codex/sandbox-state-meta"]`), on
every call it makes, including the bounded launch behind `cua profiles list`/`bind` and `profiles_list`. Any sandbox
state a client puts in its own `_meta` is replaced by cua's.

**cua's sandbox** (#115; `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`). Both hosts confine both of their
JavaScript children, the kernel that runs the model's cells and the trusted worker that runs cua's trusted services,
with cua's own launcher; no Codex CLI is installed or launched. On macOS that is `/usr/bin/sandbox-exec` with a
seatbelt profile cua renders itself (`src/sandbox/seatbelt.mjs`, a port of OpenAI's open-source Codex profile
generation at `rust-v0.159.2`, Apache-2.0, byte for byte equal to the original's output but for the deviations its
header names). The own host runs it directly, so the kernel is a plain `node` process under the supervisor; the
vendor host reaches it through cua's compat executable, `bin/cua-codex-compat`, named to node_repl as `CODEX_CLI_PATH`.
On Linux it is the pinned helper (see Linux). `cua doctor`'s `sandbox.launcher` row checks the launcher is in place.

The two children get different profiles. Both read everywhere else and write only where the mode allows. The kernel
is also denied the secret store and its project tiers (by real path, a symlinked tier's target too), `~/.config/cua`
and cua's own home, except the runtime, the Node and the connection's own run directory and session temp, so it
cannot read other sessions, the device enrolment under `remote/`, Chrome's registration or cua's state. On macOS the
denial covers the whole home and grants only the bare metadata of the home and its `run/` directory, which path
resolution needs; on Linux it covers `state/`, `remote/`, `chrome/` and `run/`. The worker keeps reading the store,
so `{{secret:KEY}}` still works. A cell cannot reach a denied file through a hard link or a clone made in its
writable roots either: neither works under the sandbox. Cells have no network on either platform; on Linux with the
computer surface the worker has it (see Linux).

With the `scoped` default, JavaScript cells and trusted services can write only to the connection's own run directory
(`$CUA_HOME/run/<session>`, removed when the connection closes) and its session temp inside it, which is their
`$TMPDIR`: never the `$TMPDIR` cua was started with, which on macOS every session of the account shares. Outside those
writes are denied, including to the installed vendor modules and cua's trusted code: the sandbox and its compat
executable (`src/sandbox`, `bin`), the enabled services and secret wrappers (`src/services`, `src/secrets`,
`src/browser-service`) and, on the own host, the host, facade and documents (`src/repl-host`, `src/cua-api`,
`docs/cua-api`). Model cells cannot plant code in a trusted root. The native helper and Chrome extension are reached
through the host's trusted pipes.

`scoped` places requirements on where things live. Nothing of cua's may sit under `$CUA_HOME/run`: a checkout there
would make cua's trusted code writable, and a write root over the runtime's configuration and approvals, the Node
`cua install` placed under `$CUA_HOME/node`, its sandbox helper or what it verifies in `$CUA_HOME/staging` would let
cells choose what later runs outside the sandbox. On macOS, under `scoped` and `default` alike, `CUA_HOME`, the secret
store and `~/.config/cua` must not lie inside one another (a custom `CUA_HOME` under `~/.config`, say): the kernel's
denial of one would cut through the other. `cua serve` and the profile listing refuse such a layout with
`sandbox_conflict`, naming each directory involved, and `cua doctor`'s `sandbox` check fails with the same explanation;
move them apart, or run the connection `disabled`. A layout like that worked before 0.15.0. A secret store whose
tiers cannot be listed (a directory with broken permissions) refuses confined launches too (`sandbox_state_invalid`),
since its tiers could not be denied.

`CUA_SHIM_SANDBOX=disabled` is the way to give cells the network and writes everywhere else: cua sends the
`disabled` permission profile, so cells and trusted services can read and write wherever your account can, the secret
store included, and the sandbox no longer refuses their network connections. This fits the trust model (the agent is
trusted, and cua adds no policy against exfiltration), but it also lets a cell write cua's trusted code roots, the
runtime's configuration and approvals in `state/codex` and the vendor's modules in the installed release; you accept
that cua no longer protects the integrity of that code from the agent. With `default`, cua sends no sandbox state;
either host then allows reads but the denied ones and denies all writes, including to `$TMPDIR` and `/tmp`, as well as
network connections, and the features that need scratch space fail.

On macOS the kernel's profile also denies the unified log (`logd` and `diagnosticd`), as the original's does for such a
profile, so `os_log` output from a kernel cell goes nowhere. #138's time-zone hang is not reproduced and stays open:
the one grant that would address it (`com.apple.system.notification_center`) is ready behind a switch in
`src/sandbox/seatbelt.mjs` and ships off.

The remote agent's own variables (`CUA_AGENT_MAX_SESSIONS`, `CUA_AGENT_IDLE_MINUTES`, `CUA_AGENT_ALLOWED_ORIGINS`,
`CUA_AGENT_CONSOLE_CHECK`) are described under Remote control.

Removed with the standalone runtime: `CUA_SHIM_PLUGIN_MCP` (the desktop launch recipe), `CUA_SHIM_CODEX_HOME` (the
runtime's home is always under `CUA_HOME`), `CUA_SHIM_SESSION_ID` (each connection has its own random session) and
`CUA_SHIM_LOG` (it recorded whole transcripts). Removed with the ChatGPT extension route (#79):
`CUA_BROWSER_SERVICE` (cua's own browser service is the only one; a value set is ignored). Apart from basic OS
variables (`HOME`, `USER`, `TMPDIR`, locale), nothing else in the server's environment reaches the runtime.

## Licences and sources

- **The installed runtime** is OpenAI's: `cua install` downloads the pinned ChatGPT archive from its official URL (or
  takes your copy) and places it under `CUA_HOME` unmodified; this repository does not contain or redistribute it.
  The native engine and the vendor host still use that tree; `cua install` removes only the unused Codex CLI from it
  (see Install).
- **cua's sandbox** is ported from, or built unmodified from, OpenAI's open-source Codex (`openai/codex`,
  **Apache-2.0**, with its NOTICE): `src/sandbox/seatbelt.mjs` and its `.sbpl` files (byte copies) from `rust-v0.159.2`,
  with `src/sandbox/LICENSE` and `NOTICE` beside them and a provenance header naming every source range; the Linux
  helper `codex-linux-sandbox`, built from `rust-v0.163.0` by `.github/workflows/linux-sandbox-helper.yml` and released
  with upstream's LICENSE and NOTICE and a statement of the build's changes (path remapping and stripping only).
- **Vendored open-source code**, each with its version in a `VERSION` file, its licence text and an exact-pin
  extractor that refuses a mismatch:
  - Under `src/browser-service/vendor/`: Playwright's injected script from `playwright-core` 1.59.1
    (`injected-script.js`, Apache-2.0, Copyright Microsoft Corporation, with the package's NOTICE), which cua's browser
    service installs in each frame to resolve locators; and markdown-it 14.1.1 (`markdown-it/markdown-it.mjs`, MIT),
    which renders `tab.cua.type`'s rich text, with the libraries its bundle includes (entities, BSD-2-Clause;
    linkify-it, mdurl, punycode.js and uc.micro, MIT). Their licence texts are in the asset headers.
  - Under `src/repl-host/vendor/meriyah/`: Meriyah 7.0.0, the own kernel's parser, **ISC**, with its licence in
    `meriyah.mjs`'s header (`scripts/extract-meriyah.mjs`). This is the same parser bundle the vendor embeds, not a
    licence for the proprietary host port.
  - Under `src/cua-api/vendor/zod/`: Zod 3.25.76's v3 validator, **MIT**, with its licence in the sibling `LICENSE`
    (`scripts/extract-zod.mjs`). These assets are committed; neither parser nor validator adds a runtime npm
    dependency.
- **Ported code.** cua's browser service (`src/browser-service/`), REPL host (`src/repl-host/`) and JS facade/browser
  client (`src/cua-api/`) are ports from readable chatgpt-26.928.40906; each ported source file opens with a provenance
  header naming the build and source line range. The first-call documents (`docs/cua-api/`) carry their provenance
  separately in `docs/cua-api/PROVENANCE.md` so their emitted bytes stay unchanged. These ports derive from OpenAI's
  proprietary distribution: copying is permitted by the owner for this internal research preview, this repository
  claims no right to distribute them, and #120's clean-room rewrite covers the host, facade, browser service and
  copied documents before any distribution. The open-source licences above do not grant rights to these ports.

**Research note.** The readable source tree of the pinned build, `~/codex-app-src/readable/chatgpt-26.928.40906/`
(regenerated per build by the owner's `app-source-tools`; MAWS's `research/SOURCES.md` says where each tree lives and
how to cite it), is the primary reference for cua's work: read it before designing against the runtime, and cite it
as `BS:<line>` (the browser service, `cua_node/@oai/browser-desktop/scripts/browser-service.mjs` there) or by path,
naming the build.

## Privacy

The cua Chrome extension collects no data. It passes tab content and DevTools Protocol messages only to the cua
program on the user's own computer (the native host that `cua chrome register` installs), which the user installs
and controls; nothing is sent to the developer or to third parties. The extension has no analytics, no remote code
and no sign-in. In tabs an agent session owns it injects one script, which blanks iframes that other extensions
insert (Chrome refuses debugger access to a tab containing another extension's frame) and routes `window.open`
pop-ups into the agent's tab group; the script reads no page content, sends nothing anywhere, and is removed when
the agent's task ends. Tabs an agent is not using are never touched. While an agent is driving a tab, the extension
tells the local cua program which downloads Chrome starts and finishes (id, URL, file path), which is how an agent's
wait for a download learns where the file landed; downloads made while no agent is driving a tab are not reported.

## For MAWS

MAWS (the owner's Electron workstation for Claude Code sessions) runs its sessions' engine with the user's settings, so
the agent there gets cua from the plugin installed in `~/.claude` like any other session; MAWS bundles nothing of cua.
What MAWS adds is its in-app browser: the same browser API that drives a Chrome profile drives the tabs of the
session's Browser panel (spec `docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md`).

The contract is one environment variable. MAWS serves the cua extension's primitives (the extension protocol, version 1,
plus `profileName` in its hello and `cursor.move`) on one Unix socket per app session, in a 0700 directory under its
user data, and passes that socket's path to the session's engine as `CUA_BROWSER_BACKENDS`; the engine, its subagents
and the `cua serve` they start inherit it. Who may use the session's browser is that path plus two peer checks (spec
`docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md`): MAWS accepts a connection only from a process that
runs as its user and descends from the session's engine, and cua's own host for it (below) only from a descendant of the
cua process that opened it. `CUA_BROWSER_BACKENDS` lists absolute socket paths separated by `:` (a relative one fails
`cua serve` with `invalid_setting`); it is read with the browser surface only, by `cua serve` and by `cua profiles list`.

For each configured socket, the process connects and runs cua's ordinary host over that connection, in the process
itself (client mode): the host listens at `$CUA_HOME/chrome/m/<name>-<pid>.sock` while connected, and its status file
(`chrome/b`) and log (`chrome/logs`) take the same name. Each process runs its own host, so a relaunched `cua serve`, a
fork subagent's own server and `cua profiles list` work side by side on one MAWS session, and one exiting leaves the
others' alone; nothing lists `chrome/m`, so a process only ever sees the hosts it opened and one MAWS session's tabs
never reach another session. `cua serve` connects at once, and its runtime launch, at the first call that needs it,
waits up to 5 s for each backend's hello first; a
refused or lost connection (MAWS quitting while the engine lives, MAWS relaunched) is retried every 5 s, and the host's
path is listed to the selected runtime from the start, so a backend that comes back is found again without restarting anything.

The host's socket is cua's half of the check. The kernel names the connecting process (the committed peer identity addon
in `native/peer-auth/`, three system calls, Apple silicon macOS only; `native/peer-auth/README.md` says how to rebuild
it), and the host accepts it only if it runs as the same user and descends from the process that opened the socket: the
browser service in the trusted worker that `cua serve` launched, or `cua profiles list`'s own listing. Anything
else (a Terminal `nc -U`, another application, another session's process) is closed before a byte of it is read, with
one line `relay <name>: refused peer pid <pid> (<reason>)` in the host's log. The status file says `peerCheck: "on"`
(`"off"` for the Chrome route's host, which checks no peer). If the addon cannot load, the host fails closed: it refuses
every client (`module_unavailable`), its status says `"unavailable"`, `profiles_list` reads `maws_unreachable` and
`cua doctor`'s `maws.hosts` row is blocked and says why. What the check does not stop: a process that is itself in the
tree (the model's commands run under the engine), code a same-user process gets the engine to start by editing Claude
Code's settings or plugins, and a same-user `kill -USR1` that opens Node's inspector in a stock Node process of the tree.
cua's own processes ignore that signal (the plugin starts the server with `--disable-sigusr1`, and the runtime's anchor
is started with it); the vendor runtime's Node processes, which cua runs unmodified, do not: its launcher opens an
inspector on 127.0.0.1:9229 (under the default scoped sandbox the kernel's and the trusted worker's cannot listen).

What the agent sees: `profiles_list` lists `maws` first (`maws-2`, … for further sockets), ready with its
`extensionInstanceId` (`maws:<app session>`) while connected and checking its peers, else `maws_unreachable`; its
description says that `cua.getBrowser()` with no id is the in-app browser and that a Chrome profile is used only when
the user names one. cua's trusted browser wrapper enforces that default: a selection that names no browser
(`cua.getBrowser()`, `cua.getBrowser({url})`) is resolved when it is made to the first configured backend's instance,
else the first listed MAWS backend (a `cua serve` that started while MAWS was down picks MAWS up once it returns), so
while MAWS is away it fails with the vendor's own "Browser is not available" instead of landing in a Chrome profile;
`cua.getBrowser({extensionInstanceId})` with a Chrome profile's id still drives that profile. MAWS's tabs show the
agent's cursor (`moveMouse` reaches MAWS as `cursor.move`) and a page's `window.open` arrives as a tab the agent already
owns (`tabs.adopted`). `cua doctor` lists the connected MAWS hosts in its `maws.hosts` row, each with its peer check.

The person can take a MAWS tab over by touching it: from their input until 3 s after their last one, MAWS refuses the
agent's actions on that tab (clicks, typing, scripts) and lets reads through. A locator action retries a refused step
until its budget runs out: with the default 3 s the agent sees `Playwright selector deadline exceeded` rather than
MAWS's "A person is using this tab; wait and retry", and waiting a few seconds and retrying is the answer to both; with
a raised `timeoutMs` (`click({timeoutMs: 15000})`) the action goes through once the person lets go
(`docs/evidence/2026-10-13-own-browser-service-parity/m4/`).

To try a cua checkout inside MAWS without replacing the installed plugin, point MAWS's Settings › Engine binary at a
wrapper that runs `claude --plugin-dir <checkout> "$@"`: a `--plugin-dir` copy overrides the installed plugin of the
same name for that process only, and the plugin cache is untouched.

Checks, from a terminal, against a running MAWS session (or, for everything but the page steps, the fake peer
`node test/helpers/fake-maws-peer.mjs --listen <socket>`):

```sh
CUA_BROWSER_BACKENDS=<socket> node bin/cua.mjs profiles list          # maws  ready  —  extension instance maws:<id>
CUA_BROWSER_BACKENDS=<socket> node scripts/accept/maws-features.mjs --report /tmp/maws-features.json [--other <socket of a second session>]
CUA_HOME=<scratch home with the runtime> node scripts/accept/maws-selection.mjs   # the default selection, with fake peers only
```
