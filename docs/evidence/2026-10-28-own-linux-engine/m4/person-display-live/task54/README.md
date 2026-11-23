# M4: task 53's judge rules proven live on the person's display (task 54)

Task 53 built three judge rulings of the design session (sminos 338):

1. In a route audit, XTEST that lands on a watched harness window's client range, or on the window manager's frame
   that holds it, is the harness's. The frame's parentage comes from the trace itself, through the audit's ancestry
   watcher.
2. The witness's foreground allowance covers a focus move inside the target toplevel.
3. The matrix judges shared-mode refusals as refusals.

This directory is the live proof the design session asked for: device-gtk4 on `:0` again, then task 50's step 3
matrix on `:0` again.

It ran on 2026-11-03, 19:08–19:27 UTC (VM time 11:08–11:27). This session was the only display user.

- **Harness:** `~/.local/share/cua-171/live-43` at 1525e2be (task 53, reviewed clean, its fix included), unmodified.
  xprobe was rebuilt there (`cargo build --release --offline`), since `ancestry` is new.
- **Engines (task 50's):**
  - cua: task 42's musl `cua-engine 0.3.0 (7ad6f03d2966)`, sha256 `5b7e38cf…`;
  - the pinned build 26.928.40906;
  - the newest build 26.1023.51421.
- **Guards:** each run was a declared live run (the harness's CLI declares `CUA171_LIVE_RUN`), under the watchdog. There
  was no whole-run RECORD; the end row says `record: {skipped: …}`. Task 50's guards ran unchanged (`../scripts/`):
  `run50.sh` with `wrap50.py` in person mode, `owner-watch.sh`, `tmp-watch.sh`, and `owner-check.sh` before and after.
  Their method is described in `../README.md`. `scripts/` holds this task's two launchers, its checker and its copier.

## Run 1: device-gtk4 alone (`runs/device-gtk4/`)

The command was `run50.sh <out> --dev --vendor <pinned> --newest <newest> --cua <cua> --scene device-gtk4 --ops all
--blocks 3 --run task54-device-gtk4` (`scripts/device-gtk4.sh`). It took 11 minutes, 819 rows.

- **Valid.** The stub was failed by both the witness and the audit, and the foreground and in-front checks held.
  - The watchdog ended with no stall: 331 round trips.
  - The end row records the RECORD as skipped.
  - The harness's trace was clean: 11,496 requests, 934 mutating, no foreign change, none unplaced.
  - `_NET_ACTIVE_WINDOW` was `0x00600002`, foreign, at the start and at the end, and was never acted on. The holder was
    `0x0160000e`.
- **The two false reds are gone.** The cua audits of `gtk4_key_dedicated` and `gtk4_move_dedicated` are both
  `clean: true` with `foreign: []`. In task 50 they read `XTEST KeyRelease on 0x03a00005` ×2 and
  `XTEST MotionNotify on 0x005a6d2f`.
- **Every device-gtk4 audit row carries `ancestry: [25165828, 5980901]`, with no watcher error.**
  - `25165828` (`0x01800004`) is the scene window, the `x11:25165828` its shared-mode refusals name.
  - `5980901` (`0x005b42e5`) is its Openbox frame. The witness's restack and focus records name it as the window
    configured and focused when the scene window was activated.
  - Neither exists after the run. The owner's client `0x600002` is still in its own frame `0x5a384f`.
- **Every other audit verdict is the one task 50 had:**
  - the seven shared-mode `nothing-sent` audits clean;
  - `gtk4_element_click` background clean;
  - `gtk4_click_dedicated`, `gtk4_scroll_dedicated` and `gtk4_drag_dedicated` foreground clean.

  The XTEST-unplaced counts are identical: 18, 24, 18 and 556.

  Request counts:
  - The short audits each made six more requests than in task 50 (seven for `gtk4_drag_dedicated`): the watcher's
    selection and reads.
  - The two tree-reading audits, `gtk4_right_click_shared` and `gtk4_element_click`, made about 4,700 requests against
    about 42,000. Task 50 ran them inside the full manifest, with many more windows on the display.
- **No new foreign finding on a harness window.** Since task 53's fix, XTEST that lands on a registered harness window
  the audit did not watch would read foreign. No audit row of this run has a foreign finding.
- **The verdicts: 13 of 13 device-gtk4 PASS** (task 50 had 10 of 13), and the 5 desktop rows PASS.
  - `gtk4_click_dedicated` cua: all 9 sample rows `witness: true`, the cold samples of blocks 0, 1 and 2 included.
  - Task 53's report says "10 of 10"; the scene has 13 verdicts, in task 50 as here.
- **Ruling 2's allowance was not exercised.** No sample of the run lists `focus after the request` in
  `witness_allowed`. Every `gtk4_click_dedicated` sample's `witness_after_changes` is `[]`: the quiet span after each
  request saw no change at all, the cold samples included. The cold samples allow `stacking, focus, active, pointer`
  in the request span, as before. Task 50's block-0 cold sample, a focus move after the span, did not recur. So this run
  shows the cold samples passing, not the new allowance at work. The allowance stays proven by its tests
  (`route-witness.test.mjs`).
- `check54.txt` holds every audit row, the nine click samples and the allowance search; `verdicts.txt` holds the table
  counts. The verdict table counts the five foreground-route rows of the summary's second table as `–`: they carry no
  verdict column.

## Run 2: the run-bus matrix (`runs/run-bus/`)

The command was task 50's step 3 again: `--experiment matrix --family gnome-text-editor,firefox,gedit,gnome-terminal`,
same engines (`scripts/run-bus.sh`). It took 5 minutes.

- **"The run is complete."** Task 50's two "audited requests failed" lines (gnome-text-editor and Firefox) are gone.
- **The cua `matrix-audit` rows:**
  - gnome-text-editor: `exercised: true`, `refused: 4`, each answer the device-mode sentence with `refused: true`;
  - Firefox: `exercised: true`, `refused: 2`, the two keys answered and the two clicks refused.

  Every one of the 12 audit rows (4 families × 3 engines) is clean and exercised.
- **Against task 50's summary, the only differences** are these, and the harness trace's request count (1,213 against
  1,220):
  - the refusal counts: `(5 refused)` where it read `(5 failed)`, and gnome-text-editor's cua `type_text`
    `(2 refused)`;
  - the two audit rows: `PASS` where they read `FAIL`;
  - the run line.

  Trees, witnesses, the background-route readings and the vendor columns are identical: at_spi 64, 68, 486 and 49.

## The person's side

- **Before:** two readings a minute apart (`runs/baseline/owner-1.txt`, `owner-2.txt`) were identical, and identical to
  task 50's baseline:
  - the owner's Chrome, pid 2546101, start 51157914;
  - its client `0x600002`, `google-chrome`/`Google-chrome`, Normal, 1050x780 at 0,0;
  - 2 windows, 1 viewable;
  - 15 root children and 8 X client connections;
  - 20 bus names and 7 running units;
  - `org.a11y.Status` `IsEnabled true`, `ScreenReaderEnabled false`.
- **During:** the owner watch made 66 and 31 readings, with no change, and no watchdog stall.
  - The guard took 5,384 and 2,395 samples over 2,947 and 421 run processes. No flag fired and no decoy was hit.
  - No run process held a path under the person's home (`home paths {}`).
  - The only outside peers were Xorg `:0`, `bus_0` and the system bus.
  - Each run's Chrome used the run's own NSS store under its scratch home.
- **After** (`owner-final.txt` against `owner-2.txt`): identical, except the mtime of `~/.config/google-chrome`, which
  the owner's live Chrome writes (task 49). No run process ever held a path under it.
  - The client list is the owner's alone, with no harness window.
  - Both TMPDIRs were empty and removed, and no `/tmp/cua171-run-*` was left.
  - The run Chrome's `left` is `[]`, and the session bus and the stand-in were terminated.
  - The X sockets are as before: `X0`, plus `X154` and `X156`, stale sockets dated 09:27 and 09:37 VM time with no
    listener, from before this session (task 53's private servers). They are not this task's, and were left alone.

## Privacy

`../scripts/privacy-check.py 2546101 task54/` scanned all 45 files, gzipped ones included:

- **Paths under the person's home:** only `~/.Xauthority`, the XAUTHORITY value in the guard's process records. It is
  a path, never content, as in task 50.
- **Titles and images:** the owner's titles were held in memory only, and none of them, nor any of their words,
  occurs. The only `title` fields are the matrix's family labels. There are no images: the screenshot rows carry
  only a pixel-difference measure.
