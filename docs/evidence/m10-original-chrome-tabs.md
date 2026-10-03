# M10 evidence: the server's own Codex login and the owned-page probe on the original Chrome route

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M10. Branch `feat/chrome-existing-profile`.
macOS 26 arm64, host Node 22.23.2, pinned runtime `26.928.40906-darwin-arm64`, bundled `codex-cli 0.159.2`.

## Part A (2026-10-02/03, executor; no human step)

No `codex login` ran, no credential was read or copied, `CODEX_HOME` was never `~/.codex`, and the live `--with-tabs`
probe did not run. No Chrome, registry, native-messaging or manifest file was written; no process was stopped.

### First real install into the default home

```sh
env -u CUA_HOME node bin/cua.mjs install --archive /Users/new/codex-app-src/_dist/ChatGPT-darwin-arm64-26.928.40906.zip --json
env -u CUA_HOME node bin/cua.mjs doctor --json
env -u CUA_HOME node bin/cua.mjs login --status
```

- Install: `ok: true`, release `26.928.40906-darwin-arm64`, `changed: true`, `source: archive`, root under
  `~/Library/Application Support/cua/runtimes/`. The home and its entries are 0700/0600.
- Doctor: exit 0, `ok: true`. `pass`: platform, runtime.installed, runtime.files, runtime.vendor-manifest,
  runtime.ipc (`CodexComputerUseIPC-5`), runtime.signatures (4 components, team `2DC432GLL2`), helper.live (the
  desktop's existing helper, version 26.929.1001365, reused as-is), secrets.helper. `blocked`: helper.permissions,
  secrets.signing (ad-hoc helper), **codex.login**.
- `codex.login` was first `blocked` with "the owned CODEX_HOME does not exist yet" (nothing was run). The owned
  `state/codex` was then created 0700 (as `cua serve`/`cua login` create it) so the real CLI could be asked once:
  `codex login status` exited 1, mapped to `blocked` "codex login status reports no login; ... run cua login", and
  `cua login --status` exited 1 with "the cua server has no Codex login in its own CODEX_HOME; run `cua login`". The CLI
  left only a `tmp/` directory in the owned home (the per-launch arg0 directory M1 saw).

### M9 regression re-run (once)

```sh
CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-chrome-original.mjs --live --report /tmp/cua-chrome-original-live-m10regress.json
```

7/7 PASS, identical to M9: 2 hosts / 2 sockets, both listed `extension`/`chrome` (`profileName` absent), both `listTabs`
refused `identity-or-auth` "Codex auth token is unavailable", 0 elicitations, cells `listBrowsers, listTabs, listTabs`,
`tabOperations: 0`, teardown confirmed with 0 leftovers, hosts still running. This path still uses an empty scratch
`CODEX_HOME` (removed afterwards); the default home's `state/codex` was untouched by it.

### `--with-tabs` fixtures

```sh
node scripts/probe-chrome-original.mjs --fixtures --report /tmp/cua-chrome-original-fixtures.json   # 11/11 PASS, ~2 s
node --test 'scripts/probe/chrome/original/test/*.test.mjs'                                         # 41/41
npm test                                                                                             # 200/200
```

(The M9 evidence's `node --test scripts/probe/chrome/original/test/` directory form does not resolve on Node 22.23;
the glob form above runs the same files.)

The fixtures drive the real anchor, test page, session, cells, elicitation policy, leftover accounting, judge and
report reduction against `fake-runtime.mjs`, which runs each cell for real against a fake `cua` API seeded with
sentinel user-tab titles/URLs, a token and a host socket path in its error texts:

| Fixture | Shows |
|---|---|
| happy-path | full round trip PASS; own-origin answered `{accept, _meta:{persist:"session"}}`; screenshot hash matches; user tabs reduced to a count |
| decline-foreign | user-tab origin, lookalike host, localhost alias, other port, unknown shape, raw CDP, download, history: all declined on the wire, verdict PASS |
| decline-own-origin-variants | two origins, all-sites grant, URL mode, input-asking form naming the probe origin: declined, verdict BLOCKED |
| unstructured-own-origin | origin only in the message: declined (no text matching), verdict BLOCKED, input withheld, tab still closed |
| leftover-close-fails / still-listed | leftover reported for the user; nothing sent after a failed close |
| create-fails | no tab id guessed, nothing closed, possible new tab reported |
| ambiguous / same-profile / explicit-index | distinct profiles without `--browser-index` BLOCKED; identical tab sets or an explicit index proceed |
| report-sanitization | no sentinel, probe origin or page marker in any case report; the leak guard flags a deliberately leaky report |

## Part B (pending: needs the user's `cua login`)

```sh
node bin/cua.mjs login                      # the user, at a terminal; browser sign-in, once
node bin/cua.mjs login --status             # expect exit 0
CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-chrome-original.mjs --live --with-tabs --report /tmp/cua-chrome-original-tabs.json
```

Two backends are listed today. If they show different tabs (two profiles), the run stops at `target-browser`
BLOCKED before creating anything, and the per-browser user-tab counts in the report are the only way to tell the
profiles apart; rerun with `--browser-index N` for the intended profile.
