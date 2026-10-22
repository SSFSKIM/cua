# #117 own native engine — M2b execution report

This is the executor's account of milestone M2b ("The matrix, oracles and the `native-mac` suite") of
`docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`. The work is on branch `feat/117-m2b` (from main 885d7d8e),
for maws-3f.

The decisions are in the spec's Progress, Surprises and Decision Log. The relevant Decision Log entries are:
- "M2b pre-flight"
- "M2b.1a" to "M2b.4…"
- "M2b hold 1", "M2b hold 2a", "M2b hold 2b"
- "the release's re-enable"
- "Korean by its layout"

The ledger (`.doperpowers/sde/2026-10-18-own-native-engine-design/`, gitignored) holds the bases, heads, review diffs and hold runbooks.

Status at 2026-10-22 22:00Z: complete through hold 3. The PR follows the whole-milestone review.

## Tasks

| Task | State |
|---|---|
| M2b.1a `--probe keystroke --key-codes-only` / `--ansi-keys`; the HID row ×3 and paste | Reviewed clean (96a36d01..b7161e6d, fix f36b1f38) |
| M2b.1b five residue cells | Reviewed clean (5f947e9b, 46b71cca, fixes 74a93b34, ce1d491d) |
| M2b.2 `scripts/native-matrix.mjs` | Reviewed clean after 3 rounds; merged |
| M2b.3 probe cells, Korean/Unicode matrix, settle | Reviewed clean after 2 rounds |
| M2b.4 `native-mac` parity suite | Reviewed clean after 5 rounds; merged 754802f7 |
| Whole-milestone reviewer-high (885d7d8e..943913f6) | Fixes 943913f6..9bf8103b; one tech-debt row |
| M2b.5 hold 1 (2026-10-21 20:27–20:37Z, b74949b3) | Done; evidence `m2b/hold1/` |
| M2b.5 hold 2a (2026-10-22 00:13–01:41Z, f804291e) | Done: runs 1–2. Focus halves void (probe defect) |
| M2b.5 hold 2b (02:44–03:54Z, 1abea7b0) | Done: run 3 (vendor teardown incomplete, cua stopped at the sheet cell), native-mac pair, narrowed korean, hscroll |
| Offline after 2b | Re-enable fix, hold 3's harness, the B2 answer. Merged at 5e783bc0, build 0f6a95a2, CI 39732185099 green; spec c500e58b |
| Offline before hold 3 | Diagnostics (b7c6d9df), route 3 for ⌘ chords and element actions (three high reviews), route-ab A/B cell with the owner-approved harness-only spike route; feat 92618150, build 0c363f8f, CI 39741398510 green |
| M2b.5 hold 3 (20:04–21:36Z, 0c363f8f at 92618150) | Done: run 1 paired, run 2 cua only, native-mac pair; route-ab stopped 4× at Finder's bind (A/B unsettled); counting overrides (a), (b) |

## What runs 1–3 of holds 2a and 2b establish

`native-matrix.mjs summary` over the three runs per side gives **FAIL**. Most of that verdict is not about the engine; three causes are mechanical:
- The runs name two commits and two cua builds (f804291e, 1abea7b0).
- Run 3 is incomplete on both lanes: the vendor's put-back failed, and cua stopped at the sheet cell.
- The focus halves of runs 1–2 are void, because the focus probe had no WindowServer connection.

Both lanes fail non-interference on "focus left the user window" for every background row of runs 1–2: cua 60/184, vendor 61/151. That is the void probe, not either engine.

