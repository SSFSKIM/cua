# Seatbelt golden fixtures (#115)

What the original `codex sandbox` (openai/codex rust-v0.159.2, `ff6aec96948b70d94983af2641a6b67c94faeff5`, Apache-2.0) hands `/usr/bin/sandbox-exec` for each input below, rendered by the original's own crates. cua's seatbelt port (`src/sandbox/seatbelt.mjs`, M1) must reproduce `output` byte for byte. Written by `scripts/sandbox-golden/generate.sh` on a Mac; never edit one by hand.

One file per case (the matrix is `scripts/sandbox-golden/cases.mjs`):

- `setup`: what exists under the scratch root before rendering: `{dir}`, `{file, content}`, `{symlink, target}`, paths relative to the root. The original looks at the filesystem (carve-out names present, symlinks, a gitdir pointer), so a test recreates exactly this.
- `tmpdir`: the TMPDIR the generator ran with (`null`: unset). `:tmpdir` resolves against it.
- `input`: `{cwd, profile, command, env}`. `profile` is the original's permission-profile JSON with entries in cua's `-c` table order; `env` is the launcher's environment.
- `output`: `argsSymbolic` (the tag's TIOCSTI line, what the signed CLI emits), `argsNumeric` (the numeric TIOCSTI form cua emits, upstream f817e16905), both starting at `-p`; `env`, the child's environment (the original's strip list applied, `CODEX_SANDBOX=seatbelt`, and `CODEX_SANDBOX_NETWORK_DISABLED=1` with the network restricted). Or `error`: the original's refusal.

Placeholders, in every string of `setup`, `input` and `output`:

- `@ROOT@`: the scratch root's real path (it contains no regex metacharacter, so the original's regex-escaped spelling of a path under it contains it verbatim);
- `@VAR_ROOT@`: the same root spelled through macOS's `/var` alias (only for roots under `/private/var`, which `os.tmpdir()` always is on macOS);
- `@EUID@`: the effective uid in `/private/tmp/codex-daemon-<euid>`.

Not covered, by design: what the CLI adds beyond the original's renderer (its config stack, `$CODEX_HOME/.env`, the arg0 `PATH` entry, the helper readable roots its config adds), which cua's port leaves out (spec, "Deviations from the original"); `scripts/sandbox-probe` measures those against the signed binary.
