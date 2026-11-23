import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #520 (design ruling 1157): the head reads a static text's value only where main 82ac93f3 read it, as often and in the
// same order among every other AX request, one classified batch in place of each single raw read. Proven over the
// consumers that read it (#305 `recordedHitAtPoint`, #296 `recreatedHandle`, #298 `relabelledLabel`, #453
// `overlayLabelsAgree`, #442's sentence) by a fake that records every request in order. Each is run as the head runs it
// and as a frozen copy of main's code runs it (verbatim from 82ac93f3 but for names and its file-private helpers
// inlined; the helpers #520 does not touch, `editedInPlace`, `recreatedRefused`, `stalePointLabelsAgree`, are shared):
// - where the value reads open, the two sequences are equal once main's raw value read and the head's batch are both
//   written VALUE, and the head makes no raw value read at all;
// - where the element now classifies closed, the head's sequence equals main's up to and including that VALUE on the
//   same app, and in full equals main's where main's raw read fails: an unread sample takes main's path for a failed read.

private final class Log { var calls: [String] = [] }

/// An element of the fake tree: what each read answers now.
private final class Elem {
  let id: String
  let role: String
  var title: String?
  var description: String?
  var value: String?
  var frame: CGRect?
  var actions: [String] = []
  /// Its subrole reads AXSecureTextField now: #405 classifies it closed.
  var closedNow = false
  weak var parent: Elem?
  var children: [Elem] = []
  init(_ id: String, _ role: String, _ frame: CGRect?, title: String? = nil, description: String? = nil, value: String? = nil) {
    (self.id, self.role, self.frame, self.title, self.description, self.value) = (id, role, frame, title, description, value)
  }
  func add(_ child: Elem) {
    child.parent = self
    children.append(child)
  }
  func destroy() {
    (frame, title, description, value) = (nil, nil, nil, nil)
    parent?.children.removeAll { $0 === self }
    parent = nil
  }
}

/// Which side reads: main's single raw reads (`failValue`: its value read fails, kAXErrorCannotComplete), or the head's
/// classified batch.
private enum Side { case main(failValue: Bool), head }

/// Every request logged in order. A value read is VALUE on main's side (`value`, or `label`/`strictLabel` of the value)
/// and the head's batch (`classifiedValue`); a raw value read on the head's side is RAW, which must never appear.
private func reads(_ log: Log, _ side: Side) -> StalePointReads<Elem> {
  let head: Bool
  let fails: Bool
  switch side {
  case .main(let failValue): (head, fails) = (false, failValue)
  case .head: (head, fails) = (true, false)
  }
  func logged<T>(_ name: String, _ element: Elem, _ answer: T) -> T {
    log.calls.append("\(name):\(element.id)")
    return answer
  }
  func rawValue(_ element: Elem, _ via: String) -> (value: CFTypeRef?, error: AXError) {
    log.calls.append(head ? "RAW-\(via):\(element.id)" : "VALUE:\(element.id)")
    if element.frame == nil || fails { return (nil, .cannotComplete) }
    return element.value.map { ($0 as CFString, AXError.success) } ?? (nil, .noValue)
  }
  func single(_ element: Elem, _ part: StalePointLabelPart, _ via: String) -> (value: CFTypeRef?, error: AXError) {
    if part == .value { return rawValue(element, via) }
    log.calls.append("\(via)-\(part):\(element.id)")
    let text = part == .title ? element.title : element.description
    return text.map { ($0 as CFString, AXError.success) } ?? (nil, .noValue)
  }
  return StalePointReads<Elem>(
    role: { logged("role", $0, $0.frame == nil ? nil : $0.role) }, frame: { logged("frame", $0, $0.frame) },
    parent: { logged("parent", $0, $0.parent) }, children: { logged("children", $0, $0.frame == nil ? nil : $0.children) },
    title: { logged("title", $0, $0.title) }, description: { logged("description", $0, $0.description) },
    value: { element in
      let read = rawValue(element, "value")
      return read.error == .success ? read.value as? String : nil
    },
    editableAncestor: { logged("editableAncestor", $0, nil) }, actions: { logged("actions", $0, $0.frame == nil ? nil : $0.actions) },
    label: { element, part in
      let read = single(element, part, "label")
      return stalePointLabelRead(read.value, read.error)
    }, same: { $0 === $1 }, gone: { logged("gone", $0, $0.frame == nil) },
    strictLabel: { element, part in
      let read = single(element, part, "strictLabel")
      return stalePointStrictLabelRead(read.value, read.error)
    },
    classifiedValue: head ? { element in
      log.calls.append("VALUE:\(element.id)")
      guard element.frame != nil else { return batchValueRead(value: nil) }
      return batchValueRead(subrole: element.closedNow ? "AXSecureTextField" as CFString : axErrorSlot(.noValue),
                            value: element.value.map { $0 as CFString } ?? axErrorSlot(.noValue))
    } : nil)
}

