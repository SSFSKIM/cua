import ApplicationServices
import XCTest
@testable import Engine

/// #390's reviews: set_value's token re-reads (an invalidated re-read, the scroll's `.always`, the `.ignoringValue`
/// re-check after the write, its walk included) never read AXValue, on any route, the value left out of their match; the
/// coercion reads it only when, in its own step, the request is not concealed and the field is neither a password field
/// nor unclassifiable; the unfocused read-back re-checks before every read. The observation's tree is a fake one
/// (FakeTree, FakeSource), the write's a fake AX (FakeAX); both count AXValue reads.
final class SensitiveValueTests: XCTestCase {
  private func el(_ id: Int) -> AXUIElement { Engine.element(id) }

  func testTheCoercionsClassification() {
    XCTAssertFalse(setValueClosed(concealed: false, role: { kAXTextFieldRole }, subrole: { .none }))
    XCTAssertTrue(setValueClosed(concealed: true, role: { kAXTextFieldRole }, subrole: { .none }), "a concealed value")
    XCTAssertTrue(setValueClosed(concealed: false, role: { "AXSecureTextField" }, subrole: { .none }), "by role")
    XCTAssertTrue(setValueClosed(concealed: false, role: { kAXTextFieldRole }, subrole: { .subrole("AXSecureTextField") }), "by subrole")
    XCTAssertTrue(setValueClosed(concealed: false, role: { kAXTextFieldRole }, subrole: { .failed }), "a subrole that cannot be read")
    XCTAssertTrue(setValueClosed(concealed: false, role: { nil }, subrole: { .none }), "a role that cannot be read")
  }

  /// The engine's resolver hands set_value's re-reads a source that requests no AXValue (making one reads nothing from
  /// any process); every other method's keeps it.
  func testTheLiveResolversSourcesRequestNoValueWhenAsked() {
    XCTAssertFalse(ElementResolver.live(Lineage(), pid: 1, readsValue: false).source().requestedAttributes.contains(kAXValueAttribute))
    XCTAssertTrue(ElementResolver.live(Lineage(), pid: 1).source().requestedAttributes.contains(kAXValueAttribute))
  }

  private struct Run {
    var treeValueReads = 0
    var axValueReads = 0
    var axValueReadsAfterFocus = 0
    var written: String?
    var identity: ElementIdentity?
    var readback: UnfocusedValueReadback?
  }

