import CoreGraphics
import Foundation

// The agent cursor's motion (#235; docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, Design "Motion"):
// the vendor's, translated from SkyComputerUseService 26.924 (O11; vendor-cursor.md, cited as VC, its appendices giving
// each function's address). Pure and headless: the inputs are the start state, the target and the screen's visible frame
// in the cursor panel's coordinates (AppKit, y up, the arrow tip as the motion point); the output is a trajectory sampled
// at the integrator's fixed 1/240 s step, which the renderer installs as Core Animation keyframes, so nothing here runs per
// display frame. The vendor's points are its 126-pt window's origins; cua's are the tip itself (the spec's M1 step 0).

/// `MotionConfiguration.live` (once-init FUN_10008c128; VC §3), field by field.
struct MotionConfiguration: Sendable {
  var clickAngle = -44.0                         // degrees: the arrow's resting tilt
  var candidateCount = 20
  var boundsMargin = 20.0
  var startHandle = 0.41960295031576633          // the binary's Float, widened
  var endpointHandle = 0.15
  var arcSize = 0.2765523188064277
  var arcFlow = 0.5783555327868779
  var straightPathDistanceThreshold = 10.0
  var springResponseScaler = 0.9
  var springResponseMin = 0.12
  var springResponseMax = 2.2
  var springDampingFraction = 0.9
  var scootDistanceThreshold = 196.0
  var scootPositionResponse = 0.24
  var scootPositionDampingFraction = 0.84
  var scootPositionSettleVelocity = 12.0
  var scootAxisResponse = 0.07
  var scootAxisDampingFraction = 0.82
  var scootBaseRotationResponse = 0.09
  var scootBaseRotationDampingFraction = 0.86
  var scootStretchResponse = 0.095
  var scootStretchDampingFraction = 0.72
  var scootStretchMin = 0.0
  var scootStretchPivotX = 0.5
  var scootStretchXAmount = 0.38
  var scootSquashYAmount = 0.18
  var scootRotationResponse = 0.055
  var scootRotationDampingFraction = 0.76
  var scootRotationMax = 76.0
  var terminalTangentBlendStart = 0.99

  static let live = MotionConfiguration()

  /// The rest direction k = (sin θ, cos θ), up-left in y-up space; every candidate leaves and arrives along it
  /// (VC Appendix A §0, disasm 0x1000999a4).
  var restDirection: CGVector {
    let theta = clickAngle * .pi / 180
    return CGVector(dx: sin(theta), dy: cos(theta))
  }
}

/// The integrator's fixed step (VelocityVerletSimulation.Configuration.dt; VC Appendix B §1.2).
let cursorMotionStep = 1.0 / 240.0

/// One sample of the cursor: where the tip is and how the arrow and halo look there.
struct CursorState: Equatable, Sendable {
  var position: CGPoint
  /// The tip's velocity, pt/s: what a splice continues from.
  var velocity: CGVector = .zero
  /// The arrow's rotation from rest, radians, clockwise on screen (the vendor's `style.angle`, a SwiftUI rotation).
  var angle: CGFloat = 0
  /// The scoot's stretch along `axis` (scootStretchXScale) and squash across it (scootStretchScale).
  var stretch: CGFloat = 1
  var squash: CGFloat = 1
  /// The stretch axis, radians from +x (counter-clockwise, y up).
  var axis: CGFloat = 0
  /// The halo's speed swell, 1…2.5 (FUN_1001411c4).
  var swell: CGFloat = 1
  /// The swell's smoothed velocity and its rate: the SwiftUI spring the vendor animates `velocityX/Y` with (VC Appendix
  /// C §2, item 10), carried so a splice keeps the halo's swell continuous.
  var swellVelocity: CGVector = .zero
  var swellRate: CGVector = .zero

  static func rest(at point: CGPoint) -> CursorState { CursorState(position: point) }
}

enum Mode: Equatable, Sendable { case snap, scoot, path }

