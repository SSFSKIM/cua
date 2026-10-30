#!/usr/bin/env node
// The agent cursor's motion reference (#235, M1 step 0): prints the vectors the Swift motion module's tests compare
// against (vectors.json beside this file is its committed output).
//
//   node native/engine/Tests/EngineTests/Fixtures/cursor-reference/reference.mjs > \
//     native/engine/Tests/EngineTests/Fixtures/cursor-reference/vectors.json
//
// Provenance. The motion code below is extracted from the look reference
// (docs/doperpowers/research/2026-10-30-macos-agent-cursor/look-mockup.html, its <script>), a JavaScript implementation
// of the vendor's documented algorithm written separately from the Swift translation. It is copied as it stands there,
// apart from the edits marked "reference edit", which normalise it to the spec's contract
// (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, Design "Motion" and M1 step 0):
//   1. The in-bounds test takes the arrow tip itself. The mock adds the vendor's 126-pt window-origin offset (−63, 63)
//      first, because the vendor tests its small window's origin; cua's panel spans the display and the tip is the
//      motion point.
//   2. A spring is settled by the vendor's own rule, FUN_1007d622c (resolved from the decompile; vendor-cursor.md,
//      Appendix B §1.3): max(|v|², |F|²) ≤ τ², and, when |0.01·target|² > 0, |target − x|² ≤ |0.01·target|². The mock
//      used |v| ≤ τ and |x − target| ≤ 0.01.
//   3. The settle time is counted in 1/240 s sub-steps with the rule checked after every sub-step, so it does not
//      depend on a display's frame rate (the vendor checks once per display frame, after that frame's sub-steps).
//
// Coordinates. The vectors are in the Swift module's space: the cursor panel's AppKit coordinates (y up, origin at the
// panel's bottom-left), points being the arrow tip. The mock works in a y-down space with its rest direction
// mirrored; the wrapper at the bottom mirrors each case into it (y ↦ H − y, an exact isometry for these integer
// inputs) and mirrors the chosen path's points back. The scoot spring's settle is simulated in the y-up space itself,
// since the rule's displacement term depends on where the origin is.

// ---------------------------------------------------------------- vectors (look-mockup.html)
const V = (x, y) => ({ x, y });
const add = (a, b) => V(a.x + b.x, a.y + b.y);
const sub = (a, b) => V(a.x - b.x, a.y - b.y);
const mul = (a, s) => V(a.x * s, a.y * s);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const clamp01 = (v) => clamp(v, 0, 1);
const unitOr = (a, fallback) => { const l = len(a); return l >= 0.001 ? mul(a, 1 / l) : fallback; };

// ---------------------------------------------------------------- vendor constants (MotionConfiguration.live)
const CFG = Object.freeze({
  clickAngle: -44,
  candidateCount: 20,
  boundsMargin: 20,
  startHandle: 0.41960295031576633,
  endpointHandle: 0.15,
  arcSize: 0.2765523188064277,
  arcFlow: 0.5783555327868779,
  straightPathDistanceThreshold: 10,
  springResponseScaler: 0.9,
  springResponseMin: 0.12,
  springResponseMax: 2.2,
  springDampingFraction: 0.9,
  scootDistanceThreshold: 196,
  scootPositionResponse: 0.24,
  scootPositionDampingFraction: 0.84,
  scootPositionSettleVelocity: 12,
  scootAxisResponse: 0.07,
  scootAxisDampingFraction: 0.82,
  scootBaseRotationResponse: 0.09,
  scootBaseRotationDampingFraction: 0.86,
  scootStretchResponse: 0.095,
  scootStretchDampingFraction: 0.72,
  scootStretchMin: 0,
  scootStretchPivotX: 0.5,
  scootStretchXAmount: 0.38,
  scootSquashYAmount: 0.18,
  scootRotationResponse: 0.055,
  scootRotationDampingFraction: 0.76,
  scootRotationMax: 76,
  terminalTangentBlendStart: 0.99,
});
const DEG = Math.PI / 180;
// Screen space here is y-down. The rest direction k = (sin θ, cos θ) in AppKit's y-up becomes (sin θ, −cos θ): up-left.
const K = V(Math.sin(CFG.clickAngle * DEG), -Math.cos(CFG.clickAngle * DEG));
const DT = 1 / 240;                       // velocity-Verlet step

