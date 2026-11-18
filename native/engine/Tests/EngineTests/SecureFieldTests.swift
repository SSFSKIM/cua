import ApplicationServices
import XCTest
@testable import Engine

/// #405: the observation never reads a password field's value, value description, length, Markdown or selection,
/// whatever the app would answer, and a value-bearing attribute is only ever requested beside the role and subrole read
/// again, its whole answer dropped when that classification is closed. The app here is a stub (FakeSource over a
/// FakeTree) that holds PLAINTEXT as a password field's value and, with `answersEverything`, puts all it holds in every
/// answer, asked for or not; each request it gets is logged. Every entry point is covered: the walk, the settle's busy
/// walk and the observation that reuses its reads, the menu bar's listed reads, the focused element's selected text, a
/// token's re-resolution after an action, select_text's search, and the paste's effect reading.
final class SecureFieldTests: XCTestCase {
  private let plaintext = "PLAINTEXT-hunter2-secret"
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  /// A window (0) holding a password field (1), a plain text field (2) and a button (3); the stub answers everything.
  private func tree(subrole: String? = "AXSecureTextField", role: String = kAXTextFieldRole) -> FakeTree {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3]]
    var field: [String: CFTypeRef] = ["AXRole": role as CFString, "AXTitle": "Password" as CFString,
                                      "AXValue": plaintext as CFString, "AXNumberOfCharacters": plaintext.utf16.count as CFNumber,
                                      "AXValueDescription": "PLAINTEXT of length \(plaintext.utf16.count)" as CFString,
                                      "AXSelectedText": plaintext as CFString]
    if let subrole { field["AXSubrole"] = subrole as CFString }
    tree.extra = [1: field,
                  2: ["AXRole": kAXTextFieldRole as CFString, "AXTitle": "Name" as CFString, "AXValue": "visible" as CFString,
                      "AXValueDescription": "plain details" as CFString, "AXNumberOfCharacters": 7 as CFNumber],
                  3: ["AXRole": kAXButtonRole as CFString]]
    tree.settable = [1: [kAXValueAttribute], 2: [kAXValueAttribute]]
    tree.markdown = [1: "**\(plaintext)**", 2: "**visible**"]
    tree.answersEverything = true
    return tree
  }

  private func observe(_ tree: FakeTree, _ lineage: Lineage = Lineage(), source: FakeSource? = nil, menuBar: Int? = nil) -> (TreeWalk, FakeSource) {
    let source = source ?? FakeSource(tree)
    let walk = TreeWalk(source: source, lineage: lineage, limits: WalkLimits(deadline: .infinity), markdown: true, visibleFrame: nil)
    walk.run(window: el(0), menuBar: menuBar.map(el), menuItems: [])
    lineage.commit(walk.revision)
    return (walk, source)
  }

  private func node(_ walk: TreeWalk, _ id: Int) -> [String: Any] {
    (walk.nodes + walk.menuBar).first { $0["token"] as? String == walk.token(of: el(id)) }!
  }

  private func identity(_ walk: TreeWalk, _ lineage: Lineage, _ id: Int) throws -> ElementIdentity {
    try XCTUnwrap(lineage.entry(try XCTUnwrap(tokenNumber(try XCTUnwrap(walk.token(of: el(id))))))).identity
  }

  private func json(_ object: Any) -> String {
    String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!
  }

  /// The requests that asked `id` for a value attribute.
  private func valueRequests(_ source: FakeSource, _ id: Int) -> [[String]] {
    source.requests.filter { $0.id == id && !valueAttributes.isDisjoint(with: $0.names) }.map(\.names)
  }

  /// Every value-bearing request carried the role and subrole (#405's rule).
  private func assertEveryValueRequestClassifies(_ source: FakeSource, file: StaticString = #filePath, line: UInt = #line) {
    for request in source.requests where !valueAttributes.isDisjoint(with: request.names) {
      XCTAssertTrue(classifyingAttributes.allSatisfy(request.names.contains), "\(request)", file: file, line: line)
    }
  }

  private func assertNothingOfThePassword(_ text: String, _ label: String = "", file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertFalse(text.contains("PLAINTEXT"), "the plaintext \(label)", file: file, line: line)
    XCTAssertFalse(text.contains("\"numberOfCharacters\":\(plaintext.utf16.count)"), "its length \(label)", file: file, line: line)
  }

  /// The secure node: marked, settable, and with no value, value description, length or Markdown.
  private func assertSecureNode(_ secure: [String: Any], _ label: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(secure["secure"] as? Bool, true, label, file: file, line: line)
    XCTAssertTrue(secure["value"] is NSNull, label, file: file, line: line)
    XCTAssertTrue(secure["valueType"] is NSNull, label, file: file, line: line)
    XCTAssertTrue(secure["valueMarkdown"] is NSNull, label, file: file, line: line)
    XCTAssertNil(secure["valueDescription"], label, file: file, line: line)
    XCTAssertNil(secure["numberOfCharacters"], label, file: file, line: line)
  }

  /// The walk requests none of a password field's value attributes and no Markdown; its node, its cached read and its
  /// identity carry no value, description or length; the node says `secure` and stays settable. A plain field beside it
  /// reads as before, and its node carries no `secure`.
  func testTheWalkNeverReadsAPasswordFieldAndItsNodeSaysSecure() throws {
    for (role, subrole) in [(kAXTextFieldRole, "AXSecureTextField" as String?), ("AXSecureTextField", nil)] {
      let label = "role \(role), subrole \(subrole ?? "none")"
      let lineage = Lineage()
      let (walk, source) = observe(tree(subrole: subrole, role: role), lineage)

      XCTAssertEqual(valueRequests(source, 1), [], label)
      assertEveryValueRequestClassifies(source)
      XCTAssertEqual(source.markdownCalls, 1, "the plain field's Markdown alone: \(label)")
      assertSecureNode(node(walk, 1), label)
      XCTAssertEqual((node(walk, 1)["flags"] as? [String: Any])?["settable"] as? Bool, true, "a password field stays settable: \(label)")
      assertNothingOfThePassword(json(["nodes": walk.nodes, "menuBar": walk.menuBar]), "in the reply: \(label)")

      let cached = try XCTUnwrap(source.data(el(1)))
      XCTAssertNil(cached.value, label)
      XCTAssertNil(cached.valueDescription, label)
      XCTAssertNil(cached.numberOfCharacters, label)
      XCTAssertTrue(cached.secure && cached.valueUnread, label)
      let identity = try identity(walk, lineage, 1)
      XCTAssertNil(identity.value, label)
      XCTAssertNil(identity.valueDescription, label)
      XCTAssertTrue(identity.valueUnread, label)
      XCTAssertNil(walk.screenshotReads.first { CFEqual($0.element, el(1)) }?.value, label)

      let plain = node(walk, 2)
      XCTAssertNil(plain["secure"], label)
      XCTAssertEqual(plain["value"] as? String, "visible", label)
      XCTAssertEqual(plain["valueDescription"] as? String, "plain details", label)
      XCTAssertEqual(plain["numberOfCharacters"] as? Int, 7, label)
      XCTAssertEqual(plain["valueMarkdown"] as? String, "**visible**", label)
      XCTAssertEqual(Set(plain.keys), ["token", "depth", "pid", "role", "subrole", "roleDescription", "title", "description", "value",
                                       "valueType", "valueMarkdown", "identifier", "flags", "actions", "frame", "children",
                                       "valueDescription", "numberOfCharacters", "actionDescriptions"], "a plain field's node has main's keys: \(label)")
      XCTAssertNil(node(walk, 3)["secure"], label)
    }
  }

  /// A plain element takes one request for its value attributes, beside its role and subrole read again, after the
  /// request for the rest, which carries none of them and classifies it; its Markdown read is classified again first.
  func testTheValueIsRequestedApartAndAfterTheClassification() {
    let (_, source) = observe(tree())
    let field = source.requests.filter { $0.id == 2 }.map(\.names)
    XCTAssertEqual(field.count, 3, "the rest, the value's, the Markdown's classification")
    XCTAssertTrue(valueAttributes.isDisjoint(with: field[0]))
    XCTAssertTrue(classifyingAttributes.allSatisfy(field[0].contains))
    XCTAssertEqual(field[1], classifyingAttributes + [kAXValueAttribute, kAXValueDescriptionAttribute, kAXNumberOfCharactersAttribute])
    XCTAssertEqual(field[2], classifyingAttributes)
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

  /// A field that turns secure between the first request and the value's, or after the value's and before the Markdown
  /// read: neither its node, its cache entry nor its identity keeps anything the earlier requests answered, and the
  /// node says `secure`.
  func testAFieldThatTurnsSecureBetweenRequestsKeepsNothing() throws {
    for turnAfter in [1, 2] {
      let stub = tree(subrole: nil)
      var answered = 0
      stub.answered = { id, _ in
        guard id == 1 else { return }
        answered += 1
        if answered == turnAfter { stub.extra[1]?["AXSubrole"] = "AXSecureTextField" as CFString }
      }
      let lineage = Lineage()
      let (walk, source) = observe(stub, lineage)
      let label = "turned after request \(turnAfter)"
      XCTAssertEqual(source.markdownCalls, 1, "only the plain field's: \(label)")
      assertSecureNode(node(walk, 1), label)
      assertNothingOfThePassword(json(walk.nodes), label)
      let cached = try XCTUnwrap(source.data(el(1)))
      XCTAssertNil(cached.value, label)
      XCTAssertNil(cached.numberOfCharacters, label)
      let identity = try identity(walk, lineage, 1)
      XCTAssertNil(identity.value, label)
      XCTAssertTrue(identity.valueUnread, label)
      XCTAssertNil(walk.screenshotReads.first { CFEqual($0.element, el(1)) }?.value, label)
    }
  }

  /// The settle's busy walk requests no value attributes of any element; the observation that reuses its reads classifies
  /// each element again before its value's request, so a field that turned secure since the busy walk gets none.
  func testTheBusyWalkReadsNoValueAndItsReuseClassifiesAgain() {
    for turns in [false, true] {
      let stub = tree(subrole: turns ? nil : "AXSecureTextField")
      let source = FakeSource(stub)
      XCTAssertEqual(busyWalk(el(0), source: source, visibleFrame: nil, deadline: .infinity).busy, false)
      XCTAssertTrue(source.requests.allSatisfy { valueAttributes.isDisjoint(with: $0.names) })
      XCTAssertTrue(source.requests.allSatisfy { $0.names.contains(kAXChildrenAttribute) }, "one request per element")
      if turns { stub.extra[1]?["AXSubrole"] = "AXSecureTextField" as CFString }

      let (walk, _) = observe(stub, source: source)
      XCTAssertEqual(source.reads, [0: 1, 1: 1, 2: 1, 3: 1], "each element's rest read once, by the busy walk")
      XCTAssertEqual(valueRequests(source, 1), [], "turned secure since the busy walk: \(turns)")
      XCTAssertEqual(source.requests.filter { $0.id == 2 }.map(\.names).dropFirst().first, classifyingAttributes,
                     "a fresh classification before the value's request")
      assertEveryValueRequestClassifies(source)
      assertSecureNode(node(walk, 1), "turned \(turns)")
      XCTAssertEqual(node(walk, 2)["value"] as? String, "visible")
      assertNothingOfThePassword(json(walk.nodes))
    }
  }

  /// A menu-bar element is read through the attributes it lists, but its role and subrole are requested for the
  /// classification whether it lists them or not: one that lists AXValue and not AXSubrole is still never asked for
  /// its value when it is a password field, and its node keeps only what it lists.
  func testAListedReadClassifiesWhateverTheElementLists() {
    let stub = tree()
    stub.extra[90] = stub.extra[1]
    stub.listed = [90: ["AXRole", "AXTitle", "AXChildren", "AXValue", "AXNumberOfCharacters"]]
    let (walk, source) = observe(stub, menuBar: 90)
    XCTAssertEqual(valueRequests(source, 90), [])
    XCTAssertTrue(source.requests.filter { $0.id == 90 }.allSatisfy { classifyingAttributes.allSatisfy($0.names.contains) })
    XCTAssertTrue(node(walk, 90)["subrole"] is NSNull, "an attribute it does not list is not kept")
    assertSecureNode(node(walk, 90), "the menu bar")
    assertNothingOfThePassword(json(walk.menuBar))
  }

  /// The trailer's selected text: never requested of a password field or of one that cannot be classified; requested
  /// beside the role and subrole and dropped when they turn out closed; read of any other.
  func testTheFocusedElementsSelectedTextIsReadOnlyBesideAnOpenClassification() {
    func stub(_ classifications: [[String: CFTypeRef]], unreadable: Set<String> = [], selected: String = plaintext) -> (String?, [[String]]) {
      var requests: [[String]] = []
      let text = focusedSelectedText { names in
        requests.append(names)
        var values = classifications[min(requests.count - 1, classifications.count - 1)]
        values["AXSelectedText"] = selected as CFString
        return AttributeRead(values: values.filter { names.contains($0.key) }, unreadable: unreadable.intersection(names))
      }
      return (text, requests)
    }
    let plain: [String: CFTypeRef] = ["AXRole": kAXTextFieldRole as CFString]
    let secure: [String: CFTypeRef] = ["AXRole": kAXTextFieldRole as CFString, "AXSubrole": "AXSecureTextField" as CFString]
    for (label, run) in [("by subrole", stub([secure])), ("by role", stub([["AXRole": "AXSecureTextField" as CFString]])),
                         ("a failed subrole", stub([plain], unreadable: ["AXSubrole"])), ("no role", stub([[:]]))] {
      XCTAssertNil(run.0, label)
      XCTAssertEqual(run.1, [classifyingAttributes], "only the classification was requested: \(label)")
    }
    let turned = stub([plain, secure])
    XCTAssertNil(turned.0, "turned secure between the classification and the read: dropped")
    XCTAssertEqual(turned.1, [classifyingAttributes, classifyingAttributes + ["AXSelectedText"]])
    XCTAssertEqual(stub([plain], selected: "picked").0, "picked")
    XCTAssertNil(stub([plain], selected: "").0)
  }

  /// A password field's token re-resolved after an action, from its handle and, once that is gone, by the re-fetch walk:
  /// neither requests its value attributes, and the renewed identity keeps no value. A plain field beside a twin that
  /// differs only by value still resolves to itself; and a candidate whose value could not be read is no match for a
  /// token whose value counts.
  func testAReResolutionNeverReadsAPasswordFieldNorMatchesAnUnreadValue() throws {
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
      assertEveryValueRequestClassifies(source)
    }

    // A control like the plain field whose value read fails is not taken for it.
    stub.unreadable = [1, 2]
    stub.extra[8] = stub.extra[2]
    stub.extra[8]?["AXValue"] = "different" as CFString
    stub.valueRequestsFail = [8]
    stub.children = [0: [6, 4, 8, 3]]
    XCTAssertThrowsError(try lineage.resolve(plainToken, resolver: resolver, refetch: .always)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid")
    }
    stub.valueRequestsFail = []
    stub.extra[7] = stub.extra[2]
    stub.children = [0: [6, 4, 8, 7, 3]]
    let moved = try lineage.resolve(plainToken, resolver: resolver, refetch: .always)
    XCTAssertTrue(CFEqual(moved.element, el(7)), "matched by its value, not its twins'")
    XCTAssertEqual(moved.identity.value, "s:visible")
  }

  /// select_text reads its field's value only beside an open classification of it, and classifies it again just before
  /// the attributed read: a password field, or one that cannot be classified, at either point is refused, with nothing
  /// more of it read, so no search can probe what it holds.
  func testSelectTextNeverSearchesAPasswordField() throws {
    func run(_ classifications: [[String: CFTypeRef]], value: String = plaintext) -> (Result<String?, Error>, requests: [[String]], attributed: Int) {
      var requests: [[String]] = []
      var attributed = 0
      var ops = FakeAX().ops
      ops.batch = { _, names in
        requests.append(names)
        var values = classifications[min(requests.count - 1, classifications.count - 1)]
        values[kAXValueAttribute] = value as CFString
        return AttributeRead(values: values.filter { names.contains($0.key) })
      }
      let result = Result {
        try selectionSearchText(self.el(1), observedRole: kAXTextFieldRole, ax: ops, attributed: { _, _ in
          attributed += 1
          return nil
        }).plain
      }
      return (result, requests, attributed)
    }
    let plain: [String: CFTypeRef] = ["AXRole": kAXTextFieldRole as CFString]
    let secure: [String: CFTypeRef] = ["AXRole": kAXTextFieldRole as CFString, "AXSubrole": "AXSecureTextField" as CFString]
    func refused(_ result: Result<String?, Error>) -> Bool {
      if case .failure(let error) = result { return (error as? EngineError)?.errorName == "selectionNotSettable" }
      return false
    }
    for (label, classifications) in [("by subrole", [secure]), ("by role", [["AXRole": "AXSecureTextField" as CFString]]), ("no role", [[:]])] {
      let outcome = run(classifications)
      XCTAssertTrue(refused(outcome.0), label)
      XCTAssertEqual(outcome.requests, [classifyingAttributes], label)
      XCTAssertEqual(outcome.attributed, 0, label)
    }
    let duringValue = run([plain, secure])
    XCTAssertTrue(refused(duringValue.0), "turned secure in the value's batch")
    XCTAssertEqual(duringValue.attributed, 0)
    let beforeMarkdown = run([plain, plain, secure])
    XCTAssertTrue(refused(beforeMarkdown.0), "turned secure before the attributed read")
    XCTAssertEqual(beforeMarkdown.requests, [classifyingAttributes, classifyingAttributes + [kAXValueAttribute], classifyingAttributes])
    XCTAssertEqual(beforeMarkdown.attributed, 0)
    let open = run([plain], value: "say hi")
    XCTAssertEqual(try open.0.get(), "say hi")
    XCTAssertEqual(open.attributed, 1)
  }

  /// The paste's effect reading of a password field: its numbers never leave the engine (the meta's records say only that
  /// it is one), and inside it a reading confirms only a count moved by exactly the paste, less the selection it replaced.
  func testAPasswordFieldsPasteReadingStaysInTheEngine() {
    let baseline = EffectReading(range: [7, 2], characters: 9, secure: true)
    XCTAssertTrue(pasteEffectSeen(EffectReading(range: [13, 0], characters: 13, secure: true), baseline: baseline, units: 6))
    XCTAssertFalse(pasteEffectSeen(EffectReading(range: [12, 0], characters: 12, secure: true), baseline: baseline, units: 6),
                   "a count off by one is no paste")
    XCTAssertFalse(pasteEffectSeen(EffectReading(range: [7, 2], characters: 9, secure: false), baseline: baseline, units: 6),
                   "a field that turned plain without moving is no paste")
    XCTAssertTrue(pasteEffectSeen(EffectReading(range: [12, 0], characters: 12), baseline: EffectReading(range: [7, 2], characters: 9), units: 6),
                  "a plain field keeps the change rule")
    XCTAssertTrue(pasteEffectSeen(EffectReading(range: [3, 0], secure: true), baseline: EffectReading(range: [0, 0], secure: true), units: 6),
                  "with no count, the change rule")

    for closed in [true, false] {
      let reading = focusedEffectReading(1, bound: { _ in true }, closed: { _ in closed }, range: { _ in [24, 0] }, characters: { _ in 24 })
      XCTAssertEqual(reading, EffectReading(range: [24, 0], characters: 24, secure: closed), "read to judge the paste, marked when closed")
      XCTAssertEqual(reading?.wire["characters"] == nil, closed)
    }

    var record = PasteDiagnostics(line: 1, lines: 1, notificationSource: .none, baselineEmpty: false, focusEnforcement: nil, unconfirmedLines: 0)
    record.baseline = baseline
    record.confirming = EffectReading(range: [13, 0], characters: 13, secure: true)
    record.earlier = [record]
    for wire in [record.wire, record.lineWire] {
      let text = json(wire)
      XCTAssertFalse(text.contains("\"characters\"") || text.contains("\"range\""), text)
      XCTAssertTrue(text.contains("\"secure\":true"), text)
    }
  }
}
