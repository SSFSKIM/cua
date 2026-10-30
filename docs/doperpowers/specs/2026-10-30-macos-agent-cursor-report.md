# Execution record: a visible agent cursor on macOS (#235)

Spec: [2026-10-30-macos-agent-cursor-design.md](2026-10-30-macos-agent-cursor-design.md). Executed by cursor235#b93055dd through doperpowers:subagent-driven-execution.

## M1

### Step 1: the spike (from the executor's report)


Method. A throwaway Swift program (`/Users/new/.claude/jobs/b93055dd/tmp/spike/spike.swift`, built with
`swiftc -O`, outside the tree), run on the MacBook (macOS 26, built-in Liquid Retina XDR at 1512 × 982 pt,
ProMotion: the small window's display link counted 1302 frames in about 10.9 s, about 120 Hz):
- An accessory-policy process shows two non-activating panels: a 760 × 320 pt "pattern" window of its own (40 pt
  colour stripes and a black band, for the blur to act on) and, above it, a display-wide transparent `NSPanel`
  (`.nonactivatingPanel`, `ignoresMouseEvents`, clear, the spec's collection behaviour). Both sit at the floating
  level only for the spike, so the owner's windows could not come between them during captures.
- Rigs in the display-wide panel, each an 84 pt container view with a halo and a magenta arrow (a sibling view above
  the halo), moved only by a `CAKeyframeAnimation` of the container layer's `position` (paced, autoreversing,
  endless, `preferredFrameRateRange` 60–120), committed once:
  - candidate 1, `NSVisualEffectView` (`.behindWindow`, `.active`) with `maskImage` a soft circle (12 pt feather), in
    `.hudWindow` and `.underWindowBackground`;
  - candidate 2, a `CALayer` with `backgroundFilters = [CIGaussianBlur radius 17]` and a soft-circle mask, in a view
    with `layerUsesCoreImageFilters`;
  - for the latency comparison only, the vendor's way (fallback b): an 84 pt window holding the candidate 1 rig,
    moved by `setFrameOrigin` from a `CADisplayLink` on the main thread every frame.
- Following: screenshots of the pattern window's rectangle (`screencapture -R`) at rest and mid-glide, and a 1 s
  screen video (`screencapture -v`, recorded at 60 fps, 66 frames) analysed frame by frame: the arrow's centroid
  (magenta pixels) against the halo's centre (the run of pixels that differ from the bare pattern on a row through
  the halo).
- Main-thread latency: a background thread posts `DispatchQueue.main.sync {}` no-op blocks (standing in for
  `Keyboard.swift`'s key posts), 200 µs apart, 300 per block, in four configurations: off (the display-wide panel
  ordered in, nothing animating), A (candidate 1 gliding), B (candidate 2 gliding), and the small window moved by a
  display link; 12 rounds alternating the order, 3600 samples per configuration, 150 ms settling after each switch;
  two sittings. Bootstrap (2000 resamples) of the difference of medians. Process CPU per block from `getrusage`.

Candidate 1, `NSVisualEffectView` behind-window: **blurs, and the blur follows.**
- It is a real backdrop blur of the content below the panel (the stripes behind smear into gradients), with the
  soft mask edge honoured (a gradient over about 24 px = 12 pt).
- Mid-glide it stays centred on its arrow. In the video the arrow moves 23 px (11.7 pt) per recorded frame (about
  700 pt/s); the arrow-to-halo offset averages 6.10 px moving left (n 40, sd 2.75) and 6.61 px moving right (n 17,
  sd 2.53). A lag would flip sign with the direction; the 0.5 px difference is within noise and far under one
  frame, so the halo is composited in the same frame as the arrow. The constant 6 px is the arrow's centroid offset
  in my rig.
- The recorder caps at 60 fps, so 120 Hz for the animation itself is not directly measured; the animation runs in
  the render server with a 120 Hz preferred rate, on a 120 Hz display.
- Look: in the current dark appearance the materials darken the backdrop. With the effect view's appearance set to
  `.aqua`, `.hudWindow` and `.fullScreenUI` give a light frosted halo that keeps the colours behind it, which is the
  Design's "blurs and lightens"; `.popover`, `.menu` and `.toolTip` are near-opaque grey-white. The blur radius and
  saturation are the material's, not settable (the vendor's Fog uses radius 17).

Candidate 2, `CALayer.backgroundFilters`: **no blur.** Only the layer's own faint fill shows; the filter sees the
window's own (transparent) content, not the windows below. Rejected.

Main thread, two sittings (µs per `main.sync` round trip):

| configuration | median | p90 | p99 | process CPU (ms/s) | median diff vs off [95 % CI] |
|---|---|---|---|---|---|
| off (sitting 1 / 2) | 11.8 / 11.5 | 17.0 / 15.8 | 48.8 / 29.1 | 72.6 / 66.4 | – |
| A, candidate 1 gliding | 11.9 / 11.8 | 17.9 / 16.1 | 55.7 / 32.5 | 74.8 / 68.1 | +0.1 [+0.0, +0.3] / +0.3 [+0.1, +0.5] |
| B, candidate 2 gliding | 11.8 / 11.8 | 16.8 / 16.2 | 38.8 / 31.6 | 78.6 / 75.7 | −0.0 [−0.2, +0.1] / +0.4 [+0.2, +0.5] |
| small window, display link (fallback b) | 15.0 / 14.5 | 27.0 / 22.0 | 331.8 / 313.8 | 174.2 / 159.3 | +3.2 [+3.0, +3.5] / +3.0 [+2.8, +3.2] |

- A gliding Core Animation cursor adds 0.1–0.3 µs to a round trip of about 11.5 µs. It is the same with B, which
  animates without blurring, so it comes from an animation running at all, not from the blur. In the second sitting
  the interval excludes 0 by 0.1 µs, so read strictly the "interval includes 0" half of Acceptance 12's rule misses
  there; its upper end (0.5 µs) is three orders of magnitude under the rule's 1 ms floor, and 200 keys would add
  about 60 µs in all. The process's CPU rises by 1.7–2.2 ms/s: no per-frame work in the process.
- The display-link window adds 3 µs at the median, multiplies p99 by 7–11 (to 314–332 µs), and costs about
  95 ms/s of process CPU. It is the fallback to avoid, as the spec expected.
- WindowServer's own CPU for each configuration could not be told apart: its baseline on the owner's busy screen
  varied 1.08–1.66 s per 3.3 s, more than any difference.

**Verdict: promote the Rendering design as written**, with candidate 1, `NSVisualEffectView` (`.behindWindow`,
`.active`, `maskImage` a soft circle, appearance `.aqua`, material `.hudWindow` or `.fullScreenUI`, to be chosen by
look in the build) as the halo inside the display-wide panel, moved only by Core Animation. Neither fallback is
needed.

