# Sitting C, first full form: the base run's records (#117 M5, #506)

This directory is the complete `m5-sitting-c-full-1` artifact of GitHub Actions run
[45468052791](https://github.com/SSFSKIM/cua/actions/runs/45468052791) (workflow `m5-sittings.yml`, sitting `c`, form
`full`, attempt 1), copied byte for byte:

- harness commit `bfa8cf486`;
- cua engine 0.3.0;
- hosted macOS runner (VirtualMac2,1, image macos27 20261104);
- three matrix runs per engine, lane order vendor, cua, vendor;
- 2026-11-24 19:20 to 2026-11-25 00:56 UTC.

The artifact's 14-day retention ends on 2026-12-09. Ruling 1228 counts these records' 474 judged cells as recorded, and
filtered reruns are combined over them. So the records are kept here, and the split judge reads its base from this
path, checking the digests below, rather than fetching the artifact by run id. `base_run_id` 45468052791 remains the
base's recorded identity.

## Digests

These are sha256 digests of the result files, the records the judge reads. While the artifact still exists, check them
against it with `gh run download 45468052791 --repo SSFSKIM/cua -n m5-sitting-c-full-1`, then `shasum -a 256 -c` against
the list below, run from the download's root. They were checked on 2026-11-27 against a fresh download: all 12 match,
and the whole 44-file tree, logs included, is identical.

Before this tree was committed, it was scanned for anything of the repository owner's or of the machine that copied
it. Nothing was found, so nothing was redacted, and the files and digests are the original artifact's exactly. The
patterns are listed in the commit that added this directory.

```
a74099e13c2a6a03204a2ebcda9d5a61b2d4bb51a1b115a7e7a161e8444d7191  sitting/cua/run-1/result.json
678bcafafbafe3d99118883217f0c46cfec7fcde3905062c21374ac68f985214  sitting/cua/run-2/result.json
b2927ee32d93f7a23e6d6a9c0fd56ed258eb4b599b27c9c1c04c6549b6173798  sitting/cua/run-3/result.json
7d15ba5794dbdbe5bb9a83973da252ac24650a1ebcc499dde22d525b78dc9199  sitting/save-sheet/cua/run-1/result.json
ecf30b79e3c1dd7f1fe57b91bed01eae658c15a769e2ac2e637e2339dd0afcb6  sitting/save-sheet/cua/run-2/result.json
29ce4e44fa444ae15d855794a4cebe298560ff87fdeb8d0e492eadad3250e0c5  sitting/save-sheet/cua/run-3/result.json
6b47098195ea5604a0207d7a85771ddf4deb96a1cfdbb4b2063c3d43625b337c  sitting/save-sheet/vendor/run-1/result.json
50cad9ebc056d9a437b05ebf71370be1066ff78e288dc92c76252b650e567ddf  sitting/save-sheet/vendor/run-2/result.json
f00509ccc9dacaca6ec15957abf8b5c6147fcc1e30ab721c47bac62706dc0919  sitting/save-sheet/vendor/run-3/result.json
46162a387ed258df207faef3e1298e1e681a31944049a7834d518234bb774e97  sitting/vendor/run-1/result.json
2f37ad2509ccc42f8fc50f15aac88fefff75ff4949e348ef4dfa9a0b1140822a  sitting/vendor/run-2/result.json
53efc7730329d63982ec8fe1ddd8ab47f241d2c24ee7affbc9c4b286645000fb  sitting/vendor/run-3/result.json
```

The same list is in `digests.sha256`, which the split judge checks before it reads the base.

The judge's `rejudge-base` step also needs the base's harness commit `bfa8cf486` reachable from its checkout: it judges these records with that commit's own judge, extracted with `git archive`. The commit is on `feat/117-m5`'s history; a squash merge that drops it makes `rejudge-base` fail closed, and nothing is judged.

## What the run showed

See `sitting/summary.md` and `sitting/sitting.md`. The analysis and the rulings that follow from it are in
`docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`, under the Decision Log entry for rulings 1227–1229.