/// The record a walk makes of `root`'s tree (its labels as given, every child recorded).
private func walk(_ root: Elem) -> (nodes: [ScreenshotNode<Elem>], frameless: [ScreenshotNode<Elem>], members: (Elem) -> Bool?) {
  var all: [ScreenshotNodeRead<Elem>] = []
  func visit(_ element: Elem, parent: Int?, depth: Int) {
    let number = all.count
    all.append(ScreenshotNodeRead(element: element, number: number, parent: parent, depth: depth, role: element.role, title: element.title,
                                  description: element.description, frame: element.frame, actions: element.actions,
                                  childCount: element.children.count, children: element.children,
                                  value: screenshotLabelValue(role: element.role, element.value.map { $0 as CFString })))
    for child in element.children { visit(child, parent: number, depth: depth + 1) }
  }
  visit(root, parent: nil, depth: 0)
  let key: (Elem) -> AnyHashable = { AnyHashable(ObjectIdentifier($0)) }
  let record = screenshotRecord(all, key: key)
  let complete = screenshotChildrenRecorded(all, key: { ObjectIdentifier($0) })
  return (record.nodes, record.frameless, { complete[ObjectIdentifier($0)] })
}

// MARK: main's code at 82ac93f3, verbatim but for names and inlined file-private helpers

private let mainWalkStops: Set<String> = ["AXWindow", "AXSheet", "AXApplication"]

private func mainAncestors<Element>(of element: Element, _ reads: StalePointReads<Element>) -> [Element] {
  var found: [Element] = []
  var current = element
  for _ in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { break }
    found.append(next)
    if mainWalkStops.contains(reads.role(next) ?? "") { break }
    current = next
  }
  return found
}

private func mainDescendants<Element>(of element: Element, _ reads: StalePointReads<Element>) -> [Element] {
  var queue = reads.children(element) ?? []
  var head = 0
  while head < queue.count && queue.count < stalePointDescendantBound {
    queue.append(contentsOf: reads.children(queue[head]) ?? [])
    head += 1
  }
  return Array(queue.prefix(stalePointDescendantBound))
}

private func mainRecreatedHandle<Element>(of node: ScreenshotNode<Element>, near hit: Element, windowShift: CGVector = .zero,
                                          nodes: [ScreenshotNode<Element>], frameless: [ScreenshotNode<Element>], recorded: (Element) -> Bool?,
                                          _ reads: StalePointReads<Element>) -> (element: Element, frame: CGRect, refused: Bool)? {
  let expected = node.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)
  var best: (element: Element, frame: CGRect, distance: CGFloat)?
  for candidate in [hit] + mainAncestors(of: hit, reads) + mainDescendants(of: hit, reads) {
    guard reads.role(candidate) == node.role, let frame = reads.frame(candidate) else { continue }
    let distance = frameDistance(frame, expected)
    guard distance <= stalePointFrameTolerance, best.map({ distance < $0.distance }) ?? true else { continue }
    let (title, description) = (reads.title(candidate), reads.description(candidate))
    func agrees(value: String?) -> Bool {
      stalePointLabelsAgree(recordedTitle: node.title, recordedDescription: node.description, recordedValue: node.value, title: title,
                            description: description, value: value)
    }
    guard agrees(value: node.value == nil ? nil : reads.value(candidate))
            || (node.editableAncestor.map { editedInPlace(candidate, region: $0, reads) } == true && agrees(value: nil)) else { continue }
    best = (candidate, frame, distance)
  }
  guard let best else { return nil }
  return (best.element, best.frame, recreatedRefused(best.element, of: node, nodes: nodes, frameless: frameless, recorded: recorded, reads))
}

