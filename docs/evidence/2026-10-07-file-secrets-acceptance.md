# File secret store acceptance (issue #66, M14)

Date: 2026-10-07 (UTC; 2026-10-06 evening Pacific). Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`,
M14 and the Decision Log entry of the same date. Branch `feat/file-secrets`. The store is
`$HOME/.config/claude-secrets/<KEY>` (file 0600, directory 0700), the directory of the `/secret` mod (`hooks/mods/secrets.tsx`, moved into this repo from doperpowers the same day); the
Keychain helper and broker are gone. Every value below was generated for the run, typed into `cua secrets set` at a
pseudo-terminal, and never printed: each check compares digests or scans for the value (raw and its base64 forms,
`scripts/probe/leak-scan.mjs`) without showing it.

| Item | Result |
|---|---|
| 1 `npm test` | **PASS**. macOS: 701 tests, 700 pass, 1 Linux-only skip, 0 fail. Linux VM (arm64): see section 4 |
| 2 macOS local, TextEdit | **PASS**. Key set at a pty in a temporary `$HOME`, typed through `cua serve` into a disposable TextEdit document, the document's text equal to marker + value by SHA-256 inside the cell; the value in neither the MCP stream nor stderr |
| 3 Remote agent on the Mac mini, through the relay | **PASS**. Key set over `ssh -t` in the mini's real store, `secrets_list` showed it through the relay, typed into a TextEdit document on the mini, read back exactly by hash; the value in none of the relay traffic, the mini's `$CUA_HOME` or its agent log; key deleted after |
| 4 Linux VM `cua-linux`, gedit and zenity | **zenity: PASS**, the entry received exactly the value (zenity's own output on OK). **gedit: the substituted `type_text` reached the helper and gedit crashed**, as plain `typeText` does there (Phase F, issue #51); recorded, not a cua defect |
| Sandbox read-deny | Measured: possible, but it binds the trusted worker too, so not applied (below) |

## The sandbox measurement

`CUA_HOME` a temporary install of 26.928.40906 (`/tmp/cua-66-home`), the scoped profile with one extra entry
`{"path":{"type":"path","path":"/tmp/cua-66-deny"},"access":"none"}` (a temporary edit, reverted), a 0600 file in that
directory, and a temporary probe hook in the trusted sky service that reads a path it is given (reverted):

| Reader | Without the entry | With `"access":"none"` (also `"deny"`) |
|---|---|---|
| A JavaScript cell (`fs.readFileSync`) | the file's contents | `EPERM` |
| The trusted worker (the sky service) | the file's contents | `EPERM` |
| A cell reading `/etc/hosts` (control) | 213 bytes | 213 bytes |

node_repl applies one managed profile to cells and trusted services alike, so denying the store would deny the reader
that substitutes. Hence no deny entry: a cell can read the store under every sandbox mode, which the README (Secrets)
and the host notes ("Never read ~/.config/claude-secrets; type secrets as {{secret:KEY}}.") now say.

## 2. macOS local (this MacBook)

```sh
export CUA_HOME=/tmp/cua-66-home          # node bin/cua.mjs install --archive …/ChatGPT-darwin-arm64-26.928.40906.zip
H=$(mktemp -d /tmp/cua-66-storehome.XXXXXX)
(sleep 1.5; printf '%s\r' "$V"; sleep 0.7; printf '%s\r' "$V"; sleep 1.5) | HOME=$H script -q /dev/null node bin/cua.mjs secrets set CUA_TEST_SECRET
node scripts/accept-native.mjs --live-secrets --live-textedit --secret-key CUA_TEST_SECRET --secret-home "$H" --report "$CUA_HOME/acceptance-secrets-2.json"
```

`secrets set` printed both prompts and `stored CUA_TEST_SECRET in …/.config/claude-secrets/CUA_TEST_SECRET (mode
0600)`, nothing echoed; the directory was 0700. The runner (02:11:14 to 02:13:35 UTC), on the PASS rows that matter
here:

- Item 6, UI delivery: the caller's key in the store home given; `typeText({{secret:<KEY>}})` returned with nothing so
  far carrying the value (MCP transport, server and runtime stderr); the document holds the marker followed by exactly
  the stored value (SHA-256 compared inside the cell); the transcript scanned again after the readback, clean.
- Item 6, CLI: `secrets set` without a terminal exits 1 and stores nothing, its hint naming `/secret KEY`; at a pty it
  stores exactly the typed value, 0600 in 0700, never echoed; `list --json` keys only; `remove` deletes the file.
- Items 6 and 7, `scripts/probe-secrets.mjs` (34 steps, all PASS): paste, type_text and set_value substitution into a
  controlled fake target through the real store, trusted worker and runtime; a replaced value; value-free failures
  (induced, a cell timeout, the real vendor after substitution, an unknown key); fail-closed with secrets off and with
  an unreadable store; no value in any observed channel or report; the scoped sandbox keeps the trusted roots
  unwritable.
- Items 4 and 5: `verify.mjs` and the TextEdit fixture's own document, PASS.

The runner's overall verdict is BLOCKED, for reasons that predate this change: item 1 counts the one Linux-only skip
of `npm test` as coverage that did not run, and the items that cite unit suites inherit it; the clean clone (item 10)
runs `npm test` without `npm ci`, so the 28 relay tests that need `ws` skip there; item 9's clean-machine gates need
another machine. The test value lived only in the temporary store home.

The server a fixture starts resolves its store from a temporary `$HOME` but runs the runtime with the account's real
home (`scripts/accept/serve-with-store.mjs`): the vendor sky service finds the computer-use helper's socket under
`os.homedir()`, which follows `$HOME`, so a whole `cua serve` under a temporary `$HOME` would find no native helper.

## 3. Through the remote agent on the Mac mini

The mini's checkout was switched to this branch (`17e67c4`) and its launchd job `com.ssfskim.cua.agent` restarted
(`launchctl kickstart -k`); it reconnected to `wss://178-104-102-73.sslip.io/ws`. `cua doctor` there:
`secrets.store pass` (one key before the test), `agent.running`, `agent.enrolled` and `agent.console` pass. The key was
set over `ssh -tt` at the masked prompt in the mini user's real store (`stored CUA_TEST_SECRET in
/Users/new/.config/claude-secrets/CUA_TEST_SECRET (mode 0600)`). A document was opened in TextEdit on the mini
(`open -a TextEdit /tmp/cua66-remote-465d16/cua66-remote-465d16.txt`), then from this MacBook:

```sh
node scripts/accept/remote-secret.mjs --config ~/.config/cua-relay/mini.mcp.json --key CUA_TEST_SECRET \
  --value-file <0600 file> --doc cua66-remote-465d16.txt
