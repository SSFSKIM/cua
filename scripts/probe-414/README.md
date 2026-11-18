# #414 hosted qualification: password typing by length

This is a disposable hosted macOS qualification kit, not product code. It builds unmodified release binaries from two exact product SHAs and uses the corresponding production sky, secret-store, native service and renderer modules. Each of the six stock jobs interleaves the pins in the same owned app/profile. CfT and Safari also run a separate, instrumented copy of the fix solely for the AX schedule gate. Audit rows are never pooled with stock evidence.

```sh
gh workflow run probe-414-qual.yml --ref probe/414-qual \
  -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=full -f secure_poll="$SECURE_POLL_FUNCTION"
```

The registration push has only an Ubuntu registration job. `mode=smoke` runs one trial per cell and one trio per audit lane; it does not qualify a product pin. Swift helpers and apps enforce a GitHub-hosted guard. Chrome for Testing uses the disposable runner HOME and an isolated profile; the engine, fixture and other app processes have isolated temporary homes. No owner data is read.

## Gates

| Gate | Expected full coverage per stock job |
|---|---|
| Primary | 20 per head: five each of empty short concealed, empty long concealed, a concealed replacement of a page/app-selected range, and empty literal. Main must be unconfirmed `secure`; fix must length-confirm. Independently exact app/page content on both heads. |
| Non-BMP | 20 additional concealed trials per head; one non-BMP scalar in otherwise ASCII input. Same confirmation and equality contract as primary. |
| Negative | Ten one-keystroke drops and ten one-character additions on the fix; exact controlled final content witnessed independently and unconfirmed. |
| Known limit (informational) | Five same-length rewrite attempts; report that the app/page contains the wrong content, and the count of length confirmations. Do not gate on their confirmation rate. |
| Privacy | Inspect native replies, forwarded metadata, sky results/errors, rendered action items and the subsequent text observation, and engine stdout/stderr. No field-derived text, masks, length, count or range. Literal `entered` is an allowlisted count of public units posted at the three production metadata positions only; concealed `entered` fails. The old literal `pollMs:0` and `reads:0` are not field measurements. |
| Audit, CfT and Safari | Five pairs each of short vs. long and short vs. literal fix schedules, retaining exact attribute batch names, order and within-request element aliases. Normalize identical repeats only inside the marked secure poll. No `AXValue`, `AXValueDescription`, `AXSelectedText` or parameterized request on the secure alias. Safari can make scoped marker requests on its web area, not on the secure field. |

A length-confirmed outcome requires `confirmed:true`, `secure:true` and `confirmation:'length'` on both raw and forwarded records, and success from sky. A bare confirmation fails. A `notTextField` Firefox refusal with exact delivery is admitted as the documented AX-focus limit, not a confirmation. A selection replacement on AppKit with exact delivery may also be unconfirmed when the provider cannot read the length or selection; this is kept separate from confirmation counts. Empty AppKit successes still require a length confirmation (which the fix can support via caret delta). No field content, count or selection is read by the qualification harness through AX; content is compared locally by the owned app or page and only booleans leave the fixture.

Targets are seeded under the disposable #395 cover after the cover is proved frontmost. The continuous activation witness must hold through input and the independent delivery read. Safari never runs frontmost. Other lanes may use frontmost only when the pre-action empty fixture or witness cannot be established under the cover; the status records where setup failed. A setup-invalid or unrealized perturbation is reported separately, not counted as a product miss and not accepted as coverage. No retry after typing begins.

The workflow uploads only fixed status and an explicitly promoted allowlist of JSON projections. A privacy failure prevents detailed publication. Percentiles use nearest ranks and report snapshot and sky service milliseconds separately. The audit publishes hashes and counts, not raw traces; the in-run comparison uses the ordered normalized trace. No screenshots are taken.

## Hosted runs

Pending first smoke and exact-SHA qualification.
