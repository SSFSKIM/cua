import ApplicationServices
import XCTest
@testable import Engine

// #395 (ruling 1ea561bc:824): type_text's focused field in background Safari by WebKit's text-marker route
// (TypeReadbackMarker.swift). The live reads (`ReadbackReads.live`) run here over a stub Safari behind `ReadbackAX`, the
// layer the engine's Accessibility calls go through: its web area answers a real AXTextMarkerRange, made with
// HIServices' own constructors, whose 28-byte markers hold a known offset as LE32 words at bytes 8 and 20, as the probe
// found Safari's do. Every call the stub gets is logged by name and element, never by value.

/// HIServices' private marker constructors, for the tests alone: the engine resolves no constructor, nor anything that
/// reads a marker's bytes.
private enum TestMarkers {
  typealias Create = @convention(c) (CFAllocator?, UnsafePointer<UInt8>, CFIndex) -> Unmanaged<CFTypeRef>?
  typealias RangeCreate = @convention(c) (CFAllocator?, CFTypeRef, CFTypeRef) -> Unmanaged<CFTypeRef>?

  /// Whether both constructors resolve, and the engine's own symbols with them: the tests that build a stub skip
  /// without them rather than trap.
  static let available = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "AXTextMarkerCreate") != nil
    && dlsym(UnsafeMutableRawPointer(bitPattern: -2), "AXTextMarkerRangeCreate") != nil && ReadbackMarkerSymbols.live != nil

  static func marker(offset: UInt32) -> CFTypeRef {
    var bytes = [UInt8](repeating: 0xA5, count: 28)
    for at in [8, 20] { for byte in 0..<4 { bytes[at + byte] = UInt8((offset >> (8 * UInt32(byte))) & 0xFF) } }
    let create = unsafeBitCast(dlsym(UnsafeMutableRawPointer(bitPattern: -2), "AXTextMarkerCreate")!, to: Create.self)
    return bytes.withUnsafeBufferPointer { create(nil, $0.baseAddress!, 28)!.takeRetainedValue() }
  }

  static func range(_ start: CFTypeRef, _ end: CFTypeRef) -> CFTypeRef {
    let create = unsafeBitCast(dlsym(UnsafeMutableRawPointer(bitPattern: -2), "AXTextMarkerRangeCreate")!, to: RangeCreate.self)
    return create(nil, start, end)!.takeRetainedValue()
  }
}

/// A background Safari: the application (0) names no focused element; its window (1) holds a toolbar (2) with the
/// address field (3, its text 4 never to be read) and the web area (5), which holds a filler group (9) of `filler`
/// children and a form (6) holding the field (7), whose text is the AXStaticText (8) the marker names.
private final class StubSafari {
  static let pid: pid_t = 62_000
  static let app = 0, window = 1, toolbar = 2, address = 3, addressText = 4, web = 5, form = 6, field = 7, text = 8, filler = 9

  var roles: [Int: String] = [app: "AXApplication", window: "AXWindow", toolbar: "AXToolbar", address: "AXTextField",
                              addressText: "AXStaticText", web: "AXWebArea", form: "AXGroup", field: "AXTextField",
                              text: "AXStaticText", filler: "AXGroup"]
  var subroles: [Int: String] = [:]
  var children: [Int: [Int]]
  var parents: [Int: Int] = [field: form, form: web, text: field, filler: web, address: toolbar, toolbar: window, web: window]
  /// Reads that answer this error instead, by element and attribute.
  var errors: [Int: [String: AXError]] = [:]
  /// Reads that answer this value instead, with success, by element and attribute (a reply of the wrong type).
  var replies: [Int: [String: CFTypeRef]] = [:]
  /// What a classification request answers instead, by element, its attribute reads left as they are.
  var batches: [Int: AttributeRead] = [:]
  var foreign: Set<Int> = []
  var appFocus: Int?
  var focused: Set<Int> = [field]

  var value: String
  var selection: NSRange
  /// What the app does with delivered text, and whether a Tab moves focus out of the field.
  var transform: (String) -> String = { $0 }

  let start = TestMarkers.marker(offset: StubSafari.startOffset)
  let end = TestMarkers.marker(offset: StubSafari.endOffset)
  static let startOffset: UInt32 = 0x0BAD_F00D, endOffset: UInt32 = 0x0DEF_ACED
  lazy var markerRange: CFTypeRef? = TestMarkers.range(start, end)
  var markerRangeError: AXError = .success
  /// What AXUIElementForTextMarker answers for the start marker (by default the field's text), and its error.
  lazy var named: (CFTypeRef) -> (CFTypeRef?, AXError) = { [unowned self] marker in
    CFEqual(marker, self.start) ? (self.el(Self.text), .success) : (nil, .noValue)
  }
  var symbols: ReadbackMarkerSymbols? = .live

  var log: [String] = []
  var parameterized: [(name: String, argument: CFTypeRef)] = []

  init(value: String = "abc", selection: NSRange = NSRange(location: 3, length: 0), filler count: Int = 1_600) {
    self.value = value
    self.selection = selection
    children = [Self.app: [Self.window], Self.window: [Self.toolbar, Self.web], Self.toolbar: [Self.address],
                Self.address: [Self.addressText], Self.web: [Self.filler, Self.form], Self.form: [Self.field],
                Self.field: [Self.text], Self.filler: Array(1_000..<(1_000 + count))]
    for id in 1_000..<(1_000 + count) { roles[id] = "AXStaticText"; parents[id] = Self.filler }
  }

  func el(_ id: Int) -> AXUIElement { AXUIElementCreateApplication(Self.pid + pid_t(id)) }
  func id(_ element: AXUIElement) -> Int { Int(ownerPid(of: element, fallback: 0) - Self.pid) }

