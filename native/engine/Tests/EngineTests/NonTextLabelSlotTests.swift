import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

/// #519 (rulings 1146, 1151): a label slot holding a value that is no text (a CFNumber AXTitle) is neither the label's text
/// nor its absence. The decoder names it (`ElementData.nonText`, by its type alone) and the record keeps it apart
/// (`labelsNonText`): every consumer that chooses a target reads it as main did, as none, and only #453's and #454's
/// checks of the target already chosen read it strictly, as unknown. Every slot here enters at decode time.
final class NonTextLabelSlotTests: XCTestCase {
  /// The decoder keeps the value as it came and puts the name in no failure set; the record keeps it in `labelsNonText`
  /// alone (an AXStaticText's value too, no other role's), never in `labelsUnread`; `label(_:)` reads it as none, as main
  /// did, and `strictLabel(_:)` as unknown; the walk's node still says no title.
  func testANonTextSlotIsRecordedApart() {
    var read = AttributeRead()
    read.decode(kAXTitleAttribute, nonTextLabelSlot)
    XCTAssertEqual(read.unreadable, [], "the read did not fail")
    XCTAssertEqual(read.null, [])
    XCTAssertEqual(read.absent, [])
    XCTAssertEqual(ElementData(values: read.values).nonText, [kAXTitleAttribute])
    XCTAssertEqual(ElementData(values: [kAXTitleAttribute: "Save" as CFString,
                                        kAXDescriptionAttribute: NSAttributedString(string: "Save") as CFTypeRef]).nonText, [],
                   "a string or an attributed string is text")
    let labels = decodedLabels(role: "AXStaticText", title: nil, description: "Save", value: nil, nonText: [.title, .value])
    XCTAssertNil(labels.title, "its text is never invented")
    XCTAssertEqual(labels.description, "Save")
    XCTAssertEqual(labels.nonText, [.title, .value])
    XCTAssertEqual(labels.unread, [], "never unread for the consumers that choose a target")
    XCTAssertEqual(labels.null, [])
    XCTAssertEqual(decodedLabels(role: "AXButton", title: "Save", description: nil, value: nil, nonText: [.value]).nonText, [],
                   "no other role's value is its label")
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.frames = [0: CGRect(x: 0, y: 0, width: 600, height: 400), 1: CGRect(x: 20, y: 20, width: 100, height: 30),
                   2: CGRect(x: 20, y: 60, width: 100, height: 30)]
    tree.extra[1] = [kAXTitleAttribute: nonTextLabelSlot]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    let read1 = recording.screenshotReads.first { tree.id($0.element) == 1 }
    XCTAssertNil(read1?.title)
    XCTAssertEqual(read1?.labelsNonText, [.title])
    XCTAssertEqual(read1?.labelsUnread, [])
    let node = screenshotNodes(recording.screenshotReads).first { tree.id($0.element) == 1 }
    XCTAssertEqual(node?.label(.title), .text(nil), "as main read it")
    XCTAssertEqual(node?.strictLabel(.title), .nonText)
    XCTAssertEqual(recording.screenshotReads.first { tree.id($0.element) == 2 }?.labelsNonText, [], "a title read is text")
    XCTAssertTrue(recording.nodes.first { ($0["frame"] as? [String: Double])?["y"] == 20 }?["title"] is NSNull,
                  "the model's node is unchanged: no title")
  }

  /// A single read now: the main read takes a value that is no text for none, as main did; the strict read for unknown.
  func testTheStrictReadTellsANonTextValueApart() {
    XCTAssertEqual(stalePointLabelRead(nonTextLabelSlot, .success), .text(nil), "main's read")
    XCTAssertEqual(stalePointStrictLabelRead(nonTextLabelSlot, .success), .nonText)
    XCTAssertEqual(stalePointStrictLabelRead("Save" as CFString, .success), .text("Save"))
    XCTAssertEqual(stalePointStrictLabelRead(kCFNull, .success), .null)
    XCTAssertEqual(stalePointStrictLabelRead(nil, .noValue), .text(nil))
    XCTAssertEqual(stalePointStrictLabelRead(nil, .cannotComplete), .unreadable)
  }
}
