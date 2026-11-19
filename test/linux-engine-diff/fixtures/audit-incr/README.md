# Route audits of gedit's clipboard_write with an INCR paste (#171 M5, task 106, ruling 863 (b))

Raw xtrace traces of two route audits (the audit pass's proxy, its `xprobe ancestry` watcher and the engine), recorded
2026-11-19 on a private display: `scripts/linux-engine-gate/display.mjs` `runOnPrivateDisplay` (Xvfb, Openbox, an
xterm titled `person`), never `:0`. They are test data for the foreign-window judge's raw-versus-projection equivalence
(`audit-traces.test.mjs`).

- The harness: a scratch copy of e00747aa with three recorder-only patches, none committed:
  - the gedit scene's text is 72,826 bytes of plain ASCII;
  - the clipboard operations' "first word" covers 72,000 characters, so each engine's paste exceeds its 64 KiB chunk
    and answers gedit's conversion by INCR;
  - each route audit's raw lifecycle traces, with the registry it was judged against, are written beside the run.
- The run: `--dev --scene gedit --ops clipboard_write --blocks 1 --no-counts`, with cua 0.4.1 and the pinned
  (26.928.40906) and newest (26.1023) vendor builds on x64.
- `cua-…`: cua's audit. It holds SelectionRequests, an INCR announcement and its chunks, and SelectionNotifies.
- `pinned-…`: the pinned build's audit. It holds the same, plus its gedit's end (DestroyNotify) and BadWindow refusals.
- `*.registry.json`: the run's registered window ids and the root, as the audit judged them.

What the traces contain: the scene's synthetic text, window titles carrying the run's label and nonce, atom names, and
protocol traffic. They contain no person's data and no credentials (xtrace ran with `-n` on the private display).
