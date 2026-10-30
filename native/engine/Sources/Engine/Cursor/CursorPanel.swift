import AppKit
import Foundation
import QuartzCore

// The cursor's overlay (the spec's Design, "The overlay window" and "Rendering and the main thread"): one borderless,
// transparent, non-activating panel per cursor spanning its screen's full frame, ordered directly above the target
// window, never key, never main, ignoring the mouse, shared read-only with screen capture (so recordings show it; the
// agent's own single-window screenshots never contain it). Everything here runs on the main thread, once per commit:
// the trajectory is installed as Core Animation keyframes and the render server plays it, so no main-thread work runs
// per frame. Layers are layer-backed views where AppKit needs a view (the halo's backdrop) and plain layers elsewhere.

/// The engine's own on-screen windows, which the screenshot path's shareable-content cache leaves out of its key
/// (Screenshot.swift), so a cursor appearing never costs a screenshot a re-list.
final class EngineWindows: @unchecked Sendable {
  static let shared = EngineWindows()
  private let lock = NSLock()
  private var numbers: Set<CGWindowID> = []
  func insert(_ number: CGWindowID) { lock.withLock { _ = numbers.insert(number) } }
  func remove(_ number: CGWindowID) { lock.withLock { _ = numbers.remove(number) } }
  var all: Set<CGWindowID> { lock.withLock { numbers } }
}

/// The live renderer: the panels by connection.
final class CursorPanels: CursorRenderer, @unchecked Sendable {
  @MainActor private var overlays: [Int: CursorOverlay] = [:]

  func apply(_ commit: CursorCommit) {
    MainActor.assumeIsolated {
      let overlay = overlays[commit.connection] ?? CursorOverlay()
      overlays[commit.connection] = overlay
      overlay.apply(commit)
    }
  }

  func close(connection: Int) {
    MainActor.assumeIsolated {
      overlays.removeValue(forKey: connection)?.close()
    }
  }
}

/// A panel that never becomes key or main.
private final class CursorWindow: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

