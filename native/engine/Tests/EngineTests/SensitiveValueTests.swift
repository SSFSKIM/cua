import ApplicationServices
import XCTest
@testable import Engine

/// #390's review: a set_value of a concealed value, or into a password field, reads no AXValue anywhere on its path, on
/// every route: the token's re-reads before the write (an invalidated re-read, the scroll's `.always`), the coercion,
/// the write, and the re-check after it (`.ignoringValue`, its walk included when the handle no longer matches). The
/// observation's tree is a fake one (FakeTree, FakeSource), the write's a fake AX (FakeAX); both count AXValue reads.
final class SensitiveValueTests: XCTestCase {
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  func testWhatDecidesTheValueIsNeverRead() {
    XCTAssertTrue(setValueReadsValue(concealed: false, recordedRole: kAXTextFieldRole, recordedSubrole: nil))
    XCTAssertFalse(setValueReadsValue(concealed: true, recordedRole: kAXTextFieldRole, recordedSubrole: nil), "a concealed value")
    XCTAssertFalse(setValueReadsValue(concealed: false, recordedRole: "AXSecureTextField", recordedSubrole: nil), "by role")
    XCTAssertFalse(setValueReadsValue(concealed: false, recordedRole: kAXTextFieldRole, recordedSubrole: "AXSecureTextField"), "by subrole")
    XCTAssertFalse(setValueReadsValue(concealed: false, recordedRole: kAXTextFieldRole, recordedSubrole: nil, liveClosed: true),
                   "a field that reads secure, or cannot be classified, once resolved")
  }

  /// The engine's resolver hands the method's re-reads a source that requests no AXValue when asked (making one reads
  /// nothing from any process).
  func testTheLiveResolversSourcesRequestNoValueWhenAsked() {
    let valueless = ElementResolver.live(Lineage(), pid: 1, readsValue: false).source()
    XCTAssertFalse(valueless.requestedAttributes.contains(kAXValueAttribute))
    XCTAssertTrue(ElementResolver.live(Lineage(), pid: 1).source().requestedAttributes.contains(kAXValueAttribute))
  }

  private struct Run {
    var treeValueReads = 0
    var axValueReads = 0
    var written: String?
    var identity: ElementIdentity?
  }

  /// The method's path over a window (0) holding the field (1) and a button (2): observed, then resolved invalidated,
  /// re-resolved as the scroll does, coerced and written, then re-checked; `replaced`: the write rebuilt the field (6), so
  /// the re-check walks the window.
  private func setValue(_ value: String, concealed: Bool, subrole: String?, replaced: Bool = false) throws -> Run {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    var field: [String: CFTypeRef] = ["AXRole": kAXTextFieldRole as CFString, "AXValue": "old" as CFString, "AXTitle": "Password" as CFString]
    if let subrole { field["AXSubrole"] = subrole as CFString }
    tree.extra = [1: field, 2: ["AXRole": kAXButtonRole as CFString, "AXTitle": "Sign in" as CFString]]
    let lineage = Lineage()
    _ = walk(tree, lineage)
    let recorded = try XCTUnwrap(lineage.entry(1)).identity
    let reads = setValueReadsValue(concealed: concealed, recordedRole: recorded.role, recordedSubrole: recorded.subrole)

    var sources: [FakeSource] = []
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: {
      let source = FakeSource(tree)
      source.readsValue = reads
      sources.append(source)
      return source
    }, tree: { _ in (Engine.element(0), []) })
    _ = try lineage.resolve(elementToken(1), resolver: resolver)
    _ = try lineage.resolve(elementToken(1), resolver: resolver, refetch: .always)

    let ax = FakeAX()
    ax.roles = [1: kAXTextFieldRole]
    if let subrole { ax.subroles = [1: subrole] }
    ax.values = [1: [kAXValueAttribute: "old" as CFString]]
    ax.settable = [1: [kAXValueAttribute]]
    var ops = ax.ops
    let read = ops.read
    var run = Run()
    ops.read = { element, name in
      if name == kAXValueAttribute { run.axValueReads += 1 }
      return read(element, name)
    }
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    try setElementValue(value, on: el(1), role: kAXTextFieldRole, readsValue: reads, ax: ops, meta: &meta, focus: { _ in },
                        checkInFlight: {}, acted: {})
    run.written = ax.writes.last.flatMap { $0.value as? String }

    tree.extra[1]?["AXValue"] = "•••" as CFString
    if replaced {
      tree.unreadable = [1]
      tree.children = [0: [6, 2]]
      tree.extra[6] = tree.extra[1]
    }
    run.identity = try lineage.resolve(elementToken(1), resolver: resolver, refetch: .ignoringValue).identity
    if replaced { XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(1)).element, el(6)), "the walk found the rebuilt field") }
    run.treeValueReads = sources.reduce(0) { $0 + $1.valueReads.values.reduce(0, +) }
    return run
  }

  /// A concealed value into a plain field and any value into a password field, by role's subrole: no AXValue read on
  /// the whole path, the walk of a rebuilt field included; the value written as a string; the identity kept without a
  /// value.
  func testASensitiveSetValueReadsNoValueOnItsWholePath() throws {
    for (concealed, subrole) in [(true, nil as String?), (false, "AXSecureTextField")] {
      for replaced in [false, true] {
        let label = "concealed \(concealed), subrole \(subrole ?? "none"), replaced \(replaced)"
        let run = try setValue("hunter2", concealed: concealed, subrole: subrole, replaced: replaced)
        XCTAssertEqual(run.treeValueReads, 0, label)
        XCTAssertEqual(run.axValueReads, 0, label)
        XCTAssertEqual(run.written, "hunter2", label)
        XCTAssertEqual(run.identity?.valueUnread, true, label)
        XCTAssertNil(run.identity?.value, label)
      }
    }
  }

  /// The control: a plain value into a plain field reads AXValue at every one of those steps, as main does on every
  /// route, so the counts above are the fix's.
  func testAPlainSetValueStillReadsTheValue() throws {
    let run = try setValue("hello", concealed: false, subrole: nil)
    XCTAssertGreaterThan(run.treeValueReads, 0)
    XCTAssertEqual(run.axValueReads, 1, "the coercion's read")
    XCTAssertEqual(run.identity?.valueUnread, false)
    XCTAssertEqual(run.identity?.value, "s:•••")
  }

  /// An identity kept without a value leaves the value out of its match, so the token still resolves when a later
  /// action re-reads the field with its value.
  func testAnIdentityWithoutAValueStillResolvesWhenReadWithOne() throws {
    let tree = FakeTree()
    tree.children = [0: [1]]
    tree.extra = [1: ["AXRole": kAXTextFieldRole as CFString, "AXValue": "old" as CFString]]
    let lineage = Lineage()
    _ = walk(tree, lineage)
    func resolver(reads: Bool) -> ElementResolver {
      ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: {
        let source = FakeSource(tree)
        source.readsValue = reads
        return source
      }, tree: { _ in (Engine.element(0), []) })
    }
    XCTAssertEqual(try lineage.resolve(elementToken(1), resolver: resolver(reads: false), refetch: .ignoringValue).identity.valueUnread, true)
    tree.extra[1]?["AXValue"] = "new" as CFString
    XCTAssertTrue(CFEqual(try lineage.resolve(elementToken(1), resolver: resolver(reads: true)).element, el(1)))
  }
}
