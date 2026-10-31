import AppKit
import Metal
import QuartzCore
import XCTest
@testable import Engine

// The fps60 arm draws exactly what the default draws (#235's task-8 report, the design session's follow-up): its
// frame-rate range changes no value, and its keyframes, split at every hold (CursorKeyframes, changingRuns), move no
// time. Core Animation's own evaluation decides it: two layer trees, the default's and the arm's, are given the same
// motion through the panel's own builders, attached to an offscreen CARenderer (a layer has no presentation without a
// context; nothing is rendered), and their presentation is sampled every 5 ms across glides, a drag, the press dip, a
// fade and the rock by stopping the root's clock at each time. Every animated property is compared: the glide's
// position, the heading's and the halo's transforms (rotation, stretch, swell), the press dip's scale, the opacity, the
// arrow's blur and the rock's rotation.

final class CursorFrameCapPoseTests: XCTestCase {
  private static let capped = CursorDebug.fps60.animationFrameRate!
  private static let sampleStep = 0.005
  /// CursorHalo.side (66 pt, main-actor isolated there).
  private static let haloSide: CGFloat = 66

  /// One cursor's layers, as the panel nests them where it matters: the heading inside the press inside the rock.
  private struct Tree {
    let cursor = CALayer(), halo = CALayer(), rock = CALayer(), press = CALayer(), heading = CALayer()
    let rocker: CursorRock
    init(root: CALayer, frameRate: CAFrameRateRange?) {
      rocker = CursorRock(frameRate: frameRate)
      root.addSublayer(cursor)
      cursor.addSublayer(halo)
      cursor.addSublayer(rock)
      rock.addSublayer(press)
      press.addSublayer(heading)
      halo.bounds = CGRect(x: 0, y: 0, width: CursorFrameCapPoseTests.haloSide, height: CursorFrameCapPoseTests.haloSide)
      let blur = CIFilter(name: "CIGaussianBlur", parameters: [kCIInputRadiusKey: 0])!
      blur.name = "blur"
      rock.filters = [blur]
    }
  }

  /// What a tree shows at one time.
  private struct Pose {
    var values: [(String, [Double])]
  }

  private var renderer: CARenderer?
  private let root = CALayer()
  /// The root's local time minus host time, read while its clock runs.
  private var offset: CFTimeInterval = 0

