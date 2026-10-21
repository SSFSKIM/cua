import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// M2a's remaining methods through their seams (the own native engine spec, Plan of Work M2a; the Decision Log's M2a
// vendor reading; R/F-helper-logic.md §16): the scroll into view, select_text's search and mapping, set_value's
// coercion, the field's focus, the secondary actions offered and performed, the menu-bar record and its rooted walk,
// scroll's delta and event, drag's five events, and route 3's activation sparing a middle click's target. A fake tree
// answers the Accessibility calls (AXOps); its handles are application handles for unused pids, so nothing reaches any
// process, and nothing is posted.

/// The Accessibility API over a fake tree of ids: roles, frames, parents, children, actions, attribute values and
/// their settability; writes and performs recorded, with hooks that change the tree (a scroll moving a frame).
final class FakeAX {
  var roles: [Int: String] = [:]
  var subroles: [Int: String] = [:]
  var frames: [Int: CGRect] = [:]
  var parents: [Int: Int] = [:]
  var children: [Int: [Int]] = [:]
  var actions: [Int: [String]] = [:]
  var values: [Int: [String: CFTypeRef]] = [:]
  var settable: [Int: Set<String>] = [:]
  var descriptions: [String: String] = [:]
  var writes: [(id: Int, attribute: String, value: CFTypeRef)] = []
  var performs: [(id: Int, action: String)] = []
  var onWrite: (Int, String, CFTypeRef) -> Void = { _, _, _ in }
  var onPerform: (Int, String) -> Void = { _, _ in }
  var clock: Double = 0
  var sleeps = 0

  static func id(_ element: AXUIElement) -> Int { Int(pid(of: element)) - 60_000 }

  var ops: AXOps {
    var ops = AXOps()
    ops.role = { self.roles[FakeAX.id($0)] }
    ops.subrole = { self.subroles[FakeAX.id($0)] }
    ops.frame = { self.frames[FakeAX.id($0)] }
    ops.parent = { self.parents[FakeAX.id($0)].map(Engine.element) }
    ops.children = { (self.children[FakeAX.id($0)] ?? []).map(Engine.element) }
    ops.actions = { self.actions[FakeAX.id($0)] ?? [] }
    ops.read = { self.values[FakeAX.id($0)]?[$1] }
    ops.element = { element, name in
      guard let value = self.values[FakeAX.id(element)]?[name], CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
      return (value as! AXUIElement)
    }
    ops.isSettable = { self.settable[FakeAX.id($0)]?.contains($1) ?? false }
    ops.write = { element, name, value in
      let id = FakeAX.id(element)
      self.writes.append((id, name, value))
      self.values[id, default: [:]][name] = value
      self.onWrite(id, name, value)
      return .success
    }
    ops.perform = { element, action in
      let id = FakeAX.id(element)
      self.performs.append((id, action))
      self.onPerform(id, action)
      return (self.actions[id] ?? []).contains(action) ? .success : .actionUnsupported
    }
    ops.describe = { _, action in self.descriptions[action] }
    ops.same = { FakeAX.id($0) == FakeAX.id($1) }
    ops.now = { self.clock }
    ops.sleep = { self.clock += $0; self.sleeps += 1 }
    return ops
  }
}

private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

// MARK: Scroll into view

final class PositioningTests: XCTestCase {
  /// A window (1) holding a scroll area (2) whose content (3) holds a row (4): the area shows y 100…300.
  private func list(rowAt y: CGFloat) -> FakeAX {
    let ax = FakeAX()
    ax.roles = [1: kAXWindowRole, 2: kAXScrollAreaRole, 3: "AXList", 4: kAXRowRole, 5: kAXScrollBarRole]
    ax.parents = [2: 1, 3: 2, 4: 3]
    ax.frames = [1: CGRect(x: 0, y: 0, width: 400, height: 400), 2: CGRect(x: 0, y: 100, width: 400, height: 200),
                 3: CGRect(x: 0, y: 100, width: 400, height: 1000), 4: CGRect(x: 0, y: y, width: 400, height: 20)]
    ax.values = [2: [kAXContentsAttribute: [el(3)] as CFArray, kAXVerticalScrollBarAttribute: el(5)]]
    return ax
  }

  func testAnElementWhoseMidpointShowsIsLeftAlone() {
    let ax = list(rowAt: 150)
    XCTAssertEqual(positionElement(el(4), ax: ax.ops), .visible)
    XCTAssertTrue(ax.writes.isEmpty)
    XCTAssertTrue(ax.performs.isEmpty)
  }

  func testTheElementsOwnScrollToVisibleIsPerformedThenPolledUntilItShows() {
    let ax = list(rowAt: 600)
    ax.actions = [4: ["AXPress", "AXScrollToVisible"]]
    ax.onPerform = { id, _ in if id == 4 { ax.frames[4] = CGRect(x: 0, y: 200, width: 400, height: 20) } }
    XCTAssertEqual(positionElement(el(4), ax: ax.ops), .scrolled)
    XCTAssertEqual(ax.performs.map(\.action), ["AXScrollToVisible"])
    XCTAssertTrue(ax.writes.isEmpty, "no bar is set when the element scrolls itself")
  }

  func testACellUsesItsSettableScrollToVisibleAttribute() {
    let ax = list(rowAt: 600)
    ax.roles[4] = kAXCellRole
    ax.settable = [4: ["AXScrollToVisible"]]
    ax.onWrite = { id, _, _ in if id == 4 { ax.frames[4] = CGRect(x: 0, y: 200, width: 400, height: 20) } }
    XCTAssertEqual(positionElement(el(4), ax: ax.ops), .scrolled)
    XCTAssertEqual(ax.writes.map(\.attribute), ["AXScrollToVisible"])
    XCTAssertTrue(CFEqual(ax.writes[0].value, kCFBooleanTrue))
  }

