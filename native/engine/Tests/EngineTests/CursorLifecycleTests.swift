import CoreGraphics
import XCTest
@testable import Engine

// The cursor's states (Cursor/CursorLifecycle.swift; the spec's Design, "What the person sees", the state table, and
// "Motion", keyboard-only actions): pure transitions over an explicit clock.

final class CursorLifecycleTests: XCTestCase {
  private let textEdit = "/System/Applications/TextEdit.app#501"
  private let point = CursorPoint(global: CGPoint(x: 400, y: 300), window: 77)

  /// One click request at `at`: begin, the action (its motion settling `motion` seconds later), end.
  private func click(_ life: inout CursorLifecycle, at t: Double, motion: Double = 0.5) {
    life.begin(app: textEdit, keyboardOnly: false, now: t)
    _ = life.acted(app: textEdit, at: point, settlesAt: t + motion, now: t)
    life.end(now: t + 0.01)
  }

  func testAnActionTakesTheCursorFromHiddenThroughActingThinkingAndFadingBackToHidden() {
    var life = CursorLifecycle()
    XCTAssertEqual(life.phase, .hidden)
    life.begin(app: textEdit, keyboardOnly: false, now: 0)
    XCTAssertTrue(life.acted(app: textEdit, at: point, settlesAt: 0.5, now: 0), "shown from hidden: it fades in at the target")
    XCTAssertEqual(life.phase, .acting)
    life.end(now: 0.01)
    XCTAssertEqual(life.nextDeadline, 0.5)
    life.tick(now: 0.5)
    XCTAssertEqual(life.phase, .thinking)
    XCTAssertEqual(life.nextDeadline, 5.01, "five seconds after the request ended")
    life.tick(now: 5.0)
    XCTAssertEqual(life.phase, .thinking)
    life.tick(now: 5.01)
    XCTAssertEqual(life.phase, .fading)
    XCTAssertEqual(life.nextDeadline!, 5.45, accuracy: 1e-9, "the 0.44 s fade")
    life.tick(now: 5.45)
    XCTAssertEqual(life.phase, .hidden)
    XCTAssertNil(life.nextDeadline, "nothing pending while hidden")
  }

  func testThePersonTakingOverMakesItHalfTransparentUntilTheNextRequest() {
    var life = CursorLifecycle()
    click(&life, at: 0)
    life.tick(now: 0.5)
    life.userActed(now: 1)
    XCTAssertEqual(life.phase, .takenOver)
    life.begin(app: textEdit, keyboardOnly: false, now: 2)  // a request of any kind
    XCTAssertEqual(life.phase, .acting)
    life.end(now: 2.1)
    life.tick(now: 2.1)
    XCTAssertEqual(life.phase, .thinking)
  }

  func testTakenOverFadesAfterFiveIdleSeconds() {
    var life = CursorLifecycle()
    click(&life, at: 0)
    life.tick(now: 0.5)
    life.userActed(now: 1)
    life.tick(now: 5.01)
    XCTAssertEqual(life.phase, .fading)
  }

  func testAnyStateGoesToActingOnAnAction() {
    for setup in [0, 1, 2, 3] {
      var life = CursorLifecycle()
      click(&life, at: 0)
      switch setup {
      case 0: break                                   // acting
      case 1: life.tick(now: 0.5)                     // thinking
      case 2: life.tick(now: 0.5); life.userActed(now: 1)  // taken over
      default: life.tick(now: 5.01)                   // fading
      }
      life.begin(app: textEdit, keyboardOnly: false, now: 5.2)
      XCTAssertFalse(life.acted(app: textEdit, at: point, settlesAt: 6, now: 5.2), "visible: it glides from where it is (case \(setup))")
      XCTAssertEqual(life.phase, .acting, "case \(setup)")
    }
  }

  func testNoFadeWhileARequestIsInFlight() {
    var life = CursorLifecycle()
    click(&life, at: 0)
    life.tick(now: 0.5)
    life.begin(app: textEdit, keyboardOnly: true, now: 1)  // a long type_text
    for t in stride(from: 1.0, through: 20, by: 0.5) { life.tick(now: t) }
    XCTAssertEqual(life.phase, .thinking, "still visible after 19 s of typing")
    life.end(now: 20)
    XCTAssertEqual(life.nextDeadline, 25)
    life.tick(now: 25)
    XCTAssertEqual(life.phase, .fading)
  }

  func testAKeyboardRequestAfterAFadeReturnsTheCursorAtItsLastPointInThatApp() {
    var life = CursorLifecycle()
    click(&life, at: 0)
    life.tick(now: 0.5)
    life.tick(now: 5.01)
    life.tick(now: 5.45)
    XCTAssertEqual(life.phase, .hidden)
    XCTAssertEqual(life.begin(app: "/Applications/Other.app#9", keyboardOnly: true, now: 6), .none, "no last point there: it stays hidden")
    XCTAssertEqual(life.phase, .hidden)
    life.end(now: 6.1)
    XCTAssertEqual(life.begin(app: textEdit, keyboardOnly: true, now: 7), .reappear(point))
    XCTAssertNotEqual(life.phase, .hidden)
    life.tick(now: 7)
    XCTAssertEqual(life.phase, .thinking)
  }

  func testAKeyboardRequestClearsTakenOver() {
    var life = CursorLifecycle()
    click(&life, at: 0)
    life.tick(now: 0.5)
    life.userActed(now: 1)
    XCTAssertEqual(life.begin(app: textEdit, keyboardOnly: true, now: 2), .none, "visible already: nothing to bring back")
    XCTAssertNotEqual(life.phase, .takenOver)
  }

  func testANonKeyboardRequestCancelsAFadeButDoesNotBringAHiddenCursorBack() {
    var life = CursorLifecycle()
    click(&life, at: 0)
    life.tick(now: 5.01)
    XCTAssertEqual(life.phase, .fading)
    life.begin(app: textEdit, keyboardOnly: false, now: 5.2)  // a get_app_state
    XCTAssertEqual(life.phase, .thinking, "faded back in from where it was")
    life.end(now: 5.3)
    life.tick(now: 10.3)
    life.tick(now: 10.74)
    XCTAssertEqual(life.phase, .hidden)
    XCTAssertEqual(life.begin(app: textEdit, keyboardOnly: false, now: 11), .none)
    XCTAssertEqual(life.phase, .hidden)
  }

  func testAHideFadesAtOnceAndTheNextActionShowsItAgain() {
    var life = CursorLifecycle()
    click(&life, at: 0)
    life.hide(now: 1)
    XCTAssertEqual(life.phase, .fading)
    life.tick(now: 1.44)
    XCTAssertEqual(life.phase, .hidden)
    life.begin(app: textEdit, keyboardOnly: false, now: 2)
    XCTAssertTrue(life.acted(app: textEdit, at: point, settlesAt: 2.5, now: 2))
  }

  func testThePersonActingWhileHiddenChangesNothing() {
    var life = CursorLifecycle()
    life.userActed(now: 1)
    XCTAssertEqual(life.phase, .hidden)
  }
}
