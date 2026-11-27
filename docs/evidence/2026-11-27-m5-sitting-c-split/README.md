# Sitting C, combined over its filtered split rerun: the judged records (#117 M5, #506)

This directory holds the records of GitHub Actions run
[46069842660](https://github.com/SSFSKIM/cua/actions/runs/46069842660). That run was the judge-only split dispatch of
`m5-sittings.yml` (sitting `c`, form `split`, ruling 1234). It judged the filtered split rerun 46052931439 (attempt 1)
over the base 45468052791 (`docs/evidence/2026-11-24-m5-sitting-c-full/`).

Only 46069842660 is written here as a run link. The split judge finds a base by the README that links its run id, and
exactly one README may link it. The base keeps its own README, and so stays the only one that links 45468052791.

- Judging commit (this judge's): `c0b2ce8f1`.
- Drawing commit (the run jobs'): `313fbf534`, cua engine 0.3.0, the same engine source as the base's `bfa8cf486`.
- Runner image: hosted macOS runner (VirtualMac2,1). The run jobs ran on image macos27 20261123.0387.2; the base ran on
  macos27 20261104.0337.1. Each vendor/cua pair ran on one VM.
- The run jobs: three, one per run number. Lane order was vendor, cua, vendor.
  - The filter held 61 ids: the save-sheet cell, six matrix cells, and the three composing groups × 9 strings ×
    typeText/paste.
  - `speed_extra` was on: the three ops the base missed were re-timed at 10 samples a lane, plus three controls.
- Dates: run jobs 2026-11-27 19:03 to 20:46 UTC; judge 21:25 to 21:30 UTC.

## Layout

All files are copied byte for byte from the runs' artifacts (`gh run download`, 2026-11-27):

- `sitting/`: the judge artifact `m5-sitting-c-judge-1`'s `sitting/`, from run 46069842660.
  - `sitting/combined/` is the combined C result. Each run's cells come from the base, except the 60 cells a run job
    replaced, in both lanes. `combined.json` lists the replacements; it records 0 flags and 0 vendor-only changes.
  - The reports are `summary.md`, `comparison.md` and `sitting.md`. `sitting.md` also has the source run, the run
    jobs and the base re-judged.
  - The records are `base-rejudge.json`, `source-run.json` and `jobs.json`.
- `judge-setup/`: that artifact's top-level `decision-pin.txt` and `setup.json`.
- `jobs/m5-sitting-c-run-{1,2,3}-1/`: the three run-job artifacts of run 46052931439. Each holds both lanes of its run,
  the save-sheet cell, the speed-extra cell and the witness tap's record.

**`sitting/combined/` is superseded as a base (ruling 1239).**
- A later filtered C run's judge rebuilds the combined C result from raw records with the current combine, in layers:
  45468052791's records, then this directory's `jobs/`, then the new jobs. It never reads `sitting/combined/`.
- Combined over the same raw layers, c0b2ce8f1's own combine reproduces `sitting/combined/` byte for byte.
- It stays here as part of the pass's record. It is no longer maintained.

## Digests

`digests.sha256` lists sha256 digests of every `result.json` under this directory: 32 files, checked against the
downloads on 2026-11-27. The artifacts' 14-day retention ends on 2026-12-11. These records serve as the base of later
filtered C runs, such as #587's live proof, so they are kept here.

Before this tree was committed, it was scanned for anything of the repository owner's or of the machine that copied
it. Nothing was found and nothing was redacted. The patterns are listed in the commit that added this directory.

## What the judge found

- Verdict: FAIL. Only #587's three Finder typeSelect cells block it (`sitting/comparison.md`).
- The base re-judged: two differences, each explained by a declaration that cites its ruling: the Chrome background
  drag departure (#282, ruling 1228) and the Save sheet name timing row, now not judged (#592, ruling 1231).
- #212's save sheet: PASS on both engines in all three runs. cua refused before acting.
- **A known error in `sitting/`: the "Composing retries (ruling 1229)" section of `summary.md` and `comparison.md` is
  wrong.**
  - combine took the rerun's composing rows but kept the base's run-level composing readings, so the section reports
    the base's attempts ("vendor 0 retries, 2 never composed").
  - The rerun's real attempts are in `jobs/*/sitting/<lane>/run-N/result.json`, under `meta.unicode.readings`:
    - cua took one attempt in every group.
    - The vendor needed 3 attempts in run 1's electron@textedit group and 2 in run 3's chrome@textedit group.
    - Every group composed in the end.
  - Under ruling 1229(a) that pattern is lopsided, and the report-only owner flag should have fired.
  - The verdicts are unaffected: retries are report-only, and the rows judged are the rerun's.
- **A second error from the same cause: two cells' NO VERDICT `venue` in run 2.**
  - `openPanel/background/getAXState.panel@finder` and `openPanel/background/click.cancel@finder` show NO VERDICT
    `venue` in run 2.
  - combine kept the base's panel placements (`meta.placement.panel`), so the judge compared the base's frame
    (x = −60) with the rerun's (x = −58). That made a 2 px split that was never there.
  - In the run job's own run-2 records (`jobs/m5-sitting-c-run-2-1/`), both lanes' panels read back at x = −58, equal.
- Both errors are fixed by harness commit ad285cedf on `feat/117-m5`: run-level meta follows the rows combine replaces.
  - Re-combined from these same records, the composing section reads as above.
  - Both openPanel@finder cells qualify in run 2 under exact frame equality.
  - Only concurrent.sheet@electron is left in NO VERDICT by cell.
  - Ruling 1238 keeps this directory as the record of the pass as it was judged, with the corrections noted here. It
    is not rewritten.
- The analysis and its rulings (1234–1237) are in `docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`.
