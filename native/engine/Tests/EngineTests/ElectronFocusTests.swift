import XCTest
@testable import Engine

/// #527: the observation's focused element. The application's AXFocusedUIElement when it names one; else, for an Electron
/// app only, the window's first web area, breadth first, that holds a selection (the vendor's skyshot tree builder
/// FUN_10022cb30, 0x10022cf0c–0x10022cf80: `descendant(ofType: WebAreaUIElement.self, passingTest:)` 0x10079fbc0 with the test
/// FUN_10022e0c0, `selectedTextRange.length > 0 || selectedTextMarkerRange != nil`).
final class ElectronFocusTests: XCTestCase {
  private final class Node {
    let role: String
    var children: [Node]
    let selected: Bool
    init(_ role: String, selected: Bool = false, _ children: [Node] = []) { (self.role, self.selected, self.children) = (role, selected, children) }
  }

  /// The Electron fixture's shape (M5 pilot B, run 45226949355): window, group, group, web area, group, then the page's
  /// text entry area, list and button.
  private func fixture(webAreaSelected: Bool = true) -> (window: Node, webArea: Node, textEntry: Node) {
    let textEntry = Node("AXTextArea")
    let webArea = Node("AXWebArea", selected: webAreaSelected, [Node("AXGroup", [textEntry, Node("AXList"), Node("AXButton")])])
    let window = Node("AXWindow", [Node("AXGroup", [Node("AXGroup", [webArea])]), Node("AXButton"), Node("AXButton")])
    return (window, webArea, textEntry)
  }

  /// The search, and the roles of the elements it read, in order.
  private func searched(_ window: Node, limit: Int = 1_000) -> (found: Node?, visited: [String]) {
    var visited: [String] = []
    let found = electronWebAreaFocus(under: window, children: { $0.children }, role: { visited.append($0.role); return $0.role },
                                     hasSelection: { $0.selected }, limit: limit)
    return (found, visited)
  }

  private func search(_ window: Node, limit: Int = 1_000) -> Node? { searched(window, limit: limit).found }

  // ---- Which app falls back ----

  func testOnlyElectronsPrincipalClassFallsBack() {
    XCTAssertTrue(electronApp(info: ["NSPrincipalClass": "AtomApplication"]))
    XCTAssertFalse(electronApp(info: ["NSPrincipalClass": "BrowserCrApplication"]), "Chrome is web-shaped, not Electron")
    XCTAssertFalse(electronApp(info: ["NSPrincipalClass": "NSApplication"]))
    XCTAssertFalse(electronApp(info: ["CFBundleURLTypes": [["CFBundleURLSchemes": ["http"]]]]), "a browser by URL scheme is not Electron")
    XCTAssertFalse(electronApp(info: [:]))
  }

  // ---- The application's focus first, the web area only when it names none ----

  func testAKeyWindowsFocusedElementIsKept() {
    let tree = fixture()
    var searched = false
    let focus = observedFocus(application: tree.textEntry, electron: true, webArea: { searched = true; return tree.webArea })
    XCTAssertTrue(focus.element === tree.textEntry)
    XCTAssertFalse(focus.fallback)
    XCTAssertFalse(searched, "an app that names its focus is never searched")
  }

  func testWithNoKeyWindowElectronsWebAreaIsTheFocus() {
    let tree = fixture()
    let focus = observedFocus(application: nil, electron: true, webArea: { self.search(tree.window) })
    XCTAssertTrue(focus.element === tree.webArea)
    XCTAssertTrue(focus.fallback)
  }

  func testANativeAppOrChromeWithNoFocusNamesNone() {
    let tree = fixture()
    var searched = false
    let focus = observedFocus(application: nil as Node?, electron: false, webArea: { searched = true; return tree.webArea })
    XCTAssertNil(focus.element)
    XCTAssertFalse(searched)
  }

  // ---- The search ----

  func testAWebAreaWithNoSelectionIsPassedOver() {
    XCTAssertNil(search(fixture(webAreaSelected: false).window))
  }

  func testTheSearchIsBreadthFirstFromTheWindowsChildren() throws {
    let shallow = Node("AXWebArea", selected: true)
    let deep = Node("AXWebArea", selected: true)
    let window = Node("AXWindow", [Node("AXGroup", [Node("AXGroup", [deep])]), Node("AXGroup", [shallow])])
    let result = searched(window)
    XCTAssertTrue(try XCTUnwrap(result.found) === shallow)
    XCTAssertEqual(result.visited, ["AXGroup", "AXGroup", "AXGroup", "AXWebArea"], "level by level, the window itself not a candidate")
    // An unselected web area is descended into: a selected one inside it is found.
    let inner = Node("AXWebArea", selected: true)
    XCTAssertTrue(try XCTUnwrap(search(Node("AXWindow", [Node("AXWebArea", [inner])]))) === inner)
  }

  func testTheSearchStopsAtItsLimit() {
    let tree = fixture()
    XCTAssertNil(search(tree.window, limit: 4), "the web area is the fifth element the search reaches")
    XCTAssertTrue(search(tree.window, limit: 5) === tree.webArea)
  }

  // ---- The test the vendor applies to a web area ----

  func testASelectionIsANonEmptyRangeOrAnyMarkerRange() {
    XCTAssertTrue(webAreaHoldsSelection(range: ["location": 0, "length": 3], markerRange: false))
    XCTAssertTrue(webAreaHoldsSelection(range: nil, markerRange: true))
    XCTAssertTrue(webAreaHoldsSelection(range: ["location": 4, "length": 0], markerRange: true), "a caret's marker range counts")
    XCTAssertFalse(webAreaHoldsSelection(range: ["location": 4, "length": 0], markerRange: false))
    XCTAssertFalse(webAreaHoldsSelection(range: nil, markerRange: false))
  }
}
