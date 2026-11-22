import ApplicationServices
import CoreGraphics
import Foundation

// #453 (ruling 1071): a plain left click on a row of a window the app shows over the observed one, which #452 refuses
// (`appWindowOverPoint`) because the pointer's events are stamped to the observed window and would reach what lies under
// the overlay. Where main gives exactly that refusal, and the overlay is one of four kinds (`OverlayKind`), the click is
// carried by AXPress on the row the observation recorded at the point, pressed by its recorded handle
// (`ScreenshotNode.element`): the observation's walk of the observed window already records these overlays' rows (kit
// `probe/453-measure` README §Q3: Chromium hangs its popups' and bubbles' trees under the browser window, and an AppKit
// popover lies in its window's tree), so the record needs nothing added. The row is never found again by a hit-test or a
// search: the hit-test #452 already took only says where the overlay's subtree starts in the record (the outermost element
// of its chain, up to the overlay's AXWindow or AXPopover, that the record holds by handle), and the row is the deepest
// recorded node of that subtree whose shown frame held the point. Two such nodes not nested, no recorded subtree or row,
// or a row whose handle is dead or reads another role, another label, a frame more than 2 pt from the recorded one after
// the window's shift, or disabled, keeps main's refusal; so does any read of those that fails. The press posts no mouse
// event and activates nothing. The click succeeds once the overlay's window has left the screen or the row's handle has
// died, read for `overlayConfirmMs`; otherwise it answers `clickUnconfirmed`. The spike (main 5580ac20, run 45050307595,
// README §"#453 spike") measured this press taking the row 105/105 with the frontmost app, the person's window order and
// key window unchanged. A point-based post was tried first and dropped (the spec's Decision Log, the #453 entries).
// Everything reads through closures, so the rule is unit-tested over fakes.

/// The overlays a click is carried into; any other keeps #452's refusal.
enum OverlayKind: String, CaseIterable, Equatable {
  /// Chrome's address-bar suggestions: a window at the browser window's layer whose page is titled `omniboxPopupTitle`.
  case omniboxPopup
  /// Chromium's autofill list (a page's `<datalist>` suggestions): a window above the browser window's layer holding an
  /// AXList, outside any web page.
  case datalist
  /// Chromium's permission prompt: a window at the browser window's layer holding an alert dialog, outside any web page.
  case permissionBubble
  /// An AppKit popover (TextEdit's colour-well swatches): an AXPopover in the observed window's tree, over which the window
  /// list holds a window of the app's.
  case appKitPopover
}

/// The WebUI omnibox popup's document title, a literal in Chromium's `omnibox_popup.html`, not localised.
let omniboxPopupTitle = "Omnibox Popup"
/// The subrole Chromium gives an alert dialog (its permission prompt's root group).
let alertDialogSubrole = "AXApplicationAlertDialog"
/// The wait for the overlay to close, or the row to die, after the press: read at once, then every `overlaySampleMs`.
let overlayConfirmMs: Double = 500
let overlaySampleMs: Double = 20
/// The roles that hold rows and are never a row themselves.
let overlayContainerRoles: Set<String> = [kAXWindowRole, "AXWebArea", kAXPopoverRole, kAXApplicationRole]

/// An element's AXEnabled as read: an element with no such attribute (a text) is not disabled; a failed read is no answer.
enum OverlayEnabledRead: Equatable { case enabled, disabled, absent, failed }

func overlayEnabledRead(_ read: (value: CFTypeRef?, error: AXError)) -> OverlayEnabledRead {
  switch read.error {
  case .success: return (read.value as? NSNumber).map { $0.boolValue ? .enabled : .disabled } ?? .failed
  case .noValue, .attributeUnsupported: return .absent
  default: return .failed
  }
}

/// The reads #453 makes (the unit tests' seams; `.live` over the Accessibility API): the guard's, and AXEnabled.
struct OverlayReads<Element> {
  var stale: StalePointReads<Element>
  var enabled: (Element) -> OverlayEnabledRead
}

