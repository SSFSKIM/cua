# #395: hosted macOS evidence for background Safari's text-marker route

There are two kits. Both ran only on GitHub-hosted macOS with Safari 27.2, and every engine under test was built from a clean checkout of an exact SHA.

- **Discovery:** what WebKit's marker calls answer, measured before any product code existed. The kit is on `probe/395-marker`, with its README at `scripts/probe-395/README-findings.md` (`7b4137b0bbf6b3ed9d3c416098bbb2a14426c852`). [Run 44297805982](https://github.com/SSFSKIM/cua/actions/runs/44297805982) passed 462/462 scored trials: every one of the 18 page × field × length cells was 20/20, with 0 wrong targets and 0 privacy violations.
  - **Large pages:** on a 1,600-node page, the marker route found the focused field 180/180, and #354's bounded walk 0/180.
  - **What the marker holds:** the start marker is 28 bytes and holds the caret's character offset as a plain little-endian 32-bit word.
  - **Password fields:** WebKit does not suppress the route for them. All 132 secure rows resolved as `AXStaticText → AXParent → AXTextField/AXSecureTextField`, with the caret at its true position.
  - **The string call:** `AXStringForTextMarkerRange` on a password selection returns mask glyphs at the exact selection length, so the product never makes that call.
  - These facts are why the route treats the marker as opaque (ruling 1ea561bc:824).
- **Qualification:** the real `type_text` of main against the fix. The kit is on `probe/395-qual`, with its README at `scripts/probe-395-qual/README.md` (`2a8f26378ddeb8bc0f65417658e04ce2f71afac5`). Its scoring method and its full-qualification section are reproduced below.

The qualified fix pin is `0e9f4aff`. This PR's head differs from it only by this evidence file.

## How the qualification scores

- **`stock/` is the product qualification.**
  - The two binaries and their sky/native services are built from clean exact checkouts, without the audit patch.
  - Main and fix are interleaved on the same nonce-bound Safari page under the owned cover.
  - Scoring uses the real `type_text` confirmation and an independent post-input DOM equality check. On large pages, `typeUnconfirmed` is main's expected baseline, not a passing fix outcome.
  - A real password input present from page load is the secure control.
  - Engine IPC, the sky result, render and error text, and stderr are inspected before anything is saved. Raw replies, values, lengths, offsets, marker bytes and stderr are never published.
  - The stub-marker leak test of ruling 824 belongs to the production branch, not this runner.
- **`audit/` is the schedule comparison only.**
  - Separate disposable copies add recording around the existing AX request and timing boundaries. The recording issues no AX reads, modifies no requests or answers, and changes neither call order nor control decisions.
  - Its outcomes and timings are never pooled with stock's, and it never stands in for a stock privacy result.
  - It emits attribute names and per-call normalized element identities. It never emits marker data, field values, stable provider identities or secure positions.
  - **Pre-input discovery:** the ordered reads, through field classification, are compared across literal, short concealed and long concealed text.
  - **Concealed short against long:** these schedules are compared rep by rep. Each marked `readbackPoll` is first reduced to its terminal path and identical retry iterations are collapsed. Distinct calls and non-poll reads stay in order; raw poll counts are reported separately.
  - Literal-vs-concealed differences after discovery are informational.

**The bounded-walk exception.** A walk stopped by the 40 ms time cap can be an exact prefix of a longer walk (up to 200 visited nodes) without failing schedule equality. Conditions:
- All reads outside the walk must still match.
- The shorter row must itself show the assembled cap phase immediately before the walk returns. Its clock and role-read count must corroborate the stop.
- Hash-matched rows cannot borrow another row's cap proof.
- The published traces keep timing, counts and hashes, not the full ordered sequence of a long walk. The exact-prefix check is made in-run.
- Any difference before the cap fails, on either head.
- The exception never excuses a missing required candidate marker pair, a post-input marker call, a wrong confirmation, or any privacy violation.

