// Hosted scratch-build diagnostic for the #414 Firefox lane. Answers one question: which element of the owned page is the
// focused field that type_text's own snapshot saw (the one the product refused as notTextField or typed into)?
//
// Armed for one `type_text` request (the `probe414Firefox` string in its args). At the snapshot it records the role and
// subrole the snapshot itself read (its actual returns: a public AX role constant, or for the subrole also "absent" or "failed") and keeps the actual
// AXUIElement. After the production action, at the request's own scope exit, it compares that element by AX identity with
// the owned page's two marked nodes: the password node (id "password", label "PW walk test") and the plain setup control
// (id "setup", label "Setup control"). Identity only:
//   * the attribute names it can read are the six of `Attr` below (the type system admits no other): AXDOMIdentifier,
//     AXIdentifier, AXTitle, AXDescription, AXParent and AXChildren. No AXValue, AXValueDescription, AXSelectedText,
//     count, range or parameterized request exists in this file; AXRole and AXSubrole are not read here at all (the
//     snapshot's own answers are taken as they were);
//   * a string is compared to a fixed public label and dropped at once; none is kept or printed;
//   * the traversal is bounded (nodes, depth, time); relations come from exact CFEqual of the kept element with the
//     candidates and with their AXParent chains.
// It emits ONE stderr JSON line `{"probe414Firefox":{"id","role","subrole","relationship"}}`: id is the request tag; role and
// subrole are an AX role constant or null; relationship is one of self, ancestor, descendant, setupField, other, unknown.
// A request with no snapshot field still emits role null, subrole null, relationship unknown. Its reads are separate from the
// scratch audit's and are never part of any measured outcome or timing.
import ApplicationServices
import Foundation

final class Probe414Firefox: @unchecked Sendable {
  static let shared = Probe414Firefox()

  private enum Attr: String {
    case domIdentifier = "AXDOMIdentifier", identifier = "AXIdentifier", title = "AXTitle", description = "AXDescription"
    case parent = "AXParent", children = "AXChildren"
  }
  private static let passwordId = "password", passwordLabel = "PW walk test"
  private static let setupId = "setup", setupLabel = "Setup control"
  private static let nodeCap = 6000, depthCap = 64, chainCap = 64
  private static let budgetNs: UInt64 = 4_000_000_000

  private let lock = NSLock()
  private var id: String?
  private var owner: pthread_t?
  private var captured = false
  private var role: String?
  private var subrole: String?
  private var element: AXUIElement?

  /// Arms the recorder for one request that carries a well-formed tag; any other request is untouched.
  func begin(_ args: [String: Any]) -> String? {
    guard let tag = args["probe414Firefox"] as? String, !tag.isEmpty, tag.utf8.count <= 64, tag.utf8.allSatisfy({
      ($0 >= 48 && $0 <= 57) || ($0 >= 65 && $0 <= 90) || ($0 >= 97 && $0 <= 122) || $0 == 45 || $0 == 46 || $0 == 58 || $0 == 95
    }) else { return nil }
    lock.lock(); defer { lock.unlock() }
    guard id == nil else { return nil }
    id = tag; owner = pthread_self(); captured = false; role = nil; subrole = nil; element = nil
    return tag
  }

  private static func isRoleConstant(_ s: String) -> Bool {
    s.hasPrefix("AX") && s.utf8.count <= 42 && s.utf8.allSatisfy { ($0 >= 65 && $0 <= 90) || ($0 >= 97 && $0 <= 122) }
  }
  private static func label(_ s: String) -> String { isRoleConstant(s) ? s : "unrecognized" }

  /// The type_text snapshot's field, role and subrole exactly as its own reads returned them. The first one of the request is kept.
  func snapshot<Element>(_ field: Element, role: String, subrole: ReadbackSubrole) {
    lock.lock(); defer { lock.unlock() }
    guard id != nil, !captured, let owner, pthread_equal(owner, pthread_self()) != 0 else { return }
    captured = true
    self.role = Probe414Firefox.label(role)
    switch subrole {
    case .value(let found): self.subrole = Probe414Firefox.label(found)
    case .absent: self.subrole = "absent"
    case .failed: self.subrole = "failed"
    }
    let object = field as AnyObject
    if CFGetTypeID(object) == AXUIElementGetTypeID() { element = unsafeBitCast(object, to: AXUIElement.self) }
  }

  // MARK: identity reads (closed attribute set)