/// A motion sampled at `step`: `samples[0]` is the start, `samples[settleIndex]` the target at rest. `arrivalIndex` is
/// the vendor's "close enough" (progress ≥ 0.995 within 3.157 pt; VC §3), where a click's press dip plays (O5). Samples
/// past `settleIndex` hold the target while the halo's swell relaxes.
struct Trajectory: Sendable {
  let step: TimeInterval
  let samples: [CursorState]
  let mode: Mode
  /// The chosen candidate (path mode), its cost and the progress spring's response.
  let chosen: Int?
  let cost: Double?
  let response: Double?
  let arrivalIndex: Int
  let settleIndex: Int

  var duration: TimeInterval { Double(samples.count - 1) * step }
  var arrival: TimeInterval { Double(arrivalIndex) * step }
  var end: CGPoint { samples[samples.count - 1].position }

  /// The state at `elapsed` seconds from the start, interpolated between samples and held at both ends: position and
  /// velocity at a splice time (the spec's Design, "Retargeting").
  func state(at elapsed: TimeInterval) -> CursorState {
    let x = elapsed / step
    if !(x > 0) { return samples[0] }
    let lower = Int(x.rounded(.down))
    if lower >= samples.count - 1 { return samples[samples.count - 1] }
    let f = CGFloat(x - Double(lower))
    let a = samples[lower], b = samples[lower + 1]
    func mix(_ p: CGFloat, _ q: CGFloat) -> CGFloat { p + (q - p) * f }
    func mixVector(_ p: CGVector, _ q: CGVector) -> CGVector { CGVector(dx: mix(p.dx, q.dx), dy: mix(p.dy, q.dy)) }
    return CursorState(position: CGPoint(x: mix(a.position.x, b.position.x), y: mix(a.position.y, b.position.y)),
                       velocity: mixVector(a.velocity, b.velocity), angle: mix(a.angle, b.angle), stretch: mix(a.stretch, b.stretch),
                       squash: mix(a.squash, b.squash), axis: mix(a.axis, b.axis), swell: mix(a.swell, b.swell),
                       swellVelocity: mixVector(a.swellVelocity, b.swellVelocity), swellRate: mixVector(a.swellRate, b.swellRate))
  }

  /// This trajectory followed by `next`, which starts where this one ends.
  func followed(by next: Trajectory) -> Trajectory {
    Trajectory(step: step, samples: samples + next.samples.dropFirst(), mode: mode, chosen: chosen, cost: cost, response: response,
               arrivalIndex: arrivalIndex, settleIndex: samples.count - 1 + next.settleIndex)
  }
}

// MARK: The spring

/// The vendor's spring (OpenAI's Animation module, statically linked; VC Appendix B §1): velocity Verlet at a fixed step,
/// mass 1, k = (2π/response)² capped at 28800 (FUN_1007d6a78), drag = 2√k·ζ (FUN_1007d6c94). Two lanes; a scalar spring
/// leaves the second at zero, which changes none of its sums.
struct SpringSimulation {
  var x: SIMD2<Double>
  var target: SIMD2<Double>
  var velocity: SIMD2<Double>
  var force: SIMD2<Double> = .zero
  let stiffness: Double
  let drag: Double
  let idle: Double

  init(response: Double, damping: Double, idle: Double, from: SIMD2<Double>, to: SIMD2<Double>, velocity: SIMD2<Double> = .zero) {
    stiffness = min(response > 0 ? pow(2 * .pi / response, 2) : .infinity, 28_800)
    drag = 2 * stiffness.squareRoot() * damping
    self.idle = idle
    x = from
    target = to
    self.velocity = velocity
  }

  /// One step (FUN_1007d6e8c): the half-step velocity, the position, the force at the new position, the velocity.
  mutating func step(_ dt: Double) {
    let h = dt * 0.5
    let half = velocity + h * force
    x += dt * half
    force = stiffness * (target - x) - drag * half
    velocity = half + h * force
  }

  /// The settle test (FUN_1007d622c, resolved in M1 step 0; VC Appendix B §1.3): the velocity and the force within the
  /// idle threshold, and, when the target is not zero, the value within 1 % of the target's own magnitude.
  var settled: Bool {
    let tau2 = idle * idle
    if max((velocity * velocity).sum(), (force * force).sum()) > tau2 { return false }
    let scaled = target * 0.01
    let a = (scaled * scaled).sum()
    if !(a > 0) { return true }
    let d = target - x
    return !((d * d).sum() > a)
  }
}

