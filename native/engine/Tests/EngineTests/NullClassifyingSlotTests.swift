import ApplicationServices
import XCTest
@testable import Engine

/// #501 (rulings 1083, 1131): a batched read whose AXSubrole or AXRole slot holds kCFNull, injected where the reply is
/// decoded (`AttributeRead.decode`, the fake source's `nullAttributes`). A null subrole is unread: a text-entry role with
/// one is presumed a password field, as #405 presumes one whose subrole read failed, and another role is closed but not
/// secure. A null role is unknown, never a known inert node.
final class NullClassifyingSlotTests: XCTestCase {
  private let plaintext = "PLAINTEXT-null-subrole"
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  /// One reply as the batched read decodes it: the role as text, or kCFNull; the subrole as text, kCFNull or absent.
  private func decoded(role: String?, subrole: String??) -> AttributeRead {
    var code = AXError.noValue
    let absent = AXValueCreate(.axError, &code)!
    var read = AttributeRead()
    read.decode(kAXRoleAttribute, role.map { $0 as CFString } ?? kCFNull)
    switch subrole {
    case .none: read.decode(kAXSubroleAttribute, absent)
    case .some(.none): read.decode(kAXSubroleAttribute, kCFNull)
    case .some(.some(let found)): read.decode(kAXSubroleAttribute, found as CFString)
    }
    return read
  }

  /// A null subrole classifies as an unread one: closed and failed, secure on a text-entry role and not on another; a
  /// non-null secure subrole or ordinary subrole classifies as before. Every reader of the classification follows it:
  /// the read-back's class, paste's effect reading and the guarded read.
  func testANullSubroleIsUnreadAndATextEntryRoleWithOneIsPresumedSecure() {
    for role in [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole] {
      let read = decoded(role: role, subrole: .some(nil))
      XCTAssertEqual(read.null, [kAXSubroleAttribute], role)
      XCTAssertEqual(valueClassification(read), ValueClassification(closed: true, secure: true, failed: true), role)
      XCTAssertEqual(readbackClass(read), .password(role), role)
      XCTAssertEqual(focusedEffectReading(1, bound: { _ in true }, batch: { _, _ in read })?.secure, true, role)
      if case .closed = classifiedRead([kAXValueAttribute], request: { _ in read }) {} else { XCTFail("the guarded read: \(role)") }
    }
    for role in [kAXButtonRole, kAXGroupRole, kAXStaticTextRole] {
      let read = decoded(role: role, subrole: .some(nil))
      XCTAssertEqual(valueClassification(read), ValueClassification(closed: true, secure: false, failed: true), role)
      XCTAssertEqual(readbackClass(read), .closed(.secure), role)
    }
    XCTAssertEqual(valueClassification(decoded(role: kAXTextFieldRole, subrole: "AXSecureTextField")),
                   ValueClassification(closed: true, secure: true))
    XCTAssertEqual(valueClassification(decoded(role: kAXTextFieldRole, subrole: "AXSearchField")), ValueClassification())
    XCTAssertEqual(valueClassification(decoded(role: kAXTextFieldRole, subrole: nil)), ValueClassification())
    XCTAssertEqual(valueClassification(decoded(role: nil, subrole: nil)), ValueClassification(closed: true, secure: true, failed: true),
                   "a null role: main's unreadable role")
  }

  /// The concealed read-back's final batch (`presumeSecure` false) takes a text field secure only by its null subrole as
  /// unreadable, as it takes one whose subrole read failed; the poll's own batches (`presumeSecure` true) go on.
  func testTheConcealedReadbackTakesANullSubroleAsUnreadable() {
    var read = decoded(role: kAXTextFieldRole, subrole: .some(nil))
    read.values[kAXNumberOfCharactersAttribute] = 3 as CFNumber
    let reads = ReadbackReads<Int>(focused: { nil }, stillFocused: { _, _ in .unknown }, role: { _ in kAXTextFieldRole },
                                   subrole: { _ in .failed }, value: { _ in nil }, valueUnits: { _ in nil }, range: { _ in nil },
                                   batch: { _, _ in read })
    guard case .closed(let reason) = readbackLength(1, role: kAXTextFieldRole, reads: reads, presumeSecure: false) else {
      return XCTFail("a null subrole read as a classified field")
    }
    XCTAssertEqual(reason, .fieldUnreadable)
    guard case .read = readbackLength(1, role: kAXTextFieldRole, reads: reads) else { return XCTFail("the poll's batch stops") }
  }