  override func setUpWithError() throws {
    guard let device = MTLCreateSystemDefaultDevice() else { throw XCTSkip("no Metal device: no offscreen CARenderer to give the layers a context") }
    let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: 16, height: 16, mipmapped: false)
    descriptor.usage = [.renderTarget, .shaderRead]
    guard let texture = device.makeTexture(descriptor: descriptor) else { throw XCTSkip("no texture for the offscreen CARenderer") }
    root.bounds = CGRect(x: 0, y: 0, width: 1512, height: 945)
    let renderer = CARenderer(mtlTexture: texture, options: nil)
    renderer.layer = root
    renderer.bounds = root.bounds
    self.renderer = renderer
    let host = CACurrentMediaTime()
    offset = root.convertTime(host, from: nil) - host
  }

  /// Both trees at host time `host`, the root's clock stopped there.
  private func sample(_ trees: [Tree], at host: TimeInterval) -> [Pose] {
    root.speed = 0
    root.timeOffset = host + offset
    CATransaction.flush()
    return trees.map { tree in
      func transform(_ layer: CALayer) -> [Double] {
        let t = layer.presentation()?.transform ?? CATransform3DIdentity
        return [t.m11, t.m12, t.m21, t.m22, t.m41, t.m42].map { Double($0) }
      }
      let cursor = tree.cursor.presentation(), rock = tree.rock.presentation()
      return Pose(values: [
        ("position", [Double(cursor?.position.x ?? .nan), Double(cursor?.position.y ?? .nan)]),
        ("opacity", [Double(cursor?.opacity ?? .nan)]),
        ("heading (rotation, stretch)", transform(tree.heading)),
        ("halo (swell)", transform(tree.halo)),
        ("press dip (scale)", [(tree.press.presentation()?.value(forKeyPath: "transform.scale") as? NSNumber)?.doubleValue ?? .nan]),
        ("rock (rotation)", [(rock?.value(forKeyPath: "transform.rotation.z") as? NSNumber)?.doubleValue ?? .nan]),
        ("arrow blur", [(rock?.value(forKeyPath: "filters.blur.inputRadius") as? NSNumber)?.doubleValue ?? .nan]),
      ])
    }
  }

  /// Gives a tree the motion `trajectory` from host time `begin` as the panel does (CursorPanel.install), its press dip
  /// at the arrival, a fade-in at `begin`, then the rock from `rockAt` until `haltAt`. -> the glide's animations by key.
  @discardableResult
  private func act(_ tree: Tree, _ trajectory: Trajectory, begin: TimeInterval, rockAt: TimeInterval, haltAt: TimeInterval,
                   frameRate: CAFrameRateRange?) -> [String: [CAKeyframeAnimation]] {
    let samples = trajectory.samples, last = samples[samples.count - 1]
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    tree.cursor.position = last.position
    tree.heading.transform = cursorHeadingTransform(last)
    tree.halo.transform = cursorSwellTransform(last.swell, side: Self.haloSide, anchor: tree.halo.anchorPoint)
    var installed: [String: [CAKeyframeAnimation]] = [:]
    for (key, layer, values) in [
      ("glide", tree.cursor, samples.map { NSValue(point: $0.position) }),
      ("heading", tree.heading, samples.map { NSValue(caTransform3D: cursorHeadingTransform($0)) }),
      ("swell", tree.halo, samples.map { NSValue(caTransform3D: cursorSwellTransform($0.swell, side: Self.haloSide, anchor: tree.halo.anchorPoint)) }),
    ] {
      let animations = CursorKeyframes.animations(key == "glide" ? "position" : "transform", values, step: trajectory.step,
                                                  begin: layer.convertTime(begin, from: nil), frameRate: frameRate)
      CursorKeyframes.install(animations, on: layer, key: key)
      installed[key] = animations
    }
    CursorDips.schedule([begin + trajectory.arrival], on: tree.press, reduceMotion: false, frameRate: frameRate)
    let fade = CursorFade.animations(from: 0, to: 1, blurTo: 0, opacityBegin: tree.cursor.convertTime(begin, from: nil),
                                     blurBegin: tree.rock.convertTime(begin, from: nil), frameRate: frameRate)
    tree.cursor.opacity = 1
    tree.cursor.add(fade.opacity, forKey: "opacity")
    tree.rock.setValue(0, forKeyPath: "filters.blur.inputRadius")
    tree.rock.add(fade.blur, forKey: "blur")
    CATransaction.commit()
    tree.rocker.update(true, on: tree.rock, at: rockAt)
    return installed
  }

  private func halt(_ trees: [Tree], at host: TimeInterval) {
    // The rock comes back from where it is: its angle read at the halt, the same for both.
    _ = sample(trees, at: host)
    for tree in trees { tree.rocker.update(false, on: tree.rock, at: host) }
  }

  /// Every sample where the arm's pose differs from the default's: [(ms from the motion's begin, property, default, arm)].
  private func differences(_ trajectory: Trajectory, name: String) -> (mismatches: [String], runs: [String: Int], sampled: Int, largest: [String: Double]) {
    root.sublayers?.forEach { $0.removeFromSuperlayer() }
    root.speed = 1
    root.timeOffset = 0
    CATransaction.flush()
    let host = CACurrentMediaTime()
    offset = root.convertTime(host, from: nil) - host
    let trees = [Tree(root: root, frameRate: nil), Tree(root: root, frameRate: Self.capped)]
    let begin = host + 1, rockAt = begin + trajectory.duration + 0.1, haltAt = rockAt + 1.5, end = haltAt + CursorRock.stop + 0.05
    act(trees[0], trajectory, begin: begin, rockAt: rockAt, haltAt: haltAt, frameRate: nil)
    let installed = act(trees[1], trajectory, begin: begin, rockAt: rockAt, haltAt: haltAt, frameRate: Self.capped)
    var mismatches: [String] = []
    var largest: [String: Double] = [:]
    var read: Set<String> = []
    var sampled = 0
    var halted = false
    var t = begin - 0.05
    while t <= end {
      if !halted && t >= haltAt {
        halt(trees, at: haltAt)
        halted = true
      }
      let poses = sample(trees, at: t)
      sampled += 1
      for ((property, plain), (_, armed)) in zip(poses[0].values, poses[1].values) {
        let worst = zip(plain, armed).map { $0.isNaN && $1.isNaN ? 0 : abs($0 - $1) }.max() ?? 0
        largest[property] = max(largest[property] ?? 0, worst)
        if plain.allSatisfy({ !$0.isNaN }) { read.insert(property) }
        // Core Animation interpolates in its own float arithmetic, and a run's fraction is found from its own begin:
        // the same pose to a ten-thousandth of a point, a millionth of a scale, an angle or an opacity.
        if !(worst <= (property == "position" ? 1e-4 : 1e-6)) {
          mismatches.append("\(name) at \(String(format: "%.1f", (t - begin) * 1000)) ms: \(property) default \(plain) fps60 \(armed) (by \(worst))")
        }
      }
      t += Self.sampleStep
    }
    root.speed = 1
    XCTAssertEqual(read, Set(largest.keys), "\(name): every property was read from Core Animation, none missing")
    return (mismatches, installed.mapValues(\.count), sampled, largest)
  }

  private let bounds = CGRect(x: 0, y: 0, width: 1512, height: 945)

  func testTheArmDrawsTheDefaultsPoseEvery5msAcrossGlidesADragTheDipTheFadeAndTheRock() throws {
    let start = CursorState.rest(at: CGPoint(x: 200, y: 700))
    let path = plan(from: start, to: CGPoint(x: 1300, y: 300), bounds: bounds, reduceMotion: false)
    let backward = plan(from: .rest(at: CGPoint(x: 1300, y: 300)), to: CGPoint(x: 150, y: 600), bounds: bounds, reduceMotion: false)
    let scoot = plan(from: start, to: CGPoint(x: 320, y: 640), bounds: bounds, reduceMotion: false)
    // A drag as the hub plans one (CursorHub): the glide to its start, then the straight traces, which hold between.
    var drag = plan(from: start, to: CGPoint(x: 700, y: 500), bounds: bounds, reduceMotion: false)
    for next in [CGPoint(x: 900, y: 420), CGPoint(x: 1100, y: 480)] {
      drag = drag.followed(by: planStraight(from: drag.samples[drag.samples.count - 1], to: next, bounds: bounds, reduceMotion: false))
    }
    XCTAssertEqual([path.mode, backward.mode, scoot.mode], [.path, .path, .scoot])
    var report: [String] = []
    for (name, trajectory) in [("path", path), ("backward path", backward), ("scoot", scoot), ("drag", drag)] {
      let (mismatches, runs, sampled, largest) = differences(trajectory, name: name)
      XCTAssertGreaterThan(sampled, Int(trajectory.duration / Self.sampleStep), name)
      XCTAssertTrue(mismatches.isEmpty, "\(mismatches.count) of \(sampled) samples differ; the first: \(mismatches.prefix(12).joined(separator: "; "))")
      report.append("\(name) \(Int((trajectory.duration * 1000).rounded())) ms: \(sampled) samples, fps60 runs \(runs.sorted { $0.key < $1.key }.map { "\($0.key) \($0.value)" }.joined(separator: ", ")), largest difference \(largest.sorted { $0.key < $1.key }.map { "\($0.key) \(String(format: "%.1e", $0.value))" }.joined(separator: ", "))")
      if name == "drag" { XCTAssertGreaterThan(runs["glide"] ?? 0, 1, "the drag's position holds between its glide and its trace: split, not kept") }
    }
    print("CursorFrameCapPoseTests: " + report.joined(separator: "; "))
  }

  /// The comparison sees a difference when there is one: an arm whose runs were shifted by one sample would be caught.
  func testTheComparisonCatchesAShiftedRun() throws {
    let trajectory = plan(from: .rest(at: CGPoint(x: 200, y: 700)), to: CGPoint(x: 1300, y: 300), bounds: bounds, reduceMotion: false)
    root.sublayers?.forEach { $0.removeFromSuperlayer() }
    let host = CACurrentMediaTime()
    offset = root.convertTime(host, from: nil) - host
    let trees = [Tree(root: root, frameRate: nil), Tree(root: root, frameRate: Self.capped)]
    let begin = host + 1
    act(trees[0], trajectory, begin: begin, rockAt: begin + 10, haltAt: begin + 11, frameRate: nil)
    let installed = act(trees[1], trajectory, begin: begin, rockAt: begin + 10, haltAt: begin + 11, frameRate: Self.capped)
    let shifted = installed["glide"]!.map { $0.copy() as! CAKeyframeAnimation }
    for animation in shifted { animation.beginTime += trajectory.step }
    CursorKeyframes.install(shifted, on: trees[1].cursor, key: "glide")
    let poses = sample(trees, at: begin + 0.1)
    let plain = poses[0].values[0].1, armed = poses[1].values[0].1
    XCTAssertGreaterThan(zip(plain, armed).map { abs($0 - $1) }.max() ?? 0, 0.01, "a one-sample shift shows in the position")
    root.speed = 1
  }
}
