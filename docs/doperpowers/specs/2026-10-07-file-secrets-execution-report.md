# Execution report: the plain-file secret store (issue #66, M14)

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md` (Decision Log 2026-10-07, M14, Surprises, Outcomes).
Branch `feat/file-secrets` from `main` at `f719b54`, `main` (`e607f2c`, the plugin bundle) merged in at `f3bf8d0`.
Evidence: `docs/evidence/2026-10-07-file-secrets-acceptance.md`.

## What was built

- `src/secrets/store.mjs` (new): the store `$HOME/.config/claude-secrets/<KEY>` behind the existing `secrets.read(label)`
  seam. `read` opens with `O_NOFOLLOW|O_NONBLOCK`, checks the open descriptor (regular file, owned by the effective
  user, mode exactly 0600), bounds the size (256 KiB), decodes UTF-8 fatally, drops exactly one trailing newline, and
  refuses an empty value; every refusal is a `SecretStoreError` with a fixed sentence naming at most the key and its
  file. `list` (regular files following the key grammar), `write` (0700 directory, new 0600 file renamed over the
  target), `remove`, `connectionSecrets` for `cua serve`.
- `src/secrets/label.mjs`: the mod's key grammar `[A-Za-z_][A-Za-z0-9_]*`. `reference.mjs` unchanged in shape.
- `src/secrets/commands.mjs`: `cua secrets set <KEY>` at a raw-mode masked prompt (no echo, typed twice, Ctrl-C/Escape
  cancel, refused without a terminal, hint naming `/secret KEY`), `list [--json]`, `remove <KEY> [--yes]` (y/N at the
  terminal). `src/secrets/check.mjs` (new): doctor's `secrets.store` from metadata only.
- Launch and services: the launcher passes `CUA_SECRETS_DIR` (or `CUA_SECRETS_UNAVAILABLE=secrets_disabled`);
  `src/services/secret-input.mjs` builds the reader from it and maps store refusals to `secret_*` codes;
  `src/services/sky.mjs` pins shapes per platform and adds Linux `type_text {window, text}` (the window a plain object
  of primitives with a positive integer id, measured on the VM). `secrets_unsupported_platform` is gone.
- Removed: `native/keychain`, `src/secrets/{broker,client,helper}.mjs`, `scripts/{build,test}-helper.mjs`, the three npm
  scripts and package `files` entries, the broker teardown in `server.mjs`/`connection.mjs`, the `secrets.helper` and
  `secrets.signing` rows, the run directory's broker-socket ownership (a legacy socket is still swept).
- Host notes: one rule, "Never read ~/.config/claude-secrets; type secrets as {{secret:KEY}}.", fitted into the
  2,048-character budget by tightening five existing lines (2,045 macOS / 2,047 Linux with both surfaces).
  `secrets_list`'s description names `/secret KEY` and, on Linux, drops `setValue`.
- Acceptance tooling: `accept-native --live-secrets` (renamed from `--live-keychain`, plus `--secret-key`/
  `--secret-home`), `scripts/accept/secret-seed.mjs` (pty-driven `cua secrets set` in a temporary home; BSD `script` on
  macOS, Python `pty.spawn` on Linux), `scripts/accept/serve-with-store.mjs`, TextEdit readback by digest inside the
  cell, `scripts/accept/linux-secret.mjs`, `scripts/accept/remote-secret.mjs` (Streamable HTTP client through the
  relay), `probe-secrets.mjs` against the store.
- Docs: README (Secrets, plugin, Linux, acceptance, configuration), `CLAUDE.md`, `docs/onboarding-new-mac.md`,
  `hooks/mods/README.md` (one tense), `tech-debt-tracker.md` (helper-suite debt obsolete; two new entries).

## Decisions taken in execution (all in the spec's Decision Log or Surprises)

- **No sandbox read-deny.** Measured that node_repl's managed profile can deny a root (`"access":"none"`), but the same
  profile governs the trusted worker, whose read failed `EPERM` too. Adding the deny would have disabled substitution
  under `scoped`; reading outside the sandbox would need the broker this issue removes. Documented instead (README,
  host notes). The dispatching session confirmed this resolution.
- **Store path from the server's `$HOME`, passed explicitly** to the trusted worker (`CUA_SECRETS_DIR`), not re-derived
  inside it.
- **Fixtures split the two homes.** The vendor sky service finds the native socket under `os.homedir()`, so a scratch
  store home cannot be the server's whole `$HOME` on macOS; `serve-with-store.mjs` resolves the store from the scratch
  home and launches the runtime with the account's home. Test-only; production is unchanged.
- **Empty values refused** (review P3): a truncated file must not type nothing and report success.

## Acceptance (per item)

1. `npm test`: macOS 701 tests, 700 pass, 1 Linux-only skip, 0 fail before the merge (after the merge and fix wave: see the last
   section). VM (arm64, `node_modules` copied in): 701 tests, 663 pass, 38 darwin-only skips, 0 fail, before the merge.
2. macOS local: PASS (`accept-native --live-secrets --live-textedit --secret-key CUA_TEST_SECRET --secret-home <tmp>`,
   temporary `CUA_HOME` `/tmp/cua-66-home`; TextEdit readback exact by SHA-256 in the cell; probe-secrets 34/34).
3. Mini through the relay: PASS (`scripts/accept/remote-secret.mjs` with `~/.config/cua-relay/mini.mcp.json`; key set
   over `ssh -tt` in the mini's real store and removed after; the mini's checkout returned to `main` `d575d5e` and the
   agent restarted).
4. Linux VM: zenity PASS (exact value through zenity's own output); gedit crashes under the substituted `type_text`
   exactly as under plain `typeText` (issue #51), recorded; no value in any stream or file.

## Environmental friction routed around

- The doperpowers secrets mod's guard refuses Bash commands whose text names the store directory next to a read; docs
  were written with the Edit/Write tools instead.
- `accept-native` reads BLOCKED on a healthy run for reasons that predate this change (tech-debt entry).
- An `osascript` sent to the mini over ssh to read TextEdit's front window hung (likely an Automation consent prompt);
  it was killed after two minutes and nothing was clicked. The dispatching session will check the mini's screen.
- util-linux `script` hung in about half of a dozen parallel runs; the Linux pty is Python's `pty.spawn`.

## Review

Whole-branch review of `f719b54..9d048e3` (opus, the reviewer-high rubric): verdict correct; findings P2 (the `/secret`
mod moved into this repo on `main` while the branch was open: stale "doperpowers mod" wording, and main's README
helper paragraph to drop on merge) and four P3s (empty value, short-value leak fingerprints in two fixtures, C5's
doctor health counting `secrets.store`, the README's `secrets_list` wording). The P2 was resolved by merging `main`
and rewording; the P3s by one fix wave.

## Final state

Fix wave `3a86290`: empty values refused (`secret_empty`), a shared `fingerprintable` rule for the fixtures' leak scans
(`scripts/probe/leak-scan.mjs`), `secrets.store` informational in every acceptance doctor-health row, the README's
`secrets_list` wording. After it: `npm test` on macOS 705 tests, 704 pass, 1 Linux-only skip, 0 fail; on the VM
(arm64) 705 tests, 667 pass, 38 darwin-only skips, 0 fail. `bash tests/mods/run-mods-tests.sh` 20/20 after the merge.
The live runs above were made before the merge and the fix wave; neither changed the substitution path except the
empty-value refusal, which is covered by the unit suites.

Cleanup: the VM's and the mini's test keys removed; the local temporary store home removed; the mini's checkout back
on `main` with its agent reconnected; the scratch `CUA_HOME` `/tmp/cua-66-home` left for inspection (delete at will).
