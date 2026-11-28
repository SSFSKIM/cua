## The key-route diagnostic (ruling 1198)

A diagnostic: its status is INFO and never changes this sitting's verdict; only a cleanup failure, named, is a FAIL. Where `pressKey("Escape")` lands while TextEdit's Open panel is focused, per engine through its own lane; fields 40 and 41 are the event's target and source unix pids as the listen-only taps saw them, read only inside the press's own window ("unavailable": a field the event did not carry).

| engine | Escape sent | posted to (field 40) | posted by (field 41) | seen by tap | panel closed by the Escape | note |
|---|---|---|---|---|---|---|
| vendor | yes | 7505 | 8838 | panelService | yes | |
| cua | yes | 11259 | 12017 | panelService | yes | |

### vendor's lane: TextEdit pid 7390

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 7505 | 7390 | 7505 | depth 0, pid 7505 | 7505 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 7390 | 7390 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 7390 | 7390 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 7390 | no | no |
| windowListTopAtPanelCenter | yes | 7390 | no | no |
| frontmostWindowOwner | yes | 7390 | no | no |
| runningApplicationsPanelService | yes | 7505 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 7390 | no | no |
| systemWideFocusedElementPid | yes | 7390 | no | no |
| systemWideFocusedApplicationPid | yes | 7390 | no | no |
| frontmostApplication | yes | 7390 | no | no |

### cua's lane: TextEdit pid 11240

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 11259 | 11240 | 11259 | depth 0, pid 11259 | 11259 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 11240 | 11240 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 11240 | 11240 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 11240 | no | no |
| windowListTopAtPanelCenter | yes | 11240 | no | no |
| frontmostWindowOwner | yes | 11240 | no | no |
| runningApplicationsPanelService | yes | 11259 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 11240 | no | no |
| systemWideFocusedElementPid | yes | 11240 | no | no |
| systemWideFocusedApplicationPid | yes | 11240 | no | no |
| frontmostApplication | yes | 11240 | no | no |

Input Monitoring granted to io.github.ssfskim.cua.key-route-tap: yes. The engines' TCC rows: unchanged (8 rows).

Cleanup: confirmed.
