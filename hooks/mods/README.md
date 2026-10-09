# mods

Function hooks of the cua plugin: one module (`register.tsx`, named by
`hooks/hooks.json` under `modules`) that registers each mod below. The engine
loads it only where `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set and ignores it
elsewhere; the shell hook beside this folder (`cua-approve.sh`) runs everywhere.

The store, `~/.config/claude-secrets/<KEY>` and each project's
`~/.config/claude-secrets/projects/<slug>/<KEY>`, is cua's: the mod writes it, and
since issue #66 the server's `{{secret:…}}` substitution reads it. A
remote client keeps a device's client credential there under the key
`cua remote enroll --json` names (`clientSecretKey`), and registers the device
with the `$(cat …)` command it prints (`clientRegisterCommand`), the form the
guard below allows.

The mod moved here from the doperpowers plugin on 2026-10-07, so that it is
registered once, by the plugin that owns its store.

## secrets (`secrets.tsx`)

`/secret KEY` stores a secret the model never sees. The command opens a pane
holding one field, focused; each character typed there is kept in the
module's memory and the field is redrawn as bullets, so the value never
passes through the prompt box and neither the prompt history
(`~/.claude/history.jsonl`) nor the transcript can hold it. Enter writes it
to the session's project tier,
`~/.config/claude-secrets/projects/<slug>/KEY` (directories 700, file 600),
on stdin, closes the pane, and appends a note for the model naming the key
and the shell form that reads it,
`"$(cat ~/.config/claude-secrets/projects/<slug>/KEY)"`; Escape closes it with
nothing written. `/secret -g KEY` (or `--global`) writes the global tier,
`~/.config/claude-secrets/KEY`, instead, and so does a device credential
(`CUA_DEVICE_…`), which cua reads from there only. The project is the main
checkout of the git repository around the session's directory (worktrees
share it), else that directory; the slug is its path in Claude Code's
`~/.claude/projects/` form (`-Users-me-repo`). Board #99 has the design.

A system prompt section lists the stored keys of both tiers in later
sessions, whose start reads both folders. In a session in `/Users/me/repo`
holding `API_KEY` in both tiers and `OTHER` globally, it reads:

```
Secrets the person stored, one file each, for this project or for every project (global). You see only their keys; read a value inside the shell command that uses it, never printing it. Where a key is stored in both, use the project's:
- API_KEY (project): "$(cat ~/.config/claude-secrets/projects/-Users-me-repo/API_KEY)"
- API_KEY (global, shadowed by the project's): "$(cat ~/.config/claude-secrets/API_KEY)"
- OTHER (global): "$(cat ~/.config/claude-secrets/OTHER)"
```

`/secret` alone answers the same list on one line.

Not the prompt box: when the last keys and Enter arrive in one read, as over
mosh or a slow link, the editor inserts and submits them before a
`prompt.edit` answer lands, so they reach the history raw (the Mac mini,
2026-10-06; reproduced with `tmux send-keys -l $'op\r'`: the history held
`••••••••op`). The field has no such window: its submit carries the whole
text, read back as the bullets it held plus what arrived since. The box still
masks a value typed there out of habit, and the command refuses it.

A file per key, not the macOS Keychain: a session run under ssh, mosh, a
tmux server one of them started, or `claude daemon` finds the login keychain
locked and cannot raise its unlock dialog (`User interaction is not
allowed`), for the store and for the model's read alike. The files are
encrypted at rest only as the disk is.

The model never needs to read the store, so a tool call that would is
refused before it runs: a command naming `~/.config/claude-secrets` (the
projects' folders beneath it included) other than in the form
`$(cat ~/.config/claude-secrets/KEY)` or
`$(cat ~/.config/claude-secrets/projects/<slug>/KEY)`, which substitutes the
value where it is used, and a file tool whose path (a Glob's pattern) points
into the folder. What a Write or an Edit puts in a file, or what a Grep searches
for, is not a read. In a live session the model, asked to `cat` a stored
value, declined on the system prompt section alone, and its diagnostic `ls`
and `wc` of the file were refused.

A stored value that turns up anyway, a tool printing it, is replaced by
`[secret:KEY]`, in its own spelling and in the encodings a command prints it
in by accident (base64 with or without padding, hex in either case, URL
encoding), twice over: in the tool's record at `tool.call` (the transcript
file keeps that record as `toolUseResult`, beside the row the model reads, and
`session.append` cannot reach it) and in every row at `session.append`, which
also masks the value of a `/secret` echo typed where nothing masked it.

Known limits: characters that arrive together with Enter show in the clear
for the frame before the redraw; an edit inside the bullets (the cursor moved
back) cannot be placed, and clears the field; a value outside printable ASCII
is refused, since the bullets hide a stray input-method character; the mobile
app draws no field; values under six characters are not scrubbed, which would
strike ordinary words. The guard stops accidents, not intent: a command may
still transform a substituted value (a slice, another encoding) or write it
somewhere, since using it is what the store is for.

## Developing

```
claude --plugin-dir . --debug                        # the repo as the plugin, hot reload on save
claude plugin validate .claude-plugin/plugin.json    # what the module hooks and calls
npm run test:mods                                    # the mods' tests (tests/mods/run-mods-tests.sh)
npx -p typescript@5 tsc -p hooks/mods/tsconfig.json
```

Typechecking reads `.claude/types/claude-code.d.ts` at the repo root, which
`/plugin-types` writes (gitignored); regenerate it after a Claude Code update.
A tree the engine refuses draws the engine's own component instead and the
reason is in the debug log under `ui.render (<Component>)`.
