# Mini nativePipe re-check after M4's nativePipe and lifeline changes (#116, 2026-10-15)

**Why.** M4 task 3 changed the supervisor's nativePipe relay (`src/repl-host/native-pipe.mjs`):
- OS errors now read as the vendor's Rust host displays them, with the platform C library's strerror.
- A read-side reset now closes with its error.

Its follow-up also gave every kernel and trusted worker a lifeline (`src/repl-host/lifeline.mjs`). The claim to check: macOS behaviour is unchanged, and in particular a write into a pipe the peer left stays close-only.

**Result.** At `cbb64c1` (head after both changes), browser-only, profile `ssfs`, in the mini's parity clone:
- `cua/` (own host) and `vendor/` (vendor host), the M2 services suite, recorded back to back: 41 cases, 74 cells each, complete, every assertion PASS.
- Own-host attestation: all 42 own connections attest `cua-repl-host 0.4.0` with the marker.
- `vendor-cua-diff.json` (`diff vendor cua --expected test/repl-parity/expected-differences.json`): **0 differences**. The 73 expected entries are all identity slots.
- `m2-vendor-1-cua-diff.json`, against the committed M2 control as the controller asked:
  - The 3 entries reported are all on `cells/native-pipe/connect-timeout` (two cells and the assertion row).
  - Each differs only by the row annotation `proof: "live-unreachable: non-blocking connect"`. M4 task 1's oracle adds that annotation to that case's rows; M2's recording predates it.
  - Content, isError and meta are identical, and every other case and cell matches.
  - The same-sitting pair above is therefore the like-for-like comparison.
- The five nativePipe cases on the own host are unchanged from M2:
  - The live abort is close-only (`events: ["close"]`, `message: null`), as the vendor reports on macOS.
  - The saturated listener is refused at once.
  - The frozen interface and base64 correlation are as before.

**What this does not reach.** No services case puts a stat or connect failure's text into a recorded result on macOS:
- `connect-timeout` records the observation class, not the sentence, on Darwin.
- The new strerror tables are therefore proven by `test/repl-host/native-pipe.test.mjs`, which uses a real symbolic-link loop through the relay and the Darwin table checked against `os.strerror` on macOS 15, plus the Linux live sentences (`os error 11`, `os error 104`).
- A live stat/connect-error case for both hosts would be a new oracle row. It is proposed for M5, not added here: adding it now would change the case set of every committed M4 run.

`at-c3f2f26/` keeps the first re-check, recorded before the strerror and lifeline changes: the same suite and pair, 0 differences same-sitting, and the same 3 annotation-only entries against `m2/vendor-1`.

Commands (this worktree):
```
node scripts/repl-parity.mjs prepare --device mini --commit cbb64c15d9d96fd9e4f968b393e2463e7b8d572d --profile ssfs --node /Users/new/.nvm/versions/node/v24.18.0/bin/node
node scripts/repl-parity.mjs run --host cua --device mini --suite services --out m4/mini-nativepipe-recheck/cua
node scripts/repl-parity.mjs run --host vendor --device mini --suite services --out m4/mini-nativepipe-recheck/vendor
node scripts/repl-parity.mjs diff m4/mini-nativepipe-recheck/vendor m4/mini-nativepipe-recheck/cua --expected test/repl-parity/expected-differences.json
node scripts/repl-parity.mjs diff m2/vendor-1 m4/mini-nativepipe-recheck/cua --expected test/repl-parity/expected-differences.json
```
