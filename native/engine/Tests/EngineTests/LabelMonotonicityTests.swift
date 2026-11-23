import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// Rulings 1150 and 1151: a change to how labels are read may only turn main's verdict into a refusal, never changing which
// element is the target. Each consumer is run here on every combination of label slots, recorded and read now, beside a
// frozen copy of main's own function over main's own encoding of the same slots. The copies are main's code verbatim but
// for names and inlined file-private helpers: at 0d19fdfa (#519's base, which main 82ac93f3 equals for every consumer
// that chooses a target), and #453's row check at 82ac93f3 (#519's strict read).
//
// #520 adds the value read now: through #405's classification, in one batch with the role and the subrole, and only where
// the record holds evidence for it. Main read it raw with a single read and never classified it. So the static text's
// value now is not a logical slot handed to both sides alike: it is a world (`ValueWorld`) of three independent inputs,
// its element's classification (which main never read), the kind of its slot, and how a batch answers an unsupported
// attribute (AXUIElement.h allows an error placeholder or kCFNull there, where a single read answers
// kAXErrorAttributeUnsupported). Main's side reads the single read's answer; the head's side reads the batch through the
// real decoder (`AttributeRead.decode`, `classifiedRead`, `stalePointClassifiedValueRead`).
//
// A consumer that chooses a target either answers as main did, or, where an unread value decided it, marks the whole
// verdict refused (`StalePointUnreadValue`), never another candidate; a consumer that refuses the target already chosen
// agrees only where main agreed. No label the head returns comes from a value it did not read open.

/// One label slot as the app answers it.
private enum Slot: CaseIterable {
  case absent, empty, open, delete, failed, null, nonText
  /// Recorded only: a value the observation withheld (#405, #501).
  case withheld

  static let both: [Slot] = [.absent, .empty, .open, .delete, .failed, .null, .nonText]
  /// A smaller set for the static text's title and description, whose value multiplies the cases.
  static let few: [Slot] = [.absent, .open, .failed, .null, .nonText]
  static let recordedValue = both + [.withheld]

  var text: String? {
    switch self {
    case .empty: return ""
    case .open: return "Open"
    case .delete: return "Delete"
    default: return nil
    }
  }
}

/// #520: an AXStaticText's value now: its element's classification, its slot's kind, and the form a batch gives an
/// unsupported attribute.
private struct ValueWorld: CustomStringConvertible {
  enum Classification: CaseIterable { case open, secure, roleFailed, subroleFailed, subroleNull, requestFailed }
  enum Kind: CaseIterable { case absent, unsupported, empty, open, delete, failed, null, nonText }
  /// How a batch answers an unsupported attribute: an error placeholder, or kCFNull (AXUIElement.h:228).
  enum Form { case placeholder, null }
  let classification: Classification
  let kind: Kind
  let form: Form

  static let all: [ValueWorld] = Classification.allCases.flatMap { classification in
    Kind.allCases.flatMap { kind in
      (kind == .unsupported ? [Form.placeholder, .null] : [.placeholder]).map { ValueWorld(classification: classification, kind: kind, form: $0) }
    }
  }
  /// A button's: it has no value label.
  static let none = ValueWorld(classification: .open, kind: .absent, form: .placeholder)

  var text: String? { kind == .empty ? "" : kind == .open ? "Open" : kind == .delete ? "Delete" : nil }

  /// Main's single read of AXValue (`copyAttribute`): its value and error, whatever the classification.
  var single: (value: CFTypeRef?, error: AXError) {
    switch kind {
    case .absent: return (nil, .noValue)
    case .unsupported: return (nil, .attributeUnsupported)
    case .failed: return (nil, .cannotComplete)
    case .null: return (kCFNull, .success)
    case .nonText: return (nonTextLabelSlot, .success)
    case .empty, .open, .delete: return (text! as CFString, .success)
    }
  }

  /// The head's read: one batch of the role, the subrole and AXValue, each slot as the app answers it.
  var batch: StalePointValueRead {
    let value: Any
    switch kind {
    case .absent: value = axErrorSlot(.noValue)
    case .unsupported: value = form == .null ? kCFNull as Any : axErrorSlot(.attributeUnsupported)
    case .failed: value = axErrorSlot(.cannotComplete)
    case .null: value = kCFNull as Any
    case .nonText: value = nonTextLabelSlot
    case .empty, .open, .delete: value = text! as CFString
    }
    let subrole: Any
    switch classification {
    case .secure: subrole = "AXSecureTextField" as CFString
    case .subroleFailed: subrole = axErrorSlot(.cannotComplete)
    case .subroleNull: subrole = kCFNull as Any
    default: subrole = axErrorSlot(.noValue)
    }
    return batchValueRead(role: classification == .roleFailed ? axErrorSlot(.cannotComplete) : "AXStaticText" as CFString,
                          subrole: subrole, value: classification == .requestFailed ? nil : value)
  }

