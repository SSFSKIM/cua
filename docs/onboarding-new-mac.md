# Connecting a Chrome profile to cua on a new Mac

A step list for bringing a fresh Mac to the point where an agent, through the `cua_repl` MCP server, works in one of
the user's own Chrome profiles. It is written for the next machine and for a later resident agent service, so each
step says what it needs from a person at the console and what can run unattended. The sequence is the one that passed
the clean-machine gate (`docs/evidence/clean-machine-acceptance.md`); the commands are the README's.

## What it takes, in one view

| Step | Command or action | Needs a person at the console? | Verified by |
|---|---|---|---|
| 1 Install cua | `git clone`, `npm install`, `cua install` | no (network, ~690 MB download) | `cua doctor`: `runtime.*` PASS |
| 2 Secrets (only if secret substitution will be used) | `/secret KEY` in Claude Code, or `cua secrets set KEY` | yes: the value is typed (masked) | `secrets.store` PASS |
| 3 Codex login | `cua login` (or `--device-auth`) | yes, once: browser sign-in | `codex.login` PASS |
| 4 Extension in each Chrome profile | install OpenAI's extension from the Web Store, in that profile | yes | `chrome.extension.<key>` PASS |
| 5 Native host registration | nothing when ChatGPT.app is installed; else `cua chrome register` | no | `chrome.host.registered` PASS |
| 6 Register and bind the profile | `cua profiles add`, wake the extension, `cua profiles bind` | yes, for the wake and any pick | `profiles list`: ready |
| 7 macOS permissions (native surface) | allow Accessibility and Screen Recording when asked | yes, once | a live native call |
| 8 Claude Code wiring | `claude mcp add …`, settings permissions and hook | no | `claude mcp list`: Connected |

## The steps

### 1. Install cua

```sh
git clone git@github.com:SSFSKIM/cua.git ~/Developer/GitHub/cua
cd ~/Developer/GitHub/cua && npm install
node bin/cua.mjs install          # downloads and verifies the pinned OpenAI release into ~/Library/Application Support/cua
node bin/cua.mjs doctor
```

Requirements: Apple silicon, Node 22 or newer. `install` refuses an archive whose hash, layout or code signatures
differ from the pinned record, and never modifies vendor files. Doctor's `runtime.*` and `sandbox` rows should PASS;
`helper.live` and `helper.permissions` stay BLOCKED until step 7.

### 2. Secrets (only if secret substitution will be used)

```sh
node bin/cua.mjs secrets set WORK_PASSWORD   # or /secret WORK_PASSWORD in Claude Code with the doperpowers secrets mod
```

