# Two repl-parity tests that fail on the #171 VM before and after M4's T4

`node --test test/repl-parity/*.test.mjs` on the #171 VM (Ubuntu 24.04, Linux 6.8, node v24.22.1) fails exactly two
tests, and fails them the same way at T4's base `4d6b33a7` as at T4's head. They are not T4's: neither touches the
engine, the harness or the native cases. The `test` gate, on GitHub's hosted runners, has passed throughout M4.

`baseline.sh` runs each test alone (`--test-name-pattern`) with its full output, at the base on a detached checkout and
at the worktree's head. It writes `base.log` and `head.log`. With durations and checkout paths taken out, the two logs
are identical.

| Test | File | Failure on the VM |
|---|---|---|
| ordinary selection calls record a complete cold handshake and reuse it on the next call | `test/repl-parity/selection-cache.test.mjs` | `serve refused before launch (repl_host_refused): CUA_REPL_HOST=vendor is not supported on Linux: the vendor host there is retired (#115)…`. The test starts a vendor-host serve, which Linux refuses since #115. |
| owned peer stays open before input and aborts mid-stream with a real transport error | `test/repl-parity/socket-error-peer.test.mjs` | The peer's abort is seen as `['ECONNRESET', 'close']` where the test expects `['EPIPE', 'close']`. Which of the two errors a write to a peer that aborted mid-stream raises first differs by platform (an inference, not traced). |

Tracked in `tech-debt-tracker.md`, entry of 2026-11-02, "Two repl-parity tests fail on Linux hosts".
