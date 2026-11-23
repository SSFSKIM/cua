import ApplicationServices
import XCTest
@testable import Engine

/// #525 (rulings 1156, 1166): a role on the list of standard roles that are never secure text entry (`neverSecureRoles`)
/// classifies open when its subrole is null or failed, its value read as the vendor reads it. Every other role keeps
/// #405's and #501's classification: a text-entry role is presumed a password field, and any other role off the list
/// (a custom role string, AXUnknown) is closed and says "value unread".
final class NeverSecureRoleTests: XCTestCase {
  private let plaintext = "PLAINTEXT-525"
  private let customRole = "AXMyCustomRole"
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  /// One reply: the role as text, or kCFNull; the subrole null or failed.
  private func read(role: String?, subrole: SubroleSlot) -> AttributeRead {
    var read = AttributeRead()
    read.decode(kAXRoleAttribute, role.map { $0 as CFString } ?? kCFNull)
    switch subrole {
    case .null: read.decode(kAXSubroleAttribute, kCFNull)
    case .failed: read.unreadable.insert(kAXSubroleAttribute)
    }
    return read
  }

  private enum SubroleSlot: CaseIterable { case null, failed }

  /// The classification and its direct readers: an AXGroup with a null or failed subrole is open; the text-entry roles,
  /// a custom role, AXUnknown, an unreadable role and AXSecureTextField classify as before.
  func testAGroupWithANullOrFailedSubroleIsOpenAndNoOtherRoleChanges() {
    for slot in SubroleSlot.allCases {
      let group = read(role: kAXGroupRole, subrole: slot)
      XCTAssertEqual(valueClassification(group), ValueClassification(), "\(slot)")
      XCTAssertFalse(valueReadClosed(group), "\(slot)")
      XCTAssertEqual(readbackClass(group), .open(kAXGroupRole), "\(slot)")
      XCTAssertEqual(focusedEffectReading(1, bound: { _ in true }, batch: { _, _ in group })?.secure, false, "\(slot)")
      if case .read = classifiedRead([kAXValueAttribute], request: { _ in group }) {} else { XCTFail("the guarded read: \(slot)") }

      for role in [kAXTextFieldRole, kAXComboBoxRole, kAXTextAreaRole] {
        let field = read(role: role, subrole: slot)
        XCTAssertEqual(valueClassification(field), ValueClassification(closed: true, secure: true, failed: true), "\(role) \(slot)")
        XCTAssertEqual(readbackClass(field), .password(role), "\(role) \(slot)")
        XCTAssertEqual(focusedEffectReading(1, bound: { _ in true }, batch: { _, _ in field })?.secure, true, "\(role) \(slot)")
        if case .closed = classifiedRead([kAXValueAttribute], request: { _ in field }) {} else { XCTFail("\(role) \(slot)") }
      }
      for role in [customRole, kAXUnknownRole, kAXButtonRole, kAXStaticTextRole] {
        let other = read(role: role, subrole: slot)
        XCTAssertEqual(valueClassification(other), ValueClassification(closed: true, secure: false, failed: true), "\(role) \(slot)")
        XCTAssertEqual(readbackClass(other), .closed(.secure), "\(role) \(slot)")
      }
      XCTAssertEqual(valueClassification(read(role: nil, subrole: slot)), ValueClassification(closed: true, secure: true, failed: true),
                     "an unreadable role \(slot)")
      XCTAssertEqual(valueClassification(read(role: "AXSecureTextField", subrole: slot)), ValueClassification(closed: true, secure: true),
                     "AXSecureTextField \(slot)")
    }
  }