// ---------------------------------------------------------------- springs (OpenAI Animation module, Appendix B §1)
class Spring {
  constructor(o) {
    this.dim = typeof o.from === 'number' ? 1 : 2;
    this.x = this.dim === 1 ? [o.from] : [o.from.x, o.from.y];
    this.t = this.dim === 1 ? [o.to] : [o.to.x, o.to.y];
    this.v = this.x.map(() => 0);
    this.F = this.x.map(() => 0);
    this.k = Math.min(o.response > 0 ? Math.pow(2 * Math.PI / o.response, 2) : Infinity, 28800);
    this.c = 2 * Math.sqrt(this.k) * o.damping;
    this.idle = o.idle ?? 0.06;
    this.time = o.now;
    this.ended = false;
  }
  step() {
    const h = DT * 0.5;
    for (let i = 0; i < this.dim; i++) {
      const vHalf = this.v[i] + h * this.F[i];
      this.x[i] += DT * vHalf;
      this.F[i] = this.k * (this.t[i] - this.x[i]) - this.c * vHalf;
      this.v[i] = vHalf + h * this.F[i];
    }
  }
  // reference edit 2: the vendor's settle test, FUN_1007d622c (SkyComputerUseService 26.924).
  settled() {
    let v2 = 0, f2 = 0, d2 = 0, a = 0;
    for (let i = 0; i < this.dim; i++) {
      v2 += this.v[i] * this.v[i];
      f2 += this.F[i] * this.F[i];
      d2 += (this.t[i] - this.x[i]) ** 2;
      a += (this.t[i] * 0.01) ** 2;
    }
    if (Math.max(v2, f2) > this.idle * this.idle) return false;
    return a > 0 ? !(d2 > a) : true;
  }
}

// reference edit 3: the number of 1/240 s sub-steps until the spring is settled, checked after every sub-step.
function settleSteps(spring) {
  for (let n = 1; n <= 240 * 60; n++) {
    spring.step();
    if (spring.settled()) return n;
  }
  throw new Error('spring did not settle within 60 s');
}

