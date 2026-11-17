# #390 hosted qualification kit

Probe-only branch `probe/390-qual`, forked from `probe/366-measure` at `fc3b8495`.
No product edits, engine patches, forced routes, native probe gates, owner profiles or owner secrets.
The workflow pins both engine commits and builds each in a separate scratch worktree.
The final fix pin is `e417be4a2dd5b49f778b6705c4de2472afb7c4dd`; main is `290303c131c20e4dc88001b8b970d03785ec0b1d`. Both the fix re-review and the kit's closing medium review were clean before registration. Full qualification follows smoke inspection.

## Predeclared cells

Each browser job uses one owned fixture process/profile. Each action gets a fresh engine and temporary HOME; both heads alternate first/second order by repetition. The page is reset empty with the button (not the field) focused while foreground, then put behind a full-display owned cover for every background cell. A real background observation yields the ordinary element token. A failed precondition dispatches no action; failed setup is retained, never retried. There is no engine observation or action between that observation and the measured set_value except the measured set_value itself.

| Browser | Cell | Full reps per head | Required result |
|---|---|---:|---|
| CfT, default Electron, MAWS-chrome-parity Electron | background distinct value | 20 | Fix: ok, DOM and React exact match, `unfocusedValue.confirmed` with positive read count; main: backgroundClickRefused and empty values |
| Same | synchronous uppercase-on-input guard | 5 | Fix: valueUnconfirmed and mismatch read-back, DOM/React transformed; main: refused and empty |
| Same | >12,000-character value | 5 | Fix: valueUnconfirmed and `possiblyTruncated`, DOM/React full value; capped AX prefix must not confirm; main: refused and empty |
| Same | exactly 10,000-character value (unique random prefix, padded); the fixture synchronously appends a suffix on input | 5 | Fix: valueUnconfirmed, never ok; final DOM/React are exactly the request plus the suffix; `unfocusedValue.result` must be `possiblyTruncated` with positive reads (as for every value of 10,000 characters or more); main: refused and empty |
| Same | placeholder secret | 5 | Fix: valueUnconfirmed, concealed with zero read-back reads, DOM/React value delivered; main: refused and empty |
| Same | foreground ordinary value | 5 | Both: ok and exact DOM/React delivery |
| Safari | background, foreground ordinary value | 5 each | Both: ok and exact DOM/React delivery |

Smoke runs one repetition of each cell/head (40 actions). Full has 290 actions (90 per Chromium-family fixture and 20 Safari controls).

The controlled React field judges DOM and React independently. Uppercasing is synchronous in its input handler. Every row retains the engine answer/meta, RPC interval, DOM/React checkpoints at 0/50/250/1000 ms after RPC, focus/blur/pointer/key/input traces, and native frontmost/order snapshots. The checkpoint set must be exactly 0/50/250/1000 ms, each once, and every checkpoint must carry the row's page id, performance time origin and trial; otherwise the row is ineligible. An `ok` reply must match the requested DOM and React value at every checkpoint, so an early disagreement that converges by 1000 ms is a false ok; final delivery is still reported as its own metric. Error answers (deliberately unconfirmed secrets, guards) may see delivery arrive after the first sample. Baseline refused cells must be empty at every checkpoint. Each distinct requested value is unique across rows. The long-value guard records the complete test value in artifacts, not a length-derived equality shortcut.

The secret comes from a random test value written mode 0600 under that trial's temporary HOME. The matching engine pin's **production sky wrapper and file-store reader** expand `{{secret:PROBE390_VALUE}}`; a narrow adapter maps the resulting substituted request and its concealed flag to the native token. This exercises production substitution and native input/read-back, not the entire REPL/service's error rewriting. Evidence records that substitution matched and concealed=true, and replaces the test value with `[TEST_SECRET]` before persistence. Temporary homes and profiles are removed and excluded from uploads. The read count proves only this route's read-back count; absence of other native reads requires source review, not this metadata alone.

Native state is polled every 10 ms during the action RPC, then at each DOM checkpoint. Background rows require the cover still frontmost and the target below it immediately before dispatch; nothing reactivates the cover during measurement. A sampled activation or raise fails the row. Sampling can miss transitions between polls; this kit does not claim a continuous OS activation/raise trace. Pointer/key events on the new background path also fail a row. Main's legacy inert pointer is measured but not forbidden by its expected-answer check.

## Running and reading

The branch-limited push trigger registers the workflow and defaults to smoke. Only that registering commit omits `[skip ci]`; all subsequent kit/evidence commits keep it. Ordinary CI only runs on `ci/**`.

After smoke inspection, dispatch `probe-390` on `probe/390-qual` with `mode=full`. Download artifacts into a fresh empty directory, then execute the **trusted checkout's** reader against that directory as data, never run code from the artifacts:

```sh
node /absolute/trusted/checkout/scripts/probe-390/read.mjs /absolute/artifact/browser
```

Each job records exact engine/kit SHAs, hosted image, OS and actual browser version. Floating images may differ between jobs/runs. `coverage.json` requires each unique planned cell/head/repetition exactly once; it never substitutes aggregate counts for complete coverage. An unexpected product result makes the run red without erasing its evidence.
