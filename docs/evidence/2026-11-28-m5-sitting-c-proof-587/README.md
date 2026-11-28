# Sitting C, #587's proof run: the judged records (#117 M5, #506)

This directory keeps the records of GitHub Actions run
[46095539139](https://github.com/SSFSKIM/cua/actions/runs/46095539139). That run is the proof run of ruling 1248:
`m5-sittings.yml`, sitting `c`, form `split`, filtered, with no base. Its 7 cells were judged pairwise, by themselves, on
the engine built from #601's fix merged into feat. They were never combined over an earlier sitting C. The run gates
#601's merge to main.

- Harness and engine commit: `3f3792de4`, the merge of #601 (`0c390389a`) into feat/117-m5.
  - cua engine 0.3.1, build `4c3b5768105094fad946513cd755bbf639287bf4a63d899fc87541d478e1ffb3`.
  - Vendor 26.924.1001281.
- jobs-check recorded this build against the last judged sitting C (`docs/evidence/2026-11-27-m5-sitting-c-split`: 0.3.0,
  build `2de28fcc909d7577…`) as a new build. It was recorded and not refused (ruling 1248).
  - This is not the build the flip ships. More engine changes come into feat before the full split C, so that run will
    record a build of its own.
- Hosted macOS runners (VirtualMac2,1), image macos27 20261123.0387.2. Each run's vendor/cua pair ran on one VM.
- Cells:
  - `finder/frontmost/typeText.typeSelect`, `finder/background/typeText.typeSelect@textedit` and
    `finder/background/typeText.typeSelect@electron` (#587);
  - `textedit/latin/typeText.latin` (#590);
  - `textedit/concurrent.sheet@electron`;
  - `openPanel/background/getAXState.panel@finder` and `openPanel/background/click.cancel@finder`.
- `speed_extra` was off. Dates: 2026-11-28, from 01:55 to 03:33 UTC.

## Attempts

- Run job 2's first attempt (`jobs/m5-sitting-c-run-2-1/`) stopped in the runner's setup, before any cell ran.
  - The `vendor rows` step's write to TCC.db failed with "database is locked".
  - That was an infrastructure stop under ruling 1227. The judge's first attempt refused at jobs-check, because run 2
    was missing. Its records are not kept here.
- `gh run rerun --failed` ran run job 2 and the judge a second time, at the same commit.
- The judge took each run's latest attempt: run 1 and run 3 from attempt 1, run 2 from attempt 2. It lists every
  attempt in `sitting/attempts.md`.

## Layout

All files are copied byte for byte from the run's artifacts (`gh run download`, 2026-11-28).

- `sitting/`: the second judge attempt's `sitting/` (`m5-sitting-c-judge-2`).
  - The reports: `summary.md`, `comparison.md` and `sitting.md`.
  - The run jobs and the build record: `jobs.json`.
  - The key-route diagnostic: `key-route/`.
- `judge-setup/`: that artifact's top-level `decision-pin.txt` and `setup.json`.
- `jobs/`: the run-job artifacts.
  - `m5-sitting-c-run-1-1/`, `m5-sitting-c-run-2-2/` and `m5-sitting-c-run-3-1/`, the ones judged.
  - `m5-sitting-c-run-2-1/`, the stopped setup.

## Digests

`digests.sha256` lists the sha256 digest of every `result.json` under this directory: 8 files, checked against the
download on 2026-11-28. The artifacts' retention ends on 2026-12-12.

Before this tree was committed, it was scanned for anything of the repository owner's or of the machine that copied
it. Nothing was found, and nothing was redacted. The commit that added this directory lists the patterns.

## What the judge found

- **Verdict: PASS.** All 7 cells are equal and qualify, each with 3 complete run pairs. No sample is without a verdict.
  The verdict covers these 7 cells only, none of the sitting's acceptance.
- **#587's three typeSelect cells** (they blocked in the base as worse on cua): every cua sample found the row, with one
  row selected and only that one, input route 2'.
- **The latin cell** (#590): every cua sample is exact at 44 of 44 characters, with no read failure.
- **concurrent.sheet@electron** (ruling 1248): both engines are declared to act, and both acted in every sample.
  - The witness tap, on the Electron fixture's pid, saw the probe's key inside the window every time.
  - On cua the key landed 335–358 ms before the engine's receipt, under the 400 ms lead.
- **The two openPanel@finder cells:** equal, with exact frame equality.
- **Not interfering:** 100% on both lanes, 15 of 15 rows each.
- **Composing:** one group ran (textedit@electron). It needed no retries, and every attempt's field was emptied by the
  harness's own Accessibility write (ruling 1229(b)): 3 of 3 attempts on each lane, with no engine fallback.
- The rulings are in `docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`: 1248, 1259 and the entries
  around them.
