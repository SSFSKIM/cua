import ApplicationServices
import CoreGraphics
import Foundation

// #453 (design ruling 1040, owner ruling 1042): a click on a row of a window the app shows over the observed one, which
// #452 refuses (`appWindowOverPoint`) because the pointer's events are stamped to the observed window and would reach
// what lies under the overlay. The measurement (kit `probe/453-measure`, README 72d86db3; runs 44966589829, 44971146877,
// 44974557415) found the observation already records the overlay's rows (their text and frames), the row under the point
// at click time the recorded one (window, text, frame and window number matched in every row measured), and two
// deliveries that take a row with nothing of the person's moved: a mouse down and up stamped with the overlay's own
// window number at a point local to it, posted to the app's process (every Chrome overlay, every mode: omnibox 18/18,
// `<datalist>` 6/6, permission bubble 9/9; a background AppKit popover 0/12), and AXPress on the row (the omnibox, the
// permission bubble and the AppKit popover; nothing on the datalist). So where #452 would refuse, the click is delivered
// into the overlay when the row the app's hit-test reaches at the point (descended from the overlay's web area, whose
// first answer it is in Chrome) is a node the observation recorded and the screenshot showed there, the only control the
// record holds at the point in that overlay, reached through nothing but inert content, still reading its recorded text
// at its recorded frame, enabled, in an overlay window the screenshot's window list held and whose rows held still around
// the screenshot (`overlayStableWindows`), of a kind this file lists (`OverlayKind`). Identity is the recorded node's,
// never the point's alone: a list re-laid out since (one more character typed re-lays the omnibox's rows 2 to 4 times
// within about 250 ms, its window number unchanged) whose row under the point now reads other text is refused. Chromium's
// overlays take the stamped post, with no activation and no hold; an AppKit popover takes AXPress on the recorded node.
// The decision runs again just before the click goes (the window's bounds and the hit read anew), and the whole decision
// is bounded in time (`overlayDecisionBudgetMs`). The click succeeds only once the overlay's window has left the screen,
// read for `overlayConfirmMs`; otherwise it answers `clickUnconfirmed`. Anything else keeps #452's refusal unchanged.
// #456's rechecks after an element route's wait apply the same rule (`StalePointGate.overlay`), and an element click on a
// row of such an overlay (#470) takes the same kind's route, the row checked against what the observation recorded for
// its ID. Everything reads through closures, so the rule is unit-tested over fakes.

/// The overlays a click is delivered into, each a switch of its own (`delivers`); any other refuses as #452 does.
enum OverlayKind: String, CaseIterable, Equatable {
  /// Chrome's address-bar suggestions: a window of its own at the browser window's layer holding the WebUI page titled
  /// `omniboxPopupTitle`, with the browser's focused location bar inside the window's bounds above that page
  /// (`omniboxLocationBar`).
  case omniboxPopup
  /// Chromium's autofill list (a page's `<datalist>` suggestions): a window above the browser window's layer holding an
  /// AXList, outside any web page.
  case datalist
  /// Chromium's permission prompt: a window at the browser window's layer holding an alert dialog, outside any web page.
  /// The engine clicks its buttons as any other (owner ruling 1042).
  case permissionBubble
  /// An AppKit popover (TextEdit's colour-well swatches): an AXPopover in the observed window's tree, over which the window
  /// list holds a window of the app's.
  case appKitPopover

  var delivers: Bool {
    switch self {
    case .omniboxPopup: return true
    case .datalist: return true
    case .permissionBubble: return true  // owner ruling 1042
    case .appKitPopover: return true
    }
  }

  /// How a row of it is delivered: Chromium's overlays by the stamped post (the datalist takes no AXPress), AppKit's
  /// popover by AXPress (a background post does not take it, and route 3's subtype dismisses it).
  var route: OverlayRoute { self == .appKitPopover ? .press : .post }
}

enum OverlayRoute: String, Equatable {
  case post
  case press = "AXPress"
}

/// The WebUI omnibox popup's document title, a literal in Chromium's `omnibox_popup.html`, not localised.
let omniboxPopupTitle = "Omnibox Popup"
/// The subrole Chromium gives an alert dialog (its permission prompt's root group).
let alertDialogSubrole = "AXApplicationAlertDialog"
/// The wait for the overlay to close after the delivery: read at once, then every `overlaySampleMs`.
let overlayConfirmMs: Double = 500
let overlaySampleMs: Double = 20
/// How deep the hit is descended to the row at the point (through children whose frame holds it), and how many
/// children's frames that may read.
let overlayDescentLevels = 24
let overlayDescentReads = 200
/// How long one decision may read (the hit's descent, its ancestry, the row's reads), each read bounded by what is left
/// (`boundedMessagingTimeout`); past it the click is refused (`timedOut`). The kit's reads: a hit chain with text about
/// 20 ms (40 at most), a full read of the popup's rows 14 to 18 ms (45 at most).
let overlayDecisionBudgetMs: Double = 250
/// The roles of content that does not act on its own when it lists no AXPress (a group), or whatever it lists (a text, an
/// image: Chromium lists AXPress on every text): what may lie between the hit and the row it belongs to.
let overlayInertRoles: Set<String> = ["AXStaticText", "AXImage", "AXGroup"]
/// The roles that hold rows rather than being one: an element click (#470) on one is never posted at its middle.
let overlayContainerRoles: Set<String> = [
  "AXGroup", "AXList", "AXScrollArea", "AXWebArea", "AXWindow", "AXSheet", "AXPopover", "AXGrid", "AXTable", "AXOutline",
  "AXSplitGroup", "AXToolbar", "AXTabGroup", "AXLayoutArea", "AXApplication",
]
/// How far a recorded overlay row's frame may lie from its re-read after the screenshot (`overlayStableWindows`), and a
/// recorded node's frame from the overlay window's bounds for it to be the overlay's root.
let overlayFrameTolerance: CGFloat = 1

