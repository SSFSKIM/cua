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

Status at 2026-10-22 07:00Z: everything except hold 3 and its write-up is done. Hold 3 runs on c500e58b (build 0f6a95a2)
after M3's hold. This report is completed after it.

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
| M2b.5 hold 3 (the full triple on 0f6a95a2) | Pending |

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

## Findings for maws-3f to judge (model-facing; in Surprises)

1. midSwitch's `cua/entered` is one short at the stop in 3 of 8 recorded samples (chrome twice, electron once). A model resuming from it would type one character twice.
2. Chrome's background paste times out waiting for the clipboard read.
3. In cua's lane, background Electron fields cannot be given the focus by cua's click, so their prepare fails. The vendor's same rows pass.
4. Background Chromium actions are ineffective on cua (above). This is likely cause A, and hold 3 confirms or refutes it.
5. TextEdit background ⌘A selects, but not the whole document.
6. `r k` by pressKey under Korean composes 가 in Chrome and Electron in both lanes, while the expected file says `rk`. This is a spec question.

## Environmental friction (routed around; the board and #177 are not mine to write)

- A Tailscale ssh timeout stopped hold 2a's run 2 vendor lane, which was re-run.
- The vendor's "ChatGPT Computer Use" cursor overlay tripped the alert watch (fixed by 38ecfa07).
- Auto mode blocked a subagent's engine commit. I committed it under maws-3f's approval.
- `&` in a plain Bash call fails; use background execution.
- Three hosted CI flakes are logged as tech-debt rows.
- At about 05:50Z on 10-22, every session on the MacBook stopped, and load ran 100–300 afterwards. Nothing was lost: the branches were local and are now pushed.

## Slips

- In hold 1 I printed the signing identity's fingerprint. I reported it to maws-3f at the time.
- I told maws-3f "cua passes 5 of 8 re-judged midSwitch samples". That figure rested on the flawed re-judge and has been withdrawn.
