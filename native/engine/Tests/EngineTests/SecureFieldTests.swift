import ApplicationServices
import XCTest
@testable import Engine

/// #405: the observation never reads a password field's value, length, Markdown or selection, whatever the app would
/// answer. The app here is a stub (FakeSource over a FakeTree) that holds PLAINTEXT as a password field's value and, with
/// `answersEverything`, puts all it holds in every answer, asked for or not; each request it gets is logged. Every entry
/// point is covered: the walk, the settle's busy walk and the observation that reuses its reads, the focused element's
/// selected text, a token's re-resolution after an action (its re-read and its re-fetch walk), and select_text's search.
final class SecureFieldTests: XCTestCase {
  private let plaintext = "PLAINTEXT-hunter2-secret"
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  /// A window (0) holding a password field (1), a plain text field (2) and a button (3); the stub answers everything.
  private func tree(subrole: String? = "AXSecureTextField", role: String = kAXTextFieldRole) -> FakeTree {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    var field: [String: CFTypeRef] = ["AXRole": role as CFString, "AXTitle": "Password" as CFString,
                                      "AXValue": plaintext as CFString, "AXNumberOfCharacters": plaintext.utf16.count as CFNumber,
                                      "AXSelectedText": plaintext as CFString]
    if let subrole { field["AXSubrole"] = subrole as CFString }
    tree.extra = [1: field,
                  2: ["AXRole": kAXTextFieldRole as CFString, "AXTitle": "Name" as CFString, "AXValue": "visible" as CFString, "AXNumberOfCharacters": 7 as CFNumber],
                  3: ["AXRole": kAXButtonRole as CFString]]
    tree.settable = [1: [kAXValueAttribute], 2: [kAXValueAttribute]]
    tree.markdown = [1: "**\(plaintext)**", 2: "**visible**"]
    tree.answersEverything = true
    return tree
  }

  private func observe(_ tree: FakeTree, _ lineage: Lineage = Lineage(), source: FakeSource? = nil) -> (TreeWalk, FakeSource) {
    let source = source ?? FakeSource(tree)
    let walk = TreeWalk(source: source, lineage: lineage, limits: WalkLimits(deadline: .infinity), markdown: true, visibleFrame: nil)
    walk.run(window: el(0), menuBar: nil, menuItems: [])
    lineage.commit(walk.revision)
    return (walk, source)
  }

  private func node(_ walk: TreeWalk, _ id: Int) -> [String: Any] {
    walk.nodes.first { $0["token"] as? String == walk.token(of: el(id)) }!
  }

  private func json(_ object: Any) -> String {
    String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!
  }

  /// The value's attributes requested of `id`, by any request.
  private func valueRequests(_ source: FakeSource, _ id: Int) -> [[String]] {
    source.requests.filter { $0.id == id && !valueAttributes.isDisjoint(with: $0.names) }.map(\.names)
  }

  private func assertNothingOfThePassword(_ text: String, _ label: String = "", file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertFalse(text.contains(plaintext), "the plaintext \(label)", file: file, line: line)
    XCTAssertFalse(text.contains("PLAINTEXT"), "any part of it \(label)", file: file, line: line)
    XCTAssertFalse(text.contains("\"numberOfCharacters\":\(plaintext.utf16.count)"), "its length \(label)", file: file, line: line)
  }

  /// The walk requests none of a password field's value attributes and no Markdown; its node, its cached read and its
  /// identity carry no value and no length; the node says `secure` and stays settable. A plain field beside it reads as
  /// before, and its node carries no `secure`.
  func testTheWalkNeverReadsAPasswordFieldAndItsNodeSaysSecure() throws {
    for (role, subrole) in [(kAXTextFieldRole, "AXSecureTextField" as String?), ("AXSecureTextField", nil)] {
      let label = "role \(role), subrole \(subrole ?? "none")"
      let lineage = Lineage()
      let (walk, source) = observe(tree(subrole: subrole, role: role), lineage)

      XCTAssertEqual(valueRequests(source, 1), [], label)
      XCTAssertEqual(source.markdownCalls, 1, "the plain field's Markdown alone: \(label)")
      let secure = node(walk, 1)
      XCTAssertEqual(secure["secure"] as? Bool, true, label)
      XCTAssertTrue(secure["value"] is NSNull, label)
      XCTAssertTrue(secure["valueType"] is NSNull, label)
      XCTAssertTrue(secure["valueMarkdown"] is NSNull, label)
      XCTAssertNil(secure["numberOfCharacters"], label)
      XCTAssertEqual((secure["flags"] as? [String: Any])?["settable"] as? Bool, true, "a password field stays settable: \(label)")
      assertNothingOfThePassword(json(["nodes": walk.nodes, "menuBar": walk.menuBar]), "in the reply: \(label)")

      let cached = try XCTUnwrap(source.data(el(1)))
      XCTAssertNil(cached.value, label)
      XCTAssertNil(cached.numberOfCharacters, label)
      XCTAssertTrue(cached.secure && cached.valueUnread, label)
      let identity = try XCTUnwrap(lineage.entry(try XCTUnwrap(tokenNumber(try XCTUnwrap(walk.token(of: el(1))))))).identity
      XCTAssertNil(identity.value, label)
      XCTAssertTrue(identity.valueUnread, label)
      XCTAssertNil(walk.screenshotReads.first { CFEqual($0.element, el(1)) }?.value, label)

      let plain = node(walk, 2)
      XCTAssertNil(plain["secure"], label)
      XCTAssertEqual(plain["value"] as? String, "visible", label)
      XCTAssertEqual(plain["numberOfCharacters"] as? Int, 7, label)
      XCTAssertEqual(plain["valueMarkdown"] as? String, "**visible**", label)
      XCTAssertEqual(Set(plain.keys), ["token", "depth", "pid", "role", "subrole", "roleDescription", "title", "description", "value",
                                       "valueType", "valueMarkdown", "identifier", "flags", "actions", "frame", "children",
                                       "numberOfCharacters", "actionDescriptions"], "a plain field's node has main's keys: \(label)")
      XCTAssertNil(node(walk, 3)["secure"], label)
    }
  }