/// The reads #453 makes (the unit tests' seams; `.live` over the Accessibility API): the guard's, with the subrole,
/// AXEnabled, the app's focused element and the decision's time left.
struct OverlayReads<Element> {
  var stale: StalePointReads<Element>
  var subrole: (Element) -> String?
  /// AXEnabled; nil when it does not read (a text, which has none).
  var enabled: (Element) -> Bool?
  /// The application's AXFocusedUIElement (`omniboxLocationBar`); nil when none reads.
  var focused: () -> Element? = { nil }
  /// The milliseconds left of the decision's budget; every read here stops once none is left.
  var left: () -> Double = { .infinity }
  var expired: Bool { left() <= 0 }
}

extension OverlayReads where Element == AXUIElement {
  /// The live reads for one decision, each AX message bounded by what is left of `budgetMs` from now
  /// (`boundedMessagingTimeout`), none sent once it is spent.
  static func live(appPid: pid_t, budgetMs: Double = overlayDecisionBudgetMs) -> OverlayReads<AXUIElement> {
    let cutoff = monotonicMilliseconds() + budgetMs
    let left = { cutoff - monotonicMilliseconds() }
    let bounded = BoundedAXRead(left: left)
    let base = StalePointReads<AXUIElement>.live
    let stale = StalePointReads<AXUIElement>(
      role: { e in bounded(e) { base.role(e) } }, frame: { e in bounded(e) { base.frame(e) } },
      parent: { e in bounded(e) { base.parent(e) } }, children: { e in bounded(e) { base.children(e) } },
      title: { e in bounded(e) { base.title(e) } }, description: { e in bounded(e) { base.description(e) } },
      value: { e in bounded(e) { base.value(e) } }, editableAncestor: { e in bounded(e) { base.editableAncestor(e) } },
      actions: { e in bounded(e) { base.actions(e) } },
      label: { e, part in bounded(e) { base.readLabel(e, part) } ?? .unreadable }, same: base.same,
      gone: { e in bounded(e) { base.isGone(e) } ?? false })
    let application = prepare(AXUIElementCreateApplication(appPid))
    return OverlayReads(stale: stale, subrole: { e in bounded(e) { attribute(e, kAXSubroleAttribute) as? String } },
                        enabled: { e in bounded(e) { (attribute(e, kAXEnabledAttribute) as? NSNumber)?.boolValue } },
                        focused: { bounded(application) { elementAttribute(application, kAXFocusedUIElementAttribute) } }, left: left)
  }
}

/// One AX read with its element's messaging timeout set to what is left (`boundedMessagingTimeout`) and put back after;
/// none once nothing is left.
struct BoundedAXRead {
  let left: () -> Double
  func callAsFunction<T>(_ element: AXUIElement, _ read: () -> T?) -> T? {
    guard let timeout = boundedMessagingTimeout(leftMs: left()) else { return nil }
    AXUIElementSetMessagingTimeout(element, timeout)
    defer { AXUIElementSetMessagingTimeout(element, elementMessagingTimeout) }
    return read()
  }
}

/// The hit at a point descended to the deepest element there, and its ancestors up to its window.
struct OverlayChain<Element> {
  /// The deepest element first, up to (not including) `root`.
  let elements: [Element]
  let roles: [String?]
  /// The AXWindow the chain reads to.
  let root: Element
  /// The index in `elements` of the nearest AXPopover passed, if any.
  let popover: Int?

  /// The part of the chain inside the overlay: below the popover for a popover, else below the window.
  func inside(_ by: AppWindowSignal) -> ArraySlice<Element> {
    by == .popover ? elements[..<(popover ?? 0)] : elements[...]
  }
}

/// `hit` descended to the deepest element at `point` (the last child whose frame holds it, as a later sibling draws
/// above, up to `overlayDescentLevels` and `overlayDescentReads`), then read up to its AXWindow; nil when the chain reads
/// to no window or the decision's time ran out (`OverlayReads.left`). Chrome's first hit-test at an omnibox row answers the
/// popup's web area; the row lies below it.
func overlayChain<Element>(from hit: Element, at point: CGPoint, descends: Bool = true, reads: OverlayReads<Element>) -> OverlayChain<Element>? {
  let stale = reads.stale
  var deepest = hit
  var budget = overlayDescentReads
  descent: for _ in 0..<(descends ? overlayDescentLevels : 0) {
    guard !reads.expired, let children = stale.children(deepest), !children.isEmpty else { break }
    for child in children.reversed() {
      guard budget > 0, !reads.expired else { break descent }
      budget -= 1
      if let frame = stale.frame(child), holdsPoint(frame, point) {
        deepest = child
        continue descent
      }
    }
    break
  }
  var elements: [Element] = []
  var roles: [String?] = []
  var popover: Int?
  var current = deepest
  for _ in 0..<stalePointAncestorLevels {
    guard !reads.expired else { return nil }
    let role = stale.role(current)
    if role == kAXWindowRole { return OverlayChain(elements: elements, roles: roles, root: current, popover: popover) }
    if role == kAXApplicationRole { return nil }
    if role == kAXPopoverRole, popover == nil { popover = elements.count }
    elements.append(current)
    roles.append(role)
    guard let parent = stale.parent(current) else { return nil }
    current = parent
  }
  return nil
}

/// Whether an element between the hit and its row is inert content of the row (finding 1 of the review of
/// dfe6f443..b8bb5115): a text or an image whatever it lists, or a group that lists no AXPress (its actions read).
func overlayInert<Element>(_ element: Element, role: String?, reads: OverlayReads<Element>) -> Bool {
  guard let role, overlayInertRoles.contains(role) else { return false }
  guard role == "AXGroup" else { return true }
  guard let actions = reads.stale.actions(element) else { return false }
  return !actions.contains("AXPress")
}

