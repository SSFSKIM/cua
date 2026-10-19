# Sitting 2: answers recorded outside the harness (2026-10-19, hold 19:17:36Z–)

- Phase 0: the owner ran `security set-key-partition-list` at the mini's console and reported no error. The controller's check over SSH did not prompt, and codesign failed with errSecInternalComponent (`phase0.txt`): the login keychain is locked in an SSH session.
- Phase 1: the owner reports that no "cua Engine" capture confirmation appeared for the same-path replacement (b99ea967 over sitting 1's e3547c25) (`approve/owner.txt`).
- Phase 5: whether the vendor lane raised a capture confirmation for the scratch home's helper copy went unreported.
- Phase 6:
  - Input Monitoring was switched off by the owner before `u5-ax-only` and back on before `u5-input-monitoring`.
  - The engine was stopped before each pass, so each pass launched it fresh.
- Phase 7: the owner confirmed that both inputs (one key; one click into the background TextEdit window) were made while the engine typed.
- Phase 8, U7: the grants for the fresh-id bundle ("cua Engine probe", io.github.ssfskim.cua.engine.u7) were switched on by the dispatching session through cua's remote device, on the owner's delegation, not by the owner's hand.
  - The dispatching session looked at the screen at about 20:31Z and saw no prompt window.
  - The TCC stream (`u78-tcc.jsonl`) shows what happened. The engine's Accessibility request was raised. Within about 40 ms (20:27:50.98Z), universalAccessAuthWarn set it to Denied (System Set), so no prompt stayed on screen.
- Phase 8, U8: "no confirmation appeared" for f2 (the same-path rebuild a25da09a) and for f3 (the new-path copy).
  - Sources: the on-screen window list at 20:39:39Z and 20:40:10Z, read by the dispatching session, and tccd, which logged no "Notifying for access" for either move.
  - The owner's own answer was not received at the time of recording.
- Phase 8: the conditional `tccutil reset` was not run. U7 showed that the fresh id's prompt is suppressed the same way, so the engine's own id is not in a special state.
- Engine exits over the hold (`engine-exits.txt`): 27 starts and 27 logged exits, all "shutdown requested". No crash report was added.
- The TCC streams (`u5-tcc.jsonl`, `u78-tcc.jsonl`) had the signing certificate's common name redacted on collection.
