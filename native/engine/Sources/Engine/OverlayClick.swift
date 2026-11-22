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
// first answer it is in Chrome) is a node the observation recorded and the screenshot showed there, still reading its
// recorded text at its recorded frame, enabled, in the overlay window the screenshot's window list held, of a kind this
// file lists (`OverlayKind`). Identity is the recorded node's, never the point's alone: a list re-laid out since (one more
// character typed re-lays the omnibox's rows 2 to 4 times within about 250 ms, its window number unchanged) whose row under
// the point now reads other text is refused. Chromium's overlays take the stamped post, with no activation and no hold;
// an AppKit popover takes AXPress on the recorded node. The click succeeds once the overlay's window has left the screen
// or the row's element has died, read for `overlayConfirmMs`; otherwise it answers `clickUnconfirmed`. Anything else keeps
// #452's refusal unchanged. #456's rechecks after an element route's wait apply the same rule (`StalePointGate.overlay`),
// and an element click on a row of such an overlay (#470) takes the same kind's route. Everything reads through closures,
// so the rule is unit-tested over fakes.

/// The overlays a click is delivered into, each a switch of its own (`delivers`); any other refuses as #452 does.
enum OverlayKind: String, CaseIterable, Equatable {
  /// Chrome's address-bar suggestions: a window of its own at the browser window's layer holding the WebUI page titled
  /// `omniboxPopupTitle`.
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

/// The reads #453 makes (the unit tests' seams; `.live` over the Accessibility API): the guard's, with the subrole, the
/// web area's title and AXEnabled.
struct OverlayReads<Element> {
  var stale: StalePointReads<Element>
  var subrole: (Element) -> String?
  /// AXEnabled; nil when it does not read (a text, which has none).
  var enabled: (Element) -> Bool?
}

extension OverlayReads where Element == AXUIElement {
  static var live: OverlayReads<AXUIElement> {
    OverlayReads(stale: .live, subrole: { attribute($0, kAXSubroleAttribute) as? String },
                 enabled: { (attribute($0, kAXEnabledAttribute) as? NSNumber)?.boolValue })
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
/// to no window. Chrome's first hit-test at an omnibox row answers the popup's web area; the row lies below it.
func overlayChain<Element>(from hit: Element, at point: CGPoint, descends: Bool = true, reads: StalePointReads<Element>) -> OverlayChain<Element>? {
  var deepest = hit
  var budget = overlayDescentReads
  descent: for _ in 0..<(descends ? overlayDescentLevels : 0) {
    guard let children = reads.children(deepest), !children.isEmpty else { break }
    for child in children.reversed() {
      guard budget > 0 else { break descent }
      budget -= 1
      if let frame = reads.frame(child), holdsPoint(frame, point) {
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
    let role = reads.role(current)
    if role == kAXWindowRole { return OverlayChain(elements: elements, roles: roles, root: current, popover: popover) }
    if role == kAXApplicationRole { return nil }
    if role == kAXPopoverRole, popover == nil { popover = elements.count }
    elements.append(current)
    roles.append(role)
    guard let parent = reads.parent(current) else { return nil }
    current = parent
  }
  return nil
}

/// The overlay's kind from what its chain passes (`OverlayKind`'s cases say what each is), the app's page engine, and the
/// overlay's layer against the observed window's; nil for any other overlay.
func overlayKind<Element>(_ chain: OverlayChain<Element>, by: AppWindowSignal, chromium: Bool, overlayLayer: Int?, observedLayer: Int?,
                          reads: OverlayReads<Element>) -> OverlayKind? {
  let inside = chain.inside(by)
  func passes(_ test: (Element, String?) -> Bool) -> Bool {
    zip(inside, chain.roles[..<inside.count]).contains { test($0, $1) }
  }
  switch by {
  case .popover:
    return !chromium && chain.popover != nil ? .appKitPopover : nil
  case .axHit:
    guard chromium, let overlayLayer, let observedLayer else { return nil }
    if passes({ element, role in role == "AXWebArea" && reads.stale.title(element) == omniboxPopupTitle }) {
      return overlayLayer == observedLayer ? .omniboxPopup : nil
    }
    guard !passes({ _, role in role == "AXWebArea" }) else { return nil }
    if overlayLayer > observedLayer, passes({ _, role in role == "AXList" }) { return .datalist }
    if overlayLayer == observedLayer, passes({ element, _ in reads.subrole(element) == alertDialogSubrole }) { return .permissionBubble }
    return nil
  }
}

/// Why a click into an overlay was not delivered, #452's refusal standing (the meta's `overlayClick.refused`).
enum OverlayRefusal: String, Equatable {
  /// The overlay's window is not listed now, or the hit-test answered nothing in it.
  case unread
  /// The screenshot's window list did not hold the overlay's window: another overlay than the one it showed.
  case otherWindow
  /// Not one of `OverlayKind`'s overlays.
  case unknownKind
  /// One of them, switched off (`OverlayKind.delivers`).
  case kindOff
  /// No element the hit reaches at the point is a node the observation recorded there.
  case notRecorded
  /// The record holds a node deeper at the point, inside the one the hit reaches, which the hit does not reach.
  case deeperRecorded
  /// The recorded node carries no text, and no recorded row around it does alone.
  case unlabelled
  /// The row reads other text than the observation recorded (a list re-laid out since), or its text does not read.
  case textChanged
  /// The row's frame is not the recorded one (moved, or gone).
  case frameMoved
  case disabled
  /// An AppKit popover's row lists no AXPress.
  case noAction
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
}

/// What #453's rule reads at a coordinate click's point beyond the live tree: the point now and the observed window's shift
/// since the screenshot, the signal #452 refused by, the overlay's and the observed window's listing now, the screenshot's
/// window list and its record, and whether the app is Chromium's.
struct OverlayPointContext<Element> {
  let point: CGPoint
  var shift: CGVector = .zero
  let by: AppWindowSignal
  let overlay: ListedWindow?
  let observedLayer: Int?
  let recordedWindows: Set<CGWindowID>?
  let nodes: [ScreenshotNode<Element>]
  let chromium: Bool
}

/// #453's decision where #452 refused a coordinate click (`appWindowOverPoint`), `hit` the hit-test's own answer.
func overlayPoint<Element>(hit: Element?, _ context: OverlayPointContext<Element>, reads: OverlayReads<Element>) -> OverlayDecision<Element> {
  let stale = reads.stale
  guard let window = context.overlay, let hit, let chain = overlayChain(from: hit, at: context.point, reads: stale) else {
    return .refuse(.unread, kind: nil)
  }
  guard let kind = overlayKind(chain, by: context.by, chromium: context.chromium, overlayLayer: window.layer,
                               observedLayer: context.observedLayer, reads: reads) else { return .refuse(.unknownKind, kind: nil) }
  guard kind.delivers else { return .refuse(.kindOff, kind: kind) }
  guard context.recordedWindows?.contains(window.number) == true else { return .refuse(.otherWindow, kind: kind) }
  let nodes = context.nodes
  let shown = CGPoint(x: context.point.x - context.shift.dx, y: context.point.y - context.shift.dy)
  func holds(_ node: ScreenshotNode<Element>) -> Bool { node.shown.map { holdsPoint($0, shown) } ?? false }
  let inside = Array(chain.inside(context.by))
  func onChain(_ element: Element) -> Bool { inside.contains { stale.same($0, element) } }
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
  func label(_ node: ScreenshotNode<Element>) -> String? {
    stalePointLabel(title: node.title, description: node.description, value: node.role == "AXStaticText" ? node.value : nil)
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
  if label(nodes[found]) == nil {
    guard foundAt == 0 else { return .refuse(.notRecorded, kind: kind) }
    guard let labelled = ancestry(found).first(where: { label(nodes[$0]) != nil }),
          !["AXWebArea", kAXWindowRole, kAXPopoverRole].contains(nodes[labelled].role),
          !nodes.indices.contains(where: { label(nodes[$0]) != nil && !holds(nodes[$0]) && ancestry($0).contains(labelled) }) else {
      return .refuse(.unlabelled, kind: kind)
    }
    row = labelled
  }
  guard nodes[row].labelsUnread.isEmpty, let recordedLabel = label(nodes[row]) else { return .refuse(.unlabelled, kind: kind) }
  guard onChain(nodes[row].element) else { return .refuse(.notRecorded, kind: kind) }
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
    guard let from = inside.firstIndex(where: { stale.same($0, nodes[found].element) }),
          let to = inside.firstIndex(where: { stale.same($0, nodes[row].element) }), from <= to,
          let pressed = inside[from...to].first(where: { stale.actions($0)?.contains("AXPress") == true }) else {
      return .refuse(.noAction, kind: kind)
    }
    target.pressed = pressed
  }
  return .deliver(target)
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

/// #470: an element click (`element`, by its ID) on a row of an overlay of a listed kind, `hit` the hit-test at the
/// element's clickable point: the same kind's route when the point reaches the element (the chain from the hit, descended,
/// holds it) inside a window of the app's other than the observed one (`observed`, listed now as `observedNumber`) that
/// covers the point, or inside an AXPopover of the observed window with a window of the app's over the point; the element
/// enabled, and listing AXPress for AXPress. Nil otherwise: the element click's own path, as before. The element's own
/// ancestry is read first, so an element in the observed window outside any popover (every other click) reads no hit,
/// no descent and no window list.
func overlayElement<Element>(_ element: Element, hit: () -> Element?, point: CGPoint, observed: Element, observedNumber: CGWindowID?,
                             pid: pid_t, list: () -> [ListedWindow], chromium: Bool, reads: OverlayReads<Element>,
                             number: (Element) -> CGWindowID?) -> OverlayTarget<Element>? {
  let stale = reads.stale
  guard let own = overlayChain(from: element, at: point, descends: false, reads: stale),
        !stale.same(own.root, observed) || own.popover != nil else { return nil }
  guard let hit = hit(), let chain = overlayChain(from: hit, at: point, reads: stale) else { return nil }
  let list = list()
  let by: AppWindowSignal
  let window: ListedWindow
  if stale.same(chain.root, observed) {
    guard let observedNumber, chain.popover != nil,
          let over = appWindowOverPoint(point, target: observedNumber, pid: pid, list: list) else { return nil }
    (by, window) = (.popover, over)
  } else {
    guard let overNumber = number(chain.root), hitWindowCovers(overNumber, point: point, target: observedNumber, list: list),
          let over = list.first(where: { $0.number == overNumber }) else { return nil }
    (by, window) = (.axHit, over)
  }
  guard chain.inside(by).contains(where: { stale.same($0, element) }),
        let kind = overlayKind(chain, by: by, chromium: chromium, overlayLayer: window.layer,
                               observedLayer: observedNumber.flatMap { number in list.first { $0.number == number }?.layer }, reads: reads),
        kind.delivers, reads.enabled(element) != false else { return nil }
  var target = OverlayTarget(kind: kind, window: window, by: by, row: element)
  if kind.route == .press {
    guard stale.actions(element)?.contains("AXPress") == true else { return nil }
    target.pressed = element
  }
  return target
}

/// The events' target for the stamped post: the point, the overlay's own window number and its frame, so the window
/// location is local to the overlay (Mouse.swift `stampWindow`), posted to `pid`.
func overlayPostTarget(_ point: CGPoint, window: ListedWindow, pid: pid_t) -> ClickTarget {
  ClickTarget(point: point, windowFrame: window.bounds, windowID: window.number, pid: pid)
}

/// What the delivery's effect read: the overlay's window left the screen, the row's element died, or neither in time.
enum OverlayEffect: String, Equatable { case closed, rowGone, unconfirmed }

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

/// The delivery and its effect: `beforeDispatch` (the request's deadline, the owner's checks, the in-flight check, the
/// cursor), then the stamped post by route 2′ (`post`, given `overlayPostTarget`'s target; no activation, no hold) or
/// AXPress by route 1 (`perform`; an error other than a messaging timeout is `actionFailed`), then the overlay's window
/// (`windowShown`, nil when the list does not read: unknown, never closed) and the row's element read at once and every
/// `overlaySampleMs` for up to `overlayConfirmMs`: closed or gone, it answers; otherwise `clickUnconfirmed`.
func deliverOverlayClick<Element>(_ target: OverlayTarget<Element>, point: CGPoint, owner: pid_t, app: String,
                                  reads: StalePointReads<Element>, windowShown: (CGWindowID) -> Bool?, now: () -> Double,
                                  sleep: (Double) -> Void, beforeDispatch: () throws -> Void, post: (ClickTarget) -> Void,
                                  perform: (Element, String) -> AXError, record: inout OverlayClickRecord,
                                  meta: inout InputMeta) throws {
  record.kind = target.kind
  meta.inputRoute = target.route == .post ? .plainPost : .action
  try beforeDispatch()
  record.route = target.route
  switch target.route {
  case .post:
    meta.posting { post(overlayPostTarget(point, window: target.window, pid: owner)); return true }
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
    if windowShown(target.window.number) == false { record.effect = .closed } else if reads.isGone(target.row) { record.effect = .rowGone }
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

/// The route's own way out once a check's refusal was replaced by the overlay's delivery (`StalePointGate.overlay`): the
/// click is carried, and the route acts on nothing of its own; the click answers success with the meta it reached.
struct OverlayClickDelivered: Error {}

extension Engine {
  /// #453 at a coordinate click #452 refused (`verdict`, `appWindowOverPoint`): the decision over the connection's last
  /// screenshot of the app, recorded in the meta, and when it delivers, the delivery (`deliverOverlayClick`) with the
  /// deferred settle armed. True when carried (an unconfirmed one throws); false leaves #452's refusal to stand.
  func overlayPointClick(_ verdict: StalePointVerdict<AXUIElement>, point: CGPoint, shift: CGVector, observedWindow: CGWindowID?,
                         app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext,
                         meta: inout InputMeta) throws -> Bool {
    guard verdict.reason == .appWindowOverPoint, let number = verdict.overWindow, let by = verdict.overBy else { return false }
    let screenshot = context.connection.observedScreenshot(app: app)
    let reads = OverlayReads<AXUIElement>.live
    let decision = signposted("click.overlay") {
      overlayPoint(hit: verdict.overAnswered, OverlayPointContext(
        point: point, shift: shift, by: by, overlay: verdict.overListed, observedLayer: verdict.observedListed?.layer,
        recordedWindows: screenshot?.windowList, nodes: screenshot?.nodes ?? [], chromium: webAccessibility.pageEngine(app.appPath) == .chromium),
        reads: reads)
    }
    switch decision {
    case .refuse(let why, let kind):
      meta.overlayClick = OverlayClickRecord(window: number, by: by, kind: kind, refused: why)
      return false
    case .deliver(let target):
      try armingSettle(&meta, acted: { context.connection.markActed(app) }) { meta in
        try overlayDelivery(target, point: point, observedWindow: observedWindow, app: app, appPid: appPid, guarding: guarding,
                            context: context, meta: &meta)
      }
      return true
    }
  }

  /// #470 at an element click: the element's clickable point, the hit there, and the windows as listed now; delivered by
  /// its overlay kind's route when `overlayElement` names one. True when carried; false keeps the element click's path.
  func overlayElementClick(_ pointing: ElementPointing, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                           context: ExecutionContext, meta: inout InputMeta) throws -> Bool {
    guard let point = pointing.point else { return false }
    let application = prepare(AXUIElementCreateApplication(appPid))
    guard let observed = primaryWindow(of: application) else { return false }
    let observedNumber = windowNumber(of: observed, pid: appPid, readFrame: { frame(of: observed) })
    let owner = pointing.owner
    let reads = OverlayReads<AXUIElement>.live
    let found = signposted("click.overlayElement") { () -> OverlayTarget<AXUIElement>? in
      overlayElement(pointing.element, hit: { hitTest(application: owner, at: point) }, point: point, observed: observed,
                     observedNumber: observedNumber, pid: appPid, list: onScreenWindowList,
                     chromium: webAccessibility.pageEngine(app.appPath) == .chromium, reads: reads,
                     number: { window in windowNumber(of: window, pid: owner, readFrame: { frame(of: window) }) })
    }
    guard let target = found else { return false }
    try armingSettle(&meta, acted: { context.connection.markActed(app) }) { meta in
      try overlayDelivery(target, point: point, observedWindow: observedNumber, app: app, appPid: appPid, guarding: guarding,
                          context: context, element: true, meta: &meta)
    }
    return true
  }

  /// The delivery, live: the row's own process checked against the forbidden list and registered as one the action drives,
  /// an earlier action's after-action watch ended, the in-flight check, the agent cursor at the point, then the kind's route
  /// (`deliverOverlayClick`), the posted click noted for #359's ordering.
  private func overlayDelivery(_ target: OverlayTarget<AXUIElement>, point: CGPoint, observedWindow: CGWindowID?, app: ResolvedApp,
                               appPid: pid_t, guarding: InterventionGuard, context: ExecutionContext, element: Bool = false,
                               meta: inout InputMeta) throws {
    let owner = ownerPid(of: target.row, fallback: appPid)
    var record = OverlayClickRecord(window: target.window.number, by: target.by, kind: target.kind, element: element)
    defer { meta.overlayClick = record }
    try deliverOverlayClick(target, point: point, owner: owner, app: app.displayName, reads: .live, windowShown: { number in
      onScreenWindowIDs().map { $0.contains(number) }
    }, now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) }, beforeDispatch: {
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
