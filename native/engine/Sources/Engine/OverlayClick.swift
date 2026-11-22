import ApplicationServices
import CoreGraphics
import Foundation

// #453 (ruling 1071): a plain left click on a row of a window the app shows over the observed one, which #452 refuses
// (`appWindowOverPoint`) because the pointer's events are stamped to the observed window and would reach what lies under
// the overlay. Where main gives exactly that refusal, and the overlay is one of four kinds (`OverlayKind`), the click is
// carried by AXPress on the row the observation recorded at the point, pressed by its recorded handle
// (`ScreenshotNode.element`): the observation's walk of the observed window already records these overlays' rows (kit
// `probe/453-measure` README §Q3: Chromium hangs its popups' and bubbles' trees under the browser window, and an AppKit
// popover lies in its window's tree); the observation adds only the app's windows listed with their bounds beside the
// image (`ObservedScreenshot.windowsListed`), so exactly one overlay over the point can be required. The row is never
// found again by a hit-test or a search: the hit-test #452 already took only says where the overlay's subtree starts in
// the record (the outermost element of its chain, up to the overlay's AXWindow or AXPopover, that the record holds by
// handle), and the row is the deepest recorded node of that subtree whose shown frame held the point, or, where the chain
// down to it passes an AXList or AXGrid, that container's child on the chain (ruling 1082), of a row's role for its kind,
// its own children and those of its descendants at the point read (or absent: a leaf) and recorded. Two such nodes not nested, no recorded subtree or row, or a row whose handle
// is dead or reads another role, another label part, a frame more than 2 pt from the recorded one after the window's
// shift, or disabled, keeps main's refusal; so does any read of those that fails, and the identity is read again just
// before the press. The press posts no mouse event and activates nothing. The click succeeds once the overlay's window
// has left the screen, read for `overlayConfirmMs`; otherwise it answers `clickUnconfirmed`. The spike (main 5580ac20, run 45050307595,
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

  /// The roles a row of it is pressed as: a suggestion's text (or its button, link or cell), an option's text, a prompt's
  /// button, a popover's control. Anything else at the point (a list, a group, a dialog's padding) is no row.
  var rowRoles: Set<String> {
    switch self {
    case .omniboxPopup: return ["AXStaticText", "AXButton", "AXLink", "AXCell", "AXRow"]
    case .datalist: return ["AXStaticText", "AXCell", "AXRow", "AXMenuItem"]
    case .permissionBubble: return ["AXButton", "AXCheckBox", "AXRadioButton", "AXLink"]
    case .appKitPopover: return ["AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXMenuItem", "AXCell", "AXRow", "AXColorWell"]
    }
  }
}

/// The WebUI omnibox popup's document title, a literal in Chromium's `omnibox_popup.html`, not localised.
let omniboxPopupTitle = "Omnibox Popup"
/// The subrole Chromium gives an alert dialog (its permission prompt's root group).
let alertDialogSubrole = "AXApplicationAlertDialog"
/// The wait for the overlay to close after the press: read at once, then every `overlaySampleMs`.
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
  /// The screenshot's window list held no window of the app's over the observed one at the point, or more than one, or
  /// another than the one the hit reaches now, or did not read.
  case notOneOverlay
  /// The deepest recorded node at the point is not of a row's role for the overlay's kind (a list's or dialog's padding).
  case notARow
  /// The walk did not record the row's subtree whole (a child read that failed, or children left out).
  case partlyRecorded
}

/// The row a click is carried to: the overlay's kind, window and the signal #452 found it by, and the row's recorded node,
/// whose handle is pressed.
struct OverlayTarget<Element> {
  let kind: OverlayKind
  let window: CGWindowID
  let by: AppWindowSignal
  let row: ScreenshotNode<Element>
  /// The observed window's move since the screenshot, which the identity's frame is read against.
  var shift: CGVector = .zero
}