  func testAScrollAreaSetsItsBarToTheFractionThatShowsTheElement() throws {
    let ax = list(rowAt: 600)  // 500 points into a 1000-point list behind a 200-point view: 800 scrollable
    ax.settable = [5: [kAXValueAttribute]]
    ax.onWrite = { id, _, _ in if id == 5 { ax.frames[4] = CGRect(x: 0, y: 280, width: 400, height: 20) } }
    XCTAssertEqual(positionElement(el(4), ax: ax.ops), .scrolled)
    let write = try XCTUnwrap(ax.writes.first)
    XCTAssertEqual(write.id, 5)
    XCTAssertEqual((write.value as? NSNumber)?.doubleValue ?? -1, (520 - 200) / 800, accuracy: 1e-9, "the row's bottom at the view's bottom")
  }

  func testNothingScrollableIsLeftWithoutAPoll() {
    let ax = list(rowAt: 600)  // no action, not a cell, and the bar is not settable; AXMakeScreenRectVisible fails too
    var ops = ax.ops
    ops.write = { _, _, _ in .attributeUnsupported }
    XCTAssertEqual(positionElement(el(4), ax: ops), .unscrollable)
    XCTAssertEqual(ax.sleeps, 0, "no operation succeeded, so nothing is polled")
  }

  func testThePollsTimeoutIsSwallowedAtHalfASecond() {
    let ax = list(rowAt: 600)
    ax.actions = [4: ["AXScrollToVisible"]]  // performed, but the row never moves
    XCTAssertEqual(positionElement(el(4), ax: ax.ops), .stillHidden)
    XCTAssertGreaterThanOrEqual(ax.clock, positionPollTimeoutMs)
    XCTAssertLessThan(ax.clock, positionPollTimeoutMs + positionPollIntervalMs)
    XCTAssertEqual(ax.sleeps, 5, "every 0.1 s")
  }

  func testTheBarFraction() {
    let view = CGRect(x: 0, y: 100, width: 400, height: 200), content = CGRect(x: 0, y: 100, width: 400, height: 1000)
    XCTAssertNil(scrollBarFraction(showing: CGRect(x: 0, y: 150, width: 10, height: 20), viewport: view, content: content, axis: .vertical), "already shows")
    XCTAssertEqual(scrollBarFraction(showing: CGRect(x: 0, y: 600, width: 10, height: 20), viewport: view, content: content, axis: .vertical)!,
                   320.0 / 800, accuracy: 1e-9, "after the view: aligned to its end")
    let scrolled = CGRect(x: 0, y: -300, width: 400, height: 1000)  // 400 points down already
    XCTAssertEqual(scrollBarFraction(showing: CGRect(x: 0, y: 0, width: 10, height: 20), viewport: view, content: scrolled, axis: .vertical)!,
                   300.0 / 800, accuracy: 1e-9, "before the view: aligned to its start")
    XCTAssertEqual(scrollBarFraction(showing: CGRect(x: 0, y: 2000, width: 10, height: 20), viewport: view, content: content, axis: .vertical), 1, "clamped")
    XCTAssertNil(scrollBarFraction(showing: CGRect(x: 0, y: 600, width: 10, height: 20), viewport: view, content: view, axis: .vertical),
                 "content that does not scroll")
    XCTAssertEqual(scrollBarFraction(showing: CGRect(x: 900, y: 150, width: 50, height: 20), viewport: CGRect(x: 0, y: 100, width: 400, height: 200),
                                     content: CGRect(x: 0, y: 100, width: 1200, height: 200), axis: .horizontal)!, 550.0 / 800, accuracy: 1e-9)
  }
}

// MARK: select_text

final class TextSelectionTests: XCTestCase {
  private func styled(_ runs: [(String, String?)]) -> NSAttributedString {
    let result = NSMutableAttributedString()
    for (text, font) in runs {
      var attributes: [NSAttributedString.Key: Any] = [:]
      if let font { attributes[NSAttributedString.Key("AXFont")] = ["AXFontName": font] }
      result.append(NSAttributedString(string: text, attributes: attributes))
    }
    return result
  }

  func testTheMarkdownRenderingMapsEverySourceUnitAndNoSyntax() throws {
    let mapped = try XCTUnwrap(markdownMapped(styled([("Hello ", "Helvetica"), (" big ", "Helvetica-Bold"), ("end", nil)])))
    XCTAssertEqual(mapped.text, "Hello  **big** end")
    XCTAssertEqual(mapped.offsets, [0, 1, 2, 3, 4, 5, 6, nil, nil, 7, 8, 9, nil, nil, 10, 11, 12, 13])
    XCTAssertNil(markdownMapped(styled([("plain", "Helvetica")])), "no styling: the plain value says everything")
    XCTAssertEqual(markdownMapped(styled([("a", nil), ("x", "Menlo-Regular")]))?.text, "a`x`")
  }

