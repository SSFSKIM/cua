# Fix 3: the TARGETS answer before the chord (task 56)

The probe in `../fix2/never-taken/` traced gnome-terminal's never-taken paste to cua's own ordering. gnome-terminal
keeps CLIPBOARD's targets. At every owner change it forgets them and asks the new owner for `TARGETS`, and it drops
a paste chord that arrives before the answer. cua sent the chord about 1 ms after taking CLIPBOARD. The design
session ruled the fix (sminos 348) as follows:

- **(a)** The target is identified by its client's resource range.
- **(b)** Every family gets the answer to a request that has already come.
- **(c)** Only flagged families wait.
- **(d)** The bound is set by the wait rule.
- **(e)** The revalidation runs after the wait.

The proof follows, together with the trace of the probe's trial 28.

Every sitting ran on a private Xvfb started by the harness (the live-run declaration was withdrawn first, so the
spawner refuses `:0`), or one started by `xvfb-run`. Nothing ran on `:0`. The engines are musl builds made the
release workflow's way (`task56/build-musl.sh`), all dev runs.

## What the engine does (`native/linux-engine/`)

- **Before the chord** (`engine/paste.rs` `await_targets`, `clipboard/owner.rs` `Paste::answered_targets`): the
  following runs after the take and inside the lock.
  1. The paste asks the owner thread whether the target's X client has asked for `TARGETS` since the take. The
     target's X client is its window's resource range, `paste::same_client`.
  2. The owner thread makes a round trip and handles every request queued before its reply, answering each one as it
     handles it.
  3. It then makes a second round trip. Once that returns, the server has processed the answers, so the target
     receives each one before any input another connection sends afterwards.

  Every family gets this one question. A family that asks at every owner change (`families.rs` `refreshes_targets`)
  is asked again every 2 ms, up to `paste::TARGETS_REFRESH_WAIT`, 25 ms. A target that has not asked by then gets the
  chord as before. The field, the desktop focus, CLIPBOARD's ownership and the association are revalidated after the
  wait, immediately before the chord.
- **`--stats`**: `paste.targets` gives `{answered, waited_ms, bound_ms}`. `paste.log` now gives signed ms from the
  dispatch, negative before it. `--targets-wait-ms <ms>` sets the wait for every family, for measurement only.
- **The scrolled rule** (`paste.rs` `Expected::confirmed_scrolled`): trial 28 is below.

## The matrix pass: who asks for TARGETS at an owner change (`matrix-idle/`, `matrix-load2/`)

`targets-matrix.mjs` opens one window of each family at once, behind the front window: Chrome, Electron, gedit
(GTK 3), gnome-text-editor (GTK 4), kate (Qt 5), qtcreator (Qt 6), Firefox (Gecko), Writer (gtk3 plugin; and an
observer on its gen plugin) and gnome-terminal (VTE). It then makes five pastes into each family that takes a
background paste. Each paste uses a fresh engine with `--targets-wait-ms 1000` and `--stats`. The owner's log names
each request's requestor window, which identifies the family by its client's resource range. `matrix-summary.py`
reads the result (`matrix-idle.txt`, `matrix-load2.txt`). The two sittings agree, idle and at twice the load:

| family (toolkit) | asked when another window's paste took CLIPBOARD | its own paste: answered before the chord | flag |
|---|---|---|---|
| gedit (GTK 3) | 35/35, 35/35 | 5/5, 5/5 | **GTK 3** |
| Writer, gtk3 plugin (toolkit `gtk` 3.24) | 35/35, 35/35 | 5/5, 5/5 | GTK 3 |
| gnome-text-editor (GTK 4) | 40/40, 40/40 (observer: GTK 4 refuses background paste in shared mode) | – | **GTK 4** |
| gnome-terminal (VTE) | 35/35, 35/35 | 5/5, 5/5 | **VTE** |
| Chrome | 0/35, 0/35 (asks on its own paste, after the chord) | 0/5 | none |
| Electron (Chromium) | 0/35, 0/35 (the same) | 0/5 | none |
| Firefox (Gecko) | 0/35, 0/35 (the same) | 0/5 | none |
| kate (Qt 5), qtcreator (Qt 6) | 0/35, 0/35 (the same) | 0/5 | none |
| Writer, gen plugin | 0/40, 0/40 | – (no AT-SPI) | none |

