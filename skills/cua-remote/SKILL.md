---
name: cua-remote
description: Use when you need to drive, or set up for driving, another computer's GUI or browser through cua — onboarding a Mac or Linux machine as a remote cua device (run on that machine), or connecting this Claude Code to an enrolled device through its relay (run on the client). Not for this machine's own GUI, which the plugin's local cua_repl server already serves.
---

# cua-remote

A **device** is a computer cua drives for a client elsewhere. The device runs `cua agent` in its GUI login session and
dials a relay; the client reaches it at `https://<relay>/d/<deviceId>/mcp`, an MCP server it registers as `cua_repl`.
The reference is the cua README ("Remote control", "Linux") and `relay/README.md`; this is the order of operations.
Work out first which side you are on: Part A runs on the device, Part B on the client.

**The client credential is the one secret here.** Whatever a tool prints enters the transcript, so never print it:
keep `enroll`'s JSON in a 0600 file, read the other fields with `jq`, and let the owner carry the credential to the
client's `/secret` field themselves.

## Part A: onboard a device (on the device)

1. **cua from a checkout.** Use an existing checkout if `cua` (or `node <checkout>/bin/cua.mjs`) runs; otherwise
   `git clone https://github.com/SSFSKIM/cua` at a stable path, then `npm ci` there (the relay leg needs its `ws`) and
   optionally `npm link`. Not the plugin's cache copy: the agent job runs the checkout it was installed from, and the
   cache is replaced on every plugin update. Node 22 or newer.
2. **The runtime.** `cua install`, then `cua doctor`. On Linux first meet the README's Linux requirements (an X11
   session, the apt packages; keep a copy of the deb for `--archive`). This gives the GUI surface. For the browser
   surface too, follow the README's Chrome section on the device before enrolling: the OpenAI extension installed in
   the Chrome profile to drive, `cua chrome register`, `cua login` (needs the owner at the screen once), then
   `cua profiles add <key>` and `cua profiles bind <key>`; `cua doctor` must show `codex.login`, `chrome.*` and the
   profile ready. A client cannot do any of this remotely.
3. **Enrol.** The relay must already exist: the project's hosted one, or `relay/deploy/create-server.sh`
   (`relay/README.md`, Hosting) when there is none. Then run `cua remote show --json`. If it succeeds, the device already has an identity: it gives the same
   fields as below without the credential, which was shown only once, to whoever enrolled it. `enroll --relay <url>`
   there only moves the device to another relay (no credential); `--rotate` mints a new one, so use it only when nobody
   holds the old one, and say what it breaks: every client registration and the relay's line for this device. Only
   when `show` answers `remote_not_enrolled`, enrol (noclobber, so an earlier run's file is never overwritten):
   ```sh
   (umask 077; set -C; cua remote enroll --relay wss://<relay>/ws --json > ~/cua-enroll.json)
   jq -r '.deviceId, .relayEndpoint, .clientSecretKey, .clientRegisterCommand, .devicesEntry' ~/cua-enroll.json
   ```
4. **The relay's table.** Give `devicesEntry` (hashes only, safe to show) to whoever operates the relay. On the
   project's hosted relay, `relay/deploy/update.sh --devices <file>` **replaces the whole table**: fetch the current
   one (`relay/README.md`, Hosting), merge this device's line in (replacing one with the same device id), send that.
5. **The agent.** `cua agent install`: a launchd job in the GUI session on macOS, a systemd user unit on Linux (there,
   `sudo loginctl enable-linger "$USER"` once so it runs from boot, and `--display`/`--xauthority` when the installing
   shell has no X session). Run it again after node moves (a Homebrew or nvm upgrade).
6. **Check.** `cua doctor --json`: the four `agent.*` rows (`installed`, `running`, `enrolled`, `console`) must pass.
   On macOS the first drive asks for Accessibility and Screen Recording at the screen, so someone must be there once.
7. **Hand off.** Give the client side `clientRegisterCommand` and `clientSecretKey` (neither is secret), and tell the
   owner the credential is in `~/cua-enroll.json` (`jq -r .clientCredential` in their own terminal). Once the client
   has stored it, delete the file.

The device must stay **unlocked and awake while it is driven**: a locked Mac answers `console_locked`, and a sleeping
one drops off the relay. Whether to leave a machine unlocked and unattended is the owner's call; name it, do not
decide it.

## Part B: connect to a device (on the client)

1. **The credential, stored by the owner.** Ask the owner to type `/secret <clientSecretKey>` (the cua plugin's
   command; it needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`) and paste the credential into the field it opens. You
   cannot do this for them, and you never read the file: the shell form inside the command below is the only use.
   Without the command, the owner writes `~/.config/claude-secrets/<KEY>` (mode 600) from their own terminal.
   If the key is absent but the owner keeps a ready-made client config (an `*.mcp.json` with `mcpServers.cua_repl`
   inside, such as `~/.config/cua-relay/<device>.mcp.json`), register from that and skip the `/secret` step:
   `claude mcp add-json cua_repl -s user "$(jq -c .mcpServers.cua_repl <file>)"`.
2. **Register** under the name `cua_repl`, with the command `enroll` printed (`cua remote show --json` on the device
   prints it again):
   ```sh
   claude mcp add --transport http cua_repl https://<relay>/d/<deviceId>/mcp \
     --header "Authorization: Bearer $(cat ~/.config/claude-secrets/<clientSecretKey>)"
   ```
   (`clientSecretKey` is `CUA_DEVICE_` and the device id with `-` as `_`, since a key allows only letters, digits and `_`.)
   The name is what permission rules (`mcp__cua_repl__*`) and the plugin's approval hook (README, "App approvals")
   match; under another name every first use of an app or site waits on a dialog. Check `claude mcp list` first:
   one `cua_repl` per scope, so remove a stale one or use the other of `--scope local|user`. Never `--scope project`:
   the shell expands the credential at registration, and that scope writes it into the repository's `.mcp.json`.
3. **Reconnect.** A running session does not pick up a server added under it: reconnect through `/mcp`, or start a
   new session.
4. **Drive.** The device's tools are `mcp__cua_repl__*`; `mcp__plugin_cua_cua_repl__*`, where present, drive this
   machine's own screen, so do not mix them up. Use the tools as the server's instructions say; they arrive on
   connect and teach the API, the approvals and `end_task`.

| The client sees | Meaning | Next |
|---|---|---|
| `console_locked` | the device's screen is locked, or another session is on its console | ask the owner to unlock it, then retry |
| `503 device offline` | the device is asleep, offline, or its agent stopped | on the device: `cua agent status`, `cua doctor` |
| `401` | wrong credential, or the relay's table lacks the device's line | check the stored key and the relay's table (Part A, 4) |
| `503 session limit reached` | another client holds the device (one session at a time) | wait a minute, or end the other task |

After a `--rotate` on the device, store the new credential under the same key, `claude mcp remove cua_repl` (same
scope; `add` refuses an existing name), and register again: the old value was expanded into the registration, not
read at each connection.
