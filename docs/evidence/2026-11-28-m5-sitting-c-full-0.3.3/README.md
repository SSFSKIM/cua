# Sitting C, the full split on engine 0.3.3: the judged records (#117 M5, #506)

This directory keeps the records of GitHub Actions run
[46165236186](https://github.com/SSFSKIM/cua/actions/runs/46165236186): `m5-sittings.yml`, sitting `c`, form `split`,
runs 1, 2 and 3, with no filter and no base. It is the full split ruling 1248 called for after the proof run, on the
engine that carries #601, #607 and #611 (#600's paste transport). Ruling 1278 accepts it as the record.

- Harness and engine commit: `4a0a82b13`, the merge of #611 (`7147de812`) into feat/117-m5.
  - cua engine 0.3.3, build `30101ea8bbe09a50f5c0de23c390b2918bd8bf4156b38dd4c09865607c56204a`.
  - Vendor 26.924.1001281.
- jobs-check recorded this build against the last judged sitting C, the proof run
  (`docs/evidence/2026-11-28-m5-sitting-c-proof-587`: 0.3.1, build `4c3b5768…`), as a new build. It was recorded and
  not refused (ruling 1248).
- Hosted macOS runners (VirtualMac2,1), image macos27 20261123.0387.2. Each run's vendor/cua pair ran on one VM. Sitting
  C's base (`2026-11-24-m5-sitting-c-full`) ran on image 20261104.
- Lane order: vendor first in runs 1 and 3, cua first in run 2.
- `speed_extra` was off. Dates: 2026-11-28, from 16:29 to 18:31 UTC. Every job's first attempt passed; there were no
  reruns.

## Layout

All files are copied byte for byte from the run's artifacts (`gh run download`, 2026-11-28; `diff -r` identical).

- `sitting/`: the judge's `sitting/` (`m5-sitting-c-judge-1`).
  - The reports: `summary.md`, `comparison.md` and `sitting.md`.
  - The run jobs and the build record: `jobs.json`.
  - The records the judge read: `combined/` (with no base, each run's records as its job wrote them).
  - The key-route diagnostic: `key-route/`.
- `judge-setup/`: that artifact's top-level `decision-pin.txt` and `setup.json`.
- `jobs/`: the run-job artifacts `m5-sitting-c-run-1-1/`, `m5-sitting-c-run-2-1/` and `m5-sitting-c-run-3-1/`.
- The engine artifact (`m5-sittings-engine`, the built engine's archive) is not kept.

## Digests

`digests.sha256` lists the sha256 digest of every `result.json` under this directory: 20 files, checked against the
download on 2026-11-28. The artifacts' retention ends on 2026-12-12.

Before this tree was committed, it was scanned for anything of the repository owner's or of the machine that copied
it. Nothing was found, and nothing was redacted. The commit that added this directory lists the patterns.

## What the judge found

**Verdict: FAIL** (4 PASS, 1 FAIL, 1 INFO).

- **Blocking:** `chrome/korean/pressKey.rk` and `electron/korean/pressKey.rk` failed on cua, each in one of three
  samples.
  - Every failed sample, on either engine, read `ㄱ` (sha256 `fcae0b0f…`, one character): the `k` (ㅏ) never joined.
  - The failures followed the lane that ran first, not the engine. On this image, the first Korean composition in a
    fresh Chromium field failed on both engines, whichever lane ran first.
    - Vendor: failed both cells in runs 1 and 3, where it ran first.
    - cua: failed both cells in run 2, where it ran first.
    - So 6 of the 6 first-lane samples on the two web fields failed, and 0 of the 6 second-lane ones.
    - TextEdit's `pressKey.rk` passed all 6 samples.
  - Ruling 1278 orders a warm-up for the next sitting and keeps this effect on the parity record as measured here.
- **Missing proof:**
  - `textedit/concurrent.sheet@electron` is invalid on all 6 samples, a harness defect.
    - R3's positive control was posted at the run's end, after `electron/background/launch@finder` had quit the tapped
      Electron fixture, so the control was never seen.
    - Fixed in `7c11a0925`: the control is now posted before the launch rows.
  - `textedit/midSwitch/typeText.long` has 2 of 3 complete pairs: cua's run 3 sample is invalid ("the probe switched
    2 ms after the action's interval").
- **For the owner:** `chrome/method.typeText.replace` missed the 10% beat on p95 alone.
  - cua 186.5 ms median against the vendor's 326.4, p95 407.7 against 377.1, n = 3 a side.
  - cua's samples were 186.5, 407.7 (run 2) and 151.9 ms.
- **Accepted miss** (#593, ruling 1240): `textedit/method.typeText.replace`, cua 187.5 ms median against the vendor's
  328.2, p95 376.8 against 335.6, n = 3.
- **Speed:** 64 of 66 ops beat the vendor, with 1 accepted miss and 1 for the owner.
  - The three `paste.replace` ops all beat it: textedit −42.3%, chrome −48.8%, electron −11.8%.
- **#611's paste route:** every `paste.*` cell passed on cua 3/3, and so did every multi-line `typeText` cell
  (`typeText.lines`, `typeText.acceptance4`), in the latin, Korean and composing fields of TextEdit, Chrome and the
  Electron fixture.
  - The method and background `paste.replace` rows took the paste route and were equal to the vendor's.
  - The vendor fails the multi-line typeText cells, as it did in the base.
- **Not interfering:** 99.2% on both lanes (381 of 384). cua's route-4 actions outside the accepted families: 0.
- **Korean and Unicode:** 168 of 171 rows passed on cua. The 54 perContext rows are not judged.
- **Concurrent use and intervention:** 4 of 5 rows passed on cua.
- **Save sheet:** PASS on all 6. Key route: INFO; Escape was seen by the panelService tap on both engines.
- **Composing:** no retries. Every attempt's field was emptied by the harness's own Accessibility write (ruling
  1229(b)): 9 of 9 on each lane, with no engine fallback.
- The rulings are in `docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`: 1248, 1277, 1278 and the
  entries around them.