private func mainRecordedHitAtPoint<Element>(_ element: Element, at point: CGPoint, windowShift: CGVector, nodes: [ScreenshotNode<Element>],
                                             frameless: [ScreenshotNode<Element>] = [], recorded: (Element) -> Bool? = { _ in nil },
                                             _ reads: StalePointReads<Element>) -> RecordedHitFrame? {
  let tolerance = stalePointFrameTolerance
  func widened(_ rect: CGRect) -> CGRect { rect.insetBy(dx: -tolerance, dy: -tolerance) }
  func inPlace(_ live: CGRect?, _ node: ScreenshotNode<Element>) -> Bool {
    live.map { frameDistance($0, node.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)) <= tolerance } ?? false
  }
  let meant = CGPoint(x: point.x - windowShift.dx, y: point.y - windowShift.dy)
  func showed(_ node: ScreenshotNode<Element>) -> Bool { node.shown.map { holdsPoint(widened($0), meant) } ?? false }
  let windowArea = nodes.first { $0.depth == 0 }.map { $0.frame.width * $0.frame.height }
  func carried(_ node: ScreenshotNode<Element>) -> RecordedHitFrame? {
    if showed(node) { return .hit }
    guard let index = node.ancestor else { return nil }
    let ancestor = nodes[index]
    guard !recordedHitAreaRoles.contains(ancestor.role), let windowArea,
          ancestor.frame.width * ancestor.frame.height <= recordedHitAncestorShare * windowArea,
          showed(ancestor), inPlace(reads.frame(ancestor.element), ancestor) else { return nil }
    return .ancestor
  }
  guard let live = reads.frame(element) else { return nil }
  let handles = nodes.filter { reads.same(element, $0.element) }
  if !handles.isEmpty { return handles.lazy.filter { inPlace(live, $0) }.compactMap(carried).first }
  guard let role = reads.role(element) else { return nil }
  let (title, description) = (reads.title(element), reads.description(element))
  let value = role == "AXStaticText" ? reads.value(element) : nil
  for node in nodes where node.role == role && inPlace(live, node)
    && stalePointLabelsAgree(recordedTitle: node.title, recordedDescription: node.description, recordedValue: node.value, title: title,
                             description: description, value: value)
    && reads.frame(node.element) == nil && !recreatedRefused(element, of: node, nodes: nodes, frameless: frameless, recorded: recorded, reads) {
    if let by = carried(node) { return by }
  }
  return nil
}

private func mainNonEmpty(_ text: String?) -> String? { text.flatMap { $0.isEmpty ? nil : $0 } }

private func mainRelabelledLabel<Element>(_ node: ScreenshotNode<Element>, _ reads: StalePointReads<Element>) -> String? {
  guard !relabelUncomparedRoles.contains(node.role), !relabelUncomparedSubroles.contains(node.subrole ?? "") else { return nil }
  let parts: [StalePointLabelPart] = node.role == "AXStaticText" ? [.title, .description, .value] : [.title, .description]
  let element = node.element
  var live: [StalePointLabelPart: StalePointLabelRead] = [:]
  func readNow(_ part: StalePointLabelPart) -> StalePointLabelRead {
    if let read = live[part] { return read }
    let read = reads.readLabel(element, part)
    live[part] = read
    return read
  }
  var was: String?
  var wasPart = StalePointLabelPart.title
  for part in parts {
    let recorded = node.label(part)
    if recorded == .null {
      guard readNow(part) == .null else { return nil }
      continue
    }
    guard case .text(let text) = recorded else { return nil }
    if let text = mainNonEmpty(text) {
      (was, wasPart) = (text, part)
      break
    }
  }
  guard let was else { return nil }
  var now: String?
  var nowPart: StalePointLabelPart?
  for part in parts {
    let read = readNow(part)
    if read == .null {
      guard node.label(part) == .null else { return nil }
      continue
    }
    guard case .text(let text) = read else { return nil }
    if let text = mainNonEmpty(text.map(bounded)) {
      (now, nowPart) = (text, part)
      break
    }
  }
  guard let now, let nowPart else { return nil }
  if wasPart != nowPart, readNow(wasPart) == .null || node.label(nowPart) == .null { return nil }
  guard stalePointLabelWords(was) != stalePointLabelWords(now) else { return nil }
  if let region = node.editableAncestor, editedInPlace(element, region: region, reads) { return nil }
  return now
}

