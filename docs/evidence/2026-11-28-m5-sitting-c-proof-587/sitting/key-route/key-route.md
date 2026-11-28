## The key-route diagnostic (ruling 1198)

A diagnostic: its status is INFO and never changes this sitting's verdict; only a cleanup failure, named, is a FAIL. Where `pressKey("Escape")` lands while TextEdit's Open panel is focused, per engine through its own lane; fields 40 and 41 are the event's target and source unix pids as the listen-only taps saw them, read only inside the press's own window ("unavailable": a field the event did not carry).

| engine | Escape sent | posted to (field 40) | posted by (field 41) | seen by tap | panel closed by the Escape | note |
|---|---|---|---|---|---|---|
| vendor | yes | 22917 | 23616 | panelService | yes | |
| cua | yes | 25837 | 26205 | panelService | yes | |

### vendor's lane: TextEdit pid 22901

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 22917 | 22901 | 22917 | depth 0, pid 22917 | 22917 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 22901 | 22901 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 22901 | 22901 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 22901 | no | no |
| windowListTopAtPanelCenter | yes | 22901 | no | no |
| frontmostWindowOwner | yes | 22901 | no | no |
| runningApplicationsPanelService | yes | 22917 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 22901 | no | no |
| systemWideFocusedElementPid | yes | 22901 | no | no |
| systemWideFocusedApplicationPid | yes | 22901 | no | no |
| frontmostApplication | yes | 22901 | no | no |

### cua's lane: TextEdit pid 25518

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 25837 | 25518 | 25837 | depth 0, pid 25837 | 25837 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 25518 | 25518 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 25518 | 25518 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 25518 | no | no |
| windowListTopAtPanelCenter | yes | 25518 | no | no |
| frontmostWindowOwner | yes | 25518 | no | no |
| runningApplicationsPanelService | yes | 25837 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 25518 | no | no |
| systemWideFocusedElementPid | yes | 25518 | no | no |
| systemWideFocusedApplicationPid | yes | 25518 | no | no |
| frontmostApplication | yes | 25518 | no | no |

Input Monitoring granted to io.github.ssfskim.cua.key-route-tap: yes. The engines' TCC rows: unchanged (8 rows).

Cleanup: confirmed.
