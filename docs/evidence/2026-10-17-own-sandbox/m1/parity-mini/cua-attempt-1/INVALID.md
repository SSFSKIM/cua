# Parity, cua side, attempt 1 (f8019bf): invalid

- **Run.** Started at 00:28:41Z, after the gate passed at load 3.64. Terminal had been raised at 00:23:37Z (HIDIdleTime 14460 s) because the vendor run left Chrome in front.
- **Pause.** At 00:34:11Z the hook paused the run before `cells/trusted/no-privileges-through-cell-import` cell-1: runner busy, 1 Runner.Worker, **34 queued macOS jobs**.
- **Why it was ended.** The controller ruled to end it. The cfprefs run had already shown that a pause longer than the runtime's 15-minute idle stop changes a cell's output (an idle-restart notice), so holding through a 34-job burst would have put that notice on many cua-side cells.
- **How it was ended.** Our own tree was ended at 00:42:16Z while held at that boundary.
- **Cleanup.** cleanup-prepared reported removed and siblingRemoved. No capability or sibling home was left. Terminal was in front, and Chrome was pid 36513 with 1 tab.

The vendor side (`../vendor`, 479/479 PASS) stays the valid vendor run.
