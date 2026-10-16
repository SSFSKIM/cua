# Diagnostic: selection lane stops at row 4 (invalid override), recordings at e24a1cd/d49e6da

```sh
node scripts/repl-parity/selection.mjs --device mini --node22 /Users/new/.nvm/versions/node/v22.18.0/bin/node --out <this dir>
```

Run 2026-10-16 16:48–16:49 UTC from the repl-parity preparation at 8a134ab (mini; selection homes created and removed by
the lane under `~/.local/share/cua-parity-selection`, empty afterwards). Rows 1–3 (darwin, no registration, browser only,
ordinary lane, override unset/cua/vendor, managed Node) passed. Row 4, override `invalid` (`CUA_REPL_HOST=invalid`), failed:
doctor's `repl.host` row is `fail` with `refused (invalid_repl_host): CUA_REPL_HOST must be cua or vendor`, as the
independent table expects, but the real call's refusal is `invalid_setting`, not `invalid_repl_host`.

Reproduced by hand on the mini in the prepared scratch environment (`CUA_REPL_HOST=bogus`, browser only):
- `node scripts/repl-parity/selection-serve.mjs` → `{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"invalid_setting"}}`
- `node bin/cua.mjs serve` → `cua: CUA_REPL_HOST must be cua or vendor [invalid_setting]`

Both refuse before launch, so doctor and the real call agree on refusal and its sentence; they differ in the error code
(`settingsFrom` at serve start uses `invalid_setting`; doctor uses `invalid_repl_host`). The lane stops at its first
failed assertion, so rows 5–260 were not evaluated in this run.