/// The browser's own sign that a window holding `omniboxPopupTitle`'s page is its address-bar popup (the review's
/// finding 8): the app's focused element is a text field outside any web page and outside the overlay, lying inside the
/// overlay window's bounds above the popup's page, as the WebUI popup draws around the location bar (the measurement:
/// the focused "Address and search bar" inside the popup's bounds, above its web area, 288/288 omnibox rows). An
/// extension's popup carrying the title holds no focused location bar.
func omniboxLocationBar<Element>(_ chain: OverlayChain<Element>, webArea: Element, window: ListedWindow, reads: OverlayReads<Element>) -> Bool {
  let stale = reads.stale
  guard let field = reads.focused(), stale.role(field) == "AXTextField", let frame = stale.frame(field),
        let page = stale.frame(webArea),
        window.bounds.insetBy(dx: -overlayFrameTolerance, dy: -overlayFrameTolerance).contains(frame),
        frame.maxY <= page.minY + overlayFrameTolerance else { return false }
  var current = stale.parent(field)
  for _ in 0..<stalePointAncestorLevels {
    guard let at = current, !reads.expired else { return false }
    switch stale.role(at) {
    case "AXWebArea": return false
    case kAXWindowRole: return !stale.same(at, chain.root)
    case kAXApplicationRole, nil: return false
    default: current = stale.parent(at)
    }
  }
  return false
}

/// The overlay's kind from what its chain passes (`OverlayKind`'s cases say what each is), the app's page engine, and the
/// overlay's layer against the observed window's; nil for any other overlay.
func overlayKind<Element>(_ chain: OverlayChain<Element>, by: AppWindowSignal, chromium: Bool, overlay: ListedWindow, observedLayer: Int?,
                          reads: OverlayReads<Element>) -> OverlayKind? {
  let inside = Array(chain.inside(by))
  func passes(_ test: (Element, String?) -> Bool) -> Bool {
    zip(inside, chain.roles[..<inside.count]).contains { test($0, $1) }
  }
  switch by {
  case .popover:
    return !chromium && chain.popover != nil ? .appKitPopover : nil
  case .axHit:
    guard chromium, let observedLayer else { return nil }
    if let at = inside.indices.first(where: { chain.roles[$0] == "AXWebArea" && reads.stale.title(inside[$0]) == omniboxPopupTitle }) {
      return overlay.layer == observedLayer && omniboxLocationBar(chain, webArea: inside[at], window: overlay, reads: reads) ? .omniboxPopup : nil
    }
    guard !passes({ _, role in role == "AXWebArea" }) else { return nil }
    if overlay.layer > observedLayer, passes({ _, role in role == "AXList" }) { return .datalist }
    if overlay.layer == observedLayer, passes({ element, _ in reads.subrole(element) == alertDialogSubrole }) { return .permissionBubble }
    return nil
  }
}

/// Why a click into an overlay was not delivered, #452's refusal standing (the meta's `overlayClick.refused`).
enum OverlayRefusal: String, Equatable {
  /// The overlay's window is not listed now, or the hit-test answered nothing in it.
  case unread
  /// The screenshot's window list did not hold the overlay's window: another overlay than the one it showed.
  case otherWindow
  /// The overlay's recorded rows were not seen to hold still around the screenshot (`overlayStableWindows`): the image
  /// may show other rows than the record.
  case unsettled
  /// Not one of `OverlayKind`'s overlays.
  case unknownKind
  /// One of them, switched off (`OverlayKind.delivers`).
  case kindOff
  /// No element the hit reaches at the point is a node the observation recorded there.
  case notRecorded
  /// The record holds a node deeper at the point, inside the one the hit reaches, which the hit does not reach.
  case deeperRecorded
  /// The record holds another control at the point in the overlay, beside the row (one over another).
  case overlapping
  /// Something between the hit and the row acts on its own (a button inside a suggestion).
  case notInert
  /// The recorded node carries no text, and no recorded row around it does alone.
  case unlabelled
  /// The row reads other text than the observation recorded (a list re-laid out since), or its text does not read.
  case textChanged
  /// The row's frame is not the recorded one (moved, or gone).
  case frameMoved
  case disabled
  /// An AppKit popover's row lists no AXPress.
  case noAction
  /// #470: the element clicked by its ID is a container of the overlay's rows, or carries no text, not a row or button.
  case notItself
  /// #470: the hit at the element's point does not reach it in its window.
  case notReached
  /// The decision ran out of time (`overlayDecisionBudgetMs`).
  case timedOut
  /// The decision run again just before the click (`deliverOverlayClick`'s `revalidate`) no longer names the same row in
  /// the same window.
  case changed
}

/// A row a click is delivered to: its overlay's kind and window, the row (the recorded node carrying the text; the
/// element clicked by ID for #470) and, for AXPress, the element pressed.
struct OverlayTarget<Element> {
  let kind: OverlayKind
  let window: ListedWindow
  let by: AppWindowSignal
  let row: Element
  var pressed: Element? = nil
  var route: OverlayRoute { kind.route }
}

enum OverlayDecision<Element> {
  case deliver(OverlayTarget<Element>)
  case refuse(OverlayRefusal, kind: OverlayKind?)

  var kind: OverlayKind? {
    switch self {
    case .deliver(let target): return target.kind
    case .refuse(_, let kind): return kind
    }
  }
}

/// What #453's rule reads at a coordinate click's point beyond the live tree: the point now and the observed window's shift
/// since the screenshot, the signal #452 refused by, the overlay's and the observed window's listing now, the screenshot's
/// window list, the overlay windows whose rows held still around it, its record, and whether the app is Chromium's.
struct OverlayPointContext<Element> {
  let point: CGPoint
  var shift: CGVector = .zero
  let by: AppWindowSignal
  let overlay: ListedWindow?
  let observedLayer: Int?
  let recordedWindows: Set<CGWindowID>?
  var stableWindows: Set<CGWindowID> = []
  let nodes: [ScreenshotNode<Element>]
  let chromium: Bool
}

