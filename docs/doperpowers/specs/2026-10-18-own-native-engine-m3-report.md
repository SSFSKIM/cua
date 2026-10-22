# #117 M3 report: engine-aware tooling, comparisons B and C, Linux approvals

Spec: docs/doperpowers/specs/2026-10-18-own-native-engine-design.md (M3; Decision Log entries from "M3 pre-flight" onward).
Branch feat/117-m3, from feat/117-m2b at 027179bc. The PR is opened after M2b's squash lands, rebased with `--onto origin/main 027179bc`.
Executed by plan-executor for maws-3f (Sminos-Session cua_repl#1ea561bc), 2026-10-21 to 2026-10-22.

## Status

The code is reviewed clean and the live work is done; the PR waits on M2b.

| Task | Commits | Review |
|---|---|---|
| M3.1, Linux approvals and the connection's approval memory | m3/linux, merged at 10846dfd | clean after three rounds |
| M3.2, doctor's engine row | 793195d6, a2b5993a | clean |
| M3.3, verify (`--engine`, `--bind`), the probe library, probe-lifecycle | c63f8cdc..33c53ad8, merged at d0a7ed29 | clean |
| M3.4, the acceptance scripts | 310f4f0b, d0da881d, bf16bb42 | clean |
| M3.5, live | below | n/a |

Whole-milestone reviewer-high (027179bc..903bfb53): one P1. `verify --bind` checked only that the app was running, so a TextEdit still running with no document open could be observed, and the engine would reopen it and capture its Open panel. Fixed in 95056ab7 and a01ce577 with a window-server check before each bind: an on-screen window, the same pid, and the windows read before the first bind. Decision Log entry d7a88efe. The re-review was clean.

Fixed during the hold: 10d423b2, 09228121 and dd72c0b1 narrowed the engine attestation's exemption to the lifecycle's own pre-dispatch rejections, and scenario 3's declared abandoned cell is now counted apart. The first version was reviewed incorrect (P1, too broad); the narrowed one was reviewed correct. Decision Log entry c50c1f43.

Records:
- Plugin bumped 0.16.0 → 0.17.0 (bdc6f287). The spec's constraint applies: Linux approvals change a default every Linux session sees.
- Acceptance 6 is left to M2b (8640b3bf).
- Evidence 0eb46d52.

## Live results

**Linux, cua-linux (Tart VM), 2026-10-22 00:37–01:42Z.** `--suite native` was run at base 027179bc and at head 10846dfd, each diffed against #115's gce vendor control. Evidence: `docs/doperpowers/research/2026-10-18-own-native-engine/m3/linux/`.
- base-vs-control: 1 difference (`configuration/backend`, the device's).
- head-vs-control: 1 difference (the same).
- base-vs-head: 0 real differences.
- The approvals' declared difference is retired.
- `list_windows` costs 11–13 ms in-cell.

**Mini, 2026-10-22 10:26:47–11:23Z.** The runs used controller 98f153b8 (M3 8640b3bf onto M2b 92618150), and item 8 was rerun on fead3a16. Engine build 0c363f8f was built and approved at the hold's start and left approved for M2b's hold 3. Evidence: `.../m3/hold/README.md`.
- Comparisons B (`--hosts`), C (`--end-to-end`) and A (`--engines`): VERDICT PASS, three runs a side.
- Acceptance 2: `verify --engine cua --bind com.apple.TextEdit` asked once on the first bind and nothing on the second; engine attested.
- Acceptance 9: `CUA_NATIVE_ENGINE=vendor verify` attested the vendor engine and host.
- `accept-native --engine cua --live-textedit`:
  - item 8's live checks PASS: probe-lifecycle with 7 results attested and 1 abandoned, the documented lifecycle behaviours, and the per-connection approvals;
  - items 7 and 8's named suites pass 141/141 on the mini;
  - item 1, the whole `npm test` on the mini, FAILs on 11 environmental cases, classified one by one in the evidence. The hosted Node 24 gate is the unit-suite authority.

## CI

- 0f7ae2f6 GREEN (39707333823).
- d7a88efe GREEN (39710076754).
- Controllers: 7310b6b2 (39712224629), 32e6a692 (39732241260), be132447 (39738075212), 98f153b8 (39742479422), all GREEN; fead3a16 (39770177712, see the PR).

## Friction

- cua #177: the cua-linux preparation row. Also already in the tracker: the native-pipe /tmp listing and the tz-probe loaded-Mac rows, both seen again on the mini.

## Slips

- I listed the owner's ~/Downloads on the mini over ssh while looking for the pinned archive. Owner file names entered my context; nothing was logged or committed. Reported to maws-3f, who reported it to the owner.
- To stop a superseded gate, I ran `pkill -f "ci-gate \."` on the MacBook, a pattern that could match another session's gate client. The only in-progress gate runs afterwards were my own. Reported.

## Residue

- **Node 26 portability.** `test/spike-engine-measure-groups.test.mjs`'s operator-console test fails deterministically under Node 26.4.0 (the mini's Homebrew default): the PassThrough output holds only the first prompt. It passes under Node 24, CI's pin. The defect predates M3.
- **The TextEdit fixture's report gap.** When accept-native runs the TextEdit fixture for item 8 without items 5 and 6 selected, the fixture's steps, including why it left TextEdit running, are not written into the report.
- **The fixture leaves its own TextEdit running** when it cannot confirm that its close left TextEdit windowless (5 off-screen windows on the mini). The fixture should quit what it launched, for example after confirming that no window it does not own is on screen, or report precisely why it can't.
- **accept-native's item selection drops dependencies.** `--items 7,8` judges the suites from item 1 but doesn't run item 1, so the result reads FAIL. A selection should pull in item 1 or refuse. Separately, the mini's `npm test` under accept-native's environment has 11 environmental failures (evidence README); until they are fixed, item 1 can't pass there.
- **Tech debt, already logged:** the doctor stop race and the engine_not_installed path naming the store's HOME (tech-debt-tracker.md, bdc6f287), and the Linux verify process-tree rule.