  /// Whether the batch reads the value open: the element classifies open and the slot is neither failed nor kCFNull.
  var readOpen: Bool { classification == .open && kind != .failed && kind != .null && !(kind == .unsupported && form == .null) }

  var description: String { "value \(kind)\(kind == .unsupported ? " (\(form))" : "") classified \(classification)" }
}

/// An element whose title and description read now as `live` says, and its value as `world` does.
private final class Elem {
  let role: String
  var live: [StalePointLabelPart: Slot]
  var world: ValueWorld
  /// How many times the head read the value now (#520: never without evidence).
  var valueReads = 0
  let frame = CGRect(x: 20, y: 100, width: 120, height: 40)
  init(_ role: String, _ live: [StalePointLabelPart: Slot], _ world: ValueWorld = .none) { (self.role, self.live, self.world) = (role, live, world) }
}

/// A label's slots by part, recorded or now.
private typealias Slots = [StalePointLabelPart: Slot]

private func parts(_ role: String) -> [StalePointLabelPart] { role == "AXStaticText" ? [.title, .description, .value] : [.title, .description] }

/// The record as the head decodes it (`decodedLabels`: the slots through `AttributeRead.decode`), a withheld value added
/// as #501 records one; a non-text slot in `labelsNonText` alone. Main 82ac93f3 records the same (#520 reads only).
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

/// A title's or a description's single read now (`copyAttribute`), as a slot answers it.
private func singleRead(_ slot: Slot) -> (value: CFTypeRef?, error: AXError) {
  switch slot {
  case .failed, .withheld: return (nil, .cannotComplete)
  case .null: return (kCFNull, .success)
  case .nonText: return (nonTextLabelSlot, .success)
  case .absent: return (nil, .noValue)
  case .empty, .open, .delete: return (slot.text! as CFString, .success)
  }
}

/// The reads now as the head's live seam makes them: the title and the description by main's single reads (`label`, and
/// #519's strict read), AXValue only by the classified batch (`classifiedValue`).
private var headReads: StalePointReads<Elem> { StalePointReads<Elem>(
  role: { $0.role }, frame: { $0.frame }, parent: { _ in nil }, children: { _ in nil },
  title: { $0.live[.title]?.text }, description: { $0.live[.description]?.text },
  label: { element, part in
    guard part != .value else { return .unreadable }
    let read = singleRead(element.live[part] ?? .absent)
    return stalePointLabelRead(read.value, read.error)
  }, same: { $0 === $1 }, gone: { _ in false },
  strictLabel: { element, part in
    guard part != .value else { return .unreadable }
    let read = singleRead(element.live[part] ?? .absent)
    return stalePointStrictLabelRead(read.value, read.error)
  },
  classifiedValue: { element in
    element.valueReads += 1
    return element.world.batch
  }) }

/// The reads now as main (82ac93f3, and 0d19fdfa but for the strict read) made them: every part by a single raw read,
/// AXValue included, whatever the element's classification; `value` as `liveLabel` read it (none unless a text).
private var mainReads: StalePointReads<Elem> {
  func single(_ element: Elem, _ part: StalePointLabelPart) -> (value: CFTypeRef?, error: AXError) {
    part == .value ? element.world.single : singleRead(element.live[part] ?? .absent)
  }
  return StalePointReads<Elem>(
    role: { $0.role }, frame: { $0.frame }, parent: { _ in nil }, children: { _ in nil },
    title: { $0.live[.title]?.text }, description: { $0.live[.description]?.text },
    value: { element in element.world.single.value.flatMap { $0 as? String } },
    label: { element, part in
      let read = single(element, part)
      return stalePointLabelRead(read.value, read.error)
    }, same: { $0 === $1 }, gone: { _ in false },
    strictLabel: { element, part in
      let read = single(element, part)
      return stalePointStrictLabelRead(read.value, read.error)
    })
}

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

private func mainLabelsAgree(recordedTitle: String?, recordedDescription: String?, recordedValue: String? = nil, title: String?,
                             description: String?, value: String? = nil) -> Bool {
  let title = title.map(bounded), description = description.map(bounded)
  let (oldTitle, newTitle) = (mainNonEmpty(recordedTitle), mainNonEmpty(title))
  if let oldTitle, let newTitle { return oldTitle == newTitle }
  guard oldTitle == nil, newTitle == nil else { return true }
  let (oldDescription, newDescription) = (mainNonEmpty(recordedDescription), mainNonEmpty(description))
  if let oldDescription, let newDescription { return oldDescription == newDescription }
  if oldDescription == nil, newDescription == nil, let old = mainNonEmpty(recordedValue), let new = mainNonEmpty(value.map(bounded)) {
    return stalePointLabelWords(old) == stalePointLabelWords(new)
  }
  return true
}