/// The SwiftUI spring (mass 1, stiffness 130.5, damping 18.85) the vendor animates the press and the swell's velocity
/// with, integrated at the motion's step (semi-implicit Euler, as the look reference does).
private struct FollowSpring {
  static let stiffness = 130.5, damping = 18.85
  var x: Double
  var v: Double
  mutating func step(toward target: Double, _ dt: Double) {
    let a = Self.stiffness * (target - x) - Self.damping * v
    v += a * dt
    x += v * dt
  }
}

// MARK: Paths (VC Appendix A)

struct PathSegment: Equatable, Sendable {
  var control1: CGPoint
  var control2: CGPoint
  var end: CGPoint
}

/// `CursorMotionPath` (S.fields:577-596): cubic segments from `start`, each starting where the last ended.
struct CursorMotionPath: Equatable, Sendable {
  var start: CGPoint
  var end: CGPoint
  var arc: CGPoint?
  var rotatesAlongPath: Bool
  var segments: [PathSegment]
}

struct PathMeasurement: Equatable, Sendable {
  var length: Double
  var angleChangeEnergy: Double
  var maxAngleChange: Double
  var totalTurn: Double
  var staysInBounds: Bool
}

private func add(_ a: CGPoint, _ b: CGVector) -> CGPoint { CGPoint(x: a.x + b.dx, y: a.y + b.dy) }
private func scaled(_ v: CGVector, _ s: Double) -> CGVector { CGVector(dx: v.dx * s, dy: v.dy * s) }
private func difference(_ a: CGPoint, _ b: CGPoint) -> CGVector { CGVector(dx: a.x - b.x, dy: a.y - b.y) }
private func length(_ v: CGVector) -> Double { hypot(v.dx, v.dy) }
private func distance(_ a: CGPoint, _ b: CGPoint) -> Double { hypot(a.x - b.x, a.y - b.y) }
private func unit(_ v: CGVector, or fallback: CGVector) -> CGVector {
  let l = length(v)
  return l >= 0.001 ? scaled(v, 1 / l) : fallback
}
private func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { min(max(v, lo), hi) }
private func clamp01(_ v: Double) -> Double { clamp(v, 0, 1) }

/// A point on a cubic Bézier, in the term order the look reference evaluates it.
func bezierPoint(_ p0: CGPoint, _ c1: CGPoint, _ c2: CGPoint, _ p3: CGPoint, _ t: Double) -> CGPoint {
  let u = 1 - t
  return CGPoint(x: p0.x * u * u * u + c1.x * 3 * t * u * u + c2.x * 3 * t * t * u + p3.x * t * t * t,
                 y: p0.y * u * u * u + c1.y * 3 * t * u * u + c2.y * 3 * t * t * u + p3.y * t * t * t)
}

/// The straight path (FUN_1000942c4's short branch): one cubic with its controls at the thirds, never rotating the arrow.
func straightPath(from s: CGPoint, to e: CGPoint) -> CursorMotionPath {
  let d = difference(e, s)
  return CursorMotionPath(start: s, end: e, arc: nil, rotatesAlongPath: false,
                          segments: [PathSegment(control1: add(s, scaled(d, 1.0 / 3.0)), control2: add(s, scaled(d, 2.0 / 3.0)), end: e)])
}

