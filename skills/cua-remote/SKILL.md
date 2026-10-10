---
name: cua-remote
description: Use when you need to drive, or set up for driving, another computer's GUI or browser through cua — onboarding a Mac or Linux machine as a remote cua device (run on that machine), or connecting this Claude Code to an enrolled device through its relay (run on the client: cua devices, then devices_list and devices_use). Not for this machine's own GUI, which the plugin's local cua_repl server already serves.
---

# cua-remote

A **device** is a computer cua drives for a client elsewhere. The device runs `cua agent` in its GUI login session and
dials a relay, which serves it at `https://<relay>/d/<deviceId>/mcp`. A client with the cua plugin adds the device once
(`cua devices`) and its own `cua_repl` server switches to it with `devices_use`; a client without the plugin registers
that endpoint as an MCP server named `cua_repl`. The reference is the cua README ("Remote control", "Linux") and
`relay/README.md`; this is the order of operations. Work out first which side you are on: Part A runs on the device,
Part B on the client.

**The client credential is the one secret here.** Whatever a tool prints enters the transcript, so never print it:
keep `enroll`'s JSON in a 0600 file, read the other fields with `jq`, and let the owner carry the credential to the
client's `/secret` field themselves.

## Part A: onboard a device (on the device)

1. **cua from a checkout.** Use an existing checkout if `cua` (or `node <checkout>/bin/cua.mjs`) runs; otherwise
   `git clone https://github.com/SSFSKIM/cua` at a stable path, then `npm ci` there (the relay leg needs its `ws`) and
   optionally `npm link`. Not the plugin's cache copy: the agent job runs the checkout it was installed from, and the
   cache is replaced on every plugin update. Node 22.14+ or 23.7+: cua starts the runtime's anchor with
   `--disable-sigusr1`.
2. **The runtime.** `cua install`, then `cua doctor`. On Linux first meet the README's Linux requirements (an X11
   session, the apt packages; keep a copy of the deb for `--archive`). This gives the GUI surface. For the browser
   surface too, follow the README's Chrome section on the device before enrolling: the cua extension in the Chrome
   profile to drive (from the Chrome Web Store, or loaded unpacked from the checkout's `extension/`, which needs the
   owner at the screen once; a VM from `deploy/cloud-vm/` has it by policy), `cua chrome register`, then
   `cua profiles add <key>` and `cua profiles bind <key>`; `cua doctor` must show the `chrome.*` rows passing and the
   profile ready (`codex.login` reads `skip`: no login is needed). A client cannot do any of this remotely.