// ---------------------------------------------------------------- path generation and selection (Appendix A)
function bez(p0, c1, c2, p3, t) {
  const u = 1 - t;
  return V(p0.x * u * u * u + c1.x * 3 * t * u * u + c2.x * 3 * t * t * u + p3.x * t * t * t,
           p0.y * u * u * u + c1.y * 3 * t * u * u + c2.y * 3 * t * t * u + p3.y * t * t * t);
}
function straightPath(s, e) {
  const c1 = add(s, mul(sub(e, s), 1 / 3)), c2 = add(s, mul(sub(e, s), 2 / 3));
  return { start: s, end: e, arc: null, rotates: false, segments: [{ end: e, c1, c2 }] };
}
function enumerateCandidates(s, e) {
  const d = sub(e, s), dd = len(d);
  const dir = unitOr(d, V(1, 0));
  const handle = (f) => Math.max(Math.min(dd * f, dd * 0.9, 640), 48);
  const hs = handle(CFG.startHandle), he = handle(CFG.endpointHandle);
  const sc = add(s, mul(K, hs)), ec = sub(e, mul(K, he));
  const sc65 = add(s, mul(K, hs * 0.65)), ec65 = sub(e, mul(K, he * 0.65));
  // `side` is decided in the vendor's y-up space (it only sets the order, i.e. the tie-break).
  const crossUp = -(K.y * dir.x - K.x * dir.y);
  const side = crossUp >= 0 ? 1 : -1;
  const n = V(dir.y * side, -dir.x * side);
  const mid = mul(add(s, e), 0.5);
  const arcLen = Math.min(Math.max(dd * CFG.arcSize, 50), 520);
  const flowLen = Math.min(Math.max(dd * CFG.arcFlow, 38), 440);
  const bias = mul(K, hs * 0.16);
  const base = (c1, c2) => ({ start: s, end: e, arc: null, rotates: true, segments: [{ end: e, c1, c2 }] });
  const arced = (apex, flow) => ({
    start: s, end: e, arc: apex, rotates: true,
    segments: [{ end: apex, c1: sc, c2: sub(apex, flow) }, { end: e, c1: add(apex, flow), c2: ec }],
  });
  const out = [base(sc, ec), base(sc65, ec65)];
  for (const ka of [0.55, 0.8, 1.05]) {
    const off = mul(n, arcLen * ka);
    const apexA = add(add(mid, off), bias), apexB = add(sub(mid, off), bias);
    for (const kf of [0.65, 1.0, 1.35]) {
      const flow = mul(dir, flowLen * kf);
      out.push(arced(apexA, flow));
      out.push(arced(apexB, flow));
    }
  }
  return out.slice(0, CFG.candidateCount);
}
// reference edit 1: `origin` is the offset added to a point before the in-bounds test. The reference passes (0, 0),
// the tip itself; the mock always added ORIGIN = (−63, 63). The wrapper passes ORIGIN only to show which cases the
// normalisation changes (`chosenWithWindowOriginOffset`).
function measure(p, b, origin) {
  const m = CFG.boundsMargin;
  const x0 = b.x + m, y0 = b.y + m, x1 = b.x + b.w - m, y1 = b.y + b.h - m;
  const inside = (q) => { const o = add(q, origin); return o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1; };
  let inBounds = inside(p.start);
  let length = 0, energy = 0, maxTurn = 0, total = 0, prevH = null, p0 = p.start, prev = p.start;
  for (const seg of p.segments) {
    for (let i = 1; i <= 24; i++) {
      const q = bez(p0, seg.c1, seg.c2, seg.end, i / 24);
      const step = dist(q, prev);
      if (inBounds) inBounds = inside(q);
      const d = sub(q, prev);
      if (len(d) > 0.01) {
        const h = Math.atan2(d.y, d.x);
        if (prevH !== null) {
          let dh = h - prevH;
          while (dh > Math.PI) dh -= 2 * Math.PI;
          while (dh < -Math.PI) dh += 2 * Math.PI;
          energy += dh * dh; maxTurn = Math.max(maxTurn, Math.abs(dh)); total += Math.abs(dh);
        }
        prevH = h;
      }
      length += step;
      prev = q;
    }
    p0 = seg.end;
  }
  return { length, energy, maxTurn, total, inBounds };
}
function selectPath(cands, bounds, origin) {
  const scored = cands.map((c, i) => {
    const m = measure(c, bounds, origin);
    const detour = Math.max(m.length / Math.max(dist(c.end, c.start), 1) - 1, 0);
    const dir = unitOr(sub(c.end, c.start), V(1, 0));
    const back = (-0.08 - dot(K, dir)) / 0.92;
    const backPen = back >= 1 ? 90 : Math.max(back, 0) * 90;
    const cost = (c.arc ? 45 : 0) + m.length + 320 * detour + 140 * m.energy + 180 * m.maxTurn + 18 * m.total + backPen;
    return { i, path: c, m, cost };
  });
  const inB = scored.filter((x) => x.m.inBounds);
  const pool = inB.length ? inB : scored;
  let best = pool[0];
  for (const x of pool.slice(1)) if (x.cost < best.cost) best = x;
  return { path: best.path, m: best.m, index: best.i, scored, anyInBounds: inB.length > 0 };
}
function springResponse(p, m) {
  const D = clamp01((m.length - 180) / 760);
  const detour = clamp01((m.length / Math.max(dist(p.start, p.end), 1) - 1) / 0.55);
  const turn = clamp01(m.total / (1.4 * Math.PI));
  const energy = clamp01(m.energy / 1.25);
  const back = clamp01((-0.08 - dot(unitOr(sub(p.end, p.start), V(1, 0)), K)) / 0.92);
  const c = 0.42 * detour + 0.38 * turn + 0.2 * energy;
  const arc = !!p.arc;
  return clamp((arc ? 0.9 : 1) * CFG.springResponseScaler * (0.42 + 0.22 * D + 0.28 * back + 0.12 * clamp01(c) + (arc ? 0.04 : 0)),
    CFG.springResponseMin, CFG.springResponseMax);
}

// ---------------------------------------------------------------- the reference's own wrapper
// The mock's straight path applies only at or under 10 pt, which is always a scoot; the path mode never reaches it.
void straightPath;

const MOCK_WINDOW_ORIGIN = V(-63, 63);    // the mock's ORIGIN, y-down
const TIP = V(0, 0);