/// The candidates (FUN_100099938; VC Appendix A §2): two base curves leaving and arriving along the rest direction, then
/// eighteen arcs, both sides of the travel line for three apex offsets and three flow lengths; `side` only orders them.
func enumerateCandidates(from s: CGPoint, to e: CGPoint, configuration c: MotionConfiguration = .live) -> [CursorMotionPath] {
  let k = c.restDirection
  let d = difference(e, s), dd = length(d)
  let dir = unit(d, or: CGVector(dx: 1, dy: 0))
  func handle(_ f: Double) -> Double { max(min(dd * f, dd * 0.9, 640), 48) }
  let hs = handle(c.startHandle), he = handle(c.endpointHandle)
  let sc = add(s, scaled(k, hs)), ec = add(e, scaled(k, -he))
  let sc65 = add(s, scaled(k, hs * 0.65)), ec65 = add(e, scaled(k, -he * 0.65))
  let side: Double = (k.dy * dir.dx - k.dx * dir.dy) >= 0 ? 1 : -1
  let n = CGVector(dx: -dir.dy * side, dy: dir.dx * side)
  let mid = CGPoint(x: (s.x + e.x) * 0.5, y: (s.y + e.y) * 0.5)
  let arcLength = min(max(dd * c.arcSize, 50), 520)
  let flowLength = min(max(dd * c.arcFlow, 38), 440)
  let bias = scaled(k, hs * 0.16)
  func base(_ c1: CGPoint, _ c2: CGPoint) -> CursorMotionPath {
    CursorMotionPath(start: s, end: e, arc: nil, rotatesAlongPath: true, segments: [PathSegment(control1: c1, control2: c2, end: e)])
  }
  func arced(_ apex: CGPoint, _ flow: CGVector) -> CursorMotionPath {
    CursorMotionPath(start: s, end: e, arc: apex, rotatesAlongPath: true,
                     segments: [PathSegment(control1: sc, control2: add(apex, scaled(flow, -1)), end: apex),
                                PathSegment(control1: add(apex, flow), control2: ec, end: e)])
  }
  var out = [base(sc, ec), base(sc65, ec65)]
  for ka in [0.55, 0.8, 1.05] {
    let offset = scaled(n, arcLength * ka)
    let apexA = add(add(mid, offset), bias), apexB = add(add(mid, scaled(offset, -1)), bias)
    for kf in [0.65, 1.0, 1.35] {
      let flow = scaled(dir, flowLength * kf)
      out.append(arced(apexA, flow))
      out.append(arced(apexB, flow))
    }
  }
  return Array(out.prefix(max(c.candidateCount, 0)))
}

/// A path measured from 24 samples per segment (FUN_100094d24; VC Appendix A §5), its in-bounds test on the arrow tip
/// against `bounds` inset by the margin, edges included.
func measure(_ p: CursorMotionPath, bounds: CGRect, configuration c: MotionConfiguration = .live) -> PathMeasurement {
  let x0 = bounds.minX + c.boundsMargin, y0 = bounds.minY + c.boundsMargin
  let x1 = bounds.minX + bounds.width - c.boundsMargin, y1 = bounds.minY + bounds.height - c.boundsMargin
  func inside(_ q: CGPoint) -> Bool { q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1 }
  var inBounds = inside(p.start)
  var total = 0.0, energy = 0.0, maxTurn = 0.0, turn = 0.0
  var previousHeading: Double?
  var p0 = p.start, previous = p.start
  for segment in p.segments {
    for i in 1...24 {
      let q = bezierPoint(p0, segment.control1, segment.control2, segment.end, Double(i) / 24)
      let step = distance(q, previous)
      if inBounds { inBounds = inside(q) }
      let d = difference(q, previous)
      if length(d) > 0.01 {
        let h = atan2(d.dy, d.dx)
        if let ph = previousHeading {
          var dh = h - ph
          while dh > .pi { dh -= 2 * .pi }
          while dh < -.pi { dh += 2 * .pi }
          energy += dh * dh
          maxTurn = max(maxTurn, abs(dh))
          turn += abs(dh)
        }
        previousHeading = h
      }
      total += step
      previous = q
    }
    p0 = segment.end
  }
  return PathMeasurement(length: total, angleChangeEnergy: energy, maxAngleChange: maxTurn, totalTurn: turn, staysInBounds: inBounds)
}

/// A candidate's cost (FUN_100094558; VC Appendix A §3).
func score(_ p: CursorMotionPath, bounds: CGRect, configuration c: MotionConfiguration = .live) -> (cost: Double, measurement: PathMeasurement) {
  let m = measure(p, bounds: bounds, configuration: c)
  let detour = max(m.length / max(distance(p.end, p.start), 1) - 1, 0)
  let dir = unit(difference(p.end, p.start), or: CGVector(dx: 1, dy: 0))
  let k = c.restDirection
  let back = (-0.08 - (k.dx * dir.dx + k.dy * dir.dy)) / 0.92
  let backPenalty = back >= 1 ? 90 : max(back, 0) * 90
  let cost = (p.arc != nil ? 45 : 0) + m.length + 320 * detour + 140 * m.angleChangeEnergy + 180 * m.maxAngleChange + 18 * m.totalTurn + backPenalty
  return (cost, m)
}

