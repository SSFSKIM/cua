import ApplicationServices
import XCTest
@testable import Engine

// The reduced read set against the full one on a fake window holding every role the reduced set treats differently and
// every flag the grammar prints. The fake answers the reads as the roles do (a label's value is not settable, a text
// field's value carries no styled runs); test/native-engine-readset.test.mjs renders both Skyshots with the stand-in
// renderer and requires identical text. Fake elements are application handles for unused pids: nothing is sent.

private func fixtureTree() -> FakeTree {
  let tree = FakeTree()
  tree.children = [0: Array(1...10)]
  func set(_ id: Int, _ values: [String: CFTypeRef]) { tree.extra[id] = values }
  set(0, ["AXRole": "AXWindow" as CFString, "AXTitle": "Fixture" as CFString])
  set(1, ["AXRole": kAXStaticTextRole as CFString, "AXValue": "Hello" as CFString, "AXTitle": "" as CFString])
  set(2, ["AXRole": kAXTextFieldRole as CFString, "AXValue": "name" as CFString, "AXFocused": kCFBooleanFalse])
  set(3, ["AXRole": kAXTextAreaRole as CFString, "AXValue": "Body text" as CFString, "AXFocused": kCFBooleanFalse])
  set(4, ["AXRole": kAXTextAreaRole as CFString, "AXValue": "let x = 1" as CFString, "AXTextualContext": "AXTextualContextSourceCode" as CFString])
  set(5, ["AXRole": kAXButtonRole as CFString, "AXTitle": "OK" as CFString, "AXFocused": kCFBooleanFalse])
  set(6, ["AXRole": kAXRowRole as CFString, "AXSelected": kCFBooleanTrue, "AXDisclosing": kCFBooleanFalse])
  set(7, ["AXRole": kAXImageRole as CFString, "AXValue": "icon" as CFString, "AXDescription": "Folder" as CFString])
  set(8, ["AXRole": kAXCheckBoxRole as CFString, "AXValue": 1 as CFNumber, "AXEnabled": kCFBooleanFalse])
  set(9, ["AXRole": kAXSliderRole as CFString, "AXValue": 0.5 as CFNumber])
  set(10, ["AXRole": "AXHeading" as CFString, "AXValue": "Section" as CFString, "AXSelected": kCFBooleanFalse])
  set(90, ["AXRole": kAXMenuBarItemRole as CFString, "AXTitle": "File" as CFString])
  tree.settable = [2: [kAXValueAttribute, kAXFocusedAttribute], 3: [kAXValueAttribute, kAXFocusedAttribute], 4: [kAXValueAttribute],
                   5: [kAXFocusedAttribute], 6: [kAXSelectedAttribute], 8: [kAXValueAttribute], 9: [kAXValueAttribute], 10: [kAXSelectedAttribute]]
  tree.actions = [5: ["AXPress", "AXShowDefaultUI"], 6: ["AXShowMenu"], 8: ["AXPress"], 9: ["AXIncrement", "AXDecrement"], 90: ["AXPress", "AXCancel"]]
  tree.markdown = [3: "**Body** text"]
  return tree
}

final class ReadSetTests: XCTestCase {
  private func skyshot(_ readSet: ReadSet) -> (skyshot: [String: Any], walk: TreeWalk, source: FakeSource) {
    let tree = fixtureTree()
    let source = FakeSource(tree)
    let walk = TreeWalk(source: source, lineage: Lineage(), limits: WalkLimits(deadline: .infinity), markdown: true, readSet: readSet, visibleFrame: nil)
    walk.run(window: Engine.element(0), menuItems: [Engine.element(90)])
    let skyshot: [String: Any] = [
      "app": ["displayName": "Fixture"], "window": ["title": "Fixture"], "nodes": walk.nodes, "menuBar": walk.menuBar,
      "truncated": NSNull(), "focused": NSNull(), "selectedText": NSNull(), "selectedElements": [Int](),
    ]
    return (skyshot, walk, source)
  }

  func testTheReducedSetDropsReadsAndTheFixtureIsWrittenForTheRenderer() throws {
    let full = skyshot(.full)
    let reduced = skyshot(.reduced)
    XCTAssertEqual(full.walk.droppedSettable, 0)
    XCTAssertEqual(reduced.walk.droppedSettable, 3, "the label, the image and the heading")
    XCTAssertEqual(reduced.walk.droppedMarkdown, 2, "the text field and the source-code text area")
    XCTAssertEqual(full.source.markdownCalls, 3)
    XCTAssertEqual(reduced.source.markdownCalls, 1)
    XCTAssertLessThan(reduced.source.settableCalls[kAXValueAttribute] ?? 0, full.source.settableCalls[kAXValueAttribute] ?? 0)
    XCTAssertEqual(reduced.source.settableCalls[kAXFocusedAttribute], full.source.settableCalls[kAXFocusedAttribute], "focusable is read in both")
    XCTAssertEqual(reduced.walk.nodes.count, full.walk.nodes.count)
    if let out = ProcessInfo.processInfo.environment["CUA_READSET_FIXTURE_OUT"] {
      let data = try JSONSerialization.data(withJSONObject: ["full": full.skyshot, "reduced": reduced.skyshot], options: [.sortedKeys])
      try data.write(to: URL(fileURLWithPath: out))
    }
  }

  func testTheRoleRules() {
    func data(_ role: String, value: CFTypeRef? = "v" as CFString, context: String? = nil) -> ElementData {
      var values: [String: CFTypeRef] = ["AXRole": role as CFString]
      if let value { values["AXValue"] = value }
      if let context { values["AXTextualContext"] = context as CFString }
      return ElementData(values: values)
    }
    XCTAssertTrue(readsMarkdown(data(kAXTextFieldRole), readSet: .full))
    XCTAssertFalse(readsMarkdown(data(kAXTextFieldRole), readSet: .reduced))
    XCTAssertTrue(readsMarkdown(data(kAXTextAreaRole), readSet: .reduced))
    XCTAssertFalse(readsMarkdown(data(kAXTextAreaRole, context: "AXTextualContextSourceCode"), readSet: .reduced))
    for role in displayOnlyRoles {
      XCTAssertTrue(readsValueSettable(data(role), readSet: .full), role)
      XCTAssertFalse(readsValueSettable(data(role), readSet: .reduced), role)
    }
    for role in [kAXTextFieldRole, kAXTextAreaRole, kAXCheckBoxRole, kAXSliderRole, kAXValueIndicatorRole, "AXLevelIndicator"] {
      XCTAssertTrue(readsValueSettable(data(role), readSet: .reduced), role)
    }
    XCTAssertFalse(readsValueSettable(data(kAXTextFieldRole, value: nil), readSet: .full), "no value, nothing to set")
  }
}