/// #453's decision where #452 refused a coordinate click (`appWindowOverPoint`), `hit` the hit-test's own answer: refused
/// as `timedOut` whatever it found once the decision's time ran out.
func overlayPoint<Element>(hit: Element?, _ context: OverlayPointContext<Element>, reads: OverlayReads<Element>) -> OverlayDecision<Element> {
  let decision = overlayPointJudged(hit: hit, context, reads: reads)
  return reads.expired ? .refuse(.timedOut, kind: decision.kind) : decision
}

private func overlayPointJudged<Element>(hit: Element?, _ context: OverlayPointContext<Element>, reads: OverlayReads<Element>) -> OverlayDecision<Element> {
  let stale = reads.stale
  guard let window = context.overlay, let hit, let chain = overlayChain(from: hit, at: context.point, reads: reads) else {
    return .refuse(.unread, kind: nil)
  }
  guard let kind = overlayKind(chain, by: context.by, chromium: context.chromium, overlay: window, observedLayer: context.observedLayer,
                               reads: reads) else { return .refuse(.unknownKind, kind: nil) }
  guard kind.delivers else { return .refuse(.kindOff, kind: kind) }
  guard context.recordedWindows?.contains(window.number) == true else { return .refuse(.otherWindow, kind: kind) }
  guard context.stableWindows.contains(window.number) else { return .refuse(.unsettled, kind: kind) }
  let nodes = context.nodes
  let shown = CGPoint(x: context.point.x - context.shift.dx, y: context.point.y - context.shift.dy)
  func holds(_ node: ScreenshotNode<Element>) -> Bool { node.shown.map { holdsPoint($0, shown) } ?? false }
  let inside = Array(chain.inside(context.by))
  func chainIndex(_ element: Element) -> Int? { inside.firstIndex { stale.same($0, element) } }
  // The recorded node the hit reaches: the deepest element of the chain the record holds (never the web area itself).
  var found: Int?
  var foundAt = 0
  for (index, element) in inside.enumerated() where chain.roles[index] != "AXWebArea" {
    if let at = nodes.firstIndex(where: { stale.same($0.element, element) }) { (found, foundAt) = (at, index); break }
  }
  guard let found, holds(nodes[found]) else { return .refuse(.notRecorded, kind: kind) }
  func ancestry(_ index: Int) -> [Int] {
    var found: [Int] = []
    var current = nodes[index].ancestor
    while let at = current, at < nodes.count, found.count < stalePointAncestorLevels { found.append(at); current = nodes[at].ancestor }
    return found
  }
  // Nothing recorded deeper at the point inside it: the hit reached the node the screenshot showed there. With elements
  // the record lacks below it on the hit's chain, the hit reaches something new (a row rebuilt); else it stopped short.
  guard !nodes.indices.contains(where: { $0 != found && holds(nodes[$0]) && ancestry($0).contains(found) }) else {
    return .refuse(foundAt > 0 ? .notRecorded : .deeperRecorded, kind: kind)
  }
  // The row: the node itself when it carries text, else its nearest recorded ancestor that does and holds no other
  // recorded text away from the point (one row, never the list); never past an element the record lacks below a
  // textless node (a row added since, under a container the record holds).
  var row = found
  if overlayRecordedLabel(nodes[found]) == nil {
    guard foundAt == 0 else { return .refuse(.notRecorded, kind: kind) }
    guard let labelled = ancestry(found).first(where: { overlayRecordedLabel(nodes[$0]) != nil }),
          !["AXWebArea", kAXWindowRole, kAXPopoverRole].contains(nodes[labelled].role),
          !nodes.indices.contains(where: { overlayRecordedLabel(nodes[$0]) != nil && !holds(nodes[$0]) && ancestry($0).contains(labelled) }) else {
      return .refuse(.unlabelled, kind: kind)
    }
    row = labelled
  }
  guard nodes[row].labelsUnread.isEmpty, let recordedLabel = overlayRecordedLabel(nodes[row]) else { return .refuse(.unlabelled, kind: kind) }
  guard let rowAt = chainIndex(nodes[row].element), rowAt >= foundAt else { return .refuse(.notRecorded, kind: kind) }
  // Everything the hit passes below the row is inert content of it (finding 1): a new button inside a suggestion refuses.
  guard (0..<rowAt).allSatisfy({ overlayInert(inside[$0], role: chain.roles[$0], reads: reads) }) else { return .refuse(.notInert, kind: kind) }
  // The record's own winner at the point, whatever the hit (finding 3): no other recorded control of the overlay holds
  // it beside the row (neither the row's ancestor nor inside it), so a control over the row that has gone never lets
  // the one under it pass. The overlay's part of the record is the subtree of the row's highest recorded ancestor that
  // the hit's chain passes.
  let rowAncestry = ancestry(row)
  let top = rowAncestry.last(where: { chainIndex(nodes[$0].element) != nil }) ?? row
  let beside = nodes.indices.contains { index in
    guard index != row, holds(nodes[index]), nodes[index].actionable != false, !rowAncestry.contains(index) else { return false }
    let above = ancestry(index)
    return (index == top || above.contains(top)) && !above.contains(row)
  }
  guard !beside else { return .refuse(.overlapping, kind: kind) }
  for index in Set([found, row]) {
    let node = nodes[index]
    guard !stale.isGone(node.element), let live = stale.frame(node.element),
          frameDistance(live, node.frame.offsetBy(dx: context.shift.dx, dy: context.shift.dy)) <= stalePointFrameTolerance else {
      return .refuse(.frameMoved, kind: kind)
    }
  }
  guard overlayLabelNow(nodes[row].element, role: nodes[row].role, reads: stale) == recordedLabel else { return .refuse(.textChanged, kind: kind) }
  guard reads.enabled(nodes[row].element) != false, reads.enabled(nodes[found].element) != false else { return .refuse(.disabled, kind: kind) }
  var target = OverlayTarget(kind: kind, window: window, by: context.by, row: nodes[row].element)
  if kind.route == .press {
    // AXPress on the recorded node: the first from the node the hit reaches up to the row that lists it.
    guard let pressed = inside[foundAt...rowAt].first(where: { stale.actions($0)?.contains("AXPress") == true }) else {
      return .refuse(.noAction, kind: kind)
    }
    target.pressed = pressed
  }
  return .deliver(target)
}

