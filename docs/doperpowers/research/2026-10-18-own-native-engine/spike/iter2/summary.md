# Own native engine spike: promote or discard

Runs: vendor 3, cua 3. In-cell medians in ms over the successful samples of every run of a lane.

**Verdict: NO VERDICT: speed at or below the vendor's; the input rows did not run**

| Promote row | vendor | cua | samples (v/c) | cua against vendor |
|---|---|---|---|---|
| getAXState, TextEdit (tree + render), in-cell | 50.7 | 43.1 | 90/90 | at or below |
| getScreenshot, TextEdit, in-cell | 53.4 | 45.8 | 90/90 | at or below |
| click to TextEdit and Finder | — | — | — | not run: the user window's scene (finder) is not up |
| pressKey to TextEdit and Finder | — | — | — | not run: the user window's scene (finder) is not up |
| listApps, in-cell (not judged) | 24.7 | 2.3 | 90/90 | at or below |

Approvals: the cua lane answers a repeat approval for the same app inside the spike service (one elicitation per connection and app), not through a supervisor hop as M1a's approval memory will, while the vendor lane's per-call policy round trip is the vendor's own; both lanes' in-cell times carry what their service does per call.

## Tree cost per scene

| scene | getAXState vendor ms | getAXState cua ms | getScreenshot vendor ms | getScreenshot cua ms | elements v/c | text bytes v/c | Skyshot bytes | nodes | engine total ms | walk ms | capture ms | enabled | web area |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| textedit | 55.7 | 58.9 | 53.4 | 45.8 | 59/61 | 4702/5088 | 29272.5 | 53 | 54.4 | 42.8 | 51.6 | — | — |

## Probe (c′): fetch routes (cua lane, alternated per sample)

Preflight forwarded in 3 run(s).

| scene | public ms | hierarchy ms | walk ms public/hierarchy | nodes public/hierarchy | samples | switch dropped |
|---|---|---|---|---|---|---|
| textedit | 46.0 | 47.9 | 32.3/41.0 | 53/53 | 90/90 | 0 |

## Switch costs (cua lane, on and off alternated per sample)

- valueMarkdown: preflight forwarded in 3 run(s).
- focusableSelectable: preflight forwarded in 3 run(s).
- webAreaWait: preflight forwarded in 0 run(s). The webAreaWait switch did not run in 3 run(s) (see Not run).

| switch | scene | on ms | off ms | engine phase ms | samples on/off | switch dropped |
|---|---|---|---|---|---|---|
| valueMarkdown | textedit | 44.8 | 46.5 | 0.3 | 90/90 | 0 |
| focusableSelectable | textedit | 45.1 | 46.0 | 2.0 | 90/90 | 0 |

## Probe (c′): settle notifications at rest (cua lane)

Preflight forwarded in 3 run(s).

| scene | notifications | settle ms | per second | capped | samples | switch dropped |
|---|---|---|---|---|---|---|
| textedit | 0 | 350.7 | 0 | 0 | 15 | 0 |

## Rendering equivalence: reduced read set against full (cua lane)

Preflight forwarded in 3 run(s). A scene is equal when any sample at rest rendered the same text from both read sets, different only when every sample differed.

| scene | verdict | samples | full ms | reduced ms | saving ms | differing lines (median of mismatches) | not applied | failed |
|---|---|---|---|---|---|---|---|---|
| textedit | equal | 15 | 33.2 | 34.8 | -1.6 | 0 | 0 | 0 |

## Not run

| lane | row | scene | source | reason | runs |
|---|---|---|---|---|---|
| vendor | probe.e.concealed | textedit | — | a concealed type_text needs the secret store; the spike serve runs with secrets off | 3 |
| vendor | probe.e.perContext | textedit | — | the per-context input preference is the owner's; changing and restoring it is the matrix's (M2b) | 3 |
| vendor | probe.d.tap | textedit | — | the listen-only event tap is cua's engine; the cua lane runs the real rows | 3 |
| vendor | probe.d.hidReset | textedit | — | the keystroke probe is cua's engine; the cua lane runs the real rows | 3 |
| cua | probe.e.concealed | textedit | — | a concealed type_text needs the secret store; the spike serve runs with secrets off | 3 |
| cua | probe.e.perContext | textedit | — | the per-context input preference is the owner's; changing and restoring it is the matrix's (M2b) | 3 |
| cua | switch.webAreaWait | — | — | no scene of this run can show webAreaWait | 3 |
| cua | probe.a.click | textedit | — | the user window's scene (finder) is not up | 3 |
| cua | probe.a.key | textedit | — | the user window's scene (finder) is not up | 3 |
| cua | probe.d.operatorKeystroke | textedit | — | operator steps not requested (--operator) | 3 |
| cua | probe.d.backgroundClick | textedit | — | operator steps not requested (--operator) | 3 |
| cua | end_task | — | — | the spike serve runs the REPL host without the MCP proxy, which provides end_task | 3 |
