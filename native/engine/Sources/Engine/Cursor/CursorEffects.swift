import Foundation
import QuartzCore

// The cursor's timed layer effects (the spec's Design, "What the person sees" and "Motion", the press dip): the press dip
// and the thinking rock, kept apart from the panel so they can be checked on plain layers, headless. Every host time is
// CACurrentMediaTime's.

enum CursorDips {
  /// The key prefix of a dip's animation on its layer.
  static let keyPrefix = "dip"
  /// Reduce Motion's dip: an opacity dip to 0.45 and back, 0.1 s in all (the spec's Design, "Reduce Motion").
  static let reducedDuration = 0.1, reducedOpacity = 0.45

  /// Replaces every dip `layer` has scheduled with `dips`: a motion that supersedes another cancels the dips the old one
  /// had not played, whether it has dips of its own or none (a scroll's, a frozen cursor's).
  static func schedule(_ dips: [TimeInterval], on layer: CALayer, reduceMotion: Bool) {
    for key in layer.animationKeys() ?? [] where key.hasPrefix(keyPrefix) { layer.removeAnimation(forKey: key) }
    for (i, dip) in dips.enumerated() {
      let animation = dipAnimation(reduceMotion: reduceMotion)
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
    layer.add(ramp, forKey: "rockIn")
    let swing = CABasicAnimation(keyPath: "transform.rotation.z")
    swing.fromValue = radians
    swing.toValue = -radians
    swing.duration = Self.swing
    swing.autoreverses = true
    swing.repeatCount = .infinity
    swing.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    swing.beginTime = layer.convertTime(host + Self.swing / 2, from: nil)
    layer.add(swing, forKey: "rock")
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
    layer.add(back, forKey: "rockOut")
  }
}