  /// The method's path over a window (0) holding the field (1) and a button (2), as Engine.setValue composes it: observed,
  /// resolved invalidated and again as the scroll does (valueless), focused (`focus` may change the field), coerced
  /// (classified in its step) and written, read back when `unfocused`, then re-checked; `replaced`: the write rebuilt the
  /// field (6), so the re-check walks the window.
  private func setValue(_ value: String, concealed: Bool = false, subrole: String? = nil, replaced: Bool = false, unfocused: Bool = false,
                        focus: (FakeAX, FakeTree) -> Void = { _, _ in }) throws -> Run {
    let tree = FakeTree()
    tree.children = [0: [1, 2]]
    var field: [String: CFTypeRef] = ["AXRole": kAXTextFieldRole as CFString, "AXValue": "old" as CFString, "AXTitle": "Password" as CFString]
    if let subrole { field["AXSubrole"] = subrole as CFString }
    tree.extra = [1: field, 2: ["AXRole": kAXButtonRole as CFString, "AXTitle": "Sign in" as CFString]]
    let lineage = Lineage()
    _ = walk(tree, lineage)

    var sources: [FakeSource] = []
    let resolver = ElementResolver(invalidated: { _ in true }, stillValid: { _ in true }, source: {
      let source = FakeSource(tree)
      source.readsValue = false
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
    var focused = false
    ops.read = { element, name in
      if name == kAXValueAttribute {
        run.axValueReads += 1
        if focused { run.axValueReadsAfterFocus += 1 }
      }
      return read(element, name)
    }
    let classify = { secureTextField(role: ax.roles[1], subrole: ax.subroles[1].map(SubroleRead.subrole) ?? .none) }
    let withoutFocus = !unfocused ? nil : UnfocusedValueWrite(refusal: backgroundClickRefused("Chrome", engine: .chromium)) { written in
      unfocusedValueReadback(written, concealed: concealed, closed: classify, value: { ops.read(self.el(1), kAXValueAttribute) },
                             now: { 0 }, sleep: { _ in }, budgetMs: 0)
    }
    var meta = InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
    run.readback = try setElementValue(value, on: el(1), role: kAXTextFieldRole, valueClosed: {
      setValueClosed(concealed: concealed, role: { ax.roles[1] }, subrole: { ax.subroles[1].map(SubroleRead.subrole) ?? .none })
    }, ax: ops, meta: &meta, focus: { _ in
      focus(ax, tree)
      focused = true
    }, checkInFlight: {}, acted: {}, withoutFocus: withoutFocus)
    run.written = ax.writes.last.flatMap { $0.value as? String }

    tree.extra[1]?["AXValue"] = "•••" as CFString
    if replaced {
      tree.unreadable = [1]
      tree.children = [0: [6, 2]]
      tree.extra[6] = tree.extra[1]
    }
    // A field whose identity changed (a subrole turned secure) fails the re-check, which set_value answers valueUnconfirmed.
    run.identity = try? lineage.resolve(elementToken(1), resolver: resolver, refetch: .ignoringValue).identity
    if replaced { XCTAssertTrue(CFEqual(try XCTUnwrap(lineage.entry(1)).element, el(6)), "the walk found the rebuilt field") }
    run.treeValueReads = sources.reduce(0) { $0 + $1.valueReads.values.reduce(0, +) }
    return run
  }

  /// No re-read reads AXValue, for any value or field, the walk of a rebuilt field included, and the identity keeps no
  /// value; a concealed value or a password field is not read by the coercion either, and is written as a string.
  func testASensitiveSetValueReadsNoValueOnItsWholePath() throws {
    for (concealed, subrole) in [(true, nil as String?), (false, "AXSecureTextField")] {
      for replaced in [false, true] {
        for unfocused in [false, true] {
          let label = "concealed \(concealed), subrole \(subrole ?? "none"), replaced \(replaced), unfocused \(unfocused)"
          let run = try setValue("hunter2", concealed: concealed, subrole: subrole, replaced: replaced, unfocused: unfocused)
          XCTAssertEqual(run.treeValueReads, 0, label)
          XCTAssertEqual(run.axValueReads, 0, label)
          XCTAssertEqual(run.written, "hunter2", label)
          XCTAssertEqual(run.identity?.valueUnread, true, label)
          XCTAssertNil(run.identity?.value, label)
        }
      }
    }
  }

  /// A field that turns into a password field during the focus step, after the observation recorded it as a plain one:
  /// no AXValue read after that point, through the coercion, the write, the read-back and the re-check.
  func testAFieldThatTurnsSecureDuringTheFocusIsNeverReadAfter() throws {
    for unfocused in [false, true] {
      let run = try setValue("hunter2", unfocused: unfocused) { ax, tree in
        ax.subroles[1] = "AXSecureTextField"
        tree.extra[1]?["AXSubrole"] = "AXSecureTextField" as CFString
      }
      XCTAssertEqual(run.axValueReadsAfterFocus, 0, "unfocused \(unfocused)")
      XCTAssertEqual(run.axValueReads, 0, "nor before it: the re-reads never read the value")
      XCTAssertEqual(run.treeValueReads, 0)
      XCTAssertEqual(run.written, "hunter2")
      if unfocused { XCTAssertEqual(run.readback?.result, .passwordField) }
    }
  }

  /// A plain value into a plain field: the coercion reads the current value (its type), once, and the read-back reads
  /// the field; the re-reads still read no value.
  func testAPlainSetValueReadsTheValueOnlyToCoerceAndConfirm() throws {
    let plain = try setValue("hello")
    XCTAssertEqual(plain.axValueReads, 1, "the coercion's read")
    XCTAssertEqual(plain.treeValueReads, 0)
    XCTAssertEqual(plain.identity?.valueUnread, true)
    let unfocused = try setValue("hello", unfocused: true)
    XCTAssertEqual(unfocused.axValueReads, 2, "the coercion's read and the read-back's")
    XCTAssertEqual(unfocused.readback?.result, .confirmed)
  }

  /// An identity kept without a value leaves the value out of its match, so the token still resolves when a later
  /// action of another method re-reads the field with its value.
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
