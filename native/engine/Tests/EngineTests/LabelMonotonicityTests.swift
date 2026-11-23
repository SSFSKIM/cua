import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #519 (design ruling 1150): #519 may only turn main's verdict into a refusal. It never changes which element is the
// target, and it never turns a refusal into a press. Each label consumer is run here on every combination of label slots,
// recorded and read now, beside a frozen copy of main's (0d19fdfa) own function over main's own encoding of the same
// slots, and the two verdicts compared: the new one is main's, or a refusal. The oracle is main's code verbatim, renamed
// (`main…`), with its file-private helpers inlined; main's record held a non-text slot as an absent one, and main's read
// now took a non-text value for none and a value whatever its classification. The target choices (#433's candidates,
// #442's named candidate, #296's re-created match) are proven on fixtures (`MonotoneLabelVerdictTests`,
// `OtherControlOnTopTests`, `MenuItemPointTests`), against main's verdicts recorded at 0d19fdfa.

/// One label slot as the app answers it.
private enum Slot: CaseIterable {
  case absent, empty, open, delete, failed, null, nonText
  /// Recorded only: a value the observation withheld (#405, #501).
  case withheld
  /// Read now only: a value whose element now classifies closed (#405).
  case secure

  static let both: [Slot] = [.absent, .empty, .open, .delete, .failed, .null, .nonText]
  /// A smaller set for the static text's title and description, whose value multiplies the cases.
  static let few: [Slot] = [.absent, .open, .failed, .null, .nonText]
  static let recordedValue = both + [.withheld]
  static let liveValue = both + [.secure]

