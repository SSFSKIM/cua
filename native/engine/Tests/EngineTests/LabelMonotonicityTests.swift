import ApplicationServices
import CoreGraphics
import CryptoKit
import Foundation
import XCTest
@testable import Engine

// #519 (design rulings 1150, 1151): #519 may only turn main's verdict into a refusal, never changing which element is the
// target. Narrowed by 1151, it changes only the consumers that refuse a target already chosen (#453's
// `overlayLabelsAgree` and `overlayDuplicate`, #454's recorded title); every consumer that chooses a target reads labels
// exactly as main did. Each is run here on every combination of label slots, recorded and read now, beside a frozen copy
// of main's (0d19fdfa) own function over main's own encoding of the same slots: main recorded a non-text slot as an
// absent one and read a non-text value now as none. A kept consumer's verdict is main's or a refusal; a reverted
// consumer's is main's exactly. The oracle is main's code verbatim but for names and its file-private helpers inlined.
// It compares logical slots: each slot is handed to both sides through the same seam, so it says nothing of how a single
// read and a batched read of the same attribute may answer differently (AXUIElement.h allows a batch to answer kCFNull
// where a single read answers kAXErrorNoValue).

/// One label slot as the app answers it.
private enum Slot: CaseIterable {
  case absent, empty, open, delete, failed, null, nonText
  /// Recorded only: a value the observation withheld (#405, #501).
  case withheld

  static let both: [Slot] = [.absent, .empty, .open, .delete, .failed, .null, .nonText]
  /// A smaller set for the static text's title and description, whose value multiplies the cases.
  static let few: [Slot] = [.absent, .open, .failed, .null, .nonText]
  static let recordedValue = both + [.withheld]
  static let liveValue = both

  var text: String? {
    switch self {
    case .empty: return ""
    case .open: return "Open"
    case .delete: return "Delete"
    default: return nil
    }
  }
}

/// An element whose label slots read now as `live` says.
private final class Elem {
  let role: String
  var live: [StalePointLabelPart: Slot]
  let frame = CGRect(x: 20, y: 100, width: 120, height: 40)
  init(_ role: String, _ live: [StalePointLabelPart: Slot]) { (self.role, self.live) = (role, live) }
}

/// A label's slots by part, recorded or now.
private typealias Slots = [StalePointLabelPart: Slot]

private func parts(_ role: String) -> [StalePointLabelPart] { role == "AXStaticText" ? [.title, .description, .value] : [.title, .description] }

/// The record as the head decodes it (`decodedLabels`: the slots through `AttributeRead.decode`), a withheld value added
/// as #501 records one; a non-text slot in `labelsNonText` alone.
private func headNode(_ element: Elem, _ slots: Slots) -> ScreenshotNode<Elem> {
  func set(_ slot: Slot) -> Set<StalePointLabelPart> { Set(slots.filter { $0.value == slot }.map(\.key)) }
  let labels = decodedLabels(role: element.role, title: slots[.title]?.text, description: slots[.description]?.text,
                             value: slots[.value]?.text, null: set(.null), failed: set(.failed), nonText: set(.nonText))
  let withheld = element.role == "AXStaticText" && slots[.value] == .withheld ? Set([StalePointLabelPart.value]) : []
  var node = ScreenshotNode(element: element, role: element.role, title: labels.title, description: labels.description, subrole: nil,
                            value: withheld.isEmpty ? screenshotLabelValue(role: element.role, labels.value) : nil, editableAncestor: nil,
                            labelsUnread: labels.unread.union(withheld), frame: element.frame, shown: element.frame, depth: 1,
                            subtreeRecorded: true)
  (node.labelsNull, node.labelsNonText, node.valueOpen) = (labels.null, labels.nonText, withheld.isEmpty && labels.valueOpen)
  return node
}

/// The record as main (0d19fdfa) held it: a non-text slot as an absent one.
private func mainNode(_ element: Elem, _ slots: Slots) -> ScreenshotNode<Elem> {
  func set(_ kinds: Set<Slot>) -> Set<StalePointLabelPart> {
    Set(slots.filter { kinds.contains($0.value) && ($0.key != .value || element.role == "AXStaticText") }.map(\.key))
  }
  let value = element.role == "AXStaticText" ? slots[.value]?.text : nil
  var node = ScreenshotNode(element: element, role: element.role, title: slots[.title]?.text, description: slots[.description]?.text,
                            subrole: nil, value: value, editableAncestor: nil, labelsUnread: set([.failed, .null, .withheld]),
                            frame: element.frame, shown: element.frame, depth: 1, subtreeRecorded: true)
  node.labelsNull = set([.null])
  return node
}

