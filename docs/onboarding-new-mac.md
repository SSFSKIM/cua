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
| 7 cua's engine and its permissions (native surface) | cua's engine (the default): a signing identity, `cua install --engine`, `cua engine approve`, then allow cua Engine's Accessibility, Screen & System Audio Recording and Input Monitoring. The vendor engine (the rollback, and the fallback until an engine is approved): allow Accessibility and Screen Recording when asked | yes: the grants, and for cua's engine its first sign's keychain prompt | cua's engine: `cua doctor`'s `engine` PASS. The vendor engine: a first native call in a session works, then `helper.live` PASS (`engine` reads `skip` with the vendor engine selected, and `warn` while the default falls back to it) |
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
`helper.live` and `helper.permissions` stay BLOCKED until a native call, and the `engine` row warns until step 7 (no
approved engine yet, so computer sessions keep the vendor's). `install` also tries to build cua's engine, the default
(step 7); until step 7's Xcode and signing identity are in place that build fails with a warning that names the cause
(Xcode missing or not selected, no signing identity, a compile error), says what sessions get meanwhile (on a new Mac,
the vendor engine; where a setting selects cua's engine or host, the refusal a session would get, in its own words) and
what makes them usable now, then how to retry the build. The install still succeeds.

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

### 7. cua's engine and macOS permissions for the native surface

The `computer` surface runs cua's own engine by default (#117), `cua Engine.app`, once one at the version this cua
drives is built and approved on this Mac; the README's "cua's own macOS engine" (under Install) explains each step. It
has one place per Mac, `~/Library/Application Support/cua/engine/cua Engine.app`, which no `CUA_HOME` moves. macOS
attributes its Accessibility, Screen & System Audio Recording and Input Monitoring to **cua Engine**, not to the
terminal. Every step marked *owner* is done by the owner at this Mac's console; automation never enters a password,
answers a system alert or touches System Settings. Over SSH the prompts cannot be shown, so steps 4 and 7 happen at
the console.

1. *Already built?* If step 1's `cua install` left a build pending that this cua drives (it said "a new build is
   pending; cua engine approve to use it", and a session's line or `cua doctor` says "built, awaiting approve"), go
   straight to step 4: the identity and the first sign are done. Otherwise, *owner, once per Mac:* install Xcode (its
   Swift toolchain builds the engine). Create an Apple Development
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
   default). If the build stops waiting first, it fails (`engine_sign_failed` from a console terminal,
   `engine_sign_prompt_waiting` from outside the GUI session) and its prompt can stay on screen. Answering a prompt
   whose signer has gone may leave the key's access unchanged: dismiss it, run the build again with a long
   `--sign-wait`, and choose **Always Allow** while that build is still waiting. Later builds sign with no prompt, also when started over SSH: the build then signs through a one-shot job in the GUI session
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
   the engine, takes one display capture it discards, and only then writes `approved.json`. When replayd shows a
   screen-capture confirmation, or its log could not be watched, the command stops and asks: the owner answers any
   alert at the console (Allow), presses Enter at the terminal, and approval continues. On a copy macOS has not seen
   before, the first capture can raise replayd's alert about bypassing the system's private window picker. With no
   answer at the terminal (its input closed), approve fails with `engine_capture_confirmation` and writes nothing,
   whether an alert appeared or the watch was only unavailable: answer any alert at the console, then run
   `cua engine approve` again from a terminal. `cua engine approve --foreground` makes the first grant requests from a
   foreground launch, which may let macOS show its own prompts.

   If approval does not complete, the previous engine goes back on disk and the build is pending again, with two
   exceptions the command reports. A build published while the approval ran keeps the pending slot and the failed one
   is dropped: check `cua engine status` before approving again. A promoted engine that a session connected to
   meanwhile refuses to stop and keeps the engine's socket until it stops: sessions refuse it when its build differs
   from the restored engine's, but a promoted copy of the same build keeps serving new sessions. Either way, run
   `cua engine stop` once it is idle (the next build or approve also stops it then), and the next session launches
   the restored engine.
5. Check it:

   ```sh
   node bin/cua.mjs doctor          # the engine row: cua's engine selected (the default)
   node bin/cua.mjs engine status
   ```

   The `engine` row names the approved build, any build pending beside it, whether the signature matches the
   configured identity (never the identity itself) and the three grants: it fails without Accessibility or Screen
   Recording, and warns without Input Monitoring. In a session, a missing grant fails the request with
   `permissionsPending`, whose sentence gives the same steps; after Screen Recording is granted, the next observation
   relaunches the engine, when no other session uses it, and retries once.

A later update that changes the engine is built the same way (`cua install --engine`, or `cua engine build`) and is
pending until `cua engine approve` puts it in place; the approved engine serves until then, as long as it is at least
the version this cua drives. Under the same identity the grants carry over, so that approval normally needs no one at
the Mac.

**Until an engine is approved, and as the rollback,** computer sessions run the vendor's engine. From step 1's
install to step 4's approve this is every new Mac's normal state, not a fault: each session's first successful `js` or
`js_reset` result (a tool error does not carry it, and the next success does) ends
with one line (also in `_meta['cua/engineNotice']`), and doctor's `repl.host` and `engine` rows warn with the same
words, the reason first, then the remedy:

- *No approved engine.* The reason is `not built`, `build failed: <cause>` (the last build's), `build <id> built,
  awaiting approve`, or a pending build older than 0.2.0. The remedy is `cua engine approve` with the owner at the
  console for a build awaiting approve; otherwise `cua install --engine`, then `cua engine approve` (a failed build's
  cause fixed first: a pending build older than the minimum would not be used if approved).
- *An approved engine older than this cua drives (0.2.0).* The reason names its version. The remedy is `cua engine
  approve` when a build at or above the minimum is pending beside it, else `cua install --engine`, then `cua engine
  approve`.

With no runtime installed either (step 1 not done), a computer session is refused with the runtime's remedy and the
same engine reason and remedy. `CUA_NATIVE_ENGINE=vendor` for a session, or `"engine": "vendor"` in
`~/.config/cua/engine.json` for the Mac, keeps the vendor's engine until #117's M6 retires it, with no such line. On the vendor engine the first native call starts
the pinned helper through LaunchServices; it shows its own "Enable ChatGPT Computer Use" window and then macOS asks for
Accessibility and Screen Recording, attributed to the helper, which a person allows once in System Settings. A
browser-only machine still needs the runtime to start for the listing launch, but the Chrome acceptance ran without
granting the native permissions first.

### 8. Wire it into Claude Code

```sh
claude mcp add cua_repl -s user -e CUA_SHIM_SURFACES=computer,browser -- node ~/Developer/GitHub/cua/bin/cua.mjs serve
claude mcp list
```

That keeps the default, cua's own engine where one is approved (step 7), else the vendor engine with the line step 7
describes. cua's engine also needs Node 24 for cua's own REPL host; where none is found the default keeps the vendor
host and engine, and an explicit selection is refused: the README's REPL host table (under Use) tells the default's
fallbacks, an explicit selection's `repl_host_node` and `CUA_REPL_HOST=vendor` apart. To keep the vendor engine (the
rollback), add `-e CUA_NATIVE_ENGINE=vendor` before `--` in the command above for this server, or set `"engine":
"vendor"` in `~/.config/cua/engine.json` for every session of the account; the variable wins over the file.
Configuring `signingIdentity` selects nothing for `serve`. An explicit selection of cua's engine (`CUA_NATIVE_ENGINE=cua`
or `"engine": "cua"`) with no approved engine this cua drives is refused, naming `cua engine approve` alone when a build
at or above the minimum is already pending, else `cua install --engine` and then `cua engine approve`: with none
approved (`engine_not_installed`, in the same words as step 7's line), or with one older than 0.2.0
(`engine_outdated`).

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
