# #200 final check: the shipping build (2026-11-01, MacBook, 05:06–05:14Z)

cua's engine at bf458b9d, build 07724139591e (the delivery guard, the after-action watch and the kit's fixes), with the
owner hands-off and Chrome and cmux hidden. The judge's table is [item-200.md](item-200.md).

- **f on cua: PASS.** 20/20 delivered, 19 raises, all restored inside the screen hold. 0 late, 0 unguarded, 0 left,
  0 flashes, 0 capped. Post → raise 8.6 / 13.3 / 33.6 / 33.6 ms (min / median / p95 / max); post → release 60–67 ms.
- **a on cua: PASS.** 40/40 delivered, 39 raises, all restored inside the hold, with none late, unguarded, left,
  flashed or capped. Post → raise 8.7 / 17.7 / 29.3 / 39.0 ms; post → release 60–67 ms.
- **f on the vendor (recorded):** 20/20 delivered, 20 raises, every one unguarded, so on the display.

**The first observation of a fresh Electron app.** f's first cua attempt stopped at its first step. On a freshly
launched fixture, which reported its accessibility off at start, the engine's first observation did not contain the
button. The design session asked for a diagnostic, and it ran as a temporary kit change, reverted after the run
([diag-kit.diff](diag-kit.diff)). That run made three cua observations on another fresh fixture, then f's clicks:

| observation | after the launch | took | the fixture's text | the button |
|---|---|---|---|---|
| cua, first | ~6.5 s | 1238 ms | 14 lines, 326 chars | not found |
| cua, +2 s | ~8.8 s | 198 ms | 27 lines, 805 chars | index 13 |
| cua, +5 s | ~12 s | 122 ms | 27 lines, 805 chars | index 13 |
| vendor, first (its own fresh fixture) | ~4.4 s | 66 ms | – | index 13 |

The failed attempt read the same way: ~6 s after the launch, 1220 ms, no button. So cua's engine does get the tree,
but its first read on a fresh Chromium app comes before the tree is filled in, while the vendor's first read already
has it. This is outside #200, and the follow-up is the design session's call.

Quiet checks: [quiet-cua.txt](quiet-cua.txt) (before f), [quiet-cua-a.txt](quiet-cua-a.txt) (before a). Chrome for
Testing's scene took four cycles to record its real window (the #239 race). Afterwards, the saved engine
dd7a09235885 was restored and approved, with all three grants and 0 other connections, and Chrome and cmux were shown
again.