  func copy(_ element: AXUIElement, _ name: String) -> (value: CFTypeRef?, error: AXError) {
    let id = id(element)
    log.append("\(name)@\(id)")
    if let error = errors[id]?[name] { return (nil, error) }
    if let reply = replies[id]?[name] { return (reply, .success) }
    switch name {
    case kAXFocusedUIElementAttribute where id == Self.app: return appFocus.map { (el($0), .success) } ?? (nil, .noValue)
    case kAXFocusedWindowAttribute where id == Self.app: return (el(Self.window), .success)
    case kAXChildrenAttribute: return children[id].map { ($0.map(el) as CFArray, .success) } ?? (nil, .noValue)
    case kAXParentAttribute: return parents[id].map { (el($0), .success) } ?? (nil, .noValue)
    case kAXRoleAttribute: return roles[id].map { ($0 as CFString, .success) } ?? (nil, .noValue)
    case kAXSubroleAttribute: return subroles[id].map { ($0 as CFString, .success) } ?? (nil, .noValue)
    case kAXFocusedAttribute: return (focused.contains(id) ? kCFBooleanTrue : kCFBooleanFalse, .success)
    case "AXSelectedTextMarkerRange" where id == Self.web: return (markerRange, markerRangeError)  // a range beside an error too: the error decides
    case kAXValueAttribute where id == Self.field: return (value as CFString, .success)
    case kAXSelectedTextRangeAttribute where id == Self.field:
      return (axRangeValue(CFRange(location: selection.location, length: selection.length)), .success)
    default: return (nil, .noValue)
    }
  }

  func copyParameterized(_ element: AXUIElement, _ name: String, _ argument: CFTypeRef) -> (value: CFTypeRef?, error: AXError) {
    log.append("\(name)@\(id(element))")
    parameterized.append((name, argument))
    guard name == "AXUIElementForTextMarker", id(element) == Self.web else { return (nil, .parameterizedAttributeUnsupported) }
    return named(argument)
  }

  /// One batched request, as AXUIElementCopyMultipleAttributeValues answers it: absences left out, failures marked.
  func batch(_ element: AXUIElement, _ names: [String]) -> AttributeRead? {
    log.append("batch(\(names.joined(separator: ",")))@\(id(element))")
    if let read = batches[id(element)] { return read }
    var read = AttributeRead()
    for name in names {
      let id = id(element)
      if let error = errors[id]?[name] {
        if error != .noValue && error != .attributeUnsupported { read.unreadable.insert(name) }
        continue
      }
      let answer: String? = name == kAXRoleAttribute ? roles[id] : name == kAXSubroleAttribute ? subroles[id] : nil
      if let answer { read.values[name] = answer as CFString }
      // #414: the field's length batch answers its count and range, as Safari's password field does.
      if id == Self.field, name == kAXNumberOfCharactersAttribute { read.values[name] = (value as NSString).length as CFNumber }
      if id == Self.field, name == kAXSelectedTextRangeAttribute {
        read.values[name] = axRangeValue(CFRange(location: selection.location, length: selection.length))
      }
    }
    return read
  }

  var ax: ReadbackAX {
    ReadbackAX(copy: { self.copy($0, $1) }, copyParameterized: { self.copyParameterized($0, $1, $2) },
               batch: { self.batch($0, $1) }, pid: { self.foreign.contains(self.id($0)) ? 1 : Self.pid }, markers: symbols)
  }

  func deliver(_ text: [UInt16]) {
    log.append("post")
    if text == [0x09] { focused.remove(Self.field); return }
    guard focused.contains(Self.field) else { return }
    let typed = transform(String(utf16CodeUnits: text, count: text.count))
    value = (value as NSString).replacingCharacters(in: selection, with: typed)
    selection = NSRange(location: selection.location + (typed as NSString).length, length: 0)
  }

  /// The calls made to anything marker-shaped.
  var markerCalls: [String] { log.filter { $0.contains("TextMarker") } }
  /// The window's AXChildren reads: one each for the web area's search and the walk, both of which read it first
  /// whatever their bounds then allow.
  var windowChildrenReads: Int { log.filter { $0 == "\(kAXChildrenAttribute)@\(Self.window)" }.count }
  /// The value-bearing reads of any element.
  var valueReads: [String] {
    log.filter { ["AXValue@", "AXSelectedTextRange@", "AXNumberOfCharacters@", "AXSelectedText@", "AXValueDescription@"].contains(where: $0.hasPrefix) }
  }
}

final class TypeReadbackMarkerTests: XCTestCase {
  /// Every test but the bundle's gating builds a stub, whose markers need HIServices' private constructors.
  override func setUpWithError() throws {
    try super.setUpWithError()
    if name.contains("testOnlySafarisBundleTakesTheRoute") { return }
    try XCTSkipUnless(TestMarkers.available, "HIServices' text-marker functions did not resolve")
  }

  private func meta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func units(_ text: String) -> [TypedUnit] {
    typedUnits(text, press: { unit in unit < 0x80 && unit != 0x0D ? KeyPress(keyCode: CGKeyCode(unit), modifiers: []) : nil })
  }

  /// Types `text` into the stub through keyTextReadBack over the live reads; the error, the meta and the reply as the
  /// wire would carry it.
  @discardableResult
  private func type(_ text: String, into safari: StubSafari, concealed: Bool = false, markerRoute: Bool = true, baseline: BaselineWait? = nil)
    -> (error: EngineError?, meta: InputMeta, reply: String) {
    var reads = ReadbackReads.live(pid: StubSafari.pid, markerRoute: markerRoute, ax: safari.ax)
    var clock = 0.0
    reads.now = { clock }
    reads.sleep = { clock += $0 }
    var meta = meta()
    var failure: EngineError?
    do {
      try keyTextReadBack(units(text), concealed: concealed, baseline: baseline, reads: reads, checkSource: { _, _ in }, checkIntervention: {},
                          post: { event in
                            if event.kind == .down, let text = event.text { safari.deliver(text) }
                            return true
                          }, pause: {}, meta: &meta)
    } catch {
      failure = error as? EngineError
    }
    let wire: [String: Any] = failure.map { withMeta($0, meta).wire } ?? ["meta": meta.wire]
    let reply = String(data: try! JSONSerialization.data(withJSONObject: wire, options: [.sortedKeys]), encoding: .utf8)!
    return (failure, meta, reply)
  }

  private func record(_ meta: InputMeta) -> [String: Any] { meta.wire["typeReadback"] as? [String: Any] ?? [:] }
  private func reason(_ meta: InputMeta) -> String? { record(meta)["reason"] as? String }

  // MARK: The marker never leaves the call (ruling 824's required test)

