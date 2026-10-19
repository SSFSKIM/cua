# Native goldens: provenance

The goldens of the renderer and of the diff (`src/services/engine/render.mjs`, `src/services/engine/diff.mjs`). They
are verified by `test/services-engine-render-goldens.test.mjs` and `test/services-engine-diff-goldens.test.mjs`, under
the rules of `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (Verification system, parts 3 and 7). The
M1a pre-flight Decision Log entry (2026-10-19), item 5, says M0's goldens are re-keyed, not re-recorded.

## Source captures

These are M0's second sitting, unit 9, committed at
`docs/doperpowers/research/2026-10-18-own-native-engine/spike/sit2/u9/` (each run's `goldens/`, `meta.json` and
`preparation.json`).

| | cua lane | vendor lane |
|---|---|---|
| Run | `cua/run-2`, all four scenes | `vendor/run-2` for TextEdit, Chrome and Electron; `vendor/run-1` for Finder |
| Started | 2026-10-19T20:04:01.745Z | run-2 2026-10-19T19:52:50.677Z; run-1 2026-10-19T19:49:57.934Z |
| Build | spike engine `b99ea9678bfd67d566e656d20ce2ade5e0c9c74627589af3e02af36374960676`, version 0.1.0 | Codex Computer Use runtime `26.928.40906-darwin-arm64` (`SkyComputerUseService`) |

Both lanes share the following:
- harness commit `b72740b8bee79ebce73845a483315f1e7a67b457`;
- device `mini` (Mac14,12), macOS 27.0 (26A428), display scale 2;
- the second sitting, 2026-10-19.

**Why Finder's vendor run is run 1.** The vendor lane ran first.
- Its run 1 began with no Finder row selected, the same state cua's run 2 began in.
- Its runs 2 and 3 began with the previous run's clicked row still selected.
- TextEdit and Electron are identical across the vendor's runs. Chrome's runs differ only by the port of the loopback page.

## Files per scene

| Golden file | Source |
|---|---|
| `skyshot.json` | cua `<scene>.skyshot.json`, re-keyed |
| `vendor.txt` | vendor `<scene>.text.txt`, byte for byte |
| `action.before.skyshot.json` | cua `<scene>.action.before.skyshot.json`, re-keyed |
| `action.after.skyshot.json` | cua `<scene>.action.after-diff.skyshot.json` (the default-mode observation after the click, in the before's lineage), re-keyed |
| `action.vendor.before.txt` | vendor `<scene>.action.before.txt`, byte for byte (the base of the vendor's diff) |
| `action.vendor.diff.txt` | vendor `<scene>.action.diff.txt`, byte for byte |
| `cua.txt`, `cua.diff.txt` | cua's own rendering and diff, written by the tests with `UPDATE_GOLDENS=1` and pinned byte for byte |

## Re-keying

`node test/native-goldens/rekey.mjs`, run from the repository root, regenerates every file above except the pinned
ones. The script's header lists each change. All of them are mechanical:
- Each node's `index` n becomes `token: "t<n>"`, M1a.1's token format.
- The index-valued fields (`focused`, `selectedElements`, `servesAsTitle`/`servesAsTitleFor`) become tokens, under the
  Interfaces' name `servesAsTitleFor`.
- The spike's diagnostic `timings` are dropped.
- Finder's redaction marker for the empty string, `⟨0⟩`, becomes `''` again.

The render test checks that each `skyshot.json` equals `rekey` applied to the recorded capture.

## Finder is structural

Finder's window lists the owner's sidebar places, which the harness does not own. M0's capture already replaced every
string that the run does not own with its length (`⟨n⟩`). For that reason no golden here carries that content, and
Finder is compared against the vendor by structure (`compare.mjs`'s structural mode): depth, role and flags are
compared, and strings only by shape.

## Expected differences

`expected.json` declares every difference between cua's output and the vendor's, each with its cause. A declaration
does one of two things:
- It applies an engine-side correction to the Skyshot before rendering. These record M1a.1 derivations that the
  vendor's text refutes.
- It names a difference in a line, the header, the trailer or the state.

The tests fail in either of two cases: an undeclared difference appears, or a declaration changes nothing.

## Vendor sizing config (Statsig 406601636)

Read on the mini at 2026-10-19T21:45:21Z with `ssh mini 'bash -s' < scripts/native-baseline/read-sizing-config.sh`, which prints
only that config from the vendor helper's cached Statsig store, one line per cached evaluation. The plist's mtime was
2026-10-19T20:30:43Z. All 10 cached evaluations read rule `default` with `should_use_legacy_screenshot_sizing` absent
(false), value `{"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true,
"should_use_jpeg": true}`. The newest fetch was 2026-10-19T20:30:09Z; the oldest was 15:38:03Z, before the second
sitting's captures. The cache refreshes only while the vendor helper runs, so this read shows the last fetch, not a
fresh one; the helper was not started to force one. So the legacy downsizing fit was off for every vendor capture these
goldens pair with, and the sizes follow the rule in the spec's "Screenshot" (U1).
