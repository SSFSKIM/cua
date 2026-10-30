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
