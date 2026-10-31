# The edge sweep (dnd experiment, Chrome, --no-grabs, 20 drags a lane)

## front-idle

lanes: pinned,cua:active-s500,cua:active-s750,cua:active-s1000,cua:active-s1250,cua:active-s1500,cua:active-f1000,cua:active-f1500,cua:active-f2000,cua:active-c300


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| pinned | 20/20 | 622.4 | 401 (386) | 149 (144) | 0 | [] |
| cua:active-s500 | 20/20 | 508.7 | 389 (368) | 150 (143) | 0 | [] |
| cua:active-s750 | 20/20 | 516.2 | 401 (374) | 150 (131) | 0 | [] |
| cua:active-s1000 | 20/20 | 523.5 | 404 (383) | 149 (144) | 0 | [] |
| cua:active-s1250 | 20/20 | 524.7 | 403 (386) | 151 (145) | 0 | [] |
| cua:active-s1500 | 20/20 | 580.5 | 458 (436) | 170 (166) | 0 | [] |
| cua:active-f1000 | 20/20 | 494 | 371 (311) | 144 (113) | 0 | [] |
| cua:active-f1500 | 20/20 | 519 | 398 (382) | 156 (153) | 0 | [] |
| cua:active-f2000 | 20/20 | 610.3 | 490 (474) | 206 (204) | 0 | [] |
| cua:active-c300 | 20/20 | 457.3 | 336 (284) | 140 (105) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 250–300 | 2 | 0 |
| 300–350 | 17 | 0 |
| 350–400 | 79 | 0 |
| 400–500 | 96 | 0 |
| 500–700 | 6 | 0 |

```
  pinned median 620.8 (n 20); vs cua:active-s500 507.6: LOSS [105.5, 124.0]
  cua:active-s500 median 507.6 (n 20); vs pinned 620.8: faster [-124.5, -105.1]
  cua:active-s750 median 515.2 (n 20); vs pinned 620.8: faster [-116.0, -96.9]; vs cua:active-s500 507.6: same (within noise) [-2.1, 19.3]
  cua:active-s1000 median 523.1 (n 20); vs pinned 620.8: faster [-109.5, -90.9]; vs cua:active-s500 507.6: within the bound [4.2, 24.9]
  cua:active-s1250 median 523.2 (n 20); vs pinned 620.8: faster [-106.2, -84.5]; vs cua:active-s500 507.6: LOSS [7.7, 30.9]
  cua:active-s1500 median 580.4 (n 20); vs pinned 620.8: faster [-50.9, -31.7]; vs cua:active-s500 507.6: LOSS [62.7, 83.7]
  cua:active-f1000 median 491.4 (n 20); vs pinned 620.8: faster [-143.7, -119.3]; vs cua:active-s500 507.6: faster [-29.4, -3.1]
  cua:active-f1500 median 517.0 (n 20); vs pinned 620.8: faster [-112.9, -90.5]; vs cua:active-s500 507.6: within the bound [1.4, 24.8]
  cua:active-f2000 median 609.0 (n 20); vs pinned 620.8: faster [-19.9, -3.2]; vs cua:active-s500 507.6: LOSS [93.5, 112.6]
  cua:active-c300 median 457.1 (n 20); vs pinned 620.8: faster [-174.2, -153.1]; vs cua:active-s500 507.6: faster [-60.6, -36.8]
```

## ded-idle

lanes: cua:dedicated-s500,cua:dedicated-s750,cua:dedicated-s1000,cua:dedicated-s1250,cua:dedicated-s1500,cua:dedicated-f1000,cua:dedicated-f1500,cua:dedicated-f2000,cua:dedicated-c300


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:dedicated-s500 | 20/20 | 567.9 | 463 (339) | 235 (200) | 0 | [] |
| cua:dedicated-s750 | 20/20 | 612.3 | 510 (485) | 246 (236) | 0 | [] |
| cua:dedicated-s1000 | 20/20 | 699.2 | 580 (527) | 263 (243) | 0 | [] |
| cua:dedicated-s1250 | 20/20 | 722 | 607 (572) | 256 (242) | 0 | [] |
| cua:dedicated-s1500 | 20/20 | 744.6 | 631 (592) | 257 (244) | 0 | [] |
| cua:dedicated-f1000 | 20/20 | 606.5 | 496 (471) | 244 (232) | 0 | [] |
| cua:dedicated-f1500 | 20/20 | 673 | 567 (514) | 250 (228) | 0 | [] |
| cua:dedicated-f2000 | 20/20 | 703.9 | 603 (575) | 247 (239) | 0 | [] |
| cua:dedicated-c300 | 20/20 | 550.8 | 451 (349) | 241 (222) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 300–350 | 2 | 0 |
| 350–400 | 3 | 0 |
| 400–500 | 39 | 0 |
| 500–700 | 135 | 0 |
| 700– | 1 | 0 |