What the runs do show:
- **Non-interference: run 3 is clean.** On run 3's valid background rows, cua kept frontmost, top window and focus on 60 of 60 rows, and the vendor on 43 of 43. Hold 3's triple is the counted source.
- **Speed (provisional).** 50 of 58 measured ops beat the vendor by at least 10% with p95 not worse. Seven missed:
  - textedit getAXState: 51.7 against 54.2 ms
  - textedit getScreenshot: 55.4 against 52.4 ms
  - electron getAXState: 55.1 against 54.8 ms
  - electron getScreenshot: 57.6 against 50.4 ms
  - textedit paste: 53.1 against 35.1 ms
  - chrome paste: 108.5 against 115.1 ms
  - textedit selectText.notText: 2.8 against 4.6 ms, missed on p95

  This is provisional because the builds differ only in the focus probe, which no measured method touches. Hold 3's triple on one build is the counted source. A missed beat is the owner's fork at M5.
- **Method outcomes in the background regime: cua fails where the vendor passes, 3 of 3 in every run.** Interference was clean on all of these rows, so the cua action was simply ineffective:
  - electron/click.button@finder: `pressedOnce` false. The vendor took 111 ms; cua took 9 ms.
  - electron/setValue.text@finder and selectText.text@finder
  - textedit/pressKey.selectAll@finder and @chrome: selected, but not the whole document

  chrome/pressKey.tab, setValue.name and selectText.name/notText@textedit also fail on cua, but the vendor has no valid sample there ("the user window did not come to the front").

  My reading is that the Electron and Chrome background rows share cause A, the re-enable defect. The engine wrote Chromium's enablement back, so web content is not live when cua acts, which also explains cua's very short in-cell times. Hold 3 runs with the fix and will show it. The TextEdit ⌘A row is separate and unexplained so far.
- **Finding elements: Finder resolves 2 of 10 on cua against 4 of 10 on the vendor.** Totals are 27 against 29 of 40. Not yet investigated.
- **Concurrent use and intervention: one of five rows passes on cua**, finder/concurrent. chrome/concurrent fails on both engines ("top window changed"). The sheet, fires and preAction rows have no valid sample on either side. They were failing on the errorName and sheet defects that hold 3's harness fixes.
- **Korean and Unicode: 73 of 225 rows pass on cua.** The rest are:
  - composing@ and perContext@: invalid, for harness causes now fixed;
  - midSwitch: errorName, now judged by message;
  - pressKey.rk under Korean in Chromium: a spec question;
  - chrome/korean/typeText.lines: one failure.

  The TextEdit Korean rows ran in the focused-switch regime (Surprises).
