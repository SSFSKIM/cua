# #414: hosted macOS evidence for type_text's length confirmation in password fields

Every run happened only on GitHub-hosted macOS, in kit `probe/414-qual` (workflow `422774845`). The engines under test were built unmodified from clean checkouts of exact SHAs. The kit's README, `scripts/probe-414/README.md` at `b7aebd311c0c0edffd113a710425aad2c4c12bad`, has every run, with:
- the scoring rules and gates;
- the drain timing data behind the 220 ms quiet window;
- the full latency distributions.

This file covers what the merge rests on. The baseline throughout is main `517ab5430a3a81718910b030488ba8d855087b21`, which includes #395.

## How the kit scores

- **Stock lanes, scored.** Each lane interleaves main and the fix in the same owned app or page. The lanes are:
  - Chrome for Testing 157;
  - Electron 44, default and MAWS-parity;
  - Safari 27.2, on #395's 1,600-node page, under the owned cover;
  - AppKit `NSSecureTextField`.
- **Background or frontmost.** Every lane but AppKit runs in the background. AppKit runs frontmost, because the secure editor activates the app during real input and breaks the cover witness.
- **Firefox is uncovered.** Its AX focus is stale or on the web area (#419), and its password readback answers `notTextField`.
- **Content is checked by the fixture, never through cua.** The page or app compares the final value locally, and only booleans leave the fixture.
- **Positives.** Empty short (8) and long (31) concealed secrets, a concealed replacement of a page-selected range, and a literal string.
- **Negative controls.** Two kinds:
  - a one-keystroke drop;
  - a synchronous add: the first genuine key-down inserts one extra character. This is the permanent control for the intermediate-match race (ruling 1ea561bc:842).
- **Known-limit control (informational).** A same-length rewrite.
- **Privacy.** Every surface is scanned for counts, lengths, ranges, values and masks:
  - native replies;
  - forwarded metadata;
  - sky results and errors;
  - rendered content and the next text observation;
  - engine stdout and stderr.
- **Schedule audit.** An instrumented copy, never pooled with stock, compares the read schedule:
  - short against long;
  - concealed against literal.

  It also requires that no `AXValue`, `AXValueDescription`, `AXSelectedText` or parameterized read is made on the password element.

## The final pin: 8bc291f1 (wave 11)

The PR head is `84562002`. It differs from the pin only in docs and comments: the limit sentence and the read-order comments.

[Run 44423869307](https://github.com/SSFSKIM/cua/actions/runs/44423869307): kit `7dad9a9c`, fix `8bc291f1eb2a9297c28636b1c97122619719904f`, main `517ab543`. Per lane, it ran:
- 20 paired positives;
- 30 concealed and 15 literal mutations;
- on AppKit, 5 selection controls.

The hosted workflow was green on all five lanes. Both seeded property tests passed on the pin: 2,000 paired different-length cases each, seeds `0x414F217` and `0x414F218`, the second with simulated live read costs. They gate outcomes and reasons, and no longer gate timing.

| Lane | Positives exact and length-confirmed | False adds | Drops refused | Reason parity, short vs. long | `fieldUnreadable` / `fieldChanged` on exact controls | Privacy / setup-invalid | Concealed failure reply, short / long p50 (ms, informational) |
|---|---:|---:|---:|---|---:|---:|---:|
| CfT | 20/20 | 0/30 | 15/15 | pass | 0 / 0 | 0 / 0 | 904 / 905 |
| Electron default | 20/20 | 0/30 | 15/15 | pass | 0 / 0 | 0 / 0 | 904 / 902 |
| Electron parity | 20/20 | 0/30 | 15/15 | pass | 0 / 0 | 0 / 0 | 912 / 906 |
| Safari large | 20/20 | 0/30 | 15/15 | pass | 0 / 0 | 0 / 0 | 910 / 907 |
| AppKit | 20/20 | 0/30 | 15/15 | pass | 0 / 0 | 0 / 0 | 906 / 903 |

What the table shows:
- **Main's baseline.** All 100 of main's positives typed exactly and answered unconfirmed `secure`, as expected.
- **Mutations.** Every concealed add and drop answered `lengthMismatch` at both lengths. The literal controls answered `lengthMismatch`, or `caretMismatch` on AppKit.
- **AppKit selection controls.** All five delivered exactly and answered `lengthUnreadable`.
- **`lateReply`.** The key appears nowhere.

The kit's README (`scripts/probe-414/README.md` at `b7aebd31`) has the full tables, including p95 times.

**Reply time.** Waves 6–8 answered every concealed failure at one fixed time, last post + 1100 ms. Live, that time was missed on 137 of 155 failures (wave 8, [run 44386516599](https://github.com/SSFSKIM/cua/actions/runs/44386516599)), and the exact schedule produced false confirmations under review. Ruling 1ea561bc:851 dropped it. A failure now answers when it is known. That moment, and in some fields the reason, can depend on the text typed: #423, a documented P3 limit. On the pin, short- and long-secret medians differ by at most 6 ms in every lane.

**The wave-10 run.** [Run 44420183099](https://github.com/SSFSKIM/cua/actions/runs/44420183099) on `3b67bf4d` gave the same results, with one exception. One Electron-parity long drop answered `noFocusedElement`: the AX snapshot named no focused element, a refusal decided before any key is posted, which main also shows. The strict workflow counted that row red. It did not recur on the pin.

## How the design got here

| Pin | Run | What it established |
|---|---|---|
| `c488d17a` | [44346952381](https://github.com/SSFSKIM/cua/actions/runs/44346952381) | **The race behind the quiet window.** AppKit wrongly length-confirmed 7/20 synchronous adds. The engine's confirming read came before the app's last edit. |
| `cbce12e2` (W = 50 ms) | [44349122918](https://github.com/SSFSKIM/cua/actions/runs/44349122918) | Drain timing per lane. This was the first sizing of the window. |
| `1f69470e` (W = 180 ms) | [44356891906](https://github.com/SSFSKIM/cua/actions/runs/44356891906) | **Full qualification:** 290 of 300 ASCII positives length-confirmed, all exact (AppKit's 10 selection replacements answered `lengthUnreadable`). 0/100 adds confirmed, 50/50 drops refused, fix privacy 0, setup-invalid 0. CfT and Safari passed the schedule audit 10/10 pairs each, with no forbidden reads. AppKit's worst direct drain gap was p99 72.6 ms (n = 269), and 3× that sets W = 220 ms. |
| `f217f062` (W = 220 ms) | [44370419752](https://github.com/SSFSKIM/cua/actions/runs/44370419752) | 125/125 positives, 0/100 adds confirmed, privacy 0. A narrow review found the failure time and reason still depended on the poll's history, which led to waves 6–8. |
| `45172367` (wave 6) | [44375463208](https://github.com/SSFSKIM/cua/actions/runs/44375463208) | **Regression:** `fieldChanged` on 78/150 concealed controls, because a bounded wrapper refused the final focus read. |
| `2e011dbf` (wave 7) | [44381626238](https://github.com/SSFSKIM/cua/actions/runs/44381626238) | **Regression:** `fieldUnreadable` on 62/150, because shrunk timeouts timed out live and the next reads queued behind them. |
| `405b63b3` (wave 8) | [44386516599](https://github.com/SSFSKIM/cua/actions/runs/44386516599) | Standard 100 ms reads in fixed slots fixed the regressions, but `lateReply` was set on 137/155 failures. Independent review then found false confirmations in the slot schedule. |
| `e8e2702e` (wave 9) | [44411274771](https://github.com/SSFSKIM/cua/actions/runs/44411274771) | **Ruling 851:** the fixed deadline, slots and `lateReply` are gone. A hold confirms only between two sampled reads, and a failure answers when it is known. Green on all five lanes. |
| `3b67bf4d` (wave 10) | [44420183099](https://github.com/SSFSKIM/cua/actions/runs/44420183099) | A concealed failure's reason and its may-show warning now come from one final batch and one focus read. An overshoot taints a concealed poll. |
| `8bc291f1` (wave 11) | [44423869307](https://github.com/SSFSKIM/cua/actions/runs/44423869307) | The classifying batch is the last read. A failed subrole read answers `fieldUnreadable` with the warning. The table above. |

**What the later runs did not repeat.**
- **The schedule audit** last ran on `1f69470e`. Waves 6–11 change when the reads happen, not which attributes they read: one batch of role, subrole, range and count. The seeded property tests pin the short-against-long schedule on the stub.
- **Non-BMP text.** It is lost in Chromium on both heads (#420). It lands exactly in Safari and AppKit.

## Limits

- **Right length, wrong content.** A length can't tell the right characters from wrong ones. The same-length rewrite confirmed 5/5 per lane on `1f69470e`, which is why the success note says "confirmed by its length only".
- **Long app stalls.** An app that stalls more than 220 ms between its last two keys can show a matching intermediate state for the whole window.
- **AppKit read failures.** A provider read failure gives a spurious `fieldUnreadable`.
- **Firefox:** #419.
- **Chromium non-BMP:** #420.
- **The plain path has no window yet:** #421.
- **Delivery-time concealed failures** answer at once: #422.
- **A failure's reply time, and in some fields its reason, can depend on the text typed:** #423.