  var text: String? {
    switch self {
    case .empty: return ""
    case .open: return "Open"
    case .delete, .secure: return "Delete"
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
/// as #501 records one.
private func headNode(_ element: Elem, _ slots: Slots) -> ScreenshotNode<Elem> {
  func set(_ slot: Slot) -> Set<StalePointLabelPart> { Set(slots.filter { $0.value == slot }.map(\.key)) }
  let labels = decodedLabels(role: element.role, title: slots[.title]?.text, description: slots[.description]?.text,
                             value: slots[.value]?.text, null: set(.null), failed: set(.failed), nonText: set(.nonText))
  let withheld = element.role == "AXStaticText" && slots[.value] == .withheld ? Set([StalePointLabelPart.value]) : []
  var node = ScreenshotNode(element: element, role: element.role, title: labels.title, description: labels.description, subrole: nil,
                            value: withheld.isEmpty ? screenshotLabelValue(role: element.role, labels.value) : nil, editableAncestor: nil,
                            labelsUnread: labels.unread.union(withheld), frame: element.frame, shown: element.frame, depth: 1,
                            subtreeRecorded: true)
  (node.labelsNull, node.labelsNonText) = (labels.null, labels.nonText)
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

/// The reads now as the head makes them: a non-text value `.nonText`, a closed value unread (`stalePointClassifiedValueRead`).
private var headReads: StalePointReads<Elem> { StalePointReads<Elem>(
  role: { $0.role }, frame: { $0.frame }, parent: { _ in nil }, children: { _ in nil },
  title: { $0.live[.title]?.text }, description: { $0.live[.description]?.text }, value: { $0.live[.value]?.text },
  label: { element, part in
    switch element.live[part] ?? .absent {
    case .failed: return stalePointLabelRead(nil, .cannotComplete)
    case .null: return stalePointLabelRead(kCFNull, .success)
    case .nonText: return stalePointLabelRead(nonTextLabelSlot, .success)
    case .secure: return stalePointClassifiedValueRead(.closed)
    case .absent: return stalePointLabelRead(nil, .noValue)
    case let slot: return stalePointLabelRead(slot.text! as CFString, .success)
    }
  }, same: { $0 === $1 }, gone: { _ in false }) }

/// The reads now as main made them: a non-text value none, a value read whatever its element's classification.
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

  /// #298 `relabelledLabel` (#433's candidate too): where main refused, the head refuses; a refusal not `added`, the
  /// only kind that lets #433 move to the next candidate as main did, is one main made.
  func testRelabelledOnlyAddsRefusals() {
    var added = 0
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) {
        let element = Elem(role, live)
        let main = mainRelabelledLabel(mainNode(element, recorded), mainReads)
        let head = relabelledLabel(headNode(element, recorded), headReads)
        if main != nil { XCTAssertNotNil(head, "\(role) \(recorded) → \(live): main refused, the head keeps") }
        // Only a refusal main made may hand #433's point to the next candidate, as main did.
        if head?.added == false { XCTAssertNotNil(main, "\(role) \(recorded) → \(live): a refusal main did not make is not added") }
        if main == nil, head != nil { added += 1 }
      }
    }
    XCTAssertGreaterThan(added, 0)
  }

  /// #443 `controlDiffers` (another control refuses): where main found another control, so does the head.
  func testControlDiffersOnlyAddsRefusals() {
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) {
        let element = Elem(role, live)
        if mainControlDiffers(element, from: mainNode(element, recorded), windowShift: .zero, mainReads) {
          XCTAssertTrue(controlDiffers(element, from: headNode(element, recorded), windowShift: .zero, headReads),
                        "\(role) \(recorded) → \(live)")
        }
      }
    }
  }

  /// #453 `overlayLabelsAgree` (agreeing presses): the head agrees only where main agreed.
  func testOverlayLabelsAgreeOnlyWhereMainAgreed() {
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) {
        let element = Elem(role, live)
        if overlayLabelsAgree(headNode(element, recorded), reads: headReads) {
          XCTAssertTrue(mainOverlayLabelsAgree(mainNode(element, recorded), reads: mainReads), "\(role) \(recorded) → \(live)")
        }
      }
    }
  }

  /// #453 `overlayDuplicate` (a repeat is excused, so the row may be pressed) and #431 `recreatedLabelsAgree` (a twin
  /// refuses): the head finds a repeat only where main did, and a twin wherever main did.
  func testDuplicatesAndTwinsOnlyMoveTowardRefusal() {
    for role in ["AXButton", "AXStaticText"] {
      for (a, b) in recordPairs(role) {
        let (x, y) = (Elem(role, [:]), Elem(role, [:]))
        let (headA, headB, mainA, mainB) = (headNode(x, a), headNode(y, b), mainNode(x, a), mainNode(y, b))
        if overlayDuplicate(headA, of: headB) { XCTAssertTrue(mainOverlayDuplicate(mainA, of: mainB), "\(role) \(a) as \(b)") }
        if mainRecreatedLabelsAgree(mainA, mainB) { XCTAssertTrue(recreatedLabelsAgree(headA, headB), "\(role) \(a) twin \(b)") }
      }
    }
  }

  /// #296's re-created match (`recreatedHandle`'s label rule): the head takes a candidate only where main's lenient
  /// match took it, and a record read whole exactly as main. Named exception (finding d): main took a candidate whose
  /// label nothing known on both sides verified; the head refuses it.
  func testTheRecreatedMatchOnlyAddsRefusals() {
    var exceptions = 0
    for role in ["AXButton", "AXStaticText"] {
      for (recorded, live) in combinations(role) where !live.values.contains(.secure) {
        let element = Elem(role, live)
        let (head, main) = (headNode(element, recorded), mainNode(element, recorded))
        func agrees(_ node: ScreenshotNode<Elem>, _ reads: StalePointReads<Elem>) -> Bool {
          stalePointLabelsAgree(recordedTitle: node.title, recordedDescription: node.description, recordedValue: node.value,
                                title: reads.title(element), description: reads.description(element),
                                value: node.value == nil ? nil : reads.value(element))
        }
        let mainTakes = agrees(main, mainReads)
        let headTakes = agrees(head, headReads) && recreatedLabelVerified(head, element, headReads)
        if headTakes { XCTAssertTrue(mainTakes, "\(role) \(recorded) → \(live)") }
        if head.labelsUnread.isEmpty { XCTAssertEqual(headTakes, mainTakes, "\(role) \(recorded) → \(live): read whole") }
        if mainTakes, !headTakes { exceptions += 1 }
      }
    }
    XCTAssertGreaterThan(exceptions, 0, "finding (d)'s exception is exercised")
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
}
