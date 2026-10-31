import QuartzCore
import XCTest
@testable import Engine

// The cursor's timed layer effects (Cursor/CursorEffects.swift) on plain layers, headless: dips replaced whenever a
// motion is installed, Reduce Motion's 0.1 s opacity dip, and the rock following its own state.

final class CursorEffectsTests: XCTestCase {
  private func dipKeys(_ layer: CALayer) -> [String] { (layer.animationKeys() ?? []).filter { $0.hasPrefix(CursorDips.keyPrefix) } }

  func testANewMotionCancelsTheOldOnesUnplayedDipEvenWithNoDipOfItsOwn() {
    // A click whose dip is still to come, then a scroll (no dip) before the click's arrival.
    let press = CALayer()
    CursorDips.schedule([CACurrentMediaTime() + 0.8], on: press, reduceMotion: false)
    XCTAssertEqual(dipKeys(press), ["dip0"])
    CursorDips.schedule([], on: press, reduceMotion: false)
    XCTAssertEqual(dipKeys(press), [], "the click's dip never plays at the scroll's point")
    CursorDips.schedule([CACurrentMediaTime() + 0.5], on: press, reduceMotion: false)
    CursorDips.schedule([CACurrentMediaTime() + 0.9], on: press, reduceMotion: false)
    XCTAssertEqual(dipKeys(press), ["dip0"], "replaced, not added to")
  }

  func testReduceMotionsDipIsATenthOfASecondOpacityDip() {
    let reduced = CursorDips.dipAnimation(reduceMotion: true)
    XCTAssertEqual(reduced.keyPath, "opacity")
    XCTAssertEqual(reduced.duration, 0.1, accuracy: 1e-12)
    XCTAssertEqual((reduced.values as? [NSNumber])?.map(\.doubleValue).min(), 0.45)
    let pressed = CursorDips.dipAnimation(reduceMotion: false)
    XCTAssertEqual(pressed.keyPath, "transform.scale")
    // Pressed toward 0.7 for 0.1 s on a spring of about 0.55 s: it dips part of the way and springs back.
    let deepest = (pressed.values as? [NSNumber])?.map(\.doubleValue).min() ?? 1
    XCTAssertLessThan(deepest, 0.9)
    XCTAssertGreaterThan(deepest, 0.7)
  }

  func testTheRockFollowsItsOwnStateNotThePhase() {
    let layer = CALayer(), rock = CursorRock()
    let keys = { Set(layer.animationKeys() ?? []) }
    rock.update(true, on: layer, at: CACurrentMediaTime())
    XCTAssertTrue(keys().contains("rock"))
    rock.update(true, on: layer, at: CACurrentMediaTime())
    XCTAssertTrue(rock.rocking)
    // Reduce Motion turned on while thinking: it stops, with no action in between.
    rock.update(false, on: layer, at: CACurrentMediaTime())
    XCTAssertFalse(keys().contains("rock"))
    XCTAssertTrue(keys().contains("rockOut"))
    // And off again: it rocks again.
    rock.update(true, on: layer, at: CACurrentMediaTime())
    XCTAssertTrue(keys().contains("rock"))
    XCTAssertFalse(keys().contains("rockOut"))
  }

  // The 60 Hz cap is the default (#235's Decision Log, 2026-10-31): every animation of the cursor's layers asks for at
  // most 60 Hz under no arm and under every arm but `uncapped` (engine.json `cursorDebug`), where each keeps its own.
  func testTheCursorAsksAtMostSixtyHertzUnlessTheUncappedArmIsOn() {
    let capped = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
    XCTAssertEqual(CursorFrameRate.capped, capped)
    XCTAssertEqual(CursorFrameRate.range(for: nil), capped, "no arm: capped")
    XCTAssertNil(CursorFrameRate.range(for: .uncapped))
    for arm in CursorDebug.allCases where arm != .uncapped { XCTAssertEqual(CursorFrameRate.range(for: arm), capped, arm.rawValue) }
    // The dips and the rock are capped unless told otherwise.
    let press = CALayer(), layer = CALayer(), rock = CursorRock()
    CursorDips.schedule([CACurrentMediaTime() + 0.5], on: press, reduceMotion: false)
    XCTAssertEqual(press.animation(forKey: "dip0")?.preferredFrameRateRange, capped)
    rock.update(true, on: layer, at: CACurrentMediaTime())
    XCTAssertEqual(layer.animation(forKey: "rock")?.preferredFrameRateRange, capped)
  }

