import ApplicationServices
import XCTest
@testable import Engine

// #398: a field's placeholder changes on focus, with input, with a mode and when Chromium's complete mode arrives
// (#366), so it never makes the stored handle another element. Once the handle is gone it is evidence of which field
// this was, so the re-fetch's walk and the observed count match it strictly, as the vendor does, against the
// observation's identity. Each action's resolutions are driven as the engine makes them: click's `.ifNeeded` then
// `.always` (`positionedTarget`), set_value's the same with no value read (#390) then `.ignoringValue` after the write.
// type_text resolves no token: it types into the focused field and reads that handle back, so its exposure is the click
// before it and any action on the token after it.

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
  /// A window (0) with one field (1) whose placeholder is "Search" and a button (2); the field's token.
  private func oneField() throws -> (FakeTree, Lineage, String) {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.extra = [1: field("Query", placeholder: "Search", identifier: "q"),
                  2: ["AXRole": "AXButton" as CFString, "AXTitle": "Go" as CFString]]
    let lineage = Lineage()
    let token = try XCTUnwrap(walk(tree, lineage).token(of: Engine.element(1)))
    return (tree, lineage, token)
  }

  /// A window (0) with two fields alike but for what `first` and `second` give them; their tokens.
  private func twoFields(_ first: [String: CFTypeRef], _ second: [String: CFTypeRef]) throws -> (FakeTree, Lineage, String, String) {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    tree.extra = [1: first, 2: second]
    let lineage = Lineage()
    let observation = walk(tree, lineage)
    return (tree, lineage, try XCTUnwrap(observation.token(of: Engine.element(1))), try XCTUnwrap(observation.token(of: Engine.element(2))))
  }

  // MARK: The same handle, its placeholder changed

  func testClickThenSetValueOnAFieldWhosePlaceholderClearsOnFocus() throws {
    let (tree, lineage, token) = try oneField()
    let fake = Resolving(tree)
    // The click focuses the field, which clears its placeholder (a floating label).
    tree.extra[1]?["AXPlaceholderValue"] = nil
    for refetch in [Refetch.ifNeeded, .always] {
      XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: fake.resolver, refetch: refetch).element, Engine.element(1)), "click \(refetch)")
    }
    // set_value's resolutions, the placeholder now set from state, then its write and the re-check.
    tree.extra[1]?["AXPlaceholderValue"] = "Type to search" as CFString
    fake.readsValue = false
    for refetch in [Refetch.ifNeeded, .always] {
      XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: fake.resolver, refetch: refetch).element, Engine.element(1)), "set_value \(refetch)")
    }
    tree.extra[1]?["AXValue"] = "cua" as CFString
    tree.extra[1]?["AXPlaceholderValue"] = nil
    XCTAssertNil(errorName { try confirmingWrittenValue(app: "Fake") { _ = try lineage.resolve(token, resolver: fake.resolver, refetch: .ignoringValue) } })
    XCTAssertEqual(fake.treeReads, 0, "the same handle every time: no walk")
    XCTAssertEqual(lineage.entry(1)?.identity.placeholder, "Search", "the identity keeps the observation's placeholder")
  }

  func testTypeTextAfterAClickKeepsTheSameFieldResolvableWhenItsPlaceholderChangesWithInput() throws {
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
  }

  func testThePostWriteReCheckOnTheSameHandleIsNotValueUnconfirmedOverAChangedPlaceholder() throws {
    let (tree, lineage, token) = try oneField()
    tree.extra[1]?["AXValue"] = "sent" as CFString
    tree.extra[1]?["AXPlaceholderValue"] = nil
    let fake = Resolving(tree)
    fake.invalidated = false
    fake.readsValue = false
    XCTAssertNil(errorName { try confirmingWrittenValue(app: "Fake") { _ = try lineage.resolve(token, resolver: fake.resolver, refetch: .ignoringValue) } })
    XCTAssertEqual(lineage.entry(1)?.identity.placeholder, "Search")
    XCTAssertEqual(fake.treeReads, 0)
  }

  // MARK: A gone handle: the placeholder is evidence (the review of main..46309856)

  func testAStaleHandleWhoseOnlyLikeFieldShowsAnotherPlaceholderIsNoLongerValid() throws {
    // The review's case 1: a step with one unlabeled "Email" field advances to one with an unlabeled "Phone" field.
    let tree = FakeTree()
    tree.children = [0: [1]]
    tree.extra = [1: field("", placeholder: "Email")]
    let lineage = Lineage()
    let token = try XCTUnwrap(walk(tree, lineage).token(of: Engine.element(1)))
    tree.unreadable = [1]
    tree.children[0] = [5]
    tree.extra[5] = field("", placeholder: "Phone")
    for refetch in [Refetch.ifNeeded, .always] {
      XCTAssertEqual(errorName { try lineage.resolve(token, resolver: Resolving(tree).resolver, refetch: refetch) }, "elementNoLongerValid", "\(refetch)")
    }
    let unread = Resolving(tree)
    unread.readsValue = false
    XCTAssertEqual(errorName { try confirmingWrittenValue(app: "Fake") { _ = try lineage.resolve(token, resolver: unread.resolver, refetch: .ignoringValue) } },
                   "valueUnconfirmed")
    XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(1)).element, Engine.element(1)), "the token keeps its handle")
  }

  func testUnderSetValuesUnreadValueASiblingWithAnotherPlaceholderIsNotAdopted() throws {
    // The review's case 2: two fields told apart by placeholder and value; the first's handle goes, the second stays.
    let (tree, lineage, first, _) = try twoFields(field("", placeholder: "First name", value: "Ada"),
                                                  field("", placeholder: "Last name", value: "Lovelace"))
    tree.unreadable = [1]
    tree.children[0] = [2]
    let fake = Resolving(tree)
    fake.readsValue = false
    for refetch in [Refetch.ifNeeded, .always, .ignoringValue] {
      XCTAssertEqual(errorName { try lineage.resolve(first, resolver: fake.resolver, refetch: refetch) }, "elementNoLongerValid", "\(refetch)")
      XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(1)).element, Engine.element(1)), "\(refetch): not the sibling")
    }
  }

  func testTheSameHandlesChangedPlaceholderNeverRewritesWhatTheObservedCountUses() throws {
    // The review's case 3: two twins (the observed count says ambiguous for either). The first's handle shows another
    // placeholder and resolves as itself; then the second's handle goes while the first shows the old one again. The
    // second's token is still ambiguous before the walk, never the first.
    let (tree, lineage, first, second) = try twoFields(field("", placeholder: "Name"), field("", placeholder: "Name"))
    let fake = Resolving(tree)
    tree.extra[1]?["AXPlaceholderValue"] = "Search" as CFString
    for refetch in [Refetch.ifNeeded, .always] {
      XCTAssertTrue(CFEqual(try lineage.resolve(first, resolver: fake.resolver, refetch: refetch).element, Engine.element(1)))
      XCTAssertEqual(lineage.entry(1)?.identity.placeholder, "Name", "\(refetch): the revision keeps the observation's placeholder")
    }
    tree.extra[1]?["AXPlaceholderValue"] = "Name" as CFString
    tree.unreadable = [2]
    tree.children[0] = [1]
    XCTAssertEqual(errorName { try lineage.resolve(second, resolver: fake.resolver) }, "elementAmbiguousBeforeRefetch")
    XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(2)).element, Engine.element(2)))
  }

  func testAReplacementShowingAnotherPlaceholderIsNotAdoptedSoNoStaleHintRemains() throws {
    // The review's case 4: a replaced field whose new handle shows another placeholder. Not adopted in any mode, so the
    // token never names a handle while carrying another field's placeholder; one showing the observed placeholder is.
    for refetch in [Refetch.ifNeeded, .always, .ignoringValue] {
      let (tree, lineage, token) = try oneField()
      tree.unreadable = [1]
      tree.children[0] = [9, 2]
      tree.extra[9] = field("Query", placeholder: "Search…", identifier: "q")
      XCTAssertEqual(errorName { try lineage.resolve(token, resolver: Resolving(tree).resolver, refetch: refetch) }, "elementNoLongerValid", "\(refetch)")
      tree.extra[9] = field("Query", placeholder: "Search", identifier: "q")
      let entry = try lineage.resolve(token, resolver: Resolving(tree).resolver, refetch: refetch)
      XCTAssertTrue(CFEqual(entry.element, Engine.element(9)), "\(refetch)")
      XCTAssertEqual(entry.identity.placeholder, "Search")
    }
  }

  func testOfTwoFieldsAlikeButTheirPlaceholdersAStaleHandleResolvesStrictly() throws {
    let (tree, lineage, first, last) = try twoFields(field("", placeholder: "First name"), field("", placeholder: "Last name"))
    tree.unreadable = [1, 2]
    tree.children[0] = [11, 12]
    tree.extra[11] = field("", placeholder: "First name")
    tree.extra[12] = field("", placeholder: "Last name")
    XCTAssertTrue(CFEqual(try lineage.resolve(first, resolver: Resolving(tree).resolver).element, Engine.element(11)))
    XCTAssertTrue(CFEqual(try lineage.resolve(last, resolver: Resolving(tree).resolver).element, Engine.element(12)))
    // Neither shows its placeholder: no longer valid; both show the first's: ambiguous.
    let (other, otherLineage, otherFirst, _) = try twoFields(field("", placeholder: "First name"), field("", placeholder: "Last name"))
    other.unreadable = [1, 2]
    other.children[0] = [11, 12]
    other.extra[11] = field("", placeholder: "Name")
    other.extra[12] = field("", placeholder: "Name")
    XCTAssertEqual(errorName { try otherLineage.resolve(otherFirst, resolver: Resolving(other).resolver) }, "elementNoLongerValid")
    other.extra[11] = field("", placeholder: "First name")
    other.extra[12] = field("", placeholder: "First name")
    XCTAssertEqual(errorName { try otherLineage.resolve(otherFirst, resolver: Resolving(other).resolver) }, "elementAmbiguousAfterRefetch")
  }

  // MARK: A real difference still counts, on the same handle too

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
  }
}
