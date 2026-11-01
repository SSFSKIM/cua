# Item 187's slot, 2026-11-01 (MacBook, 17:50–18:38Z): the drives in order

The engine under test: 6226f2698ab0 (this branch at 794e797f), built and approved at the slot. The owner's source was
2-Set Korean (`input-source.json`), not ABC. Finder was not running; with the owner's yes the kit started it
(`open -g`) and quit it again after the teardown. Every item's jsonl appends: an item run twice keeps both attempts,
and `item-187.md` (the judge) reads each item's last.

| # | drive | kit | what it ran | ended |
|---|---|---|---|---|
| 1 | `drive` (all) | 794e797f | #188's four rows and cell 3 on cua and the vendor; 187-A1 | 187-A1's compose: the probe's key lost (field read empty). Vendor cell 3 stopped: Finder's run window on top after the fixture's activation |
| 2 | `--part a` | a0e35209 | 187-A1 complete (0/36, read stage), then electron-composing-A | electron-composing-A's compose: key lost (read empty) |
| 3 | `--part a` | 15583c65 | 187-A1 again (0/36), the three A controls | complete |
| 4 | `--part b` | 15583c65 | ABAB blocks 0–4 | block 5's compose: both posts lost |
| 5 | `--vendor --vendor-ungated` | ae8bedd7 | the vendor's chrome/korean (9), then chrome/composing@textedit (9) | complete |
| 6 | `--part b-controls` | ae8bedd7 | electron-composing-B | its compose: both posts lost |
| 7 | `--part 188-vendor-click` | ae8bedd7 | the vendor's cell 3 | complete |
| 8 | `--part b-controls` | ae8bedd7 | the three B controls | complete |

The kit changes made at the slot (the design session's leave, reviewed afterwards):
- a0e35209: the compose step records what the field read instead (empty, latin, other); recording only.
- ec384952: #188's driven activation re-activates until the fixture's run window is on top; `--part 188-vendor-click`;
  cell (ii)'s target line and landing line and column.
- 15583c65: the composition key scheduled `--at` 1500 ms after the probe's launch (the native matrix's lead) and posted
  once more when the field still reads empty, never over another reading.
- 75284afc: the vendor lane runs the vendor's chrome/korean rows first.
- ae8bedd7: `--part b-controls`; `--vendor-ungated` (the design session's ruling at the slot, 1ea561bc:256: the vendor
  lane whatever B showed).

Put back at 18:38Z: engine dd7a09235885 approved (no engine.json before or after); the source 2-Set Korean, read back;
AppleGlobalTextInputProperties absent; Finder's ShowSidebar 1, ShowStatusBar and ShowPathbar absent, as before, and
Finder not running; every harness scene down; cmux (pid 95245) in front.
