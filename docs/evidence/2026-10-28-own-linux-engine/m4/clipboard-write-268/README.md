# #268: why every vendor gedit `clipboard_write` fails at 10.2 s (M4 T2)

The probe ran on 2026-11-01 at 19:27–19:28 PST, on the #171 VM's display `:0`. It used the newest vendor build,
`88ce5e0a…2991` (`deb-26.1023`). The other parts were gedit 46.2 and GTK 3.24.41-4ubuntu1.3. The reader was
cua-engine 0.3.0, used only to list windows and read trees.

**Classification: the vendor builds' own route.** It is not a harness condition. Both builds take CLIPBOARD
themselves, then call AT-SPI `EditableText.PasteText` on gedit's text view. GTK 3's
`gtk_text_view_accessible_paste_text` passes `&paste` to `gtk_clipboard_request_text`, and `&paste` is a variable on
its own stack (`gtk/a11y/gtktextviewaccessible.c:1796–1820` in 3.24.41, unchanged on the `gtk-3-24` head). GTK
answers a request synchronously only when this process owns the selection (`gtkselection.c:1157–1187`). When another
process owns CLIPBOARD, the callback runs after `PasteText` has returned. It then reads freed stack and fails GTK's
type checks, which is why gedit prints three criticals. Nothing is inserted, and the builds poll until their 10 s
deadline. On arm64 the same stale read crashed gedit (2026-10-06's Linux acceptance evidence).

## The cases

`probe.mjs` opens three harness gedit windows the way the gate does, behind the harness's front xterm: `openScene`, a
`gedit --standalone` process each, and the same scratch text. Each window's stderr is kept in
`apps/<label>.stderr` by `scenes.mjs`'s `spawnApp`; a window that printed nothing leaves no file.

| case | what | answer | text | gedit's stderr |
|---|---|---|---|---|
| newest ×3 | the newest build's `clipboard_write`, prepared as the gate prepares it: text.mjs's `handleOfFirstWord` (oracle selection, then the build's own Copy), the caret at the end, a harness owner on CLIPBOARD | `editable Paste did not insert text` at 10,204 / 10,203 / 10,204 ms | unchanged (54 characters) | the three criticals once per sample, 302, 316 and 458 ms after the request was sent |
| control A | gedit's own `CopyText(0, 6)` (gedit owns CLIPBOARD: `cua171`), then `PasteText(54)` from the harness's accessibility client | `true` | `cua171` inserted at the end | none (no file) |
| control B | the same, but a separate process (`xprobe clip-own`) owns CLIPBOARD before `PasteText` | `true` | unchanged for 2 s | the three criticals, 8 ms after `PasteText` |

Controls A and B differ only in which process owns CLIPBOARD. The same call on the same widget inserts when gedit owns
the selection, and when another process owns it, inserts nothing and leaves the criticals. Every vendor
`clipboard_write` puts its own process in that position before it calls `PasteText`. No preparation by the harness
(handle, buffer, caret, selection, prior owner) can change that.

The first newest sample shows how the 10.2 s divides:

- About 0.3 s: the build walks the tree to find the focused editable.
- Then the build takes CLIPBOARD, calls `PasteText`, and gedit's failed callback follows.
- The rest: the build polls `CharacterCount` until its 10 s command deadline. The time beyond 10 s is the roughly
  200 ms that every vendor `clipboard_write` pays, including one refused for an unknown handle.

The clipboard afterwards holds the snapshot (`cua171`), served by the build. This matches every gate run since m2.

## The gate records agree

The gedit `clipboard_write` samples:

- **The newest build.** Every sample with a valid handle failed with this error at 10,202–10,205 ms, in m2/diff and in
  m3's diff, gate, gate-final, gate-verdict, gate-t25 and gate-musl (40 of 40 there). Each had a clean preparation
  and an untouched buffer, and the bus pass shows one `PasteText`.
- **The pinned build.** It fails the same way since task 24 repaired the buffer (gate-musl: 40 of 40).
- **cua.** It pastes with the family's chord, never `PasteText`: 40 of 40 in gate-musl, median 179 ms.

## What follows

- **No harness fix.** Neither vendor build reaches 20 usable samples, so the series has no vendor bar (the no-bar
  rule), and cua's series passes as a declared deviation. The deviation's reason now states the mechanism
  (`scripts/linux-engine-diff/deviations.mjs`).
- **The harness now keeps every scene application's stderr** (`<out>/apps/`), so a toolkit's complaints are evidence
  in future runs.
- **cua cannot reach this bug.** Its only `EditableText` call is `CopyText` (`native/linux-engine/src/copy.rs`).
  `CopyText` is synchronous, with heap-owned data, in GTK 3, GTK 4 and Qt 5 and 6. The guard
  `native/linux-engine/tests/no_text_mutators.rs` fails the engine's tests if any string literal in `src/` names
  `PasteText`, `CutText`, `InsertText`, `DeleteText` or `SetTextContents`.

## Files

- `probe.mjs`: the probe. Run it as `DISPLAY=:0 XAUTHORITY=~/.Xauthority node probe.mjs --cua <cua-engine>
  --newest <sky_linux_x64> --out <dir>`.
- `results.jsonl`: one row per case and sample. Each row records the wall-clock instants, in ISO and in gedit's local
  `HH:MM:SS.mmm`, the clipboard owner and text, the answer and the field before and after.
- `apps/cua171-diff-p268-gedit-newest.stderr`, `apps/cua171-diff-p268-gedit-ctlb.stderr`: gedit's criticals. Control
  A's window printed nothing.

An earlier attempt the same minute (19:26) gave the same three newest samples (10,203–10,204 ms, criticals at
+337/+360/+327 ms). It stopped at control A, because the oracle's JSON parse does not accept `CopyText`'s empty
reply; the probe now calls `busctl` directly for it. That attempt's output was discarded. Both runs closed every
window they opened. The stray check before and after found no harness process, and the owner's Chrome was untouched.
