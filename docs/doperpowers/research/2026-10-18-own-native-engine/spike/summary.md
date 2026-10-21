# Own native engine spike: promote or discard

Runs: vendor 3, cua 3. In-cell medians in ms over the successful samples of every run of a lane.

**Verdict: DISCARD FORK: a speed row is above the vendor's (three tuning iterations, then the owner's call)**

| Promote row | vendor | cua | samples (v/c) | cua against vendor |
|---|---|---|---|---|
| getAXState, TextEdit (tree + render), in-cell | 56.0 | 98.2 | 90/90 | above |
| getScreenshot, TextEdit, in-cell | 55.3 | 99.8 | 90/90 | above |
| click to TextEdit and Finder | — | routes  | — | failed |
| pressKey to TextEdit and Finder | — | routes  | — | failed |
| listApps, in-cell (not judged) | 34.9 | 2.7 | 90/90 | at or below |

Approvals: the cua lane answers a repeat approval for the same app inside the spike service (one elicitation per connection and app), not through a supervisor hop as M1a's approval memory will, while the vendor lane's per-call policy round trip is the vendor's own; both lanes' in-cell times carry what their service does per call.

## Tree cost per scene

| scene | getAXState vendor ms | getAXState cua ms | getScreenshot vendor ms | getScreenshot cua ms | elements v/c | text bytes v/c | Skyshot bytes | nodes | engine total ms | walk ms | capture ms | enabled | web area |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| textedit | 62.9 | 120.5 | 55.3 | 99.8 | 59/61 | 4702/5088 | 29245 | 53 | 113.2 | 55.9 | 54.1 | — | — |
| finder | 458.8 | 293.1 | 467.9 | 238.8 | 252/310 | 11613/18703 | 139753 | 302 | 274.2 | 229.3 | 39.2 | — | — |
| electron | 57.4 | 86.7 | 57.3 | 70.7 | 25/32 | 1186/1671 | 17001 | 26 | 80.4 | 23.4 | 50.2 | — | — |

## Probe (c′): fetch routes (cua lane, alternated per sample)

Preflight forwarded in 3 run(s).

| scene | public ms | hierarchy ms | walk ms public/hierarchy | nodes public/hierarchy | samples | switch dropped |
|---|---|---|---|---|---|---|
| textedit | 119.7 | 135.1 | 53.4/71.5 | 53/53 | 90/90 | 0 |
| finder | 267.7 | 340.7 | 207.7/270.1 | 302/302 | 90/90 | 0 |
| chrome | 114.9 | 157.7 | 62.4/91.2 | 85/85 | 90/90 | 0 |
| electron | 75.3 | 81.4 | 22.3/26.5 | 26/26 | 90/90 | 0 |

## Switch costs (cua lane, on and off alternated per sample)

- valueMarkdown: preflight forwarded in 3 run(s).
- focusableSelectable: preflight forwarded in 3 run(s).
- webAreaWait: preflight forwarded in 0 run(s). The webAreaWait switch did not run in 3 run(s) (see Not run).

| switch | scene | on ms | off ms | engine phase ms | samples on/off | switch dropped |
|---|---|---|---|---|---|---|
| valueMarkdown | textedit | 119.0 | 122.1 | 0.5 | 90/90 | 0 |
| valueMarkdown | finder | 259.7 | 236.6 | 3.1 | 90/90 | 0 |
| valueMarkdown | chrome | 113.5 | 104.5 | 0.4 | 90/90 | 0 |
| valueMarkdown | electron | 77.2 | 74.7 | — | 90/90 | 0 |
| focusableSelectable | textedit | 121.9 | 115.1 | 3.5 | 90/90 | 0 |
| focusableSelectable | finder | 249.9 | 237.8 | 28.4 | 90/90 | 0 |
| focusableSelectable | chrome | 106.7 | 113.7 | 10.5 | 90/90 | 0 |
| focusableSelectable | electron | 77.5 | 72.3 | 3.5 | 90/90 | 0 |

## Probe (c′): settle notifications at rest (cua lane)

Preflight forwarded in 3 run(s).

| scene | notifications | settle ms | per second | capped | samples | switch dropped |
|---|---|---|---|---|---|---|
| textedit | 0 | 347.6 | 0 | 0 | 15 | 0 |
| finder | 0 | 456.0 | 0 | 0 | 15 | 0 |
| chrome | 0 | 292.5 | 0 | 0 | 15 | 0 |
| electron | 0 | 267.1 | 0 | 0 | 15 | 0 |

## Rendering equivalence: reduced read set against full (cua lane)

Preflight forwarded in 3 run(s). A scene is equal when any sample at rest rendered the same text from both read sets, different only when every sample differed.

| scene | verdict | samples | full ms | reduced ms | saving ms | differing lines (median of mismatches) | not applied | failed |
|---|---|---|---|---|---|---|---|---|
| textedit | equal | 15 | 81.9 | 87.0 | -5.1 | 76 | 0 | 0 |
| finder | equal | 15 | 189.2 | 199.3 | -10.1 | 13 | 0 | 0 |
| chrome | different | 15 | 76.7 | 68.5 | 8.1 | 1 | 0 | 0 |
| electron | equal | 15 | 53.8 | 54.6 | -0.8 | 9 | 0 | 0 |

## Probe (c)

- probe.c.plainOpen (run 1): ok, activated false, frontmost changed false
- probe.c.plainOpen (run 2): ok, activated false, frontmost changed false
- probe.c.plainOpen (run 3): ok, activated false, frontmost changed false
- probe.c.twoCopies (run 1): ok, pids 44197/44277, own sockets true
- probe.c.twoCopies (run 2): ok, pids 69888/70044, own sockets true
- probe.c.twoCopies (run 3): ok, pids 735/826, own sockets true

## Not run

| lane | row | scene | source | reason | runs |
|---|---|---|---|---|---|
| vendor | probe.e.concealed | textedit | — | a concealed type_text needs the secret store; the spike serve runs with secrets off | 3 |
| vendor | probe.e.perContext | textedit | — | the per-context input preference is the owner's; changing and restoring it is the matrix's (M2b) | 3 |
| vendor | probe.d.tap | textedit | — | the listen-only event tap is cua's engine; the cua lane runs the real rows | 3 |
| vendor | probe.d.hidReset | textedit | — | the keystroke probe is cua's engine; the cua lane runs the real rows | 3 |
| cua | probe.e.concealed | textedit | — | a concealed type_text needs the secret store; the spike serve runs with secrets off | 3 |
| cua | probe.e.perContext | textedit | — | the per-context input preference is the owner's; changing and restoring it is the matrix's (M2b) | 3 |
| cua | switch.webAreaWait | chrome | — | undetermined: chrome shows no effect of webAreaWait | 3 |
| cua | probe.d.operatorKeystroke | textedit | — | operator steps not requested (--operator) | 3 |
| cua | probe.d.backgroundClick | textedit | — | operator steps not requested (--operator) | 3 |
| cua | end_task | — | — | the spike serve runs the REPL host without the MCP proxy, which provides end_task | 3 |