/// The cheapest candidate, among those that stay in bounds when any do; ties to the first (FUN_100094558).
func selectPath(_ candidates: [CursorMotionPath], bounds: CGRect, configuration c: MotionConfiguration = .live)
  -> (index: Int, cost: Double, measurement: PathMeasurement) {
  let scored = candidates.map { score($0, bounds: bounds, configuration: c) }
  let inBounds = scored.indices.filter { scored[$0].measurement.staysInBounds }
  let pool = inBounds.isEmpty ? Array(scored.indices) : inBounds
  var best = pool[0]
  for i in pool.dropFirst() where scored[i].cost < scored[best].cost { best = i }
  return (best, scored[best].cost, scored[best].measurement)
}

/// The progress spring's response (FUN_100095014; VC §3), 0.12…2.2 s.
func springResponse(_ p: CursorMotionPath, _ m: PathMeasurement, configuration c: MotionConfiguration = .live) -> Double {
  let k = c.restDirection
  let dir = unit(difference(p.end, p.start), or: CGVector(dx: 1, dy: 0))
  let longness = clamp01((m.length - 180) / 760)
  let detour = clamp01((m.length / max(distance(p.start, p.end), 1) - 1) / 0.55)
  let turn = clamp01(m.totalTurn / (1.4 * .pi))
  let energy = clamp01(m.angleChangeEnergy / 1.25)
  let back = clamp01((-0.08 - (dir.dx * k.dx + dir.dy * k.dy)) / 0.92)
  let combined = 0.42 * detour + 0.38 * turn + 0.2 * energy
  let arc = p.arc != nil
  return clamp((arc ? 0.9 : 1) * c.springResponseScaler * (0.42 + 0.22 * longness + 0.28 * back + 0.12 * clamp01(combined) + (arc ? 0.04 : 0)),
               c.springResponseMin, c.springResponseMax)
}

/// The point and tangent at progress `q` (FUN_1000914a4, FUN_10009a1ac): progress split equally across segments, `q ≥ 1`
/// clamped to the end, so the spring's overshoot never carries the tip past the target.
func pointAndTangent(_ p: CursorMotionPath, at q: Double) -> (point: CGPoint, tangent: CGVector) {
  let n = p.segments.count
  let i: Int, t: Double
  if q >= 1 {
    i = n - 1; t = 1
  } else {
    let x = max(q, 0) * Double(n)
    i = min(Int(x.rounded(.down)), n - 1); t = x - Double(i)
  }
  let s = p.segments[i]
  let p0 = i == 0 ? p.start : p.segments[i - 1].end
  let u = 1 - t
  let point = bezierPoint(p0, s.control1, s.control2, s.end, t)
  let tangent = CGVector(dx: (s.control1.x - p0.x) * 3 * u * u + (s.control2.x - s.control1.x) * 6 * u * t + (s.end.x - s.control2.x) * 3 * t * t,
                         dy: (s.control1.y - p0.y) * 3 * u * u + (s.control2.y - s.control1.y) * 6 * u * t + (s.end.y - s.control2.y) * 3 * t * t)
  return (point, tangent)
}

/// The direction the arrow faces at progress `q` (FUN_100094180): the tangent, eased back to the rest direction over the
/// last 1 % of progress (ease-out cubic).
func travelDirection(_ tangent: CGVector, progress q: Double, configuration c: MotionConfiguration = .live) -> CGVector {
  let k = c.restDirection
  let u = unit(tangent, or: k)
  let x = (clamp01(q) - c.terminalTangentBlendStart) / (1 - c.terminalTangentBlendStart)
  let s = x >= 1 ? 0 : 1 - max(x, 0)
  let w = 1 - s * s * s
  return unit(CGVector(dx: k.dx * w + u.dx * (1 - w), dy: k.dy * w + u.dy * (1 - w)), or: CGVector(dx: 1, dy: 0))
}

/// The heading (VC Appendix B §2.1, FUN_100095654): radians, clockwise, 0 when travelling along the rest direction.
func headingAngle(_ d: CGVector, configuration c: MotionConfiguration = .live) -> CGFloat {
  let u = unit(d, or: CGVector(dx: 1, dy: 0))
  return (atan2(-u.dy, u.dx) * 180 / .pi + 90 - c.clickAngle) * .pi / 180
}

