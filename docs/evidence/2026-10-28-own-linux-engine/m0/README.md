# #171 M0.3: the wire fixtures, the differential harness's first cut, its runs and the promotion verdict

On the #171 VM (`dc-linux171-1e68`, x86-64, Ubuntu 24.04, X11 `:0`, Openbox, no compositor, no input method),
2026-10-28, against the spec `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md` (M0, the Spike and Wire
fixtures paragraphs).

**What was measured.** The spike engine `native/linux-engine/` at its source of 41c4e1bd (unchanged since), built at
the harness commits below (so `cua-engine --version` names them), against OpenAI's pinned `sky_linux_x64` 26.928.40906
(SHA-256 `7ac3c2ae…f1cd`) and newest 26.1023.51421 (`88ce5e0a…2991`), every binary's SHA-256 in each run's `meta` row.

| Run | Harness commit | What |
|---|---|---|
| `wire-check.txt` | 39176596 | `--check-wire` through the pinned build's own JavaScript |
| `m0-tree` | 39176596 | the tree read: `sequential`, `frontier` over W, R, the reservation and the slack, `cache`; gedit, Chrome, over-budget, big text |
| `m0-shot` | 39176596 | the tree with the window screenshot: retention and settle variants |
| `m0-capture-readiness`, `m0-key-pace` | 39176596 | the Retention paragraph's measurements |
| `m0-input-covered`, `m0-input-visible` | fc79391d | `press_key` and `click`: retention, settle, teardown and key-pace variants, the scene windows fully covered and visible |
| `m0-choice` | fc79391d | every operation and scene, the chosen configuration (iteration 2) against both builds |

The input runs and `m0-choice` were first run at 39176596 and discarded: gedit's click series clicked one point
faster than the double-click time, gtk took it for a triple click and selected a line, and the next block's first key
replaced it, an effect failure the harness made (it hit the pinned build as well). fc79391d fixed the scene, and
those runs were redone.

`results.jsonl` holds every sample, count, check and verdict; `summary.md` is rewritten from it by
`node scripts/linux-engine-diff.mjs --summarize --out docs/evidence/2026-10-28-own-linux-engine/m0`. The harness and its
method are described in `scripts/linux-engine-diff/README.md`.

## Results

- **Wire fixtures.** One PASS line per output kind for both vendor builds' recorded answers (object, array, string,
  null) and for the spike's (object, array, null; it answers no string-valued command), each with a negative control
  (the same output JSON-encoded) that the check refuses.
- **The tree read (`frontier`)** returns the pinned build's exact output on every sample (gedit 498 nodes, Chrome page
  243, big text 222 with its 4.7 MB entry read whole, over-budget the same 5,000 retained native ids) with exactly the
  vendor's calls on the trees under the limit, at about an eighth of the time: warm medians gedit 69.7 ms against the
  bar's 545.4, Chrome 48.8 against 405.1, big text 108.6 against 466.0, over-budget 919 against 6,972.6.
  `sequential` reproduces the vendor's call counts exactly and its times within a few percent (its job).
- **The window (W, R, reservation, slack).** On trees under the limit every W from 16 up reads in the same time
  (W 8 is slower); on the over-budget page the time is flat from W 16 up while the calls spent on nodes preorder
  refuses grow with W: medians 43 (W 16), 96 (W 32), 243 (W 64), 318 (W 128). R and the reservation change nothing
  unless R / reservation falls under W (R 64 KiB at 4 KiB: 16 in flight, slower). Chosen: **W 32, R 4 MiB, 4 KiB per
  call in flight, slack 16**; over-budget bus calls the vendor's plus 87–112, wasted at most 129 of 48 reads.
- **`cache`**: neither gedit nor Chrome answers `GetItems`; the variant equals `frontier` plus one refused call.
- **Background input needs retention for Chrome.** With the window fully covered and not redirected
  (`--retention none`), Chrome ignored every background key and click (0/18 each); redirected, with no wait at all
  (`--settle-ms 0`), it took every one (18/18), and it took them unredirected while visible. gedit took them in every
  case. The redirect is needed, the wait after it is not.
- **Capture readiness.** After RedirectWindow the window's real contents appear in 6.6–8.3 ms (median, visible) and
  12.9–15.8 ms (median, covered), at most 26.8 ms in 80 trials; until then the captures are wrong (black for a covered
  gedit). Two consecutive equal captures is not a readiness condition: the interim contents hold steady for several
  milliseconds, so a poll at 1–10 ms stops early in nearly every covered trial and at 20 ms in up to 7 of 20.
- **Key pacing.** Neither gedit nor Chrome dropped or reordered a key at 0 ms per key edge (bursts of 20 letters and
  of 10 Shift chords, pipelined) while the 100 ms teardown wait stayed; Chrome lost the last keys of a pipelined burst
  when the teardown was 50 ms or less (1 key at 33–50 ms, up to 11 at 0). Isolated keys and clicks arrived with no
  teardown (18/18).
- **The choice** (`cua:choice` = `--window-calls 32 --settle-ms 40 --key-pace-ms 0`, session retention, teardown
  100 ms) passes every operation on every scene: equal output, witness clean, effect verified, cold and warm at or
  below the bar. `press_key` gedit 220.8 / 101.3 ms against 301.9 / 235.4, Chrome 200.6 / 101.4 against 293.6 /
  236.0; `click` gedit 159.3 / 114.0 against 219.1 / 214.8, Chrome 221.2 / 114.1 against 268.4 / 214.6; the window
  screenshot gedit 154.5 / 93.1 against 664.9 / 678.0, Chrome 125.5 / 78.0 against 537.5 / 549.2 (cold / warm). The
  spike's defaults (the vendor's waits kept) fail only on the cold `press_key` and `click`.
- **The witness** failed the activate-and-restore stub engine in every input run (active window, stacking, focus) and
  saw no change in any background operation of any engine. The X request audit is M1a's.

**Verdict: promote**, at the second iteration: the wire fixtures pass through the vendor JavaScript; `frontier`
returns the vendor's node set exactly on both scenes with its medians far below the bar; a background `press_key` with
session retention keeps the witness unchanged, its effect verified, and its cold and warm medians below the bar.