  /// A plain element takes one request for its value attributes, beside its role and subrole read again, after the
  /// request for the rest, which never carries them.
  func testTheValueIsRequestedApartAndAfterTheClassification() {
    let (_, source) = observe(tree())
    let field = source.requests.filter { $0.id == 2 }.map(\.names)
    XCTAssertEqual(field.count, 3, "the rest, the value's, the Markdown's classification")
    XCTAssertTrue(valueAttributes.isDisjoint(with: field[0]))
    XCTAssertEqual(field[1], [kAXRoleAttribute, kAXSubroleAttribute, kAXValueAttribute, kAXNumberOfCharactersAttribute])
    XCTAssertEqual(field[2], [kAXRoleAttribute, kAXSubroleAttribute])
    XCTAssertEqual(source.reads[2], 1)
  }

  /// A field whose role or subrole cannot be read is not classified, so its value is not read either; its node carries
  /// no value and no `secure`, as it is not known to be a password field.
  func testAFieldThatCannotBeClassifiedIsNotRead() {
    for unreadable in ["AXSubrole", "AXRole"] {
      let stub = tree(subrole: nil)
      stub.unreadableAttributes = [1: [unreadable]]
      let (walk, source) = observe(stub)
      XCTAssertEqual(valueRequests(source, 1), [], unreadable)
      XCTAssertEqual(source.markdownCalls, 1, unreadable)
      XCTAssertTrue(node(walk, 1)["value"] is NSNull, unreadable)
      XCTAssertNil(node(walk, 1)["secure"], unreadable)
      assertNothingOfThePassword(json(walk.nodes), unreadable)
    }
  }

  /// A field that turns secure between the first request and the value's: the value's request reads the role and
  /// subrole again beside the value, and keeps nothing of what it answered; one that turns secure after it, before the
  /// Markdown read, is not read for its Markdown.
  func testAFieldThatTurnsSecureBetweenRequestsKeepsNothing() throws {
    for turnAfter in [1, 2] {
      let stub = tree(subrole: nil)
      var answered = 0
      stub.answered = { id, _ in
        guard id == 1 else { return }
        answered += 1
        if answered == turnAfter { stub.extra[1]?["AXSubrole"] = "AXSecureTextField" as CFString }
      }
      let (walk, source) = observe(stub)
      let label = "turned after request \(turnAfter)"
      XCTAssertEqual(source.markdownCalls, 1, "only the plain field's: \(label)")
      XCTAssertTrue(node(walk, 1)["valueMarkdown"] is NSNull, label)
      if turnAfter == 1 {
        XCTAssertEqual(node(walk, 1)["secure"] as? Bool, true, label)
        XCTAssertTrue(node(walk, 1)["value"] is NSNull, label)
        XCTAssertNil(node(walk, 1)["numberOfCharacters"], label)
        assertNothingOfThePassword(json(walk.nodes), label)
        XCTAssertNil(try XCTUnwrap(source.data(el(1))).value, label)
      }
    }
  }

  /// The settle's busy walk requests no value attributes of any element; the observation that reuses its reads adds only
  /// the value's request, and still none for the password field.
  func testTheBusyWalkReadsNoValueAndItsObservationNoPassword() {
    let stub = tree()
    let source = FakeSource(stub)
    XCTAssertEqual(busyWalk(el(0), source: source, visibleFrame: nil, deadline: .infinity).busy, false)
    XCTAssertTrue(source.requests.allSatisfy { valueAttributes.isDisjoint(with: $0.names) })
    XCTAssertTrue(source.requests.allSatisfy { $0.names.contains(kAXChildrenAttribute) }, "one request per element")

    let (walk, _) = observe(stub, source: source)
    XCTAssertEqual(source.reads, [0: 1, 1: 1, 2: 1, 3: 1], "each element's rest read once, by the busy walk")
    XCTAssertEqual(valueRequests(source, 1), [])
    XCTAssertEqual(node(walk, 2)["value"] as? String, "visible")
    assertNothingOfThePassword(json(walk.nodes))
  }

