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