/// The stretch axis of a scoot (FUN_10009556c), folded into (−90°, 90°].
func travelAxis(_ d: CGVector) -> Double {
  guard length(d) >= 0.001 else { return 0 }
  var a = atan2(d.dy, d.dx) * 180 / .pi
  while a <= -90 { a += 180 }
  while a > 90 { a -= 180 }
  return a
}

/// The shortest signed difference to `degrees` in (−180, 180].
func wrap180(_ degrees: Double) -> Double {
  var r = (degrees + 180).truncatingRemainder(dividingBy: 360)
  if r < 0 { r += 360 }
  r -= 180
  return r == -180 ? 180 : r
}

// MARK: Planning

/// The vendor's close-enough test (CloseEnoughConfiguration.default, inlined in FUN_100093c30 and FUN_10009367c).
private let closeEnoughProgress = 0.995, closeEnoughDistance = 3.157
/// The halo's swell (FUN_1001411c4): `s = clamp(|(vx + vy) / 2| / 3000)`, swell = (1 − s) + 2.5·s.
private let swellSpeed = 3000.0, swellMax = 2.5
/// The longest a halo is left relaxing after the tip has settled.
private let swellRelaxLimit = 240

/// The swell's follow springs, advanced one step toward the style velocity the vendor reports (pt/s).
private func advanceSwell(_ state: inout CursorState, toward styleVelocity: CGVector, dt: Double) {
  var x = FollowSpring(x: state.swellVelocity.dx, v: state.swellRate.dx)
  var y = FollowSpring(x: state.swellVelocity.dy, v: state.swellRate.dy)
  x.step(toward: styleVelocity.dx, dt)
  y.step(toward: styleVelocity.dy, dt)
  state.swellVelocity = CGVector(dx: x.x, dy: y.x)
  state.swellRate = CGVector(dx: x.v, dy: y.v)
  let s = clamp01(abs((x.x + y.x) / 2) / swellSpeed)
  state.swell = (1 - s) + swellMax * s
}

/// After the tip has settled, the halo's swell relaxes in place.
private func relaxingSwell(_ samples: inout [CursorState], dt: Double) {
  var state = samples[samples.count - 1]
  var steps = 0
  while steps < swellRelaxLimit && (state.swell > 1.0005 || hypot(state.swellRate.dx, state.swellRate.dy) > 1) {
    advanceSwell(&state, toward: .zero, dt: dt)
    samples.append(state)
    steps += 1
  }
  if steps > 0 {
    state.swell = 1; state.swellVelocity = .zero; state.swellRate = .zero
    samples[samples.count - 1] = state
  }
}

/// The vendor's motion from `from` to `to` (Window.move FUN_100090920 and FUN_100092ba4): a scoot for moves of at most
/// 196 pt, else a path chosen in `bounds` (the target screen's visible frame, in panel coordinates); under Reduce Motion
/// a straight 0.15 s ease-out with no squash, tilt or swell.
func plan(from: CursorState, to: CGPoint, bounds: CGRect, reduceMotion: Bool, configuration: MotionConfiguration = .live) -> Trajectory {
  if reduceMotion { return reducedTrajectory(from: from.position, to: to) }
  if distance(from.position, to) <= configuration.scootDistanceThreshold { return scoot(from: from, to: to, configuration: configuration) }
  let candidates = enumerateCandidates(from: from.position, to: to, configuration: configuration)
  let chosen = selectPath(candidates, bounds: bounds, configuration: configuration)
  return follow(candidates[chosen.index], measurement: chosen.measurement, from: from, mode: .path, chosen: chosen.index,
                cost: chosen.cost, bounds: bounds, configuration: configuration)
}

/// A straight path carried by the progress spring, the arrow not turning: a drag's trace from its start to its end.
func planStraight(from: CursorState, to: CGPoint, bounds: CGRect, reduceMotion: Bool, configuration: MotionConfiguration = .live) -> Trajectory {
  if reduceMotion { return reducedTrajectory(from: from.position, to: to) }
  let path = straightPath(from: from.position, to: to)
  return follow(path, measurement: measure(path, bounds: bounds, configuration: configuration), from: from, mode: .path, chosen: nil,
                cost: nil, bounds: bounds, configuration: configuration)
}