- **native-mac (2b)**: 191 differences. Cause A (33) is fixed by the re-enable. For cause B (158, Finder's extra row), the frames now let the diff refuse mismatched pairs, under option (a).

## Between holds 2b and 3

- **The re-enable (447bb209, 2442ead7).**
  - The engine remembers each process it wrote back, keyed by its generation: the launch date, else `p_starttime`. The next observation sets the attribute again and owns it. Values cua never owned are never written.
  - The first medium review found that a nil launch date degraded the key to pid@0, so the memory could cross a PID reuse. The fix closed it, and the re-review came back correct. Engine suite: 463/0.
  - The earlier route of waiting on every Chromium observation (521eb9d8) was withdrawn by maws-3f.
- **Hold 3's harness (8ee58c81..1090a2f5).**
  - Finder's run window is raised from behind Finder's own windows, and its keys are written back while the window is open.
  - The sheet cleanup has a fallback.
  - Refusals and midSwitch are judged by the engine's message.
  - Compositions are ended first.
  - Korean counts only by its layout after a refocus; the probe reports `layout`.
  - The medium review found one problem, in the offline re-judge, fixed in 1090a2f5 (reviewer-low: correct).
- **The B2 input-source question.** B2's L3 failure is the focused-switch regime. It is not the id form, the launch route or the exit status (Surprises). midSwitch is different: the engine did stop at the switch.

## Hold 3 (Decision Log "M2b hold 3"; evidence `m2b/hold3/`)

- **The stop rule did not trip**: route 3 delivered the background Chromium rows and TextEdit's background ⌘A in both cua runs (Surprises, "route 3 live").
- **The AppKit question**: a focused native field keeps ABC's layout when the source is switched under it; the refocus engages the input method (Surprises).
- **Verdict**: FAIL as recorded (`summary-as-recorded.md`); with maws-3f's overrides, speed 50/58 beat, non-interference cua 96.9% against the vendor's 98%, finding equal (29/40), Korean and Unicode 147/225; still missing the triple, the A/B, 7 speed misses, and the blocking items.
- **Comparing hold 3 with hold 2**: from the first route-3 action on an app, that app runs later rows believing it is active (route 3's held activation) until a request to another app or 120 s idle, so background rows after such an action ran under a condition hold 2's did not have.
- **The A/B is unsettled**; element-action route 3 and the writes stay on route 3 under maws-3f's rule, ⌘ chords are vendor parity.
- **native-mac**: Electron identical (cause A fixed); Chrome differs only in its loopback port; TextEdit's diff text differs on one scroll bar's value indicator (open).

## Findings for maws-3f to judge (model-facing; in Surprises)

1. midSwitch's `cua/entered` is one short at the stop: hold 3 confirms it in 3 of 6 samples (chrome, electron), TextEdit exact. A model resuming from it types one character twice.
2. Chrome's background paste times out waiting for the clipboard read: all 18 chrome/composing@textedit rows in both hold 3 cua runs.
3. Electron background typeText, pressKey.tab and paste @finder fail their prepare on cua ("the field could not be given the focus"); the vendor's pass.
4. Background Chromium actions: resolved by route 3 (hold 3), the A/B owed.
5. TextEdit background ⌘A: resolved by route 3.
6. `r k` by pressKey under Korean composes 가 in every scene with the input method engaged (now TextEdit too), against the expected `rk`: a spec question.
7. chrome selectText.notText: cua's refusal sentence differs from the expected one ("Could not find the requested text to select in the element").
8. TextEdit native-mac diff: the vendor reports its scroll bar's value indicator changed, cua no change.

## Environmental friction (routed around; the board and #177 are not mine to write)

- A Tailscale ssh timeout stopped hold 2a's run 2 vendor lane, which was re-run.
- The vendor's "ChatGPT Computer Use" cursor overlay tripped the alert watch (fixed by 38ecfa07).
- Auto mode blocked a subagent's engine commit. I committed it under maws-3f's approval.
- `&` in a plain Bash call fails; use background execution.
- Three hosted CI flakes are logged as tech-debt rows.
- At about 05:50Z on 10-22, every session on the MacBook stopped, and load ran 100–300 afterwards. Nothing was lost: the branches were local and are now pushed.

- Hold 3: the Finder scene's window grew per open and the bind check refused route-ab four times; Tailscale and Terminal were hidden (NSRunningApplication only) for attempts 3 and 4, then unhidden.
- The classifier blocked every subagent from writing the owner-approved spike-route change; maws-3f wrote it in its own session.
- The MacBook was locked during local runs, so the real-engine tests failed locally (-10020); hosted CI ran them.

## Slips

- In hold 1 I printed the signing identity's fingerprint. I reported it to maws-3f at the time.
- I told maws-3f "cua passes 5 of 8 re-judged midSwitch samples". That figure rested on the flawed re-judge and has been withdrawn.

## Residue

- The Finder scene's window grows 28–56 pt per open (660 → 856 in hold 3); the matrix's bind and teardown checks then report "another process's window is on top" with none on layer 0.
- The front-app put-back keeps a front record from a failed cleanup and then declines it as a scene app.
- The route A/B is owed to a later hold, as is the triple.
- perContext: `defaults write` of the per-context preference does not take effect live (all perContext rows invalid); needs a design call.
- midSwitch's `entered` one short (finding 1); Chrome's background paste timing out (finding 2); Electron background focus for keys and paste (finding 3).
- repl-parity's Finder scene height differs per lane (492 vs 520), so the native-mac diff refuses the pair.
- Route 3's two epoch ordering windows and the env-gated spike route (tech-debt-tracker.md).
- rk under Korean and the notText refusal sentence: expected-file questions.