  func testOnlyOneAdjacentlyBoundedMatchCounts() {
    XCTAssertEqual(uniqueMatch(of: "fox", in: "the quick fox", prefix: "", suffix: ""), NSRange(location: 10, length: 3))
    XCTAssertNil(uniqueMatch(of: "o", in: "foo", prefix: "", suffix: ""), "two occurrences")
    XCTAssertNil(uniqueMatch(of: "aa", in: "aaa", prefix: "", suffix: ""), "overlapping occurrences count")
    XCTAssertEqual(uniqueMatch(of: "o", in: "foo", prefix: "o", suffix: ""), NSRange(location: 2, length: 1), "the prefix immediately before")
    XCTAssertEqual(uniqueMatch(of: "o", in: "foo", prefix: "", suffix: "o"), NSRange(location: 1, length: 1), "the suffix immediately after")
    XCTAssertNil(uniqueMatch(of: "o", in: "foo", prefix: "f ", suffix: ""), "a prefix not adjacent")
    XCTAssertNil(uniqueMatch(of: "Fox", in: "the quick fox", prefix: "", suffix: ""), "case-sensitive")
    XCTAssertNil(uniqueMatch(of: "", in: "abc", prefix: "", suffix: ""))
    XCTAssertEqual(uniqueMatch(of: "b", in: "😀b", prefix: "😀", suffix: ""), NSRange(location: 2, length: 1), "UTF-16 offsets")
  }

  func testAMarkdownRangeMapsToTheSourceWithEdgeSyntaxSkippedInward() {
    let offsets: [Int?] = [0, 1, 2, 3, 4, 5, 6, nil, nil, 7, 8, 9, nil, nil, 10]
    XCTAssertEqual(sourceRange(NSRange(location: 7, length: 7), offsets: offsets), NSRange(location: 7, length: 3), "**big**")
    XCTAssertNil(sourceRange(NSRange(location: 7, length: 2), offsets: offsets), "syntax only")
    XCTAssertNil(sourceRange(NSRange(location: 14, length: 4), offsets: offsets), "outside the map")
    XCTAssertNil(sourceRange(NSRange(location: 3, length: 0), offsets: offsets))
  }

  func testTheMarkdownIsSearchedFirstAndAFailedLookupFallsToThePlainValue() {
    let markdown = (text: "say **hi** and hi", offsets: [0, 1, 2, 3, nil, nil, 4, 5, nil, nil, 6, 7, 8, 9, 10, 11, 12] as [Int?])
    XCTAssertEqual(textRange(of: "**hi**", prefix: "", suffix: "", markdown: markdown, plain: "say hi and hi"), NSRange(location: 4, length: 2))
    XCTAssertEqual(textRange(of: "hi", prefix: "and ", suffix: "", markdown: markdown, plain: "say hi and hi"), NSRange(location: 11, length: 2))
    XCTAssertEqual(textRange(of: "say hi", prefix: "", suffix: "", markdown: markdown, plain: "say hi and hi"), NSRange(location: 0, length: 6),
                   "not in the rendering, found in the plain value")
    XCTAssertNil(textRange(of: "hi", prefix: "", suffix: "", markdown: nil, plain: "say hi and hi"), "ambiguous in both")
    XCTAssertNil(textRange(of: "x", prefix: "", suffix: "", markdown: nil, plain: nil))
  }

  func testTheSelectionTypes() {
    let match = NSRange(location: 4, length: 9)
    XCTAssertEqual(TextSelectionType.text.selection(match).location, 4)
    XCTAssertEqual(TextSelectionType.text.selection(match).length, 9)
    XCTAssertEqual(TextSelectionType(rawValue: "cursor_before")?.selection(match).location, 4)
    XCTAssertEqual(TextSelectionType(rawValue: "cursor_before")?.selection(match).length, 0)
    XCTAssertEqual(TextSelectionType(rawValue: "cursor_after")?.selection(match).location, 13)
    XCTAssertEqual(TextSelectionType(rawValue: "cursor_after")?.selection(match).length, 0)
    XCTAssertNil(TextSelectionType(rawValue: "cursorAfter"), "the wire's snake case only")
  }

  func testThePlainValueIsAStringNeverABoolean() {
    XCTAssertEqual(plainText("abc" as CFString), "abc")
    XCTAssertEqual(plainText(NSAttributedString(string: "rich")), "rich")
    XCTAssertNil(plainText(kCFBooleanTrue))
    XCTAssertNil(plainText(NSNumber(value: 3)))
  }

  func testTheRefusalsAreTheVendorsSentences() {
    XCTAssertEqual(selectTextNotSettable.message, "Cannot select text for an element that does not support a settable selected text range")
    XCTAssertEqual(selectTextNotFound.message, "Could not find the requested text to select in the element")
    XCTAssertEqual(valueNotSettable.message, "Cannot set a value for an element that is not settable")
  }
}

// MARK: set_value's coercion and the field's focus

final class ValueSettingTests: XCTestCase {
  func testTheKindFollowsTheCurrentValue() {
    XCTAssertEqual(valueKind(of: NSNumber(value: 2.5), role: "AXSlider", subrole: nil), .float)
    XCTAssertEqual(valueKind(of: NSNumber(value: 3), role: "AXIncrementor", subrole: nil), .integer)
    XCTAssertEqual(valueKind(of: kCFBooleanFalse, role: "AXCheckBox", subrole: nil), .boolean)
    XCTAssertEqual(valueKind(of: NSNumber(value: 0), role: "AXCheckBox", subrole: "AXSwitch"), .boolean, "a switch is Boolean")
    XCTAssertEqual(valueKind(of: "x" as CFString, role: kAXTextFieldRole, subrole: nil), .string)
    XCTAssertEqual(valueKind(of: Date() as CFDate, role: "AXDateField", subrole: nil), .date)
    XCTAssertEqual(valueKind(of: nil, role: kAXTextAreaRole, subrole: nil), .string, "an empty text area")
    XCTAssertNil(valueKind(of: nil, role: kAXButtonRole, subrole: nil))
  }