GTK 3 becomes a listed family (by toolkit, major 3). Its only difference from an unlisted family is the flag.

## The bound (`bound-terminal-load2/`, `bound-gtk3-load2/`; `waits.txt`)

The waits were measured at twice the load (16 stress-ng workers on 8 cores) with no proxy, every paste waiting up to
1 s (`--targets-wait-ms 1000`, musl 69e3724b):

| target | pastes | landed | wait median | p95 | max | past 5 ms | past 10 ms | past 25 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gnome-terminal (key-then-paste, the never-taken probe's scene) | 200 | 200 | 2.29 ms | 8.69 | 12.77 | 58 | 4 | **0** |
| gedit | 30 | 30 | 2.18 | 5.79 | 12.74 | 5 | 1 | **0** |
| Writer | 30 | 30 | 2.47 | 9.91 | 12.47 | 9 | 1 | **0** |

The wait rule takes the smallest step of 5, 10, 25, 50 and 100 ms that held, which is **25 ms**. The proof's 200
direct runs (below) on the final bytes held at it as well.

## The proof (musl 391c6395, `cua-engine 0.3.0 (391c63958ea8)`, sha256 `68abedec…`)

| sitting | what | result |
|---|---|---|
| `proof-terminal-load2/` | gnome-terminal key-then-paste, 2x, no proxy, 200 runs (the probe's scene, `probe.mjs --direct --runs 200`) | **200/200 pasted, 0 never taken** (before the fix, the same scene and load: 21 of 200 never taken, `../fix2/never-taken/direct-2/`). The target's TARGETS was answered before the chord in all 200 (the owner's log: −14 to 0 ms from the dispatch) |
| `fresh-terminal-idle/` | the focus-timer experiment, gnome-terminal, idle | timer and unredirect paste **30 consecutive from the first run** (0 misses, raw 0); burst and A-B-A 30/30; audits clean; control paste 9/10 |
| `fresh-terminal-load2/` | the same at twice the load | timer and unredirect paste **30 consecutive from the first run** (0 misses, raw 0), 6 confirmed by the scrolled rule; burst and A-B-A 30/30; control 10/10; audits clean |
| `fresh-others-paste-load2/` | Chrome, Electron, gedit, kate, qtcreator, Firefox, Writer: key-then-paste, 2x (`--scenarios paste`) | every timer and unredirect lane 30 consecutive (kate's timer lane in 31: its first run refused before any clipboard work, `window identity changed while resolving X11 window …; retry the operation`, the association's refusal); Chrome's and Electron's controls fail as they must (4/10, 9/10); audits clean |

The idle control lane's one miss is a refusal with nothing sent (`requested field or selection changed before
dispatch; nothing was sent`). The control lane sends each key's FocusOut and unredirect at once, with no delay, and
the paste's revalidation now comes after the wait. If the terminal's echo of the keys lands in that time, the field
has changed, and the paste refuses as the safety rule requires. The shipped lanes flush their keys before the paste
observes the field (M4's T7).

Over every sitting at twice the load, **0 of 500 gnome-terminal paste runs were never taken**. On the final bytes
there were 200 in the proof, 30 in the cost sitting and 70 in the experiment, and the bound's measurement on
69e3724b added 200.

## What the wait adds (`cost-idle/`, `cost-load2/`; the engine as it ships, 30 pastes per target)

`paste.targets.waited_ms` measures the time from the take to the revalidation, for the target's answer:

| target | idle median / p95 | 2x median / p95 |
|---|---|---|
| gnome-terminal (VTE) | 2.52 / 2.76 ms | 2.49 / 10.76 ms (the 200-run proof: 2.32 / 8.71) |
| gedit (GTK 3) | 2.47 / 2.73 | 4.07 / 7.57 |
| Writer (GTK 3) | 2.47 / 2.69 | 2.40 / 6.60 |
| Chrome (unflagged: the one question, no wait) | 0.22 / 0.31 | 0.24 / 0.40 |

## The paste speed series (`speed-new/`, `speed-gte-new/`, `speed-gte-old/`; idle, `priv-run.mjs`)

These are the differential run's text scenes that the fix touches, run on a private Xvfb with Openbox against the
pinned and newest vendor builds (`--dev`, musl 391c6395), and judged by the speed rule (Acceptance 3, the bootstrap
interval against the bar build). The scenes are gedit (GTK 3, flagged), chrome-textarea (Chromium: the question
alone) and gnome-text-editor (GTK 4, flagged; dedicated, the foreground route). On this display the pinned build's
gedit paste takes 10 s, its `PasteText` failing as in M0, so the bar there is the newest build.

| scene, operation | cua cold / warm median | bar | verdict |
|---|---|---|---|
| gedit `type_text` | 80.0 / 64.1 ms | 858.3 / 861.4 (newest) | PASS, faster [−788, −763] cold, [−823, −780] warm |
| gedit `type_text_selection` | 78.3 / 74.2 | 866.5 / 849.6 | PASS, faster |
| gedit `clipboard_write` | 71.1 / 68.0 | – (both vendor builds fail it: declared) | PASS (declared) |
| chrome-textarea `type_text` | 75.4 / 68.7 | 921.4 / 905.9 (pinned) | PASS, faster [−853, −838], [−868, −825] |
| gnome-text-editor `type_text` | 83.6 / 74.2 | – (declared) | **FAIL** in `speed-new/`, on 1 of 40 samples' witness (below); PASS in `speed-gte-new/` 40/40 (76.6 / 60.0), as for the engine before fix 3 (`speed-gte-old/`, 78.1 / 68.8) |

`speed-new/`'s one failing sample was a cold gnome-text-editor sample on the foreground route. At the activation
(30 ms into the span), a window of another client was unmapped and destroyed as the focus left it, a stacking change
the allowance does not cover. The other 39 samples were clean. The scene alone, run again on both engines, was clean
in all 40 samples each. The wait comes after the route's activation, so this change came at the activation, before the
wait began.

## Trial 28 of `../fix2/never-taken/direct-2/`: a scrolled paste that landed exactly (`trial28.py`, `trial28.txt`)

The terminal's text was rebuilt from that sitting's rows: the probe's fill (`abcDefgHPasted` 110 times), each earlier
run's bytes, and this run's keys, in rows of 69. The rebuild gives the run's recorded observation (count 1,377, caret
1,376) and the count at the end of its confirmation (1,317). So the paste `Pastedabc` landed whole, and one row
scrolled out. The fill had left `Pastedabc` all over the screen, as part of `…PastedabcDefgH…`, and the paste text
occurs 67 times in the expected text. Fix 2's rule (the paste text exactly once in the expected text) therefore kept
the paste unconfirmed.

The strict rule was not right to call it ambiguous. Its count stood in for two readings: a field that took none of
the paste, or only its first characters, and then scrolled by whole rows. Neither can give this text. The paste is 9
characters and a row is 69, so no row start makes the lengths meet (`trial28.txt`: no reading short of the whole
paste gives the same text). The rule now checks those readings themselves (`short_of_the_paste_reads_the_same`):

- The negative control (the paste text before the caret, nothing pasted, one row scrolled) stays unconfirmed.
- A new case stays unconfirmed: the paste `aba`, of which only the first `a` landed and nothing scrolled, which reads
  as the whole paste with one row out.
- Copies elsewhere on the screen now confirm. The new test
  `a_screen_full_of_the_paste_text_confirms_the_paste_that_landed` is trial 28's screen.

## Files

- Scripts: `targets-matrix.mjs` (the matrix pass), `matrix-summary.py`, `probe.mjs` (the never-taken probe with
  `--engine-arg`), `waits.py`, `trial28.py`, `priv-run.mjs` (a differential run on a private Xvfb with Openbox), and
  the sittings' shell scripts `matrix.sh`, `bound.sh`, `proofs.sh`, `speed.sh`.
- Rows: `matrix-*/matrix.jsonl`, `bound-*/`, `proof-terminal-load2/runs.jsonl`, `cost-*/matrix.jsonl`, `fresh-*/`
  (`results.jsonl`, `summary.md`, `watchdog.jsonl`), `speed-new/`, `speed-gte-new/`, `speed-gte-old/`
  (`results.jsonl`, `summary.md`, `watchdog.jsonl`).
