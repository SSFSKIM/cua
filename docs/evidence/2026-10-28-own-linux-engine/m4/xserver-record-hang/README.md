# An X server spin under RECORD: `FlushClient` re-entered by RECORD's flush callback (#171 M4, task 41)

On 2026-11-02 at 16:40:30 the owner's display `:0` froze 2 h into a full-manifest harness run under the whole-run
RECORD (`xprobe record-run`, e54658b8). Xorg spun at 100% CPU in `FlushAllOutput` → `FlushClient` →
`writev(fd=39, iov, iovcnt=0)`, which returns 0 forever; fd 39's peer was the record client's data connection
(task 40). The same spin was reproduced on private Xvfbs, the cause read from the source and confirmed by the spinning
frame's locals, and closing the descriptor through gdb was rehearsed there as a recovery. Nothing here ran against
`:0`; its stack is task 40's.

## Versions

- This VM: Ubuntu 24.04.4, `xserver-xorg-core` and `xvfb` 2:21.1.12-1ubuntu1.9 (`Xorg -version`: X.Org X Server
  1.21.1.11, as Ubuntu labels it), kernel 6.8.0-138.
- Upstream: `os/io.c` `FlushClient` is unchanged in master (2026-11-02) in every line that matters here; no upstream
  issue or merge request describes this (searched: FlushClient, FlushCallback, writev, iovcnt, RECORD/record hang,
  xrecord, RecordFlush, FlushAllOutput, on gitlab.freedesktop.org/xorg/xserver issues and merge requests; the
  io.c and record.c commit logs; Ubuntu's changelog through 1ubuntu1.9).

## The reading (21.1.12 `os/io.c`, `record/record.c`)

1. `FlushClient(who, oc, extraBuf, extraCount)` computes `notWritten = oco->count + extraCount + padsize`, and only
   then calls `CallCallbacks(&FlushCallback, who)`.
2. RECORD registers `RecordFlushAllContexts` as a `FlushCallback`. It writes every enabled context's buffered
   protocol (`replyBuffer`, up to 1 KB) to that context's recording client through `WriteToClient`. When `who` is
   itself a recording client with output pending (it fell behind, so its socket filled and the server buffered), that
   write lands in the very `oco` being flushed:
   - If it fits, it is appended. The outer loop then writes only its stale `notWritten` bytes and sets
     `oco->count = 0`, so **the appended recorded bytes are dropped** (whole RECORD replies, so the stream stays in
     step: the loss is silent).
   - If it does not fit, `WriteToClient` calls `FlushClient` again (nested). When the socket takes everything, the
     nested call sets `count = 0`, `oc->output = NULL` and frees the `oco` (or puts it on `FreeOutputs`). The outer
     loop still has `notWritten > 0` and builds zero iovecs from the released buffer: `writev(fd, iov, 0)` returns 0
     forever. **The server spins**, and a closed peer does not end it, since a zero-length `writev` never sees one.
3. Locals in the spinning frame (`runs/xvfb97-stack-locals.txt`): `notWritten = 50184`, `written = 0`,
   `oc->output = 0x0` (released), and `*oco` is freed memory (`buf` a tcache pointer, `size = 50292`, `count = 0`).

The trigger is a recording client's socket filling (any lag: a scheduling hiccup, its own round trips), then a flush
of that client while its context holds buffered bytes. The number of contexts does not matter: one context spun as
two did (`runs/contrast.txt`).

## Findings

- **The spin, reproduced**: five runs of the short-pause load on private Xvfbs spun, after 8–255 s
  (`runs/contrast.txt`; `runs/xvfb93-*`); two more were cut short at about 470 s by an edit to their script, and four
  shorter runs (90–120 s) with longer pauses did not spin.
  The load: the e54658b8 `xprobe record-run` (or the stand-in `flood slowrec` with one or two contexts:
  `s1ctx`/`s2ctx`), two clients writing properties of 0–2400 bytes and one of 200 KB every few batches, connection
  churn at 20/s, and the record client paused (SIGSTOP) for 10–90 ms at random. The stack is `:0`'s
  (`runs/display0-xorg-stack.txt`), and the spinning descriptor is again the record client's data connection.
- **Silent request loss**: of 960,691 recorded-range requests, 162 never reached the record (pauses of up to 490 ms),
  and 13 of 949,155 with no pauses at all, both after the record had settled (`runs/request-loss.txt`).
- **Unbounded buffering**: a record client that cannot keep up makes the server buffer its output without limit:
  2.1 GB of Xvfb RSS in 11 s under a heavy load, after which the server aborted the client at `INT_MAX`
  (`runs/buffer-abort.txt`).
- **Recovery option 1, rehearsed** (`runs/rehearsal-xvfb98.txt`): with the spin on and the record client killed (its
  peer closed, as on `:0`), `sudo gdb -p <server> -batch -ex 'call (int)close(<fd>)'` returned 0. The CPU fell from
  100% to 3% within a second, `xdpyinfo` answered, the other clients stayed connected and their windows read, and the
  server stayed up for the 2 minutes watched. Caveat: after the close, `FlushClient`'s error path writes
  `oco->count = 0` into the freed `oco` once (a 4-byte use-after-free write); it did no harm here.

## What changed in the harness

The whole-run record runs only on a display marked `CUA171_PRIVATE_DISPLAY` (`xtools.mjs` `startRunRecord`, and
xprobe `record-run` itself); every run's display, `:0` included, is watched by `xprobe watchdog` (a GetInputFocus
round trip every 2 s, 5 s bound; a stall kills the record client, stops the run and alerts). See the harness README.
Live on private Xvfbs (`runs/watchdog-live-xprobe.txt`, `repro/live-watchdog.sh`): record-run refused on an unmarked
display and recorded on a marked one; the watchdog answered and ended cleanly; with the server stopped (SIGSTOP) it
killed the guarded process and stopped the run 2.1 s later; and under the reproduction's load with the new
record-run guarded, the real spin came at 97 s and the watchdog killed the record client and stopped the run.
The harness's `startRunWatchdog` did the same through the real xprobe (`runs/watchdog-live-harness.txt`).

## To reproduce (a private display only)

`repro/repro-stall.sh <out> <seconds>` with `SHORT=1 FLOODS=2 BATCH=30 FLOODARGS="5 5 200000"`; `REC` defaults to
the harness's xprobe record-run (the runs above used e54658b8's, from before the refusal) and may be
`repro/slowrec-as-rec.sh` with `CONTEXTS=1|2`; `KEEP=1` runs `repro/rehearse-close.sh` once it spins.
`repro/flood/` is the load and prober (`cargo build --release --offline`); `repro/check-loss.py` counts lost requests
and `repro/record-lag.py` a record's read lag.

Every script reaches only an X server it started itself (task 44, `repro/private-x.sh`): `Xvfb -displayfd`, so the
display is the server's choice, set as `DISPLAY` only once that server named it and is alive, and marked
`CUA171_PRIVATE_DISPLAY` and read back before any load or record; a server that does not start stops the script
before anything reaches a display. Every flood mode refuses a display that is not a local `:<n>` or not marked
(`repro/flood/tests/fence.rs`, `cargo test --release --offline`), and `rehearse-close.sh` attaches gdb only to an Xvfb
on a marked display. `repro/fence-test.sh` checks the scripts' side on servers of its own. The servers run without an
authority file (`-displayfd` names the display only once the server runs) and listen on their Unix socket only. The
runs above came from the scripts before this fence, which took the display from `D` (`:93` by default).