/// A recorded node's label as #453 compares it: the title, else the description, else an AXStaticText's value.
func overlayRecordedLabel<Element>(_ node: ScreenshotNode<Element>) -> String? {
  stalePointLabel(title: node.title, description: node.description, value: node.role == "AXStaticText" ? node.value : nil)
}

/// A row's label read now as the record keeps it (`stalePointLabel`, each part cut by `bounded`): the title, else the
/// description, else an AXStaticText's value; nil when a part does not read, so it never matches.
func overlayLabelNow<Element>(_ element: Element, role: String, reads: StalePointReads<Element>) -> String? {
  let parts: [StalePointLabelPart] = role == "AXStaticText" ? [.title, .description, .value] : [.title, .description]
  for part in parts {
    guard case .text(let text) = reads.readLabel(element, part) else { return nil }
    if let text, !text.isEmpty { return bounded(text) }
  }
  return nil
}

/// The overlay windows whose recorded rows held still around the screenshot (the review's finding 2): for each window of
/// the app's over the observed one (`over`), the record's overlay root (the node framed as the window's bounds whose
/// recorded parent is not) and every node carrying text in its subtree read again (frame and label) after the capture,
/// each the same as recorded. The observation that asks for this walks the tree before it captures the image (Skyshot.swift),
/// so a row read the same before and after the image was the same in it. A window with no such root, no text in it, or
/// any read that differs or fails, is not stable. Answers the windows and how many nodes were read.
func overlayStableWindows<Element>(_ nodes: [ScreenshotNode<Element>], over: [ListedWindow], reads: StalePointReads<Element>)
  -> (stable: Set<CGWindowID>, read: Int) {
  var stable: Set<CGWindowID> = []
  var read = 0
  func near(_ frame: CGRect, _ bounds: CGRect) -> Bool { frameDistance(frame, bounds) <= overlayFrameTolerance }
  for window in over {
    let roots = Set(nodes.indices.filter { index in
      near(nodes[index].frame, window.bounds) && !(nodes[index].ancestor.map { near(nodes[$0].frame, window.bounds) } ?? false)
    })
    guard !roots.isEmpty else { continue }
    func inSubtree(_ index: Int) -> Bool {
      var current: Int? = index
      var levels = 0
      while let at = current, at < nodes.count, levels <= stalePointAncestorLevels {
        if roots.contains(at) { return true }
        (current, levels) = (nodes[at].ancestor, levels + 1)
      }
      return false
    }
    let rows = nodes.indices.filter { inSubtree($0) && overlayRecordedLabel(nodes[$0]) != nil }
    guard !rows.isEmpty else { continue }
    var same = true
    for index in rows {
      read += 1
      let node = nodes[index]
      guard let live = reads.frame(node.element), frameDistance(live, node.frame) <= overlayFrameTolerance,
            node.labelsUnread.isEmpty, overlayLabelNow(node.element, role: node.role, reads: reads) == overlayRecordedLabel(node) else {
        same = false
        break
      }
    }
    if same { stable.insert(window.number) }
  }
  return (stable, read)
}

/// The app's windows over the observed one (`target`) in the list (front to back): its own (`pid`), showing something,
/// overlapping it; none when the list does not hold it.
func appWindowsOver(_ target: CGWindowID?, pid: pid_t, list: [ListedWindow]) -> [ListedWindow] {
  guard let target, let observed = list.firstIndex(where: { $0.number == target }) else { return [] }
  let bounds = list[observed].bounds
  return list[..<observed].filter { $0.owner == pid && $0.alpha > 0 && $0.bounds.intersects(bounds) }
}

/// What #470's rule makes of an element click: not an overlay's row (the element click's own path), delivered, or
/// refused (an overlay of a listed kind whose row cannot be checked or has changed: never left to route 3).
enum OverlayElementDecision<Element> {
  case notOverlay
  case deliver(OverlayTarget<Element>)
  case refuse(OverlayRefusal, kind: OverlayKind?, window: ListedWindow?)
}

/// #470: an element click (`element`, by its ID, with the label and frame the observation recorded for it, `recorded`)
/// on a row of an overlay: the element's own ancestry read to its window, not the observed one (`observed`, listed now as
/// `observedNumber`), or through an AXPopover of it, an overlay of a listed kind covering the element's clickable point;
/// else `notOverlay`. Then, the overlay recognised, the element must be a row or button itself (a role that holds no rows,
/// carrying text: finding 5), read its recorded label and frame (finding 4: Chrome reuses a row's element for another
/// suggestion), be enabled, and be what the hit at its point reaches through nothing but inert content (findings 1 and 5),
/// listing AXPress for AXPress; else refused. Out of time anywhere: refused (`timedOut`).
func overlayElement<Element>(_ element: Element, recorded: (label: String?, frame: CGRect?), hit: () -> Element?, point: CGPoint,
                             observed: Element, observedNumber: CGWindowID?, pid: pid_t, list: () -> [ListedWindow], chromium: Bool,
                             reads: OverlayReads<Element>, number: (Element) -> CGWindowID?) -> OverlayElementDecision<Element> {
  let decision = overlayElementJudged(element, recorded: recorded, hit: hit, point: point, observed: observed, observedNumber: observedNumber,
                                      pid: pid, list: list, chromium: chromium, reads: reads, number: number)
  guard reads.expired else { return decision }
  switch decision {
  case .notOverlay: return .refuse(.timedOut, kind: nil, window: nil)
  case .deliver(let target): return .refuse(.timedOut, kind: target.kind, window: target.window)
  case .refuse(_, let kind, let window): return .refuse(.timedOut, kind: kind, window: window)
  }
}