  /// The trailer's selected text: never read of a password field or of one that cannot be classified; read of any other.
  func testTheFocusedElementsSelectedTextIsNeverReadOfAPasswordField() {
    var reads = 0
    let read: () -> String? = { reads += 1; return self.plaintext }
    for (role, subrole) in [(kAXTextFieldRole as String?, SubroleRead.subrole("AXSecureTextField")), ("AXSecureTextField", .none),
                            (kAXTextFieldRole, .failed), (nil, .none)] {
      XCTAssertNil(focusedSelectedText(role: { role }, subrole: { subrole }, selectedText: read), "\(String(describing: role)) \(subrole)")
    }
    XCTAssertEqual(reads, 0)
    XCTAssertEqual(focusedSelectedText(role: { kAXTextFieldRole }, subrole: { .none }, selectedText: { "picked" }), "picked")
    XCTAssertNil(focusedSelectedText(role: { kAXTextFieldRole }, subrole: { .none }, selectedText: { "" }))
  }

  /// A password field's token re-resolved after an action, from its handle and, once that is gone, by the re-fetch walk:
  /// neither requests its value attributes, and the renewed identity keeps no value. A plain field beside a twin that
  /// differs only by value still resolves to itself, its value read for the match.
  func testAReResolutionNeverReadsAPasswordField() throws {
    let stub = tree()
    stub.extra[4] = stub.extra[2]
    stub.extra[4]?["AXValue"] = "other" as CFString
    stub.children = [0: [1, 2, 3, 4]]
    let lineage = Lineage()
    let (walk, _) = observe(stub, lineage)
    let fieldToken = try XCTUnwrap(walk.token(of: el(1))), plainToken = try XCTUnwrap(walk.token(of: el(2)))

    var sources: [FakeSource] = []
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: {
      let source = FakeSource(stub)
      sources.append(source)
      return source
    }, tree: { _ in (Engine.element(0), []) })
    for refetch in [Refetch.ifNeeded, .always] {
      let entry = try lineage.resolve(fieldToken, resolver: resolver, refetch: refetch)
      XCTAssertTrue(CFEqual(entry.element, el(1)), "\(refetch)")
    }
    // The handle is gone: the re-fetch walks the window and finds the field rebuilt (6).
    stub.unreadable = [1]
    stub.extra[6] = stub.extra[1]
    stub.children = [0: [6, 2, 3, 4]]
    let rebuilt = try lineage.resolve(fieldToken, resolver: resolver, refetch: .always)
    XCTAssertTrue(CFEqual(rebuilt.element, el(6)))
    XCTAssertNil(rebuilt.identity.value)
    XCTAssertTrue(rebuilt.identity.valueUnread)
    for source in sources {
      XCTAssertEqual(valueRequests(source, 1), [])
      XCTAssertEqual(valueRequests(source, 6), [])
    }

    stub.unreadable = [1, 2]
    stub.extra[7] = stub.extra[2]
    stub.children = [0: [6, 4, 7, 3]]
    let moved = try lineage.resolve(plainToken, resolver: resolver, refetch: .always)
    XCTAssertTrue(CFEqual(moved.element, el(7)), "matched by its value, not its twin's")
    XCTAssertEqual(moved.identity.value, "s:visible")
  }

  /// select_text classifies its field just before reading it: a password field, or one that cannot be classified, is
  /// refused with neither its value nor its attributed text read, so no search can probe what it holds.
  func testSelectTextNeverSearchesAPasswordField() throws {
    for (role, subrole) in [(kAXTextFieldRole, "AXSecureTextField" as String?), ("AXSecureTextField", nil), (nil as String?, nil)] {
      let ax = FakeAX()
      if let role { ax.roles[1] = role }
      if let subrole { ax.subroles[1] = subrole }
      ax.values = [1: [kAXValueAttribute: plaintext as CFString]]
      var ops = ax.ops
      var valueReads = 0
      let read = ops.read
      ops.read = { element, name in
        if name == kAXValueAttribute { valueReads += 1 }
        return read(element, name)
      }
      ops.classifiedSubrole = { _ in ax.subroles[1].map(SubroleRead.subrole) ?? .none }
      var attributedReads = 0
      XCTAssertThrowsError(try selectionSearchText(el(1), observedRole: kAXTextFieldRole, ax: ops, attributed: { _, _ in
        attributedReads += 1
        return nil
      })) { error in XCTAssertEqual((error as? EngineError)?.errorName, "selectionNotSettable") }
      XCTAssertEqual(valueReads + attributedReads, 0, "\(String(describing: role)) \(String(describing: subrole))")
    }
    let ax = FakeAX()
    ax.roles[1] = kAXTextFieldRole
    ax.values = [1: [kAXValueAttribute: "say hi" as CFString]]
    var ops = ax.ops
    ops.classifiedSubrole = { _ in .none }
    XCTAssertEqual(try selectionSearchText(el(1), observedRole: kAXTextFieldRole, ax: ops, attributed: { _, _ in nil }).plain, "say hi")
  }
}