/// #453's decision at a coordinate click's point.
enum OverlayPoint<Element> {
  /// Not #452's `appWindowOverPoint`: main's verdict, whatever it is.
  case notOverlay
  case deliver(OverlayTarget<Element>)
  /// #452's refusal stands; the kind when it was told.
  case refuse(OverlayRefusal, kind: OverlayKind?, window: CGWindowID, by: AppWindowSignal, note: OverlayNote)
}

/// A recorded node as the meta names it (#453, ruling 1082): its role and its recorded frame, in global points.
struct OverlayNodeNote: Equatable {
  let role: String
  let frame: CGRect
  init<Element>(_ node: ScreenshotNode<Element>) { (role, frame) = (node.role, node.frame) }
  init(role: String, frame: CGRect) { (self.role, self.frame) = (role, frame) }
  var wire: [String: Any] {
    ["role": role, "frame": [frame.minX, frame.minY, frame.width, frame.height].map { Double(($0 * 1000).rounded() / 1000) }]
  }
}

/// What the meta says of a decision beyond its reason (#453, ruling 1082): the row chosen, once one is, and the node a
/// refusal stands on with why (`refusedBy`: the row itself for its identity, a descendant whose children are unread).
struct OverlayNote: Equatable {
  var row: OverlayNodeNote?
  var refusedBy: (role: String, reason: String)?
  static func == (a: OverlayNote, b: OverlayNote) -> Bool {
    a.row == b.row && a.refusedBy?.role == b.refusedBy?.role && a.refusedBy?.reason == b.refusedBy?.reason
  }
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

/// The label parts #453 compares, each on its own: the title, the description, and an AXStaticText's value (the record
/// keeps no other role's value).
private func overlayLabelParts(_ role: String) -> [StalePointLabelPart] {
  role == "AXStaticText" ? [.title, .description, .value] : [.title, .description]
}

/// Whether the row reads now each label part the record holds for it, part by part (an empty part counting as none, the
/// live one cut by `bounded` as the record's was): a part that did not read at the observation, or does not read now, or
/// reads otherwise, disagrees.
func overlayLabelsAgree<Element>(_ node: ScreenshotNode<Element>, reads: StalePointReads<Element>) -> Bool {
  func text(_ value: String?) -> String? { value.flatMap { $0.isEmpty ? nil : $0 } }
  for part in overlayLabelParts(node.role) {
    if node.labelsUnread.contains(part) { return false }
    let recorded = part == .title ? node.title : part == .description ? node.description : node.value
    guard case .text(let now) = reads.readLabel(node.element, part), text(recorded) == text(now.map(bounded)) else { return false }
  }
  return true
}

/// #453's identity of the row on its recorded handle, read now: alive, its recorded role, each recorded label part
/// (`overlayLabelsAgree`), its frame within `stalePointFrameTolerance` of the recorded one moved by `shift`, and enabled
/// (or no AXEnabled at all); the first that fails, nil when all hold. Read for the decision and again just before the
/// press (`overlayClick`).
func overlayIdentityRefusal<Element>(_ row: ScreenshotNode<Element>, shift: CGVector, reads: OverlayReads<Element>) -> OverlayRefusal? {
  let stale = reads.stale
  let element = row.element
  guard !stale.isGone(element) else { return .gone }
  guard !row.roleUnknown, stale.role(element) == row.role else { return .roleChanged }
  guard overlayLabelsAgree(row, reads: stale) else { return .labelChanged }
  guard let frame = stale.frame(element), frameDistance(frame, row.frame.offsetBy(dx: shift.dx, dy: shift.dy)) <= stalePointFrameTolerance else {
    return .frameMoved
  }
  switch reads.enabled(element) {
  case .enabled, .absent: return nil
  case .disabled, .failed: return .disabled
  }
}

/// What #453 reads of the connection's last screenshot: its record (each framed node with what it holds of its own
/// children, `ScreenshotNode.children`), and the app's windows listed with it
/// (`ObservedScreenshot.windowsListed`, front to back, nil when unread), the observed window's number then and the app's
/// process.
struct OverlayRecord<Element> {
  var nodes: [ScreenshotNode<Element>]
  var windows: [ListedWindow]?
  var observedWindow: CGWindowID?
  var pid: pid_t
}

/// The app's windows the screenshot's list held in front of the observed one, showing something (alpha above 0), whose
/// bounds held `point` (in the screenshot's space); nil when the list did not read or did not hold the observed window.
func recordedOverlays(at point: CGPoint, _ record: OverlayRecord<some Any>) -> [ListedWindow]? {
  guard let windows = record.windows, let observed = record.observedWindow,
        let index = windows.firstIndex(where: { $0.number == observed }) else { return nil }
  return windows[..<index].filter { $0.owner == record.pid && $0.alpha > 0 && $0.bounds.contains(point) }
}

/// #453's decision (ruling 1071) where #452 refused a coordinate click (`verdict`, `appWindowOverPoint`): `answered` is what
/// the app's hit-test answered at the point whatever window its chain reads to (`WindowHit.answered` of the hit-test the
/// guard judged), `record` the screenshot's, `shift` the observed window's move since the screenshot. The screenshot's
/// window list must hold exactly one window of the app's over the observed one at the point, the one #452 found
/// (`recordedOverlays`). The overlay's root in the record is the outermost element of the hit's chain (`overlayChain`)
/// the record holds by handle; the row is the deepest recorded node at or below it, of no container role
/// (`overlayContainerRoles`), whose shown frame held the point, all such nodes nested; its kind is read from the recorded
/// path from the root to it, and its role must be one of the kind's rows (`OverlayKind.rowRoles`); its recorded subtree
/// must be whole (every element's children read and recorded). Then its identity on its own handle
/// (`overlayIdentityRefusal`). Any other answer keeps #452's refusal.
func overlayPoint<Element>(_ verdict: StalePointVerdict<Element>, answered: Element?, record: OverlayRecord<Element>, shift: CGVector,
                           chromium: Bool, reads: OverlayReads<Element>) -> OverlayPoint<Element> {
  guard verdict.reason == .appWindowOverPoint, let window = verdict.overWindow, let by = verdict.overBy, let point = verdict.point else {
    return .notOverlay
  }
  func refuse(_ why: OverlayRefusal, _ kind: OverlayKind? = nil, row: Int? = nil, blame: Int? = nil, reason: String? = nil) -> OverlayPoint<Element> {
    var note = OverlayNote(row: row.map { OverlayNodeNote(nodes[$0]) })
    if let blame { note.refusedBy = (nodes[blame].role, reason ?? why.rawValue) }
    return .refuse(why, kind: kind, window: window, by: by, note: note)
  }
  let stale = reads.stale
  let nodes = record.nodes
  let shown = CGPoint(x: point.x - shift.dx, y: point.y - shift.dy)
  // One overlay over the point in the screenshot, the one the hit reaches now: with two, the front one closed since leaves
  // the back one's row under the point, which the screenshot showed covered.
  guard let overlays = recordedOverlays(at: shown, record), overlays.count == 1, overlays[0].number == window else {
    return refuse(.notOneOverlay)
  }
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
  let rows = nodes.indices.filter { index in
    guard !overlayContainerRoles.contains(nodes[index].role), nodes[index].shown.map({ holdsPoint($0, shown) }) == true else { return false }
    return index == root || ancestry(index).contains(root)
  }
  guard let deepest = rows.max(by: { nodes[$0].depth < nodes[$1].depth || (nodes[$0].depth == nodes[$1].depth && $0 < $1) }) else {
    return refuse(.notRecorded)
  }
  let above = ancestry(deepest)
  // The recorded chain from the overlay's root down to the deepest node at the point, by index.
  let path = deepest == root ? [deepest] : [root] + above.prefix { $0 != root }.reversed() + [deepest]
  guard let kind = overlayKind(path.map { nodes[$0] }, by: by, chromium: chromium, overLayer: verdict.overLayer,
                               observedLayer: verdict.observedLayer) else {
    return refuse(.unknownKind)
  }
  // Ruling 1082: through a list or grid of the overlay (the outermost on the chain), the row is that container's child on
  // the chain, whatever lies inside it at the point (Chromium's omnibox row text over its unlabelled group, the datalist's
  // option text over its inner text): the element its AXPress takes. Two of its children at the point: refused. With no
  // list or grid (the permission bubble), the deepest node.
  var rowIndex = deepest
  if let at = path.firstIndex(where: { overlayRowContainerRoles.contains(nodes[$0].role) }) {
    let container = path[at]
    rowIndex = at + 1 < path.count ? path[at + 1] : container
    let atPoint = nodes.indices.filter { nodes[$0].ancestor == container && nodes[$0].shown.map({ holdsPoint($0, shown) }) == true }
    guard atPoint.count <= 1 else { return refuse(.notNested, kind, blame: container, reason: "rowsOverlap") }
  }
  // Every recorded node of the overlay at the point lies on one chain (none beside another).
  guard rows.allSatisfy({ $0 == deepest || above.contains($0) }) else { return refuse(.notNested, kind) }
  let row = nodes[rowIndex]
  // A row of the kind, never its list's or dialog's padding.
  guard kind.rowRoles.contains(row.role) else { return refuse(.notARow, kind, row: rowIndex, blame: rowIndex) }
  // The row's own children read (or absent: a leaf) and all recorded, and so for each recorded descendant of it whose
  // frame holds the point; other descendants do not block (ruling 1082).
  let blocking = [rowIndex] + nodes.indices.filter { holdsPoint(nodes[$0].frame, shown) && ancestry($0).contains(rowIndex) }
    .sorted { nodes[$0].depth < nodes[$1].depth }
  if let partial = blocking.first(where: { nodes[$0].children != .whole }) {
    return refuse(.partlyRecorded, kind, row: rowIndex, blame: partial, reason: nodes[partial].children.rawValue)
  }
  if let why = overlayIdentityRefusal(row, shift: shift, reads: reads) { return refuse(why, kind, row: rowIndex, blame: rowIndex) }
  return .deliver(OverlayTarget(kind: kind, window: window, by: by, row: row, shift: shift))
}

/// The containers whose child on the chain is the row (ruling 1082).
let overlayRowContainerRoles: Set<String> = ["AXList", "AXGrid"]

/// The meta's `overlayClick` (#453, value-free): the overlay's window, the signal #452 found it by and its kind; then
/// either the route that carried the click (`route: "action"`, set once the AXPress is dispatched) and whether its effect
/// was seen (`confirmed`), with the AXError of a press that was not success, the reads and the milliseconds from the
/// press's return to the last read; or why #452's refusal stood (`refused`).
struct OverlayClickRecord: Equatable {
  let window: CGWindowID
  let by: AppWindowSignal
  var kind: OverlayKind?
  var refused: OverlayRefusal?
  var note = OverlayNote()
  var pressed = false
  var confirmed: Bool?
  var actionError: Int32?
  var polls = 0
  var ms: Double?