extension OverlayReads where Element == AXUIElement {
  static var live: OverlayReads<AXUIElement> {
    OverlayReads(stale: .live, enabled: { overlayEnabledRead(copyAttribute($0, kAXEnabledAttribute)) })
  }
}

/// Why #452's refusal stood (the meta's `overlayClick.refused`).
enum OverlayRefusal: String, Equatable {
  /// The hit-test's answer does not read up to the overlay's AXWindow (an AXPopover, for a popover).
  case unread
  /// Not one of `OverlayKind`'s overlays.
  case unknownKind
  /// The record holds no element of the overlay the hit reaches, or no row of it at the point: no handle to press.
  case notRecorded
  /// Two or more recorded rows of the overlay hold the point, and neither lies inside the other.
  case notNested
  /// The row's handle names a destroyed element.
  case gone
  /// The row reads another role now, or its role does not read (now or at the observation).
  case roleChanged
  /// The row reads another label now, or a part of its label does not read (now or at the observation).
  case labelChanged
  /// The row's frame is more than `stalePointFrameTolerance` from the recorded one after the window's shift, or unread.
  case frameMoved
  /// The row reads disabled, or its AXEnabled read failed.
  case disabled
}

/// The row a click is carried to: the overlay's kind, window and the signal #452 found it by, and the row's recorded node,
/// whose handle is pressed.
struct OverlayTarget<Element> {
  let kind: OverlayKind
  let window: CGWindowID
  let by: AppWindowSignal
  let row: ScreenshotNode<Element>
}

/// #453's decision at a coordinate click's point.
enum OverlayPoint<Element> {
  /// Not #452's `appWindowOverPoint`: main's verdict, whatever it is.
  case notOverlay
  case deliver(OverlayTarget<Element>)
  /// #452's refusal stands; the kind when it was told.
  case refuse(OverlayRefusal, kind: OverlayKind?, window: CGWindowID, by: AppWindowSignal)
}

/// Whether #453 may replace main's answer: only main's `appWindowOverPoint` (so every verdict decided before it, #316's
/// `newWindow`, and every tree verdict, #443's `controlGone` included, stays main's), for a plain left click (one click,
/// the left button, no spike route), never a drag, a right click or a double click.
func overlayPressApplies<Element>(_ verdict: StalePointVerdict<Element>, button: MouseButton, count: Int, forced: Bool) -> Bool {
  verdict.reason == .appWindowOverPoint && button == .left && count == 1 && !forced
}

/// The hit-test's answer read up to where the overlay starts: through its AXWindow for `axHit` (another window of the
/// app's), through the nearest AXPopover for `popover`; the answer first. Nil when it reads to neither.
func overlayChain<Element>(from answered: Element, by: AppWindowSignal, reads: StalePointReads<Element>) -> [Element]? {
  var chain: [Element] = []
  var current = answered
  for _ in 0..<stalePointAncestorLevels {
    let role = reads.role(current)
    chain.append(current)
    switch (by, role) {
    case (.axHit, kAXWindowRole?), (.popover, kAXPopoverRole?): return chain
    case (.popover, kAXWindowRole?), (_, kAXApplicationRole?), (_, nil): return nil
    default: break
    }
    guard let parent = reads.parent(current) else { return nil }
    current = parent
  }
  return nil
}

/// The overlay's kind from the recorded path from the overlay's root down to the row (`path`: role, title, subrole as the
/// observation recorded them), the app's page engine and the two windows' layers; nil for any other overlay.
func overlayKind<Element>(_ path: [ScreenshotNode<Element>], by: AppWindowSignal, chromium: Bool, overLayer: Int?,
                          observedLayer: Int?) -> OverlayKind? {
  switch by {
  case .popover:
    return chromium ? nil : .appKitPopover
  case .axHit:
    guard chromium, let overLayer, let observedLayer else { return nil }
    let pages = path.filter { $0.role == "AXWebArea" }
    if !pages.isEmpty {
      return pages.count == 1 && pages[0].title == omniboxPopupTitle && overLayer == observedLayer ? .omniboxPopup : nil
    }
    if overLayer > observedLayer, path.contains(where: { $0.role == "AXList" }) { return .datalist }
    if overLayer == observedLayer, path.contains(where: { $0.subrole == alertDialogSubrole }) { return .permissionBubble }
    return nil
  }
}

