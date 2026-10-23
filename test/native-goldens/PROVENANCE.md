# Native goldens: provenance

The goldens of the renderer and of the diff (`src/services/engine/render.mjs`, `src/services/engine/diff.mjs`). They
are verified by `test/services-engine-render-goldens.test.mjs` and `test/services-engine-diff-goldens.test.mjs`, under
the rules of `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (Verification system, parts 3 and 7).

<!-- source: written by scripts/native-matrix/goldens.mjs install from a live recording -->
## Source captures

A live recording by `scripts/native-matrix/goldens.mjs record` (the own native engine spec, M1b; the Decision Log's
"M1b pre-flight" item 5), committed at `docs/doperpowers/research/2026-10-18-own-native-engine/m1b/goldens-final` with its `meta.json`: both lanes in one sitting and one run
directory, each scene's two lanes on the same fixed state. The fixed state's two captures sit between two of cua's
observations that rendered alike, and every vendor text was read only after cua's engine had checked the same state
(the scene's `fixedStateProblems`, the run's process and window).

| | cua lane | vendor lane |
|---|---|---|
| Path | the approved engine's socket, the raw `Skyshot` (`scripts/native-matrix/goldens-device.mjs`) | `cua serve` on the vendor host, the approved vendor runtime (`prepare.mjs`'s approved-home path) |
| Build | engine `4b31b8e61195fa9580636bfd08387653072bc50b6da089c008e5c2c952649043`, version 0.1.0, approved 2026-10-21T01:09:31.257Z, signature identity (identity matches: true) | Codex Computer Use runtime `26.928.40906-darwin-arm64` (`SkyComputerUseService`) |

Both lanes share the following:
- the recording, 2026-10-21T04:57:08.947Z to 2026-10-21T04:59:37.652Z, on device `mini` (Mac14,12), macOS 27.0 (26A428), display scale 2;
- the harness checkout at `0b44493ef562d0fd6d04441202b6a2bf1f50f3b7`, whose engine build is the approved one, and the run directory `/Users/new/Library/Caches/cua-harness/native-goldens` on the device;
- Chrome for Testing 155.0.8059.84 and the Electron fixture 44.9.0-23c8b77691d0.

Each scene's window frame in points, as cua's observations read it (Finder's one window holds every capture of its
scene, so its frame is the same throughout), and how many attempts the fixed state took:

| scene | frame | over the captures | fixed-state attempts |
|---|---|---|---|
| textedit | 309, 103, 610 × 860 | the same over 5 | 1 |
| finder | 820, 261, 920 × 492 | the same over 5 | 1 |
| chrome | 80, 60, 1000 × 760 | the same over 5 | 1 |
| electron | 140, 100, 720 × 560 | the same over 5 | 1 |

## Files per scene

| Golden file | Source (`docs/doperpowers/research/2026-10-18-own-native-engine/m1b/goldens-final/goldens/<scene>/`, modulo the account-home substitution below) |
|---|---|
| `skyshot.json` | cua's full observation of the fixed state, the one taken right after the vendor's text |
| `vendor.txt` | the vendor's full text of the same state |
| `action.before.skyshot.json` | cua's full observation before the action's click |
| `action.after.skyshot.json` | cua's next observation after the click, in the same lineage (the diff's subject) |
| `action.vendor.before.txt` | the vendor's full text before its click (the base of its diff) |
| `action.vendor.diff.txt` | the vendor's diff after its click |
| `cua.txt`, `cua.diff.txt` | cua's own rendering and diff, written by `goldens.mjs check --write` (or the tests with `UPDATE_GOLDENS=1`) and pinned byte for byte |

`source.json` names the recording, and the render test checks every file above against it. The engine's
per-observation diagnostics (`timings`, such as `focusRead`) are in `meta.json`, not in the Skyshots. Each lane's
action started from the fixed state: Finder's selection was cleared in the same window between the two actions, and
the other scenes were restarted; cua's action clicked only once its observation rendered as the kept fixed-state
Skyshot does (the loopback page's port aside), and `meta.json` gives each scene's `startAttempts`.

## Account-home substitution (2026-10-23, M4 post-hold inventory)

The installed fixtures are not untouched captures: in 23 `.json` and `.txt` files across all four scenes, every exact
`/Users/new/` prefix was replaced with `/Users/xxx/`. No other byte was changed. This covers both engines' text,
each before/after Skyshot and cua's pinned rendering; element numbering, values other than that prefix, and comparisons
remain unchanged. The replacement has the same byte length because the renderer's URL placement depends on its line
budget. The original recordings under `docs/doperpowers/research/` are untouched.

`source.json` declares `accountHomeReplacement`; `source.mjs` derives the original home from the recording's `meta.json`
`runDir` and applies that one prefix substitution when checking provenance. `test/native-goldens-paths.test.mjs` checks
the complete transformed source for every sourced golden, and the existing render/diff tests check the installed
fixtures against it. This is not structural redaction, an engine-fault correction or a home-path inventory exemption.
A future live reinstall must explicitly preserve or renew this normalization declaration before these checks pass.

## Finder is full text

Finder's fixed state hides the sidebar, the status bar and the path bar (`scripts/repl-parity/scenes-mac-finder.mjs`),
and every Skyshot was checked before it left the device, so Finder's window carries only the run's folder and files
and Finder's own vocabulary. It is compared by full text like the other scenes, with only the loopback page's port
normalized.
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

Read on the device in the recording's sitting with `scripts/native-baseline/read-sizing-config.sh`, which prints only
that config from the vendor helper's cached Statsig store, one line per cached evaluation. The cache refreshes only
while the vendor helper runs, so the first read shows the last fetch before the sitting and the second what the run's
helper held after the captures. A line whose `legacy` is anything but `absent (false)` means the legacy downsizing
fit was on, and the vendor's sizes would not follow the rule in the spec's "Screenshot" (U1).

Before the vendor lane, at 2026-10-21T04:57:17.354Z:

```
plist mtime 2026-10-21T04:54:01Z
0 fetched 2026-10-21T01:05:23Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
1 fetched 2026-10-21T03:56:01Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
2 fetched 2026-10-21T00:47:09Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
3 fetched 2026-10-21T01:05:23Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
4 fetched 2026-10-21T01:53:51Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
5 fetched 2026-10-21T01:14:17Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
6 fetched 2026-10-21T01:14:17Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
7 fetched 2026-10-21T02:36:11Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
8 fetched 2026-10-21T01:14:17Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
9 fetched 2026-10-21T00:47:09Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
```

After its captures, the run's helper still running, at 2026-10-21T04:59:34.886Z:

```
plist mtime 2026-10-21T04:57:31Z
0 fetched 2026-10-21T01:14:17Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
1 fetched 2026-10-21T01:53:51Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
2 fetched 2026-10-21T01:05:23Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
3 fetched 2026-10-21T03:56:01Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
4 fetched 2026-10-21T01:14:17Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
5 fetched 2026-10-21T04:53:48Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
6 fetched 2026-10-21T01:14:17Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
7 fetched 2026-10-21T00:47:09Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
8 fetched 2026-10-21T02:36:11Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
9 fetched 2026-10-21T01:05:23Z rule default legacy absent (false) value {"jpeg_compression_quality": 0.8, "should_normalize_screenshot_to_point_resolution": true, "should_use_jpeg": true}
```
<!-- /sizing -->
