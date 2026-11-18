cua's own Linux engine, cua-engine 0.4.1, built from <commit> for x86-64 and arm64 (static musl).

- Workflow run: <run url> (run id <run id>).
- Provenance: `gh attestation verify <asset> --repo SSFSKIM/cua --signer-workflow SSFSKIM/cua/.github/workflows/linux-engine.yml`.
- Pinned by `node scripts/linux-engine-pin.mjs linux-engine-v0.4.1` (runtime/engine/linux-engine.json).

```
<SHA256SUMS>
```

## What 0.4.1 fixes: an Electron drop answered ok where nothing dropped

- **The fault, in both architectures' 0.4.0.** An Electron drop (a `drag_handle`'s end, or a plain `drag` behind the
  floor) is confirmed by the accept cursor Electron's drag loop shows at the release. 0.4.0 read that cursor at the
  instant it sent the release. Electron's drag loop can run 30 to 100 ms behind the pointer, so the accept it still
  showed was its answer for a place the pointer had already left. The engine answered ok. Electron then caught up,
  showed no-drop and dropped nothing. On the drags where the loop ran behind, at twice the load, the pinned 0.4.0
  answered ok with no drop on 62 of 128 handle drags on arm64 and 15 of 128 on x64 (task 98, `m5/l4a-fix/`). The
  plain cell's one missed landing in L4a has the same cause.
- **The rule (the design session's ruling 827).** The drop is settled before its release. Before the end's last rest,
  and again after its last motion, the engine sends the source a `_NET_WM_PING`. Chromium answers it on the thread
  that runs its drag loop, in the order of its events. Each answer is waited for at most 150 ms. The accept counts only
  when both were answered, each seen by its own deadline and each its sync's own (an engine's random token, matched to
  the one sync outstanding), with the pointer at rest between them where it was at the first answer. A source that does
  not answer, or lists no ping, is
  never ok: the release still goes out and the drop is unconfirmed, with that reason. Chrome's drops, confirmed by
  their activation request, are unchanged. A second rest is taken when the first answer came after the rest, if both
  rests still end within 150 ms of the first ping, judged when the first rest has really ended (ruling 3a, with the
  design session's 829). When it does not fit, it is skipped, and the drop is judged as the settle alone judges it.
  An Electron drop onto a Chrome window is still confirmed by Chrome's activation, whatever the source's settle (ruling
  835); that case is recorded in `--stats` alone (837).
- **The notice's new text,** under the same `an unconfirmed drop:` kind: "Pending from your last drag, an unconfirmed
  drop: your drag into <app> began a drag and drop, and <app> did not answer in time for its drop to be confirmed, so
  the drop may not have landed as the drag answered. Read the window before sending input again: your next input
  request will not be run". The next acting request is refused once with the same cause, as before.
- **`--stats`:** each Electron drop's `drop_cursor.settle` (`before_rest`, `second_rest`: `taken`, `skipped` or
  `needless`, `after_motion`, `settled`, `settle_failed_activation_confirmed`), a handle's record's
  `settle_failed_activation_confirmed`, and on every line the engine's `drop_settles` counts (`entered`,
  `second_rest`, `skipped`, `unsettled`, `settle_failed_activation_confirmed`). The exit's line carries the final
  counts with `settle_final: true` and `exit_settle`, which no other line has. `--drop-no-settle` is measurement only.

## Measured on the candidate (development runs, never counted; `m5/engine-041/`)

The runs are of ac8d86a6, whose engine differs from this release's only in `--stats` lines written with no request (the
exit's and the idle release's). Each run is L4a's or H1's whole plan through `gate.mjs --dev --pilot 100`, 560 drags
each, from a clean checkout.

| | arm64 L4a, twice the load | arm64 H1, idle | x64 L4a, twice the load |
|---|---:|---:|---:|
| false oks | 0 (0.4.0: 1) | 0 | 0 |
| plain cells not landed, of 100 each | 0, 0 (0.4.0: 0, 1) | 0, 0 | 0, 0 |
| landed but unconfirmed, of 200 | 0 (0.4.0: 5) | 0 | 0 |
| second rest taken / skipped | 12 / 0 | 0 / 0 | 11 / 0 |
| a sync past the 150 ms bound | 0 | 0 | 0 |
| the two syncs' waits summed, median / p95 / max (ms) | 2.6 / 8.6 / 90.0 | 1.1 / 1.5 / 14.5 | 2.5 / 7.7 / 70.3 |

- **The failed settle, end to end:** with Electron's browser stopped across a plain drop's end, 10 of 10 drags on each
  architecture answered with the new notice, and the next acting request was refused with it; each drop landed once
  Electron continued.
- On the drags whose drag loop ran behind, task 98's prototype of the same rule gave 0 false oks in 177 on arm64 and
  0 in 110 on x64, at twice the load, against 0.4.0's 62 of 128 and 15 of 128.
- The handle plain cell's waits at twice the load: median 3.3 ms, p95 63.1 ms on arm64; 2.8 and 45.2 ms on x64. A plain
  drag whose path runs to the floor's end pays the 30 ms rest as well.
- **A stated limit (ruling 830).** Under heavy load an Electron page can still miss a drag and drop's last position
  when the drag loop keeps up but the page answers later than the rest. Electron then drops on its last operation, and
  the drag answers ok, as Electron's own dragend does. This happened on 2 of 30 plain drags of L4a's left cell on
  arm64 in the first candidate's run, and in none of the final candidate's. The Linux document tells agents to check the target when they need certainty.

No pin change and no `MIN_ENGINE_VERSION` bump come with this release; both follow the design session's check.
