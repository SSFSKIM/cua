# Native goldens: provenance

The goldens of the renderer and of the diff (`src/services/engine/render.mjs`, `src/services/engine/diff.mjs`). They
are verified by `test/services-engine-render-goldens.test.mjs` and `test/services-engine-diff-goldens.test.mjs`, under
the rules of `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (Verification system, parts 3 and 7).

<!-- source: written by scripts/native-matrix/goldens.mjs install from a live recording -->
## Source captures

The M1a pre-flight Decision Log entry (2026-10-19), item 5, says M0's goldens are re-keyed, not re-recorded. These are
M0's second sitting, unit 9, committed at
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

The render test checks every file above against its source: each Skyshot equals `rekey` of the recorded capture, and
each vendor text equals the recorded bytes.

## Finder is structural

Finder's window lists the owner's sidebar places, which the harness does not own. M0's capture already replaced every
string that the run does not own with its length (`⟨n⟩`). For that reason no golden here carries that content, and
Finder is compared against the vendor by structure (`compare.mjs`'s structural mode). Lines are matched by depth, the
English role word where the redaction kept one, and the flags group. Each matched pair is then compared by its length,
with every `⟨n⟩` counted as n characters. The redaction folds a localized role word, the flags and the title into one
`⟨n⟩` on most Finder lines, so the length is what such a line still tells. The other three scenes are compared by full
text, values included, with only the loopback page's port normalized.

<!-- /source -->

## Expected differences

`expected.json` declares every difference between cua's output and the vendor's. Each declaration gives its cause and
its `fault`:
- engine: the recorded Skyshot is wrong, or lacks what the vendor reads;
- redaction: Finder's captures hide the content the rule reads;
- scene state: the two lanes' actions left different states.
- engine or renderer: undecided until M1b compares Finder by full text (the file rows' actions).

A declaration does one of two things:
- It applies a correction to the Skyshot before rendering.
- It pins a difference to its exact value or count: a part inside a line, a whole line, the header or the trailer.

The tests fail in either of two cases: a difference appears that no declaration pins, or a declaration changes nothing
or is used fewer times than its count.

**The engine-fault declarations expire.** M1b re-records these goldens live from the fixed engine (task M1a.2b) and
deletes every engine-fault declaration at that point. A declaration still needed after the re-recording is an engine
defect, not a declaration. A fixed derivation alone removes nothing: the recorded Skyshots do not change until the
goldens are re-recorded.

**Action descriptions are per locale.** The vendor prints the system's action descriptions, localized to the Mac's
language, and the mini is Korean (`윈도우 확대/축소` in Chrome and Electron; TextEdit answers in English,
`zoom the window`). A re-recording on another locale differs in these descriptions and nowhere else. Until M1a.2b the
engine supplies no action descriptions, so each such difference is declared with that cause.

<!-- sizing: written by scripts/native-matrix/goldens.mjs install from a live recording -->
## Vendor sizing config (Statsig 406601636)

Read on the mini at 2026-10-19T21:45:21Z with `ssh mini 'bash -s' < scripts/native-baseline/read-sizing-config.sh`, which prints
only that config from the vendor helper's cached Statsig store, one line per cached evaluation. The plist's mtime was
2026-10-19T20:30:43Z. All 10 cached evaluations read rule `default` with `should_use_legacy_screenshot_sizing` absent
(false), value `{"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true,
"should_use_jpeg": true}`. The newest fetch was 2026-10-19T20:30:09Z; the oldest was 15:38:03Z, before the second
sitting's captures. The cache refreshes only while the vendor helper runs, so this read shows the last fetch, not a
fresh one; the helper was not started to force one. So the legacy downsizing fit was off for every vendor capture these
goldens pair with, and the sizes follow the rule in the spec's "Screenshot" (U1).
<!-- /sizing -->