  func testNumbersParseInEnUSAndARefusalNeverCarriesTheValue() throws {
    XCTAssertEqual((try coercedValue("1,234.5", to: .float) as? NSNumber)?.doubleValue, 1234.5)
    XCTAssertEqual((try coercedValue("3.7", to: .integer) as? NSNumber)?.doubleValue, 3.7, "no rounding")
    XCTAssertThrowsError(try coercedValue("hunter2", to: .integer)) { error in
      let refusal = error as? EngineError
      XCTAssertEqual(refusal?.errorName, "invalidNumber")
      XCTAssertFalse(refusal?.message.contains("hunter2") ?? true)
    }
  }

  func testBooleansAndTheRest() throws {
    for (given, expected) in [("on", true), ("OFF", false), ("yes", true), ("true", true), ("1", true), ("no", false), ("maybe", false)] {
      XCTAssertTrue(CFEqual(try coercedValue(given, to: .boolean), expected ? kCFBooleanTrue : kCFBooleanFalse), given)
    }
    XCTAssertEqual(try coercedValue("text", to: .string) as? String, "text")
    XCTAssertNotNil(try coercedValue("2026-10-21T12:00:00Z", to: .date) as? Date)
    XCTAssertThrowsError(try coercedValue("someday", to: .date))
    XCTAssertThrowsError(try coercedValue("x", to: nil)) { error in XCTAssertEqual((error as? EngineError)?.errorName, "unsupportedValueType") }
  }

  private func field(focused: Bool, focusable: Bool = true, role: String = kAXTextFieldRole) -> FakeAX {
    let ax = FakeAX()
    ax.roles = [1: role]
    ax.values = [1: [kAXFocusedAttribute: focused ? kCFBooleanTrue : kCFBooleanFalse]]
    if focusable { ax.settable = [1: [kAXFocusedAttribute]] }
    return ax
  }

  func testAFocusedOrNonTextElementIsLeftAlone() throws {
    var clicks = 0
    for ax in [field(focused: true), field(focused: false, role: kAXButtonRole), field(focused: false, focusable: false)] {
      XCTAssertFalse(try focusFieldIfNeeded(el(1), bundleIdentifier: nil, ax: ax.ops) { clicks += 1 })
      XCTAssertTrue(ax.writes.isEmpty)
    }
    XCTAssertEqual(clicks, 0)
  }

  func testFocusIsSetAndAClickFollowsOnlyWhenItDidNotTake() throws {
    var clicks = 0
    let takes = field(focused: false)
    XCTAssertFalse(try focusFieldIfNeeded(el(1), bundleIdentifier: nil, ax: takes.ops) { clicks += 1 })
    XCTAssertEqual(takes.writes.map(\.attribute), [kAXFocusedAttribute])
    XCTAssertEqual(clicks, 0)

    let refuses = field(focused: false)
    var ops = refuses.ops
    ops.write = { _, _, _ in .success }  // accepted, yet the field still reads unfocused
    XCTAssertTrue(try focusFieldIfNeeded(el(1), bundleIdentifier: nil, ax: ops) { clicks += 1 })
    XCTAssertEqual(clicks, 1)
  }

  // MARK: The focus fallback click's bookkeeping

  private func meta() -> InputMeta {
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    meta.inputRoute = .action
    return meta
  }

  /// A field holding a number that refuses focus, so set_value's focus falls back to a click: `clicked` stands for the
  /// click (route 3, its events posted), `acted` counts the app marked acted on.
  private func setValue(_ value: String, inFlight: @escaping () throws -> Void = {}, acted: inout Int, meta: inout InputMeta) throws -> FakeAX {
    let ax = field(focused: false)
    ax.values[1]?[kAXValueAttribute] = NSNumber(value: 3)
    ax.settable[1]?.insert(kAXValueAttribute)
    var ops = ax.ops
    let write = ops.write
    ops.write = { element, name, value in name == kAXFocusedAttribute ? .success : write(element, name, value) }  // focus never takes
    var marks = 0
    defer { acted = marks }
    try setElementValue(value, on: el(1), role: kAXTextFieldRole, ax: ops, meta: &meta,
                        focus: { meta in
                          try focusFieldIfNeeded(el(1), bundleIdentifier: nil, ax: ops) {
                            try focusingClick(&meta, acted: { marks += 1 }) { click in
                              click.inputRoute = .activation
                              click.activationGuardMs = 12
                              click.posting { true }
                            }
                          }
                        },
                        checkInFlight: inFlight, acted: { marks += 1 })
    return ax
  }

  func testAFocusClickThenARefusedCoercionStillReportsTheClickAndArmsTheSettle() {
    var meta = meta(), acted = 0
    XCTAssertThrowsError(try setValue("three", acted: &acted, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "invalidNumber")
    }
    XCTAssertNotNil(meta.startedAt, "the click's events were posted")
    XCTAssertNotNil(meta.endedAt, "and the interval ends at the click's last event")
    XCTAssertEqual(meta.activationGuardMs, 12)
    XCTAssertEqual(meta.inputRoute, .action, "the method's own route")
    XCTAssertEqual(acted, 1, "the click changed the app: its next observation settles first")
  }

  func testAFocusClickThenAnInterventionStillReportsTheClickAndArmsTheSettle() {
    var meta = meta(), acted = 0
    XCTAssertThrowsError(try setValue("4", inFlight: { throw EngineError(name: "userIntervened", "stopped") }, acted: &acted, meta: &meta))
    XCTAssertNotNil(meta.startedAt)
    XCTAssertNotNil(meta.endedAt)
    XCTAssertEqual(acted, 1)
  }