3. **Enrol.** The relay must already exist: the project's hosted one, or `relay/deploy/create-server.sh`
   (`relay/README.md`, Hosting) when there is none. Then run `cua remote show --json`. If it succeeds, the device already has an identity: it gives the same
   fields as below without the credential, which was shown only once, to whoever enrolled it. `enroll --relay <url>`
   there only moves the device to another relay (no credential); `--rotate` mints a new one, so use it only when nobody
   holds the old one, and say what it breaks: every client's stored credential and the relay's line for this device.
   Only when `show` answers `remote_not_enrolled`, enrol (noclobber, so an earlier run's file is never overwritten):
   ```sh
   (umask 077; set -C; cua remote enroll --relay wss://<relay>/ws --json > ~/cua-enroll.json)
   jq -r '.deviceId, .relayEndpoint, .clientSecretKey, .devicesAddCommand, .clientRegisterCommand, .devicesEntry' ~/cua-enroll.json
   ```
4. **The relay's table.** Give `devicesEntry` (hashes only, safe to show) to whoever operates the relay. On the
   project's hosted relay, `relay/deploy/update.sh --devices <file>` **replaces the whole table**: fetch the current
   one (`relay/README.md`, Hosting), merge this device's line in (replacing one with the same device id), send that.
5. **The agent.** `cua agent install`: a launchd job in the GUI session on macOS, a systemd user unit on Linux (there,
   `sudo loginctl enable-linger "$USER"` once so it runs from boot, and `--display`/`--xauthority` when the installing
   shell has no X session). Run it again after node moves (a Homebrew or nvm upgrade).
6. **Check.** `cua doctor --json`: the four `agent.*` rows (`installed`, `running`, `enrolled`, `console`) must pass.
   On macOS the first drive asks for Accessibility and Screen Recording at the screen, so someone must be there once.
7. **Hand off.** Give the client side `clientSecretKey` and `devicesAddCommand` (`clientRegisterCommand` for a client
   without the plugin; none of them is secret), and tell the owner the credential is in `~/cua-enroll.json`
   (`jq -r .clientCredential` in their own terminal). Once the client has stored it, delete the file.

The device must stay **unlocked and awake while it is driven**: a locked Mac answers `console_locked`, and a sleeping
one drops off the relay. Whether to leave a machine unlocked and unattended is the owner's call; name it, do not
decide it.

## Part B: connect to a device (on the client)

With the cua plugin on the client, a device is added once and then driven from any session by the plugin's own
server: no registration per device, no reconnect.

1. **The credential, stored by the owner.** Ask the owner to type `/secret <clientSecretKey>` (the cua plugin's
   command; it needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`) and paste the credential into the field it opens. You
   cannot do this for them. Skip this step when the owner keeps a ready-made client config for the device (an
   `*.mcp.json` with `mcpServers.cua_repl` inside, such as `~/.config/cua-relay/<device>.mcp.json`): step 2's `import`
   stores the credential from it.
2. **Add the device** with `devicesAddCommand` (`cua devices add <name> --relay <origin> --device=<id>`; `cua remote
   show --json` on the device prints it again), or from the config, `cua devices import <file>` (the name is the
   file's, less `.mcp.json`; `--name` overrides). `cua devices list` must show it with its credential stored. Neither
   command prints the credential; never read the config or the store yourself.
3. **Drive** with the plugin's tools (`mcp__plugin_cua_cua_repl__*`): `devices_list` shows each device's status and
   the current target; `devices_use <name>` switches every tool to it and returns its host notes and its `js` and
   `profiles_list` descriptions (its surface rules), which then apply.
   Work as usual, `end_task` when done (it also frees the device for other clients), then `devices_use local` to
   drive this machine again; a switch while a task is open is refused `task_open`.

| The client sees | Meaning | Next |
|---|---|---|
| `credential_missing` | the device's key is not in the store | step 1, or `cua devices import` |
| `console_locked`, or status `locked` | the device's screen is locked, or another session is on its console | ask the owner to unlock it, then retry |
| `device_offline` | the device is asleep, offline, or its agent stopped; or the relay is unreachable | on the device: `cua agent status`, `cua doctor` |
| `device_unauthorized` | wrong credential, or the relay's table lacks the device's line | check the stored key and the relay's table (Part A, 4) |
| `session_limit` | another client holds the device (one session at a time) | wait a minute, or end the other task |
| `device_session_ended` | the device ended the session mid-task; its REPL state is gone | bind apps and tabs again |

After a `--rotate` on the device, store the new credential under the same key (or `import` the new config); nothing
else changes, since the server reads the key each time it connects to the device.

**Without the plugin** (a client with only Claude Code, such as a cloud VM), register the device's endpoint as an
HTTP MCP server named `cua_repl` with `clientRegisterCommand`, which reads the stored credential in place:
```sh
claude mcp add --transport http cua_repl https://<relay>/d/<deviceId>/mcp \
  --header "Authorization: Bearer $(cat ~/.config/claude-secrets/<clientSecretKey>)"
```
or, from a client config, `claude mcp add-json cua_repl -s user "$(jq -c .mcpServers.cua_repl <file>)"`. The name is
what permission rules and the approval hook match (README, "App approvals"); one `cua_repl` per scope (`claude mcp
list` first), and never `--scope project`, which writes the expanded credential into the repository. Reconnect through
`/mcp` or start a new session to pick it up; the device's tools are then `mcp__cua_repl__*`. After a `--rotate`,
`claude mcp remove cua_repl` and register again: the old value was expanded into the registration. The README's
"Remote control", 5, has the rest.