  var wire: [String: Any] {
    var wire: [String: Any] = ["window": Int(window), "by": by.rawValue]
    if let kind { wire["kind"] = kind.rawValue }
    if let refused { wire["refused"] = refused.rawValue }
    if let row = note.row { wire["row"] = row.wire }
    if let refusedBy = note.refusedBy { wire["refusedBy"] = ["role": refusedBy.role, "reason": refusedBy.reason] }
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
/// deliver: `prepare` (the request's deadline, the row's process checked and registered, the in-flight check), the
/// identity read again, `beforePress` (the deadline and the in-flight check again, after those reads), `announce` (the
/// agent cursor's click, once every check has passed), then AXPress on the recorded handle (`perform`; a messaging timeout is `clickUnconfirmed`, whatever
/// the window does after it, and any other error `actionFailed`), then the overlay's window (`windowShown`, nil when the list does not read: unknown, never closed) read at once and every
/// `overlaySampleMs` for up to `overlayConfirmMs`: the window gone answers true; otherwise `clickUnconfirmed`. No mouse event is posted and the app is not activated on any branch.
func overlayClick<Element>(_ decision: OverlayPoint<Element>, app: String, reads: OverlayReads<Element>,
                           windowShown: (CGWindowID) -> Bool?, now: () -> Double, sleep: (Double) -> Void,
                           prepare: (Element) throws -> Void, beforePress: () throws -> Void, announce: () -> Void = {},
                           perform: (Element, String) -> AXError, meta: inout InputMeta) throws -> Bool {
  switch decision {
  case .notOverlay: return false
  case .refuse(let why, let kind, let window, let by, let note):
    meta.overlayClick = OverlayClickRecord(window: window, by: by, kind: kind, refused: why, note: note)
    return false
  case .deliver(let target):
    meta.inputRoute = .action
    var record = OverlayClickRecord(window: target.window, by: target.by, kind: target.kind, note: OverlayNote(row: OverlayNodeNote(target.row)))
    defer { meta.overlayClick = record }
    let row = target.row.element
    try prepare(row)
    // The identity once more, after the owner's preparation and just before the press: a row relabelled, moved or
    // disabled meanwhile is not pressed, and #452's refusal stands.
    if let why = overlayIdentityRefusal(target.row, shift: target.shift, reads: reads) {
      record.refused = why
      record.note.refusedBy = (target.row.role, why.rawValue)
      return false
    }
    // The request's deadline and the person's input once more, after those reads (the review of c8858c2a..e7e78424,
    // P1): an expired request or an intervention during them sends nothing. Only then the cursor's click (P3).
    try beforePress()
    announce()
    record.pressed = true
    var error = AXError.failure
    meta.posting { error = perform(row, "AXPress"); return true }
    if error != .success {
      record.actionError = error.rawValue
      record.confirmed = false
      // A messaging timeout (ruling 1072): the press may have landed, but the window leaving cannot be tied to it.
      guard menuItemAmbiguousErrors.contains(error) else {
        throw EngineError(name: "actionFailed", "The element did not accept the AXPress action.")
      }
      throw overlayClickUnconfirmed(app: app)
    }
    let started = now()
    while true {
      record.polls += 1
      // Only the overlay's window leaving confirms: a row that dies while its window stays (a list rebuilding its rows)
      // shows nothing taken.
      let closed = windowShown(target.window) == false
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
    let screenshot = context.connection.observedScreenshot(app: app)
    let record = OverlayRecord<AXUIElement>(nodes: screenshot?.nodes ?? [], windows: screenshot?.windowsListed,
                                            observedWindow: screenshot?.windowNumber, pid: appPid)
    let decision = signposted("click.overlay") {
      overlayPoint(verdict, answered: answered, record: record, shift: shift, chromium: webAccessibility.pageEngine(app.appPath) == .chromium,
                   reads: reads)
    }
    return try armingSettle(&meta, acted: { context.connection.markActed(app) }) { meta in
      try overlayClick(decision, app: app.displayName, reads: reads, windowShown: { number in onScreenWindowIDs().map { $0.contains(number) } },
                       now: monotonicMilliseconds, sleep: { usleep(UInt32(max(0, $0) * 1000)) }, prepare: { [self] row in
        if unixMilliseconds() >= context.deadline { throw overlayDeadlinePassed }
        let owner = ownerPid(of: row, fallback: appPid)
        try refuseForbiddenOwner(owner)
        actionTargets(owner, app: app, connection: context.connection)
        try guarding.checkInFlight()
      }, beforePress: {
        if unixMilliseconds() >= context.deadline { throw overlayDeadlinePassed }
        try guarding.checkInFlight()
      }, announce: { [self] in
        cursor.act(connection: context.connection.id, app: app.key, window: observedWindow, .click(point))
      }, perform: { gatedPerform($0, $1) }, meta: &meta)
    }
  }
}
