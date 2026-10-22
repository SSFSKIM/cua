# M3 hold on the mini, 2026-10-22 10:26:47Z–11:23Z

The hold for #117 M3 (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M3.5). CI-opt held the mini from 10:26:47Z; the put-back was done by 11:23Z and checked over ssh by maws-3f. The hard end was 12:31:47Z.

## What the runs ran on

- **Phases 1 and 2** ran on the controller **98f153b8**, which is feat/117-m3 at 8640b3bf merged onto M2b's final head 92618150. The comparison tables record the same commit.
- **Item 8's live rerun and the probe-lifecycle check** ran on **fead3a16**, which is the same controller with the reviewed harness fix c50c1f43 merged in (the Decision Log entry "M3 hold, 2026-10-22").
- **Engine:** both controllers carry engine build 0c363f8f4512b24891ce22af50f6515f99af4b008bee09770245de03b8c7e80d. The operator built and approved it at the hold's start: `engine build` at 10:29:06Z, `engine approve` at 10:29:15Z. Accessibility, Screen Recording and Input Monitoring were all granted and the signature identity matched. It was left installed and approved for M2b's hold 3.
- **Controllers:** both were pushed to the helper ref `m3/hold-controller`. Neither is the PR, which is feat/117-m3 rebased onto main.

## Comparisons A, B and C: all PASS

`native-baseline.mjs run --device mini --approved-runtime <the approved vendor home> --approved-engine <the approved cua Engine.app> --experiment m3hold` was run three times per lane, interleaved vv, vc, cc. All 9 runs completed between 10:32 and 10:48Z with no leftovers ([runs/sequence.txt](runs/sequence.txt)).

| Comparison | Command | Verdict |
|---|---|---|
| B, host only | `compare --hosts runs/vc runs/cc` | [PASS](compare-B.md) |
| C, end to end | `compare --end-to-end runs/vv runs/cc` | [PASS](compare-C.md) |
| A, engine only (for the record; M1b and M2a own it) | `compare --engines runs/vv runs/vc` | [PASS](compare-A.md) |

## Acceptance 2 and 9: PASS

The TextEdit scene came up (`scenes-mac up textedit`), then two verify runs, then the scene came down. Results: [verify/](verify/).

- **Acceptance 2:** `node verify.mjs --engine cua --bind com.apple.TextEdit` exited 0.
  - The first bind asked once and was accepted; the second asked nothing. The window check found 2 windows.
  - Engine `cua`, attested 5 times, build 0c363f8f.
  - The socket's one client was cua's own Node.
- **Acceptance 9:** `CUA_NATIVE_ENGINE=vendor node verify.mjs` exited 0.
  - Engine `vendor`, pinned by `CUA_NATIVE_ENGINE`, attested 3 times with version 26.924.1001281 and build 26.928.40906-darwin-arm64, on the vendor host.
  - Every executable was the expected one.

## accept-native items 7 and 8 on cua's engine

The scratch `CUA_HOME` was installed with `--archive` and `--node-archive` from the pinned archives. `scripts/repl-parity/archive-cache.mjs fetch` fetched them and checked their sha256.

**First run, on 98f153b8, `--items 7,8`** ([accept/accept-items-7-8-first.json](accept/accept-items-7-8-first.json)). Two problems:
1. The suite checks of items 7 and 8 read item 1's `npm test` verdict, so they need `--items 1,7,8`. The runbook had left item 1 out.
2. `probe-lifecycle --engine cua` refused on scenario 2's late call ([probe-lifecycle/probe-lifecycle-98f153b8-refused.json](probe-lifecycle/probe-lifecycle-98f153b8-refused.json)). The task lifecycle rejected that call with `task_ending` before dispatch, so it carried no attestation. The fix (10d423b2, 09228121, dd72c0b1) passed review on its second round. The rule is in the Decision Log entry "M3 hold, 2026-10-22":
   - only a pre-dispatch rejection is exempt;
   - scenario 3's declared abandoned cell is counted apart, and the count must be exactly 1.

**Rerun, on fead3a16, `--items 1,7,8 --live-textedit --engine cua`** ([accept/accept-items-1-7-8-fead3a16.json](accept/accept-items-1-7-8-fead3a16.json)). It ran with cua's managed Node 24.22.0 first on PATH, for the reason given under item 1 below.

- **Item 8, live checks: all PASS.**
  - Cancel does not stop a running cell.
  - end_task after a cancelled cell ends the task.
  - end_task with work in flight rejects new work as `task_ending` and ends after the work.
  - Uncertain completion fails closed (`completion_timeout`; the stuck cell gets `connection_failed`) and leaves no runtime.
  - An idle EOF closes cleanly.
  - probe-lifecycle pinned the cua engine: 7 results attested, `abandonedUnattested` 1, no closed connection holding the engine socket. A standalone run is in [probe-lifecycle/probe-lifecycle-fead3a16.json](probe-lifecycle/probe-lifecycle-fead3a16.json).
  - Per-connection approvals, observed by behaviour: connection A bound twice and was asked once; connection B bound once and was asked once.
