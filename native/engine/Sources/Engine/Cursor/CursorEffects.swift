import Foundation
import QuartzCore

// The cursor's timed layer effects (the spec's Design, "What the person sees" and "Motion", the press dip): the press dip
// and the thinking rock, kept apart from the panel so they can be checked on plain layers, headless. Every host time is
// CACurrentMediaTime's.

/// The frame rate the cursor's animations ask for (#235's Decision Log, 2026-10-31: the 60 Hz cap is the default).
enum CursorFrameRate {
  /// 30–60 Hz, preferring 60, on every animation of the cursor's layers: measured on the MacBook's 120 Hz ProMotion
  /// display (macOS 26.6.2), WindowServer then composites a glide at about 60 frames a second where the uncapped glide
  /// composites about 120, as long as nothing else on the display asks for more (the rate is the display's: any 120 Hz
  /// animation on it takes the glide to 120 again) and no capped animation holds a value from one frame to the next
  /// (`changingRuns`; #235's task-8 report). It draws the uncapped poses (CursorFrameCapPoseTests).
  static let capped = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)

  /// The range every animation of the cursor's layers asks for under `arm`: the cap, or nil for each animation's own
  /// under `uncapped`.
  static func range(for arm: CursorDebug?) -> CAFrameRateRange? {
    arm == .uncapped ? nil : capped
  }
}

/// The runs of `values`, a keyframe animation's evenly spaced values, over which they change: each a range of indices
/// whose every step to the next value changes it, the runs parted by the holds between them (one equal step or more).
/// Empty when no value differs from the next. Under a capped frame rate an animation runs as one keyframe animation per
/// run, because while any capped animation holds its value WindowServer composites at the display's full rate
/// (measured on the MacBook, macOS 26.6.2: a glide's settled tail took the capped 60 Hz back to 120), and a glide's
/// position and heading hold after the tip settles, a heading all along a straight path, a drag's position between its
/// glide's settle and its trace. An animation waiting to begin or ended, filling the hold, costs no frames (measured
/// likewise).
func changingRuns(_ values: [NSValue]) -> [ClosedRange<Int>] {
  var runs: [ClosedRange<Int>] = []
  var start: Int?
  for i in values.indices.dropLast() {
    if values[i].isEqual(values[i + 1]) {
      if let from = start { runs.append(from...i); start = nil }
    } else if start == nil {
      start = i
    }
  }
  if let from = start { runs.append(from...(values.count - 1)) }
  return runs
}

/// A motion's keyframe animations on one of the cursor's layers (the spec's Rendering: the trajectory installed as
/// keyframes, played by the render server).
enum CursorKeyframes {
  /// The uncapped glide's range: up to the display's 120 Hz on ProMotion.
  static let uncappedFrameRate = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)

  /// `values`, one every `step` from `begin` (the layer's time), as keyframe animations. With no `frameRate` (the
  /// `uncapped` arm), one animation over them all, as the cursor drew before the cap. With one (the default), one animation per changing run
  /// (changingRuns), each at its run's own begin and length, so no time moves. Core Animation applies a layer's
  /// animations in the order of their begin times, the latest winning (measured, macOS 26.6.2), so a run that has not
  /// begun must not fill backwards over an earlier one: the first run fills backwards (the leading hold) and forwards,
  /// every later one forwards only, and each stays on the layer once it ends, so every hold shows the run before it
  /// and the trailing hold the last. A finished, forwards-filled animation costs the window server no frames (measured
  /// likewise); the next motion's install removes them. Nothing, when the values never change.
  static func animations(_ keyPath: String, _ values: [NSValue], step: TimeInterval, begin: CFTimeInterval,
                         frameRate: CAFrameRateRange?) -> [CAKeyframeAnimation] {
    guard values.count > 1 else { return [] }
    let runs = frameRate == nil ? [0...(values.count - 1)] : changingRuns(values)
    return runs.enumerated().map { i, run in
      let animation = CAKeyframeAnimation(keyPath: keyPath)
      animation.values = Array(values[run])
      animation.duration = Double(run.count - 1) * step
      animation.calculationMode = .linear
      animation.beginTime = begin + Double(run.lowerBound) * step
      animation.preferredFrameRateRange = frameRate ?? uncappedFrameRate
      if frameRate == nil {
        animation.fillMode = .backwards
      } else {
        animation.fillMode = i == 0 ? .both : .forwards
        animation.isRemovedOnCompletion = false
      }
      return animation
    }
  }

  /// `animations` on `layer` under `key` (the first) and `key#1`, `key#2`…, after removing every earlier one of `key`'s.
  static func install(_ animations: [CAKeyframeAnimation], on layer: CALayer, key: String) {
    remove(key, from: layer)
    for (i, animation) in animations.enumerated() { layer.add(animation, forKey: i == 0 ? key : "\(key)#\(i)") }
  }

  /// Every animation `install` put on `layer` under `key`.
  static func remove(_ key: String, from layer: CALayer) {
    for installed in layer.animationKeys() ?? [] where installed == key || installed.hasPrefix("\(key)#") { layer.removeAnimation(forKey: installed) }
  }
}

