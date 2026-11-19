import ApplicationServices
import XCTest
@testable import Engine

// #398: a field's placeholder changes on focus, with input, with a mode and when Chromium's complete mode arrives
// (#366), so it never makes the same handle another element, and in the re-fetch's walk it only breaks a tie among
// elements alike in everything else. Each action's resolutions are driven as the engine makes them: click's `.ifNeeded`
// then `.always` (`positionedTarget`), set_value's the same then `.ignoringValue` after the write. type_text resolves no
// token: it types into the focused field and reads that handle back, so its exposure is the click before it and any
// action on the token after it.

private final class Resolving {
  let tree: FakeTree
  var invalidated = true
  /// False for set_value's resolutions, which read no AXValue (#390).
  var readsValue = true
  private(set) var treeReads = 0

  init(_ tree: FakeTree) { self.tree = tree }

  var resolver: ElementResolver {
    ElementResolver(
      invalidated: { [self] _ in invalidated },
      stillValid: { [self] in !tree.unreadable.contains(tree.id($0)) },
      source: { [self] in
        let source = FakeSource(tree)
        source.readsValue = readsValue
        return source
      },
      tree: { [self] _ in
        treeReads += 1
        return (Engine.element(0), [])
      })
  }
}

private func field(_ title: String, placeholder: String?, value: String = "", identifier: String? = nil) -> [String: CFTypeRef] {
  var attributes: [String: CFTypeRef] = ["AXRole": "AXTextField" as CFString, "AXTitle": title as CFString, "AXValue": value as CFString]
  if let placeholder { attributes["AXPlaceholderValue"] = placeholder as CFString }
  if let identifier { attributes["AXIdentifier"] = identifier as CFString }
  return attributes
}

private func errorName(_ body: () throws -> Any) -> String? {
  do { _ = try body(); return nil } catch { return (error as? EngineError)?.errorName ?? "\(error)" }
}

final class PlaceholderIdentityTests: XCTestCase {
  /// A window (0) with one field (1, t1) whose placeholder is "Search" and a button (2).
  private func oneField() throws -> (FakeTree, Lineage, String) {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.extra = [1: field("Query", placeholder: "Search", identifier: "q"),
                  2: ["AXRole": "AXButton" as CFString, "AXTitle": "Go" as CFString]]
    let lineage = Lineage()
    let token = try XCTUnwrap(walk(tree, lineage).token(of: Engine.element(1)))
    return (tree, lineage, token)
  }

  /// A window (0) with two fields alike but for their placeholders (1, "First name"; 2, "Last name").
  private func twoFields() throws -> (FakeTree, Lineage, first: String, last: String) {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.extra = [1: field("", placeholder: "First name"), 2: field("", placeholder: "Last name")]
    let lineage = Lineage()
    let observation = walk(tree, lineage)
    return (tree, lineage, try XCTUnwrap(observation.token(of: Engine.element(1))), try XCTUnwrap(observation.token(of: Engine.element(2))))
  }

  // MARK: The same field, its placeholder changed

