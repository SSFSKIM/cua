import XCTest
@testable import Engine

// `--probe text-view --pid <n>` (TextViewProbe.swift): its argument and the two searches it makes, over a fake tree.
final class TextViewProbeTests: XCTestCase {
  func testThePidIsTheOneArgument() {
    XCTAssertEqual(textViewProbePid(["--pid", "612"]), 612)
    XCTAssertNil(textViewProbePid([]))
    XCTAssertNil(textViewProbePid(["--pid"]))
    XCTAssertNil(textViewProbePid(["--pid", "0"]))
    XCTAssertNil(textViewProbePid(["--pid", "-3"]))
    XCTAssertNil(textViewProbePid(["--pid", "x"]))
    XCTAssertNil(textViewProbePid(["--pid", "612", "extra"]))
    XCTAssertNil(textViewProbePid(["--window", "612"]))
  }

  func testTheHorizontalStartIsAValueInTheUnitRange() {
    XCTAssertEqual(TextViewRequest.parse(["--pid", "612", "--set-horizontal", "0.5"]), TextViewRequest(pid: 612, setHorizontal: 0.5))
    XCTAssertEqual(TextViewRequest.parse(["--set-horizontal", "0", "--pid", "612"]), TextViewRequest(pid: 612, setHorizontal: 0))
    XCTAssertEqual(TextViewRequest.parse(["--pid", "612"]), TextViewRequest(pid: 612))
    for bad in [["--pid", "612", "--set-horizontal", "1.5"], ["--pid", "612", "--set-horizontal", "-0.1"], ["--pid", "612", "--set-horizontal", "nan"],
                ["--pid", "612", "--set-horizontal"], ["--set-horizontal", "0.5"], ["--pid", "1", "--pid", "2"]] {
      XCTAssertNil(TextViewRequest.parse(bad), "\(bad)")
    }
    XCTAssertNil(textViewProbePid(["--pid", "612", "--set-horizontal", "0.5"]), "the read-only form takes no write")
    XCTAssertEqual(TextViewRequest.parse(["--pid", "612", "--set-horizontal", "0.5", "--set-vertical", "0.25"]),
                   TextViewRequest(pid: 612, setHorizontal: 0.5, setVertical: 0.25))
    XCTAssertEqual(TextViewRequest.parse(["--pid", "612", "--set-vertical", "1"])?.writes, true)
    for bad in [["--pid", "612", "--set-vertical", "2"], ["--pid", "612", "--set-vertical", "0.5", "--set-vertical", "0.5"]] {
      XCTAssertNil(TextViewRequest.parse(bad), "\(bad)")
    }
    XCTAssertNil(textViewProbePid(["--pid", "612", "--set-vertical", "0.5"]))
  }

  // window 0 > [toolbar 1 > [button 2], scroll area 3 > [group 4 > [text area 5], scroll bar 6]], text area 7
  private let roles = [0: "AXWindow", 1: "AXToolbar", 2: "AXButton", 3: "AXScrollArea", 4: "AXGroup", 5: "AXTextArea", 6: "AXScrollBar", 7: "AXTextArea"]
  private let kids = [0: [1, 3, 7], 1: [2], 3: [4, 6], 4: [5]]
  private var parents: [Int: Int] { Dictionary(uniqueKeysWithValues: kids.flatMap { parent, children in children.map { ($0, parent) } }) }

  func testTheFirstTextAreaIsFoundBreadthFirstWithinTheBound() {
    XCTAssertEqual(firstDescendant(of: 0, role: "AXTextArea", roleOf: { self.roles[$0] }, children: { self.kids[$0] ?? [] }), 7,
                   "breadth first: the shallower text area")
    XCTAssertEqual(firstDescendant(of: 3, role: "AXTextArea", roleOf: { self.roles[$0] }, children: { self.kids[$0] ?? [] }), 5)
    XCTAssertNil(firstDescendant(of: 0, role: "AXTextArea", roleOf: { self.roles[$0] }, children: { self.kids[$0] ?? [] }, limit: 2),
                 "nothing past the bound")
    XCTAssertNil(firstDescendant(of: 5, role: "AXTextArea", roleOf: { self.roles[$0] }, children: { self.kids[$0] ?? [] }), "the root itself is not a match")
  }

  func testTheScrollAreaIsTheNearestAncestorWithinTheLevels() {
    XCTAssertEqual(nearestAncestor(of: 5, role: "AXScrollArea", roleOf: { self.roles[$0] }, parent: { self.parents[$0] }), 3)
    XCTAssertNil(nearestAncestor(of: 7, role: "AXScrollArea", roleOf: { self.roles[$0] }, parent: { self.parents[$0] }), "a text area outside any scroll area")
    XCTAssertNil(nearestAncestor(of: 5, role: "AXScrollArea", roleOf: { self.roles[$0] }, parent: { self.parents[$0] }, levels: 1))
  }
}