/// The reads now as the head's live seam makes them: `label` as main's (`stalePointLabelRead`), and the strict read, main's
/// single raw read but a non-text value `.nonText` (`stalePointStrictLabelRead`).
private var headReads: StalePointReads<Elem> { StalePointReads<Elem>(
  role: { $0.role }, frame: { $0.frame }, parent: { _ in nil }, children: { _ in nil },
  title: { $0.live[.title]?.text }, description: { $0.live[.description]?.text }, value: { $0.live[.value]?.text },
  label: { element, part in
    switch element.live[part] ?? .absent {
    case .failed: return stalePointLabelRead(nil, .cannotComplete)
    case .null: return stalePointLabelRead(kCFNull, .success)
    case .nonText: return stalePointLabelRead(nonTextLabelSlot, .success)
    case .absent: return stalePointLabelRead(nil, .noValue)
    case let slot: return stalePointLabelRead(slot.text! as CFString, .success)
    }
  }, same: { $0 === $1 }, gone: { _ in false },
  strictLabel: { element, part in
    switch element.live[part] ?? .absent {
    case .failed: return stalePointStrictLabelRead(nil, .cannotComplete)
    case .null: return stalePointStrictLabelRead(kCFNull, .success)
    case .nonText: return stalePointStrictLabelRead(nonTextLabelSlot, .success)
    case .absent: return stalePointStrictLabelRead(nil, .noValue)
    case let slot: return stalePointStrictLabelRead(slot.text! as CFString, .success)
    }
  }) }

/// The reads now as main made them: a non-text value none.
private var mainReads: StalePointReads<Elem> { StalePointReads<Elem>(
  role: { $0.role }, frame: { $0.frame }, parent: { _ in nil }, children: { _ in nil },
  title: { $0.live[.title]?.text }, description: { $0.live[.description]?.text }, value: { $0.live[.value]?.text },
  label: { element, part in
    switch element.live[part] ?? .absent {
    case .failed: return .unreadable
    case .null: return .null
    case let slot: return .text(slot.text)
    }
  }, same: { $0 === $1 }, gone: { _ in false }) }

// MARK: main's functions at 0d19fdfa, verbatim but for names and inlined helpers

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

private func mainRecreatedLabelsAgree<Element>(_ a: ScreenshotNode<Element>, _ b: ScreenshotNode<Element>) -> Bool {
  for part in StalePointLabelPart.allCases {
    let pair = stalePointLabelPair(a.label(part), b.label(part))
    if pair == .next { continue }
    guard case let .texts(x, y) = pair else { return true }
    switch (mainNonEmpty(x), mainNonEmpty(y)) {
    case let (x?, y?): return part == .value ? stalePointLabelWords(x) == stalePointLabelWords(y) : x == y
    case (nil, nil): continue
    default: return true
    }
  }
  return true
}

private func mainControlDiffers<Element>(_ now: Element, from recorded: ScreenshotNode<Element>, windowShift: CGVector,
                                         _ reads: StalePointReads<Element>) -> Bool {
  for part in [StalePointLabelPart.title, .description] {
    let then = recorded.label(part)
    if case .unreadable = then { break }
    let pair = stalePointLabelPair(then, reads.readLabel(now, part))
    if pair == .next { continue }
    guard case let .texts(recordedText, live) = pair else { break }
    let old = mainNonEmpty(recordedText), fresh = mainNonEmpty(live.map(bounded))
    if let old, let fresh { if old != fresh { return true } else { break } }
    if old != nil || fresh != nil { break }
  }
  guard !recorded.frame.isNull, let live = reads.frame(now) else { return false }
  return frameDistance(live, recorded.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)) > stalePointFrameTolerance
}

private func mainOverlayLabelsAgree<Element>(_ node: ScreenshotNode<Element>, reads: StalePointReads<Element>) -> Bool {
  func text(_ value: String?) -> String? { value.flatMap { $0.isEmpty ? nil : $0 } }
  var compared = false
  for part in parts(node.role) {
    let then = node.label(part)
    if case .unreadable = then { return false }
    let pair = stalePointLabelPair(then, reads.readLabel(node.element, part))
    if pair == .next { continue }
    guard case let .texts(recorded, now) = pair, text(recorded) == text(now.map(bounded)) else { return false }
    compared = true
  }
  return compared
}

