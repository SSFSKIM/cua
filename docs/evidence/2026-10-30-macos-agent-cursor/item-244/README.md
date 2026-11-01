# #244 live check: a fresh Electron app's first observation (2026-11-01, MacBook, 07:27–07:31Z)

Branch head bd6ee466; cua's engine build ed8521553753, built and approved for the slot, with the owner hands-off. The
owner's engine dd7a09235885 was saved first and restored and approved afterwards, with 0 other connections. The
judge's tables are in [item-244.md](item-244.md). The kit is `node scripts/cursor-sitting.mjs first-observation`
(runbook "Item 244" in [../README.md](../README.md)).

Each variant runs on a freshly launched Electron fixture whose accessibility is off at start. The session binds
nothing, so the first cell makes the session's first engine observation.

- **plain, cua: PASS.**
  - The button is in the first observation, at index 13: 27 lines, the page included. The web area was found at the
    first check, after a 116 ms wait, and the observation took 324 ms.
  - Exactly 1 enablement write in the session. The 5 warm observations neither read nor wrote it (prior `owned`).
  - Complete mode came on 2077 ms after that write.
  - The release's write turned it off: that write's own `accessibility-support-changed` event reads `enabled: false`.
    The record ends off, with no later write.
  - The role read took 3.6 ms on the first observation and 0.1 / 0.2 / 0.2 ms warm (min / median / max). That was
    measured under ordinary load: #244 has no timing bar, and the slot held only the GUI.
- **sonoma, cua (recorded):** the fixture was launched with `--enable-features=SonomaAccessibilityActivationRefinements`.
  The button was not in the first observation (14 lines, no page; no web area found after the full 1.1 s wait). Write
  and release were as in plain. With that feature on, the role read gives only native APIs. The feature is off by
  default in Chromium, and Electron apps get no field trials. A fallback wait is not built; it is #246, and this row is
  its evidence.
- **plain, vendor (recorded):** the page was in the first observation; the vendor's write came 1110 ms into that
  observation. Complete mode came on 2013 ms after the write. The vendor made no write in the 5 s after the close, so
  complete mode stayed on. This fits the static reading: the vendor releases at its controller's teardown, not when a
  session ends.

**First judge run: a kit defect, corrected offline.** The kit's first verdict on plain cua was FAIL: "complete mode
did not go off". The judge had read off only from the fixture's `poll` lines. The fixture writes a poll line only
when the value differs from the last line it wrote, and the release's own event line had already recorded false, so
no poll line could follow. The judge now takes the mode from the latest line of any kind (139169af, reviewed). It
recomputes from the record lines kept in each run's rows, so the verdict above comes from the same recorded data,
judged again offline, with no new slot.