private func overlayElementJudged<Element>(_ element: Element, recorded: (label: String?, frame: CGRect?), hit: () -> Element?,
                                           point: CGPoint, observed: Element, observedNumber: CGWindowID?, pid: pid_t,
                                           list: () -> [ListedWindow], chromium: Bool, reads: OverlayReads<Element>,
                                           number: (Element) -> CGWindowID?) -> OverlayElementDecision<Element> {
  let stale = reads.stale
  guard let own = overlayChain(from: element, at: point, descends: false, reads: reads),
        !stale.same(own.root, observed) || own.popover != nil else { return .notOverlay }
  let list = list()
  let by: AppWindowSignal
  let window: ListedWindow
  if stale.same(own.root, observed) {
    guard let observedNumber, let over = appWindowOverPoint(point, target: observedNumber, pid: pid, list: list) else { return .notOverlay }
    (by, window) = (.popover, over)
  } else {
    guard let overNumber = number(own.root), hitWindowCovers(overNumber, point: point, target: observedNumber, list: list),
          let over = list.first(where: { $0.number == overNumber }) else { return .notOverlay }
    (by, window) = (.axHit, over)
  }
  guard let kind = overlayKind(own, by: by, chromium: chromium, overlay: window,
                               observedLayer: observedNumber.flatMap { number in list.first { $0.number == number }?.layer }, reads: reads),
        kind.delivers else { return .notOverlay }
  func refuse(_ why: OverlayRefusal) -> OverlayElementDecision<Element> { .refuse(why, kind: kind, window: window) }
  guard let role = stale.role(element), !overlayContainerRoles.contains(role),
        let labelNow = overlayLabelNow(element, role: role, reads: stale) else { return refuse(.notItself) }
  guard let label = recorded.label, label == labelNow else { return refuse(.textChanged) }
  guard let frame = recorded.frame, let live = stale.frame(element), frameDistance(live, frame) <= stalePointFrameTolerance else {
    return refuse(.frameMoved)
  }
  guard reads.enabled(element) != false else { return refuse(.disabled) }
  guard let hit = hit(), let chain = overlayChain(from: hit, at: point, reads: reads), stale.same(chain.root, own.root) else {
    return refuse(.notReached)
  }
  let inside = Array(chain.inside(by))
  guard let at = inside.firstIndex(where: { stale.same($0, element) }) else { return refuse(.notReached) }
  guard (0..<at).allSatisfy({ overlayInert(inside[$0], role: chain.roles[$0], reads: reads) }) else { return refuse(.notInert) }
  var target = OverlayTarget(kind: kind, window: window, by: by, row: element)
  if kind.route == .press {
    guard stale.actions(element)?.contains("AXPress") == true else { return refuse(.noAction) }
    target.pressed = element
  }
  return .deliver(target)
}

/// The events' target for the stamped post: the point, the overlay's own window number and its frame, so the window
/// location is local to the overlay (Mouse.swift `stampWindow`), posted to `pid`.
func overlayPostTarget(_ point: CGPoint, window: ListedWindow, pid: pid_t) -> ClickTarget {
  ClickTarget(point: point, windowFrame: window.bounds, windowID: window.number, pid: pid)
}

/// What the delivery's effect read: the overlay's window left the screen, or it did not in time. The row's element
/// dying is no evidence (the review's finding 7: an overlay refreshing its rows destroys them while it stays open).
enum OverlayEffect: String, Equatable { case closed, unconfirmed }

/// The meta's `overlayClick` (#453, value-free): the overlay's window, the signal #452 found it by, its kind, and either
/// the route that carried the click and its effect (with the AXError of an AXPress that was not success, the reads and the
/// milliseconds from the delivery to the last read) or why #452's refusal stood. `from` is `element` for #470's element
/// click.
struct OverlayClickRecord: Equatable {
  let window: CGWindowID
  let by: AppWindowSignal
  var kind: OverlayKind?
  var route: OverlayRoute?
  var refused: OverlayRefusal?
  var effect: OverlayEffect?
  var actionError: Int32?
  var polls = 0
  var ms: Double?
  var element = false

  var wire: [String: Any] {
    var wire: [String: Any] = ["window": Int(window), "by": by.rawValue]
    if let kind { wire["kind"] = kind.rawValue }
    if let route { wire["route"] = route.rawValue }
    if let refused { wire["refused"] = refused.rawValue }
    if let effect { wire["effect"] = effect.rawValue }
    if let actionError { wire["actionError"] = Int(actionError) }
    if polls > 0 { wire["polls"] = polls }
    if let ms { wire["ms"] = (ms * 1000).rounded() / 1000 }
    if element { wire["from"] = "element" }
    return wire
  }
}