Each secret is a file `~/.config/claude-secrets/<KEY>` (mode 0600), the store the doperpowers `secrets` mod writes, so
there is nothing to build or sign (issue #66). This works over SSH too (`ssh -t` for the masked prompt).

### 3. Codex login for the server

```sh
node bin/cua.mjs login            # opens the browser sign-in; --device-auth prints a code instead
node bin/cua.mjs login --status
```

OpenAI's browser service only serves an identified session. The login lives in cua's own `CODEX_HOME`
(`$CUA_HOME/state/codex`), never in `~/.codex`. This is the one step that needs an interactive sign-in; `--device-auth`
lets it happen from another device when the Mac has no browser session yet.

### 4. The extension in each Chrome profile

In every Chrome profile the agent should use, install and enable OpenAI's Chrome extension
(`hehggadaopoacecdllhhajmbjkdcmajg`). cua never installs it, so this is a person's step. The profile's directory name
is the last part of "Profile Path" on `chrome://version` (`Default`, `Profile 6`, …). Signing in to ChatGPT inside
Chrome was not needed: the VM gate ran the Chrome acceptance from a Guest profile.

### 5. The native host the extension talks to

The extension connects to one native-messaging host name. `cua doctor`'s `chrome.host.registered` row says which
manifest serves it:

- `desktop: …` means ChatGPT.app is installed and its registration serves; do nothing (that was the case on both
  owner Macs).
- Nothing registered (a Mac without ChatGPT.app): `node bin/cua.mjs chrome register` writes cua's manifest pointing at
  the host inside the installed release. `unregister` removes only cua's own manifest. The extension's onboarding
  may say the ChatGPT app is required; the registration is what it actually needs.

From a terminal without Full Disk Access, register/unregister refuse with the fix instead of guessing (issue #16).

### 6. Register and bind the profile

```sh
node bin/cua.mjs profiles add personal --chrome-profile Default
# open Chrome on that profile and click the OpenAI extension's icon once (wakes its host)
node bin/cua.mjs profiles bind personal
node bin/cua.mjs profiles list
```

`bind` lists the live extension backends with the Chrome profile directory and display name cua computes for each
(copies of the extension's settings store, read with the runtime's own `classic-level`) and the vendor's label. It
binds by itself when the registered directory's store names exactly one live backend; otherwise it asks for a pick,
and from a non-terminal it prints the candidates and takes `--extension-instance-id <id>`. `--dry-run` shows the
decision without recording it. The profile is `ready` when its bound instance is live now.

The binding lasts as long as the extension instance: toggling or reinstalling the extension can mint a new id, after
which `list` says `binding_stale` and `bind` again repairs it. `host_not_live` means no backend is live at all: open
a window in the profile (`cua profiles open <key>` does it from the terminal) and click the extension icon if it still
has no backend.

### 7. macOS permissions for the native surface

The first native call (the `computer` surface) starts the pinned helper through LaunchServices; it shows its own
"Enable ChatGPT Computer Use" window and then macOS asks for Accessibility and Screen Recording, attributed to the
helper, not to the terminal. A person allows them once in System Settings. Over SSH these prompts cannot be shown, so
steps 3 and 7 happen at the console. A browser-only machine still needs
the runtime to start for the listing launch, but the Chrome acceptance ran without granting the native permissions
first.

### 8. Wire it into Claude Code

```sh
claude mcp add cua_repl -s user -e CUA_SHIM_SURFACES=computer,browser -- node ~/Developer/GitHub/cua/bin/cua.mjs serve
claude mcp list
```

`~/.claude.json` is per machine; run this on each. Two hand-made parts of `~/.claude/settings.json` also have to be
copied: the `mcp__cua_repl__*` permission entries, and the `Elicitation` hook matched to `cua_repl` that runs
`~/.claude/hooks/cua-approve.sh` to accept the per-app and per-site approval dialogs. Without the hook each new
connection shows a dialog per app and per site origin (`CUA_SHIM_PERSIST=always` remembers app approvals machine-wide
instead). `CUA_SHIM_SANDBOX` defaults to `scoped` (cells cannot write outside their run directory or reach the
network); `disabled` lifts both.

## For a resident agent service

What this sequence implies for a service that is meant to run without a person:

- **Console steps are one-time.** Login (3), permissions (7) and the extension install (4) happen once per Mac and
  profile; everything after is unattended, including the listing launch, `profiles list` and `cua serve`.
- **Chrome must be open on the profile, with the extension awake.** The host is started by Chrome when the extension
  connects and ends when that connection closes (spike #7). A service should check readiness (`profiles list --json`
  or the agent's `profiles_list`) before each task and surface `host_not_live` / `binding_stale` as a person's step,
  not retry. The next spontaneous host exit is still being recorded (#41).
- **Bindings can go stale without anyone touching cua.** An extension update or toggle mints a new instance id. With
  the directory map, `bind` repairs this automatically when the profile's store names one live backend, so a service
  can run `cua profiles bind <key>` itself after a `binding_stale`; it must never pick between profiles.
- **Full Disk Access decides what a background process can read.** A launchd service without it gets the file checks
  as `chrome_data_unreadable` and the directory map as `unavailable`; readiness still works through the live check.
  Grant it to the service's executable if the labelled bind should work unattended.
- **One task, one connection.** Each `cua serve` connection is a REPL with its own session, approval state and run
  directory, closed by `end_task` or EOF; stale run directories are swept at the next start (#29).
- **Not yet shown:** a fresh user account on a shared Mac, Developer ID signing of the helper (#14), and file-level TCC
  behaviour on macOS 27 without Full Disk Access on a SIP-enabled Mac (the VM has SIP off).