private func mainOverlayDuplicate<Element>(_ node: ScreenshotNode<Element>, of row: ScreenshotNode<Element>) -> Bool {
  func text(_ value: String?) -> String? { value.flatMap { $0.isEmpty ? nil : $0 } }
  guard node.role == row.role, frameDistance(node.frame, row.frame) <= stalePointFrameTolerance else { return false }
  var compared = false
  for part in parts(row.role) {
    switch stalePointLabelPair(node.label(part), row.label(part)) {
    case .next: continue
    case .unknown: return false
    case let .texts(x, y):
      guard text(x) == text(y) else { return false }
      compared = true
    }
  }
  return compared
}

/// #520's differential: 82ac93f3's `underlyingRefusal`, verbatim but for its name, main's `relabelledLabel` (above) and the
/// file-private `isInside` inlined.
private func mainUnderlyingRefusal<Element>(_ target: ScreenshotNode<Element>, at point: CGPoint, windowShift: CGVector, hit: Element?,
                                            nodes: [ScreenshotNode<Element>], frameless: [ScreenshotNode<Element>],
                                            recorded: (Element) -> Bool?, _ reads: StalePointReads<Element>)
  -> (refusal: StalePointReason?, identity: StalePointIdentity?, labelNow: String?) {
  func isInside(_ element: Element, _ container: Element) -> Bool {
    var current = element
    for _ in 0..<stalePointAncestorLevels {
      guard let next = reads.parent(current) else { return false }
      if reads.same(next, container) { return true }
      current = next
    }
    return false
  }
  if let frame = reads.frame(target.element) {
    guard holdsPoint(frame, point) else { return (.frameMoved, .handle, nil) }
    if let now = mainRelabelledLabel(target, reads) { return (.relabelled, .handle, now) }
    return (nil, .handle, nil)
  }
  if let hit, reads.same(hit, target.element) || isInside(hit, target.element) { return (nil, .handle, nil) }
  guard target.actionable != nil else { return (.nodeGone, nil, nil) }
  var index = target.ancestor
  var levels = 0
  while let at = index, levels < stalePointAncestorLevels, reads.isGone(nodes[at].element) {
    (index, levels) = (nodes[at].ancestor, levels + 1)
  }
  guard let anchor = index.map({ nodes[$0].element }),
        let found = recreatedHandle(of: target, near: anchor, windowShift: windowShift, nodes: nodes, frameless: frameless,
                                    recorded: recorded, reads) else { return (.nodeGone, nil, nil) }
  if found.refused { return (.nodeGone, nil, nil) }
  return (holdsPoint(found.frame, point) ? nil : .frameMoved, .recreated, nil)
}

/// #520: `testWholeVerdictsAreMains`'s enumeration as 82ac93f3 answers it.
private let mainWholeVerdictDigest = "3b936e38e4ee7f177763c7b327da0037d5c66a38a00d0ef7ac55c800f7af9655"
private let mainWholeVerdictRefusals = ["own relabelled": 656, "beneath relabelled": 656]

// MARK: The comparisons

final class LabelMonotonicityTests: XCTestCase {
  /// Every recorded and live combination of a role's label slots.
  private func combinations(_ role: String) -> [(recorded: Slots, live: Slots)] {
    let text: [Slot] = role == "AXStaticText" ? Slot.few : Slot.both
    var all: [(Slots, Slots)] = []
    for rt in text { for rd in text { for lt in text { for ld in text {
      guard role == "AXStaticText" else { all.append(([.title: rt, .description: rd], [.title: lt, .description: ld])); continue }
      for rv in Slot.recordedValue { for lv in Slot.liveValue {
        all.append(([.title: rt, .description: rd, .value: rv], [.title: lt, .description: ld, .value: lv]))
      } }
    } } } }
    return all
  }

  /// Every pair of recorded labels of a role (the record against itself: duplicates and twins).
  private func recordPairs(_ role: String) -> [(Slots, Slots)] {
    let text: [Slot] = role == "AXStaticText" ? Slot.few : Slot.both
    var labels: [Slots] = []
    for t in text { for d in text {
      if role == "AXStaticText" { for v in Slot.recordedValue { labels.append([.title: t, .description: d, .value: v]) } }
      else { labels.append([.title: t, .description: d]) }
    } }
    return labels.flatMap { a in labels.map { (a, $0) } }
  }

  // Reverted (ruling 1151): the consumers that choose a target read labels exactly as main did.

