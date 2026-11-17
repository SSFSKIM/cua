| scene | op | step | cold: pinned / newest / cua (ms) | warm: pinned / newest / cua (ms) | cua verdict |
|---|---|---|---|---|---|
| gedit | tree | V2 | 572.8 / 564.8 / 91.8 | 650 / 558.3 / 80.9 | PASS (cold faster [-497.57, -459.205]; warm faster [-492.48, -452.68]) |
| chrome | tree | V2 | 475.2 / 459.6 / 68.8 | 448.1 / 434.3 / 65.5 | PASS (cold faster [-414.695, -365.545]; warm faster [-403.74, -350.43] |
| gedit | tree_shot | V2 | 703.8 / 696.5 / 129.1 | 745.7 / 719.5 / 103.5 | PASS (cold faster [-592.45, -532.405]; warm faster [-636.98, -570.84]) |
| chrome | tree_shot | V2 | 609.6 / 632.8 / 121.7 | 575.9 / 621.2 / 84.5 | PASS (cold faster [-518.72, -464.625]; warm faster [-523.35, -474.08]) |
| gedit | press_key | V2 | 273.4 / 240.4 / 7 | 268.9 / 235.7 / 1.1 | PASS (cold faster [-234.12, -232.615]; warm faster [-234.82, -234.39]) |
| chrome | press_key | V2 | 273.5 / 240.7 / 5.9 | 269.3 / 236.2 / 1.2 | PASS (cold faster [-236.01, -234.035]; warm faster [-235.23, -234.725] |
| gedit | click | V2 | 219.5 / 221 / 20 | 214.9 / 215.9 / 14 | PASS (cold faster [-200.7, -198.95]; warm faster [-201.17, -200.43]) |
| chrome | click | V2 | 219 / 220.4 / 18.4 | 214.9 / 215.6 / 14 | PASS (cold faster [-201.19, -200.215]; warm faster [-201.33, -200.355] |
| chrome-input | scroll | V3 | 315 / 317 / 114.6 | 311.1 / 312.2 / 110.2 | PASS (cold faster [-201.43, -199.34]; warm faster [-201.13, -200.56]) |
| chrome-input | drag | V3 | 717.6 / 417.6 / 4 | 705 / 413.6 / 1.2 | **declared refusal**, a loss, not a pass (Decision Log, M3.1 (Chromium |
