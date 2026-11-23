# Setting up cua on a new Mac

A step list for bringing a fresh Mac to the point where an agent, through the `cua_repl` MCP server, works in one of
the user's own Chrome profiles and in the Mac's own apps. It is written for the next machine and for a later resident agent service, so each
step says what it needs from a person at the console and what can run unattended. The commands are the README's. The
browser goes through cua's own Chrome extension and host, which need no ChatGPT account and no Codex login
(`docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`); the clean-machine gate
(`docs/evidence/clean-machine-acceptance.md`) passed the earlier ChatGPT extension route, which #79 removed; a Mac
that was set up that way moves with the README's "Moving a home off the ChatGPT extension route (#79)".

## What it takes, in one view

| Step | Command or action | Needs a person at the console? | Verified by |
|---|---|---|---|
| 1 Install cua | `git clone`, `npm install`, `cua install` | no (network, ~690 MB download) | `cua doctor`: `runtime.*` PASS |
| 2 Secrets (only if secret substitution will be used) | `/secret KEY` in Claude Code, or `cua secrets set KEY` | yes: the value is typed (masked) | `secrets.store` PASS |
| 3 (no login) | nothing: cua needs no Codex login | no | — |
| 4 Extension in each Chrome profile | the cua extension from the Chrome Web Store once listed; until then load `extension/` unpacked | yes | `chrome.extension.<key>` PASS |
| 5 Native host registration | `cua chrome register` | no | `chrome.host.registered` PASS |
| 6 Register and bind the profile | `cua profiles add`, Chrome open on it, `cua profiles bind` | yes, for any pick | `profiles list`: ready |
| 7 macOS permissions (native surface) | the vendor engine (the default): allow Accessibility and Screen Recording when asked. cua's own engine (opt-in): a signing identity, `cua install --engine`, `cua engine approve` | yes: the grants, and for cua's engine its first sign's keychain prompt | a live native call; for cua's engine, `cua doctor`'s `engine` row |
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
node bin/cua.mjs secrets set WORK_PASSWORD   # or /secret -g WORK_PASSWORD in Claude Code (the cua plugin's mod)
```

Each secret is a file `~/.config/claude-secrets/<KEY>` (mode 0600), the store the plugin's `/secret` mod writes, so
there is nothing to build or sign (issue #66). This works over SSH too (`ssh -t` for the masked prompt). A secret for
one project only goes in that project's tier, `~/.config/claude-secrets/projects/<slug>/<KEY>`: `/secret KEY` in a
session there, or `secrets set KEY --project` run in the project's directory; it shadows a global key of the same name
there (README, Secrets). `cua doctor` reports both.

### 3. No login

cua needs no Codex login and no ChatGPT account.

### 4. The extension in each Chrome profile

In every Chrome profile the agent should use, add the cua extension (`jkejaaijdfpohkdhankllbekkhmnippb`): from the
Chrome Web Store once it is listed, or until then `chrome://extensions` → Developer mode → "Load unpacked" → the
checkout's `extension/` directory (keep the checkout at a stable path; Chrome loads it from there). cua never installs
it, so this is a person's step. The profile's directory name is the last part of "Profile Path" on `chrome://version`
(`Default`, `Profile 6`, …). The extension's popup shows `host: connected io.github.ssfskim.cua` once step 5 is done.

### 5. The native host the extension talks to

```sh
node bin/cua.mjs chrome register      # cua's host launcher and the io.github.ssfskim.cua manifest in each browser
```

