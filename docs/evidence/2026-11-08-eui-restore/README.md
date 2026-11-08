# #293: the next engine restores the EUI a SIGKILLed engine left on in Chrome (hosted macOS, 2026-11-08)

## Setup

- **Run:** https://github.com/SSFSKIM/cua/actions/runs/42520338893, comparing main 81a43091 with fix/293-eui-restore 1feda4af.
- **Runners:** 3 GitHub-hosted runners, image 20261102.0473.1, macOS 26.7.2 (25G332), Chrome for Testing 156.0.8078.80.
- **Repetitions:** each runner ran every cell twice, so n=6 per cell per head.
- **Window order:** TextEdit was frontmost before and after every cell.
- **The kit:** `probe/293-hosted` at c82b1cf7, built on #288's hosted kit.
- **How it was read:** everything came from outside the engine.
  - An EUI-only reader (`ax serve`) took its first read the moment B's socket accepted a connection.
  - A full sampler read AXPress and the character box.
  - Scripted window moves and resizes were counted in frames.

Earlier kit runs against bc44b120 (42517821430 and 42518750396) agree in every cell; they add 12 more restores, 12 of 12. Per-row data and the analyzers are under `~/.local/share/probe-293/` on the MacBook.

## Results

The cells:
- **c7:** engine A observes Chrome, A is SIGKILLed, then engine B starts on the same socket directory, observes, and shuts down.
- **c8:** the same, with EUI already written true before any engine starts. Under A3 that EUI is not cua's.

| Step | c7 branch | c7 main (the control) | c8 branch and main (A3) |
|---|---|---|---|
| A observes | EUI written (prior false, -25208), AXPress on; **entry `<chromePid>-<start>.json` naming A**, 6/6 | the same; no record | prior true: no write, **no entry**, 6/6 |
| After A's SIGKILL | EUI true; moves animate in 3–7 frames (median 4), settling in a median 129 ms, against 2 before | EUI true; 3–6 frames | EUI true |
| B starts | **EUI false.** Reads begun when B's socket accepted read false 6/6, and no read begun after B's listen read true. Entry gone; stderr: `wrote AXEnhancedUserInterface false on pid N, left on by engine pid M, which is gone`; moves take **2 frames**, 12/12, settling in a median 41 ms | EUI true 6/6; nothing logged; 4–6 frames | EUI true; nothing restored |
| B observes, then shuts down | B writes EUI and owns it with a new entry; shutdown writes it false within 13–41 ms; entry gone; then 2 frames | prior true, so B doesn't own it; **EUI stays on after B's shutdown** (the defect) | EUI stays true throughout |
| B's start to listen | median 81 ms with a restore | median 82 ms | median 115 ms |

The restore's cost is within the runner's start-time noise.

## Limits

- **EUI stays on until the next engine starts.** Nothing starts an engine only to restore; the service starts one at its next use.
- **The record belongs to one engine directory.** An engine on another socket, such as a harness's `CUA_ENGINE_SOCKET`, restores only its own directory's entries.
- **Leaving complete mode** (AXPress and the character box gone) was confirmed at the first full sample after B's listen, 67–146 ms after B was spawned. Only EUI's own value was read at the listen.
