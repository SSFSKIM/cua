# #395 – production qualification on hosted macOS

Registered workflow: `probe-395-qual.yml` on `probe/395-qual`. Manual dispatch needs exact full `main` and `fix` engine SHAs from the repository. The registration push runs only a trivial Ubuntu job; all Safari activity is GitHub-hosted macOS. This workflow never edits a pinned product branch.

```sh
gh workflow run probe-395-qual.yml --ref probe/395-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA"
```

## Separate evidence lanes

- **`stock/` is the product qualification.** The two binaries and their sky/native services are built from clean exact checkouts, without the audit patch. Main/fix are interleaved on the same nonce-bound Safari page under the owned cover. Scoring uses the real `type_text` confirmation and independent post-input DOM equality. TypeUnconfirmed is the expected large-page main baseline, not a passing fix outcome. A real password input present from page load is the secure control. Sensitive engine IPC, sky result/render/error and stderr are inspected before saving: never publish raw replies, values, lengths, offsets, marker bytes, or stderr. The stub-marker leak test of ruling 824 belongs to the production branch, not this runner.
- **`audit/` is the schedule comparison only.** Separate disposable copies add recording around the existing AX request and timing boundaries. The recording does not issue AX reads, modify requests or answers, change call order, or change control decisions. Never pool its outcomes or timings with stock or use it in place of a stock privacy result. Emit attribute names and per-call normalized element identities, not marker data, field values, stable provider identities, or secure positions. Compare the ordered pre-input discovery through field classification across literal, short concealed and long concealed. Compare complete concealed short/long control schedules after collapsing repeated poll cycles, reporting raw counts for diagnosis; full literal-vs-concealed differences after discovery are informational.

Each lane plans 320 scored trials: small and large × literal, short concealed, long concealed and password-from-load × 20 × two heads. For the password control, cover the window while a separate plain setup field is focused, and only then focus the already-password input with the witness armed. Both heads should return `secure` on small; only the fix should return `secure` on large (main is expected to return `noFocusedElement`). Both are unconfirmed and must have no value or range in the reply or rendered surface. The artifact allowlist includes only scrubbed rows/coverage/provenance and summaries. A foreground or fixture failure is invalid evidence, not a marker miss or a production success. No retries after input begins.