/// The arrow: cua's own rounded up-left arrowhead (the look reference's option A, not the vendor's path), 18 units with
/// its visual tip on (0, 0), drawn at 0.75, y up.
@MainActor
func cursorArrowPath(scale: CGFloat = 0.75) -> CGPath {
  let raw = [CGPoint(x: 0, y: 0), CGPoint(x: 16.2, y: 6.4), CGPoint(x: 8.4, y: 8.4), CGPoint(x: 6.4, y: 16.2)]
  let cuts: [CGFloat] = [2.6, 2.4, 1.0, 2.4]
  func toward(_ p: CGPoint, _ q: CGPoint, _ d: CGFloat) -> CGPoint {
    let dx = q.x - p.x, dy = q.y - p.y, l = hypot(dx, dy)
    return l < 0.001 ? p : CGPoint(x: p.x + dx / l * d, y: p.y + dy / l * d)
  }
  func corners(_ pts: [CGPoint]) -> [(a: CGPoint, p: CGPoint, b: CGPoint)] {
    pts.indices.map { i in
      let p = pts[i], prev = pts[(i + pts.count - 1) % pts.count], next = pts[(i + 1) % pts.count]
      return (toward(p, prev, cuts[i]), p, toward(p, next, cuts[i]))
    }
  }
  let first = corners(raw)[0]
  let apex = CGPoint(x: 0.25 * first.a.x + 0.5 * first.p.x + 0.25 * first.b.x, y: 0.25 * first.a.y + 0.5 * first.p.y + 0.25 * first.b.y)
  // The mock's units are y-down; the panel's are y-up.
  let shifted = raw.map { CGPoint(x: ($0.x - apex.x) * scale, y: -($0.y - apex.y) * scale) }
  let scaledCuts = cuts.map { $0 * scale }
  let path = CGMutablePath()
  for (i, p) in shifted.enumerated() {
    let prev = shifted[(i + shifted.count - 1) % shifted.count], next = shifted[(i + 1) % shifted.count]
    let a = toward(p, prev, scaledCuts[i]), b = toward(p, next, scaledCuts[i])
    if i == 0 { path.move(to: a) } else { path.addLine(to: a) }
    path.addQuadCurve(to: b, control: p)
  }
  path.closeSubpath()
  return path
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

@MainActor
private final class CursorOverlay {
  /// The container's side: room for the halo's 2.5× swell around the tip at its centre.
  static let side: CGFloat = 180
  /// The arrow's fill alpha at rest and while thinking. The vendor's rises 16 % → 24 % (×1.5); cua's rest fill is the
  /// session's colour at 0.8, rising to 1, since a ×1.5 rise would need a rest fill of 0.66, which reads pale over the
  /// frost against look A's solid arrow.
  static let fill: CGFloat = 0.8, thinkingFill: CGFloat = 1
  /// The rock (VC Appendix C §2): ±10°, 0.684931506849315 s per swing, 0.41 s back to rest.
  static let rockDegrees = 10.0, rockSwing = 0.684931506849315, rockStop = 0.41

  private let panel: CursorWindow
  private let content: NSView
  private let cursor: NSView
  private let halo: CursorHalo
  private let haloHost: NSView
  private let arrowView: NSView
  private let rock = CALayer(), press = CALayer(), heading = CALayer()
  private let shape = CAShapeLayer()
  private let pill: NSView
  private let pillText = CATextLayer()
  private var installedMotion: Int?
  private var phase: CursorPhase = .hidden
  private var shown = false
  private var screenFrame: CGRect = .zero
  private var label = ""
  private var registered: CGWindowID?

  init() {
    panel = CursorWindow(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.ignoresMouseEvents = true
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle, .transient]
    panel.title = "cua Agent Cursor"
    panel.sharingType = .readOnly
    content = NSView(frame: .zero)
    content.wantsLayer = true
    panel.contentView = content

    let side = Self.side, centre = side / 2
    cursor = NSView(frame: NSRect(x: 0, y: 0, width: side, height: side))
    cursor.wantsLayer = true
    content.addSubview(cursor)

    halo = CursorHalo()
    haloHost = NSView(frame: NSRect(x: centre - CursorHalo.side / 2, y: centre - CursorHalo.side / 2, width: CursorHalo.side, height: CursorHalo.side))
    haloHost.wantsLayer = true
    haloHost.addSubview(halo.view)
    cursor.addSubview(haloHost)

    arrowView = NSView(frame: NSRect(x: 0, y: 0, width: side, height: side))
    arrowView.wantsLayer = true
    arrowView.layerUsesCoreImageFilters = true
    cursor.addSubview(arrowView)
    for layer in [rock, press, heading] {
      layer.bounds = .zero
      layer.anchorPoint = CGPoint(x: 0.5, y: 0.5)
    }
    rock.position = CGPoint(x: centre, y: centre)
    press.position = .zero
    heading.position = .zero
    arrowView.layer?.addSublayer(rock)
    rock.addSublayer(press)
    press.addSublayer(heading)
    heading.addSublayer(shape)
    shape.path = cursorArrowPath()
    shape.lineWidth = 2
    shape.lineJoin = .round
    shape.shadowColor = NSColor.black.cgColor
    shape.shadowOpacity = 0.35
    shape.shadowRadius = 1
    shape.shadowOffset = CGSize(width: 0, height: -0.5)
    if let blur = CIFilter(name: "CIGaussianBlur", parameters: [kCIInputRadiusKey: 0]) {
      blur.name = "blur"
      rock.filters = [blur]
    }

    pill = NSView(frame: .zero)
    pill.wantsLayer = true
    pill.layer?.cornerRadius = 9
    pill.layer?.borderWidth = 1
    pill.layer?.borderColor = NSColor.white.withAlphaComponent(0.7).cgColor
    pill.layer?.shadowColor = NSColor.black.cgColor
    pill.layer?.shadowOpacity = 0.25
    pill.layer?.shadowRadius = 1.5
    pill.layer?.shadowOffset = CGSize(width: 0, height: -1)
    pillText.font = NSFont.systemFont(ofSize: 11, weight: .medium)
    pillText.fontSize = 11
    pillText.foregroundColor = NSColor.white.cgColor
    pillText.alignmentMode = .center
    pill.layer?.addSublayer(pillText)
    cursor.addSubview(pill)

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    cursor.layer?.opacity = 0
    CATransaction.commit()
  }

  func close() {
    if let registered { EngineWindows.shared.remove(registered) }
    cursor.layer?.removeAllAnimations()
    panel.orderOut(nil)
  }

  func apply(_ commit: CursorCommit) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }
    place(commit)
    style(commit)
    if let motion = commit.motion, motion.id != installedMotion {
      installedMotion = motion.id
      install(motion, reduceMotion: commit.reduceMotion)
    }
    transition(to: commit)
  }

  // MARK: Placement

  private func place(_ commit: CursorCommit) {
    if screenFrame != commit.screen.frame {
      screenFrame = commit.screen.frame
      panel.setFrame(screenFrame, display: false)
      content.frame = NSRect(origin: .zero, size: screenFrame.size)
      for layer in [shape, pillText] as [CALayer] { layer.contentsScale = panel.backingScaleFactor }
    }
    let level = NSWindow.Level(rawValue: commit.attachment.level)
    if panel.level != level { panel.level = level }
    if commit.attachment.level == raisedCursorLevel {
      panel.orderFrontRegardless()
    } else {
      panel.order(.above, relativeTo: Int(commit.attachment.window))
    }
    if registered == nil, panel.windowNumber > 0 {
      registered = CGWindowID(panel.windowNumber)
      EngineWindows.shared.insert(registered!)
    }
  }

  private func style(_ commit: CursorCommit) {
    let contrast = commit.increaseContrast
    let color = commit.identity.color
    shape.strokeColor = NSColor.white.withAlphaComponent(contrast ? 1 : 0.8).cgColor
    halo.setTint(color, increaseContrast: contrast)
    let rgb = color.usingColorSpace(.sRGB).map { RGB(red: Double($0.redComponent), green: Double($0.greenComponent), blue: Double($0.blueComponent)) }
    pill.layer?.backgroundColor = (rgb.map { pillShade(of: $0).color } ?? color).cgColor
    if label != commit.identity.label {
      label = commit.identity.label
      pillText.string = label
    }
  }

  /// The pill beside the arrow, below and to the right of the tip, flipped to stay on its screen.
  private func layoutPill(tip: CGPoint) {
    let size = (label as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 11, weight: .medium)])
    let width = ceil(size.width) + 14, height: CGFloat = 18
    let centre = Self.side / 2
    var x = centre + 15, y = centre - 15 - height
    if tip.x + 15 + width > screenFrame.width { x = centre - 15 - width }
    if tip.y - 15 - height < 0 { y = centre + 15 }
    pill.frame = NSRect(x: x, y: y, width: width, height: height)
    pillText.frame = CGRect(x: 0, y: (height - 13) / 2 - 0.5, width: width, height: 14)
  }

  // MARK: Motion

  private func layerTime(_ host: TimeInterval, _ layer: CALayer) -> CFTimeInterval { layer.convertTime(host, from: nil) }

  /// The trajectory as keyframes: the container's position, the arrow's heading and stretch, the halo's swell; the
  /// press dips at their arrival times.
  private func install(_ motion: CursorMotionInstall, reduceMotion: Bool) {
    guard let cursorLayer = cursor.layer, let haloLayer = haloHost.layer else { return }
    let samples = motion.trajectory.samples
    let last = samples[samples.count - 1]
    let side = Self.side
    let anchor = cursorLayer.anchorPoint
    func layerPosition(_ tip: CGPoint) -> NSValue {
      NSValue(point: NSPoint(x: tip.x - side / 2 + anchor.x * side, y: tip.y - side / 2 + anchor.y * side))
    }
    cursor.setFrameOrigin(NSPoint(x: last.position.x - side / 2, y: last.position.y - side / 2))
    layoutPill(tip: last.position)
    heading.transform = headingTransform(last)
    haloLayer.transform = swellTransform(last.swell, haloLayer)
    for (layer, key) in [(cursorLayer, "glide"), (heading, "heading"), (haloLayer, "swell")] { layer.removeAnimation(forKey: key) }
    if samples.count > 1 {
      let duration = motion.trajectory.duration
      func keyframes(_ keyPath: String, _ values: [Any], on layer: CALayer, key: String) {
        let animation = CAKeyframeAnimation(keyPath: keyPath)
        animation.values = values
        animation.duration = duration
        animation.calculationMode = .linear
        animation.beginTime = layerTime(motion.beginTime, layer)
        animation.fillMode = .backwards
        animation.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        layer.add(animation, forKey: key)
      }
      keyframes("position", samples.map { layerPosition($0.position) }, on: cursorLayer, key: "glide")
      if !reduceMotion {
        keyframes("transform", samples.map { NSValue(caTransform3D: headingTransform($0)) }, on: heading, key: "heading")
        keyframes("transform", samples.map { NSValue(caTransform3D: swellTransform($0.swell, haloLayer)) }, on: haloLayer, key: "swell")
      }
    }
    for (i, dip) in motion.dips.enumerated() {
      let curve = pressDipCurve()
      let animation = CAKeyframeAnimation(keyPath: reduceMotion ? "opacity" : "transform.scale")
      animation.values = reduceMotion ? curve.map { 0.45 + 0.55 * min(max(($0 - 0.7) / 0.3, 0), 1) } : curve
      animation.duration = Double(curve.count - 1) * cursorMotionStep
      animation.beginTime = layerTime(dip, press)
      animation.fillMode = .removed
      press.add(animation, forKey: "dip\(i)")
    }
  }

  /// The heading (clockwise on screen, so negative in the panel's y-up layers) and the stretch along the travel axis.
  private func headingTransform(_ s: CursorState) -> CATransform3D {
    var t = CATransform3DMakeRotation(s.axis, 0, 0, 1)
    t = CATransform3DScale(t, s.stretch, s.squash, 1)
    t = CATransform3DRotate(t, -s.axis, 0, 0, 1)
    return CATransform3DConcat(t, CATransform3DMakeRotation(-s.angle, 0, 0, 1))
  }

  /// The halo's swell, about its centre whatever the view layer's anchor.
  private func swellTransform(_ swell: CGFloat, _ layer: CALayer) -> CATransform3D {
    let side = CursorHalo.side
    let c = CGPoint(x: side / 2 - layer.anchorPoint.x * side, y: side / 2 - layer.anchorPoint.y * side)
    var t = CATransform3DMakeTranslation(c.x, c.y, 0)
    t = CATransform3DScale(t, swell, swell, 1)
    return CATransform3DTranslate(t, -c.x, -c.y, 0)
  }

  // MARK: States

  /// The state's look: opacity (hidden and fading 0, taken over 0.5), the rock while thinking, the fill.
  private func transition(to commit: CursorCommit) {
    guard let cursorLayer = cursor.layer else { return }
    let nowShown = commit.shown
    let target: Float
    switch commit.phase {
    case .hidden, .fading: target = 0
    case .takenOver: target = 0.5
    case .acting, .thinking: target = 1
    }
    let shownTarget: Float = nowShown || commit.phase == .fading ? target : 0
    let current = cursorLayer.presentation()?.opacity ?? cursorLayer.opacity
    if !commit.attachment.visible {
      cursorLayer.removeAnimation(forKey: "opacity")
      cursorLayer.opacity = 0
    } else if commit.phase == .fading && phase != .fading {
      fade(cursorLayer, from: current, to: 0, at: commit.phaseSince, blurTo: 7)
    } else if commit.phase.visible && commit.phase != .fading && (!shown || phase == .hidden || phase == .fading) && current < 0.05 {
      fade(cursorLayer, from: 0, to: shownTarget, at: commit.motion?.beginTime ?? commit.phaseSince, blurTo: 0)
    } else if cursorLayer.opacity != shownTarget {
      let animation = CABasicAnimation(keyPath: "opacity")
      animation.fromValue = current
      animation.toValue = shownTarget
      animation.duration = 0.2
      animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      cursorLayer.opacity = shownTarget
      cursorLayer.add(animation, forKey: "opacity")
    }
    let thinking = commit.phase == .thinking && !commit.reduceMotion
    if thinking && (phase != .thinking) { startRock(at: commit.phaseSince) }
    if !thinking && phase == .thinking { stopRock() }
    let fill = commit.increaseContrast ? 1 : (commit.phase == .thinking ? Self.thinkingFill : Self.fill)
    let color = commit.identity.color.withAlphaComponent(fill).cgColor
    if shape.fillColor != color {
      let animation = CABasicAnimation(keyPath: "fillColor")
      animation.fromValue = shape.presentation()?.fillColor ?? shape.fillColor
      animation.toValue = color
      animation.duration = 0.2
      animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      shape.fillColor = color
      shape.add(animation, forKey: "fill")
    }
    if commit.phase == .hidden {
      // Nothing animates while hidden (the spec's Design, energy).
      for layer in [rock, press, heading] { layer.removeAllAnimations() }
      haloHost.layer?.removeAllAnimations()
      cursorLayer.removeAnimation(forKey: "glide")
    }
    phase = commit.phase
    shown = nowShown
  }

  /// A fade in or out over 0.44 s, ease-in-out, with the arrow and pill blurring out (7) or in (0).
  private func fade(_ layer: CALayer, from: Float, to: Float, at host: TimeInterval, blurTo: CGFloat) {
    let animation = CABasicAnimation(keyPath: "opacity")
    animation.fromValue = from
    animation.toValue = to
    animation.duration = CursorLifecycle.fadeSeconds
    animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    animation.beginTime = layerTime(host, layer)
    animation.fillMode = .backwards
    layer.opacity = to
    layer.add(animation, forKey: "opacity")
    let blur = CABasicAnimation(keyPath: "filters.blur.inputRadius")
    blur.fromValue = blurTo == 0 ? 7 : 0
    blur.toValue = blurTo
    blur.duration = CursorLifecycle.fadeSeconds
    blur.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    blur.beginTime = layerTime(host, rock)
    blur.fillMode = .backwards
    rock.setValue(0, forKeyPath: "filters.blur.inputRadius")
    rock.add(blur, forKey: "blur")
  }

  /// The thinking rock (FUN_1001421ec): to the nearest extreme, then ±10° for ever, eased.
  private func startRock(at host: TimeInterval) {
    let degrees = Self.rockDegrees * .pi / 180
    let ramp = CABasicAnimation(keyPath: "transform.rotation.z")
    ramp.fromValue = 0
    ramp.toValue = degrees
    ramp.duration = Self.rockSwing / 2
    ramp.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    ramp.beginTime = layerTime(host, rock)
    ramp.fillMode = .backwards
    rock.add(ramp, forKey: "rockIn")
    let swing = CABasicAnimation(keyPath: "transform.rotation.z")
    swing.fromValue = degrees
    swing.toValue = -degrees
    swing.duration = Self.rockSwing
    swing.autoreverses = true
    swing.repeatCount = .infinity
    swing.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    swing.beginTime = layerTime(host + Self.rockSwing / 2, rock)
    rock.add(swing, forKey: "rock")
  }

  /// Back to rest over 0.41 s from wherever the rock is.
  private func stopRock() {
    let angle = (rock.presentation()?.value(forKeyPath: "transform.rotation.z") as? NSNumber)?.doubleValue ?? 0
    rock.removeAnimation(forKey: "rockIn")
    rock.removeAnimation(forKey: "rock")
    let back = CABasicAnimation(keyPath: "transform.rotation.z")
    back.fromValue = angle
    back.toValue = 0
    back.duration = Self.rockStop
    back.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    rock.add(back, forKey: "rockOut")
  }
}