/// A recorded node's label as #453 compares it: the title, else the description, else an AXStaticText's value, the first
/// non-empty; nil when a part it reaches did not read at the observation (`ScreenshotNode.labelsUnread`), `.some(nil)`
/// when it has none.
func overlayRecordedLabel<Element>(_ node: ScreenshotNode<Element>) -> String?? {
  for part in overlayLabelParts(node.role) {
    if node.labelsUnread.contains(part) { return nil }
    let text = part == .title ? node.title : part == .description ? node.description : node.value
    if let text, !text.isEmpty { return .some(text) }
  }
  return .some(nil)
}

/// The same label read now, each part cut as the record's was (`bounded`); nil when a part it reaches does not read.
func overlayLabelNow<Element>(_ element: Element, role: String, reads: StalePointReads<Element>) -> String?? {
  for part in overlayLabelParts(role) {
    guard case .text(let text) = reads.readLabel(element, part) else { return nil }
    if let text, !text.isEmpty { return .some(bounded(text)) }
  }
  return .some(nil)
}

private func overlayLabelParts(_ role: String) -> [StalePointLabelPart] {
  role == "AXStaticText" ? [.title, .description, .value] : [.title, .description]
}

/// #453's decision (ruling 1071) where #452 refused a coordinate click (`verdict`, `appWindowOverPoint`): `answered` is what
/// the app's hit-test answered at the point whatever window its chain reads to (`WindowHit.answered` of the hit-test the
/// guard judged), `nodes` the screenshot's record, `shift` the observed window's move since the screenshot. The overlay's
/// root in the record is the outermost element of the hit's chain (`overlayChain`) the record holds by handle; the row is
/// the deepest recorded node at or below it, of no container role (`overlayContainerRoles`), whose shown frame held the
/// point, all such nodes nested; its kind is read from the recorded path from the root to it. The row's own handle then
/// reads: alive, the recorded role and label, its frame within `stalePointFrameTolerance` of the recorded one moved by
/// `shift`, and enabled (or no AXEnabled at all). Any other answer keeps #452's refusal.
func overlayPoint<Element>(_ verdict: StalePointVerdict<Element>, answered: Element?, nodes: [ScreenshotNode<Element>], shift: CGVector,
                           chromium: Bool, reads: OverlayReads<Element>) -> OverlayPoint<Element> {
  guard verdict.reason == .appWindowOverPoint, let window = verdict.overWindow, let by = verdict.overBy, let point = verdict.point else {
    return .notOverlay
  }
  func refuse(_ why: OverlayRefusal, _ kind: OverlayKind? = nil) -> OverlayPoint<Element> {
    .refuse(why, kind: kind, window: window, by: by)
  }
  let stale = reads.stale
  guard let answered, let chain = overlayChain(from: answered, by: by, reads: stale) else { return refuse(.unread) }
  // The overlay's root: the outermost element of the chain the record holds.
  var root: Int?
  for element in chain.reversed() {
    if let index = nodes.firstIndex(where: { stale.same($0.element, element) }) { root = index; break }
  }
  guard let root else { return refuse(.notRecorded) }
  /// A recorded node's recorded ancestors, nearest first.
  func ancestry(_ index: Int) -> [Int] {
    var found: [Int] = []
    var current = nodes[index].ancestor
    while let at = current, at < nodes.count, found.count < stalePointAncestorLevels { found.append(at); current = nodes[at].ancestor }
    return found
  }
  let shown = CGPoint(x: point.x - shift.dx, y: point.y - shift.dy)
  let rows = nodes.indices.filter { index in
    guard !overlayContainerRoles.contains(nodes[index].role), nodes[index].shown.map({ holdsPoint($0, shown) }) == true else { return false }
    return index == root || ancestry(index).contains(root)
  }
  guard let deepest = rows.max(by: { nodes[$0].depth < nodes[$1].depth || (nodes[$0].depth == nodes[$1].depth && $0 < $1) }) else {
    return refuse(.notRecorded)
  }
  let above = ancestry(deepest)
  guard rows.allSatisfy({ $0 == deepest || above.contains($0) }) else { return refuse(.notNested) }
  let row = nodes[deepest]
  let path = deepest == root ? [row] : [nodes[root]] + above.prefix { $0 != root }.reversed().map { nodes[$0] } + [row]
  guard let kind = overlayKind(path, by: by, chromium: chromium, overLayer: verdict.overLayer, observedLayer: verdict.observedLayer) else {
    return refuse(.unknownKind)
  }
  let element = row.element
  guard !stale.isGone(element) else { return refuse(.gone, kind) }
  guard !row.roleUnknown, stale.role(element) == row.role else { return refuse(.roleChanged, kind) }
  guard let recorded = overlayRecordedLabel(row), let now = overlayLabelNow(element, role: row.role, reads: stale), now == recorded else {
    return refuse(.labelChanged, kind)
  }
  guard let frame = stale.frame(element), frameDistance(frame, row.frame.offsetBy(dx: shift.dx, dy: shift.dy)) <= stalePointFrameTolerance else {
    return refuse(.frameMoved, kind)
  }
  switch reads.enabled(element) {
  case .enabled, .absent: break
  case .disabled, .failed: return refuse(.disabled, kind)
  }
  return .deliver(OverlayTarget(kind: kind, window: window, by: by, row: row))
}