  func testAWriteAfterTheFocusClickExtendsTheIntervalAndMarksOnceMore() throws {
    var meta = meta(), acted = 0
    let ax = try setValue("4", acted: &acted, meta: &meta)
    XCTAssertEqual((ax.writes.last?.value as? NSNumber)?.intValue, 4)
    XCTAssertLessThanOrEqual(try XCTUnwrap(meta.startedAt), try XCTUnwrap(meta.endedAt))
    XCTAssertEqual(acted, 2, "the click's mark and the write's: the settle is armed either way")
  }

  func testAFocusClickThatPostsAndThenFailsStillArmsTheSettle() {
    var meta = meta(), marks = 0
    XCTAssertThrowsError(try focusingClick(&meta, acted: { marks += 1 }) { click in
      click.posting { true }
      throw EngineError(name: "foregroundRestoreFailed", "restore")   // route 4's restore, after the events
    })
    XCTAssertNotNil(meta.startedAt)
    XCTAssertEqual(marks, 1)

    var refused = self.meta()
    XCTAssertThrowsError(try focusingClick(&refused, acted: { marks += 1 }) { _ in throw EngineError(name: "activationFailed", "guard") })
    XCTAssertNil(refused.startedAt, "a click refused before its events posts nothing")
    XCTAssertEqual(marks, 1, "and changes nothing")
  }

  func testSafarisDOMElementsGoStraightToTheClick() throws {
    var clicks = 0
    let ax = field(focused: false)
    ax.values[1]?["AXDOMClassList"] = ["search"] as CFArray
    XCTAssertTrue(try focusFieldIfNeeded(el(1), bundleIdentifier: "com.apple.Safari", ax: ax.ops) { clicks += 1 })
    XCTAssertTrue(ax.writes.isEmpty)
    XCTAssertEqual(clicks, 1)
    let chrome = field(focused: false)
    chrome.values[1]?["AXDOMClassList"] = ["search"] as CFArray
    XCTAssertFalse(try focusFieldIfNeeded(el(1), bundleIdentifier: "com.google.Chrome", ax: chrome.ops) { clicks += 1 }, "focus is tried first elsewhere")
  }
}

// MARK: perform_secondary_action

final class SecondaryActionTests: XCTestCase {
  func testTheDescriptionsAreTheVendorsAndTheListIsUnfiltered() {
    let ax = FakeAX()
    ax.actions = [1: ["AXIncrement", "AXShowDefaultUI", "Name:Archive\ntarget: x", "AXOpen", "AXCustomThing"]]
    ax.descriptions = ["AXOpen": "열기"]
    ax.settable = [1: ["AXDisclosing"]]
    ax.values = [1: ["AXDisclosing": kCFBooleanFalse]]
    XCTAssertEqual(offeredActions(of: el(1), ax: ax.ops), [
      OfferedAction(name: "AXIncrement", description: "Increment"),
      OfferedAction(name: "AXShowDefaultUI", description: "Show Default UI"),  // filterActions would drop it; the vendor accepts it
      OfferedAction(name: "Name:Archive\ntarget: x", description: "Archive"),
      OfferedAction(name: "AXOpen", description: "열기"),
      OfferedAction(name: "AXCustomThing", description: "AXCustomThing"),
      OfferedAction(name: "SAIExpand", description: "Expand"),
    ])
    ax.values[1]?["AXDisclosing"] = kCFBooleanTrue
    XCTAssertEqual(offeredActions(of: el(1), ax: ax.ops).last, OfferedAction(name: "SAICollapse", description: "Collapse"))
    ax.settable = [:]
    XCTAssertFalse(offeredActions(of: el(1), ax: ax.ops).contains { $0.name.hasPrefix("SAI") }, "not disclosable: no pseudo-action")
  }

  func testThePseudoActionsToggleDisclosing() {
    let ax = FakeAX()
    ax.settable = [1: ["AXDisclosing"]]
    ax.values = [1: ["AXDisclosing": kCFBooleanFalse]]
    XCTAssertEqual(performOffered(OfferedAction(name: "SAIExpand", description: "Expand"), on: el(1), ax: ax.ops), .success)
    XCTAssertTrue(CFEqual(ax.values[1]?["AXDisclosing"], kCFBooleanTrue))
    _ = performOffered(OfferedAction(name: "SAICollapse", description: "Collapse"), on: el(1), ax: ax.ops)
    XCTAssertTrue(CFEqual(ax.values[1]?["AXDisclosing"], kCFBooleanFalse), "a toggle of what it reads")
    XCTAssertTrue(ax.performs.isEmpty, "no press of a disclosure triangle")
  }

  func testAPageScrollPressesTheBarsPageButtonFirst() {
    let ax = FakeAX()
    ax.actions = [1: ["AXScrollDownByPage"], 3: [kAXPressAction], 4: [kAXPressAction]]
    ax.values = [1: [kAXVerticalScrollBarAttribute: el(2)]]
    ax.children = [2: [3, 4]]
    ax.subroles = [3: kAXDecrementPageSubrole, 4: kAXIncrementPageSubrole]
    XCTAssertEqual(performOffered(OfferedAction(name: "AXScrollDownByPage", description: "Scroll Down"), on: el(1), ax: ax.ops), .success)
    XCTAssertEqual(ax.performs.map(\.id), [4])
    XCTAssertEqual(ax.performs.map(\.action), [kAXPressAction])

    let noBar = FakeAX()
    noBar.actions = [1: ["AXScrollDownByPage"]]
    XCTAssertEqual(performOffered(OfferedAction(name: "AXScrollDownByPage", description: "Scroll Down"), on: el(1), ax: noBar.ops), .success)
    XCTAssertEqual(noBar.performs.map(\.action), ["AXScrollDownByPage"], "the action itself when there is no page button")
  }