```
  cua:dedicated-s500 median 564.6 (n 20); 
  cua:dedicated-s750 median 611.5 (n 20); vs cua:dedicated-s500 564.6: undetermined [-27.5, 96.9]
  cua:dedicated-s1000 median 692.0 (n 20); vs cua:dedicated-s500 564.6: LOSS [46.8, 159.6]
  cua:dedicated-s1250 median 719.1 (n 20); vs cua:dedicated-s500 564.6: LOSS [71.5, 187.5]
  cua:dedicated-s1500 median 744.6 (n 20); vs cua:dedicated-s500 564.6: LOSS [96.5, 207.1]
  cua:dedicated-f1000 median 606.0 (n 20); vs cua:dedicated-s500 564.6: undetermined [-43.4, 72.3]
  cua:dedicated-f1500 median 672.0 (n 20); vs cua:dedicated-s500 564.6: LOSS [24.4, 138.3]
  cua:dedicated-f2000 median 703.9 (n 20); vs cua:dedicated-s500 564.6: LOSS [56.3, 166.0]
  cua:dedicated-c300 median 545.7 (n 20); vs cua:dedicated-s500 564.6: undetermined [-96.8, 118.5]
```

## front-load2

lanes: pinned,cua:active-s500,cua:active-s750,cua:active-s1000,cua:active-s1250,cua:active-s1500,cua:active-f1000,cua:active-f1500,cua:active-f2000,cua:active-c300


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| pinned | 20/20 | 787.1 | 566 (432) | 221 (164) | 0 | [] |
| cua:active-s500 | 20/20 | 530.5 | 415 (355) | 154 (137) | 0 | [] |
| cua:active-s750 | 20/20 | 606.4 | 484 (380) | 189 (153) | 0 | [] |
| cua:active-s1000 | 20/20 | 644.9 | 522 (435) | 200 (159) | 0 | [] |
| cua:active-s1250 | 20/20 | 710.7 | 591 (464) | 233 (173) | 0 | [] |
| cua:active-s1500 | 20/20 | 775.2 | 645 (470) | 257 (196) | 0 | [] |
| cua:active-f1000 | 20/20 | 559.9 | 435 (380) | 165 (146) | 0 | [] |
| cua:active-f1500 | 20/20 | 603.4 | 484 (437) | 192 (165) | 0 | [] |
| cua:active-f2000 | 20/20 | 668.1 | 548 (492) | 221 (206) | 0 | [] |
| cua:active-c300 | 20/20 | 533.3 | 408 (338) | 157 (116) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 300–350 | 2 | 0 |
| 350–400 | 19 | 0 |
| 400–500 | 84 | 0 |
| 500–700 | 95 | 0 |

```
  pinned median 786.2 (n 20); vs cua:active-s500 527.1: LOSS [221.2, 280.9]
  cua:active-s500 median 527.1 (n 20); vs pinned 786.2: faster [-279.9, -221.5]
  cua:active-s750 median 600.8 (n 20); vs pinned 786.2: faster [-223.7, -149.2]; vs cua:active-s500 527.1: LOSS [37.5, 96.7]
  cua:active-s1000 median 644.2 (n 20); vs pinned 786.2: faster [-170.7, -102.5]; vs cua:active-s500 527.1: LOSS [87.3, 143.0]
  cua:active-s1250 median 707.8 (n 20); vs pinned 786.2: faster [-123.2, -43.0]; vs cua:active-s500 527.1: LOSS [133.4, 198.8]
  cua:active-s1500 median 773.1 (n 20); vs pinned 786.2: same (within noise) [-40.6, 22.9]; vs cua:active-s500 527.1: LOSS [216.4, 270.1]
  cua:active-f1000 median 551.5 (n 20); vs pinned 786.2: faster [-263.3, -194.1]; vs cua:active-s500 527.1: undetermined [-8.6, 51.5]
  cua:active-f1500 median 602.7 (n 20); vs pinned 786.2: faster [-203.6, -148.8]; vs cua:active-s500 527.1: LOSS [50.9, 86.8]
  cua:active-f2000 median 665.0 (n 20); vs pinned 786.2: faster [-143.6, -86.0]; vs cua:active-s500 527.1: LOSS [112.9, 150.6]
  cua:active-c300 median 528.2 (n 20); vs pinned 786.2: faster [-300.9, -221.8]; vs cua:active-s500 527.1: same (within noise) [-41.6, 24.4]
```