/// No motion: the cursor appears at `point` (a fade-in at the target, or the skip check of FUN_100091650).
func snapTrajectory(to point: CGPoint) -> Trajectory {
  Trajectory(step: cursorMotionStep, samples: [.rest(at: point)], mode: .snap, chosen: nil, cost: nil, response: nil, arrivalIndex: 0, settleIndex: 0)
}

/// Path mode (FUN_100093c30's tick, at every step): the progress spring from 0 to 1, the tip on the path, the arrow along
/// its travel, the style velocity `tangent · progress velocity · segments` feeding the swell.
private func follow(_ path: CursorMotionPath, measurement: PathMeasurement, from: CursorState, mode: Mode, chosen: Int?, cost: Double?,
                    bounds: CGRect, configuration c: MotionConfiguration) -> Trajectory {
  let response = springResponse(path, measurement, configuration: c)
  var spring = SpringSimulation(response: response, damping: c.springDampingFraction, idle: 0.01, from: SIMD2(0, 0), to: SIMD2(1, 0))
  let dt = cursorMotionStep
  var state = from
  state.velocity = .zero
  state.stretch = 1; state.squash = 1; state.axis = 0
  if path.rotatesAlongPath { state.angle = headingAngle(pointAndTangent(path, at: 0).tangent, configuration: c) }
  var samples = [state]
  var arrival: Int?
  let segments = Double(path.segments.count)
  while true {
    spring.step(dt)
    if spring.settled || samples.count > 240 * 30 { break }
    let q = spring.x.x
    let (point, tangent) = pointAndTangent(path, at: q)
    state.position = point
    if path.rotatesAlongPath { state.angle = headingAngle(travelDirection(tangent, progress: q, configuration: c), configuration: c) }
    let style = scaled(tangent, spring.velocity.x * segments)
    state.velocity = style
    advanceSwell(&state, toward: style, dt: dt)
    samples.append(state)
    if arrival == nil, q >= closeEnoughProgress, distance(point, path.end) <= closeEnoughDistance { arrival = samples.count - 1 }
  }
  state.position = path.end
  state.angle = 0
  state.velocity = .zero
  advanceSwell(&state, toward: .zero, dt: dt)
  samples.append(state)
  let settle = samples.count - 1
  relaxingSwell(&samples, dt: dt)
  return Trajectory(step: dt, samples: samples, mode: mode, chosen: chosen, cost: cost, response: response,
                    arrivalIndex: arrival ?? settle, settleIndex: settle)
}