/// The arrow's heading (clockwise on screen, so negative in the panel's y-up layers) and its stretch along the travel axis.
func cursorHeadingTransform(_ s: CursorState) -> CATransform3D {
  var t = CATransform3DMakeRotation(s.axis, 0, 0, 1)
  t = CATransform3DScale(t, s.stretch, s.squash, 1)
  t = CATransform3DRotate(t, -s.axis, 0, 0, 1)
  return CATransform3DConcat(t, CATransform3DMakeRotation(-s.angle, 0, 0, 1))
}

/// The halo's swell, about the centre of its `side`-point square whatever its layer's `anchor`.
func cursorSwellTransform(_ swell: CGFloat, side: CGFloat, anchor: CGPoint) -> CATransform3D {
  let c = CGPoint(x: side / 2 - anchor.x * side, y: side / 2 - anchor.y * side)
  var t = CATransform3DMakeTranslation(c.x, c.y, 0)
  t = CATransform3DScale(t, swell, swell, 1)
  return CATransform3DTranslate(t, -c.x, -c.y, 0)
}

/// A fade over 0.44 s, ease-in-out: the cursor's opacity `from` to `to`, and the arrow's blur in to 7 or out to 0
/// (`blurTo`), each beginning at its own layer's time.
enum CursorFade {
  static func animations(from: Float, to: Float, blurTo: CGFloat, opacityBegin: CFTimeInterval, blurBegin: CFTimeInterval,
                         frameRate: CAFrameRateRange?) -> (opacity: CABasicAnimation, blur: CABasicAnimation) {
    let opacity = CABasicAnimation(keyPath: "opacity")
    opacity.fromValue = from
    opacity.toValue = to
    opacity.duration = CursorLifecycle.fadeSeconds
    opacity.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    opacity.beginTime = opacityBegin
    opacity.fillMode = .backwards
    let blur = CABasicAnimation(keyPath: "filters.blur.inputRadius")
    blur.fromValue = blurTo == 0 ? 7 : 0
    blur.toValue = blurTo
    blur.duration = CursorLifecycle.fadeSeconds
    blur.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    blur.beginTime = blurBegin
    blur.fillMode = .backwards
    if let frameRate {
      opacity.preferredFrameRateRange = frameRate
      blur.preferredFrameRateRange = frameRate
    }
    return (opacity, blur)
  }
}

enum CursorDips {
  /// The key prefix of a dip's animation on its layer.
  static let keyPrefix = "dip"
  /// Reduce Motion's dip: an opacity dip to 0.45 and back, 0.1 s in all (the spec's Design, "Reduce Motion").
  static let reducedDuration = 0.1, reducedOpacity = 0.45

  /// Replaces every dip `layer` has scheduled with `dips`: a motion that supersedes another cancels the dips the old one
  /// had not played, whether it has dips of its own or none (a scroll's, a frozen cursor's). `frameRate`: the cursor's
  /// range (CursorFrameRate), nil for each dip's own (the `uncapped` arm).
  static func schedule(_ dips: [TimeInterval], on layer: CALayer, reduceMotion: Bool, frameRate: CAFrameRateRange? = CursorFrameRate.capped) {
    for key in layer.animationKeys() ?? [] where key.hasPrefix(keyPrefix) { layer.removeAnimation(forKey: key) }
    for (i, dip) in dips.enumerated() {
      let animation = dipAnimation(reduceMotion: reduceMotion)
      if let frameRate { animation.preferredFrameRateRange = frameRate }
      animation.beginTime = layer.convertTime(dip, from: nil)
      layer.add(animation, forKey: "\(keyPrefix)\(i)")
    }
  }