  /// Through the walk and every consumer of its data: an AXGroup with a null or failed subrole keeps its value, its node
  /// carries no `valueUnread`, its identity matches across handles and its record holds the value open. A text field and
  /// a combo box with either stay `secure` and unread; a custom role with either says `valueUnread`; an unreadable role
  /// stays `secure`.
  func testTheWalkReadsAGroupWithANullOrFailedSubroleAsTheVendorDoes() throws {
    let tree = FakeTree()
    let ids = Array(1...9)
    tree.children = [0: ids]
    tree.frames[0] = CGRect(x: 0, y: 0, width: 400, height: 400)
    for id in ids { tree.frames[id] = CGRect(x: 10, y: 40 * id, width: 200, height: 20) }
    func element(_ role: String) -> [String: CFTypeRef] {
      ["AXRole": role as CFString, "AXValue": plaintext as CFString, "AXNumberOfCharacters": plaintext.utf16.count as CFNumber]
    }
    let roles = [1: kAXGroupRole, 2: kAXGroupRole, 3: kAXTextFieldRole, 4: kAXTextFieldRole, 5: kAXComboBoxRole, 6: kAXComboBoxRole,
                 7: customRole, 8: customRole, 9: kAXGroupRole]
    for (id, role) in roles { tree.extra[id] = element(role) }
    let null: Set<Int> = [1, 3, 5, 7]
    for id in null { tree.nullAttributes[id] = [kAXSubroleAttribute] }
    for id in [2, 4, 6, 8] { tree.unreadableAttributes[id] = [kAXSubroleAttribute] }
    tree.unreadableAttributes[9] = [kAXRoleAttribute]
    let source = FakeSource(tree)
    let recording = walk(tree, Lineage(), source: source, recordsScreenshot: true)
    let records = screenshotNodes(recording.screenshotReads)
    func node(_ id: Int) throws -> [String: Any] {
      let token = try XCTUnwrap(recording.token(of: el(id)))
      return try XCTUnwrap(recording.nodes.first { $0["token"] as? String == token })
    }
    func record(_ id: Int) throws -> ScreenshotNode<AXUIElement> { try XCTUnwrap(records.first { tree.id($0.element) == id }) }
    func identity(_ id: Int) throws -> ElementIdentity { ElementIdentity(try XCTUnwrap(source.data(el(id))), pid: 1) }

    for id in [1, 2] {
      let label = "AXGroup, subrole \(null.contains(id) ? "null" : "failed")"
      let group = try node(id)
      XCTAssertNil(group["valueUnread"], label)
      XCTAssertNil(group["secure"], label)
      XCTAssertEqual(group["value"] as? String, plaintext, label)
      let data = try XCTUnwrap(source.data(el(id)))
      XCTAssertFalse(data.valueUnread || data.classificationFailed || data.secure, label)
      XCTAssertTrue(try identity(id).matches(identity(id)), "\(label): matched across handles")
      XCTAssertTrue(try record(id).valueOpen, label)
    }
    for id in [3, 4, 5, 6] {
      let label = "\(roles[id]!), subrole \(null.contains(id) ? "null" : "failed")"
      let field = try node(id)
      XCTAssertEqual(field["secure"] as? Bool, true, label)
      XCTAssertTrue(field["value"] is NSNull, label)
      XCTAssertNil(field["numberOfCharacters"], label)
      let data = try XCTUnwrap(source.data(el(id)))
      XCTAssertTrue(data.secure && data.classificationFailed && data.valueUnread, label)
      XCTAssertFalse(try identity(id).matches(identity(id)), "\(label): matched only for the same handle")
      XCTAssertFalse(try record(id).valueOpen, label)
    }
    for id in [7, 8] {
      let label = "\(customRole), subrole \(null.contains(id) ? "null" : "failed")"
      let custom = try node(id)
      XCTAssertEqual(custom["valueUnread"] as? Bool, true, label)
      XCTAssertNil(custom["secure"], label)
      XCTAssertTrue(custom["value"] is NSNull, label)
      let data = try XCTUnwrap(source.data(el(id)))
      XCTAssertTrue(data.classificationFailed && data.valueUnread && !data.secure, label)
      XCTAssertFalse(try identity(id).matches(identity(id)), label)
      XCTAssertFalse(try record(id).valueOpen, label)
    }
    let unreadableRole = try XCTUnwrap(source.data(el(9)))
    XCTAssertTrue(unreadableRole.secure && unreadableRole.classificationFailed && unreadableRole.valueUnread, "an unreadable role")
    XCTAssertEqual(try node(9)["secure"] as? Bool, true)
    let open = Set([1, 2].compactMap { recording.token(of: el($0)) })
    let others = recording.nodes.filter { !open.contains($0["token"] as? String ?? "") }
    XCTAssertFalse(String(data: try JSONSerialization.data(withJSONObject: others), encoding: .utf8)!.contains(plaintext))
  }
}