// Each case: a name, the panel's full frame height (for the mirror), the in-bounds frame (the screen's visible frame
// in panel coordinates, y up; the test insets it by boundsMargin), and the move's start and end tips.
const SCREEN = { panelHeight: 900, bounds: { x: 0, y: 0, w: 1440, h: 870 } };   // a 1440 × 900 panel, 30-pt menu bar
const SMALL = { panelHeight: 800, bounds: { x: 0, y: 0, w: 1200, h: 800 } };
const CASES = [
  { name: 'scoot, short', ...SCREEN, from: V(400, 300), to: V(500, 360) },
  { name: 'scoot, tiny', ...SCREEN, from: V(700, 400), to: V(703, 404) },
  { name: 'scoot, at the threshold (196 pt)', ...SCREEN, from: V(300, 300), to: V(496, 300) },
  { name: 'path, just over the threshold (197 pt)', ...SCREEN, from: V(300, 300), to: V(497, 300) },
  { name: 'path, long, up-right', ...SCREEN, from: V(200, 150), to: V(1200, 700) },
  { name: 'path, long, up-left (along the rest direction)', ...SCREEN, from: V(1100, 200), to: V(400, 750) },
  { name: 'path, backward (down-right, against the rest direction)', ...SCREEN, from: V(300, 750), to: V(1100, 150) },
  { name: 'path, leftward', ...SCREEN, from: V(900, 450), to: V(500, 450) },
  { name: 'path, straight down', ...SCREEN, from: V(720, 800), to: V(720, 100) },
  { name: 'path, along the right edge', ...SCREEN, from: V(1420, 100), to: V(1425, 800) },
  { name: 'path, along the bottom edge from the corner', ...SCREEN, from: V(25, 25), to: V(600, 40) },
  // Near the bottom-left corner the in-bounds test decides: the cheapest candidates overall (15, 17) leave the frame.
  { name: 'path, near the corner, the bounds test picks an arc', ...SCREEN, from: V(40, 180), to: V(220, 40) },
  { name: 'path, near the bottom edge, the bounds test picks a base curve', ...SCREEN, from: V(40, 110), to: V(310, 40) },
  { name: 'path, into the menu bar', ...SCREEN, from: V(700, 400), to: V(900, 890) },
  { name: 'path, along the menu bar', ...SCREEN, from: V(100, 885), to: V(1300, 885) },
  // The spec's (30, 30) → (100, 240) in a 1200 × 800 frame, given in the mock's y-down space: near the top-left corner,
  // moving down. In y-up it is (30, 770) → (100, 560). Every candidate fails the window-origin test there, so the offset
  // changes the choice; the same numbers read as y-up would not tell the two apart.
  { name: 'path, tip versus window origin (the normalisation case)', ...SMALL, from: V(30, 770), to: V(100, 560) },
];

const mirror = (H) => (q) => V(q.x, H - q.y);
const mirrorRect = (H, b) => ({ x: b.x, y: H - b.y - b.h, w: b.w, h: b.h });

function vectorsFor(c) {
  const toMock = mirror(c.panelHeight), fromMock = toMock;
  const distance = dist(c.from, c.to);
  const base = { name: c.name, panelHeight: c.panelHeight, bounds: c.bounds, from: c.from, to: c.to, distance };
  if (distance <= CFG.scootDistanceThreshold) {
    // The scoot's position spring, simulated in the panel's own y-up space.
    const spring = new Spring({ response: CFG.scootPositionResponse, damping: CFG.scootPositionDampingFraction,
      idle: CFG.scootPositionSettleVelocity, from: c.from, to: c.to, now: 0 });
    const steps = settleSteps(spring);
    return { ...base, mode: 'scoot', settleSteps: steps, settleTime: steps * DT };
  }
  const s = toMock(c.from), e = toMock(c.to), b = mirrorRect(c.panelHeight, c.bounds);
  const cands = enumerateCandidates(s, e);
  const sel = selectPath(cands, b, TIP);
  const response = springResponse(sel.path, sel.m);
  const spring = new Spring({ response, damping: CFG.springDampingFraction, idle: 0.01, from: 0, to: 1, now: 0 });
  const steps = settleSteps(spring);
  const withOffset = selectPath(cands, b, MOCK_WINDOW_ORIGIN).index;
  const point = (q) => { const r = fromMock(q); return [r.x, r.y]; };
  return {
    ...base,
    mode: 'path',
    chosen: sel.index,
    arc: !!sel.path.arc,
    cost: sel.scored[sel.index].cost,
    response,
    settleSteps: steps,
    settleTime: steps * DT,
    anyInBounds: sel.anyInBounds,
    chosenWithWindowOriginOffset: withOffset,
    measurement: { length: sel.m.length, angleChangeEnergy: sel.m.energy, maxAngleChange: sel.m.maxTurn,
      totalTurn: sel.m.total },
    segments: sel.path.segments.map((g) => ({ control1: point(g.c1), control2: point(g.c2), end: point(g.end) })),
    candidates: sel.scored.map((x) => ({ cost: x.cost, inBounds: x.m.inBounds })),
  };
}

const vectors = CASES.map(vectorsFor);
const normalisation = vectors.find((v) => v.name.startsWith('path, tip versus window origin'));
if (normalisation.chosen === normalisation.chosenWithWindowOriginOffset) {
  throw new Error('the normalisation case no longer tells the tip test from the window-origin test');
}
process.stdout.write(JSON.stringify({
  source: 'native/engine/Tests/EngineTests/Fixtures/cursor-reference/reference.mjs',
  coordinates: 'cursor panel, AppKit y-up, points are the arrow tip',
  step: DT,
  settleRule: 'FUN_1007d622c: max(|v|^2, |F|^2) <= idle^2 and (|0.01 target|^2 > 0 ? |target - x|^2 <= |0.01 target|^2 : true), checked after every 1/240 s sub-step',
  cases: vectors,
}, null, 2) + '\n');
