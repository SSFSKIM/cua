# #395 – production qualification on hosted macOS

Registered workflow: `probe-395-qual.yml` on `probe/395-qual`. Manual dispatch needs exact full `main` and `fix` engine SHAs from the repository. The registration push runs only a trivial Ubuntu job; all Safari activity is GitHub-hosted macOS. This workflow never edits a pinned product branch.

```sh
gh workflow run probe-395-qual.yml --ref probe/395-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=full
```

## Separate evidence lanes

- **`stock/` is the product qualification.** The two binaries and their sky/native services are built from clean exact checkouts, without the audit patch. Main/fix are interleaved on the same nonce-bound Safari page under the owned cover. Scoring uses the real `type_text` confirmation and independent post-input DOM equality. TypeUnconfirmed is the expected large-page main baseline, not a passing fix outcome. A real password input present from page load is the secure control. Sensitive engine IPC, sky result/render/error and stderr are inspected before saving: never publish raw replies, values, lengths, offsets, marker bytes, or stderr. The stub-marker leak test of ruling 824 belongs to the production branch, not this runner.
- **`audit/` is the schedule comparison only.** Separate disposable copies add recording around the existing AX request and timing boundaries. The recording does not issue AX reads, modify requests or answers, change call order, or change control decisions. Never pool its outcomes or timings with stock or use it in place of a stock privacy result. Emit attribute names and per-call normalized element identities, not marker data, field values, stable provider identities, or secure positions. Compare the ordered pre-input discovery through field classification across literal, short concealed and long concealed. Compare concealed short/long schedules rep by rep after reducing each marked `readbackPoll` to its terminal path and collapsing identical retry iterations. Keep distinct calls and non-poll reads in order; report raw poll counts separately. Full literal-vs-concealed differences after discovery are informational.

**Bounded-walk comparison:** A walk stopped by the 40 ms time cap can be an exact prefix of a longer walk (up to 200 visited nodes) without failing schedule equality. All reads outside the walk must still match. The shorter row must itself show the assembled cap phase immediately before the walk returns, and its clock and role-read count must corroborate the stop. Hash-matched rows cannot borrow another row’s cap proof. The published traces retain timing, counts and hashes, not the full ordered sequence of a long walk; the in-run comparison checks the exact prefix. Any difference before the cap fails on either head. The exception does not excuse a missing required candidate marker pair, post-input marker calls, a wrong confirmation, or any privacy violation.

