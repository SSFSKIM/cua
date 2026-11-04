# M4 T7b's sixth fix: the timeout handoff

These are development runs on the #171 VM, 2026-11-04, each on its own private Xvfb (`xvfb-run -a`). Nothing ran on `:0`,
and `pgrep -x stress-ng` was 0.

- Before: fix 5's engine, the musl build of 50c1e536.
- After: the musl build of bf1e44de, made the way the release workflow makes it (`cua-engine 0.3.0 (bf1e44decc23)`,
  sha256 `bc81a2cee481a795523123e1279468928b3285249b7214d95d014466daf8bdf3`). Also the musl build of 1a7e0920, which
  waits for the ended holders' exits until the drain's deadline (`cua-engine 0.3.0 (1a7e09203ee3)`, sha256
  `afd9125eaf313bcaae26a054d30e5e02553efd14ff20b7de63f8185d4f8773ec`). The reproducers give the same results on both
  builds (`repro-*-1a7e0920.log`).

## The reviewer's reproducers (`task57-review5-*.mjs`, run by `repro.sh`)

Each one runs the real shim under strace, with a trusted writer of the record standing for the engine.

- **final-record**: strace delays `pidfd_send_signal` by 500 ms. The writer records Shift and presses it after the
  wait has run out, while the shim is ending it.
- **kill-failure**: strace makes the holder's `pidfd_open` fail with EMFILE. The writer has recorded and pressed
  Shift, and it presses again later.

| Reproducer | 50c1e536 (fix 5) | bf1e44de (fix 6) |
|---|---|---|
| final-record | `ended 1 holding it, 1 gone`, nothing released; keys after: `[50]` | `ended 1 holding it, 1 gone; released 1 of the 1 its engine held [key 50]`; keys after: `[]` |
| kill-failure | `ended 0 holding it, 0 gone; released 1 of the 1 …`; the writer pressed again (EPIPE on its record); keys after: `[50]` | `ended 1 holding it, 0 gone (1 by pid, its exit unseen), the record's pipe ended; released 1 of the 1 …`; the writer was killed before its second press; keys after: `[]` |

## Unit regressions, RED (`red6-shim-unit.log`)

The new shim tests inject failures into the process calls. Run with fix 5's handoff patched back in (no drain after the
SIGKILLs, a release always, no kill-by-pid fallback), 3 of them failed:
- the late record was left out: `Some([])` for `Some([Key(50)])`;
- the release went ahead past an unstoppable writer: `Some([Key(50)])` for `None`;
- a holder whose pidfd or signal fails was left alive.

## Through cua serve, with the sandbox disabled (`fix6-*.log`)

- `fix6-busy-disabled`: the supervisor is SIGKILLed during a long scroll. The engine was gone at +1266 ms and the shim
  at +1269 ms. The last wheel press came at +1257 ms, there was none after the shim's exit, and keys and buttons were
  `[]`.
- `fix6-worker-busy-disabled`: fix 4's (e) case. Nothing was left behind, keys and buttons were `[]`, and the shim said
  `ended 1 holding it, 1 gone; released 3 of the 3 its engine held [button 5, button 1, key 50]`.