/// The meta's `overlayClick` (#453, value-free): the overlay's window, the signal #452 found it by and its kind; then
/// either the route that carried the click (`route: "action"`, set once the AXPress is dispatched) and whether its effect
/// was seen (`confirmed`), with the AXError of a press that was not success, the reads and the milliseconds from the
/// press's return to the last read; or why #452's refusal stood (`refused`).
struct OverlayClickRecord: Equatable {
  let window: CGWindowID
  let by: AppWindowSignal
  var kind: OverlayKind?
  var refused: OverlayRefusal?
  var pressed = false
  var confirmed: Bool?
  var actionError: Int32?
  var polls = 0
  var ms: Double?

  var wire: [String: Any] {
    var wire: [String: Any] = ["window": Int(window), "by": by.rawValue]
    if let kind { wire["kind"] = kind.rawValue }
    if let refused { wire["refused"] = refused.rawValue }
    if pressed { wire["route"] = "action" }
    if let confirmed { wire["confirmed"] = confirmed }
    if let actionError { wire["actionError"] = Int(actionError) }
    if polls > 0 { wire["polls"] = polls }
    if let ms { wire["ms"] = (ms * 1000).rounded() / 1000 }
    return wire
  }
}

/// #453's step in a coordinate click, before anything is posted: the decision carried out. False leaves the click to
/// main's path (`notOverlay`, or a refusal, recorded in the meta, after which main throws #452's refusal). For a row to
/// deliver: `beforeDispatch` (the request's deadline, the row's process checked and registered, the in-flight check, the
/// agent cursor), then AXPress on the recorded handle (`perform`; an error other than a messaging timeout is
/// `actionFailed`), then the overlay's window (`windowShown`, nil when the list does not read: unknown, never closed) and
/// the row's handle read at once and every `overlaySampleMs` for up to `overlayConfirmMs`: the window gone or the row
/// dead answers true; otherwise `clickUnconfirmed`. No mouse event is posted and the app is not activated on any branch.
func overlayClick<Element>(_ decision: OverlayPoint<Element>, app: String, reads: OverlayReads<Element>,
                           windowShown: (CGWindowID) -> Bool?, now: () -> Double, sleep: (Double) -> Void,
                           beforeDispatch: (Element) throws -> Void, perform: (Element, String) -> AXError,
                           meta: inout InputMeta) throws -> Bool {
  switch decision {
  case .notOverlay: return false
  case .refuse(let why, let kind, let window, let by):
    meta.overlayClick = OverlayClickRecord(window: window, by: by, kind: kind, refused: why)
    return false
  case .deliver(let target):
    meta.inputRoute = .action
    var record = OverlayClickRecord(window: target.window, by: target.by, kind: target.kind)
    defer { meta.overlayClick = record }
    let row = target.row.element
    try beforeDispatch(row)
    record.pressed = true
    var error = AXError.failure
    meta.posting { error = perform(row, "AXPress"); return true }
    if error != .success {
      record.actionError = error.rawValue
      guard menuItemAmbiguousErrors.contains(error) else {
        record.confirmed = false
        throw EngineError(name: "actionFailed", "The element did not accept the AXPress action.")
      }
    }
    let started = now()
    while true {
      record.polls += 1
      let closed = windowShown(target.window) == false || reads.stale.isGone(row)
      let ms = now() - started
      record.ms = ms
      if closed {
        record.confirmed = true
        return true
      }
      if ms >= overlayConfirmMs { break }
      sleep(min(overlaySampleMs, overlayConfirmMs - ms))
    }
    record.confirmed = false
    throw overlayClickUnconfirmed(app: app)
  }
}