  func testTheDipsAndTheRockCarryTheCappedRateAndKeepTheirOwnWithoutIt() {
    let capped = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
    for (frameRate, expected) in [(capped, capped), (nil, CAFrameRateRange.default)] as [(CAFrameRateRange?, CAFrameRateRange)] {
      for reduceMotion in [false, true] {
        let press = CALayer()
        CursorDips.schedule([CACurrentMediaTime() + 0.5, CACurrentMediaTime() + 0.9], on: press, reduceMotion: reduceMotion, frameRate: frameRate)
        for key in dipKeys(press) { XCTAssertEqual(press.animation(forKey: key)?.preferredFrameRateRange, expected, key) }
      }
      let layer = CALayer(), rock = CursorRock(frameRate: frameRate)
      rock.update(true, on: layer, at: CACurrentMediaTime())
      for key in ["rockIn", "rock"] { XCTAssertEqual(layer.animation(forKey: key)?.preferredFrameRateRange, expected, key) }
      rock.update(false, on: layer, at: CACurrentMediaTime())
      XCTAssertEqual(layer.animation(forKey: "rockOut")?.preferredFrameRateRange, expected, "rockOut")
    }
  }

  // Under the cap a keyframe animation runs as one animation per run of changing values: a held value from one frame to
  // the next takes the window server back to the display's full rate (measured, #235's task-8 report).
  func testTheChangingRunsArePartedByEveryHold() {
    let v = { (xs: [Double]) in xs.map { NSValue(point: NSPoint(x: $0, y: 0)) } }
    XCTAssertEqual(changingRuns(v([0, 1, 2, 3])), [0...3])
    XCTAssertEqual(changingRuns(v([0, 1, 2, 2, 2])), [0...2], "the settled tail: held from the third sample on")
    XCTAssertEqual(changingRuns(v([5, 5, 5, 6, 7])), [2...4], "a heading held along a straight path, then blended back")
    XCTAssertEqual(changingRuns(v([0, 1, 2, 2, 2, 3, 4])), [0...2, 4...6], "a drag: the glide settles, then the trace")
    XCTAssertEqual(changingRuns(v([1, 2, 2, 3])), [0...1, 2...3], "a one-step hold parts them too")
    XCTAssertEqual(changingRuns(v([4, 4, 4])), [], "never changes: nothing to animate")
    XCTAssertEqual(changingRuns(v([4])), [])
    XCTAssertEqual(changingRuns([]), [])
    let t = { (a: CGFloat) in NSValue(caTransform3D: CATransform3DMakeRotation(a, 0, 0, 1)) }
    XCTAssertEqual(changingRuns([t(0.1), t(0.2), t(0.2)]), [0...1])
  }

  func testTheCappedKeyframesKeepEveryRunAtItsOwnTimeAndTheUncappedAreOneAnimation() {
    let v = [0, 1, 2, 2, 2, 3, 4, 4].map { NSValue(point: NSPoint(x: $0, y: 0)) }
    let step = 0.01
    let plain = CursorKeyframes.animations("position", v, step: step, begin: 100, frameRate: nil)
    XCTAssertEqual(plain.count, 1)
    XCTAssertEqual(plain[0].beginTime, 100)
    XCTAssertEqual(plain[0].duration, 0.07, accuracy: 1e-12)
    XCTAssertEqual(plain[0].preferredFrameRateRange, CursorKeyframes.uncappedFrameRate)
    let capped = CursorKeyframes.animations("position", v, step: step, begin: 100, frameRate: CursorFrameRate.capped)
    let close = { (a: [Double], b: [Double]) in a.count == b.count && zip(a, b).allSatisfy { abs($0 - $1) < 1e-12 } }
    XCTAssertTrue(close(capped.map(\.beginTime), [100, 100.04]), "\(capped.map(\.beginTime))")
    XCTAssertTrue(close(capped.map(\.duration), [0.02, 0.02]), "\(capped.map(\.duration))")
    XCTAssertEqual(capped.map { ($0.values as? [NSValue])?.map(\.pointValue.x) ?? [] }, [[0, 1, 2], [2, 3, 4]])
    // The latest-begun animation wins in Core Animation, so only the first fills backwards; each holds its end after.
    XCTAssertEqual(capped.map(\.fillMode), [.both, .forwards])
    XCTAssertTrue(capped.allSatisfy { !$0.isRemovedOnCompletion && $0.preferredFrameRateRange == CursorFrameRate.capped })
    XCTAssertEqual(plain[0].fillMode, .backwards)
    XCTAssertTrue(plain[0].isRemovedOnCompletion, "the uncapped animation is as the cursor drew before the cap")
    let layer = CALayer()
    CursorKeyframes.install(capped, on: layer, key: "glide")
    XCTAssertEqual(Set(layer.animationKeys() ?? []), ["glide", "glide#1"])
    CursorKeyframes.install(plain, on: layer, key: "glide")
    XCTAssertEqual(layer.animationKeys() ?? [], ["glide"], "a new motion replaces every run of the old one")
  }
}

