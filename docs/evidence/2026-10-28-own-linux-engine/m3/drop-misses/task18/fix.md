# The short drop (40 px) against the release delay after the take

device-chrome-dnd, 4 blocks (12 samples a cell), the fixed engine (a769edcd) with `--drag-dnd-after-take-ms T`
(T = 0: the old behaviour; 350: the fix). Each line: effect landed / samples, and the request time.

```
T=nofix chrome_dnd_in_front_shared: 12/12 effect; ms median 498.27 (467.45-524.72)
T=nofix chrome_dnd_short_in_front_shared: 9/12 effect; ms median 159.72 (139.23-174.83)
T=nofix chrome_dnd_short_covered_dedicated: 6/12 effect; ms median 83.58 (66.36-140.74)
T=t25 chrome_dnd_short_in_front_shared: 9/12 effect; ms median 158.79 (138.59-174.61)
T=t25 chrome_dnd_short_covered_dedicated: 4/12 effect; ms median 82.28 (76.9-122.26)
T=t50 chrome_dnd_short_in_front_shared: 12/12 effect; ms median 174.81 (163.02-184.56)
T=t50 chrome_dnd_short_covered_dedicated: 10/12 effect; ms median 111.74 (105.92-135.68)
T=t75 chrome_dnd_short_in_front_shared: 12/12 effect; ms median 192.65 (184.49-198.77)
T=t75 chrome_dnd_short_covered_dedicated: 12/12 effect; ms median 126.95 (118.35-159.14)
T=t100 chrome_dnd_short_in_front_shared: 12/12 effect; ms median 217.3 (211.4-220.92)
T=t100 chrome_dnd_short_covered_dedicated: 12/12 effect; ms median 153.51 (142.84-163.69)
T=t150 chrome_dnd_short_in_front_shared: 12/12 effect; ms median 271.73 (262.03-274.71)
T=t150 chrome_dnd_short_covered_dedicated: 12/12 effect; ms median 204.99 (191.62-210.61)
T=t200 chrome_dnd_short_in_front_shared: 12/12 effect; ms median 316.91 (310.33-325.13)
T=t200 chrome_dnd_short_covered_dedicated: 12/12 effect; ms median 251.98 (243.25-260.35)
T=t250 chrome_dnd_short_in_front_shared: 12/12 effect; ms median 369.49 (362.94-376.11)
T=t250 chrome_dnd_short_covered_dedicated: 12/12 effect; ms median 300.19 (291.48-308.68)
T=t300 chrome_dnd_short_in_front_shared: 12/12 effect; ms median 415.13 (411.12-425.37)
T=t300 chrome_dnd_short_covered_dedicated: 12/12 effect; ms median 350.53 (341.12-361.34)
T=fix chrome_dnd_in_front_shared: 12/12 effect; ms median 511.4 (491.72-562.15)
T=fix chrome_dnd_short_in_front_shared: 12/12 effect; ms median 471.84 (462.92-476.59)
T=fix chrome_dnd_short_covered_dedicated: 12/12 effect; ms median 398.95 (394.08-414)
```

## The vendor builds and cua (the fix) on the same short drop, in front (dnd experiment, `--dnd-short`, 12 each)

```
vendor-short chrome visible pinned: dropped 11/12; ms min 261.8 med 279.8 max 311.5; misses' ms [261.8]
vendor-short chrome visible newest: dropped 12/12; ms min 252.9 med 258 max 270.5; misses' ms []
vendor-short chrome visible cua: dropped 12/12; ms min 459.4 med 469.3 max 475.5; misses' ms []
```

## Stalls in the full run on the fix (t18-verdict-fix), ms from the take

```

drags 99, stalled 38
stalled take→accept: [null,null,217,152,252,275,215,189,176,null,null,161,null,null,222,163,204,195,null,154,160,null,null,238,153,209,246,221,null,148,149,null,228,150,204,260,null,152]
stalled take→release: [3,1,369,200,557,556,351,350,350,1,1,229,0,3,378,281,350,352,1,235,202,4,1,388,207,475,351,351,1,204,243,2,384,291,351,357,2,312]
kept-up take→accept: [null,252,237,235,240,431,218,145,167,null,244,264,216,261,272,null,229,258,251,243,448,388,410,154,214,222,227,null,null,263,217,288,234,null,215,248,248,258,428,354,165,154,237,168,null,null,242,238,243,246,null,237,258,449,464,250,212,null,242,252,276]
```
