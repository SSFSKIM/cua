# linux-engine-diff summary

## m4-gate-L3a (experiment settle; release gate)

candidate: sha256 90b9650eb599ec7f81f23e98b211085adb449fc906c17bd5093d9062934c0dbd, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (f96928983006); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43553123316/attempts/1, built from f96928983006fbcb3ef50afe1ecd87e7ef1ac1ad (refs/heads/feat/171-m4) on a github-hosted runner

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-input press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_down background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_up background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click_element background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input right_click background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input secondary_action background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input scroll background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text press_key background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text type_text background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-text clipboard_read background | shipped | 31 | 28 (0 / 0 / 28 / 0) | 0 | not reached |
| chrome-text clipboard_write background | shipped | 31 | 31 (0 / 0 / 0 / 31) | 0 | not reached |
| chrome-text activate_window background | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input press_key desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_down desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input key_up desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input click desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input move_relative desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input scroll desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag_handle desktop | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |
| chrome-input drag dedicated | shipped | 30 | 0 (0 / 0 / 0 / 0) | 30 | 30 consecutive |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-input press_key background | clean | 27307 | 5 of 5 | 0 |
| chrome-input key_down background | clean | 27317 | 5 of 5 | 0 |
| chrome-input key_up background | clean | 27318 | 5 of 5 | 0 |
| chrome-input click background | clean | 27385 | 5 of 5 | 0 |
| chrome-input click_element background | clean | 34063 | 5 of 5 | 0 |
| chrome-input right_click background | clean | 34125 | 5 of 5 | 0 |
| chrome-input secondary_action background | clean | 34060 | 5 of 5 | 0 |
| chrome-input move background | clean | 44934 | 5 of 5 | 0 |
| chrome-input scroll background | clean | 34232 | 5 of 5 | 0 |
| chrome-input drag background | clean | 34163 | 5 of 5 | 0 |
| chrome-text press_key background | clean | 20529 | 5 of 5 | 0 |
| chrome-text type_text background | clean | 28182 | 5 of 5 | 0 |
| chrome-text clipboard_read background | **5 of 5 runs did not run their input (context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent)** | 7158 | 0 of 5 | 0 |
| chrome-text clipboard_write background | **5 of 5 runs did not run their input (chrome-text clipboard_write background: the clipboard_read for its handle failed: context menu did not open; no clipboard action was sent; chrome-text clipboard_write background: the clipboard_read for its handle failed: context menu did not open; no clipboard action was sent; chrome-text clipboard_)** | 7118 | 0 of 5 | 0 |

**Incomplete or failed:** chrome-text clipboard_read background (shipped): no 30 consecutive passing runs in 31; chrome-text clipboard_write background (shipped): no 30 consecutive passing runs in 31; chrome-text clipboard_read background: the audit failed: 5 of 5 runs did not run their input (context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent); chrome-text clipboard_write background: the audit failed: 5 of 5 runs did not run their input (chrome-text clipboard_write background: the clipboard_read for its handle failed: context menu did not open; no clipboard action was sent; chrome-text clipboard_write background: the clipboard_read for its handle failed: context menu did not open; no clipboard action was sent; chrome-text clipboard_).

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 6809 requests, 996 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