/// #453's unconfirmed answer: the row's action was performed, but its window was not seen to close.
func overlayClickUnconfirmed(app: String) -> EngineError {
  EngineError(name: "clickUnconfirmed",
    "The click could not be confirmed: it was carried by the row's own accessibility action in the window \(app) shows over the one the screenshot showed (a suggestion list, popup, prompt or popover), but that window was not seen to close. Observe the app with get_app_state before any retry, and never retry blindly.")
}

/// The request's deadline passed before the row's action was sent.
let overlayDeadlinePassed = EngineError(name: "timeoutReached",
  "timeoutReached: the request's deadline passed before the click was sent. Nothing was sent.")

extension Engine {
  /// #453 at a coordinate click #452 refused: the decision over the connection's last screenshot of the app, and its
  /// delivery with the deferred settle armed. True when carried (an unconfirmed one throws); false leaves #452's refusal.
  func overlayPointClick(_ verdict: StalePointVerdict<AXUIElement>, answered: AXUIElement?, shift: CGVector, point: CGPoint,
                         observedWindow: CGWindowID?, app: ResolvedApp, appPid: pid_t, guarding: InterventionGuard,
                         context: ExecutionContext, meta: inout InputMeta) throws -> Bool {
    let reads = OverlayReads<AXUIElement>.live
    let decision = signposted("click.overlay") {
      overlayPoint(verdict, answered: answered, nodes: context.connection.observedScreenshot(app: app)?.nodes ?? [], shift: shift,
                   chromium: webAccessibility.pageEngine(app.appPath) == .chromium, reads: reads)
    }
    return try armingSettle(&meta, acted: { context.connection.markActed(app) }) { meta in
      try overlayClick(decision, app: app.displayName, reads: reads, windowShown: { number in onScreenWindowIDs().map { $0.contains(number) } },
                       now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) }, beforeDispatch: { [self] row in
        if unixMilliseconds() >= context.deadline { throw overlayDeadlinePassed }
        let owner = ownerPid(of: row, fallback: appPid)
        try refuseForbiddenOwner(owner)
        actionTargets(owner, app: app, connection: context.connection)
        try guarding.checkInFlight()
        cursor.act(connection: context.connection.id, app: app.key, window: observedWindow, .click(point))
      }, perform: { gatedPerform($0, $1) }, meta: &meta)
    }
  }
}