/// The clock the cursor's motion signposts carry (Signposts.swift): host time as mach continuous ticks, what `log show`
/// stamps every signpost with, so the kit can count the window server's frames inside a glide.
final class ContinuousTicksTests: XCTestCase {
  func testHostTimeBecomesTheContinuousClockOfNow() {
    var timebase = mach_timebase_info()
    mach_timebase_info(&timebase)
    let before = mach_continuous_time()
    let ticks = continuousTicks(host: CACurrentMediaTime())
    let after = mach_continuous_time()
    let slack = UInt64(1_000_000 * Double(timebase.denom) / Double(timebase.numer))  // 1 ms
    XCTAssertGreaterThanOrEqual(ticks + slack, before)
    XCTAssertLessThanOrEqual(ticks, after + slack)
  }
}

/// The arrow's explicit shadow path (CursorPanel.swift): the fill and the outer half of its stroke, at a width scaled by
/// the stroke's opacity, so the shadow falls where the drawn arrow is, with nothing for the window server to find from
/// the layer's rendered alpha.
final class CursorArrowShadowPathTests: XCTestCase {
  @MainActor func testTheShadowPathCoversTheFillAndTheStrokesOuterHalfAndNothingBeyond() {
    assertShadow(strokeOpacity: 1, reach: 1)  // Increase Contrast: the whole stroke
    assertShadow(strokeOpacity: 0.8, reach: 0.8)  // the 80 % stroke: 0.8 pt out
  }

  @MainActor private func assertShadow(strokeOpacity: CGFloat, reach: CGFloat, file: StaticString = #filePath, line: UInt = #line) {
    let arrow = cursorArrowPath()
    let shadow = cursorArrowShadowPath(arrow, lineWidth: 2, strokeOpacity: strokeOpacity)
    let box = arrow.boundingBoxOfPath
    XCTAssertEqual(shadow.boundingBoxOfPath.insetBy(dx: reach, dy: reach).minX, box.minX, accuracy: 0.05, "the outline's reach", file: file, line: line)
    XCTAssertEqual(shadow.boundingBoxOfPath.insetBy(dx: reach, dy: reach).maxY, box.maxY, accuracy: 0.05, file: file, line: line)
    // Points on a grid over the arrow's box and 3 pt around it: inside the fill, inside the shadow; within 0.1 pt short
    // of the reach from the fill's edge, inside the shadow; more than 0.1 pt beyond it, outside.
    let fillOutline = arrow.copy(strokingWithWidth: 2 * (reach - 0.1), lineCap: .butt, lineJoin: .round, miterLimit: 10)
    let farOutline = arrow.copy(strokingWithWidth: 2 * (reach + 0.1), lineCap: .butt, lineJoin: .round, miterLimit: 10)
    var inside = 0, ring = 0, beyond = 0
    for x in stride(from: box.minX - 3, through: box.maxX + 3, by: 0.25) {
      for y in stride(from: box.minY - 3, through: box.maxY + 3, by: 0.25) {
        let p = CGPoint(x: x, y: y)
        if arrow.contains(p) {
          XCTAssertTrue(shadow.contains(p), "fill at \(p)", file: file, line: line); inside += 1
        } else if fillOutline.contains(p) {
          XCTAssertTrue(shadow.contains(p), "the stroke's outer half at \(p)", file: file, line: line); ring += 1
        } else if !farOutline.contains(p) {
          XCTAssertFalse(shadow.contains(p), "beyond the stroke at \(p)", file: file, line: line); beyond += 1
        }
      }
    }
    XCTAssertGreaterThan(inside, 100, file: file, line: line)
    XCTAssertGreaterThan(ring, 40, file: file, line: line)
    XCTAssertGreaterThan(beyond, 100, file: file, line: line)
  }
}
