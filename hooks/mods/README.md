# mods

Function hooks of the cua plugin: one module (`register.tsx`, named by
`hooks/hooks.json` under `modules`; the engine takes one per plugin) that
registers each mod below. The engine
loads it only where `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set and ignores it
elsewhere; the shell hook beside this folder (`cua-approve.sh`) runs everywhere.

The store, `~/.config/claude-secrets/<KEY>` and each project's
`~/.config/claude-secrets/projects/<slug>/<KEY>`, is cua's: the mod writes it, and
since issue #66 the server's `{{secret:…}}` substitution reads it. A
remote client keeps a device's client credential there under the key
`cua remote enroll --json` names (`clientSecretKey`), and registers the device
with the `$(cat …)` command it prints (`clientRegisterCommand`).

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

What a tool prints of a stored value is the secrets guard's (below): `/secret`
itself only masks the value of a `/secret` echo typed where nothing masked it,
in the row the conversation keeps, whichever guard holds the session.

Known limits: characters that arrive together with Enter show in the clear
for the frame before the redraw; an edit inside the bullets (the cursor moved
back) cannot be placed, and clears the field; a value outside printable ASCII
is refused, since the bullets hide a stray input-method character; the mobile
app draws no field.

## secrets guard (`guard/`, devcloud's)

The guard is devcloud's (the doperpowers marketplace's second plugin),
vendored: `guard/VENDORED.md` names the source commit, every adaptation and
the resync. Until 0.14.0 cua had a guard of its own that refused any tool
call naming the store, even one that only wrote its path as text, and also
refused writes, moves and existence checks. devcloud's redacts and never
refuses:

- **What it redacts.** Stored values of both tiers and of every other
  project's tier (`[secret:KEY]`; a global key the project's shadows is
  `[secret:KEY@global]`, another project's `[secret:KEY@<slug>]`), values in
  well-known credential files (`~/.config/gh/hosts.yml`, `~/.codex/auth.json`,
  `~/.pgpass`, gcloud's key files and the like:
  `[secret:hosts.yml:github.com.oauth_token]`), and token-shaped strings
  anywhere (`[redacted:github-pat#…]`). An encoding a command prints a value in
  gets its own handle (`~b64`, `~hex`, `~url` and the like), and a value that
  changed mid-session reads `[superseded:KEY]`.
- **Where.** A tool's result as the model reads it and as the transcript keeps
  it (`toolUseResult`), every row appended to the conversation, an oversized
  output's persisted file, the system prompt's sections, the first message's
  context blocks, each attachment, and a compaction's instructions and summary.
- **Handles restore on write.** A handle in the input of a Write, Edit,
  MultiEdit or NotebookEdit call is restored to its exact bytes before the call
  runs, so a file edited through a handle keeps its secret. In Bash only a
  plain value at a plain position in a plain command is restored; any other
  handle stays as written and the result names a read that works in its place.

**One guard per session.** When devcloud's own plugin is loaded beside cua,
devcloud's guard decides every handle and every hook of cua's copy passes the
event on untouched (`one-guard.tsx`): two guards in sequence would lose the
encoding a handle names, the first collapsing `[secret:KEY~b64]`. devcloud
sets `{ owner: "devcloud", version: 1 }` under
`$.state.get({ plugin: 'devcloud', key: 'secrets-guard' })` when its session
starts (its Interfaces I9), and cua reads it at hook time, so load order does
not matter. Only that exact value stands cua down: no marker, any other value,
or a read that fails leaves cua's guard acting. cua writes no marker of its own.

Known limits: if devcloud is disabled mid-session the engine may keep its
marker (unverified), and cua then stays stood down for the rest of that
session; a new session reads it afresh. The engine lets only devcloud write
its marker, but any plugin with function hooks can answer `state.get` itself,
and so stand cua's guard down; such a plugin already sees every tool result it
hooks. The guard stops accidents, not intent: a command may still transform a
value (a slice, its own encoding) or write it somewhere, since using it is what
the store is for.

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