  func testTheRefusalNamesTheActionForTheServiceToFinish() {
    let refusal = invalidSecondaryAction("Frobnicate")
    XCTAssertEqual(refusal.errorName, "invalidSecondaryAction")
    XCTAssertEqual(refusal.message, "Frobnicate is not a valid secondary action for the element")
  }
}

// MARK: The menu-bar record

final class MenuRecordTests: XCTestCase {
  func testAMenuBarItemsMenuIsItsFirstDirectMenuChild() {
    let ax = FakeAX()
    ax.roles = [1: kAXMenuBarItemRole, 2: kAXStaticTextRole, 3: kAXMenuRole, 4: kAXMenuRole, 5: kAXMenuItemRole]
    ax.children = [1: [2, 3, 4], 5: [4]]
    XCTAssertEqual(menuOfMenuBarItem(el(1), ax: ax.ops).map(FakeAX.id), 3)
    XCTAssertNil(menuOfMenuBarItem(el(5), ax: ax.ops), "a menu item is not a menu-bar item")
    ax.children[1] = [2]
    XCTAssertNil(menuOfMenuBarItem(el(1), ax: ax.ops), "no menu: the ordinary click path")
  }

  func testARecordIsReplacedClearedAndDroppedWhenItsItemIsGone() {
    let connection = ConnectionState(id: 1, fd: -1)
    connection.recordMenu(el(1), app: "a")
    connection.recordMenu(el(2), app: "a")
    XCTAssertEqual(connection.menuRoot(app: "a", stillValid: { _ in true }).map(FakeAX.id), 2, "a new record replaces the old")
    XCTAssertNil(connection.menuRoot(app: "b", stillValid: { _ in true }))
    XCTAssertNil(connection.menuRoot(app: "a", stillValid: { _ in false }), "the item is gone")
    XCTAssertNil(connection.menuRecords["a"], "and the record with it")
    connection.recordMenu(el(1), app: "a")
    connection.clearMenuRecord(app: "a")
    XCTAssertNil(connection.menuRoot(app: "a", stillValid: { _ in true }))
  }

  func testAnObservationRootedAtTheItemWalksItsMenuKeepsItsTokenAndHasNoMenuBar() {
    let tree = FakeTree()
    tree.children = [0: [1], 90: [91], 91: [92, 93]]
    let lineage = Lineage()
    let first = walk(tree, lineage, menuBar: 89, menu: [88, 90])
    let item = first.menuBar.first { $0["title"] as? String == "node 90" }?["token"] as? String
    XCTAssertNotNil(item)

    let rooted = walk(tree, lineage, window: 90)
    XCTAssertEqual(rooted.nodes.map { $0["title"] as! String }, ["node 90", "node 91", "node 92", "node 93"])
    XCTAssertEqual(rooted.nodes.first?["token"] as? String, item, "the recorded item keeps its menu-bar token")
    XCTAssertEqual(rooted.nodes.map { $0["depth"] as! Int }, [0, 1, 2, 2])
    XCTAssertTrue(rooted.menuBar.isEmpty, "the bar is not walked while an item is recorded")
  }

  func testARefetchWalksTheRootTheObservationWalked() throws {
    let tree = FakeTree()
    tree.children = [90: [91], 91: [92]]
    let lineage = Lineage()
    let rooted = walk(tree, lineage, window: 90)
    lineage.current?.menuRoot = Engine.element(90)
    let token = try XCTUnwrap(rooted.nodes.last?["token"] as? String)
    var walkedFrom: [Int?] = []
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(tree) }, tree: { root in
      walkedFrom.append(root.map(tree.id))
      return (root, [])
    })
    tree.extra[92] = ["AXTitle": "renamed" as CFString]  // the stored identity no longer matches: a re-fetch runs
    XCTAssertThrowsError(try lineage.resolve(token, resolver: resolver))
    XCTAssertEqual(walkedFrom, [90], "the re-fetch walks the recorded item, not the window")
  }
}

// MARK: scroll and drag

final class ScrollAndDragTests: XCTestCase {
  func testTheDeltaIsPagesTimesTheLengthAtLeastAHundred() throws {
    XCTAssertEqual(try scrollDelta(pages: 1, length: 300), 300)
    XCTAssertEqual(try scrollDelta(pages: 2, length: 40), 200, "at least 100 points a page")
    XCTAssertEqual(try scrollDelta(pages: 1, length: nil), 100)
    XCTAssertEqual(try scrollDelta(pages: 0.005, length: 100), 1, "half away from zero")
    XCTAssertEqual(try scrollDelta(pages: 0.004, length: 100), 0, "no minimum of 1")
    XCTAssertThrowsError(try scrollDelta(pages: 1e12, length: 100))
  }

  func testTheWheelsAndTheirSigns() {
    XCTAssertTrue(scrollWheels(.up, delta: 5) == (1, 5, 0))
    XCTAssertTrue(scrollWheels(.down, delta: 5) == (1, -5, 0))
    XCTAssertTrue(scrollWheels(.left, delta: 5) == (2, 0, -5), "two wheels, so the horizontal delta is read")
    XCTAssertTrue(scrollWheels(.right, delta: 5) == (2, 0, 5))
  }

