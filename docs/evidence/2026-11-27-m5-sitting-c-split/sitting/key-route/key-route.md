## The key-route diagnostic (ruling 1198)

A diagnostic: its status is INFO and never changes this sitting's verdict; only a cleanup failure, named, is a FAIL. Where `pressKey("Escape")` lands while TextEdit's Open panel is focused, per engine through its own lane; fields 40 and 41 are the event's target and source unix pids as the listen-only taps saw them, read only inside the press's own window ("unavailable": a field the event did not carry).

| engine | Escape sent | posted to (field 40) | posted by (field 41) | seen by tap | panel closed by the Escape | note |
|---|---|---|---|---|---|---|
| vendor | yes | 7472 | 8181 | panelService | yes | |
| cua | yes | 10452 | 10813 | panelService | yes | |

### vendor's lane: TextEdit pid 7456

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 7472 | 7456 | 7472 | depth 0, pid 7472 | 7472 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 7456 | 7472 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 7456 | 7472 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 7456 | 7472 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 7456 | 7472 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 7456 | 7472 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 7456 | 7472 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 7456 | 7456 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 7456 | 7456 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 7456 | no | no |
| windowListTopAtPanelCenter | yes | 7456 | no | no |
| frontmostWindowOwner | yes | 7456 | no | no |
| runningApplicationsPanelService | yes | 7472 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 7456 | no | no |
| systemWideFocusedElementPid | yes | 7456 | no | no |
| systemWideFocusedApplicationPid | yes | 7456 | no | no |
| frontmostApplication | yes | 7456 | no | no |

### cua's lane: TextEdit pid 10442

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 10452 | 10442 | 10452 | depth 0, pid 10452 | 10452 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 10442 | 10452 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 10442 | 10452 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 10442 | 10452 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 10442 | 10452 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 10442 | 10452 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 10442 | 10452 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 10442 | 10442 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 10442 | 10442 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 10442 | no | no |
| windowListTopAtPanelCenter | yes | 10442 | no | no |
| frontmostWindowOwner | yes | 10442 | no | no |
| runningApplicationsPanelService | yes | 10452 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 10442 | no | no |
| systemWideFocusedElementPid | yes | 10442 | no | no |
| systemWideFocusedApplicationPid | yes | 10442 | no | no |
| frontmostApplication | yes | 10442 | no | no |

Input Monitoring granted to io.github.ssfskim.cua.key-route-tap: yes. The engines' TCC rows: unchanged (8 rows).

Cleanup: confirmed.