- **The suites items 7 and 8 name** (services-sky, secrets-reference, services-sky-trust, secrets-store, mcp-lifecycle, mcp-server, mcp-upstream, serve-cli) pass 141/141 on the mini under Node 24.22.0 and under Homebrew Node 26.4.0 ([accept/items-7-8-named-suites.txt](accept/items-7-8-named-suites.txt)).
- **The items' suite checks still read FAIL**, only through item 1's verdict below.

### Item 1 (`npm test` on the mini): FAIL, environmental

**The authority for the unit suite is the hosted gate on Node 24**, the version ci-kit pins (`node: "24"`). It is green at 98f153b8 (run 39742479422) and at fead3a16 (see the PR's Validation Evidence).

**The Node 24 PATH note.** The mini's default node is Homebrew v26.4.0. Under it, `test/spike-engine-measure-groups.test.mjs` fails deterministically on its operator-console test: the PassThrough output holds only `first? `. That test predates M3 and passes under Node 24, so it is a Node 26 portability defect (residue). For that reason the rerun put cua's managed Node 24.22.0, the runtime's own Node and CI's version, first on PATH.

**A direct `npm test` at 10:51Z under Homebrew Node 26** had 2 failures in 4145 tests ([accept/npm-test-homebrew-node26-direct.txt](accept/npm-test-homebrew-node26-direct.txt)): that operator-console test, and `native-pipe-long-path`.

**Under accept-native's suite environment with Node 24 first, 11 tests failed.** None is in a file M3 changed in a way it touches, and none failed in the direct run:

| # | Test | File | Class |
|---|---|---|---|
| 1 | a start-up failure (MAWS does not trust the probe) exits nonzero… | test/maws-live-probe.test.mjs | environment: failed only under accept-native's run (Node 24 first on PATH, its suite environment); passed in the direct run (cause not isolated in the hold) |
| 2 | SIGINT goes through the one shutdown path… | test/maws-live-probe.test.mjs | same |
| 3 | SIGTERM goes through the one shutdown path… | test/maws-live-probe.test.mjs | same |
| 4 | macOS: a 192-byte socket path connects… | test/repl-host/native-pipe-long-path.test.mjs | known #177 row: its /tmp listing sees concurrent tests' `cua-eng-*` directories; passes alone |
| 5 | Linux prepare discovers H4 through the fresh preparation helper… | test/repl-parity/topology.test.mjs | environment: failed only under accept-native's run with Node 24 first on PATH; passed in the direct run (cause not isolated in the hold) |
| 6 | prepare preserves explicit diagnostic options and refuses a dirty clone… | test/repl-parity/topology.test.mjs | same |
| 7 | all ordinary launches clear ambient Node overrides and preserve private scratch HOME | test/repl-parity/topology.test.mjs | same |
| 8 | a probe runs fresh children under the launcher, kills a hung one… | test/sandbox-probe/tz-probe.test.mjs | the known #177 loaded-Mac row's test; failed only under accept-native's run; passed in the direct run |
| 9 | the CLI accepts the documented options, writes its result… | test/sandbox-probe/tz-probe.test.mjs | environment: failed only under accept-native's run; passed in the direct run (cause not isolated in the hold) |
| 10 | a probe records its HOME class, its own scratch HOME's path, the Node… | test/sandbox-probe/tz-probe.test.mjs | same |
| 11 | under --home real the child gets the account's HOME… | test/sandbox-probe/tz-probe.test.mjs | same |

## The TextEdit the first accept run left running

The first accept-native run's TextEdit fixture launched TextEdit (pid 52348) at 10:50:01Z and left it running. The fixture does that when it cannot confirm that its close left TextEdit with no window. Because that run selected neither item 5 nor item 6, the fixture's steps, including its reason, were not written into the report (residue).

At the put-back:
- FrontWindowProbe, which reads window numbers but no names, showed 5 layer-0 windows, none on screen.
- With maws-3f's approval, `kill -TERM 52348` was sent; it exited within 1 s.
- TextEdit's container held no Saved Application State and no Autosave Information entries, and there was no TextEdit entry in ~/Library/Saved Application State. Nothing was removed.

## Device readings

See [device-readings.txt](device-readings.txt), which covers before phase 1 and after the put-back.
- Engine stopped, with build 0c363f8f installed and approved.
- No TextEdit, Chrome for Testing or Electron fixture running.
- Finder: ShowSidebar=1; ShowStatusBar and ShowPathbar unset.
- Input source ABC, per-context 0; front app Terminal at 11:23Z.
- No SecurityAgent; engine.json mtime unchanged.
- cua-parity at fead3a16, clean.
- The four cua-shim processes of the owner's Claude Desktop sessions never had a child at any guard read, so there was no outside interference.
