# Own native engine spike: promote or discard

Runs: vendor 3, cua 3. In-cell medians in ms over the successful samples of every run of a lane.

**Verdict: NO VERDICT: speed at or below the vendor's; the input rows did not run**

| Promote row | vendor | cua | samples (v/c) | cua against vendor |
|---|---|---|---|---|
| getAXState, TextEdit (tree + render), in-cell | 52.4 | 49.9 | 90/90 | at or below |
| getScreenshot, TextEdit, in-cell | 54.7 | 44.2 | 90/90 | at or below |
| click to TextEdit and Finder | — | — | — | NO VERDICT (no rows) |
| pressKey to TextEdit and Finder | — | — | — | NO VERDICT (no rows) |
| listApps, in-cell (not judged) | 26.1 | 2.5 | 90/90 | at or below |

Approvals: the cua lane answers a repeat approval for the same app inside the spike service (one elicitation per connection and app), not through a supervisor hop as M1a's approval memory will, while the vendor lane's per-call policy round trip is the vendor's own; both lanes' in-cell times carry what their service does per call.

## Tree cost per scene

| scene | getAXState vendor ms | getAXState cua ms | getScreenshot vendor ms | getScreenshot cua ms | elements v/c | text bytes v/c | Skyshot bytes | nodes | engine total ms | walk ms | capture ms | enabled | web area |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| textedit | 53.2 | 64.4 | 54.7 | 44.2 | 59/61 | 4702/5088 | 29273 | 53 | 59.0 | 48.6 | 55.2 | — | — |
| finder | 441.7 | 162.3 | 446.8 | 141.7 | 252/310 | 11595/18685 | 139758 | 302 | 142.6 | 140.2 | 55.7 | — | — |
| chrome | 103.2 | 67.5 | 104.3 | 46.0 | 61/94 | 2679/5199 | 47709 | 83 | 60.7 | 53.3 | 55.5 | — | — |
| electron | 54.8 | 69.5 | 55.2 | 56.9 | 25/32 | 1186/1671 | 17030 | 26 | 63.5 | 22.3 | 58.1 | — | — |

## Probe (c′): fetch routes (cua lane, alternated per sample)

Preflight forwarded in 3 run(s).

| scene | public ms | hierarchy ms | walk ms public/hierarchy | nodes public/hierarchy | samples | switch dropped |
|---|---|---|---|---|---|---|
| textedit | 48.7 | 55.9 | 33.7/48.2 | 53/53 | 90/90 | 0 |
| finder | 149.8 | 242.9 | 128.9/219.5 | 302/302 | 90/90 | 0 |
| chrome | 53.8 | 55.0 | 40.1/45.8 | 83/83 | 90/90 | 0 |
| electron | 58.3 | 57.2 | 19.8/23.4 | 26/26 | 90/90 | 0 |

## Switch costs (cua lane, on and off alternated per sample)

- valueMarkdown: preflight forwarded in 3 run(s).
- focusableSelectable: preflight forwarded in 3 run(s).
- webAreaWait: preflight forwarded in 0 run(s). The webAreaWait switch did not run in 3 run(s) (see Not run).

| switch | scene | on ms | off ms | engine phase ms | samples on/off | switch dropped |
|---|---|---|---|---|---|---|
| valueMarkdown | textedit | 49.2 | 51.9 | 0.4 | 90/90 | 0 |
| valueMarkdown | finder | 149.8 | 143.7 | 1.7 | 90/90 | 0 |
| valueMarkdown | chrome | 48.7 | 50.1 | 0.3 | 90/90 | 0 |
| valueMarkdown | electron | 57.0 | 57.3 | — | 90/90 | 0 |
| focusableSelectable | textedit | 51.9 | 52.7 | 2.3 | 90/90 | 0 |
| focusableSelectable | finder | 145.7 | 130.7 | 16.4 | 90/90 | 0 |
| focusableSelectable | chrome | 51.9 | 49.4 | 5.9 | 90/90 | 0 |
| focusableSelectable | electron | 58.3 | 55.3 | 3 | 90/90 | 0 |

## Probe (c′): settle notifications at rest (cua lane)

Preflight forwarded in 3 run(s).

| scene | notifications | settle ms | per second | capped | samples | switch dropped |
|---|---|---|---|---|---|---|
| textedit | 0 | 347.1 | 0 | 0 | 15 | 0 |
| finder | 0 | 466.6 | 0 | 0 | 15 | 0 |
| chrome | 0 | 292.5 | 0 | 0 | 15 | 0 |
| electron | 0 | 267.2 | 0 | 0 | 15 | 0 |

## Rendering equivalence: reduced read set against full (cua lane)

Preflight forwarded in 3 run(s). A scene is equal when any sample at rest rendered the same text from both read sets, different only when every sample differed.

| scene | verdict | samples | full ms | reduced ms | saving ms | differing lines (median of mismatches) | not applied | failed |
|---|---|---|---|---|---|---|---|---|
| textedit | equal | 15 | 39.6 | 35.5 | 4.1 | 76 | 0 | 0 |
| finder | equal | 15 | 136.1 | 130.7 | 5.3 | 13 | 0 | 0 |
| chrome | different | 15 | 42.4 | 38.1 | 4.3 | 1 | 0 | 0 |
| electron | equal | 15 | 43.0 | 39.6 | 3.4 | 0 | 0 | 0 |

## Probe (c)

- probe.c.plainOpen (run 1): ok, activated false, frontmost changed false
- probe.c.plainOpen (run 2): ok, activated false, frontmost changed false
- probe.c.plainOpen (run 3): ok, activated false, frontmost changed false
- probe.c.twoCopies (run 1): ok, pids 52925/53093, own sockets true
- probe.c.twoCopies (run 2): ok, pids 67580/67717, own sockets true
- probe.c.twoCopies (run 3): ok, pids 80457/80715, own sockets true

## Not run

| lane | row | scene | source | reason | runs |
|---|---|---|---|---|---|
| cua | switch.webAreaWait | chrome | — | undetermined: chrome shows no effect of webAreaWait | 3 |
| cua | end_task | — | — | the spike serve runs the REPL host without the MCP proxy, which provides end_task | 3 |