**The cells.** Each full lane plans 320 scored trials: small and large pages × literal, short concealed, long concealed and password-from-load × 20 trials × two heads.
- **The password control:** the window is covered while a separate plain setup field is focused. Only then, with the witness armed, is the already-password input focused.
- **Expected password answers:** both heads should return `secure` on the small page. Only the fix should return `secure` on the large page; main is expected to return `noFocusedElement` there. Both answers are unconfirmed, with no value or range in the reply or the rendered surface.
- **`mode=password-literal`:** a separate stock-only delivery diagnostic. It runs 40 pairs on the large password-from-load field, with literal synthetic text in place of a concealed handle.
- **Publication:** the workflow stages evidence outside the artifact directory. A phase is promoted only after its privacy checks and publication attestation pass, and fixed phase status is uploaded even when evidence is withheld.
- **Invalid evidence:** a foreground or fixture failure is invalid, never counted as a marker miss or a production success. Nothing is retried after input begins.

## Full qualification — 2026-11-18

[Run 44308992433](https://github.com/SSFSKIM/cua/actions/runs/44308992433) ([attested artifact](https://github.com/SSFSKIM/cua/actions/runs/44308992433/artifacts/14431578308)), Safari 27.2 on hosted image `20261102.0473.1`:

- Kit: `1c5484204b196fcfbd7ebff9dc7b0d1754817fe5`
- Main: `f2c30fc511112eadecfa724105e95c0837d4f966`
- Fix: `0e9f4aff55ac7bd04808e0ce99cd7022d353be08`

**The workflow was red on one stock password delivery.** Both lanes completed all 320 trials, and both published their attested artifacts. There were zero setup-invalid rows, wrong successes or privacy violations. All instrumented audit gates passed, and the fix never fell back to the focused-field walk on either page.

| Gate | Main | Fix |
| --- | --- | --- |
| Stock, small ordinary fields | 60/60 confirmed and DOM exact | 60/60 confirmed and DOM exact |
| Stock, large ordinary fields | 60/60 `noFocusedElement`, unconfirmed, DOM exact (baseline) | 60/60 confirmed and DOM exact |
| Stock, password from load | Small 20/20 `secure`; large 20/20 `noFocusedElement`; all unconfirmed, DOM exact 40/40 | Small and large both 20/20 `secure`, unconfirmed; DOM exact 20/20 small, **19/20 large** |
| Stock, strict result | 160/160 | 159/160 |
| Audit, pre-input discovery order (literal, short, long) | Small: identical across all 60. Large: 26 distinct sequences across 60, equal up to the proven walk caps below | Identical across all 60 on each page |
| Audit, short/long whole schedule after poll normalization | Small 20/20 equal; large 4 exact and 16 cap-only pairs | 20/20 equal on each page, no cap exemption |
| Audit, marker route | 0 marker reads in 160 trials | 160/160 (all 80 large included): exactly one pre-input pair on the same web area, `AXSelectedTextMarkerRange` → `AXUIElementForTextMarker`. No other marker call and no post-input marker call |
| Audit, password text, range and length reads | Zero in all 40 controls | Zero in all 40 controls |

**The one red row, `stock/fix/large/secure/r03`:**
- Its native and forwarded readbacks both returned `typeUnconfirmed`, `reason:secure`, `confirmed:false`, so the engine made no incorrect confirmation.
- The witness held, the same password input stayed focused, and input events arrived. Yet after 4,036 ms of observation, the DOM's content and caret did not match the expected ones.
- The interleaved main trial with the same synthetic text was exact. So was the separately instrumented fix trial with its own synthetic text.
- Its stock service call was the slowest in its cell (760 ms, against a 411 ms p95). Its 10.1 ms snapshot was within the cell's usual range (11.5 ms p95).
- The stock artifact kept only equality, caret and event booleans, so **it cannot say whether r03 was shorter, longer or reordered, or by how many characters**. The single row does not identify what caused the mismatch.

### Walk-cap exemptions

Every row in the full run that needed a time-cap exemption is listed below, by head and cell. The last column is the subset that needed the exemption in the paired short/long whole-schedule comparison too. Node-cap rows were the longer comparators, not shortened rows. Password controls are not in these comparisons.

| Head / page / cell | Pre-input strict-prefix exemptions | Also in paired short/long comparison |
| --- | --- | --- |
| Main / large / literal | r01, r05, r09, r10, r11, r12, r13, r15, r16, r20 | — |
| Main / large / short concealed | r01, r04, r06, r07, r09, r11, r12, r13, r14, r16, r18, r19 | r01, r04, r07, r09, r11, r13, r14, r16, r18, r19 |
| Main / large / long concealed | r02, r03, r04, r05, r06, r12, r13, r17, r19 | r02, r03, r05, r06, r12, r17 |
| Main / small; fix / both pages | None | None |

**How the 31 exemptions were proven:**
- These 31 main-baseline rows and their 29 ordinary node-cap comparators each have their own matched cap phase. No AX call falls inside or after the cap, and the pre-input boundary is intact.
- Every time-cap marker was at least 40.024 ms into its walk.
- Rows that share an ordered hash agree on the proof that matters for their cap. A node-cap row needs 200 role reads, not a minimum wall time.
- The pinned Swift hook writes the pair just before the walk returns. The deferred walk-end timestamp can be later, with no AX call in between.
- So checker `e2ea2b0c`'s two fixes don't change the recorded cap verdict.
- The exact-prefix comparison is the one made in-run. Long AX call sequences were hashed, so it cannot be replayed in full from the artifact.

### Latency

All values are milliseconds, nearest-rank p50 / p95, from 80 valid trials per head and page in each column.
- **Native route (scratch):** the walk, or the complete scoped marker route.
- **Snapshot (stock):** the production pre-input capture.
- **`type_text` service (stock):** also includes typing and reply processing.

These are separate lanes, never pooled.

| Page / head | Native route (scratch) | Snapshot (stock) | `type_text` service (stock) |
| --- | ---: | ---: | ---: |
| Small / main (walk) | 8.497 / 15.543 | 7.3 / 13.5 | 316.5 / 1,150.5 |
| Small / fix (marker) | 8.326 / 13.395 | 7.9 / 16.6 | 316.0 / 1,158.5 |
| Large / main (walk) | 39.832 / 41.101 | 36.1 / 42.2 | 316.4 / 1,158.2 |
| Large / fix (marker) | **8.181 / 13.733** | **7.6 / 15.6** | 324.7 / 1,169.4 |

On the large page the native route is about 4.9× faster at the median and 3.0× faster at p95. That speeds up finding the field, not typing end to end. In the audit, raw poll attempts differed across some short/long pairs; only repeated polling was normalized.

### Targeted password delivery rerun

[Run 44322575578](https://github.com/SSFSKIM/cua/actions/runs/44322575578) passed ([attested artifact](https://github.com/SSFSKIM/cua/actions/runs/44322575578/artifacts/14437175723)).
- **Setup:** kit `b7989f278fb08e1c9cd0a9a23db0584f6567524c`, the same two stock engine pins as above, and Safari 27.2 on hosted image `20261112.0504.1`.
- **Trials:** 40 interleaved pairs, all on the large password-from-load fixture, with each head going first 20 times.
- **Text:** literal synthetic text. The keyed route was verified on all 80 trials; secret substitution was not repeated.
- **Publication:** only a browser-side mismatch category and a signed UTF-16 size delta would be published, never the value, its absolute size or a position.

| Head | Exact DOM and caret with input events | Native and forwarded reply | Wrong successes / privacy violations |
| --- | ---: | --- | ---: |
| Main | 40/40 | 40/40 unconfirmed, `noFocusedElement` | 0 / 0 |
| Fix | 40/40 | 40/40 unconfirmed, `secure` | 0 / 0 |

All 80 trials were witnessed and valid, with no delivery mismatch on either head. **The original r03 is treated as a background Safari delivery flake:** it did not recur in the targeted keyed test, so there is no reproduced fix-only delivery problem. This does not prove the marker route has no effect on delivery, and it does not turn the original 319/320 stock gate green after the fact.

## Not measured

**Many tabs.** A Safari window with many tabs was not tested. The fixture has no reliable hosted way to create and count extra same-window tabs while proving which tab is selected. So these runs don't rule out a large tab strip using up the shared 200-node / 40 ms web-area search budget. If it does, type_text falls back to #354's walk and answers `noFocusedElement` on a large page. It never makes a wrong confirmation.