  /// The marker's bytes, and the offset they hold, reach no reply, no cache, no identity, no render, no error sentence
  /// and no stderr line: across a confirmed plain text, a plain mismatch (whose sentence carries an excerpt and
  /// lengths), a concealed confirmation and mismatch, and a password field's confirmation by its length (#414). Only the
  /// start marker is passed,
  /// once, to AXUIElementForTextMarker alone, and nothing keeps it or the range once the lookup returns.
  func testTheMarkersBytesAndOffsetReachNoReplyCacheIdentityRenderErrorOrStderr() throws {
    struct Run {
      let label: String, safari: StubSafari, meta: InputMeta, expected: String?
      let rangeKept: Bool, markerRetains: CFIndex, controlRetains: CFIndex
    }
    var replies: [String] = [], sentences: [String] = [], runs: [Run] = []
    // Only the engine's calls run while stderr is captured; the assertions, whose failures XCTest writes there, after.
    let captured = try capturingStderr {
      for (text, concealed, upper, secure) in [("xyz", false, false, false), ("xyz", false, true, false), ("s3cr3t-Zebra", true, false, false),
                                               ("s3cr3t-Zebra", true, true, false), ("hunter2", true, false, true)] {
        let safari = StubSafari()
        if upper { safari.transform = { $0.uppercased() } }
        if secure { safari.subroles[StubSafari.field] = "AXSecureTextField" }
        guard let range = safari.markerRange else { continue }
        let rangeRetains = CFGetRetainCount(range)
        let (error, meta, reply) = type(text, into: safari, concealed: concealed)
        replies.append(reply)
        if let error { sentences += [error.message, "\(error)"] }
        // The marker the engine copied, held by the stub's log alone, against a copy held only by such a log.
        var control: [(name: String, argument: CFTypeRef)] = []
        if let copy = ReadbackMarkerSymbols.live?.copyStart(range) { control.append(("control", copy)) }
        runs.append(Run(label: "\(text) concealed \(concealed) upper \(upper) secure \(secure)", safari: safari, meta: meta,
                        expected: upper ? (concealed ? "concealedMismatch" : "valueMismatch") : nil,
                        rangeKept: CFGetRetainCount(range) != rangeRetains,
                        markerRetains: safari.parameterized.first.map { _ in CFGetRetainCount(safari.parameterized[0].argument) } ?? -1,
                        controlRetains: control.first.map { _ in CFGetRetainCount(control[0].argument) } ?? -2))
      }
    }
    XCTAssertEqual(runs.count, 5)
    for run in runs {
      let safari = run.safari
      XCTAssertEqual(reason(run.meta), run.expected, run.label)
      // Once, and only the start marker, and only to AXUIElementForTextMarker on the web area.
      XCTAssertEqual(safari.markerCalls, ["AXSelectedTextMarkerRange@5", "AXUIElementForTextMarker@5"], run.label)
      XCTAssertEqual(safari.parameterized.map(\.name), ["AXUIElementForTextMarker"], run.label)
      guard let argument = safari.parameterized.first?.argument, let range = safari.markerRange else { continue }
      XCTAssertTrue(CFEqual(argument, safari.start), "the start marker, unchanged: \(run.label)")
      XCTAssertFalse(CFEqual(argument, safari.end) || CFEqual(argument, range), "never the end marker or the range: \(run.label)")
      // Nothing keeps the range or the start marker past the lookup.
      XCTAssertFalse(run.rangeKept, "the range is not kept: \(run.label)")
      XCTAssertEqual(run.markerRetains, run.controlRetains, "the start marker is not kept: \(run.label)")
    }
    // A second lookup reads the range again: nothing is reused across calls.
    let again = StubSafari()
    type("a", into: again)
    type("b", into: again)
    XCTAssertEqual(again.markerCalls.filter { $0.hasPrefix("AXSelectedTextMarkerRange") }.count, 2)

    for offset in [StubSafari.startOffset, StubSafari.endOffset] {
      let bytes = (0..<4).map { (offset >> (8 * UInt32($0))) & 0xFF }
      let forms = [String(offset), String(offset, radix: 16), String(offset, radix: 16, uppercase: true),
                   bytes.map(String.init).joined(separator: ", "), bytes.map { String(format: "%02x", $0) }.joined(),
                   Data(bytes.map(UInt8.init)).base64EncodedString().replacingOccurrences(of: "=", with: "")]
      for text in replies + sentences + [captured] {
        for form in forms { XCTAssertFalse(text.contains(form), "the marker's \(form) in \(text)") }
      }
    }
    // The render: the read-back's record carries only its own fields.
    let keys: Set<String> = ["confirmed", "snapshotMs", "reason", "concealed", "pollMs", "reads", "expectedLength", "actualLength",
                             "secure", "confirmation"]
    for reply in replies {
      let wire = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(reply.utf8)) as? [String: Any])
      let meta = try XCTUnwrap(wire["meta"] as? [String: Any], reply)
      let readback = try XCTUnwrap(meta["typeReadback"] as? [String: Any], reply)
      XCTAssertTrue(Set(readback.keys).isSubset(of: keys), "\(readback.keys)")
    }
    // The identity the read-back holds is the field's element, asked after typing by its own AXFocused.
    for safari in runs.map(\.safari) {
      let after = safari.log.suffix(from: try XCTUnwrap(safari.log.firstIndex(of: "post")))
      XCTAssertEqual(after.filter { $0.hasPrefix("AXFocused@") }, ["AXFocused@7"])
    }
  }

  /// Runs `body` with the process's stderr sent to a file, and answers what it wrote.
  private func capturingStderr(_ body: () throws -> Void) throws -> String {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("marker-stderr-\(UUID().uuidString)")
    FileManager.default.createFile(atPath: url.path, contents: nil)
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

  // MARK: Found

  /// The probe's page: 1,600 children before the form, which the walk alone cannot get past (noFocusedElement), while
  /// the route finds the field (AXStaticText, one AXParent, the AXTextField) and a plain text and a secret confirm.
  func testTheRouteFindsTheFieldOnALargePageWhereTheWalkCannot() {
    let walkOnly = StubSafari()
    XCTAssertEqual(reason(type("xyz", into: walkOnly, markerRoute: false).meta), "noFocusedElement")
    XCTAssertEqual(walkOnly.value, "abcxyz", "the text went in all the same")
    XCTAssertTrue(walkOnly.markerCalls.isEmpty)

    for concealed in [false, true] {
      let safari = StubSafari()
      let (error, meta, _) = type("xyz", into: safari, concealed: concealed)
      XCTAssertNil(error, "concealed \(concealed)")
      XCTAssertEqual(record(meta)["confirmed"] as? Bool, true)
      XCTAssertEqual(safari.value, "abcxyz")
      let lookup = Array(safari.log.prefix(upTo: safari.log.firstIndex(of: "\(kAXRoleAttribute)@7") ?? 0))
      XCTAssertEqual(lookup.first, "AXFocusedUIElement@0", "the application's focus first")
      XCTAssertEqual(lookup.suffix(9), ["batch(AXRole,AXSubrole)@5", "AXSelectedTextMarkerRange@5", "AXUIElementForTextMarker@5",
                                        "batch(AXRole,AXSubrole)@8", "AXParent@8", "batch(AXRole,AXSubrole)@7", "AXFocused@7",
                                        "AXParent@7", "AXParent@6"],
                     "the web area classified before its marker is read, each element before anything else is read of it, "
                       + "then focus, then under the web area: \(lookup)")
      XCTAssertFalse(lookup.contains("AXChildren@3"), "nothing inside the address field is read")
      XCTAssertFalse(lookup.contains { $0.hasPrefix("AXRole@10") }, "the web area's content is not walked")
    }
  }

  // MARK: Gating

  /// Safari only, by its exact bundle identifier.
  func testOnlySafarisBundleTakesTheRoute() {
    XCTAssertTrue(readbackMarkerRoute(bundleIdentifier: "com.apple.Safari"))
    for other in ["com.apple.SafariTechnologyPreview", "com.apple.safari", "com.google.Chrome", "org.mozilla.firefox", "com.apple.TextEdit", ""] {
      XCTAssertFalse(readbackMarkerRoute(bundleIdentifier: other), other)
    }
    XCTAssertFalse(readbackMarkerRoute(bundleIdentifier: nil))
  }

  /// Another app's reads, and Safari's without the marker symbols, never ask for a marker; and a Safari whose
  /// application names its focused field never takes the route, before typing or after.
  func testTheRouteRunsOnlyForSafariAndOnlyWhenTheApplicationNamesNoFocus() {
    let other = StubSafari(filler: 3)
    XCTAssertNil(type("xyz", into: other, markerRoute: false).error, "a small page: the walk finds the field")
    XCTAssertTrue(other.markerCalls.isEmpty)

    let unresolved = StubSafari(filler: 3)
    unresolved.symbols = nil
    XCTAssertNil(type("xyz", into: unresolved).error)
    XCTAssertTrue(unresolved.markerCalls.isEmpty)

    let answering = StubSafari()
    answering.appFocus = StubSafari.field
    XCTAssertNil(type("xyz", into: answering).error)
    XCTAssertTrue(answering.markerCalls.isEmpty, "\(answering.markerCalls)")
    XCTAssertFalse(answering.log.contains("AXFocusedWindow@0"), "nothing but the application's answer")
    XCTAssertEqual(answering.log.filter { $0 == "AXFocusedUIElement@0" }.count, 2, "asked again after typing")

    // Found by the application's focus, which then answers none after typing: looked up again by the walk alone, never
    // the marker, so the large page answers fieldChanged.
    let lost = StubSafari()
    lost.appFocus = StubSafari.field
    var posts = 0
    let original = lost.transform
    lost.transform = { posts += 1; lost.appFocus = nil; return original($0) }
    XCTAssertEqual(reason(type("xyz", into: lost).meta), "fieldChanged")
    XCTAssertEqual(posts, 3)
    XCTAssertTrue(lost.markerCalls.isEmpty, "\(lost.markerCalls)")
  }

  /// The route runs only on an absent answer at the application (noValue, attributeUnsupported): a focus read that
  /// failed (cannotComplete, or a reply that is not an element) goes to the walk alone, as on main, so the large page
  /// answers noFocusedElement with no marker call, and a small one is found by the walk and confirmed.
  func testAFailedApplicationFocusReadTakesTheWalkAlone() {
    let failures: [(String, (StubSafari) -> Void)] = [
      ("cannotComplete", { $0.errors[StubSafari.app] = [kAXFocusedUIElementAttribute: .cannotComplete] }),
      ("a string for the element", { $0.replies[StubSafari.app] = [kAXFocusedUIElementAttribute: "field" as CFString] }),
    ]
    for (name, setUp) in failures {
      let large = StubSafari()
      setUp(large)
      XCTAssertEqual(reason(type("xyz", into: large).meta), "noFocusedElement", name)
      XCTAssertEqual(large.markerCalls, [], name)
      XCTAssertEqual(large.windowChildrenReads, 1, "\(name): the walk ran, and no web area's search")

      let small = StubSafari(filler: 3)
      setUp(small)
      let (error, meta, _) = type("xyz", into: small)
      XCTAssertNil(error, name)
      XCTAssertEqual(record(meta)["confirmed"] as? Bool, true, name)
      XCTAssertEqual(small.value, "abcxyz", name)
      XCTAssertEqual(small.markerCalls, [], name)
    }
    // attributeUnsupported is an absence, as noValue is: the route runs and finds the field.
    let unsupported = StubSafari()
    unsupported.errors[StubSafari.app] = [kAXFocusedUIElementAttribute: .attributeUnsupported]
    XCTAssertNil(type("xyz", into: unsupported).error)
    XCTAssertEqual(unsupported.markerCalls, ["AXSelectedTextMarkerRange@5", "AXUIElementForTextMarker@5"])
  }

  // MARK: Password fields

  /// #414: a password field the route finds (by role or subrole, or a text field whose subrole cannot be read) is claimed
  /// as a text field is, its AXFocused and its place under the web area checked, and is confirmed by its length: after
  /// its classification nothing is read of it but its length batch and, after typing, its own AXFocused; no value, range
  /// or count is read alone, and no marker call follows the first event.
  func testAPasswordFieldTheRouteFindsIsConfirmedByItsLength() {
    let cases: [(String, (StubSafari) -> Void)] = [
      ("secure subrole", { $0.subroles[StubSafari.field] = "AXSecureTextField" }),
      ("secure role", { $0.roles[StubSafari.field] = "AXSecureTextField" }),
      ("unreadable subrole", { $0.errors[StubSafari.field] = [kAXSubroleAttribute: .cannotComplete] }),
    ]
    let batch = "batch(\(readbackLengthAttributes.joined(separator: ",")))@\(StubSafari.field)"
    for concealed in [false, true] {
      for (name, setUp) in cases {
        let safari = StubSafari(value: "hunter2", selection: NSRange(location: 7, length: 0))
        setUp(safari)
        let (error, meta, reply) = type("pass", into: safari, concealed: concealed)
        XCTAssertNil(error, name)
        XCTAssertEqual(safari.value, "hunter2pass", name)
        XCTAssertEqual(record(meta)["confirmation"] as? String, "length", name)
        XCTAssertEqual(record(meta)["secure"] as? Bool, true, name)
        XCTAssertEqual(meta.note, readbackLengthNote, name)
        XCTAssertFalse(reply.contains("hunter2"), name)
        XCTAssertEqual(safari.valueReads, [], "\(name): \(safari.log)")
        guard let classified = safari.log.lastIndex(of: "batch(AXRole,AXSubrole)@\(StubSafari.field)") else {
          XCTFail("\(name): classified by role and subrole in one request: \(safari.log.suffix(12))")
          continue
        }
        XCTAssertEqual(Array(safari.log[(classified + 1)...]),
                       ["AXFocused@7", "AXParent@7", "AXParent@6", "AXRole@7", "AXSubrole@7", batch, "post", "post", "post", "post"]
                         + Array(repeating: batch, count: 1 + Int(typeReadbackLengthDwellMs / typeReadbackPollIntervalMs)) + ["AXFocused@7"], "\(name): the match, then the quiet window's reads")
      }
    }
  }

  /// The route's classification of the field as a password field holds for the snapshot: a page that shows the
  /// password as text between that classification and the snapshot's own role and subrole read (a show-password
  /// toggle) has the field refused noLongerSecure, and nothing more is read of it: no value, no range, no length batch.
  func testAPasswordFieldTheRouteFoundThatIsShownAsTextIsReadNoFurther() {
    let cases: [(String, [String: CFTypeRef])] = [
      ("by subrole", [kAXRoleAttribute: "AXTextField" as CFString, kAXSubroleAttribute: "AXSecureTextField" as CFString]),
      ("by role", [kAXRoleAttribute: "AXSecureTextField" as CFString]),
    ]
    for concealed in [false, true] {
      for (name, classified) in cases {
        let safari = StubSafari(value: "hunter2", selection: NSRange(location: 7, length: 0))
        safari.batches[StubSafari.field] = AttributeRead(values: classified)  // the route's classification; the field's own reads show a text field
        let (error, meta, reply) = type("pass", into: safari, concealed: concealed)
        XCTAssertEqual(error?.errorName, "typeUnconfirmed", name)
        XCTAssertEqual(reason(meta), "noLongerSecure", name)
        XCTAssertEqual(record(meta)["secure"] as? Bool, true, "\(name): a password field's record, with no reads or poll time")
        XCTAssertNil(record(meta)["reads"], name)
        XCTAssertTrue(error?.message.hasSuffix("The field may now show its text, so if it holds a secret, do not take a screenshot of it or call getAXState(); put it right with setValue, and do not type the text again.") ?? false, name)
        XCTAssertFalse(reply.contains("hunter2"), name)
        XCTAssertEqual(safari.valueReads, [], "\(name): \(safari.log)")
        guard let snapshot = safari.log.lastIndex(of: "\(kAXSubroleAttribute)@\(StubSafari.field)") else {
          XCTFail("\(name): the snapshot read the field's subrole: \(safari.log.suffix(12))")
          continue
        }
        XCTAssertEqual(safari.log[(snapshot + 1)...].filter { $0 != "post" }, [], "\(name): nothing read after the snapshot's subrole")
      }
    }
  }

  /// The review of 81a1aebc..52f0109a (P1): a select_text baseline at a field the route found to be a password field is
  /// refused selectionChanged before any read of the field, its role included, whether its own reads would show a
  /// password field or one shown as text: nothing is typed, since a password field never holds select_text's selection.
  /// A stable baseline keeps the snapshot's own rule: one shown as text is noLongerSecure, the text typed.
  func testASelectTextBaselineAtAFieldTheRouteFoundToBeAPasswordFieldTypesNothing() {
    for concealed in [false, true] {
      for shownAsText in [false, true] {
        let name = "\(concealed ? "concealed" : "literal"), \(shownAsText ? "shown as text" : "still a password field")"
        let safari = StubSafari(value: "hunter2", selection: NSRange(location: 7, length: 0))
        if shownAsText {
          safari.batches[StubSafari.field] = AttributeRead(values: [kAXRoleAttribute: "AXSecureTextField" as CFString])
        } else {
          safari.subroles[StubSafari.field] = "AXSecureTextField"
        }
        let (error, meta, _) = type("pass", into: safari, concealed: concealed, baseline: .selection(NSRange(location: 7, length: 0)))
        XCTAssertEqual(error?.errorName, "typeUnconfirmed", name)
        XCTAssertTrue(error?.message.hasPrefix("Nothing was typed") ?? false, name)
        XCTAssertEqual(reason(meta), "selectionChanged", name)
        XCTAssertEqual(record(meta)["secure"] as? Bool, true, name)
        XCTAssertNil(record(meta)["reads"], name)
        XCTAssertEqual(meta.entered, concealed ? nil : 0, name)
        XCTAssertFalse(safari.log.contains("post"), "\(name): nothing typed")
        XCTAssertEqual(safari.value, "hunter2", name)
        guard let classified = safari.log.lastIndex(of: "batch(AXRole,AXSubrole)@\(StubSafari.field)") else {
          XCTFail("\(name): classified by role and subrole in one request: \(safari.log.suffix(12))")
          continue
        }
        XCTAssertEqual(Array(safari.log[(classified + 1)...]), ["AXFocused@7", "AXParent@7", "AXParent@6"],
                       "\(name): the route's own reads, then nothing")
      }
    }
    let stable = StubSafari(value: "hunter2", selection: NSRange(location: 7, length: 0))
    stable.batches[StubSafari.field] = AttributeRead(values: [kAXRoleAttribute: "AXSecureTextField" as CFString])
    let (error, meta, _) = type("pass", into: stable, baseline: .stable)
    XCTAssertEqual(error?.errorName, "typeUnconfirmed")
    XCTAssertEqual(reason(meta), "noLongerSecure")
    XCTAssertEqual(stable.value, "hunter2pass", "a stable baseline types, as before")
  }

  /// The review of 81a1aebc..52f0109a (P2): a field the route found to be a password field keeps a password field's
  /// record whatever the snapshot's own reads then find: its role read failing is roleUnreadable with `secure: true`,
  /// and no reads or poll time.
  func testAPasswordFieldTheRouteFoundWhoseRoleThenFailsKeepsAPasswordFieldsRecord() {
    for concealed in [false, true] {
      let safari = StubSafari(value: "hunter2", selection: NSRange(location: 7, length: 0))
      safari.batches[StubSafari.field] = AttributeRead(values: [kAXRoleAttribute: "AXSecureTextField" as CFString])
      safari.errors[StubSafari.field] = [kAXRoleAttribute: .cannotComplete]
      let (error, meta, reply) = type("pass", into: safari, concealed: concealed)
      XCTAssertEqual(error?.errorName, "typeUnconfirmed")
      XCTAssertEqual(reason(meta), "roleUnreadable")
      XCTAssertEqual(record(meta)["secure"] as? Bool, true)
      XCTAssertNil(record(meta)["reads"])
      XCTAssertNil(record(meta)["pollMs"])
      XCTAssertFalse(reply.contains("hunter2"))
      XCTAssertEqual(safari.valueReads, [], "\(safari.log)")
    }
  }

  /// A closed element the route finds that is not a password field is refused unread with main's reason: roleUnreadable
  /// for an unreadable role, of the field or of the text the marker names, secure for that text marked secure. Nothing is
  /// read of the closed element after its classification, and no value or range of anything.
  func testAClosedFieldTheRouteFindsIsRefusedUnread() {
    let cases: [(String, Int, (StubSafari) -> Void, String)] = [
      ("unreadable role", StubSafari.field, { $0.errors[StubSafari.field] = [kAXRoleAttribute: .cannotComplete] }, "roleUnreadable"),
      ("no role", StubSafari.field, { $0.roles[StubSafari.field] = nil }, "roleUnreadable"),
      ("the text's role unreadable", StubSafari.text, { $0.errors[StubSafari.text] = [kAXRoleAttribute: .cannotComplete] }, "roleUnreadable"),
      ("the text secure", StubSafari.text, { $0.subroles[StubSafari.text] = "AXSecureTextField" }, "secure"),
    ]
    for concealed in [false, true] {
      for (name, closed, setUp, expected) in cases {
        let safari = StubSafari(value: "hunter2", selection: NSRange(location: 7, length: 0))
        setUp(safari)
        let (error, meta, _) = type("pass", into: safari, concealed: concealed)
        XCTAssertEqual(error?.errorName, "typeUnconfirmed", name)
        XCTAssertEqual(reason(meta), expected, name)
        XCTAssertEqual(safari.valueReads, [], "\(name): \(safari.log)")
        guard let classified = safari.log.lastIndex(of: "batch(AXRole,AXSubrole)@\(closed)") else {
          XCTFail("\(name): classified by role and subrole in one request: \(safari.log.suffix(12))")
          continue
        }
        let afterClassification = safari.log[(classified + 1)...]
        XCTAssertFalse(afterClassification.contains { $0.hasSuffix("@\(closed)") || $0.hasSuffix("@\(StubSafari.field)") },
                       "\(name): nothing more read: \(afterClassification)")
        XCTAssertEqual(Array(afterClassification), ["post", "post", "post", "post"], "\(name): the text is typed, nothing read")
      }
    }
  }

  // MARK: Odd replies

  /// A marker reply of any other shape claims nothing: the walk runs, and on the large page answers noFocusedElement;
  /// nothing is ever confirmed, and no value is read.
  func testAnOddMarkerReplyClaimsNothing() throws {
    let symbols = try XCTUnwrap(ReadbackMarkerSymbols.live)
    let cases: [(String, (StubSafari) -> Void)] = [
      ("no range", { $0.markerRange = nil; $0.markerRangeError = .noValue }),
      ("a failed range read beside a range", { $0.markerRangeError = .cannotComplete }),
      ("a string for the range", { safari in
        safari.markerRange = "range" as CFString
        safari.symbols = ReadbackMarkerSymbols(rangeTypeID: symbols.rangeTypeID, markerTypeID: symbols.markerTypeID, copyStart: { _ in safari.start })
      }),
      ("a marker for the range", { $0.markerRange = $0.start }),
      ("no start marker", { $0.symbols = ReadbackMarkerSymbols(rangeTypeID: symbols.rangeTypeID, markerTypeID: symbols.markerTypeID,
                                                                copyStart: { _ in nil }) }),
      ("a start that is not a marker", { safari in
        safari.symbols = ReadbackMarkerSymbols(rangeTypeID: symbols.rangeTypeID, markerTypeID: symbols.markerTypeID, copyStart: { _ in "start" as CFString })
        safari.named = { _ in (safari.el(StubSafari.text), .success) }
      }),
      ("no element", { $0.named = { _ in (nil, .noValue) } }),
      ("an element with an error", { safari in safari.named = { _ in (safari.el(StubSafari.text), .cannotComplete) } }),
      ("a string for the element", { $0.named = { _ in ("text" as CFString, .success) } }),
      ("another process's element", { $0.foreign = [StubSafari.text] }),
      ("the field another process's", { $0.foreign = [StubSafari.field] }),
      ("the web area itself", { safari in safari.named = { _ in (safari.el(StubSafari.web), .success) } }),
      ("text outside any field", { safari in safari.named = { _ in (safari.el(1_005), .success) } }),
      ("a failed parent", { $0.errors[StubSafari.text] = [kAXParentAttribute: .cannotComplete] }),
      ("no parent", { $0.parents[StubSafari.text] = nil }),
    ]
    for (name, setUp) in cases {
      let safari = StubSafari()
      setUp(safari)
      let (error, meta, _) = type("xyz", into: safari)
      XCTAssertEqual(error?.errorName, "typeUnconfirmed", name)
      XCTAssertEqual(reason(meta), "noFocusedElement", name)
      XCTAssertEqual(safari.valueReads, [], "\(name): \(safari.valueReads)")
      XCTAssertEqual(safari.windowChildrenReads, 2, "\(name): the web area's search, then the walk after the route claimed nothing")
    }
    // On a page the walk can read, it finds the field the route could not.
    let small = StubSafari(filler: 3)
    small.markerRangeError = .noValue
    XCTAssertNil(type("xyz", into: small).error)
  }

  /// The marker names an element more than `typeReadbackMarkerFieldHops` below its field: no claim; at the cap, the
  /// field. The climb stops at the web area without reading above it.
  func testTheClimbToTheFieldIsBounded() {
    func chain(_ hops: Int) -> StubSafari {
      let safari = StubSafari()
      var below = StubSafari.field
      for level in 0..<(hops - 1) {
        let id = 50 + level
        safari.roles[id] = "AXGroup"
        safari.parents[id] = below
        below = id
      }
      safari.parents[StubSafari.text] = below
      return safari
    }
    XCTAssertNil(type("xyz", into: chain(typeReadbackMarkerFieldHops)).error, "the field at the cap")
    XCTAssertEqual(reason(type("xyz", into: chain(typeReadbackMarkerFieldHops + 1)).meta), "noFocusedElement")

    let outside = StubSafari()
    outside.named = { _ in (outside.el(StubSafari.filler), .success) }  // a group straight under the web area
    type("xyz", into: outside)
    XCTAssertTrue(outside.log.contains("AXParent@9"))
    XCTAssertFalse(outside.log.prefix(upTo: outside.log.firstIndex(of: "post") ?? 0).contains("AXParent@5"), "nothing above the web area")
    XCTAssertTrue(outside.log.contains("post"))
  }

  // MARK: The claim

  /// A field that does not read AXFocused true, or does not lie under the web area its marker came from, is not
  /// claimed.
  func testAFieldNotFocusedOrNotUnderTheWebAreaIsNoClaim() {
    let cases: [(String, (StubSafari) -> Void)] = [
      ("not focused", { $0.focused = [] }),
      ("focus unreadable", { $0.errors[StubSafari.field] = [kAXFocusedAttribute: .cannotComplete] }),
      ("no focus attribute", { $0.errors[StubSafari.field] = [kAXFocusedAttribute: .noValue] }),
      ("no parent", { $0.parents[StubSafari.field] = nil }),
      ("a failed parent", { $0.errors[StubSafari.form] = [kAXParentAttribute: .cannotComplete] }),
      ("an ancestor another process's", { $0.foreign = [StubSafari.form] }),
      ("under another web area", { safari in
        safari.roles[40] = "AXWebArea"
        safari.parents[StubSafari.form] = 40
      }),
    ]
    for (name, setUp) in cases {
      let safari = StubSafari()
      setUp(safari)
      XCTAssertEqual(reason(type("xyz", into: safari).meta), "noFocusedElement", name)
      XCTAssertEqual(safari.valueReads, [], name)
    }
    let foreignForm = StubSafari()
    foreignForm.foreign = [StubSafari.form]
    type("xyz", into: foreignForm)
    XCTAssertFalse(foreignForm.log.contains("AXParent@6"), "another process's ancestor is not climbed")
    // An iframe's web area between the field and the page's: under it all the same.
    let framed = StubSafari()
    framed.roles[40] = "AXWebArea"
    framed.parents[StubSafari.form] = 40
    framed.parents[40] = StubSafari.web
    XCTAssertNil(type("xyz", into: framed).error)
    // The scope's bound: a field nested deeper than it under the web area is not shown to lie under it.
    func nested(_ depth: Int) -> StubSafari {
      let safari = StubSafari()
      var below = StubSafari.form
      for level in 0..<(depth - 2) {
        let id = 60 + level
        safari.roles[id] = "AXGroup"
        safari.parents[below] = id
        below = id
      }
      safari.parents[below] = StubSafari.web
      return safari
    }
    XCTAssertNil(type("xyz", into: nested(typeReadbackMarkerScopeHops)).error)
    XCTAssertEqual(reason(type("xyz", into: nested(typeReadbackMarkerScopeHops + 1)).meta), "noFocusedElement")
  }

  // MARK: After typing

  /// No marker call follows the first event: the final poll's check and a checkpoint's (before a Tab) ask the field
  /// itself, AXFocused true. A Tab that moved focus out answers fieldChanged.
  func testNoMarkerCallFollowsTheFirstEvent() {
    for concealed in [false, true] {
      let safari = StubSafari()
      safari.roles[StubSafari.field] = "AXTextField"
      let (_, meta, _) = type("ab\tcd", into: safari, concealed: concealed)
      guard let first = safari.log.firstIndex(of: "post") else { return XCTFail("nothing was typed") }
      XCTAssertEqual(safari.log[..<first].filter { $0.contains("TextMarker") }.count, 2)
      XCTAssertTrue(safari.log[first...].allSatisfy { !$0.contains("TextMarker") }, "\(safari.log[first...])")
      XCTAssertFalse(safari.log[first...].contains { $0.hasPrefix("AXFocusedUIElement") || $0.hasPrefix("AXChildren") },
                     "nothing is looked up again")
      XCTAssertEqual(reason(meta), "fieldChanged", "the Tab moved focus out")
      XCTAssertEqual(safari.log[first...].filter { $0 == "AXFocused@7" }.count, concealed ? 1 : 2,
                     "the checkpoint's check and the final one (a secret makes no checkpoint)")
    }
  }

  /// The field the route found reading AXFocused false after typing is fieldChanged, whatever its value reads.
  func testAFieldThatLostFocusIsFieldChanged() {
    let safari = StubSafari()
    var delivered = 0
    safari.transform = { text in
      delivered += 1
      if delivered == 3 { safari.focused = [] }  // after the last unit is taken in
      return text
    }
    XCTAssertEqual(reason(type("xyz", into: safari).meta), "fieldChanged")
    XCTAssertEqual(safari.value, "abcxyz", "the value reads as expected; focus alone decides")
  }

  /// The reads are the same whatever the secret: its length and content change none of them, and the check after
  /// typing reads as a plain request's does.
  func testTheReadsAreTheSameWhateverTheSecret() {
    func reads(_ text: String, concealed: Bool) -> [String] {
      let safari = StubSafari()
      XCTAssertNil(type(text, into: safari, concealed: concealed).error, text)
      return safari.log.filter { $0 != "post" }
    }
    let short = reads("x", concealed: true), long = reads("s3cr3t-Zebra-and-more", concealed: true)
    XCTAssertEqual(short, long)
    let plain = reads("s3cr3t-Zebra-and-more", concealed: false)
    XCTAssertEqual(Array(short.prefix(while: { $0 != "\(kAXRoleAttribute)@7" })), Array(plain.prefix(while: { $0 != "\(kAXRoleAttribute)@7" })),
                   "the same lookup")
    XCTAssertEqual(short.last, "AXFocused@7")
    XCTAssertEqual(plain.last, "AXFocused@7")
  }

  // MARK: The web area

  /// The web area's marker is read only once it is found among the app's elements and classifies open as an AXWebArea:
  /// one that is another process's or lies under another process's group, whose subrole or (in the classification
  /// request) role cannot be read, that the request reads as another role, or that reads as a password field makes no
  /// marker call at all, and claims nothing, not even a refusal: the large page answers noFocusedElement. Another
  /// process's is not classified.
  func testTheWebAreaIsTheAppsAndClassifiedBeforeItsMarkerIsRead() {
    let cases: [(String, (StubSafari) -> Void)] = [
      ("another process's", { $0.foreign = [StubSafari.web] }),
      ("under another process's group", { safari in
        safari.roles[41] = "AXGroup"
        safari.children[StubSafari.window] = [StubSafari.toolbar, 41]
        safari.children[41] = [StubSafari.web]
        safari.parents[41] = StubSafari.window
        safari.parents[StubSafari.web] = 41
        safari.foreign = [41]
      }),
      ("its subrole unreadable", { $0.errors[StubSafari.web] = [kAXSubroleAttribute: .cannotComplete] }),
      ("its role unreadable in the classification", { $0.batches[StubSafari.web] = AttributeRead(unreadable: [kAXRoleAttribute]) }),
      ("another role in the classification", { $0.batches[StubSafari.web] = AttributeRead(values: [kAXRoleAttribute: "AXGroup" as CFString]) }),
      ("a password field's subrole", { $0.subroles[StubSafari.web] = "AXSecureTextField" }),
    ]
    for (name, setUp) in cases {
      let safari = StubSafari()
      setUp(safari)
      XCTAssertEqual(reason(type("xyz", into: safari).meta), "noFocusedElement", name)
      XCTAssertEqual(safari.markerCalls, [], name)
      XCTAssertEqual(safari.valueReads, [], name)
      XCTAssertEqual(safari.windowChildrenReads, 2, "\(name): the web area's search, then the walk after the route claimed nothing")
    }
    let foreign = StubSafari()
    foreign.foreign = [StubSafari.web]
    type("xyz", into: foreign)
    XCTAssertFalse(foreign.log.contains("batch(AXRole,AXSubrole)@5"), "another process's web area is not classified")
  }

  /// The window's web area is the first breadth first among the app's elements, within the walk's bounds; another
  /// process's element is skipped unread; a text-entry element is a leaf; a failed read, or a search past a bound, finds
  /// none.
  func testTheWebAreaIsFoundWithinTheWalksBounds() {
    var roles: [Int: String] = [:], children: [Int: [Int]] = [:], failing: Set<String> = [], foreign: Set<Int> = []
    var log: [String] = [], clock = 0.0, msPerNode = 0.0
    let walk = ReadbackFocusWalk<Int>(children: { node in
      log.append("children@\(node)")
      return failing.contains("children@\(node)") ? .failed : children[node].map { .value($0) } ?? .absent
    }, isFocused: { _ in .value(false) }, role: { node in
      clock += msPerNode
      log.append("role@\(node)")
      return failing.contains("role@\(node)") ? .failed : roles[node].map { .value($0) } ?? .absent
    }, now: { clock })
    func search() -> Int? { log = []; clock = 0; return readbackWebArea(0, walk, owned: { !foreign.contains($0) }) }

    roles = [0: "AXWindow", 1: "AXTextField", 2: "AXGroup", 3: "AXWebArea", 4: "AXWebArea"]
    children = [0: [1, 2], 1: [10], 2: [3], 3: [4]]
    XCTAssertEqual(search(), 3, "the outer web area")
    XCTAssertFalse(log.contains("children@1"), "a text field is a leaf")
    XCTAssertFalse(log.contains("children@3"))
    failing = ["role@1"]
    XCTAssertNil(search(), "a failed read finds none")
    failing = ["children@2"]
    XCTAssertNil(search())
    children[0] = [2, 4]  // a web area after the element whose children failed: what failed could hold the page's
    XCTAssertNil(search(), "a failed children read finds none, though another web area follows")
    failing = []
    XCTAssertEqual(search(), 4, "without the failure, that one, the shallower")
    children[0] = [1, 2]

    // Another process's element is skipped, its role and children never read: one between the window and a web area
    // hides it; a sibling before the web area, even one that reads as a web area, is no candidate and does not stop the
    // search; the window itself is checked too.
    roles[5] = "AXGroup"
    roles[6] = "AXWebArea"
    children[0] = [5]
    children[5] = [3]
    foreign = [5]
    XCTAssertNil(search(), "a web area under another process's group is not found")
    XCTAssertFalse(log.contains("role@5") || log.contains("children@5"), "another process's element is not read: \(log)")
    children[0] = [6, 2]
    foreign = [6]
    XCTAssertEqual(search(), 3, "another process's sibling is skipped, and the search goes on")
    XCTAssertFalse(log.contains("role@6"))
    foreign = [0]
    XCTAssertNil(search())
    XCTAssertEqual(log, [], "another process's window is not read")
    foreign = []
    children[0] = [1, 2]

    // The node bound: the web area after more nodes than the walk reads.
    let filler = Array(100..<(100 + typeReadbackFocusWalkNodes))
    children = [0: filler + [3]]
    XCTAssertNil(search())
    children = [0: Array(filler.prefix(typeReadbackFocusWalkNodes - 2)) + [3]]
    XCTAssertEqual(search(), 3, "the window, the filler and the web area fill the bound")
    // The time bound.
    msPerNode = 1
    children = [0: Array(filler.prefix(Int(typeReadbackFocusWalkMs) + 5)) + [3]]
    XCTAssertNil(search())
    msPerNode = 0
    // The depth bound: the window is depth 0, and nothing below the bound's depth is read.
    var chain: [Int: [Int]] = [:]
    for level in 0..<typeReadbackFocusWalkDepth { chain[200 + level] = [200 + level + 1] }
    roles[200 + typeReadbackFocusWalkDepth - 1] = nil
    children = chain.merging([0: [200]]) { $1 }
    roles[200 + typeReadbackFocusWalkDepth] = "AXWebArea"
    XCTAssertNil(search(), "a web area past the depth bound")
    roles[200 + typeReadbackFocusWalkDepth] = nil
    roles[200 + typeReadbackFocusWalkDepth - 1] = "AXWebArea"
    XCTAssertEqual(search(), 200 + typeReadbackFocusWalkDepth - 1, "one at the bound")
  }
}
