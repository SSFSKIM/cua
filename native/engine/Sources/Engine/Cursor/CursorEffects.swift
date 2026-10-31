import Foundation
import QuartzCore

// The cursor's timed layer effects (the spec's Design, "What the person sees" and "Motion", the press dip): the press dip
// and the thinking rock, kept apart from the panel so they can be checked on plain layers, headless. Every host time is
// CACurrentMediaTime's.

extension CursorDebug {
  /// The frame-rate range every animation of the cursor's layers asks for under this arm, nil for each animation's own.
  /// `fps60`'s 30–60 Hz, preferring 60: measured on the MacBook's 120 Hz ProMotion display (macOS 26.6.2), WindowServer
  /// then composites a glide at about 60 frames a second where the default composites about 120, as long as nothing
  /// else on the display asks for more (the rate is the display's: any 120 Hz animation on it takes the glide to 120
  /// again) and no capped animation holds a value from one frame to the next (`changingSpan`; #235's task-8 report).
  var animationFrameRate: CAFrameRateRange? {
    self == .fps60 ? CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60) : nil
  }
}

/// The indices of `values`, a keyframe animation's evenly spaced values, from the last of its leading equal values to the
/// first of its trailing equal values: the part that changes. Nil when no value differs from the first. Under a capped
/// frame rate an animation runs over this part only, because while any capped animation holds its value WindowServer
/// composites at the display's full rate (measured on the MacBook, macOS 26.6.2: a glide's settled tail took the
/// capped 60 Hz back to 120), and a glide's position and heading hold after the tip settles, a heading all along a
/// straight path.
func changingSpan(_ values: [NSValue]) -> ClosedRange<Int>? {
  guard let first = values.first, let last = values.last,
        let changes = values.firstIndex(where: { !$0.isEqual(first) }) else { return nil }
  let settles = values.lastIndex(where: { !$0.isEqual(last) })! + 1
  return (changes - 1)...settles
}

enum CursorDips {
  /// The key prefix of a dip's animation on its layer.
  static let keyPrefix = "dip"
  /// Reduce Motion's dip: an opacity dip to 0.45 and back, 0.1 s in all (the spec's Design, "Reduce Motion").
  static let reducedDuration = 0.1, reducedOpacity = 0.45

  /// Replaces every dip `layer` has scheduled with `dips`: a motion that supersedes another cancels the dips the old one
  /// had not played, whether it has dips of its own or none (a scroll's, a frozen cursor's). `frameRate`: the arm's
  /// range (CursorDebug.animationFrameRate), nil for the default.
  static func schedule(_ dips: [TimeInterval], on layer: CALayer, reduceMotion: Bool, frameRate: CAFrameRateRange? = nil) {
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
  /// The arm's frame-rate range for every animation of the rock (CursorDebug.animationFrameRate), nil for the default.
  private let frameRate: CAFrameRateRange?

  init(frameRate: CAFrameRateRange? = nil) {
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
