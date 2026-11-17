# M4 T6: the AT-SPI investigations (`Cache.GetItems` over the matrix, GTK 4's `EditableText`)

One probe pass, `t55-pass`, on the #171 VM, 2026-11-03 20:31:59–20:34:09Z, from commit 7d672df2 (the probe as
committed; `results.jsonl`'s `meta` row). The reference read is cua-engine 0.3.0 (cd4c929758ca), the pinned release
asset installed at `~/.local/share/cua/engine/linux/cua-engine` (sha256 `5f4a1600…7b60`, equal to
`runtime/engine/linux-engine.json`); its tree read is the vendor's per-element field set (Observation). No engine
change; this is an instrument, not a gate.

```bash
node scripts/linux-engine-diff.mjs --experiment atspi --cua "$INSTALLED" --out docs/evidence/2026-10-28-own-linux-engine/m4/atspi --run t55-pass
```

`summary.md` holds the pass's tables; `results.jsonl` one row per family and scene (`atspi-answer`, `atspi-menus`,
`atspi-changing`, `atspi-qt`, `atspi-editable`), with the two small GTK 4 answers kept whole beside the read they were
compared with (`kept`), so the comparison can be checked offline; `apps/` the scene applications' stderr.

## Where it ran

- **Its own display only.** The probe starts a private Xvfb of its own (`startPrivateServer`: `:1`, under its watchdog,
  marked private; the watchdog's verdict clean, 65 round trips), Openbox there in the run's home, and the harness's own
  Desktop on it: every application through the one spawner, in the run's homes, under the run's session bus and its own
  accessibility bus launcher (`/run/user/501/at-spi/bus_1`). Before anything starts it withdraws the entry point's
  live-run declaration, so the spawner refuses every display the process did not create; the shell's DISPLAY is never
  read. Nothing ran on `:0`, and nothing of the person's (window, bus or file) was read.
- **Its own windows only.** The run's trace audited 545 requests (134 mutating), none foreign; Chrome was the run's
  own instance (spawned 1, nothing left); the session bus ended cleanly. The run's end row records one skipped close
  (`0x00a00002`, "no longer the window the run opened"): a window of the run's that was already gone when its turn to
  close came, and the one `X Error … BadWindow` line in the run's stderr is the harness's title check on that vanished
  id. No whole-run RECORD ran (the probe passes none; only its own windows were on the display, and RECORD can freeze
  the server, task 41), so the end row's generic "RECORD only on a private display" note does not mean the display was
  shared.
- **Read-only, apart from the GTK 4 text questions.** Menus are opened by the harness scenes themselves
  (`pages/atspi-gtk4.py`, `pages/atspi-qt.py`), so the probe sends them no input. The only writes are the GTK 4 text
  steps (one XTEST key, `InsertText`, Ctrl+Z), into the scene's text view and entry and gnome-text-editor's scratch
  document, all windows the probe opened, on its own display.
- **Never during a bus-traced verdict run.** No harness run or `dbus-monitor` was running on the VM when the pass
  started (`ps`), and the probe's accessibility bus is its own display's launcher's, so it cannot appear in another
  run's accessibility bus trace.

## `Cache.GetItems`: not adopted

| family | toolkit | answer | items |
|---|---|---|---:|
| gedit, gnome-terminal (VTE), LibreOffice Writer (gtk3) | GTK 3.24.41 (at-spi2-atk 2.52) | `UnknownMethod`, and no `GetItems` in its introspection data | – |
| Firefox | Gecko 159.0 | `UnknownMethod`, the same | – |
| Chrome, Electron | Chromium | `UnknownMethod`, the same | – |
| kate, the harness's Qt 5 scene | Qt 5.15.13 | the legacy signature `a((so)(so)(so)a(so)assusau)`, always empty | 0 |
| qtcreator, the harness's Qt 6 scene | Qt 6.4.2 | the same, always empty | 0 |
| gnome-text-editor, the harness's GTK 4 scene | GTK 4.14.5 | the current signature `a((so)(so)(so)iiassusau)` | 66 and 30 |
| LibreOffice Writer (gen), xterm | – | no accessibility provider for the process | – |

What stands against adoption under the Observation rules (exact output on menus, Qt and changing trees; numeric roles
mapped to names; the -1 sentinels):

1. **Almost nobody answers.** Of the matrix's nine families with an accessibility provider, only GTK 4 answers with
   items. Chromium
   (Chrome, Electron), Gecko and every at-spi2-atk toolkit (GTK 3, VTE, LibreOffice's gtk3 plugin) do not implement the
   method at all, so the reference scenes (gedit and Chrome) and most families would keep the per-element read anyway.
2. **Qt answers empty.** Qt 5.15 and 6.4 answer the legacy signature with no items: with their own menu open (13 nodes,
   10 of them menu roles in the read), while their tree changed (10 polls, 0 items each), and in kate and qtcreator
   (whose read holds 1,261 nodes). Their introspection data advertises `a((so)(so)a(so)assusau)`, a shape without the
   parent reference that their answers do not have.
3. **GTK 4's numbers are not its role names.** GTK 4 puts AT-SPI's role numbers in the cache but answers `GetRoleName`
   with its own names. Through libatspi's table (at-spi2-core 2.52's `atspi_role_get_name`, `ATSPI_ROLE_NAMES` in
   `atspi-cache.mjs`), 76 of the 92 nodes both reads hold get another name than `GetRoleName` gives (`frame` for
   `application`, `push button` for `button`, `text` for `text box`, `panel` for `generic`), and number 39 stands for
   three names (`generic` 46, `group` 11, `tab panel` 6), so no table of any kind can map it: every such node would
   still need its own `GetRoleName`. M0.2 saw the same on gnome-text-editor.
4. **GTK 4's cache is not its tree.** Apart from the role names, the rebuilt window is not the read in either GTK 4
   window. gnome-text-editor's cache holds a node the read does not (a `generic` at index 1 under a parent whose child
   count says 1 and whose `GetChildren` does not list it, though the node itself answers `GetIndexInParent` 1), and
   places another node under its grandparent where `GetChildren` lists it under its parent; three child counts in the
   window's subtree disagree with the children the answer gives, and one parent's children carry a -1 index, so their
   order is not in the answer. The harness's GTK 4 scene with its menu open shows the same extra node (its 6 menu nodes
   are in both).