/// Scoot mode (FUN_100092ba4's scoot branch, FUN_10009367c's tick, at every step): the point spring, and on its envelope
/// the stretch along the travel axis, the squash across it and the tilt toward the travel, each on its own spring; the
/// heading the arrow had springs back to rest. A splice keeps the tip's velocity.
private func scoot(from: CursorState, to: CGPoint, configuration c: MotionConfiguration) -> Trajectory {
  let dt = cursorMotionStep
  let start = from.position
  let d = unit(difference(to, start), or: c.restDirection)
  var position = SpringSimulation(response: c.scootPositionResponse, damping: c.scootPositionDampingFraction, idle: c.scootPositionSettleVelocity,
                                  from: SIMD2(start.x, start.y), to: SIMD2(to.x, to.y), velocity: SIMD2(from.velocity.dx, from.velocity.dy))
  let baseStart = wrap180(Double(from.angle) * 180 / .pi)
  var base = SpringSimulation(response: c.scootBaseRotationResponse, damping: c.scootBaseRotationDampingFraction, idle: 0.01,
                              from: SIMD2(baseStart, 0), to: SIMD2(0, 0))
  let axisStart = Double(from.axis) * 180 / .pi
  let axisTarget = axisStart + wrap180(travelAxis(d) - axisStart)
  var axis = SpringSimulation(response: c.scootAxisResponse, damping: c.scootAxisDampingFraction, idle: 0.01,
                              from: SIMD2(axisStart, 0), to: SIMD2(axisTarget, 0))
  var squash = SpringSimulation(response: c.scootStretchResponse, damping: c.scootStretchDampingFraction, idle: 0.01,
                                from: SIMD2(Double(from.squash), 0), to: SIMD2(1, 0))
  var tilt = SpringSimulation(response: c.scootRotationResponse, damping: c.scootRotationDampingFraction, idle: 0.01,
                              from: SIMD2(0, 0), to: SIMD2(0, 0))
  let segment = difference(to, start)
  let segmentSquared = segment.dx * segment.dx + segment.dy * segment.dy
  let tiltDirection = clamp(0.75 * d.dx + 0.62 * d.dy, -1, 1)
  var state = from
  var samples = [state]
  var arrival: Int?
  while true {
    position.step(dt)
    if position.settled || samples.count > 240 * 30 { break }
    let p = CGPoint(x: position.x.x, y: position.x.y)
    let t = segmentSquared < 0.001 ? 1 : clamp01(((p.x - start.x) * segment.dx + (p.y - start.y) * segment.dy) / segmentSquared)
    let e = clamp01(min(t / 0.22, 1) * pow(max(1 - t, 0), 0.62))
    squash.target = SIMD2(1 - c.scootSquashYAmount * e * (1 - c.scootStretchMin), 0)
    tilt.target = SIMD2(e * tiltDirection * c.scootRotationMax, 0)
    base.step(dt); axis.step(dt); squash.step(dt); tilt.step(dt)
    state.position = p
    state.velocity = CGVector(dx: position.velocity.x, dy: position.velocity.y)
    state.angle = CGFloat((base.x.x + tilt.x.x) * .pi / 180)
    state.axis = CGFloat(axis.x.x * .pi / 180)
    state.squash = CGFloat(clamp(squash.x.x, c.scootStretchMin, 1))
    state.stretch = CGFloat(1 + c.scootStretchXAmount * e)
    advanceSwell(&state, toward: .zero, dt: dt)  // the vendor's scoot reports no velocity to the style
    samples.append(state)
    if arrival == nil, t >= closeEnoughProgress, distance(p, to) <= closeEnoughDistance { arrival = samples.count - 1 }
  }
  // resetScootEffects (FUN_1000964ec): the effects stopped, offsets 0, scales 1.
  state.position = to
  state.velocity = .zero
  state.angle = 0; state.stretch = 1; state.squash = 1; state.axis = 0
  advanceSwell(&state, toward: .zero, dt: dt)
  samples.append(state)
  let settle = samples.count - 1
  relaxingSwell(&samples, dt: dt)
  return Trajectory(step: dt, samples: samples, mode: .scoot, chosen: nil, cost: nil, response: nil, arrivalIndex: arrival ?? settle, settleIndex: settle)
}

/// Reduce Motion: a straight 0.15 s ease-out (Core Animation's easeOut, cubic-bezier(0, 0, 0.58, 1)), no flourish.
private func reducedTrajectory(from: CGPoint, to: CGPoint) -> Trajectory {
  let steps = Int((0.15 / cursorMotionStep).rounded())
  var samples: [CursorState] = []
  var previous = from
  for i in 0...steps {
    let f = easeOut(Double(i) / Double(steps))
    let p = i == steps ? to : CGPoint(x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f)
    let v = i == 0 || i == steps ? CGVector.zero : CGVector(dx: (p.x - previous.x) / cursorMotionStep, dy: (p.y - previous.y) / cursorMotionStep)
    samples.append(CursorState(position: p, velocity: v))
    previous = p
  }
  return Trajectory(step: cursorMotionStep, samples: samples, mode: .snap, chosen: nil, cost: nil, response: nil, arrivalIndex: steps, settleIndex: steps)
}

/// cubic-bezier(0, 0, 0.58, 1) at `x`, solved by bisection.
func easeOut(_ x: Double) -> Double {
  if x <= 0 { return 0 }
  if x >= 1 { return 1 }
  let (x1, y1, x2, y2) = (0.0, 0.0, 0.58, 1.0)
  func bezier(_ t: Double, _ a: Double, _ b: Double) -> Double {
    let u = 1 - t
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
  }
  var lo = 0.0, hi = 1.0, t = x
  for _ in 0..<40 {
    let v = bezier(t, x1, x2)
    if abs(v - x) < 1e-9 { break }
    if v < x { lo = t } else { hi = t }
    t = (lo + hi) / 2
  }
  return bezier(t, y1, y2)
}
