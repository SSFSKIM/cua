import ApplicationServices
import XCTest
@testable import Engine

// The vendor's per-element derivations (Derivations.swift; FUN_10074cb90 and its helpers) and the header's title rule
// (ApplicationWindow.title 0x10076e174), as pure functions over synthetic values.

final class DerivationTests: XCTestCase {
  func testTheValueTypeIsTheCFNumbersOwnAndTheVendorsSixNames() {
    XCTAssertEqual(valueTypeName(of: 0.0 as CFNumber, role: "AXRulerMarker", subrole: nil), "float", "an integral float stays float")
    XCTAssertEqual(valueTypeName(of: 177.5 as CFNumber, role: "AXSplitter", subrole: nil), "float")
    XCTAssertEqual(valueTypeName(of: 3 as CFNumber, role: "AXSlider", subrole: nil), "integer")
    XCTAssertEqual(valueTypeName(of: kCFBooleanTrue, role: "AXRadioButton", subrole: "AXTabButton"), "boolean")
    XCTAssertEqual(valueTypeName(of: "a" as CFString, role: "AXTextField", subrole: nil), "string")
    XCTAssertEqual(valueTypeName(of: CFDateCreate(nil, 0), role: "AXDateField", subrole: nil), "date")
    var point = CGPoint(x: 1, y: 2)
    XCTAssertEqual(valueTypeName(of: AXValueCreate(.cgPoint, &point)!, role: "AXGroup", subrole: nil), "unknown")
    XCTAssertEqual(valueTypeName(of: 1 as CFNumber, role: "AXCheckBox", subrole: "AXSwitch"), "boolean", "a switch is boolean whatever its value")
    XCTAssertEqual(valueTypeName(of: 1 as CFNumber, role: "AXCheckBox", subrole: "AXToggle"), "boolean")
    XCTAssertEqual(valueTypeName(of: 1 as CFNumber, role: "AXCheckBox", subrole: nil), "integer", "a plain checkbox's number is an integer")
  }

  func testOutsideChromiumEveryValuesSettabilityIsRead() {
    for role in ["AXGroup", "AXButton", "AXScrollBar", "AXTextField"] {
      XCTAssertTrue(readsValueSettability(role: role, subrole: nil, parentRole: nil, chromium: false), role)
    }
  }

  func testInAChromiumWindowOnlyTheVendorsRolesAndTabsReadTheirSettability() {
    for role in ["AXTextField", "AXTextArea", "AXComboBox", "AXIncrementor"] {
      XCTAssertTrue(readsValueSettability(role: role, subrole: nil, parentRole: "AXGroup", chromium: true), role)
    }
    for role in ["AXGroup", "AXButton", "AXCheckBox", "AXLink", "AXStaticText", "AXScrollBar", "AXPopUpButton", "AXList"] {
      XCTAssertFalse(readsValueSettability(role: role, subrole: nil, parentRole: nil, chromium: true), role)
    }
    XCTAssertTrue(readsValueSettability(role: "AXRadioButton", subrole: "AXTabButton", parentRole: nil, chromium: true), "a tab")
    XCTAssertFalse(readsValueSettability(role: "AXRadioButton", subrole: nil, parentRole: nil, chromium: true), "a plain radio button")
    for container in ["AXDateField", "AXDateTimeArea", "AXTimeField"] {
      XCTAssertFalse(readsValueSettability(role: "AXIncrementor", subrole: nil, parentRole: container, chromium: true), container)
    }
    XCTAssertTrue(readsValueSettability(role: "AXIncrementor", subrole: nil, parentRole: nil, chromium: true))
  }

  func testSelectedIsAXSelectedElseTheSelectedTrait() {
    XCTAssertTrue(isSelected(selected: true, traits: 0))
    XCTAssertFalse(isSelected(selected: false, traits: selectedTrait), "AXSelected, when carried, decides")
    XCTAssertTrue(isSelected(selected: nil, traits: selectedTrait | 1))
    XCTAssertFalse(isSelected(selected: nil, traits: 1))
    XCTAssertFalse(isSelected(selected: nil, traits: nil))
  }

