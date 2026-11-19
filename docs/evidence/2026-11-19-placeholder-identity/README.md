# #398: hosted macOS evidence for a field whose placeholder changes

Every run happened only on GitHub-hosted macOS 26.7.2, in kit `probe/398-qual` (workflow `423477668`). Engines were built unmodified from clean checkouts of exact SHAs. The kit's README, `scripts/probe-398/README.md` at `a67f0307`, has every table. The lanes were Chrome for Testing 156, Safari 27.2, Electron 44.4.5 and an owned AppKit fixture, all run in the background behind an owned cover window.

## Phase 1: main `44de3527`

### Collisions

[Run 44473534613](https://github.com/SSFSKIM/cua/actions/runs/44473534613) asked how often the placeholder is the only attribute that separates two text fields. It used an instrumented copy of the engine's own identity comparison, with a switch to ignore the placeholder.

| Lane | Windows reached | Text fields | Placeholder-only pairs (value counted / ignored) | Pairs identical on everything |
|---|---|---|---|---|
| Chrome for Testing | 45 public pages | 289 | 8 / 17 | 125 / 241 |
| Safari | 43 public pages | 139 | 8 / 12 | 14 / 14 |
| AppKit apps | 13 built-in windows | 28 | 20 / 20 (Contacts' new card) | 0 / 0 |

Fields told apart only by their placeholder are real: on sign-up and log-in forms, on MUI's demos, and in Contacts' new card, where 15 fields have no title or description. In most of these pairs the whole parent chain matches too. **Once a handle is stale, the placeholder is evidence of which field this was.** That is why the fix relaxes it for the same handle alone.

### Placeholder changes, 10 trials per cell

After click then set_value, or type_text then set_value, main answered `valueUnconfirmed` ("could not be found again") while the value was already in the field:
- **Focus-clear and search hint:** 10/10 on Chrome for Testing, Safari and Electron.
- **Input-switch:** 10/10 everywhere for type_text then set_value.
- **Rotating placeholder:** 6–10 of 10.

No same-handle cell answered `elementNoLongerValid`.

## Phase 2: main `44de3527` against fix `3c99e098`

[Run 44480787749](https://github.com/SSFSKIM/cua/actions/runs/44480787749): 20 trials per cell per head, heads interleaved, 760 of 760 valid rows per lane.

| Gate | Result |
|---|---|
| Same-handle cells: focus-clear, rotate, input-switch and search hint, each as click then set_value, click then type_text, and type_text then set_value | Every fix row is an exact success (960/960). Main refused 484 of those pairs with `valueUnconfirmed`, each with the value in the field. |
| Stale-handle cells: twin removed, twin recreated with another placeholder, single field recreated with another placeholder, twin recreated alike | The fix answers exactly as main does on all 320 paired rows. No wrong-field adoption and no wrong success on either head. |
| Unchanging control | 60/60 on both heads, every lane |

The Chrome for Testing and Electron jobs show red. The cause is a kit gate, `twinRecreateHeld`, which required the fix to re-find an identically recreated twin. Main never does that on Chromium, and the design asks the fix to answer as main there. The gate was corrected in `a67f0307`, which only re-reads the same evidence.

## Limits

- **Chromium's stale walk.** On Chromium, main and the fix both fail to re-find even an identically recreated field, for a reason other than the placeholder. The stale cells there can't tell a strict walk from a loose one. Safari and AppKit can, and there the fix matches main.
- **AppKit's hints.** AppKit's focus and search hints never reached the engine's view of the field, so only 5 of its 12 changing cells were exercised.
- **The rotating cell** depends on timing.
- **The value rule.** After type_text changes a field's value, a later click on its token can still answer `elementNoLongerValid` once the tree has changed. That comes from the value rule, not the placeholder, and is unchanged.
