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
  when both were answered with the pointer at rest between them. A source that does not answer, or lists no ping, is
  never ok: the release still goes out and the drop is unconfirmed, with that reason. Chrome's drops, confirmed by
  their activation request, are unchanged. A second rest is taken when the first answer came after the rest, if both
  rests still end within 150 ms of the first ping (ruling 3a, with the design session's 829). When it does not fit, it
  is skipped, and the drop is judged as the settle alone judges it.
- **The notice's new text,** under the same `an unconfirmed drop:` kind: "Pending from your last drag, an unconfirmed
  drop: your drag into <app> began a drag and drop, and <app> did not answer in time for its drop to be confirmed, so
  the drop may not have landed as the drag answered. Read the window before sending input again: your next input
  request will not be run". The next acting request is refused once with the same cause, as before.
- **`--stats`:** each Electron drop's `drop_cursor.settle` (`before_rest`, `second_rest`: `taken`, `skipped` or
  `needless`, `after_motion`, `settled`), and on every line the engine's `drop_settles` counts
  (`entered`, `second_rest`, `skipped`, `unsettled`). `--drop-no-settle` is measurement only.

## Measured on the candidate (development runs, never counted; `m5/engine-041/`)

The candidate's engine is the same source as this release's (2d8f6ad9). Each run is L4a's or H1's whole plan through
`gate.mjs --dev --pilot 100`, 560 drags each.

| | arm64 L4a, twice the load | arm64 H1, idle | x64 L4a, twice the load |
|---|---:|---:|---:|
| false oks | 0 (0.4.0: 1) | 0 | 0 |
| plain cells not landed, of 100 each | 0, 0 (0.4.0: 0, 1) | 0, 0 | 0, 0 |
| landed but unconfirmed, of 200 | 0 (0.4.0: 5) | 0 | 0 |
| second rest taken / skipped | 9 / 1 | 0 / 0 | 8 / 0 |
| a sync past the 150 ms bound | 0 | 0 | 0 |
| the two syncs' waits summed, median / p95 / max (ms) | 2.7 / 8.9 / 93.5 | 1.3 / 1.8 / 20.0 | 2.7 / 7.6 / 54.4 |

- On the drags whose drag loop ran behind, task 98's prototype of the same rule gave 0 false oks in 177 on arm64 and
  0 in 110 on x64, at twice the load, against 0.4.0's 62 of 128 and 15 of 128.
- The handle plain cell's waits at twice the load: median 3.1 ms, p95 54.3 ms on arm64; 2.7 and 32.5 ms on x64. A plain
  drag whose path runs to the floor's end pays the 30 ms rest as well.
- **A stated limit (ruling 830).** Under heavy load an Electron page can still miss a drag and drop's last position
  when the drag loop keeps up but the page answers later than the rest. Electron then drops on its last operation, and
  the drag answers ok, as Electron's own dragend does. This happened on 2 of 30 plain drags of L4a's left cell on
  arm64. The Linux document tells agents to check the target when they need certainty.

No pin change and no `MIN_ENGINE_VERSION` bump come with this release; both follow the design session's check.
