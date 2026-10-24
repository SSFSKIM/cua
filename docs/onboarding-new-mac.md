# Setting up cua on a new Mac

A step list for bringing a fresh Mac to the point where an agent, through the `cua_repl` MCP server, works in one of
the user's own Chrome profiles. It is written for the next machine and for a later resident agent service, so each
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
| 7 macOS native engine | vendor by default; opt-in cua: configure identity, `install --engine`, `engine approve` | yes: first signing-key trust and three grants | `CUA_NATIVE_ENGINE=cua cua doctor --json`, then a live native call |
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

The default is still the vendor engine. Its first native call starts `Codex Computer Use.app` through LaunchServices;
the owner answers its "Enable ChatGPT Computer Use" window and grants Accessibility and Screen Recording at the
console. A browser-only setup does not need these native grants.

For **cua's own opt-in engine**, use the sequence below. The bundle always lives at
`~/Library/Application Support/cua/engine/cua Engine.app`; changing `CUA_HOME` never moves or duplicates it.

#### Owner: signing identity and key trust (once per Mac/key)

1. Install Xcode's command-line tools (`xcode-select --install`, with the owner completing any installer). Confirm
   `xcrun swift --version`. In Xcode's account settings create an Apple Development certificate, or import the owner's
   exported certificate **and private key** into the login keychain with Keychain Access. If it is not valid, install
   the matching Apple WWDR intermediate from Apple's certificate authority page; do not disable trust checks.
2. At a private console terminal, inspect `security find-identity -v -p codesigning` and choose that identity's SHA-1
   (useful when common names repeat). Do not paste the identity into a chat, report or repository. Configure
   `~/.config/cua/engine.json`, preserving existing keys, with `"signingIdentity": "<chosen SHA-1>"`; alternatively set
   `CUA_SIGNING_IDENTITY` in the build's environment. No certificate name is shipped in this repository.
3. In the owner's console terminal, admit codesign in **that private key's** partition list. Replace the placeholder
   with its label from Keychain Access; the label need not equal the certificate's display name. The command is scoped
   to that signing private key, not every key in the login keychain:

   ```sh
   security set-key-partition-list -S apple-tool:,apple: -s -t private \
     -l '<signing private key label>' "$HOME/Library/Keychains/login.keychain-db"
   ```

   Any authentication is the owner's action. Automation stops at a password prompt; it never supplies a password or
   changes keychain access lists. Do not put a password in command history with `-k`.
4. Run the first sign while the owner is at the console:

   ```sh
   node bin/cua.mjs install --engine --sign-wait 600000
   ```

   When `codesign` requests access to the private key, the **owner** enters the login password and chooses **Always
   Allow** while the signing process is still alive. A timeout can leave an orphaned prompt; the owner cancels it and
   reruns the attended build. If it stays blocked, stop and diagnose rather than repeatedly launching sign jobs.

SSH cannot use the GUI login's unlocked keychain directly. The builder detects a non-Aqua session and runs only the
sign through a bounded, one-shot launchd job in `gui/<uid>`, then removes that job. There must be an unlocked GUI login.
After the two trust steps above, subsequent signs through SSH are expected to be silent; unlocking the keychain in
each SSH connection is not the setup. `--sign-wait` or `CUA_SIGN_WAIT_MS` controls the wait (45 s default, at most
1800000 ms). A password prompt is still an owner step, never unattended automation. `--engine-sign adhoc` is only for
hosted CI where grants are not retained across builds; it is never the fallback for a missing identity.

#### Owner: grants and approval

With no session using the engine, run:

```sh
node bin/cua.mjs engine approve
```

macOS may show no permission prompt for this background app. Follow the command's printed by-hand steps instead:
in **System Settings → Privacy & Security**, open each of **Accessibility**, **Screen & System Audio Recording**,
and **Input Monitoring**. For a missing entry, click **+**, press **⌘⇧G**, enter
`~/Library/Application Support/cua/engine/cua Engine.app`, and enable **cua Engine**. Do not grant permissions to a
scratch copy or to the terminal instead. Only the owner touches these controls or any capture-confirmation alert.

Confirm in the approve terminal after granting. Approval does not depend on the running process noticing the grant:
it stops through `shutdown`, relaunches, and takes one discarded display capture. If replayd reports a confirmation,
the owner answers it and confirms at the terminal. Only then does the command write `approved.json` for the build and
signature. All harness homes serve that bundle in place. A rebuild under the same identity normally keeps the grants;
a detected new capture alert still requires the owner. No approval file is evidence that a permission was never revoked.

```sh
CUA_NATIVE_ENGINE=cua node bin/cua.mjs doctor --json
```

Check `engine.selected`, the approved bundle/build, `engine.signature.identityMatches` (the identity is deliberately
not printed), and `engine.permissions.accessibility`, `screenRecording`, `inputMonitoring`. Input Monitoring is the
intervention tap's grant; without it detection is off and reported. Both text observations and screenshots require
Screen Recording. In a session, a missing grant returns `permissionsPending` with the Settings path without requesting
an Accessibility or Screen Recording system prompt; those requests belong to explicit `engine approve`. After a Screen
Recording refusal the next observation relaunches the engine once it has no other connection, then retries once.
Explicit approval and its confirmation capture can still need the owner at the console; passive ordinary checks do not
guarantee that macOS will never display other system UI.

For a fresh-onboarding acceptance run, item 14 of `scripts/accept-native.mjs` is separate from item 9's clean-machine
release gates. The **owner** removes only the cua Engine entries from all three panes with **–**, then re-adds them
in the harness's order: Accessibility, Screen Recording (choose **Later**, not **Quit & Reopen**, so the harness proves
the service's relaunch), Input Monitoring. The harness never revokes or grants permissions itself.

### 8. Wire it into Claude Code

Choose one registration. The ordinary registration keeps the current vendor default:

```sh
claude mcp add cua_repl -s user -e CUA_SHIM_SURFACES=computer,browser -- node ~/Developer/GitHub/cua/bin/cua.mjs serve
```

If you built and approved **cua's own engine** in step 7, use this variant instead so the registered server selects it
on every connection. Configuring `signingIdentity` or selecting cua only for the earlier doctor command does not
select it for `serve`; this registration sets the preference for this MCP server without changing the global default:

```sh
claude mcp add cua_repl -s user -e CUA_SHIM_SURFACES=computer,browser -e CUA_NATIVE_ENGINE=cua -- node ~/Developer/GitHub/cua/bin/cua.mjs serve
```

If `cua_repl` is already registered, remove that registration with `claude mcp remove cua_repl -s user` before adding
the chosen variant. Then check the connection:

```sh
claude mcp list
```

`~/.claude.json` is per machine; run this on each. Two hand-made parts of `~/.claude/settings.json` also have to be
copied: the `mcp__cua_repl__*` permission entries, and the `Elicitation` hook matched to `cua_repl` that runs
`~/.claude/hooks/cua-approve.sh` to accept the per-app and per-site approval dialogs. Without the hook each new
connection shows a dialog per app and per site origin (`CUA_SHIM_PERSIST=always`, which remembered app approvals
machine-wide, is refused since #117 M3: the hook is how to stop being asked). `CUA_SHIM_SANDBOX` defaults to `scoped` (cells cannot write outside their run directory or reach the
network); `disabled` lifts both.

## For a resident agent service

What this sequence implies for a service that is meant to run without a person:

- **Console steps are one-time.** Permissions (7) and the extension install (4) happen once per Mac and profile;
  everything after is unattended, including the listing launch, `profiles list` and `cua serve`.
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