  /// FUN_1007816a0 asks the system only when the fixed table (FUN_100783260, the statics at 0x1014033e8) and the
  /// custom action's `Name:` (FUN_100783928) give nothing.
  func testTheSystemIsAskedOnlyForActionsTheTableAndNameLeaveUndescribed() {
    for action in ["AXPress", "AXPick", "AXIncrement", "AXDecrement", "AXConfirm", "AXCancel", "AXShowDefaultUI", "AXShowAlternateUI",
                   "AXRaise", "AXShowMenu", "AXScrollToVisible", "AXScrollLeftByPage", "AXScrollRightByPage", "AXScrollUpByPage",
                   "AXScrollDownByPage", "AXDelete", "SAIExpand", "SAICollapse"] {
      XCTAssertFalse(asksSystemForDescription(action), action)
    }
    XCTAssertEqual(vendorActionWordNames.count, 18)
    XCTAssertFalse(asksSystemForDescription("Name:Share\nTarget:0x0\nSelector:(null)"))
    XCTAssertTrue(asksSystemForDescription("AXZoomWindow"))
    XCTAssertTrue(asksSystemForDescription("AXOpen"))
    XCTAssertTrue(asksSystemForDescription("Name:\n"), "a Name: with nothing before the newline gives no name")
  }

  /// FUN_100783928: `Name:` scanned off, then up to the newline, with NSScanner's default skipping of leading
  /// whitespace and newlines.
  func testACustomActionsNameIsTheTextAfterNameUpToTheNewline() {
    XCTAssertEqual(customActionName("Name:Share\nTarget:0x0"), "Share")
    XCTAssertEqual(customActionName("Name: Add tag\nTarget:0x0"), "Add tag")
    XCTAssertEqual(customActionName("Name:Tags"), "Tags")
    XCTAssertNil(customActionName("Name:"))
    XCTAssertNil(customActionName("Name:\n"))
    XCTAssertNil(customActionName("AXPress"))
    XCTAssertNil(customActionName("name:Share"))
  }

  func testMenuAndMenuBarItemsAreNeverSelectable() {
    XCTAssertFalse(selectableRole("AXMenuItem"))
    XCTAssertFalse(selectableRole("AXMenuBarItem"))
    XCTAssertTrue(selectableRole("AXRow"))
  }

  func testAWindowWithoutAURLTakesItsDocument() {
    var asked = 0
    let document = { () -> String? in asked += 1; return "file:///tmp/a.rtf" }
    XCTAssertEqual(nodeURL(role: "AXWindow", url: nil, document: document), "file:///tmp/a.rtf")
    XCTAssertEqual(nodeURL(role: "AXWindow", url: "http://127.0.0.1:9/", document: document), "http://127.0.0.1:9/", "AXURL wins")
    XCTAssertNil(nodeURL(role: "AXGroup", url: nil, document: document), "only a window takes its document")
    XCTAssertEqual(asked, 1, "the document is read only when it is used")
    XCTAssertNil(nodeURL(role: "AXWindow", url: nil, document: { nil }))
    XCTAssertNil(nodeURL(role: "AXWindow", url: nil, document: { "" }), "a document that parses as no URL is none")
    XCTAssertEqual(nodeURL(role: "AXWindow", url: nil, document: { "file:///tmp/a b.rtf" }), "file:///tmp/a%20b.rtf", "the parsed URL's text")
  }

  func testTheHeaderTitleIsTheWindowServersNameElseTheAXTitle() {
    XCTAssertEqual(headerTitle(windowName: "cua scene page", axTitle: "cua scene page - Chrome for Testing", desktopLevel: false, ownerIsFinder: false),
                   "cua scene page", "the window server's name wins")
    XCTAssertEqual(headerTitle(windowName: nil, axTitle: "cua-scene.rtf", desktopLevel: false, ownerIsFinder: false), "cua-scene.rtf",
                   "no name (no Screen Recording grant): the AX title")
    XCTAssertNil(headerTitle(windowName: nil, axTitle: nil, desktopLevel: false, ownerIsFinder: false), "neither: none, printed Unknown")
    XCTAssertEqual(headerTitle(windowName: "", axTitle: "ignored", desktopLevel: false, ownerIsFinder: false), "",
                   "an empty name is the title; the AX title is read only when there is no name")
    XCTAssertEqual(headerTitle(windowName: "", axTitle: nil, desktopLevel: true, ownerIsFinder: true), "Desktop")
    XCTAssertEqual(headerTitle(windowName: nil, axTitle: nil, desktopLevel: true, ownerIsFinder: true), "Desktop")
    XCTAssertEqual(headerTitle(windowName: "", axTitle: nil, desktopLevel: true, ownerIsFinder: false), "")
    XCTAssertEqual(headerTitle(windowName: "Docs", axTitle: nil, desktopLevel: true, ownerIsFinder: true), "Docs")
  }
}