  func testClickThenSetValueOnAFieldWhosePlaceholderClearsOnFocus() throws {
    let (tree, lineage, token) = try oneField()
    let fake = Resolving(tree)
    // The click focuses the field, which clears its placeholder (a floating label).
    for refetch in [Refetch.ifNeeded, .always] {
      tree.extra[1]?["AXPlaceholderValue"] = nil
      XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: fake.resolver, refetch: refetch).element, Engine.element(1)), "click \(refetch)")
    }
    XCTAssertNil(lineage.entry(1)?.identity.placeholder, "the identity follows the field")
    // set_value's resolutions, the placeholder now set from state ("Type to search"), then its write and re-check.
    tree.extra[1]?["AXPlaceholderValue"] = "Type to search" as CFString
    for refetch in [Refetch.ifNeeded, .always] {
      XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: fake.resolver, refetch: refetch).element, Engine.element(1)), "set_value \(refetch)")
    }
    tree.extra[1]?["AXValue"] = "cua" as CFString
    tree.extra[1]?["AXPlaceholderValue"] = nil
    XCTAssertNoThrow(try confirmingWrittenValue(app: "Fake") {
      _ = try lineage.resolve(token, resolver: fake.resolver, refetch: .ignoringValue)
    })
    XCTAssertEqual(fake.treeReads, 0, "the same handle every time: no walk")
    XCTAssertEqual(lineage.entry(1)?.identity.value, "s:cua")
  }

  func testTypeTextAfterAClickKeepsTheTokenResolvableWhenThePlaceholderChangesWithInput() throws {
    let (tree, lineage, token) = try oneField()
    let fake = Resolving(tree)
    tree.extra[1]?["AXPlaceholderValue"] = "Search people…" as CFString   // the click picked a filter
    for refetch in [Refetch.ifNeeded, .always] {
      XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: fake.resolver, refetch: refetch).element, Engine.element(1)))
    }
    // type_text's keys: the value and the placeholder change. A set_value on the token after it (which reads no value,
    // #390; an action that reads the value meets the vendor's value rule, not the placeholder) finds the same field.
    tree.extra[1]?["AXValue"] = "ada" as CFString
    tree.extra[1]?["AXPlaceholderValue"] = nil
    fake.readsValue = false
    for refetch in [Refetch.ifNeeded, .always, .ignoringValue] {
      XCTAssertNil(errorName { try lineage.resolve(token, resolver: fake.resolver, refetch: refetch) }, "\(refetch)")
    }
    XCTAssertEqual(fake.treeReads, 0)
    // The page re-rendered the field as it typed (a React re-mount): a new handle, its placeholder another again.
    tree.unreadable = [1]
    tree.children[0] = [9, 2]
    tree.extra[9] = field("Query", placeholder: "Search files…", value: "ada", identifier: "q")
    XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: fake.resolver, refetch: .always).element, Engine.element(9)))
    XCTAssertEqual(fake.treeReads, 1)
  }

  func testThePostWriteReCheckIsNotValueUnconfirmedOverAChangedPlaceholder() throws {
    let (tree, lineage, token) = try oneField()
    tree.extra[1]?["AXValue"] = "sent" as CFString
    tree.extra[1]?["AXPlaceholderValue"] = nil
    let fake = Resolving(tree)
    fake.invalidated = false
    XCTAssertNil(errorName { try confirmingWrittenValue(app: "Fake") { _ = try lineage.resolve(token, resolver: fake.resolver, refetch: .ignoringValue) } })
    XCTAssertNil(lineage.entry(1)?.identity.placeholder, "the re-check renews the identity it read")
    // A field the write rebuilt, its placeholder gone with it: re-found by the walk.
    let (rebuilt, again, rebuiltToken) = try oneField()
    rebuilt.unreadable = [1]
    rebuilt.children[0] = [9, 2]
    rebuilt.extra[9] = field("Query", placeholder: nil, value: "sent", identifier: "q")
    let walked = Resolving(rebuilt)
    XCTAssertNil(errorName { try confirmingWrittenValue(app: "Fake") { _ = try again.resolve(rebuiltToken, resolver: walked.resolver, refetch: .ignoringValue) } })
    XCTAssertTrue(CFEqual(try XCTUnwrap(again.entry(1)).element, Engine.element(9)))
  }

  func testAStaleHandleIsReFoundByTheWalkWhateverItsPlaceholderNow() throws {
    for refetch in [Refetch.ifNeeded, .always, .ignoringValue] {
      let (tree, lineage, token) = try oneField()
      tree.unreadable = [1]
      tree.children[0] = [9, 2]
      tree.extra[9] = field("Query", placeholder: "Search…", identifier: "q")
      let fake = Resolving(tree)
      XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: fake.resolver, refetch: refetch).element, Engine.element(9)), "\(refetch)")
    }
  }

  // MARK: Two fields alike but for their placeholders

  func testAStaleHandleResolvesToTheFieldWhosePlaceholderMatches() throws {
    let (tree, lineage, first, last) = try twoFields()
    tree.unreadable = [1, 2]
    tree.children[0] = [11, 12]
    tree.extra[11] = field("", placeholder: "First name")
    tree.extra[12] = field("", placeholder: "Last name")
    let fake = Resolving(tree)
    XCTAssertTrue(CFEqual(try lineage.resolve(first, resolver: fake.resolver).element, Engine.element(11)))
    XCTAssertTrue(CFEqual(try lineage.resolve(last, resolver: fake.resolver).element, Engine.element(12)))
  }

  func testWhenNoPlaceholderDecidesTheWalkRefusesAsAmbiguous() throws {
    let (tree, lineage, first, _) = try twoFields()
    tree.unreadable = [1, 2]
    tree.children[0] = [11, 12]
    tree.extra[11] = field("", placeholder: "Name")
    tree.extra[12] = field("", placeholder: "Name")
    XCTAssertEqual(errorName { try lineage.resolve(first, resolver: Resolving(tree).resolver) }, "elementAmbiguousAfterRefetch")
    // Both now with the old placeholder: still no one field.
    tree.extra[12] = field("", placeholder: "First name")
    tree.extra[11] = field("", placeholder: "First name")
    XCTAssertEqual(errorName { try lineage.resolve(first, resolver: Resolving(tree).resolver) }, "elementAmbiguousAfterRefetch")
  }

  func testOneFieldLeftThatThePlaceholderDoesNotConfirmIsNotAdopted() throws {
    // The observation told the two apart by the placeholder alone. The first field is gone and the last remains: the
    // one candidate left is not adopted for the first's token, whatever placeholder it shows.
    for remaining in ["Last name", "Name"] {
      let (tree, lineage, first, _) = try twoFields()
      tree.unreadable = [1, 2]
      tree.children[0] = [12]
      tree.extra[12] = field("", placeholder: remaining)
      XCTAssertEqual(errorName { try lineage.resolve(first, resolver: Resolving(tree).resolver) }, "elementNoLongerValid", remaining)
      XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(1)).element, Engine.element(1)), "\(remaining): the token keeps its handle")
    }
  }

  func testTheTieBreakUsesThePlaceholderTheSameHandleLastShowed() throws {
    let (tree, lineage, first, _) = try twoFields()
    let fake = Resolving(tree)
    tree.extra[1]?["AXPlaceholderValue"] = nil       // focused: the first field's placeholder clears
    XCTAssertTrue(CFEqual(try lineage.resolve(first, resolver: fake.resolver).element, Engine.element(1)))
    // Both re-rendered, the first still without its placeholder.
    tree.unreadable = [1, 2]
    tree.children[0] = [11, 12]
    tree.extra[11] = field("", placeholder: nil)
    tree.extra[12] = field("", placeholder: "Last name")
    XCTAssertTrue(CFEqual(try lineage.resolve(first, resolver: fake.resolver).element, Engine.element(11)))
  }

  func testTheStoredHandleFoundByTheWalkIsTheElementWhateverItsPlaceholder() throws {
    // The stored handle's own re-read fails once, so the walk runs; it reads the handle again, its placeholder now
    // another's, while a new element shows the old one. The same handle is the element.
    let (tree, lineage, first, _) = try twoFields()
    tree.unreadable = [1, 2]
    tree.children[0] = [1, 9]
    tree.extra[1]?["AXPlaceholderValue"] = "Last name" as CFString
    tree.extra[9] = field("", placeholder: "First name")
    tree.answered = { id, _ in if id == 0 { tree.unreadable.remove(1) } }
    let fake = Resolving(tree)
    XCTAssertTrue(CFEqual(try lineage.resolve(first, resolver: fake.resolver).element, Engine.element(1)))
    XCTAssertEqual(fake.treeReads, 1, "found by the walk, not by the re-read")
  }

  // MARK: A real difference still counts

  func testAFieldThatDiffersInItsLabelOrIdentifierIsStillRejected() throws {
    for (attribute, changed) in [("AXTitle", "Filter"), ("AXIdentifier", "other")] {
      // The same handle, its placeholder changed too: the re-read fails, and the walk finds nothing alike.
      let (tree, lineage, token) = try oneField()
      tree.extra[1]?["AXPlaceholderValue"] = nil
      tree.extra[1]?[attribute] = changed as CFString
      XCTAssertEqual(errorName { try lineage.resolve(token, resolver: Resolving(tree).resolver) }, "elementNoLongerValid", attribute)
      XCTAssertEqual(errorName { try confirmingWrittenValue(app: "Fake") { _ = try lineage.resolve(token, resolver: Resolving(tree).resolver, refetch: .ignoringValue) } },
                     "valueUnconfirmed", attribute)
      // A stale handle whose one replacement keeps the placeholder and changes the attribute.
      let (stale, staleLineage, staleToken) = try oneField()
      stale.unreadable = [1]
      stale.children[0] = [9, 2]
      stale.extra[9] = field("Query", placeholder: "Search", identifier: "q")
      stale.extra[9]?[attribute] = changed as CFString
      XCTAssertEqual(errorName { try staleLineage.resolve(staleToken, resolver: Resolving(stale).resolver) }, "elementNoLongerValid", attribute)
    }
    // Of two fields alike, a replacement with the old placeholder but another label is not adopted either.
    let (tree, lineage, first, _) = try twoFields()
    tree.unreadable = [1, 2]
    tree.children[0] = [11, 12]
    tree.extra[11] = field("Given name", placeholder: "First name")
    tree.extra[12] = field("", placeholder: "Last name")
    XCTAssertEqual(errorName { try lineage.resolve(first, resolver: Resolving(tree).resolver) }, "elementNoLongerValid")
  }

  func testTheVerdictsRules() {
    func verdict(_ candidates: [(Int, String?)], stored: Int = 0, placeholder: String? = "a", alike: Int) -> [Int] {
      placeholderVerdict(candidates.map { (element: $0.0, placeholder: $0.1) }, stored: stored, placeholder: placeholder,
                         observedAlike: alike, same: ==)
    }
    XCTAssertEqual(verdict([(1, "b")], alike: 1), [1], "one alone, the observation held one alone: whatever its placeholder")
    XCTAssertEqual(verdict([(1, "b")], alike: 2), [], "one alone that the placeholder told apart: not confirmed")
    XCTAssertEqual(verdict([(1, "a")], alike: 2), [1])
    XCTAssertEqual(verdict([(1, "a"), (2, "b")], alike: 2), [1], "several: the placeholder breaks the tie")
    XCTAssertEqual(verdict([(1, "b"), (2, "c")], alike: 1), [1, 2], "several, none with it: ambiguous")
    XCTAssertEqual(verdict([(1, "a"), (2, "a")], alike: 2), [1, 2], "several with it: ambiguous")
    XCTAssertEqual(verdict([(1, "a"), (0, "b")], alike: 2), [0], "the stored handle is the element")
    XCTAssertEqual(verdict([], alike: 1), [])
    XCTAssertEqual(verdict([(1, nil), (2, "b")], placeholder: nil, alike: 2), [1], "no placeholder is a placeholder to match")
  }
}
