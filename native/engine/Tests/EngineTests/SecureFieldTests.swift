import ApplicationServices
import XCTest
@testable import Engine

/// #405 under design ruling 1ea561bc:811: each element is read in one batch carrying its role, subrole and value-bearing
/// attributes, classified from that same reply, and a password field's (or an unclassifiable element's) value attributes
/// are dropped from the reply before anything keeps or formats them. The app here is a stub (FakeSource over a FakeTree)
/// that holds PLAINTEXT as a password field's value and, with `answersEverything`, puts all it holds in every answer,
/// asked for or not, even beside a slot it reports failed; each request it gets is logged. What is asserted is that
/// nothing is emitted or retained: no node or reply, cache entry, identity, rendered text, error sentence or stderr line
/// carries the plaintext or its length. Every entry point is covered: the walk, the settle's busy walk and the
/// observation that reuses its reads, the menu bar's listed reads, the focused element's selected text, a token's
/// re-resolution, select_text's search, and the paste's effect reading.
final class SecureFieldTests: XCTestCase {
  /// The fixture password: 41 UTF-16 units, a length no other text in these tests carries (#405's checks look for it).
  private let plaintext = "PLAINTEXT-hunter2-secret-" + String(repeating: "z", count: 16)
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
                  3: ["AXRole": kAXButtonRole as CFString, "AXTitle": "Sign in" as CFString]]
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

  /// Every request that asked for a value attribute carried the role and subrole that classify the reply.
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

  /// The cached read and the identity of `id` keep nothing of its value, and are a password field's (`secure`) or, for
  /// another role whose classification failed, not.
  private func assertNothingRetained(_ walk: TreeWalk, _ lineage: Lineage, _ source: FakeSource, _ id: Int, _ label: String,
                                     secure: Bool = true, file: StaticString = #filePath, line: UInt = #line) throws {
    let cached = try XCTUnwrap(source.data(el(id)), file: file, line: line)
    XCTAssertNil(cached.value, label, file: file, line: line)
    XCTAssertNil(cached.valueDescription, label, file: file, line: line)
    XCTAssertNil(cached.numberOfCharacters, label, file: file, line: line)
    XCTAssertTrue(cached.valueUnread, label, file: file, line: line)
    XCTAssertTrue(cached.unreadable.isDisjoint(with: valueAttributes), "the value attributes never reached the decoding: \(label)",
                  file: file, line: line)
    XCTAssertEqual(cached.secure, secure, label, file: file, line: line)
    let identity = try identity(walk, lineage, id)
    XCTAssertNil(identity.value, label, file: file, line: line)
    XCTAssertNil(identity.valueDescription, label, file: file, line: line)
    XCTAssertTrue(identity.valueUnread, label, file: file, line: line)
    XCTAssertEqual(identity.secure, secure, label, file: file, line: line)
    XCTAssertNil(walk.screenshotReads.first { CFEqual($0.element, el(id)) }?.value, label, file: file, line: line)
  }

  /// One batch per element, carrying the role, subrole and value attributes; a password field's node, cached read and
  /// identity keep nothing of its value, description or length; the node says `secure` and stays settable, and its
  /// Markdown is never read. A plain field beside it reads as before, and its node carries no `secure`.
  func testTheWalkKeepsNothingOfAPasswordFieldAndItsNodeSaysSecure() throws {
    for (role, subrole, masked) in [(kAXTextFieldRole, "AXSecureTextField" as String?, false), ("AXSecureTextField", nil, false),
                                    (kAXTextFieldRole, "AXSecureTextField", true)] {
      let label = "role \(role), subrole \(subrole ?? "none"), masks \(masked)"
      let lineage = Lineage()
      let stub = tree(subrole: subrole, role: role)
      if masked { stub.extra[1]?["AXValue"] = String(repeating: "\u{2022}", count: plaintext.utf16.count) as CFString }
      let (walk, source) = observe(stub, lineage)
      XCTAssertFalse(json(walk.nodes).contains(String(repeating: "\u{2022}", count: plaintext.utf16.count)), "no masks: \(label)")

      XCTAssertEqual(source.requests.filter { $0.id == 1 }.count, 1, "one batch: \(label)")
      assertEveryValueRequestClassifies(source)
      XCTAssertEqual(source.markdownCalls, 1, "the plain field's Markdown alone: \(label)")
      assertSecureNode(node(walk, 1), label)
      XCTAssertEqual((node(walk, 1)["flags"] as? [String: Any])?["settable"] as? Bool, true, "a password field stays settable: \(label)")
      assertNothingOfThePassword(json(["nodes": walk.nodes, "menuBar": walk.menuBar]), "in the reply: \(label)")
      try assertNothingRetained(walk, lineage, source, 1, label)

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

  /// A plain element takes one request (its whole batch, the value's attributes and the role and subrole in it); its
  /// Markdown read, which no batch can carry, is classified just before by a request of its own.
  func testEachElementTakesOneBatch() {
    let (_, source) = observe(tree())
    let field = source.requests.filter { $0.id == 2 }.map(\.names)
    XCTAssertEqual(field.count, 2, "the batch, then the Markdown's classification")
    XCTAssertTrue(valueAttributes.isSubset(of: field[0]) && classifyingAttributes.allSatisfy(field[0].contains))
    XCTAssertEqual(field[1], classifyingAttributes)
    XCTAssertEqual(source.requests.filter { $0.id == 3 }.count, 1)
  }

  /// An element whose classification fails keeps nothing of its value, even beside plaintext the app put in the reply
  /// (rulings 811, 813): a text field whose subrole cannot be read, or any element whose role cannot be read, is
  /// presumed a password field (`secure text`); a button whose subrole cannot be read cannot be one, so its node says
  /// only `valueUnread`. A password field whose AXValue slot reports a failure beside plaintext keeps none of it either.
  func testAnUnclassifiableElementOrAFailedSlotKeepsNothing() throws {
    for (label, id, unreadable, subrole) in [("text field, subrole unreadable", 1, "AXSubrole", nil as String?),
                                             ("role unreadable", 1, "AXRole", nil),
                                             ("secure, value slot failed", 1, kAXValueAttribute, "AXSecureTextField"),
                                             ("button, subrole unreadable", 3, "AXSubrole", "AXSecureTextField")] {
      let stub = tree(subrole: subrole)
      if id == 3 { stub.extra[3]?["AXValue"] = plaintext as CFString }
      stub.unreadableAttributes = [id: [unreadable]]
      let lineage = Lineage()
      let (walk, source) = observe(stub, lineage)
      if id == 3 {
        let button = node(walk, 3)
        XCTAssertEqual(button["valueUnread"] as? Bool, true, label)
        XCTAssertNil(button["secure"], label)
        XCTAssertTrue(button["value"] is NSNull, label)
        try assertNothingRetained(walk, lineage, source, 3, label, secure: false)
      } else {
        XCTAssertEqual(source.markdownCalls, 1, label)
        assertSecureNode(node(walk, 1), label)
        XCTAssertNil(node(walk, 1)["valueUnread"], label)
        try assertNothingRetained(walk, lineage, source, 1, label)
      }
      assertNothingOfThePassword(json(walk.nodes), label)
    }
  }

  /// Two same-labelled fields whose classifications both failed are redacted alike, but neither is taken for the other:
  /// a closure by failure matches only another such, for the same handle; a closure by a password field's own subrole
  /// matches across handles as any identity does.
  func testAClosureByFailureMatchesOnlyTheSameHandle() throws {
    func identity(failed: Bool) -> ElementIdentity {
      var data = ElementData(values: ["AXRole": kAXTextFieldRole as CFString, "AXTitle": "Field" as CFString])
      data.secure = true
      data.classificationFailed = failed
      data.valueUnread = true
      data.descriptionUnread = true
      return ElementIdentity(data, pid: 1)
    }
    XCTAssertFalse(identity(failed: true).matches(identity(failed: true)), "another handle")
    XCTAssertTrue(identity(failed: true).matches(identity(failed: true), sameElement: true))
    XCTAssertFalse(identity(failed: true).matches(identity(failed: false), sameElement: true), "a failure is not a password field read")
    XCTAssertTrue(identity(failed: false).matches(identity(failed: false)))

    let stub = tree(subrole: nil)
    stub.unreadableAttributes = [1: ["AXSubrole"]]
    let lineage = Lineage()
    let (walk, _) = observe(stub, lineage)
    let token = try XCTUnwrap(walk.token(of: el(1)))
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(stub) },
                                   tree: { _ in (Engine.element(0), []) })
    XCTAssertTrue(CFEqual(try lineage.resolve(token, resolver: resolver).element, el(1)), "its own handle")
    stub.unreadable = [1]
    stub.extra[11] = stub.extra[1]
    stub.unreadableAttributes = [11: ["AXSubrole"]]
    stub.children = [0: [11, 2, 3]]
    XCTAssertThrowsError(try lineage.resolve(token, resolver: resolver, refetch: .always)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "elementNoLongerValid")
    }
  }

  /// A plain field read with its value, which turns secure, or whose classification fails, just before its Markdown
  /// read: neither its node, its cache entry nor its identity keeps what the earlier batch answered.
  func testAFieldClosedBeforeItsMarkdownKeepsNothing() throws {
    for turn in ["secure", "unclassifiable"] {
      let stub = tree(subrole: nil)
      stub.answered = { id, _ in
        guard id == 1 else { return }
        if turn == "secure" { stub.extra[1]?["AXSubrole"] = "AXSecureTextField" as CFString } else { stub.classificationRequestsFail = [1] }
      }
      let lineage = Lineage()
      let (walk, source) = observe(stub, lineage)
      XCTAssertEqual(source.markdownCalls, 1, "only the plain field's: \(turn)")
      assertSecureNode(node(walk, 1), turn)
      assertNothingOfThePassword(json(walk.nodes), turn)
      try assertNothingRetained(walk, lineage, source, 1, turn)
    }
  }

  /// The settle's busy walk reads each element's one batch, and the observation that reuses its reads makes none again;
  /// the password field keeps nothing either way.
  func testTheBusyWalkAndItsReuseKeepNothing() throws {
    let stub = tree()
    let source = FakeSource(stub)
    XCTAssertEqual(busyWalk(el(0), source: source, visibleFrame: nil, deadline: .infinity).busy, false)
    let lineage = Lineage()
    let (walk, _) = observe(stub, lineage, source: source)
    XCTAssertEqual(source.reads, [0: 1, 1: 1, 2: 1, 3: 1], "each element read once, by the busy walk")
    assertEveryValueRequestClassifies(source)
    assertSecureNode(node(walk, 1), "reused")
    XCTAssertEqual(node(walk, 2)["value"] as? String, "visible")
    assertNothingOfThePassword(json(walk.nodes))
    try assertNothingRetained(walk, lineage, source, 1, "reused")
  }

  /// A menu-bar element is read through the attributes it lists, but its role and subrole are requested in its batch
  /// whether it lists them or not: one that lists AXValue and not AXSubrole keeps nothing of its value when it is a
  /// password field, and its node keeps only what it lists.
  func testAListedReadClassifiesWhateverTheElementLists() {
    let stub = tree()
    stub.extra[90] = stub.extra[1]
    stub.listed = [90: ["AXRole", "AXTitle", "AXChildren", "AXValue", "AXNumberOfCharacters"]]
    let (walk, source) = observe(stub, menuBar: 90)
    XCTAssertTrue(source.requests.filter { $0.id == 90 }.allSatisfy { classifyingAttributes.allSatisfy($0.names.contains) })
    XCTAssertTrue(node(walk, 90)["subrole"] is NSNull, "an attribute it does not list is not kept")
    assertSecureNode(node(walk, 90), "the menu bar")
    assertNothingOfThePassword(json(walk.menuBar))
  }

  /// The trailer's selected text: read in one batch with the role and subrole, and dropped when that reply classifies
  /// the element closed.
  func testTheFocusedElementsSelectedTextIsDroppedWithAClosedClassification() {
    func stub(_ classification: [String: CFTypeRef], unreadable: Set<String> = [], selected: String = plaintext) -> (String?, [[String]]) {
      var requests: [[String]] = []
      let text = focusedSelectedText { names in
        requests.append(names)
        var values = classification
        values["AXSelectedText"] = selected as CFString
        return AttributeRead(values: values, unreadable: unreadable)
      }
      return (text, requests)
    }
    let plain: [String: CFTypeRef] = ["AXRole": kAXTextFieldRole as CFString]
    for (label, run) in [("by subrole", stub(["AXRole": kAXTextFieldRole as CFString, "AXSubrole": "AXSecureTextField" as CFString])),
                         ("by role", stub(["AXRole": "AXSecureTextField" as CFString])),
                         ("a failed subrole", stub(plain, unreadable: ["AXSubrole"])), ("no role", stub([:]))] {
      XCTAssertNil(run.0, label)
      XCTAssertEqual(run.1, [classifyingAttributes + ["AXSelectedText"]], "one batch: \(label)")
    }
    XCTAssertEqual(stub(plain, selected: "picked").0, "picked")
    XCTAssertNil(stub(plain, selected: "").0)
  }

  /// A password field's token re-resolved after an action, from its handle and, once that is gone, by the re-fetch walk:
  /// the renewed identity keeps no value. A plain field beside a twin that differs only by value still resolves to
  /// itself; and a candidate whose value could not be read is no match for a token whose value counts.
  func testAReResolutionKeepsNothingOfAPasswordFieldNorMatchesAnUnreadValue() throws {
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
      XCTAssertNil(entry.identity.value)
    }
    // The handle is gone: the re-fetch walks the window and finds the field rebuilt (6).
    stub.unreadable = [1]
    stub.extra[6] = stub.extra[1]
    stub.children = [0: [6, 2, 3, 4]]
    let rebuilt = try lineage.resolve(fieldToken, resolver: resolver, refetch: .always)
    XCTAssertTrue(CFEqual(rebuilt.element, el(6)))
    XCTAssertNil(rebuilt.identity.value)
    XCTAssertTrue(rebuilt.identity.valueUnread && rebuilt.identity.secure)
    for source in sources {
      assertEveryValueRequestClassifies(source)
      for id in [1, 6] { XCTAssertNil(source.data(el(id))?.value) }
    }

    // A control like the plain field whose value slot fails is not taken for it.
    stub.unreadable = [1, 2]
    stub.extra[8] = stub.extra[2]
    stub.extra[8]?["AXValue"] = "different" as CFString
    stub.unreadableAttributes = [8: [kAXValueAttribute]]
    stub.children = [0: [6, 4, 8, 3]]
    XCTAssertThrowsError(try lineage.resolve(plainToken, resolver: resolver, refetch: .always)) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "elementNoLongerValid")
    }
    stub.unreadableAttributes = [:]
    stub.extra[7] = stub.extra[2]
    stub.children = [0: [6, 4, 8, 7, 3]]
    let moved = try lineage.resolve(plainToken, resolver: resolver, refetch: .always)
    XCTAssertTrue(CFEqual(moved.element, el(7)), "matched by its value, not its twins'")
    XCTAssertEqual(moved.identity.value, "s:visible")
  }

  /// select_text reads its field's value in one batch with the role and subrole, and classifies it again just before the
  /// attributed read: a password field, or one that cannot be classified, at either point, or a classification that
  /// fails before the attributed read, is refused with nothing searched, so no search can probe what it holds.
  func testSelectTextNeverSearchesAPasswordField() throws {
    func run(_ classifications: [[String: CFTypeRef]?], value: String = plaintext) -> (Result<String?, Error>, requests: [[String]], attributed: Int) {
      var requests: [[String]] = []
      var attributed = 0
      var ops = FakeAX().ops
      ops.batch = { _, names in
        requests.append(names)
        guard var values = classifications[min(requests.count - 1, classifications.count - 1)] else { return nil }
        values[kAXValueAttribute] = value as CFString
        return AttributeRead(values: values)
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
      if case .failure(let error) = result { return (error as? EngineError)?.errorName == "selectionNotSettable" && !"\(error)".contains("PLAINTEXT") }
      return false
    }
    for (label, classifications) in [("by subrole", [secure]), ("by role", [["AXRole": "AXSecureTextField" as CFString]]), ("no role", [[:]])] {
      let outcome = run(classifications)
      XCTAssertTrue(refused(outcome.0), label)
      XCTAssertEqual(outcome.requests, [classifyingAttributes + [kAXValueAttribute]], label)
      XCTAssertEqual(outcome.attributed, 0, label)
    }
    for (label, second) in [("turned secure", secure as [String: CFTypeRef]?), ("classification failed", nil)] {
      let outcome = run([plain, second])
      XCTAssertTrue(refused(outcome.0), "before the attributed read: \(label)")
      XCTAssertEqual(outcome.requests, [classifyingAttributes + [kAXValueAttribute], classifyingAttributes], label)
      XCTAssertEqual(outcome.attributed, 0, label)
    }
    let open = run([plain], value: "say hi")
    XCTAssertEqual(try open.0.get(), "say hi")
    XCTAssertEqual(open.attributed, 1)
  }

  /// No error sentence and no stderr line carries the password: an observation, every resolution (found, refused) and
  /// select_text's refusal run with the engine's stderr captured.
  func testNoErrorOrStderrLineCarriesThePassword() throws {
    var errors: [String] = []
    func record(_ error: Error) {
      // The error as the wire carries it, and as anything printing it would.
      errors.append("\(error)")
      if let error = error as? EngineError { errors.append(json(error.wire)) }
    }
    let captured = try capturingStderr {
      let stub = tree()
      let lineage = Lineage()
      let (walk, _) = observe(stub, lineage)
      let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(stub) },
                                     tree: { _ in (Engine.element(0), []) })
      let fieldToken = try XCTUnwrap(walk.token(of: el(1)))
      _ = try lineage.resolve(fieldToken, resolver: resolver, refetch: .always)
      stub.unreadable = [1]
      stub.unreadableAttributes = [6: [kAXValueAttribute]]
      stub.extra[6] = stub.extra[1]
      stub.extra[6]?["AXSubrole"] = nil
      stub.children = [0: [6, 2, 3]]
      do { _ = try lineage.resolve(fieldToken, resolver: resolver, refetch: .always) } catch { record(error) }
      var ops = FakeAX().ops
      ops.batch = { _, _ in AttributeRead(values: ["AXRole": "AXSecureTextField" as CFString, kAXValueAttribute: self.plaintext as CFString]) }
      do { _ = try selectionSearchText(el(1), observedRole: kAXTextFieldRole, ax: ops, attributed: { _, _ in nil }) } catch { record(error) }
    }
    XCTAssertEqual(errors.count, 4)
    let length = plaintext.utf16.count
    for text in errors + [captured] {
      assertNothingOfThePassword(text)
      XCTAssertFalse(text.contains("\(length)"), "the length in any form: \(text)")
      for mask in ["\u{2022}", "\u{F79A}"] { XCTAssertFalse(text.contains(String(repeating: mask, count: length)), "its masks: \(text)") }
    }
  }

  /// Runs `body` with the process's stderr sent to a file, and answers what it wrote.
  private func capturingStderr(_ body: () throws -> Void) throws -> String {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("secure-field-stderr-\(UUID().uuidString)")
    FileManager.default.createFile(atPath: url.path, contents: nil)
    guard FileManager.default.fileExists(atPath: url.path) else { throw CaptureFailed() }
    let file = try FileHandle(forWritingTo: url)
    defer {
      try? file.close()
      try? FileManager.default.removeItem(at: url)
    }
    let saved = dup(STDERR_FILENO)
    guard saved >= 0, dup2(file.fileDescriptor, STDERR_FILENO) >= 0 else { throw CaptureFailed() }
    defer {
      dup2(saved, STDERR_FILENO)
      close(saved)
    }
    try body()
    fflush(stderr)
    guard let text = String(data: try Data(contentsOf: url), encoding: .utf8) else { throw CaptureFailed() }
    return text
  }
  private struct CaptureFailed: Error {}

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

    // Role, subrole, range and count in one batch, the numbers marked by that batch's own classification.
    var range = CFRange(location: 24, length: 0)
    let rangeValue = AXValueCreate(.cfRange, &range)!
    for (label, classification, unreadable, secure) in [
      ("plain", ["AXRole": kAXTextFieldRole as CFString], Set<String>(), false),
      ("password", ["AXRole": kAXTextFieldRole as CFString, "AXSubrole": "AXSecureTextField" as CFString], [], true),
      ("subrole unreadable", ["AXRole": kAXTextFieldRole as CFString], ["AXSubrole"], true),
    ] as [(String, [String: CFTypeRef], Set<String>, Bool)] {
      var requests: [[String]] = []
      let reading = focusedEffectReading(1, bound: { _ in true }) { _, names in
        requests.append(names)
        var values = classification
        values[kAXSelectedTextRangeAttribute] = rangeValue
        values[kAXNumberOfCharactersAttribute] = 24 as CFNumber
        return AttributeRead(values: values, unreadable: unreadable)
      }
      XCTAssertEqual(requests, [classifyingAttributes + [kAXSelectedTextRangeAttribute, kAXNumberOfCharactersAttribute]], label)
      XCTAssertEqual(reading, EffectReading(range: [24, 0], characters: 24, secure: secure), "read to judge the paste: \(label)")
      XCTAssertEqual(reading?.wire["characters"] == nil, secure, label)
    }
    XCTAssertNil(focusedEffectReading(1, bound: { _ in true }) { _, _ in nil }, "a failed batch is no reading")

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

  /// Movement is the numbers': a reading whose `secure` mark alone flipped moved nothing in the wait (a Return's settle,
  /// which also judged it, went with #361's read-back). A trusted notification does not confirm a password field's paste when its count decides: it can only
  /// prompt the reading, which must show the count moved by the paste. The count is judged against the plain text the
  /// field takes, not a markup source.
  func testAPasswordFieldsPasteIsJudgedByItsNumbersAlone() {
    XCTAssertFalse(pasteEffectSeen(EffectReading(range: [0, 0], secure: true), baseline: EffectReading(range: [0, 0]), units: 6))
    XCTAssertFalse(pasteEffectSeen(EffectReading(range: [0, 0], secure: false), baseline: EffectReading(range: [0, 0], secure: true), units: nil))

    var clock = 0.0
    var reading = EffectReading(range: [0, 0], characters: 0, secure: true)
    func effect(_ source: NotificationSource) -> PasteEffect {
      PasteEffect(source: source, read: { reading }, now: { clock }, sleep: { clock += $0 })
    }
    let flipped = effect(.none)
    flipped.begin()
    reading.secure = false
    XCTAssertEqual(flipped.wait(timeoutMs: 100, intervalMs: 25), .timeout, "only the mark changed")

    for (after, outcome) in [(3, EffectOutcome.timeout), (6, .reading)] {
      reading = EffectReading(range: [0, 0], characters: 0, secure: true)
      let trusted = effect(.trusted)
      trusted.begin()
      trusted.providerRead()
      trusted.pasteStarted()
      reading = EffectReading(range: [after, 0], characters: after, secure: true)
      trusted.notification()
      XCTAssertEqual(trusted.wait(timeoutMs: 100, intervalMs: 25, units: 6), outcome, "count \(after) after a notification")
    }
    reading = EffectReading(range: [0, 0], characters: 0, secure: false)
    let plain = effect(.trusted)
    plain.begin()
    plain.providerRead()
    plain.pasteStarted()
    plain.notification()
    XCTAssertEqual(plain.wait(timeoutMs: 100, intervalMs: 25, units: 6), .notification, "a plain field keeps the notification's rule")

    XCTAssertEqual(deliveredUnits([PasteRepresentation(type: .html, data: Data("<b>hunter</b>".utf8)),
                                   PasteRepresentation(type: .string, data: Data("hunter".utf8))]), 6)
    XCTAssertNil(deliveredUnits([PasteRepresentation(type: .html, data: Data("<b>x</b>".utf8))]))
  }

  /// A replacement the batch cannot classify (its subrole slot failed) is treated as a password field and is no match for
  /// a plain field's token; nor is the field itself once it turned secure; nor a valueless button's replacement whose
  /// AXValue slot failed.
  func testAnUnclassifiedOrChangedOrUnverifiedReplacementMatchesNothing() throws {
    let stub = tree()
    let lineage = Lineage()
    let (walk, _) = observe(stub, lineage)
    let plainToken = try XCTUnwrap(walk.token(of: el(2))), buttonToken = try XCTUnwrap(walk.token(of: el(3)))
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(stub) },
                                   tree: { _ in (Engine.element(0), []) })
    func refused(_ token: String, _ label: String) {
      XCTAssertThrowsError(try lineage.resolve(token, resolver: resolver, refetch: .always), label) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "elementNoLongerValid", label)
      }
    }

    stub.unreadable = [2]
    stub.extra[9] = stub.extra[2]
    stub.unreadableAttributes = [9: ["AXSubrole"]]
    stub.children = [0: [1, 9, 3]]
    refused(plainToken, "unclassifiable replacement")

    stub.unreadable = [2, 3]
    stub.extra[10] = stub.extra[3]
    stub.unreadableAttributes = [10: [kAXValueAttribute]]
    stub.children = [0: [1, 9, 10]]
    refused(buttonToken, "a button whose value slot failed")

    stub.unreadable = []
    stub.unreadableAttributes = [:]
    stub.children = [0: [1, 2, 3]]
    stub.extra[2]?["AXSubrole"] = "AXSecureTextField" as CFString
    refused(plainToken, "the field turned secure")
  }

  /// The value description is left out of a match only when it was not read: a field renewed by a source that leaves
  /// out only AXValue (#390's set_value) is still told from a twin by its description.
  func testTheValueDescriptionIsLeftOutOnlyWhenUnread() {
    func identity(_ description: String, valueUnread: Bool = true, descriptionUnread: Bool = false) -> ElementIdentity {
      var data = ElementData(values: ["AXRole": kAXTextFieldRole as CFString, "AXValueDescription": description as CFString])
      data.valueUnread = valueUnread
      data.descriptionUnread = descriptionUnread
      return ElementIdentity(data, pid: 1)
    }
    XCTAssertFalse(identity("one").matches(identity("two", valueUnread: false)))
    XCTAssertTrue(identity("one").matches(identity("one", valueUnread: false)))
    XCTAssertTrue(identity("one", descriptionUnread: true).matches(identity("two")), "not read: left out")
  }

  /// A password field's identity matches only a password field's, whatever role and subrole each kept; and two reads
  /// that both failed make a match only for the same handle, never another element with the same labels.
  func testAnIdentityKeepsTheClassificationAndTwoFailuresMatchOnlyTheSameHandle() throws {
    func identity(secure: Bool = false, valueFailed: Bool = false, descriptionFailed: Bool = false) -> ElementIdentity {
      var data = ElementData(values: ["AXRole": kAXTextFieldRole as CFString, "AXTitle": "Password" as CFString])
      data.secure = secure
      data.valueUnread = secure
      data.descriptionUnread = secure
      data.valueFailed = valueFailed
      data.descriptionFailed = descriptionFailed
      return ElementIdentity(data, pid: 1)
    }
    XCTAssertFalse(identity(secure: true).matches(identity()), "a plain field is not the password field")
    XCTAssertFalse(identity().matches(identity(secure: true)))
    XCTAssertTrue(identity(secure: true).matches(identity(secure: true)))
    for (value, description) in [(true, false), (false, true)] {
      let failed = identity(valueFailed: value, descriptionFailed: description)
      XCTAssertFalse(failed.matches(failed), "another handle: value \(value)")
      XCTAssertTrue(failed.matches(failed, sameElement: true), "the same handle: value \(value)")
      XCTAssertFalse(failed.matches(identity(), sameElement: true), "a failure never matches a read: value \(value)")
    }

    // Through a resolution: a field whose value slot fails at the observation and again at its re-read is still itself
    // by its own handle.
    let stub = tree()
    stub.answersEverything = false
    stub.unreadableAttributes = [2: [kAXValueAttribute]]
    let lineage = Lineage()
    let (walk, _) = observe(stub, lineage)
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: { FakeSource(stub) },
                                   tree: { _ in (Engine.element(0), []) })
    XCTAssertTrue(CFEqual(try lineage.resolve(try XCTUnwrap(walk.token(of: el(2))), resolver: resolver).element, el(2)))
  }

  /// A password field's paste is confirmed only by a count it read: a failed poll is no reading, and a reading that lost
  /// its count, or both numbers, is no movement in the wait.
  func testAPasswordFieldsPasteNeedsANumberItRead() {
    let baseline = EffectReading(range: [8, 0], characters: 8, secure: true)
    XCTAssertFalse(EffectReading(secure: true).moved(from: baseline))
    XCTAssertFalse(EffectReading(range: [8, 0], secure: true).moved(from: baseline))
    XCTAssertFalse(pasteEffectSeen(EffectReading(range: [13, 0], secure: true), baseline: baseline, units: 5), "the count lost")
    XCTAssertTrue(pasteEffectSeen(EffectReading(range: [13, 0], characters: 13, secure: true), baseline: baseline, units: 5))

    var clock = 0.0
    var failing = false
    var range = CFRange(location: 8, length: 0)
    let answer = AttributeRead(values: ["AXRole": kAXTextFieldRole as CFString, "AXSubrole": "AXSecureTextField" as CFString,
                                        kAXSelectedTextRangeAttribute: AXValueCreate(.cfRange, &range)!, kAXNumberOfCharactersAttribute: 8 as CFNumber])
    let effect = PasteEffect(readWithin: { _ in focusedEffectReading(1, bound: { _ in true }) { _, _ in failing ? nil : answer } },
                             now: { clock }, sleep: { clock += $0 })
    effect.begin()
    XCTAssertEqual(effect.baselineReading, baseline)
    failing = true   // the baseline read, then every poll's batch fails
    XCTAssertEqual(effect.wait(timeoutMs: 100, intervalMs: 25, units: 5), .timeout)
  }
}