```

| Step | Result |
|---|---|
| initialize through the relay (`/d/nuad…/mcp`) | PASS (rmcp 1.5.0, a session id) |
| `secrets_list` | PASS: status ok, the key present (2 keys) |
| bind TextEdit, the document in front | PASS (one app approval, the pinned TextEdit request, accepted for the session) |
| `typeText({{secret:CUA_TEST_SECRET}})` | PASS |
| the document holds exactly the stored value (SHA-256 inside the cell) | PASS, 28 of 28 characters |
| `end_task` | PASS |
| the value in the relay traffic (23 requests and SSE events, raw or base64) | 0 occurrences |

Then `--close-only` closed the document (super+w while it was in front; TextEdit then showed its Open panel). A
`grep -rlF` of the mini's `~/Library/Application Support/cua` (agent log, state, run) for the value: 0 files. After:
the document's directory removed, `cua secrets remove CUA_TEST_SECRET --yes` (the mini's other key untouched, listed by
name only), the checkout back on `main` (`d575d5e`, as found), the job restarted and reconnected.

One misstep: an `osascript` sent over ssh to read TextEdit's front window name hung (an Automation consent prompt is
the likely cause) and was killed after two minutes; nothing was clicked. If a "wants to control TextEdit" dialog is
still on the mini's screen, it should be declined.

## 4. Linux VM `cua-linux`

Ubuntu 24.04.5 arm64, Xorg on `:0`, gedit 46.2 (GTK 3), zenity 4.0.1. This branch extracted to `~/cua-66` (`git
archive`), the VM's installed runtime (`~/.local/share/cua`), the key set over `ssh -tt` at the masked prompt in the VM
user's store.

```sh
DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority node scripts/accept/linux-secret.mjs --key CUA_TEST_SECRET --app zenity
DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority node scripts/accept/linux-secret.mjs --key CUA_TEST_SECRET --app gedit
```

**zenity (`--entry`, PASS):** bound by X11 id; `typeText({{secret:CUA_TEST_SECRET}})` returned (the substituted
`type_text {window, text}`); the window survived; the fixture clicked OK by element index and zenity printed exactly
the stored value (24 of 24 characters, compared in the fixture process, not over MCP); the value in none of the MCP
transcript and stderr; `end_task`, clean exit, `run/` empty. Pressing Return through `pressKey` did not submit the
dialog, so the fixture clicks OK. zenity's entry text is not in its accessibility text, which is why the readback is
zenity's own output.

**gedit (recorded):** the substituted call reached the vendor and failed after the value was read, answered with the
fixed `secret_input_failed` diagnostic (the vendor's error withheld); the gedit window disappeared. A control run with
plain `typeText('hello-ctl')` (no secret) did the same: `D-Bus … NoReply: Message recipient disconnected` and gedit
gone, the Phase F crash in GTK3 text views (issue #51). The secret path behaves exactly like ordinary text there, and
leaks nothing: the value appeared in no MCP traffic or stderr, and a `grep -rlF` of `~/.local/share/cua`, `/tmp` and
`~/.cache` found it in no file. The VM's test key was removed afterwards.

`npm test` on the VM: the counts are in the execution report
(`docs/doperpowers/specs/2026-10-07-file-secrets-execution-report.md`), after two Linux-only fixes found by that run
(util-linux `script` waits for stdin EOF before exiting; two sky tests now use their platform's pinned shape).
