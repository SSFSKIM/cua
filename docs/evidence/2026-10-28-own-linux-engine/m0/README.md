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
| `m0-capture-readiness`, `m0-key-pace` | 39176596 | the Retention paragraph's measurements (`xprobe retention`, pipelined key bursts) |
| `m0-tree` | f637fcfa | the tree read: `sequential`, `frontier` over W, R, the reservation and the slack, `cache`; gedit, Chrome, over-budget, big text |
| `m0-shot` | f637fcfa | the tree with the window screenshot: retention and settle variants |
| `m0-input-covered`, `m0-input-visible` | f637fcfa | `press_key` and `click`: retention, settle, teardown and key-pace variants, the scene windows fully covered and visible |
| `m0-choice` | f637fcfa | every operation and scene, the chosen configuration (iteration 2) against both builds |

Earlier runs were discarded and redone, and each fix is why:

- At 39176596, gedit's click series clicked one point faster than the double-click time. gtk read it as a triple
  click and selected a line, which the next block's first key replaced. That was an effect failure the harness made;
  fc79391d fixed it.
- At fc79391d, the task review found that:
  - verdicts did not reach the exit status;
  - screenshots were compared by the first sample only, and outside the verdict;
  - the witness could miss a change and its restore;
  - cold times included the harness's own before-state read.

  f637fcfa fixed all four, and every run that rests on them was redone.

`results.jsonl` holds every sample, image comparison, count, check and verdict. `summary.md` is rewritten from it by
`node scripts/linux-engine-diff.mjs --summarize --out docs/evidence/2026-10-28-own-linux-engine/m0`. The harness and
its method are described in `scripts/linux-engine-diff/README.md`.

## Results

- **Wire fixtures.** There is one PASS line per output kind for both vendor builds' recorded answers (object, array,
  string, null) and for the spike's (object, array, null; the spike answers no string-valued command). Each has a
  negative control, the same output JSON-encoded, which the check refuses.
- **The tree read (`frontier`).** Every sample returns the pinned build's exact output:
  - gedit 498 nodes and the Chrome page 243;
  - big text 222 nodes, its 4.7 MB entry read whole;
  - over-budget the same 5,000 retained native ids.

  On the trees under the limit it makes exactly the vendor's calls, in about an eighth of the time. Warm medians in
  `m0-choice`: gedit 66.2 ms against the bar's 554.1, Chrome 52.6 against 442.2, big text 105.6 against 461.2,
  over-budget 920.7 against 6,974.2. `sequential` reproduces the vendor's call counts exactly and its times within a
  few percent, which is its job.
- **The window (W, R, reservation, slack).**
  - On the trees under the limit, every W from 16 up reads in about the same time; W 8 is slower.
  - On the over-budget page, W 16 is slower than W 32 (warm 1,028 ms against 907), and from W 32 up the time is flat.
    Meanwhile the calls spent on nodes that preorder refuses grow with W: median 43 at W 16, 98 at W 32, 245 at W 64,
    327 at W 128.
  - R and the reservation change nothing unless R / reservation falls under W. At R 64 KiB with 4 KiB reserved, only
    16 calls are in flight, and the over-budget read is slower (1,036 ms).
  - Chosen: **W 32, R 4 MiB, 4 KiB per call in flight, slack 16**. With these, cua's over-budget bus calls are the
    vendor's plus 89 to 100, and at most 128 calls were wasted in 48 reads.
- **`cache`**: neither gedit nor Chrome answers `GetItems`; the variant equals `frontier` plus one refused call.
- **Background input needs retention for Chrome.**
  - Fully covered and not redirected (`--retention none`), Chrome ignored every background key and click (0/18 each).
  - Redirected with no wait at all (`--settle-ms 0`), it took every one (18/18). It also took them unredirected while
    visible. gedit took them in every case.
  - So the redirect is needed and the wait after it is not.
- **Capture readiness.**
  - After RedirectWindow, the window's real contents appear in 6.6–8.3 ms (median, visible) and 12.9–15.8 ms (median,
    covered), and at most 26.8 ms in 80 trials. Until then the captures are wrong (black for a covered gedit).
  - In the differential run, every sample's screenshot is checked against the pinned build's:
    - settle 0 fails each block's first capture (3 of 24 outside the tolerance, on both scenes);
    - no retention fails every capture of a covered window;
    - settle 20 and 50 pass 24/24.
  - Two consecutive equal captures is not a readiness condition. The interim contents hold steady for several
    milliseconds, so a poll at 1–10 ms stops early in nearly every covered trial, and at 20 ms in up to 7 of 20.
- **Key pacing.**
  - Neither gedit nor Chrome dropped or reordered a key at 0 ms per key edge, in pipelined bursts of 20 letters and
    of 10 Shift chords, while the 100 ms teardown wait stayed.
  - Chrome lost the last keys of a pipelined burst when the teardown was 50 ms or less: 1 key at 33–50 ms, up to 11
    at 0.
  - Isolated keys and clicks arrived with no teardown (18/18).
- **The choice** is `cua:choice` = `--window-calls 32 --settle-ms 40 --key-pace-ms 0`, with session retention and a
  100 ms teardown. It passes every operation on every scene: equal output, every screenshot within the tolerance,
  witness clean, effect verified, and cold and warm at or below the bar. Medians, cold / warm against the bar:

  | Operation | Scene | cua:choice | bar |
  |---|---|---|---|
  | `press_key` | gedit | 145.6 / 101.3 | 239.9 / 235.8 |
  | `press_key` | Chrome | 146.5 / 101.4 | 241.9 / 235.8 |
  | `click` | gedit | 159.0 / 114.0 | 219.5 / 214.8 |
  | `click` | Chrome | 158.5 / 114.0 | 219.9 / 214.8 |
  | window screenshot | gedit | 145.0 / 91.7 | 633.6 / 659.1 |
  | window screenshot | Chrome | 137.6 / 98.5 | 581.0 / 571.2 |

  The spike's defaults, which keep the vendor's waits, fail only on the cold `press_key`. That is why the run exits
  1, since every candidate is judged.
- **The witness** fails a span on any notify of the active window or the stacking list, even when the value reads
  back unchanged. It failed the activate-and-restore stub engine in every input run (active window, stacking, focus),
  and it saw no change and no notify in any background operation of any engine. The X request audit is M1a's.

**Verdict: promote**, at the second iteration. All three conditions hold:

- the wire fixtures pass through the vendor JavaScript;
- `frontier` returns the vendor's node set exactly on both scenes, with its medians far below the bar;
- a background `press_key` with session retention keeps the witness unchanged, its effect is verified, and its cold
  and warm medians are below the bar.