It writes a launcher under `$CUA_HOME/chrome/` and the manifest naming it; Chrome starts the host when the extension
connects. Run it again after moving the checkout or upgrading node (doctor's `chrome.host.registered` says when). A
manifest another cua home wrote is refused (`--replace` takes it over, and `cua chrome unregister` restores it). From a
terminal without Full Disk Access, register/unregister refuse with the fix instead of guessing (issue #16).

### 6. Register and bind the profile

```sh
node bin/cua.mjs profiles add personal --chrome-profile Default
# Chrome open on that profile; the cua extension's popup shows its host connected
node bin/cua.mjs profiles bind personal
node bin/cua.mjs profiles list
```

`bind` lists the live extension backends with the Chrome profile directory and display name cua computes for each
(copies of the extension's settings store, read with the runtime's own `classic-level`). It binds by itself when the
registered directory's store names exactly one live backend; otherwise it asks for a pick, and from a non-terminal it
prints the candidates and takes `--extension-instance-id <id>`. `--dry-run` shows the decision without recording it. The
profile is `ready` when its bound instance is live now.

The binding lasts as long as the extension instance: reinstalling the extension (or removing an unpacked load and
loading it again) mints a new id, after which `list` says `binding_stale` and `bind` again repairs it. `host_not_live`
means no backend is live at all: open a window in the profile (`cua profiles open <key>` does it from the terminal) and
open the cua extension's popup if it still has no backend.

### 7. macOS permissions for the native surface

The first native call (the `computer` surface) starts the pinned helper through LaunchServices; it shows its own
"Enable ChatGPT Computer Use" window and then macOS asks for Accessibility and Screen Recording, attributed to the
helper, not to the terminal. A person allows them once in System Settings. Over SSH these prompts cannot be shown, so
steps 4 and 7 happen at the console. A browser-only machine still needs
the runtime to start for the listing launch, but the Chrome acceptance ran without granting the native permissions
first.

That is the vendor engine, still the default. **cua's own engine** (`cua Engine.app`, #117) is an opt-in until a later
release of #117 switches the default; the README's "cua's own macOS engine (opt-in)" (under Install) explains each
step. It has one place per Mac, `~/Library/Application Support/cua/engine/cua Engine.app`, which no `CUA_HOME` moves.
Every step marked *owner* is done by the owner at this Mac's console; automation never enters a password, answers a
system alert or touches System Settings.

1. *Owner, once per Mac.* Install Xcode (its Swift toolchain builds the engine). Create an Apple Development
   certificate in Xcode's Accounts settings, or import the owner's certificate with its private key into the login
   keychain, and check that `security find-identity -v -p codesigning` lists it as valid (if it does not, add the Apple
   WWDR intermediate it chains to).
2. Name the identity: `"signingIdentity": "<its SHA-1 or common name>"` in `~/.config/cua/engine.json` (keeping the
   file's other keys), or `CUA_SIGNING_IDENTITY` in the build's environment. Prefer the SHA-1 where two certificates
   share a name. Keep it out of chats, reports and the repository; cua never prints it.
3. *Owner, once per Mac and key.* Admit `codesign` to the signing key, then make the first sign at the console:

   ```sh
   security set-key-partition-list -S apple-tool:,apple: -s -t private \
     -l '<signing key label>' ~/Library/Keychains/login.keychain-db   # asks for the keychain password
   node bin/cua.mjs install --engine --sign-wait 600000
   ```

   The label is the signing private key's name in Keychain Access. When `codesign` asks for the key, answer with the
   login password and **Always Allow** while the build still waits (`--sign-wait 600000` gives ten minutes; 45 s by
   default). If the build gave up first, the prompt stays on screen: answer it and run the build again. Later builds
   sign with no prompt, also when started over SSH: the build then signs through a one-shot job in the GUI session
   (`launchctl bootstrap gui/<uid>`), which needs someone logged in at the console.

   The build lands in the pending slot, `pending/cua Engine.app` beside the approved place, and says "a new build is
   pending; cua engine approve to use it". `cua install` never approves it and raises no permission dialog.
4. *Owner, with no session using the engine.* Approve it:

   ```sh
   node bin/cua.mjs engine approve
   ```

   It puts the pending build in place and asks for its grants. macOS usually shows no prompt for this background app,
   so follow the steps it prints for each grant that is missing: System Settings → Privacy & Security →
   **Accessibility**, **Screen & System Audio Recording** and **Input Monitoring**; click **+**, press **⌘⇧G**, enter
   `~/Library/Application Support/cua/engine/cua Engine.app`, and switch **cua Engine** on. Grant them to that bundle,
   not to the terminal or a copy, then press Enter in the approve terminal (`n` aborts). Input Monitoring is the
   intervention tap's grant: without it the engine runs with user-intervention detection off. The command relaunches
   the engine, takes one display capture it discards, and only then writes `approved.json`; if macOS shows a
   screen-capture confirmation, the owner answers it and confirms at the terminal. If approval does not complete, the
   previous engine goes back and keeps serving, and the build is pending again.

   On a copy macOS has not seen before, the first capture can raise replayd's alert about bypassing the system's
   private window picker, and approve fails with `engine_capture_confirmation`: answer the alert at the console
   (Allow), then run `cua engine approve` again. `cua engine approve --foreground` makes the first grant requests from
   a foreground launch, which may let macOS show its own prompts.
5. Check it:

   ```sh
   CUA_NATIVE_ENGINE=cua node bin/cua.mjs doctor
   node bin/cua.mjs engine status
   ```

   The `engine` row names the approved build, any build pending beside it, whether the signature matches the
   configured identity (never the identity itself) and the three grants: it fails without Accessibility or Screen
   Recording, and warns without Input Monitoring. In a session, a missing grant fails the request with
   `permissionsPending`, whose sentence gives the same steps; after Screen Recording is granted, the next observation
   relaunches the engine, when no other session uses it, and retries once.

A later update that changes the engine is built the same way (`cua install --engine`, or `cua engine build`) and is
pending until `cua engine approve` puts it in place; the approved engine serves until then. Under the same identity
the grants carry over, so that approval normally needs no one at the Mac.

### 8. Wire it into Claude Code

```sh
claude mcp add cua_repl -s user -e CUA_SHIM_SURFACES=computer,browser -- node ~/Developer/GitHub/cua/bin/cua.mjs serve
claude mcp list
```

That keeps the default, the vendor engine. With cua's own engine approved (step 7), select it either for this server,
by adding `-e CUA_NATIVE_ENGINE=cua` before `--` in the command above, or for every session of the account, with
`"engine": "cua"` in `~/.config/cua/engine.json`; the variable wins over the file. Configuring `signingIdentity`, or
`CUA_NATIVE_ENGINE=cua` on the doctor command, selects nothing for `serve`. A selection of cua's engine with no
approved engine is refused, naming `cua install --engine` and `cua engine approve`.

`~/.claude.json` is per machine; run this on each. Two hand-made parts of `~/.claude/settings.json` also have to be
copied: the `mcp__cua_repl__*` permission entries, and the `Elicitation` hook matched to `cua_repl` that runs
`~/.claude/hooks/cua-approve.sh` to accept the per-app and per-site approval dialogs. Without the hook each new
connection shows a dialog per app and per site origin (`CUA_SHIM_PERSIST=always`, which remembered app approvals
machine-wide, is refused since #117 M3: the hook is how to stop being asked). `CUA_SHIM_SANDBOX` defaults to `scoped` (cells cannot write outside their run directory or reach the
network); `disabled` lifts both.

## For a resident agent service

What this sequence implies for a service that is meant to run without a person:

- **Console steps are one-time.** Permissions (7) and the extension install (4) happen once per Mac and profile;
  everything after is unattended, including the listing launch, `profiles list` and `cua serve`. With cua's own
  engine, a rebuild waits for `cua engine approve`, which needs the console only when a grant reads false or macOS
  shows a capture confirmation; the approved engine serves meanwhile, and approve refuses while a session uses it.
- **Chrome must be open on the profile, with the extension awake.** The host is started by Chrome when the extension
  connects and ends when that connection closes (spike #7). A service should check readiness (`profiles list --json`
  or the agent's `profiles_list`) before each task and surface `host_not_live` / `binding_stale` as a person's step,
  not retry. The next spontaneous host exit is still being recorded (#41).
- **Bindings can go stale without anyone touching cua.** A reinstall of the extension mints a new instance id. With
  the directory map, `bind` repairs this automatically when the profile's store names one live backend, so a service
  can run `cua profiles bind <key>` itself after a `binding_stale`; it must never pick between profiles.
- **Full Disk Access decides what a background process can read.** A launchd service without it gets the file checks
  as `chrome_data_unreadable` and the directory map as `unavailable`; readiness still works through the live check.
  Grant it to the service's executable if the labelled bind should work unattended.
- **One task, one connection.** Each `cua serve` connection is a REPL with its own session, approval state and run
  directory, closed by `end_task` or EOF; stale run directories are swept at the next start (#29).
- **Not yet shown:** a fresh user account on a shared Mac, Developer ID signing of the helper (#14), and file-level TCC
  behaviour on macOS 27 without Full Disk Access on a SIP-enabled Mac (the VM has SIP off).
