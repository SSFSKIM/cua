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