  func testTheScrollEventIsAimedAtItsWindow() throws {
    let target = ClickTarget(point: CGPoint(x: 300, y: 400), windowFrame: CGRect(x: 100, y: 100, width: 500, height: 500), windowID: 77, pid: 1)
    let event = try XCTUnwrap(scrollEvent(.right, delta: 120, at: target))
    XCTAssertEqual(event.type, .scrollWheel)
    XCTAssertEqual(event.location, CGPoint(x: 300, y: 400))
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventIsContinuous), 1, "pixel units")
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis2), 120)
    XCTAssertEqual(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1), 0)
    // The window's id in field 51; fields 91 and 92 are set as the vendor sets them, but CoreGraphics keeps them on mouse
    // events only and reads them back as 0 on a scroll-wheel event.
    XCTAssertEqual(event.getIntegerValueField(eventField(51)), 77)
  }

  func testADragIsTheVendorsFiveEventsAimedAtTheStartsWindow() throws {
    let window = ClickTarget(point: .zero, windowFrame: CGRect(x: 100, y: 100, width: 500, height: 500), windowID: 77, pid: 1)
    let events = dragEvents(from: CGPoint(x: 200, y: 200), to: CGPoint(x: 400, y: 300), window: window, flags: [])
    XCTAssertEqual(events.count, 5)
    let made = events.compactMap { NSEvent(cgEvent: $0) }
    XCTAssertEqual(made.map(\.type), [.leftMouseDown, .leftMouseDragged, .leftMouseDragged, .leftMouseDragged, .leftMouseUp])
    XCTAssertEqual(events.map(\.location), [CGPoint(x: 200, y: 200), CGPoint(x: 200, y: 200), CGPoint(x: 300, y: 250),
                                            CGPoint(x: 400, y: 300), CGPoint(x: 400, y: 300)])
    XCTAssertEqual(made.map(\.clickCount), [1, 0, 0, 0, 1])
    let numbers = made.map(\.eventNumber)
    XCTAssertEqual(Set([numbers[0], numbers[4]]).count, 1, "the down and the up share a number")
    XCTAssertEqual(Set(numbers[1...3]).count, 1)
    XCTAssertEqual(numbers[1], numbers[0] + 1, "the dragged events take the next")
    XCTAssertTrue(events.allSatisfy { $0.getIntegerValueField(eventField(91)) == 77 && $0.getIntegerValueField(eventField(92)) == 77 })
    XCTAssertTrue(events.allSatisfy { $0.flags.intersection(.maskCommand).isEmpty })
  }
}

// MARK: Route 3's activation and a middle click

final class ActivationSparingTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)
  /// A link high in the window, under the activation point (30, 16) relative to the frame.
  private let link = CGRect(x: 100, y: 70, width: 120, height: 14)

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func middleClick(activationPoint: CGPoint) throws -> [GuardPost] {
    let seam = GuardSeam(frontmost: user)
    seam.activationPoint = activationPoint
    let point = CGPoint(x: link.midX, y: link.midY)
    let activation = FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41,
                                    sparing: activationSparing(button: .middle, target: link), system: seam.system)
    var meta = meta()
    try deliverClick(ClickTarget(point: point, windowFrame: window, windowID: 41, pid: target), route: .activation, button: .middle, count: 1,
                     activation: activation, targetActive: { false }, post: seam.system.post, meta: &meta)
    return seam.posts
  }

  /// The coordinator's check (the Decision Log's M2a vendor reading, item 8): route 3's activation puts no left-button
  /// event at the element's point before a middle click; only the middle button's down and up land there.
  func testNoLeftButtonEventLandsOnTheElementBeforeAMiddleClick() throws {
    let posts = try middleClick(activationPoint: CGPoint(x: 110, y: 76))  // inside the link
    XCTAssertEqual(posts.map(\.kind), [.appKit(1), .mouse(.otherMouseDown), .mouse(.otherMouseUp), .appKit(2)])
    XCTAssertFalse(posts.contains { $0.kind == .mouse(.leftMouseDown) || $0.kind == .mouse(.leftMouseUp) })
  }

  func testAnActivationPointOutsideTheElementKeepsItsClickAwayFromIt() throws {
    let elsewhere = CGPoint(x: 600, y: 76)  // inside the window, outside the link
    let posts = try middleClick(activationPoint: elsewhere)
    XCTAssertEqual(posts.map(\.kind), [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp), .mouse(.otherMouseDown), .mouse(.otherMouseUp), .appKit(2)])
    let lefts = posts.filter { $0.kind == .mouse(.leftMouseDown) || $0.kind == .mouse(.leftMouseUp) }
    XCTAssertTrue(lefts.allSatisfy { $0.location == elsewhere && !link.contains($0.location!) }, "the activation's left events land away from the link")
    XCTAssertTrue(posts.filter { $0.kind == .mouse(.otherMouseDown) }.allSatisfy { link.contains($0.location!) })
  }

  func testOnlyAClickWithAnotherButtonThanTheLeftSparesItsTarget() {
    XCTAssertNil(activationSparing(button: .left, target: link))
    XCTAssertEqual(activationSparing(button: .middle, target: link), link)
    XCTAssertEqual(activationSparing(button: .right, target: link), link)
    XCTAssertNil(activationClickPoint(CGPoint(x: 110, y: 76), windowFrame: window, sparing: link))
    XCTAssertEqual(activationClickPoint(CGPoint(x: 110, y: 76), windowFrame: window, sparing: nil), CGPoint(x: 110, y: 76))
    XCTAssertEqual(pointArea(CGPoint(x: 10, y: 10), hitFrame: nil), CGRect(x: 9.5, y: 9.5, width: 1, height: 1), "a coordinate with no element spares its point")
  }
}

// MARK: The menu activation switch

final class MenuActivationTests: XCTestCase {
  private let target: pid_t = 990_001, user: pid_t = 990_002
  private let window = CGRect(x: 80, y: 60, width: 610, height: 860)

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func activation(_ seam: GuardSeam) -> FakeActivation {
    seam.activationPoint = CGPoint(x: 300, y: 70)  // the title bar, inside the frame
    return FakeActivation(pid: target, window: AXUIElementCreateApplication(target), windowFrame: window, windowID: 41, system: seam.system)
  }

