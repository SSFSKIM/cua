# #244: the first observation of a fresh Electron app (scripts/cursor-sitting/first-observation.mjs)

Each variant ran on a freshly launched fixture (its accessibility record off) and a session that bound nothing, so its first cell made the session's first engine observation of the fixture (one `get_app_state`, its text inspected in the cell). Writes are the fixture's `accessibility-support-changed` events, one per enablement-attribute write; complete mode (Chromium's own accessibility mode, on or off) is the `enabled` of the record's latest line of any source, since the event line carries the mode after its set and the fixture's poll writes only a change from the last line. In the session counts from the mark before the open to the mark before the close; after the close is the release's write. Off is the first line after the close, of any source, that turns the mode from on to off (the release's own event line can carry it), measured from when the session's close returned (negative: the release wrote before the close returned). The role read's `appRoleReadMs` was recorded under ordinary load: #244 sets no timing bar for it. Pass, for cua's engine on the plain variant: the button in the first observation, exactly 1 write in the session, complete mode on before the close, and off within 2500 ms of the close and still off when the record was last read, with no write after the close but the release's; every warm observation answered with its role read, or the run is incomplete. The sonoma variant (--enable-features=SonomaAccessibilityActivationRefinements) and the vendor's engine are recorded, not judged; sonoma's row is the evidence for the fallback, a longer web-area wait, which is #246.

| variant | engine | button in the first observation (index) | its text: lines / chars, page | writes: before the open / in the session / after the close | complete mode on (ms after the last write) | off (ms after the close; after the release's write) | verdict |
|---|---|---|---|---|---|---|---|
| plain | cua | yes (13) | 27 / 805, page | 0 / 1 / 1 | 2077 | -50; 0 | **PASS** |
| plain | vendor | yes (13) | 28 / 1014, page | 0 / 1 / 0 | 2013 | no | recorded (would be FAIL) |
| sonoma | cua | no | 14 / 326, no page | 0 / 1 / 1 | 2052 | -48; 0 | recorded (would be FAIL) |

| variant | engine | first: prior | enabled | role read, ms | web area found | web-area wait, ms | chromium | warm: role read, ms (min / median / max, n) | warm priors, in order | warm: button found |
|---|---|---|---|---|---|---|---|---|---|---|
| plain | cua | false | AXManualAccessibility | 3.6 | true | 116.0 | true | 0.1 / 0.2 / 0.2 (5) | owned, owned, owned, owned, owned | 5 of 5 |
| plain | vendor | – | – | – | – | – | – | – | –, –, –, –, – | 5 of 5 |
| sonoma | cua | false | AXManualAccessibility | 3.5 | false | 1117.6 | true | 0.2 / 0.2 / 0.3 (5) | owned, owned, owned, owned, owned | 5 of 5 |

## plain on cua

- the fixture's process 71938
- the first observation took 323.9 ms; the session's first write came 75 ms after it began
- held 1315 ms for complete mode after the warm observations
- the close took 240 ms

## plain on vendor

- the fixture's process 80213
- the first observation took 1345.2 ms; the session's first write came 1110 ms after it began
- held 911 ms for complete mode after the warm observations
- the close took 96 ms
- verdict: complete mode did not go off within 5000 ms of the close

## sonoma on cua

- the fixture's process 74528, launched with --enable-features=SonomaAccessibilityActivationRefinements
- the first observation took 1275.4 ms; the session's first write came 57 ms after it began
- held 0 ms for complete mode after the warm observations
- the close took 228 ms
- verdict: the button is not in the first observation (14 lines, 326 characters, no page)