// MARK: #453's row check at 82ac93f3 (#519's strict read), verbatim but for its name and inlined helpers

private func mainStrictOverlayLabelsAgree<Element>(_ node: ScreenshotNode<Element>, reads: StalePointReads<Element>) -> Bool {
  func text(_ value: String?) -> String? { value.flatMap { $0.isEmpty ? nil : $0 } }
  var compared = false
  for part in parts(node.role) {
    let then = node.strictLabel(part)
    if case .unreadable = then { return false }
    let pair = stalePointLabelPair(then, reads.readStrictLabel(node.element, part))
    if pair == .next { continue }
    guard case let .texts(recorded, now) = pair, text(recorded) == text(now.map(bounded)) else { return false }
    compared = true
  }
  return compared
}

// MARK: The comparisons

final class LabelMonotonicityTests: XCTestCase {
  /// Every recorded and live combination of a role's title and description slots, and of a static text's recorded value;
  /// its value now is a `ValueWorld`.
  private func combinations(_ role: String) -> [(recorded: Slots, live: Slots)] {
    let text: [Slot] = role == "AXStaticText" ? Slot.few : Slot.both
    var all: [(Slots, Slots)] = []
    for rt in text { for rd in text { for lt in text { for ld in text {
      guard role == "AXStaticText" else { all.append(([.title: rt, .description: rd], [.title: lt, .description: ld])); continue }
      for rv in Slot.recordedValue { all.append(([.title: rt, .description: rd, .value: rv], [.title: lt, .description: ld])) }
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

  /// Every combination with each value world now (a button's one world: it has no value label).
  private func cases(_ role: String, _ body: (Elem, ScreenshotNode<Elem>, ScreenshotNode<Elem>, String) -> Void) {
    for (recorded, live) in combinations(role) {
      let element = Elem(role, live)
      let (head, main) = (headNode(element, recorded), mainNode(element, recorded))
      for world in role == "AXStaticText" ? ValueWorld.all : [.none] {
        (element.world, element.valueReads) = (world, 0)
        body(element, head, main, "\(role) \(recorded) → \(live), \(world)")
      }
    }
  }

  /// Rule 3 (evidence-only) and rule 1 (never quoted): the value is read now only where the record holds non-empty text
  /// or null for it, and a label the head answers is a title or description read now, or a value it read open.
  private func checkReadsAndQuotes(_ element: Elem, _ head: ScreenshotNode<Elem>, label: String?, _ what: String) {
    if element.valueReads > 0, !stalePointValueEvidence(head) { XCTFail("\(what): the value read without evidence") }
    guard let label else { return }
    let quotable = [element.live[.title]?.text, element.live[.description]?.text] + (element.world.readOpen ? [element.world.text] : [])
    if !quotable.contains(label) { XCTFail("\(what): \"\(label)\" quoted from a value not read open") }
  }

  /// A whole-verdict refusal may come only from a value unread: never from one read open where the record holds evidence.
  private func checkRefusedWhole(_ element: Elem, _ head: ScreenshotNode<Elem>, _ what: String) {
    if element.world.readOpen, stalePointValueEvidence(head) { XCTFail("\(what): a value read open refused the verdict whole") }
  }

  /// The consumers that choose a target, on each combination and value world: #298 `relabelledLabel` (#433's candidate
  /// too), #296's and #305's re-created match (`stalePointLiveLabelsAgree` against main's `stalePointLabelsAgree` over its
  /// raw value, as `recreatedHandle` and `recordedHitAtPoint` called it), #443 `controlDiffers`. Each answers as main did,
  /// or, where an unread value decided it, refuses the whole verdict; a button's are main's exactly.
  func testTheTargetChoosingConsumersAreMainsOrRefuseWhole() {
    var tally: [String: Int] = [:]
    for role in ["AXButton", "AXStaticText"] {
      cases(role) { element, head, main, what in
        let reads = headReads
        let label = relabelledLabel(head, reads)
        let mainLabel = mainRelabelledLabel(main, mainReads)
        if reads.unreadValue.decided {
          if label != nil || role != "AXStaticText" { XCTFail("\(what): relabel refused whole but answered \(label ?? "nil")") }
          checkRefusedWhole(element, head, what)
          tally["relabel: whole, main \(mainLabel == nil ? "kept" : "refused")", default: 0] += 1
        } else if label != mainLabel {
          XCTFail("\(what): relabel \(label ?? "nil"), main \(mainLabel ?? "nil")")
        }
        checkReadsAndQuotes(element, head, label: label, what)

        if controlDiffers(element, from: head, windowShift: .zero, headReads)
            != mainControlDiffers(element, from: main, windowShift: .zero, mainReads) { XCTFail("\(what): controlDiffers") }

        element.valueReads = 0
        let match = headReads
        let agreed = stalePointLiveLabelsAgree(head, title: match.title(element), description: match.description(element)) {
          match.liveValue(element, recorded: head)
        }
        let mainAgreed = mainLabelsAgree(recordedTitle: main.title, recordedDescription: main.description, recordedValue: main.value,
                                         title: mainReads.title(element), description: mainReads.description(element),
                                         value: main.value == nil ? nil : mainReads.value(element))
        if let agreed {
          if agreed != mainAgreed { XCTFail("\(what): the re-created match \(agreed), main \(mainAgreed)") }
        } else {
          checkRefusedWhole(element, head, what)
          tally["match: whole, main \(mainAgreed ? "agreed" : "disagreed")", default: 0] += 1
        }
        checkReadsAndQuotes(element, head, label: nil, what)
      }
    }
    // Each kind of whole refusal is reached, over a keep of main's as over a refusal.
    for key in ["relabel: whole, main kept", "relabel: whole, main refused", "match: whole, main agreed", "match: whole, main disagreed"] {
      XCTAssertGreaterThan(tally[key] ?? 0, 0, key)
    }
  }

  /// #431 `recreatedLabelsAgree` (the twin search) reads the record only: the head's verdict is main's.
  func testTheTwinSearchIsMains() {
    for role in ["AXButton", "AXStaticText"] {
      for (a, b) in recordPairs(role) {
        let (x, y) = (Elem(role, [:]), Elem(role, [:]))
        XCTAssertEqual(recreatedLabelsAgree(headNode(x, a), headNode(y, b)), mainRecreatedLabelsAgree(mainNode(x, a), mainNode(y, b)),
                       "\(role) \(a) twin \(b)")
      }
    }
  }

  // The consumers that refuse the target already chosen only add refusals.

  /// #453 `overlayLabelsAgree` (agreeing presses): the head agrees only where main 82ac93f3 agreed, and so where
  /// 0d19fdfa did; it reads the value only where the record holds evidence and never past an unread one. Among the rows
  /// it refuses that main pressed: the value now classified closed, a batch's kCFNull, and a value recorded empty or absent.
  func testOverlayLabelsAgreeOnlyWhereMainAgreed() {
    var refused: [String: Int] = [:]
    for role in ["AXButton", "AXStaticText"] {
      cases(role) { element, head, main, what in
        let agrees = overlayLabelsAgree(head, reads: headReads)
        let mainAgrees = mainStrictOverlayLabelsAgree(head, reads: mainReads)
        if agrees, !(mainAgrees && mainOverlayLabelsAgree(main, reads: mainReads)) { XCTFail("\(what): pressed where main refused") }
        if agrees, !element.world.readOpen, role == "AXStaticText" { XCTFail("\(what): pressed on a value not read open") }
        checkReadsAndQuotes(element, head, label: nil, what)
        if mainAgrees, !agrees, role == "AXStaticText" {
          let why = element.world.classification != .open ? "closed" : element.world.readOpen ? "no evidence" : "slot unread"
          refused[why, default: 0] += 1
        }
      }
    }
    for why in ["closed", "no evidence", "slot unread"] { XCTAssertGreaterThan(refused[why] ?? 0, 0, why) }
  }

  /// Ruling 1152's trap, on its own: a row whose title agrees and whose value was null at the observation, its AXValue now
  /// unsupported and answered kCFNull by the batch, is refused. Main's single read answered none and refused it too; a
  /// batch's kCFNull taken for null would pass over the null/null pair and press.
  func testABatchNullForAnUnsupportedValueNeverPassesOverARecordedNull() {
    let world = ValueWorld(classification: .open, kind: .unsupported, form: .null)
    let element = Elem("AXStaticText", [.title: .open, .description: .absent], world)
    let head = headNode(element, [.title: .open, .description: .absent, .value: .null])
    XCTAssertEqual(world.batch, .unread)
    XCTAssertFalse(overlayLabelsAgree(head, reads: headReads))
    XCTAssertFalse(mainStrictOverlayLabelsAgree(head, reads: mainReads), "main's single read answered none: refused")
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
}