  func testThePressRunsBetweenTheActivationAndTheDeactivationAndStaysRouteOne() throws {
    let seam = GuardSeam(frontmost: user)
    var meta = meta()
    var postsAtPress: [GuardPost.Kind] = []
    try deliverActivatedAction("AXPress", activation: activation(seam), perform: { action in
      XCTAssertEqual(action, "AXPress")
      postsAtPress = seam.posts.map(\.kind)
      return .success
    }, meta: &meta)
    XCTAssertEqual(postsAtPress, [.appKit(1), .mouse(.leftMouseDown), .mouse(.leftMouseUp)], "activated, its click at the activation point")
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2), "deactivated after the press")
    XCTAssertEqual(meta.inputRoute, .action)
    XCTAssertNotNil(meta.activationGuardMs)
    XCTAssertNotNil(meta.startedAt)
  }

  func testAGuardFailurePressesNothing() {
    let seam = GuardSeam(frontmost: user, frontmostAfterPost: target)  // the app came to the front
    var meta = meta(), presses = 0
    XCTAssertThrowsError(try deliverActivatedAction("AXPress", activation: activation(seam), perform: { _ in presses += 1; return .success }, meta: &meta)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "activationFailed")
    }
    XCTAssertEqual(presses, 0)
    XCTAssertNil(meta.startedAt, "nothing was pressed")
    XCTAssertEqual(meta.inputRoute, .action)
  }

  func testAnInterventionDuringTheActivationPressesNothingAndStillDeactivates() {
    let seam = GuardSeam(frontmost: user)
    var meta = meta(), presses = 0
    XCTAssertThrowsError(try deliverActivatedAction("AXPress", activation: activation(seam),
                                                    beforePressing: { throw EngineError(name: "userIntervened", "stopped") },
                                                    perform: { _ in presses += 1; return .success }, meta: &meta))
    XCTAssertEqual(presses, 0)
    XCTAssertEqual(seam.posts.map(\.kind).last, .appKit(2))
  }

  func testOnlyAMenuItemsPressIsActivatedAndOnlyUnderTheSwitch() {
    XCTAssertTrue(activatesPress(switchedOn: true, role: kAXMenuItemRole))
    XCTAssertFalse(activatesPress(switchedOn: true, role: kAXButtonRole), "an ordinary route-1 click activates nothing")
    XCTAssertFalse(activatesPress(switchedOn: true, role: kAXMenuBarItemRole))
    XCTAssertFalse(activatesPress(switchedOn: false, role: kAXMenuItemRole))
  }

  func testTheSwitchIsOffByDefault() {
    XCTAssertFalse(spikeMenuActivationArg([:]))
    XCTAssertFalse(spikeMenuActivationArg(["spikeMenuActivation": false]))
    XCTAssertFalse(spikeMenuActivationArg(["spikeMenuActivation": "true"]), "only a JSON true turns it on")
    XCTAssertTrue(spikeMenuActivationArg(["spikeMenuActivation": true]))
  }
}

// MARK: The methods answer

final class RemainingMethodsTests: XCTestCase {
  private func execute(_ method: String, _ args: [String: Any], lineage: String? = nil) -> Result<Any, EngineError> {
    let engine = Engine(paths: ServerPaths(socket: "/tmp/x.sock", directory: "/tmp", lock: "/tmp/x.lock", usage: "/tmp/cua-engine-test-usage.json"),
                        intervention: InterventionMonitor(listenGranted: { false }), screenLocked: { false })
    var params: [String: Any] = ["method": method, "args": args, "deadlineUnixMilliseconds": unixMilliseconds() + 60_000]
    if let lineage { params["lineage"] = lineage }
    return engine.handle(Request(id: 1, method: "execute", params: params), on: ConnectionState(id: 1, fd: -1), receivedAt: unixMilliseconds()).result
  }

  private func errorName(_ result: Result<Any, EngineError>) -> String? {
    if case .failure(let error) = result { return error.errorName }
    return nil
  }

  /// Each method is dispatched (the build before M2a.2 answered notImplemented for all five) and refuses bad arguments
  /// before anything is resolved.
  func testArgumentsAreCheckedBeforeAnythingIsResolved() {
    XCTAssertEqual(errorName(execute("set_value", ["element": "t1"], lineage: "L1")), "invalidArguments", "no value")
    XCTAssertEqual(errorName(execute("set_value", ["value": "v"])), "invalidArguments", "no element")
    XCTAssertEqual(errorName(execute("set_value", ["value": "v", "element_index": 3])), "invalidArguments", "the facade's index")
    XCTAssertEqual(errorName(execute("select_text", ["text": "t", "selection_type": "cursorAfter", "element": "t1"], lineage: "L1")), "invalidArguments")
    XCTAssertEqual(errorName(execute("perform_secondary_action", ["element": "t1"], lineage: "L1")), "invalidArguments", "no action")
    XCTAssertEqual(errorName(execute("scroll", ["direction": "sideways"])), "invalidArguments")
    XCTAssertEqual(errorName(execute("scroll", ["direction": "up", "pages": 0])), "invalidScrollPages")
    XCTAssertEqual(errorName(execute("scroll", ["direction": "up", "pages": -1])), "invalidScrollPages")
    XCTAssertEqual(errorName(execute("scroll", ["direction": "up", "element": "t1", "x": 1, "y": 2], lineage: "L1")), "invalidArguments")
    XCTAssertEqual(errorName(execute("drag", ["from_x": 1, "from_y": 1, "to_x": 2])), "invalidArguments")
  }
}
