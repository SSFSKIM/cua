# linux-engine-diff summary

## t49-qtbridge (experiment qt-bridge)

On the run's own session bus, as found: `IsEnabled` true, `ScreenReaderEnabled` false.

| application | condition | registered with the registry | frame named for the document | cua-engine tree | its nodes | pinned tree |
|---|---|---|---|---|---|---|
| kate | as found | true | true | at_spi | 893 | x11 |
| qtcreator | as found | true | true | at_spi | 1261 | at_spi |
| kate | IsEnabled false | true | true | at_spi | 893 | x11 |
| qtcreator | IsEnabled false | false | false | x11 | 1 | x11 |
| kate | IsEnabled false, QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 | true | true | at_spi | 893 | x11 |
| qtcreator | IsEnabled false, QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 | true | true | at_spi | 1261 | at_spi |
| kate | IsEnabled false, ScreenReaderEnabled true | true | true | at_spi | 893 | x11 |
| qtcreator | IsEnabled false, ScreenReaderEnabled true | true | true | at_spi | 1261 | at_spi |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 173 requests, 24 changes of a window, every one of its own; the run's record: not run, since the display is not a private one (the sampled route audits judge the engines' requests)