  private func copy(_ e: AXUIElement, _ attr: Attr) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(e, attr.rawValue as CFString, &value) == .success ? value : nil
  }
  private func string(_ e: AXUIElement, _ attr: Attr) -> String? {
    guard let v = copy(e, attr), CFGetTypeID(v) == CFStringGetTypeID() else { return nil }
    return (v as! String)
  }
  private func parent(_ e: AXUIElement) -> AXUIElement? {
    guard let v = copy(e, .parent), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
    return (v as! AXUIElement)
  }
  private func children(_ e: AXUIElement) -> [AXUIElement] {
    guard let v = copy(e, .children), CFGetTypeID(v) == CFArrayGetTypeID() else { return [] }
    let array = v as! CFArray
    return (0..<CFArrayGetCount(array)).compactMap { i in
      guard let raw = CFArrayGetValueAtIndex(array, i) else { return nil }
      let item = Unmanaged<AnyObject>.fromOpaque(raw).takeUnretainedValue()
      return CFGetTypeID(item) == AXUIElementGetTypeID() ? unsafeBitCast(item, to: AXUIElement.self) : nil
    }
  }
  /// The element's AXParent chain, nearest first, bounded.
  private func ancestors(_ e: AXUIElement) -> [AXUIElement] {
    var chain: [AXUIElement] = []
    var at = e
    while chain.count < Probe414Firefox.chainCap, let up = parent(at) {
      if CFEqual(up, at) || chain.contains(where: { CFEqual($0, up) }) { break }
      chain.append(up); at = up
    }
    return chain
  }

  private struct Found { var passwordStrong: [AXUIElement] = [], passwordWeak: [AXUIElement] = []
                         var setupStrong: [AXUIElement] = [], setupWeak: [AXUIElement] = [] }

  /// Bounded breadth-first walk from `top`; each node is matched by identifier and by exact public label, and both are dropped at once.
  private func find(from top: AXUIElement, started: UInt64) -> Found {
    var found = Found()
    var level: [AXUIElement] = [top], seen = 0, depth = 0
    while !level.isEmpty, depth <= Probe414Firefox.depthCap {
      var next: [AXUIElement] = []
      for node in level {
        if seen >= Probe414Firefox.nodeCap || DispatchTime.now().uptimeNanoseconds &- started > Probe414Firefox.budgetNs { return found }
        seen += 1
        let ids = [string(node, .domIdentifier), string(node, .identifier)]
        let labels = [string(node, .title), string(node, .description)]
        let isPasswordId = ids.contains(Probe414Firefox.passwordId), isPasswordLabel = labels.contains(Probe414Firefox.passwordLabel)
        let isSetupId = ids.contains(Probe414Firefox.setupId), isSetupLabel = labels.contains(Probe414Firefox.setupLabel)
        if isPasswordId && isPasswordLabel { found.passwordStrong.append(node) } else if isPasswordId || isPasswordLabel { found.passwordWeak.append(node) }
        if isSetupId && isSetupLabel { found.setupStrong.append(node) } else if isSetupId || isSetupLabel { found.setupWeak.append(node) }
        if !found.passwordStrong.isEmpty && !found.setupStrong.isEmpty { return found }
        next.append(contentsOf: children(node))
      }
      level = next; depth += 1
    }
    return found
  }

  private func relationship(of field: AXUIElement) -> String {
    let started = DispatchTime.now().uptimeNanoseconds
    var pid: pid_t = 0
    if AXUIElementGetPid(field, &pid) == .success { _ = AXUIElementSetMessagingTimeout(AXUIElementCreateApplication(pid), 1.0) }
    let up = ancestors(field)
    let found = find(from: up.last ?? field, started: started)
    let password = found.passwordStrong.isEmpty ? found.passwordWeak : found.passwordStrong
    let setup = found.setupStrong.isEmpty ? found.setupWeak : found.setupStrong
    var best = 0  // 3 self, 2 ancestor, 1 descendant
    for p in password {
      if CFEqual(field, p) { best = max(best, 3); continue }
      if ancestors(p).contains(where: { CFEqual($0, field) }) { best = max(best, 2) }
      if up.contains(where: { CFEqual($0, p) }) { best = max(best, 1) }
    }
    switch best {
    case 3: return "self"
    case 2: return "ancestor"
    case 1: return "descendant"
    default: break
    }
    if setup.contains(where: { CFEqual(field, $0) }) { return "setupField" }
    return password.isEmpty ? "unknown" : "other"
  }

  /// At the request's scope exit, after the production action: the comparison, then the one stderr line. Never throws or alters anything.
  func finish(_ tag: String?) {
    guard let tag else { return }
    lock.lock()
    guard id == tag else { lock.unlock(); return }
    let (role, subrole, kept) = (self.role, self.subrole, element)
    id = nil; owner = nil; captured = false; self.role = nil; self.subrole = nil; element = nil
    lock.unlock()
    let relation = kept.map { relationship(of: $0) } ?? "unknown"
    let record: [String: Any] = ["id": tag, "role": role.map { $0 as Any } ?? NSNull(), "subrole": subrole.map { $0 as Any } ?? NSNull(), "relationship": relation]
    if let data = try? JSONSerialization.data(withJSONObject: ["probe414Firefox": record], options: [.sortedKeys]) {
      FileHandle.standardError.write(data + Data([10]))
    }
  }
}