5. **A changing tree.** In the harness's GTK 4 scene, changing every 250 ms, 30 pairs (GetItems, then the read; 11
   changes during them): in every pair the scene's moving parts (its `tick` label and its rows) are the read's, 24 of 24
   quiet pairs and 6 of 6 straddling ones, so GTK 4's cache keeps up with the changes; but no pair is equal, or even the
   same structure, for the reasons in 3 and 4.
6. Where it does answer, the cache carries no text and no actions, so the per-element `GetText`, `NActions` and action
   names would remain: the cache could only ever replace the role, Name, Description, state and children calls.

Proposed Decision Log line: *`Cache.GetItems` is not adopted (M4 T6, `m4/atspi/`): of the matrix's families only GTK 4
answers it with items, Qt 5 and 6 answer it empty, Chromium, Gecko and the at-spi2-atk toolkits do not implement it, and
GTK 4's answer is not its tree (role numbers that are not its `GetRoleName` names, one number standing for three names,
a node its `GetChildren` does not list and a node under the wrong parent); the per-element read stays the only path.*

## GTK 4's `EditableText`

| widget | `EditableText` | `InsertText` | Ctrl+Z after it | what the insert raises | the control (a key, then Ctrl+Z) |
|---|---|---|---|---|---|
| the scene's text view (GtkTextView) | `CopyText`, `CutText`, `DeleteText`, `InsertText`, `PasteText`, `SetTextContents` | inserts at the offset; answers true | the first takes the insert back, the second the key typed before it: the history is kept | the buffer's `insert-text` and `changed` only: no key event and no `begin-user-action`/`end-user-action`, where the typed key raised both | undone |
| gnome-text-editor's document (GtkSourceView) | the same six | inserts; answers true | the same as the text view | not recorded (an application); the window title did not change | undone |
| the scene's entry (GtkEntry) | the same six | inserts; answers true; raises the entry buffer's `inserted-text` and the entry's `changed`, as the key did, but no key event | **nothing is undone**, neither the insert nor the key typed before it, though without `InsertText` Ctrl+Z takes the key back | as left | undone |

Also seen: the text view refuses `Text.SetCaretOffset` (an error with an empty message) where the entry takes it, and
the entry answers `Text.GetText(0, -1)` with the empty string whatever it holds (the probe reads up to
`CharacterCount`). Neither touches cua-engine: its paste confirmation reads explicit offsets, and its tree reads
`GetText(0, -1)` only for the `text` and `entry` roles, which GTK 4 does not use (`text box`).

What this means for the M4 candidate ("GTK 4 text without key events through `EditableText`, if GTK 4 implements it and
only if the insert keeps undo and the application's input signals"): GTK 4 implements it, but neither condition holds
in general. In a text view the insert is undoable, but it arrives outside a user action and without a key event,
so an application's handlers that key on those do not see it (which handlers an application has is its own; the probe
shows only that the brackets and the key event are absent, where a typed key raises them); in an
entry it leaves the entry with no working undo at all. The `InsertText`
constraint stands, unlifted in M4 (the pre-flight's ruling), and this evidence gives no ground to lift it later.
