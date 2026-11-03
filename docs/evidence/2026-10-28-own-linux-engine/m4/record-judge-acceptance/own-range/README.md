# The sender's own resource-id range, on task 49's record (#171 M4, task 51, item 3)

The design session's ruling (sminos 336): a request naming a window inside the sending client's own resource-id range
is never foreign, for that connection's life. The X server lets a client create resources only in the range it handed
that connection, and hands a range to another connection only after its client disconnects. So while the connection
lives, an id in its range names its own window or nothing. The judge (`scripts/linux-engine-diff/foreign.mjs`) binds a
range to its connection from xtrace's setup reply, or from the record's client line (the record's client id is the
range's base, and xprobe's `ready` line now names the server's mask). The binding ends with the connection's death, a
new client line under its id, or its base handed to another connection. A record or trace with no known mask exempts
nothing.

## Task 49's record, judged again offline (`rejudge.json`)

```
node rejudge.mjs ../runs/attempt-2/record-judge/record.jsonl.gz <foreign.mjs at a5ef4bff> <foreign.mjs now>
```

| measure | before (a5ef4bff) | after |
|---|---|---|
| requests | 85,622 | 85,622 |
| mutating | 74,042 | 74,042 |
| findings naming a window in the sender's own range | 214, every one `SKY_CLIPBOARD_STOP` | 0 |
| findings cleared | | 214, every one `SKY_CLIPBOARD_STOP`, every one in its sender's own range |
| findings after that were not findings before | | none |

- The requests and mutating counts are the run's own end row's, and 214 is its finding count.
- The run's registered windows and operation spans are not in the evidence, so both judges run with none. The scenes'
  windows then read as foreign to both alike (8,558 before, 8,344 after). The rule removes only findings naming a
  window in the sender's range, which no registration changes, so the 214 it removes here are the ones it removes from
  the run's verdict. That verdict had exactly those 214, so the run's record would now be clean.
- The senders are `sky_linux_x64` (the record's own lines) and `xtrace` (the route audits' engine connections, which
  reach the server through the proxy).
- The record predates the mask: `rejudge.mjs` adds the server's, 0x1fffff, to its `ready` line. That is Xvfb's
  default, and every one of the record's 12,467 client bases is a multiple of 0x200000.

## xprobe names the mask (`record-mask-probe.json`)

`record-mask-probe.mjs`, on an Xvfb it starts itself through `startPrivateServer`, runs the harness's `startRunRecord`
and one `xprop` client. The ready line reads `"mask":2097151` (0x1fffff), and every client line's id is a base of
it: Xvfb's own, the watchdog's and the record's connections, and the `xprop` that started during the record.

The hermetic tests are in `test/linux-engine-diff/foreign-judge.test.mjs`:
- task 49's record lines are clean with the mask, and judged as before without it;
- an id in another live client's range is still foreign;
- a range handed to a new connection after the old one ended is not the old sender's;
- the same three on xtrace's lines.