  /// The walk: a text field and a text area whose subrole slot is null keep nothing of their value and say `secure`; a
  /// button with one keeps nothing and says `valueUnread`, not `secure`. A non-null AXSecureTextField subrole and an
  /// ordinary one read as before.
  func testTheWalkPresumesATextEntryRoleWithANullSubroleSecure() throws {
    let tree = FakeTree()
    tree.children = [0: [1, 2, 3, 4, 5]]
    func field(_ role: String, subrole: String? = nil) -> [String: CFTypeRef] {
      var values: [String: CFTypeRef] = ["AXRole": role as CFString, "AXValue": plaintext as CFString,
                                         "AXNumberOfCharacters": plaintext.utf16.count as CFNumber]
      if let subrole { values["AXSubrole"] = subrole as CFString }
      return values
    }
    tree.extra = [1: field(kAXTextFieldRole, subrole: "AXSearchField"), 2: field(kAXTextAreaRole), 3: field(kAXButtonRole),
                  4: field(kAXTextFieldRole, subrole: "AXSecureTextField"), 5: field(kAXTextFieldRole, subrole: "AXSearchField")]
    tree.nullAttributes = [1: [kAXSubroleAttribute], 2: [kAXSubroleAttribute], 3: [kAXSubroleAttribute]]
    let source = FakeSource(tree)
    let recording = walk(tree, Lineage(), source: source)
    func node(_ id: Int) throws -> [String: Any] {
      let token = try XCTUnwrap(recording.token(of: el(id)))
      return try XCTUnwrap(recording.nodes.first { $0["token"] as? String == token })
    }
    for id in [1, 2] {
      let secure = try node(id)
      XCTAssertEqual(secure["secure"] as? Bool, true, "\(id)")
      XCTAssertTrue(secure["value"] is NSNull, "\(id)")
      XCTAssertNil(secure["numberOfCharacters"], "\(id)")
      XCTAssertTrue(secure["subrole"] is NSNull, "\(id)")
      let data = try XCTUnwrap(source.data(el(id)))
      XCTAssertTrue(data.secure && data.classificationFailed && data.valueUnread, "\(id)")
      XCTAssertNil(data.value, "\(id)")
    }
    let button = try node(3)
    XCTAssertNil(button["secure"])
    XCTAssertEqual(button["valueUnread"] as? Bool, true)
    XCTAssertTrue(button["value"] is NSNull)
    XCTAssertEqual(try XCTUnwrap(source.data(el(3))).secure, false)
    XCTAssertEqual(try node(4)["secure"] as? Bool, true)
    XCTAssertEqual(try XCTUnwrap(source.data(el(4))).classificationFailed, false, "a password field by its subrole")
    let ordinary = try node(5)
    XCTAssertNil(ordinary["secure"])
    XCTAssertEqual(ordinary["value"] as? String, plaintext)
    XCTAssertEqual(ordinary["subrole"] as? String, "AXSearchField")
    XCTAssertFalse(String(data: try JSONSerialization.data(withJSONObject: recording.nodes.filter { ($0["token"] as? String) != recording.token(of: el(5)) }),
                          encoding: .utf8)!.contains(plaintext))
  }

  /// A node whose AXRole slot is null records its role unknown, as one whose read failed (#431's review of 849bcdad,
  /// finding 6): never a known inert node, and the nodes under it have a control of unknown kind.
  func testANullRoleRecordsTheRoleUnknown() {
    let tree = FakeTree()
    tree.children = [0: [1], 1: [2], 2: [3]]
    tree.frames = [0: CGRect(x: 0, y: 0, width: 400, height: 300), 1: CGRect(x: 0, y: 0, width: 400, height: 300),
                   2: CGRect(x: 0, y: 0, width: 200, height: 30), 3: CGRect(x: 10, y: 5, width: 50, height: 20)]
    let known = screenshotNodes(walk(tree, Lineage(), recordsScreenshot: true).screenshotReads)
    XCTAssertEqual(known.first { tree.id($0.element) == 2 }?.actionable, false, "a readable AXGroup without actions: inert")
    tree.nullAttributes = [2: [kAXRoleAttribute]]
    let recording = walk(tree, Lineage(), recordsScreenshot: true)
    let read = recording.screenshotReads.first { tree.id($0.element) == 2 }
    XCTAssertEqual(read?.role, "AXUnknown")
    XCTAssertEqual(read?.roleRead, false)
    let nodes = screenshotNodes(recording.screenshotReads)
    let node = nodes.first { tree.id($0.element) == 2 }
    XCTAssertEqual(node?.roleUnknown, true)
    XCTAssertNotNil(node)
    XCTAssertNil(node?.actionable, "unknown, not inert")
    XCTAssertEqual(nodes.first { tree.id($0.element) == 3 }?.controlUnknown, true, "under a role unknown")
  }
}