## ded-load2

lanes: cua:dedicated-s500,cua:dedicated-s750,cua:dedicated-s1000,cua:dedicated-s1250,cua:dedicated-s1500,cua:dedicated-f1000,cua:dedicated-f1500,cua:dedicated-f2000,cua:dedicated-c300


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:dedicated-s500 | 20/20 | 637.7 | 518 (445) | 295 (235) | 0 | [] |
| cua:dedicated-s750 | 20/20 | 750.6 | 639 (563) | 284 (263) | 0 | [] |
| cua:dedicated-s1000 | 20/20 | 810.1 | 704 (609) | 290 (267) | 0 | [] |
| cua:dedicated-s1250 | 20/20 | 869.2 | 752 (689) | 316 (287) | 0 | [] |
| cua:dedicated-s1500 | 20/20 | 902.3 | 779 (692) | 310 (277) | 0 | [] |
| cua:dedicated-f1000 | 20/20 | 739.8 | 629 (554) | 287 (231) | 0 | [] |
| cua:dedicated-f1500 | 20/20 | 816.1 | 703 (588) | 291 (237) | 0 | [] |
| cua:dedicated-f2000 | 20/20 | 829.1 | 721 (650) | 288 (259) | 0 | [] |
| cua:dedicated-c300 | 20/20 | 616.8 | 511 (446) | 283 (243) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 400–500 | 14 | 0 |
| 500–700 | 88 | 0 |
| 700– | 78 | 0 |

```
  cua:dedicated-s500 median 634.6 (n 20); 
  cua:dedicated-s750 median 749.6 (n 20); vs cua:dedicated-s500 634.6: LOSS [65.8, 152.3]
  cua:dedicated-s1000 median 805.0 (n 20); vs cua:dedicated-s500 634.6: LOSS [112.8, 209.6]
  cua:dedicated-s1250 median 867.6 (n 20); vs cua:dedicated-s500 634.6: LOSS [199.9, 301.8]
  cua:dedicated-s1500 median 895.6 (n 20); vs cua:dedicated-s500 634.6: LOSS [210.2, 287.9]
  cua:dedicated-f1000 median 734.1 (n 20); vs cua:dedicated-s500 634.6: LOSS [41.7, 138.6]
  cua:dedicated-f1500 median 816.0 (n 20); vs cua:dedicated-s500 634.6: LOSS [128.7, 226.7]
  cua:dedicated-f2000 median 827.9 (n 20); vs cua:dedicated-s500 634.6: LOSS [154.0, 217.4]
  cua:dedicated-c300 median 615.8 (n 20); vs cua:dedicated-s500 634.6: undetermined [-53.8, 53.6]
```

## front-pin-browser

lanes: cua:active-s500,cua:active-f1500,cua:active-f2000,cua:active-c300,cua:active-c600


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:active-s500 | 20/20 | 509.5 | 396 (309) | 149 (142) | 0 | [] |
| cua:active-f1500 | 20/20 | 519.6 | 402 (384) | 156 (153) | 0 | [] |
| cua:active-f2000 | 20/20 | 617 | 498 (475) | 206 (204) | 0 | [] |
| cua:active-c300 | 20/20 | 498.2 | 378 (339) | 148 (132) | 0 | [] |
| cua:active-c600 | 20/20 | 505.8 | 385 (357) | 147 (132) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 300–350 | 2 | 0 |
| 350–400 | 50 | 0 |
| 400–500 | 39 | 0 |
| 500–700 | 9 | 0 |

```
  cua:active-s500 median 508.6 (n 20); 
  cua:active-f1500 median 519.3 (n 20); vs cua:active-s500 508.6: same (within noise) [-1.9, 23.4]
  cua:active-f2000 median 614.0 (n 20); vs cua:active-s500 508.6: LOSS [92.1, 118.8]
  cua:active-c300 median 496.4 (n 20); vs cua:active-s500 508.6: same (within noise) [-25.4, 3.0]
  cua:active-c600 median 505.6 (n 20); vs cua:active-s500 508.6: same (within noise) [-16.8, 7.0]
```

## front-pin-renderer

