import XCTest
@testable import Engine

// The cursor's colours (Cursor/CursorPalette.swift; the spec's Design, "Lifecycle and identity"): eight hues, the pill's
// shade of each giving its white 11 pt text at least 4.5:1 (WCAG AA for small text), the arrow keeping the hue.

final class CursorPaletteTests: XCTestCase {
  func testThePaletteIsTheSpecsEightHuesInOrder() {
    XCTAssertEqual(cursorPalette.map(\.hex), ["#c9663f", "#2f6feb", "#1f883d", "#8250df", "#0f8b8d", "#bf8700", "#cf3a7f", "#57606a"])
  }

  func testEveryPillShadeGivesWhiteTextAtLeastFourAndAHalfToOne() {
    for hue in cursorPalette {
      let shade = pillShade(of: hue)
      XCTAssertGreaterThanOrEqual(contrastRatio(RGB.white, shade), 4.5, hue.hex)
    }
  }

  func testAHueThatAlreadyPassesKeepsItselfAndClayAndAmberAreDarkened() {
    for hue in cursorPalette where contrastRatio(RGB.white, hue) >= 4.5 {
      XCTAssertEqual(pillShade(of: hue), hue, hue.hex)
    }
    let clay = cursorPalette[0], amber = cursorPalette[5]
    XCTAssertLessThan(contrastRatio(RGB.white, clay), 4.5)
    XCTAssertLessThan(contrastRatio(RGB.white, amber), 4.5)
    XCTAssertNotEqual(pillShade(of: clay), clay)
    XCTAssertNotEqual(pillShade(of: amber), amber)
    XCTAssertLessThan(contrastRatio(RGB.white, pillShade(of: amber)), 4.7, "darkened no further than it needs")
  }

  func testTheContrastRatioIsWCAGs() {
    XCTAssertEqual(contrastRatio(RGB.white, RGB(red: 0, green: 0, blue: 0)), 21, accuracy: 1e-9)
    XCTAssertEqual(contrastRatio(RGB.white, RGB.white), 1, accuracy: 1e-9)
    XCTAssertEqual(contrastRatio(RGB.white, RGB(hex: "#767676")!), 4.54, accuracy: 0.01)
  }

  func testThePlaceholderIdentityIsStablePerConnection() {
    XCTAssertEqual(placeholderIdentity(connection: 3).color, placeholderIdentity(connection: 3).color)
    XCTAssertNotEqual(placeholderIdentity(connection: 3).color, placeholderIdentity(connection: 4).color)
    XCTAssertEqual(placeholderIdentity(connection: 3).label, "Agent 3")
  }

  func testALabelIsCutAtTwentyFourCharactersWithAnEllipsis() {
    XCTAssertEqual(cursorLabel("Research"), "Research")
    XCTAssertEqual(cursorLabel(String(repeating: "a", count: 30)), String(repeating: "a", count: 23) + "…")
    XCTAssertEqual(cursorLabel(String(repeating: "a", count: 30)).count, 24)
  }
}