The [first smoke](https://github.com/SSFSKIM/cua/actions/runs/44305126900) used main `f2c30fc5` and preliminary fix `60327d46`: stock 16/16 strict; zero wrong successes or privacy violations; all four password-from-load results matched the contract. The only audit divergence was main large. The literal walk reached the time cap at 40.136 ms after 173 role/171 child reads; each concealed walk inspected the full 200 nodes (38.357 and 29.217 ms). The baseline-cap treatment above follows that observed difference. This smoke is not full qualification.

The many-tab stress case remains unmeasured. The fixture does not have a reliable hosted way to create and count extra same-window Safari tabs while proving which tab is selected. Adding those controls and a fix-only timing lane was beyond the optional small follow-up; this run does not rule out the shared 200-node/40-ms scope budget being exhausted by a large tab strip.

Each full lane plans 320 scored trials: small and large × literal, short concealed, long concealed and password-from-load × 20 × two heads. For the password control, cover the window while a separate plain setup field is focused, and only then focus the already-password input with the witness armed. Both heads should return `secure` on small; only the fix should return `secure` on large (main is expected to return `noFocusedElement`). Both are unconfirmed and must have no value or range in the reply or rendered surface. `mode=smoke` runs one trial per cell instead of 20. `mode=password-literal` is a separate stock-only delivery diagnostic, with 40 pairs on the large password-from-load field and literal synthetic text instead of a concealed handle. The workflow stages evidence outside the artifact directory and promotes a phase only after its privacy checks and publication attestation pass; it uploads fixed phase status even if evidence is withheld. A foreground or fixture failure is invalid evidence, not a marker miss or a production success. No retries after input begins.

## Full qualification — 2026-11-18

[Run 44308992433](https://github.com/SSFSKIM/cua/actions/runs/44308992433), [attested artifact](https://github.com/SSFSKIM/cua/actions/runs/44308992433/artifacts/14431578308), Safari 27.2 on hosted image `20261102.0473.1`:

- Kit: `1c5484204b196fcfbd7ebff9dc7b0d1754817fe5`
- Main: `f2c30fc511112eadecfa724105e95c0837d4f966`
- Fix: `0e9f4aff55ac7bd04808e0ce99cd7022d353be08`

**The workflow was red on one stock password delivery.** Both lanes completed all 320 trials with zero setup-invalid rows, wrong successes, or privacy violations; both published their attested artifacts. All instrumented audit gates passed. The fix never fell back to the focused-field walk on either page.

| Gate | Main | Fix |
| --- | --- | --- |
| Stock, small ordinary fields | 60/60 confirmed and DOM exact | 60/60 confirmed and DOM exact |
| Stock, large ordinary fields | 60/60 `noFocusedElement`, unconfirmed, DOM exact (baseline) | 60/60 confirmed and DOM exact |
| Stock, password from load | Small 20/20 `secure`; large 20/20 `noFocusedElement`; all unconfirmed, DOM exact 40/40 | Small and large both 20/20 `secure`, unconfirmed; DOM exact 20/20 small, **19/20 large** |
| Stock, strict result | 160/160 | 159/160 |
| Audit, pre-input discovery order (literal, short, long) | Small identical across all 60. Large: 26 distinct sequences across 60, equal up to the proven walk caps below. | Identical across all 60 on each page |
| Audit, short/long whole schedule after poll normalization | Small 20/20 equal; large 4 exact + 16 cap-only pairs | 20/20 equal on each page, no cap exemption |
| Audit, marker route | 0 marker reads in 160 trials | Exactly the same-web-area pre-input `AXSelectedTextMarkerRange` → `AXUIElementForTextMarker` pair in 160/160, including all 80 large; no other marker call, no post-input marker call |
| Audit, password text/range/length reads | Zero in all 40 controls | Zero in all 40 controls |

`stock/fix/large/secure/r03` returned `typeUnconfirmed`, `reason:secure`, `confirmed:false` in the native and forwarded readbacks. The witness held, the same password input remained focused, and input events arrived. The DOM did not match the expected content or caret after 4,036 ms of observation. The interleaved main trial using the same synthetic text was exact, as was the separately instrumented fix trial with its own synthetic text. The stock service call for r03 was the slowest in its cell (760 ms versus 411 ms p95), but its 10.1 ms snapshot was within the cell’s usual range (11.5 ms p95). The stock artifact kept only equality, caret and event booleans; **it cannot say whether r03 was shorter, longer, or reordered, or by how many characters**. The engine made no incorrect confirmation; the single row does not identify what caused the delivery mismatch.

### Walk-cap exemptions

Every row requiring a time-cap exemption in the full run is below, grouped by head and cell. The last column is the subset requiring the exemption in the paired short/long whole-schedule comparison as well. Node-cap rows were longer comparators, not shortened rows; password controls are not in these comparisons.

| Head / page / cell | Pre-input strict-prefix exemptions | Also in paired short/long comparison |
| --- | --- | --- |
| Main / large / literal | r01, r05, r09, r10, r11, r12, r13, r15, r16, r20 | — |
| Main / large / short concealed | r01, r04, r06, r07, r09, r11, r12, r13, r14, r16, r18, r19 | r01, r04, r07, r09, r11, r13, r14, r16, r18, r19 |
| Main / large / long concealed | r02, r03, r04, r05, r06, r12, r13, r17, r19 | r02, r03, r05, r06, r12, r17 |
| Main / small; fix / both pages | None | None |

These 31 main-baseline rows and their 29 ordinary node-cap comparators each have their own matched cap phase, with no AX calls inside or after the cap and the pre-input boundary intact. Every time-cap marker was at least 40.024 ms into its walk. Rows sharing an ordered hash agree on the relevant proof (node-cap rows need 200 role reads, not a minimum wall time). The pinned Swift hook writes the pair immediately before returning; the deferred walk-end timestamp can be later without any intervening AX call. Thus the two fixes in checker `e2ea2b0c` do not change the recorded cap verdict. The exact prefix comparison is the one made in-run; long AX call sequences were hashed, so it cannot be replayed in full from the artifact.

### Latency

Milliseconds, nearest-rank p50 / p95, 80 valid trials per head/page for each column of measurements. The scratch timer is the native walk or complete scoped marker route; stock snapshot is the production pre-input capture, and stock service includes typing and reply processing. They are separate lanes, not pooled.

| Page / head | Native route (scratch) | Snapshot (stock) | `type_text` service (stock) |
| --- | ---: | ---: | ---: |
| Small / main (walk) | 8.497 / 15.543 | 7.3 / 13.5 | 316.5 / 1,150.5 |
| Small / fix (marker) | 8.326 / 13.395 | 7.9 / 16.6 | 316.0 / 1,158.5 |
| Large / main (walk) | 39.832 / 41.101 | 36.1 / 42.2 | 316.4 / 1,158.2 |
| Large / fix (marker) | **8.181 / 13.733** | **7.6 / 15.6** | 324.7 / 1,169.4 |

The large-page native route is about 4.9× faster at the median and 3.0× at p95. This is a discovery improvement, not an end-to-end typing speedup. The audit raw poll attempts differed across some short/long pairs; only repeated polling was normalized.
