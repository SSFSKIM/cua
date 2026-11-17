# Two repl-parity tests that fail on the #171 VM before and after M4's T4

`node --test test/repl-parity/*.test.mjs` on the #171 VM (Ubuntu 24.04, Linux 6.8, node v24.22.1) fails exactly two
tests, and fails them the same way at T4's base `4d6b33a7` as at T4's final fix head `b8b79a25`. They are not T4's:
neither touches the engine, the harness or the native cases. The `test` gate, on GitHub's hosted runners, has passed
throughout M4.

`baseline.sh` runs each test alone (`--test-name-pattern`) with its full output, at each of the two commits on a
detached checkout. It writes `base.log` (`4d6b33a7`) and `head.log` (`b8b79a25`); each log's first line names its
commit. With the header lines, durations and checkout paths taken out, the two logs are identical.

The first `head.log`, which was never committed, was recorded at `30b6dec7`: T4's head before its review fixes
(`f4db168a..b8b79a25`), one of which (`88594563`) changed `test/repl-parity/`. Task 35 ran `baseline.sh` again with the
head pinned to `b8b79a25`, so the comparison above is base against T4's final code. Its result did not change.

| Test | File | Failure on the VM |
|---|---|---|
| ordinary selection calls record a complete cold handshake and reuse it on the next call | `test/repl-parity/selection-cache.test.mjs` | `serve refused before launch (repl_host_refused): CUA_REPL_HOST=vendor is not supported on Linux: the vendor host there is retired (#115)…`. The test starts a vendor-host serve, which Linux refuses since #115. |
| owned peer stays open before input and aborts mid-stream with a real transport error | `test/repl-parity/socket-error-peer.test.mjs` | The peer's abort is seen as `['ECONNRESET', 'close']` where the test expects `['EPIPE', 'close']`. Which of the two errors a write to a peer that aborted mid-stream raises first differs by platform (an inference, not traced). |

Tracked in `tech-debt-tracker.md`, entry of 2026-11-02, "Two repl-parity tests fail on Linux hosts".