lanes: cua:active-s500,cua:active-f1500,cua:active-f2000,cua:active-c300,cua:active-c600


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:active-s500 | 20/20 | 515 | 399 (367) | 148 (140) | 0 | [] |
| cua:active-f1500 | 20/20 | 512.3 | 395 (377) | 156 (154) | 0 | [] |
| cua:active-f2000 | 20/20 | 618.4 | 499 (467) | 206 (204) | 0 | [] |
| cua:active-c300 | 20/20 | 507.3 | 389 (342) | 149 (132) | 0 | [] |
| cua:active-c600 | 20/20 | 506.9 | 387 (301) | 148 (119) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 300–350 | 4 | 0 |
| 350–400 | 50 | 0 |
| 400–500 | 37 | 0 |
| 500–700 | 9 | 0 |

```
  cua:active-s500 median 514.9 (n 20); 
  cua:active-f1500 median 511.8 (n 20); vs cua:active-s500 514.9: same (within noise) [-14.3, 6.9]
  cua:active-f2000 median 615.5 (n 20); vs cua:active-s500 514.9: LOSS [88.4, 111.3]
  cua:active-c300 median 506.6 (n 20); vs cua:active-s500 514.9: same (within noise) [-23.7, 0.8]
  cua:active-c600 median 506.4 (n 20); vs cua:active-s500 514.9: same (within noise) [-20.1, 1.1]
```

## ded-pin-browser

lanes: cua:dedicated-s500,cua:dedicated-f1500,cua:dedicated-f2000,cua:dedicated-c300,cua:dedicated-c600


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:dedicated-s500 | 20/20 | 566.3 | 462 (260) | 194 (119) | 0 | [] |
| cua:dedicated-f1500 | 20/20 | 625.2 | 525 (444) | 221 (172) | 0 | [] |
| cua:dedicated-f2000 | 20/20 | 697.1 | 590 (537) | 246 (220) | 0 | [] |
| cua:dedicated-c300 | 20/20 | 565.9 | 455 (321) | 200 (181) | 0 | [] |
| cua:dedicated-c600 | 20/20 | 533.1 | 422 (253) | 203 (86) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 250–300 | 3 | 0 |
| 300–350 | 12 | 0 |
| 350–400 | 13 | 0 |
| 400–500 | 22 | 0 |
| 500–700 | 50 | 0 |

```
  cua:dedicated-s500 median 564.3 (n 20); 
  cua:dedicated-f1500 median 624.8 (n 20); vs cua:dedicated-s500 564.3: LOSS [38.7, 145.3]
  cua:dedicated-f2000 median 694.9 (n 20); vs cua:dedicated-s500 564.3: LOSS [106.7, 217.4]
  cua:dedicated-c300 median 527.1 (n 20); vs cua:dedicated-s500 564.3: undetermined [-101.8, 87.6]
  cua:dedicated-c600 median 518.5 (n 20); vs cua:dedicated-s500 564.3: undetermined [-104.8, 101.7]
```

## front-pin-all

lanes: cua:active-s500,cua:active-f1000,cua:active-f1500,cua:active-c300,cua:active-c600


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:active-s500 | 20/20 | 444.6 | 333 (281) | 119 (83) | 0 | [] |
| cua:active-f1000 | 20/20 | 479.2 | 364 (327) | 134 (120) | 0 | [] |
| cua:active-f1500 | 20/20 | 528.7 | 414 (390) | 157 (153) | 0 | [] |
| cua:active-c300 | 20/20 | 440 | 324 (293) | 113 (102) | 0 | [] |
| cua:active-c600 | 20/20 | 431.8 | 319 (268) | 107 (98) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 250–300 | 5 | 0 |
| 300–350 | 57 | 0 |
| 350–400 | 21 | 0 |
| 400–500 | 17 | 0 |

```
  cua:active-s500 median 444.6 (n 20); 
  cua:active-f1000 median 478.9 (n 20); vs cua:active-s500 444.6: LOSS [21.6, 44.0]
  cua:active-f1500 median 528.7 (n 20); vs cua:active-s500 444.6: LOSS [76.3, 90.0]
  cua:active-c300 median 439.1 (n 20); vs cua:active-s500 444.6: faster [-16.6, -0.5]
  cua:active-c600 median 431.4 (n 20); vs cua:active-s500 444.6: same (within noise) [-23.1, 0.7]
```

## budget-front-load2

