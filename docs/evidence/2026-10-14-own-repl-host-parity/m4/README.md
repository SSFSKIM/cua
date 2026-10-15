# M4 Linux vendor controls (#116)

These controls cover the Linux vendor host on cua-linux, `--suite all --through M4`, at oracle commit a5bb1cf. Task 3 grades the own host against this pair.

- `vendor-1` and `vendor-2` were each recorded fresh at a5bb1cf. Each has 493 cases, of which 490 are covered. Each records 91 connections, all attesting vendor `rmcp 1.5.0`.
- `vendor-diff.json`: `ok:true`, no differences, no expected differences, and no pending cell that unexpectedly passed.
- Two scroll-member obligations are pending across 14 cells (`input/coordinates#scroll`, `input/dom#scroll`) because of #141, a VM Chrome `Input.synthesizeScrollGesture` stall that affects both hosts. Those members are proven on the mini by the M3 api suite. The pending cells are never counted as covered.
- `linux-vendor-sandbox-launcher-fail-open`, the M0 vendor defect (#135), is still declared.
- `diagnostics/` holds earlier calibration and failed runs. They are labelled, not counted, and not spliced into the pair.
- `m3-*-docs-rediff.json`: the committed M3 docs-profiles pairs re-diffed with the browser-id identity mapping still show 0 differences.
- `gates.json` records every gate attempt. The full-suite runs at the final head were not clean under machine load; see the M4 PR for the controller's re-run.

## Environment and reproduction
Linux execution used cua-linux’s parity clone `/home/admin/Developer/GitHub/cua-parity`, profile `me`, H4 home `/home/admin/.local/share/cua-h4`, DISPLAY `:0`, and vendor runtime `26.928.40906-linux-arm64`. Proxy Node is v22.23.3; vendor Node is v24.21.0. The prepared own Node is `/home/admin/.local/share/cua-parity-node/node-v24.18.0-linux-arm64/bin/node` (v24.18.0), supplied through harness command environment rather than a shell profile. Registration manifest path/hash and cua route provenance are retained in prepare.json.

Observed Chrome executable is `/opt/google/chrome/chrome`, with `--profile-directory=Default`, `--disable-gpu`, `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`, and `--disable-background-timer-throttling`. DISPLAY is honestly labelled `prepared-X-session (process environment unavailable)`, not falsely attributed to Chrome’s erased process environment. One positional argument was omitted. The session/owner performed Chrome changes; I never launched, rebound or reconfigured it.

From the oracle checkout, each accepted run used:
`node scripts/repl-parity.mjs run --host vendor --device cua-linux --suite all --through M4 --pending-cell 'input/coordinates#scroll' --pending-cell 'input/dom#scroll' --pending-reason '#141 VM Chrome synthesizeScrollGesture stall (both hosts, browser-service path); proven on the mini in M3 api' --out <new-directory>`

Then:
`node scripts/repl-parity.mjs diff <vendor-1-directory> <vendor-2-directory>`

No expected-difference file was supplied for this vendor determinism comparison. The persisted pending declaration—not a diff-time override—governs the two logical cells.


Native observations keep assertions and counts only. No real window AX text, image bytes or secret values are persisted. Up to four fixture downloads from an earlier pre-calibration run may remain in the VM's `~/Downloads`. They were left there because their paths were never logged.

Transcribed by the plan-executor from M4 task 1's handback, because the executor's tool rules forbid writing Markdown reports.

## Task 3: cua's own host on cua-linux (2026-10-15)

Source under test: `a5ccc1b`, prepared in the parity clone. The prepare facts are in `cua-prepare/prepare.json`: profile `me` ready, H4 home, own Node v24.18.0 passed through the harness command environment, proxy Node v22.23.3, the same Chrome launch line and the same registration manifest as the vendor controls. Device scratch paths used the run-labelled prefix `/tmp/cua-m4t3-` (`CUA_PARITY_SCRATCH_PREFIX`). None remained afterwards.

- **Own `--suite all --through M4`, `cua-1/`**: 493 cases recorded and complete; assertions PASS; 491 covered. Only the two #141 scroll obligations are pending (14 cells, identical declaration and reason; 0 unexpected pending passes). The own host has no recorded vendor defect: the #135 sandbox fail-open is the vendor's. All 91 connections attest `cua-repl-host 0.4.0` in `initialize`, and every one's first real result carries `{host: cua, version: 0.4.0}`.
- **`cua-diff.json`**, from `node scripts/repl-parity.mjs diff m4/vendor-1 m4/cua-1 --expected test/repl-parity/expected-differences.json`: `ok: true`, **0 differences** over 490 compared cases and 1,392 cells. The 1,360 expected entries are identity slots (`cua/replHost` markers and selected-host identity: 1,359) plus the one #135 security departure; nothing else was used. `allAssertionsPassed: false` reflects only the vendor side's recorded #135 defect.
- **Linux acceptance runners, `accept/runs/`**: the unchanged `scripts/accept/linux-native.mjs`, `linux-chrome.mjs me` and `linux-chrome-features.mjs` each printed `status: PASS` and exited 0. `accept/run.mjs` runs each one in the clone, inside the X session, with `CUA_REPL_HOST=cua` plus the Concrete Steps surfaces, the own Node and, for the two browser runners, `CUA_BROWSER_SERVICE=cua` and the H4 home. `accept/attest-serve.mjs` (M3's recorder, plus a default-home fallback and the requested selection) recorded every `cua serve`, and `accept/attest-summary.mjs` judged the records: one session per runner. Each session's source record names `a5ccc1b`, a clean tree, release `26.928.40906-linux-arm64` and own Node v24.18.0. Each session answered `initialize` as `cua-repl-host 0.4.0`, and every js result carried the marker (3, 3 and 8 host results). The features runner's informational raw-CDP download alternative reports SKIP, as it is designed to.
- **Before these final runs**, an own-host attempt is kept in `diagnostics/task3/cua-1-pre-fix` (harness `e69ad55`; incomplete, labelled, not counted). It found two real own-host differences, both in nativePipe, and both are fixed test-first in `src/repl-host/native-pipe.mjs`:
  - A saturated listener's refusal read `native pipe connect failed: connect EAGAIN <path>`. The vendor reads `failed to connect native pipe: Resource temporarily unavailable (os error 11)`. OS errors now read as the vendor's Rust `io::Error` display does.
  - A peer that closed with unread data was reported close-only. On Linux the vendor's reader sees the reset and reports `Connection reset by peer (os error 104)` before the close. A read-side error now closes with its sentence. A write into a pipe the peer left stays close-only, which is macOS's observed behaviour: there Node sees a write `EPIPE`.
  - The same attempt also showed that the native and live secret fixtures' scratch-HOME guards only knew the `cua-m4t1-` prefix. That was a harness fix. It also masked a failure's cause behind its cleanup error and then hung. `diagnostics/task3/secrets-live-check` (25/25 PASS at `a5ccc1b`) is the focused re-check of the secret lane.

Commands, from this worktree:
```
CUA_PARITY_SCRATCH_PREFIX=cua-m4t3- node scripts/repl-parity.mjs prepare --device cua-linux --commit a5ccc1b40b85fd688cd4f47d52a70ee3a09ec09b --profile me \
  --home /home/admin/.local/share/cua-h4 --node /home/admin/.local/share/cua-parity-node/node-v24.18.0-linux-arm64/bin/node --out <dir>
CUA_PARITY_SCRATCH_PREFIX=cua-m4t3- node scripts/repl-parity.mjs run --host cua --device cua-linux --suite all --through M4 --pending-cell 'input/coordinates#scroll' \
  --pending-cell 'input/dom#scroll' --pending-reason '#141 VM Chrome synthesizeScrollGesture stall (both hosts, browser-service path); proven on the mini in M3 api' --out m4/cua-1
node scripts/repl-parity.mjs diff m4/vendor-1 m4/cua-1 --expected test/repl-parity/expected-differences.json
CUA_PARITY_SCRATCH_PREFIX=cua-m4t3- node m4/accept/run.mjs linux-native|linux-chrome|linux-chrome-features m4/accept/runs
```
The native comparison is reported in `../../2026-10-14-own-repl-host-native/README.md`: it is comparable and returned FAIL. A same-sitting vendor control shows the slowdown is this machine's load, so a quiet re-measure is owed.