private func mainOverlayLabelsAgree<Element>(_ node: ScreenshotNode<Element>, reads: StalePointReads<Element>) -> Bool {
  func text(_ value: String?) -> String? { value.flatMap { $0.isEmpty ? nil : $0 } }
  var compared = false
  for part in node.role == "AXStaticText" ? [StalePointLabelPart.title, .description, .value] : [.title, .description] {
    let then = node.strictLabel(part)
    if case .unreadable = then { return false }
    let pair = stalePointLabelPair(then, reads.readStrictLabel(node.element, part))
    if pair == .next { continue }
    guard case let .texts(recorded, now) = pair, text(recorded) == text(now.map(bounded)) else { return false }
    compared = true
  }
  return compared
}

/// Main's #442 sentence names the control on top so (`stalePointOutcome`'s `otherControlOnTop` branch; its `shown` reads
/// only `same`, which is no AX request).
private func mainOnTopName<Element>(_ top: Element, role: String?, _ reads: StalePointReads<Element>) -> String {
  stalePointName(role: role, title: reads.title(top), description: reads.description(top),
                 value: role == "AXStaticText" ? reads.value(top) : nil)
}

// MARK: The comparisons

final class ValueReadParityTests: XCTestCase {
  /// One fixture: the app's tree (rebuilt for each run, so each starts from the same state), the static texts whose value
  /// is read, and the consumer run over it with the given reads.
  private struct Fixture {
    let name: String
    let build: () -> (texts: [Elem], run: (StalePointReads<Elem>) -> Void)
  }

  /// The same fixture as main's copy (`main`) and as the head runs it (`head`), each from a fresh tree.
  private func compare(_ name: String, main: @escaping () -> (texts: [Elem], run: (StalePointReads<Elem>) -> Void),
                       head: @escaping () -> (texts: [Elem], run: (StalePointReads<Elem>) -> Void)) {
    func trace(_ build: () -> (texts: [Elem], run: (StalePointReads<Elem>) -> Void), _ side: Side, closed: Bool) -> [String] {
      let log = Log()
      let (texts, run) = build()
      for text in texts { text.closedNow = closed }
      run(reads(log, side))
      return log.calls
    }
    let mainOpen = trace(main, .main(failValue: false), closed: false)
    let headOpen = trace(head, .head, closed: false)
    XCTAssertTrue(mainOpen.contains { $0.hasPrefix("VALUE:") }, "\(name): the fixture reads a value")
    XCTAssertEqual(headOpen, mainOpen, "\(name), read open")
    XCTAssertFalse(headOpen.contains { $0.hasPrefix("RAW") }, "\(name): no raw value read")
    let mainSame = trace(main, .main(failValue: false), closed: true)
    let headClosed = trace(head, .head, closed: true)
    let upTo = (mainSame.firstIndex { $0.hasPrefix("VALUE:") } ?? mainSame.count - 1) + 1
    XCTAssertEqual(Array(headClosed.prefix(upTo)), Array(mainSame.prefix(upTo)), "\(name), closed: up to the value, the same app")
    XCTAssertEqual(headClosed, trace(main, .main(failValue: true), closed: true), "\(name), closed: main's path for a failed read")
  }