  /// The press (VirtualCursor.press(), VC §6): the arrow's scale on the press spring; under Reduce Motion its own short
  /// opacity dip instead.
  static func dipAnimation(reduceMotion: Bool) -> CAKeyframeAnimation {
    if reduceMotion {
      let animation = CAKeyframeAnimation(keyPath: "opacity")
      animation.values = [1.0, reducedOpacity, 1.0]
      animation.keyTimes = [0, 0.5, 1]
      animation.duration = reducedDuration
      animation.fillMode = .removed
      return animation
    }
    let curve = pressDipCurve()
    let animation = CAKeyframeAnimation(keyPath: "transform.scale")
    animation.values = curve
    animation.duration = Double(curve.count - 1) * cursorMotionStep
    animation.fillMode = .removed
    return animation
  }
}

/// The press spring (VirtualCursor.press(), VC §6): pressed toward 0.7 for 0.1 s, released toward 1, on the SwiftUI spring
/// (stiffness 130.5, damping 18.85), sampled until it rests.
func pressDipCurve(step: Double = cursorMotionStep) -> [Double] {
  var x = 1.0, v = 0.0, t = 0.0
  var values = [x]
  while t < 2 {
    let target = t < 0.1 ? 0.7 : 1.0
    let a = 130.5 * (target - x) - 18.85 * v
    v += a * step
    x += v * step
    t += step
    values.append(x)
    if t > 0.1, abs(x - 1) < 0.0005, abs(v) < 0.01 { break }
  }
  values[values.count - 1] = 1
  return values
}

/// The thinking rock (FUN_1001421ec, FUN_100142484): ±10°, 0.684931506849315 s per swing, eased, for ever; 0.41 s back to
/// rest. It tracks whether it is rocking itself, apart from the lifecycle's phase, so a change of Reduce Motion while
/// thinking starts or stops it with no action in between.
final class CursorRock {
  static let degrees = 10.0, swing = 0.684931506849315, stop = 0.41

  private(set) var rocking = false
  /// When the rock now playing began (host time); nil while it is not rocking.
  private(set) var startedAt: TimeInterval?
  /// The frame-rate range for every animation of the rock (CursorFrameRate), nil for each one's own (the `uncapped` arm).
  private let frameRate: CAFrameRateRange?

  init(frameRate: CAFrameRateRange? = CursorFrameRate.capped) {
    self.frameRate = frameRate
  }

  /// Rocks `layer` from `host` on, or brings it back to rest, when that differs from what it does now.
  func update(_ rock: Bool, on layer: CALayer, at host: TimeInterval) {
    guard rock != rocking else { return }
    rocking = rock
    startedAt = rock ? host : nil
    if rock { start(layer, at: host) } else { halt(layer) }
  }

  private func start(_ layer: CALayer, at host: TimeInterval) {
    layer.removeAnimation(forKey: "rockOut")
    let radians = Self.degrees * .pi / 180
    let ramp = CABasicAnimation(keyPath: "transform.rotation.z")
    ramp.fromValue = 0
    ramp.toValue = radians
    ramp.duration = Self.swing / 2
    ramp.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    ramp.beginTime = layer.convertTime(host, from: nil)
    ramp.fillMode = .backwards
    add(ramp, to: layer, forKey: "rockIn")
    let swing = CABasicAnimation(keyPath: "transform.rotation.z")
    swing.fromValue = radians
    swing.toValue = -radians
    swing.duration = Self.swing
    swing.autoreverses = true
    swing.repeatCount = .infinity
    swing.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    swing.beginTime = layer.convertTime(host + Self.swing / 2, from: nil)
    add(swing, to: layer, forKey: "rock")
  }

  private func halt(_ layer: CALayer) {
    let angle = (layer.presentation()?.value(forKeyPath: "transform.rotation.z") as? NSNumber)?.doubleValue ?? 0
    layer.removeAnimation(forKey: "rockIn")
    layer.removeAnimation(forKey: "rock")
    let back = CABasicAnimation(keyPath: "transform.rotation.z")
    back.fromValue = angle
    back.toValue = 0
    back.duration = Self.stop
    back.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    add(back, to: layer, forKey: "rockOut")
  }

  private func add(_ animation: CAAnimation, to layer: CALayer, forKey key: String) {
    if let frameRate { animation.preferredFrameRateRange = frameRate }
    layer.add(animation, forKey: key)
  }
}