/// The delivery and its effect: first the decision again (`revalidate`, finding 6: the hit and the overlay's bounds read
/// anew, answering the window as listed now only when it names the same row in the same window; otherwise `changed` and
/// `refusal` thrown, nothing sent), then `beforeDispatch` (the request's deadline, the owner's checks, the in-flight check,
/// the cursor), then the stamped post by route 2′ (`post`, given `overlayPostTarget`'s target with the bounds read anew;
/// no activation, no hold) or AXPress by route 1 (`perform`; an error other than a messaging timeout is `actionFailed`),
/// then the overlay's window (`windowShown`, nil when the list does not read: unknown, never closed) read at once and every
/// `overlaySampleMs` for up to `overlayConfirmMs`: gone, it answers; otherwise `clickUnconfirmed`.
func deliverOverlayClick<Element>(_ target: OverlayTarget<Element>, point: CGPoint, owner: pid_t, app: String,
                                  windowShown: (CGWindowID) -> Bool?, now: () -> Double, sleep: (Double) -> Void,
                                  revalidate: () -> ListedWindow?, refusal: EngineError, beforeDispatch: () throws -> Void,
                                  post: (ClickTarget) -> Void, perform: (Element, String) -> AXError, record: inout OverlayClickRecord,
                                  meta: inout InputMeta) throws {
  record.kind = target.kind
  meta.inputRoute = target.route == .post ? .plainPost : .action
  guard let window = revalidate(), window.number == target.window.number else {
    record.refused = .changed
    throw refusal
  }
  try beforeDispatch()
  record.route = target.route
  switch target.route {
  case .post:
    meta.posting { post(overlayPostTarget(point, window: window, pid: owner)); return true }
  case .press:
    let pressed = target.pressed ?? target.row
    var error = AXError.failure
    meta.posting { error = perform(pressed, "AXPress"); return true }
    if error != .success {
      record.actionError = error.rawValue
      guard menuItemAmbiguousErrors.contains(error) else {
        throw EngineError(name: "actionFailed", "The element did not accept the AXPress action.")
      }
    }
  }
  let started = now()
  while true {
    record.polls += 1
    if windowShown(target.window.number) == false { record.effect = .closed }
    let ms = now() - started
    record.ms = ms
    if record.effect != nil { return }
    if ms >= overlayConfirmMs { break }
    sleep(min(overlaySampleMs, overlayConfirmMs - ms))
  }
  record.effect = .unconfirmed
  throw overlayClickUnconfirmed(app: app, route: target.route)
}

