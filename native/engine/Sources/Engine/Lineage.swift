import ApplicationServices
import Foundation

// Indexes and handles (the spec's Design, "Indexes and handles"). Per (connection, app) the engine keeps a lineage: an
// id, and a table from index to element handle plus what identifies the element (role, identifier, title, its path of
// child positions, its owning pid). An element equal (CFEqual) to one already in the lineage keeps its index; a new
// one takes the next unused index; a vanished one's index is retired, never reused in that lineage. An action whose
// handle the app reports invalid is re-resolved by walking the current tree for the one element matching the stored
// identification.

/// One connection's state, touched only by that connection's thread.
final class ConnectionState: @unchecked Sendable {
  let id: Int
  let fd: Int32
  /// Lineages by app key (`ResolvedApp.key`).
  var lineages: [String: Lineage] = [:]
  /// Apps whose actions are refused until a fresh get_app_state, after an intervention.
  var requiresRequery: Set<String> = []

  init(id: Int, fd: Int32) {
    self.id = id
    self.fd = fd
  }
}

struct ElementIdentity {
  let role: String
  let identifier: String?
  let title: String?
  let path: [Int]
  let pid: pid_t
}

struct LineageEntry {
  var element: AXUIElement
  let identity: ElementIdentity
  let actions: [String]
  let frame: CGRect?
}

final class Lineage {
  let id: String
  private(set) var revision = 0
  private(set) var nextIndex = 0
  private var entries: [Int: LineageEntry] = [:]
  private var indexes: [ElementKey: Int] = [:]

  init() { id = "L" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12).lowercased() }

  /// The index an element observed now takes: its old one when the lineage has seen it, else the next unused.
  func index(for element: AXUIElement) -> Int {
    if let known = indexes[ElementKey(element: element)] { return known }
    let index = nextIndex
    nextIndex += 1
    indexes[ElementKey(element: element)] = index
    return index
  }

  /// Ends an observation: the table becomes exactly what it saw, and every index it did not see is retired.
  func commit(_ observed: [Int: LineageEntry]) {
    revision += 1
    entries = observed
    indexes = Dictionary(uniqueKeysWithValues: observed.map { (ElementKey(element: $0.value.element), $0.key) })
  }

  func entry(_ index: Int) -> LineageEntry? { entries[index] }

  func replace(_ index: Int, element: AXUIElement) {
    guard var entry = entries[index] else { return }
    indexes[ElementKey(element: entry.element)] = nil
    entry.element = element
    entries[index] = entry
    indexes[ElementKey(element: element)] = index
  }
}

enum ElementErrors {
  static let noLongerValid = EngineError(name: "elementNoLongerValid",
    "The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.")
  static let ambiguousAfterRefetch = EngineError(name: "elementAmbiguousAfterRefetch",
    "The element was invalidated, and an attempt was made to refetch it, but the refetch couldn't be finished because multiple elements were found that match the criteria. Try to get the on-screen content again and see if that resolves the issue.")
  static func invalid(_ index: Int) -> EngineError { EngineError(name: "invalidElementID", "\(index) is an invalid element ID") }
}

extension ConnectionState {
  /// The element an action names: index `index` of the app's current lineage, which must be `lineage` when the action
  /// names one, re-resolved when its handle went stale.
  func element(_ index: Int, app: ResolvedApp, lineage wanted: String?, window: () -> AXUIElement?) throws -> LineageEntry {
    guard let lineage = lineages[app.key], wanted == nil || wanted == lineage.id else { throw ElementErrors.noLongerValid }
    guard index >= 0, index < lineage.nextIndex else { throw ElementErrors.invalid(index) }
    guard let entry = lineage.entry(index) else { throw ElementErrors.noLongerValid }
    let probe = copyAttribute(entry.element, kAXRoleAttribute)
    if probe.error != .invalidUIElement { return entry }
    guard let root = window() else { throw ElementErrors.noLongerValid }
    let candidates = matching(entry.identity, under: root)
    let chosen: AXUIElement
    if candidates.count == 1 {
      chosen = candidates[0].element
    } else if candidates.isEmpty {
      throw ElementErrors.noLongerValid
    } else {
      let samePath = candidates.filter { $0.path == entry.identity.path }
      guard samePath.count == 1 else { throw ElementErrors.ambiguousAfterRefetch }
      chosen = samePath[0].element
    }
    lineage.replace(index, element: chosen)
    return lineage.entry(index)!
  }
}

/// The elements under `root` (depth-first, within the observation's caps) whose role, identifier, title and owning
/// pid equal the identity's, with their paths.
private func matching(_ identity: ElementIdentity, under root: AXUIElement) -> [(element: AXUIElement, path: [Int])] {
  let attributes = [kAXRoleAttribute, kAXIdentifierAttribute, kAXTitleAttribute, kAXChildrenAttribute] as CFArray
  var found: [(AXUIElement, [Int])] = []
  var stack: [(AXUIElement, [Int])] = [(prepare(root), [])]
  var visited = 0
  let deadline = monotonicMilliseconds() + Double(observationDeadlineMs)
  while let next = stack.popLast(), visited < maxObservedNodes, monotonicMilliseconds() < deadline {
    let (element, path) = next
    visited += 1
    var values: CFArray?
    guard AXUIElementCopyMultipleAttributeValues(element, attributes, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
          let slots = values as? [Any], slots.count == 4 else { continue }
    let role = present(slots[0]).flatMap { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }
    let identifier = present(slots[1]).flatMap { CFGetTypeID($0) == CFStringGetTypeID() ? ($0 as! String) : nil }
    let title = present(slots[2]).flatMap { CFGetTypeID($0) == CFStringGetTypeID() ? bounded($0 as! String) : nil }
    if role == identity.role, identifier == identity.identifier, title == identity.title, pid(of: element) == identity.pid {
      found.append((element, path))
    }
    if path.count < maxDepth {
      for (position, child) in children(present(slots[3])).enumerated().reversed() { stack.append((prepare(child), path + [position])) }
    }
  }
  return found
}