  private let point = CGPoint(x: 60, y: 110)

  /// #305 (`recordedHitAtPoint`): the review's two texts under one button, the first alive with a description, the second
  /// gone and recorded "Open"; the element is a replacement reading `now`.
  func testTheRecordedHitReadsTheValueWhereMainDid() {
    for now in ["Delete", "Open"] {
      func scene() -> (texts: [Elem], element: Elem, record: (nodes: [ScreenshotNode<Elem>], frameless: [ScreenshotNode<Elem>], members: (Elem) -> Bool?)) {
        let window = Elem("window", "AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
        let button = Elem("button", "AXButton", CGRect(x: 10, y: 90, width: 300, height: 60), title: "Go")
        let frame = CGRect(x: 20, y: 100, width: 120, height: 20)
        let first = Elem("first", "AXStaticText", frame, description: "Icon")
        let second = Elem("second", "AXStaticText", frame, value: "Open")
        window.add(button)
        button.add(first)
        button.add(second)
        let record = walk(window)
        second.destroy()
        let replacement = Elem("replacement", "AXStaticText", frame, value: now)
        button.add(replacement)
        return ([replacement], replacement, record)
      }
      compare("recorded hit, \(now)", main: {
        let (texts, element, record) = scene()
        return (texts, { _ = mainRecordedHitAtPoint(element, at: self.point, windowShift: .zero, nodes: record.nodes,
                                                    frameless: record.frameless, recorded: record.members, $0) })
      }, head: {
        let (texts, element, record) = scene()
        return (texts, { _ = recordedHitAtPoint(element, at: self.point, windowShift: .zero, nodes: record.nodes, frameless: record.frameless,
                                                recorded: record.members, $0) })
      })
    }
  }

  /// #296 (`recreatedHandle`): a text "Open" gone, re-created twice near its frame, the nearer reading `nearer` and the
  /// farther "Open", looked for from the page.
  func testTheReCreatedMatchReadsTheValueWhereMainDid() {
    for nearer in ["Delete", "Open"] {
      func scene() -> (texts: [Elem], node: ScreenshotNode<Elem>, page: Elem, record: (nodes: [ScreenshotNode<Elem>], frameless: [ScreenshotNode<Elem>], members: (Elem) -> Bool?)) {
        let window = Elem("window", "AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
        let page = Elem("page", "AXGroup", CGRect(x: 0, y: 50, width: 600, height: 300))
        let text = Elem("text", "AXStaticText", CGRect(x: 20, y: 100, width: 120, height: 20), value: "Open")
        window.add(page)
        page.add(text)
        let record = walk(window)
        let node = record.nodes.first { $0.element === text }!
        text.destroy()
        let near = Elem("nearer", "AXStaticText", CGRect(x: 20, y: 100, width: 120, height: 20), value: nearer)
        let far = Elem("farther", "AXStaticText", CGRect(x: 21, y: 100, width: 120, height: 20), value: "Open")
        page.add(near)
        page.add(far)
        return ([near, far], node, page, record)
      }
      compare("re-created, nearer \(nearer)", main: {
        let (texts, node, page, record) = scene()
        return (texts, { _ = mainRecreatedHandle(of: node, near: page, nodes: record.nodes, frameless: record.frameless,
                                                 recorded: record.members, $0) })
      }, head: {
        let (texts, node, page, record) = scene()
        return (texts, { _ = recreatedHandle(of: node, near: page, nodes: record.nodes, frameless: record.frameless,
                                             recorded: record.members, $0) })
      })
    }
  }

  /// #298 (`relabelledLabel`, #433's candidate test too): a text recorded with each label, and its labels now, over every
  /// place the rule reads the value (the first walk over a value null then, the second walk, the counterpart of a label
  /// that was the value).
  func testTheRelabelRuleReadsTheValueWhereMainDid() {
    struct Labels { var title: String?; var description: String?; var value: String?; var null: Set<StalePointLabelPart> = [] }
    let cases: [(String, Labels, Labels)] = [
      ("value to value", Labels(value: "Open"), Labels(value: "Delete")),
      ("value unchanged", Labels(value: "Open"), Labels(value: "Open")),
      ("title gone, value now", Labels(title: "Open", value: "x"), Labels(value: "Delete")),
      ("value then, title now", Labels(value: "Open"), Labels(title: "Close", value: "Open")),
      ("value then, title now, same words", Labels(value: "Open"), Labels(title: "Open", value: "Open")),
      ("value null then", Labels(null: [.value]), Labels(value: "Delete")),
      ("description then, value now", Labels(description: "Open", value: "Open"), Labels(value: "Delete")),
    ]
    for (name, then, now) in cases {
      func scene() -> (texts: [Elem], node: ScreenshotNode<Elem>) {
        let text = Elem("text", "AXStaticText", CGRect(x: 20, y: 100, width: 120, height: 20), title: now.title, description: now.description,
                        value: now.value)
        var node = ScreenshotNode(element: text, role: "AXStaticText", title: then.title, description: then.description, subrole: nil,
                                  value: then.value, editableAncestor: nil, labelsUnread: then.null, frame: text.frame!, shown: text.frame,
                                  depth: 1, subtreeRecorded: true)
        node.labelsNull = then.null
        return ([text], node)
      }
      compare("relabel, \(name)", main: {
        let (texts, node) = scene()
        return (texts, { _ = mainRelabelledLabel(node, $0) })
      }, head: {
        let (texts, node) = scene()
        return (texts, { _ = relabelledLabel(node, $0) })
      })
    }
  }

  /// #453 (`overlayLabelsAgree`): a row recorded with a title and the value "Open", read now.
  func testTheRowCheckReadsTheValueWhereMainDid() {
    for value in ["Open", "Delete"] {
      func scene() -> (texts: [Elem], node: ScreenshotNode<Elem>) {
        let row = Elem("row", "AXStaticText", CGRect(x: 20, y: 100, width: 120, height: 20), title: "Apricot", value: value)
        let node = ScreenshotNode(element: row, role: "AXStaticText", title: "Apricot", description: nil, subrole: nil, value: "Open",
                                  editableAncestor: nil, labelsUnread: [], frame: row.frame!, shown: row.frame, depth: 1, subtreeRecorded: true)
        return ([row], node)
      }
      compare("row, \(value)", main: {
        let (texts, node) = scene()
        return (texts, { _ = mainOverlayLabelsAgree(node, reads: $0) })
      }, head: {
        let (texts, node) = scene()
        return (texts, { _ = overlayLabelsAgree(node, reads: $0) })
      })
    }
  }

  /// #442's sentence: the control on top, a text that acts, named by its labels read now.
  func testTheControlOnTopSentenceReadsTheValueWhereMainDid() {
    func scene() -> (texts: [Elem], verdict: StalePointVerdict<Elem>) {
      let window = Elem("window", "AXWindow", CGRect(x: 0, y: 0, width: 600, height: 400))
      let link = Elem("link", "AXLink", CGRect(x: 20, y: 100, width: 200, height: 30), title: "Archive")
      let top = Elem("top", "AXStaticText", CGRect(x: 300, y: 300, width: 120, height: 20), value: "Open")
      top.actions = ["AXPress"]
      window.add(link)
      window.add(top)
      let nodes = walk(window).nodes
      var verdict = StalePointVerdict(reason: .otherControlOnTop, node: nodes.first { $0.element === link }!, identity: .handle, current: link,
                                      hit: top, point: point, nodes: nodes)
      (verdict.onTop, verdict.onTopRole) = (top, "AXStaticText")
      return ([top], verdict)
    }
    compare("the control on top", main: {
      let (texts, verdict) = scene()
      return (texts, { _ = mainOnTopName(verdict.onTop!, role: verdict.onTopRole, $0) })
    }, head: {
      let (texts, verdict) = scene()
      return (texts, { _ = stalePointOutcome(verdict, ms: 0, reads: $0) })
    })
  }
}