lanes: pinned,cua:active-s500,cua:active-b1250,cua:active-b1500


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| pinned | 20/20 | 755.6 | 531 (419) | 208 (159) | 0 | [] |
| cua:active-s500 | 20/20 | 534.7 | 413 (375) | 162 (135) | 0 | [] |
| cua:active-b1250 | 20/20 | 541.7 | 424 (346) | 159 (137) | 0 | [] |
| cua:active-b1500 | 20/20 | 535.5 | 412 (367) | 159 (130) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 300–350 | 1 | 0 |
| 350–400 | 15 | 0 |
| 400–500 | 49 | 0 |
| 500–700 | 15 | 0 |

```
  pinned median 754.7 (n 20); vs cua:active-s500 534.4: LOSS [183.2, 242.8]
  cua:active-s500 median 534.4 (n 20); vs pinned 754.7: faster [-242.1, -181.1]
  cua:active-b1250 median 540.0 (n 20); vs pinned 754.7: faster [-244.4, -182.7]; vs cua:active-s500 534.4: same (within noise) [-26.9, 22.3]
  cua:active-b1500 median 533.4 (n 20); vs pinned 754.7: faster [-245.5, -187.1]; vs cua:active-s500 534.4: same (within noise) [-28.9, 18.4]
```

## budget-ded-idle

lanes: cua:dedicated-s500,cua:dedicated-b1250,cua:dedicated-b1500


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:dedicated-s500 | 20/20 | 596.5 | 492 (426) | 244 (225) | 0 | [] |
| cua:dedicated-b1250 | 20/20 | 638.3 | 538 (497) | 238 (228) | 0 | [] |
| cua:dedicated-b1500 | 20/20 | 661.3 | 557 (517) | 237 (226) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 400–500 | 16 | 0 |
| 500–700 | 44 | 0 |

```
  cua:dedicated-s500 median 596.0 (n 20); 
  cua:dedicated-b1250 median 638.1 (n 20); vs cua:dedicated-s500 596.0: LOSS [27.6, 70.3]
  cua:dedicated-b1500 median 658.8 (n 20); vs cua:dedicated-s500 596.0: LOSS [45.5, 88.6]
```

## budget-ded-load2

lanes: cua:dedicated-s500,cua:dedicated-b1250,cua:dedicated-b1500


| lane | drops | ms median | take→release median (min) | accept→release median (min) | no accept before release | misses: take→release |
|---|---:|---:|---:|---:|---:|---|
| cua:dedicated-s500 | 20/20 | 742.6 | 636 (551) | 275 (241) | 0 | [] |
| cua:dedicated-b1250 | 20/20 | 760.6 | 646 (576) | 272 (240) | 0 | [] |
| cua:dedicated-b1500 | 20/20 | 761.2 | 641 (566) | 259 (229) | 0 | [] |

| take→release ms | drags | misses |
|---|---:|---:|
| 500–700 | 53 | 0 |
| 700– | 7 | 0 |

```
  cua:dedicated-s500 median 742.0 (n 20); 
  cua:dedicated-b1250 median 760.5 (n 20); vs cua:dedicated-s500 742.0: LOSS [0.4, 56.2]
  cua:dedicated-b1500 median 758.8 (n 20); vs cua:dedicated-s500 742.0: undetermined [-8.3, 55.5]
```

## The accept-cursor rule replayed
```
front-idle: drags by status-cursor count {"2":1,"3":199}; named cursors during holds 0; second status cursor within 5 ms of grab 3: 200/200
ded-idle: drags by status-cursor count {"2":3,"3":177}; named cursors during holds 55; second status cursor within 5 ms of grab 3: 180/180
front-load2: drags by status-cursor count {"2":8,"3":190,"4":2}; named cursors during holds 0; second status cursor within 5 ms of grab 3: 198/200
ded-load2: drags by status-cursor count {"2":8,"3":172}; named cursors during holds 78; second status cursor within 5 ms of grab 3: 180/180
front-pin-browser: drags by status-cursor count {"3":98,"4":2}; named cursors during holds 0; second status cursor within 5 ms of grab 3: 98/100
front-pin-renderer: drags by status-cursor count {"2":2,"3":97,"4":1}; named cursors during holds 0; second status cursor within 5 ms of grab 3: 99/100
ded-pin-browser: drags by status-cursor count {"2":5,"3":95}; named cursors during holds 20; second status cursor within 5 ms of grab 3: 99/100
front-pin-all: drags by status-cursor count {"2":2,"3":85,"4":13}; named cursors during holds 2; second status cursor within 5 ms of grab 3: 85/100
```