/// #453's unconfirmed answer: the click was delivered to the overlay, which was not seen to close.
func overlayClickUnconfirmed(app: String, route: OverlayRoute) -> EngineError {
  let how = route == .post ? "sent to the window of \(app)'s own that lies over the one the screenshot showed (a suggestion list, popup or prompt)"
                           : "carried by the item's accessibility action in the popover \(app) shows over the window"
  return EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was \(how), but that window was not seen to close. Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// #470's refusal: the element clicked by its ID lies in a window of the app's own over its window, of a kind a click is
/// sent into, but cannot be checked as the row or button the observation listed. The name is #452's, a window of the
/// app's over the observed one. Nothing was sent.
func overlayElementRefused(app: String, _ why: OverlayRefusal) -> EngineError {
  let cause: String
  switch why {
  case .notItself: cause = "the element is the list or panel that holds its rows, not one of its rows or buttons"
  case .textChanged, .frameMoved, .changed: cause = "the element no longer reads or sits as the last observation listed it"
  case .disabled: cause = "the element is disabled"
  case .notReached, .notInert: cause = "something else of that window lies at the element's point"
  case .noAction: cause = "the element takes no action"
  case .timedOut: cause = "the app did not answer in time"
  default: cause = "it cannot be checked there"
  }
  return EngineError(name: "appWindowOverPoint",
    "\(app) shows this element in a window of its own over its window (a suggestion list, popup or prompt), and a click on it is sent to that window only when it is still the row or button the last observation listed; here \(cause). Nothing was sent. Call getAXState() again and click the row or button by its new ID, or use keys (the arrow keys and Return for a suggestion list, Escape to close it).")
}

/// The route's own way out once a check's refusal was replaced by the overlay's delivery (`StalePointGate.overlay`): the
/// click is carried, and the route acts on nothing of its own; the click answers success with the meta it reached.
struct OverlayClickDelivered: Error {}

extension Engine {
  /// #453 at a coordinate click #452 refused (`verdict`, `appWindowOverPoint`): the decision over the connection's last
  /// screenshot of the app, recorded in the meta, and when it delivers, the delivery (`deliverOverlayClick`) with the
  /// deferred settle armed, the decision run again on a fresh hit-test in `observed` and a fresh window list just before.
  /// True when carried (an unconfirmed one throws); false leaves #452's refusal to stand.
  func overlayPointClick(_ verdict: StalePointVerdict<AXUIElement>, point: CGPoint, shift: CGVector, observed: AXUIElement,
                         observedWindow: CGWindowID?, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                         context: ExecutionContext, meta: inout InputMeta) throws -> Bool {
    guard verdict.reason == .appWindowOverPoint, let number = verdict.overWindow, let by = verdict.overBy else { return false }
    let screenshot = context.connection.observedScreenshot(app: app)
    let chromium = webAccessibility.pageEngine(app.appPath) == .chromium
    func decide(_ answered: AXUIElement?, _ overlay: ListedWindow?, _ observedLayer: Int?) -> OverlayDecision<AXUIElement> {
      overlayPoint(hit: answered, OverlayPointContext(
        point: point, shift: shift, by: by, overlay: overlay, observedLayer: observedLayer, recordedWindows: screenshot?.windowList,
        stableWindows: screenshot?.overlayStable ?? [], nodes: screenshot?.nodes ?? [], chromium: chromium),
        reads: .live(appPid: appPid, budgetMs: overlayBudget(context)))
    }
    let decision = signposted("click.overlay") { decide(verdict.overAnswered, verdict.overListed, verdict.observedListed?.layer) }
    switch decision {
    case .refuse(let why, let kind):
      meta.overlayClick = OverlayClickRecord(window: number, by: by, kind: kind, refused: why)
      return false
    case .deliver(let target):
      try armingSettle(&meta, acted: { context.connection.markActed(app) }) { meta in
        try overlayDelivery(target, point: point, observedWindow: observedWindow, app: app, appPid: appPid, guarding: guarding,
                            context: context, refusal: appWindowOverPointRefusal(app: app.displayName), revalidate: {
          let answered = hitTestOutcome(window: observed, pid: appPid, at: point, now: monotonicMilliseconds).answered
          let list = onScreenWindowList()
          let again = decide(answered, list.first { $0.number == target.window.number },
                             observedWindow.flatMap { observed in list.first { $0.number == observed }?.layer })
          guard case .deliver(let fresh) = again, CFEqual(fresh.row, target.row) else { return nil }
          return fresh.window
        }, meta: &meta)
      }
      return true
    }
  }

  /// #470 at an element click: the element's clickable point, the hit there, and the windows as listed now, with the
  /// label and frame its ID was recorded with (`entry`); delivered by its overlay kind's route, refused when the overlay
  /// is recognised but the row cannot be checked (never left to route 3). True when carried; false keeps the element
  /// click's path.
  func overlayElementClick(_ pointing: ElementPointing, entry: LineageEntry, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                           context: ExecutionContext, meta: inout InputMeta) throws -> Bool {
    guard let point = pointing.point else { return false }
    let application = prepare(AXUIElementCreateApplication(appPid))
    guard let observed = primaryWindow(of: application) else { return false }
    let observedNumber = windowNumber(of: observed, pid: appPid, readFrame: { frame(of: observed) })
    let owner = pointing.owner
    let identity = entry.identity
    let recorded = (label: stalePointLabel(title: identity.title, description: identity.description,
                                           value: identity.role == "AXStaticText" && !identity.valueUnread && !identity.valueFailed ? identity.value : nil),
                    frame: entry.frame)
    let chromium = webAccessibility.pageEngine(app.appPath) == .chromium
    func decide() -> OverlayElementDecision<AXUIElement> {
      overlayElement(pointing.element, recorded: recorded, hit: { hitTest(application: owner, at: point) }, point: point, observed: observed,
                     observedNumber: observedNumber, pid: appPid, list: onScreenWindowList, chromium: chromium,
                     reads: .live(appPid: appPid, budgetMs: overlayBudget(context)),
                     number: { window in windowNumber(of: window, pid: owner, readFrame: { frame(of: window) }) })
    }
    switch signposted("click.overlayElement", decide) {
    case .notOverlay: return false
    case .refuse(let why, let kind, let window):
      meta.inputRoute = kind?.route == .press ? .action : .plainPost
      meta.overlayClick = OverlayClickRecord(window: window?.number ?? 0, by: kind == .appKitPopover ? .popover : .axHit, kind: kind,
                                             refused: why, element: true)
      throw overlayElementRefused(app: app.displayName, why)
    case .deliver(let target):
      try armingSettle(&meta, acted: { context.connection.markActed(app) }) { meta in
        try overlayDelivery(target, point: point, observedWindow: observedNumber, app: app, appPid: appPid, guarding: guarding,
                            context: context, element: true, refusal: overlayElementRefused(app: app.displayName, .changed), revalidate: {
          guard case .deliver(let fresh) = decide(), CFEqual(fresh.row, target.row) else { return nil }
          return fresh.window
        }, meta: &meta)
      }
      return true
    }
  }

  /// One decision's time: `overlayDecisionBudgetMs`, or what is left of the request when less.
  private func overlayBudget(_ context: ExecutionContext) -> Double {
    min(overlayDecisionBudgetMs, Double(context.deadline - unixMilliseconds()))
  }

  /// The delivery, live: the decision run again (`revalidate`), the row's own process checked against the forbidden list
  /// and registered as one the action drives, an earlier action's after-action watch ended, the in-flight check, the agent
  /// cursor at the point, then the kind's route (`deliverOverlayClick`), the posted click noted for #359's ordering.
  private func overlayDelivery(_ target: OverlayTarget<AXUIElement>, point: CGPoint, observedWindow: CGWindowID?, app: ResolvedApp,
                               appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext, element: Bool = false,
                               refusal: EngineError, revalidate: () -> ListedWindow?, meta: inout InputMeta) throws {
    let owner = ownerPid(of: target.row, fallback: appPid)
    var record = OverlayClickRecord(window: target.window.number, by: target.by, kind: target.kind, element: element)
    defer { meta.overlayClick = record }
    try deliverOverlayClick(target, point: point, owner: owner, app: app.displayName, windowShown: { number in
      onScreenWindowIDs().map { $0.contains(number) }
    }, now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) }, revalidate: revalidate, refusal: refusal, beforeDispatch: {
      if unixMilliseconds() >= context.deadline { throw overlayDeadlinePassed }
      try refuseForbiddenOwner(owner)
      actionTargets(owner, app: app, connection: context.connection)
      context.connection.afterAction.cancel()
      try guarding.checkInFlight()
      cursor.act(connection: context.connection.id, app: app.key, window: observedWindow, .click(point))
    }, post: { target in
      _ = postToProcess(clickEvents(target, button: .left, count: 1, flags: []), pid: owner, post: gatedPost)
      clickOrdering.pointerPosted(pids: [owner, appPid])
    }, perform: { gatedPerform($0, $1) }, record: &record, meta: &meta)
  }
}

/// #296's check of what an element route is about to act on, from its gate (`StalePointGate.check`'s answer): its record
/// into the meta, and its refusal thrown, nothing acted on; where that is `appWindowOverPoint` and the gate's overlay rule
/// delivers the click into the overlay instead (#453), `OverlayClickDelivered`, which ends the route.
func stalePointChecked<Element>(_ checked: (record: StalePointRecord, refusal: EngineError?, verdict: StalePointVerdict<Element>),
                                gate: StalePointGate<Element>?, meta: inout InputMeta) throws {
  meta.stalePoint = checked.record
  guard let refusal = checked.refusal else { return }
  if checked.verdict.reason == .appWindowOverPoint, let overlay = gate?.overlay, try overlay(checked.verdict, &meta) {
    throw OverlayClickDelivered()
  }
  throw refusal
}

/// The request's deadline passed before the overlay's click was sent.
let overlayDeadlinePassed = EngineError(name: "timeoutReached",
  "timeoutReached: the request's deadline passed before the click was sent. Nothing was sent.")