  /// #298 `relabelledLabel` (#433's candidate too), #443 `controlDiffers`: the head's verdict is main's.
  func testTheTargetChoosingReadsNowAreMains() {
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) {
        let element = Elem(role, live)
        let (head, main) = (headNode(element, recorded), mainNode(element, recorded))
        let what = "\(role) \(recorded) → \(live)"
        XCTAssertEqual(relabelledLabel(head, headReads)?.text, mainRelabelledLabel(main, mainReads), what)
        XCTAssertEqual(controlDiffers(element, from: head, windowShift: .zero, headReads),
                       mainControlDiffers(element, from: main, windowShift: .zero, mainReads), what)
        let lenient = { (node: ScreenshotNode<Elem>, reads: StalePointReads<Elem>) in
          stalePointLabelsAgree(recordedTitle: node.title, recordedDescription: node.description, recordedValue: node.value,
                                title: reads.title(element), description: reads.description(element),
                                value: node.value == nil ? nil : reads.value(element))
        }
        XCTAssertEqual(lenient(head, headReads), lenient(main, mainReads), "\(what): #296's and #305's match")
      }
    }
  }

  /// #431 `recreatedLabelsAgree` (the twin search): the head's verdict is main's.
  func testTheTwinSearchIsMains() {
    for role in ["AXButton", "AXStaticText"] {
      for (a, b) in recordPairs(role) {
        let (x, y) = (Elem(role, [:]), Elem(role, [:]))
        XCTAssertEqual(recreatedLabelsAgree(headNode(x, a), headNode(y, b)), mainRecreatedLabelsAgree(mainNode(x, a), mainNode(y, b)),
                       "\(role) \(a) twin \(b)")
      }
    }
  }

  // Kept (ruling 1151): the consumers that refuse the target already chosen only add refusals.

  /// #453 `overlayLabelsAgree` (agreeing presses): the head agrees only where main agreed, and refuses some row main
  /// pressed (a non-text part).
  func testOverlayLabelsAgreeOnlyWhereMainAgreed() {
    var refused = 0
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) {
        let element = Elem(role, live)
        let head = overlayLabelsAgree(headNode(element, recorded), reads: headReads)
        let main = mainOverlayLabelsAgree(mainNode(element, recorded), reads: mainReads)
        if head { XCTAssertTrue(main, "\(role) \(recorded) → \(live)") }
        if main, !head { refused += 1 }
      }
    }
    XCTAssertGreaterThan(refused, 0)
  }

  /// #453 `overlayDuplicate` (a repeat is excused, so the row may be pressed): the head finds a repeat only where main did.
  func testOverlayDuplicateOnlyWhereMainFoundOne() {
    for role in ["AXButton", "AXStaticText"] {
      for (a, b) in recordPairs(role) {
        let (x, y) = (Elem(role, [:]), Elem(role, [:]))
        if overlayDuplicate(headNode(x, a), of: headNode(y, b)) {
          XCTAssertTrue(mainOverlayDuplicate(mainNode(x, a), of: mainNode(y, b)), "\(role) \(a) as \(b)")
        }
      }
    }
  }

  /// #454's menu item: the head delivers only where main delivered. Named exception: a recorded title failed or null
  /// (as well as non-text), taken by main for none and delivered to an item with none, refuses.
  func testTheMenuItemOnlyAddsRefusals() {
    final class Item {
      let role: String
      let parent: Item?
      var title: MenuTextRead = .absent
      init(_ role: String, parent: Item? = nil) { (self.role, self.parent) = (role, parent) }
    }
    let menu = Item(kAXMenuRole, parent: Item(kAXPopUpButtonRole, parent: Item(kAXWindowRole)))
    let item = Item(kAXMenuItemRole, parent: menu)
    let reads = MenuItemReads<Item>(role: { $0.role }, parent: { $0.parent }, enabled: { _ in true }, actions: { _ in ["AXPress"] },
                                    title: { $0.title }, value: { _ in .absent }, focused: { nil }, gone: { _ in false }, same: { $0 === $1 })
    let live: [MenuTextRead] = [.absent, .text(""), .text("Open"), .text("Delete"), .failed]
    for slot in Slot.both {
      let element = Elem(kAXMenuItemRole, [:])
      let head = headNode(element, [.title: slot, .description: .absent])
      let main = mainNode(element, [.title: slot, .description: .absent])
      for now in live {
        item.title = now
        func decide(_ node: ScreenshotNode<Elem>, head: Bool) -> Bool {
          let verdict = StalePointVerdict<Elem>(reason: .sameElement, node: node, current: element)
          let found = head ? recordedMenuItem(verdict) : RecordedMenuItem(element: element, title: node.title)  // main's
          let record = found.map { RecordedMenuItem<Item>(element: item, title: $0.title, titleUnread: $0.titleUnread) }
          guard case .deliver = menuItemPoint(hit: item, recorded: RecordedMenuItems(identified: record, holding: record.map { [$0] } ?? []),
                                              reads: reads, menuWindow: { 77 }) else { return false }
          return true
        }
        if decide(head, head: true) { XCTAssertTrue(decide(main, head: false), "\(slot) → \(now)") }
      }
    }
  }

  // #520 (ruling 1163): only sentence wording changes. Every verdict, kind and target, is main's (82ac93f3).

  /// `underlyingRefusal` (#433's control beneath, and #442's named candidate) against 82ac93f3's: the same refusal, the
  /// same identity and the same label read now, on every combination of the control's slots.
  func testTheControlBeneathIsJudgedAsMainJudgedIt() {
    let point = CGPoint(x: 30, y: 110)
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) {
        let element = Elem(role, live)
        let (head, main) = (headNode(element, recorded), mainNode(element, recorded))
        let h = underlyingRefusal(head, at: point, windowShift: .zero, hit: nil, nodes: [head], frameless: [], recorded: { _ in nil }, headReads)
        let m = mainUnderlyingRefusal(main, at: point, windowShift: .zero, hit: nil, nodes: [main], frameless: [], recorded: { _ in nil },
                                      mainReads)
        let what = "\(role) \(recorded) → \(live)"
        XCTAssertEqual(h.refusal, m.refusal, what)
        XCTAssertEqual(h.identity, m.identity, what)
        XCTAssertEqual(h.labelNow?.text, m.labelNow, what)
      }
    }
  }

  /// Whole verdicts through `stalePointVerdict` in two scenes, over every combination of slots (the value withheld at the
  /// observation is #405's closed classification): #298's own node at the point, its hit itself; and #433's control
  /// beneath an inert layer, the hit on the layer. Each verdict, its sentence stripped, is written as its meta
  /// (`StalePointRecord.wire`), whether it was refused, its target (current, control beneath) and the label read now; the
  /// lines' digest is frozen from the same enumeration run on 82ac93f3 (the line's label read via main's `String`).
  func testWholeVerdictsAreMains() {
    let point = CGPoint(x: 30, y: 110)
    var lines: [String] = []
    var refusals: [String: Int] = [:]
    func line(_ scene: String, _ what: String, _ verdict: StalePointVerdict<Elem>, current: Elem?, control: Elem?) -> String {
      let wire = StalePointRecord(verdict, ms: 0).wire.map { "\($0.key)=\($0.value)" }.sorted().joined(separator: ",")
      if verdict.refused { refusals["\(scene) \(verdict.reason)", default: 0] += 1 }
      return [scene, what, wire, "refused=\(verdict.refused)", "current=\(verdict.current.map { $0 === current } ?? false)",
              "underlying=\(verdict.underlying.map { $0.element === control } ?? false)", "underlyingRefused=\(verdict.underlyingRefused)",
              "labelNow=\(verdict.labelNow?.text ?? "-")"].joined(separator: "|")
    }
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) {
        func slots(_ slots: Slots) -> String { slots.map { "\($0.key)=\($0.value)" }.sorted().joined(separator: ",") }
        let what = "\(role) \(slots(recorded)) → \(slots(live))"
        let element = Elem(role, live)
        let own = stalePointVerdict(at: point, nodes: [headNode(element, recorded)], hit: element, reads: headReads)
        lines.append(line("own", what, own, current: element, control: nil))
        let overlay = Elem("AXGroup", [:])
        var control = headNode(element, recorded)
        control.actionable = true
        var layer = headNode(overlay, [:])
        layer.actionable = false
        let beneath = stalePointVerdict(at: point, nodes: [control, layer], hit: overlay, reads: headReads)
        lines.append(line("beneath", what, beneath, current: overlay, control: element))
      }
    }
    let digest = SHA256.hash(data: Data(lines.joined(separator: "\n").utf8)).map { String(format: "%02x", $0) }.joined()
    XCTAssertEqual(lines.count, 74_802)
    XCTAssertEqual(refusals, mainWholeVerdictRefusals, "the refusals by scene and reason")
    XCTAssertEqual(digest, mainWholeVerdictDigest, "every verdict, kind and target, is 82ac93f3's")
  }
}
