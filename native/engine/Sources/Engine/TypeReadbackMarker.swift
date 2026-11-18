import ApplicationServices
import Foundation

// type_text's focused field in background Safari by WebKit's text-marker route (#395; the design session's ruling
// 1ea561bc:824 under ruling 811, the native engine spec's Decision Log, the #395 entry). Background Safari answers no
// AXFocusedUIElement at the application, the window or the web area, and #354's walk (TypeReadback.swift,
// `readbackFocusedByWalk`) claims nothing on a page larger than its bounds. The probe (`probe/395-marker`, runs
// 44296356927 and 44297805982) found the field 20 of 20 on such a page by the web area's selection: its
// AXSelectedTextMarkerRange, that range's start marker, AXUIElementForTextMarker on the web area (an AXStaticText),
// and one AXParent (the AXTextField or AXSecureTextField). It also found that the marker is position-bearing: 28 bytes
// holding the caret's character offset as a plain LE32 word, for a password field too (all 60 secure rows resolved to
// the field, the start at the true caret, usually its length). So, by the ruling:
// - The marker is never inspected: the start marker goes from the range straight into AXUIElementForTextMarker as its
//   argument and is released (`readbackMarkedElement`, the only code that holds one). Nothing parses it, reads its bytes
//   or length, derives an offset from it, passes it or the range to any other parameterized attribute, keeps it past
//   the call, compares, logs or emits it. The end marker is not used: its copy is not even resolved.
// - Every element the route meets is classified before anything else is read from it, by role and subrole in one
//   request, failing closed as #405's `valueClassification` does: a closed one ends the lookup, refused unread with the
//   reason main's snapshot gives such a focused element (`.refused(.secure)` for a secure element that is not a field,
//   `.refused(.roleUnreadable)` for an unreadable role), nothing more read from it. A password field (#414,
//   `readbackPasswordField`'s rule) is a field, claimed as a text field is and carried as a password field, and the
//   snapshot then reads its length alone, never its value (TypeReadbackLength.swift); one whose own role and subrole
//   the snapshot then reads as no password field (a show-password toggle in between) is refused `noLongerSecure`,
//   nothing more read. The web area
//   is searched for among the app's own elements alone, another process's skipped unread, and must classify open as an
//   AXWebArea before its marker is read (else no claim: it is not the field); each ancestor the claim's scope climb
//   passes is checked to be the app's.
// - The route resolves the field before the first event, and no marker call follows any delivered text: after typing,
//   the field it found is asked itself (`readbackStillFocused`), the same element reading AXFocused true.
// - It runs only for Safari (`readbackMarkerRoute`), and only once the application's AXFocusedUIElement has answered no
//   focused element (noValue or attributeUnsupported); a read of it that failed goes to the walk alone, as on main. The
//   walk still runs when the route claims nothing.

/// The bundle the route runs for: Safari, the provider whose marker answers the probe measured (Safari 27.2).
let typeReadbackMarkerBundle = "com.apple.Safari"
/// The AXParent hops from the element the marker names up to its field: the probe's 20 of 20 took one (an AXStaticText
/// under the AXTextField); a few more allow a contenteditable's line inside its text area.
let typeReadbackMarkerFieldHops = 4
/// The AXParent hops from the field up to the web area its marker came from, past which the field is not shown to lie
/// under it and is not claimed: a form's nesting, far more than the probe page's 2 and the walk's 6 below the web area.
let typeReadbackMarkerScopeHops = 24

/// Whether the text-marker route runs for a process with this bundle identifier: Safari's, exactly.
func readbackMarkerRoute(bundleIdentifier: String?) -> Bool { bundleIdentifier == typeReadbackMarkerBundle }

/// The marker functions HIServices exports privately, resolved with dlsym (nil when one is absent, and the route is then
/// never taken): the two type identifiers, which check what a reply holds before it is used, and the range's start
/// marker. Nothing that reads a marker's bytes or length, and not the end marker's copy, is resolved.
struct ReadbackMarkerSymbols: @unchecked Sendable {  // immutable; the live closure calls a C function
  let rangeTypeID: CFTypeID
  let markerTypeID: CFTypeID
  /// AXTextMarkerRangeCopyStartMarker: the range's start marker, owned by the caller.
  let copyStart: (CFTypeRef) -> CFTypeRef?

  private typealias TypeID = @convention(c) () -> CFTypeID
  private typealias CopyStart = @convention(c) (CFTypeRef) -> Unmanaged<CFTypeRef>?

  static let live: ReadbackMarkerSymbols? = {
    let process = UnsafeMutableRawPointer(bitPattern: -2)  // RTLD_DEFAULT: HIServices is loaded with ApplicationServices
    guard let range = dlsym(process, "AXTextMarkerRangeGetTypeID"), let marker = dlsym(process, "AXTextMarkerGetTypeID"),
          let start = dlsym(process, "AXTextMarkerRangeCopyStartMarker") else { return nil }
    let rangeType = unsafeBitCast(range, to: TypeID.self)(), markerType = unsafeBitCast(marker, to: TypeID.self)()
    guard rangeType != 0, markerType != 0, rangeType != markerType else { return nil }
    let copy = unsafeBitCast(start, to: CopyStart.self)
    return ReadbackMarkerSymbols(rangeTypeID: rangeType, markerTypeID: markerType, copyStart: { copy($0)?.takeRetainedValue() })
  }()
}

/// The Accessibility calls the live read-back makes (`ReadbackReads.live`), each with its error: the real ones, or a stub
/// in the tests, which put a web area and its marker behind them.
struct ReadbackAX {
  var copy: (AXUIElement, String) -> (value: CFTypeRef?, error: AXError) = copyAttribute
  var copyParameterized: (AXUIElement, String, CFTypeRef) -> (value: CFTypeRef?, error: AXError) = { element, name, parameter in
    var value: CFTypeRef?
    let error = AXUIElementCopyParameterizedAttributeValue(element, name as CFString, parameter, &value)
    return (error == .success ? value : nil, error)
  }
  /// One AXUIElementCopyMultipleAttributeValues, under the element's own messaging timeout.
  var batch: (AXUIElement, [String]) -> AttributeRead? = fetchAttributesAsTimed
  var pid: (AXUIElement) -> pid_t = { ownerPid(of: $0, fallback: 0) }
  var markers: ReadbackMarkerSymbols? = .live
  /// An element's messaging timeout, in seconds, as a bounded read sets it (#414; the review of 1f69470e..f217f062).
  var setTimeout: (AXUIElement, Float) -> Void = { AXUIElementSetMessagingTimeout($0, $1) }
}

/// The element WebKit's text marker names on `webArea`: the web area's AXSelectedTextMarkerRange, checked to be a range;
/// its start marker, checked to be a marker; and AXUIElementForTextMarker on the web area with that marker as its only
/// argument, checked to be an element. The range and the marker exist only inside this function and are released when it
/// returns. Nil when the symbols are absent or any step answers an error or anything else.
func readbackMarkedElement(_ webArea: AXUIElement, ax: ReadbackAX) -> AXUIElement? {
  guard let symbols = ax.markers else { return nil }
  let range = ax.copy(webArea, "AXSelectedTextMarkerRange")
  guard range.error == .success, let selection = range.value, CFGetTypeID(selection) == symbols.rangeTypeID,
        let start = symbols.copyStart(selection), CFGetTypeID(start) == symbols.markerTypeID else { return nil }
  let named = ax.copyParameterized(webArea, "AXUIElementForTextMarker", start)
  guard named.error == .success, let element = named.value, CFGetTypeID(element) == AXUIElementGetTypeID() else { return nil }
  return (element as! AXUIElement)
}

/// An element as one classification-only request reads it (#405's `classifyingAttributes` and `valueClassification`):
/// closed, with the reason the snapshot gives such a focused element (a role that cannot be read `roleUnreadable`; any
/// other closed element that is not a password field `secure`); a password field (#414: secure, with a field's role, as
/// `readbackPasswordField` has it), by its role; else its role.
enum ReadbackClass: Equatable {
  case closed(TypeReadbackReason)
  case password(String)
  case open(String)
}

/// A classification request's answer as `ReadbackClass`: a failed request reads no role, so it is `roleUnreadable`.
func readbackClass(_ read: AttributeRead?) -> ReadbackClass {
  guard let read, let role = readbackBatchRole(read) else { return .closed(.roleUnreadable) }
  let classification = valueClassification(read)
  guard classification.closed else { return .open(role) }
  return classification.secure && typeReadbackFocusWalkRoles.contains(role) ? .password(role) : .closed(.secure)
}

/// The route's reads, live or faked: the element the web area's marker names (`readbackMarkedElement`), an element's
/// classification, its AXParent and AXFocused, whether the app's process serves it, and element identity.
struct ReadbackMarkerReads<Element> {
  var marked: (Element) -> Element?
  var classify: (Element) -> ReadbackClass
  var parent: (Element) -> ReadbackWalkRead<Element>
  var isFocused: (Element) -> ReadbackWalkRead<Bool>
  var owned: (Element) -> Bool
  var same: (Element, Element) -> Bool
}

/// The field the marker route finds in `window`, or nil for no claim (the walk then runs). Its web area is the first
/// one the walk's reads find among the app's own elements (`readbackWebArea`, which checks each, the web area too), and
/// its marker is read only once it classifies open as an AXWebArea; else no claim, since the web area is not the field.
/// From the element its marker names, each element is checked to be the app's, then classified: closed ends the lookup,
/// refused unread with main's reason (`.closed`); a text-entry role, or a password field (#414, claimed with `password`
/// set, which the snapshot holds it to), is the field; the web area, reached first, is no
/// field; any other role (the AXStaticText) is climbed by one AXParent, at most `typeReadbackMarkerFieldHops`. The field
/// is claimed only when it reads AXFocused true and lies under that web area (`readbackUnder`).
func readbackMarkedField<Element>(window: Element, walk: ReadbackFocusWalk<Element>, marker: ReadbackMarkerReads<Element>) -> ReadbackFound<Element>? {
  guard let webArea = readbackWebArea(window, walk, owned: marker.owned), marker.classify(webArea) == .open("AXWebArea"),
        var element = marker.marked(webArea) else { return nil }
  var hops = 0
  while true {
    guard marker.owned(element) else { return nil }
    switch marker.classify(element) {
    case .closed(let reason): return .closed(reason)
    case .password:
      guard case .value(true) = marker.isFocused(element), readbackUnder(element, webArea, marker) else { return nil }
      return .field(element, by: .marker, password: true)
    case .open(let role) where typeReadbackTextRoles.contains(role):
      guard case .value(true) = marker.isFocused(element), readbackUnder(element, webArea, marker) else { return nil }
      return .field(element, by: .marker)
    case .open(let role) where role == "AXWebArea": return nil
    case .open:
      guard hops < typeReadbackMarkerFieldHops, case .value(let parent) = marker.parent(element) else { return nil }
      hops += 1
      element = parent
    }
  }
}

/// Whether `element`'s AXParent chain reaches `webArea` within `typeReadbackMarkerScopeHops`, each parent checked to be
/// the app's before it is compared or climbed; a failed or absent parent, or another process's, before it is no.
func readbackUnder<Element>(_ element: Element, _ webArea: Element, _ marker: ReadbackMarkerReads<Element>) -> Bool {
  var current = element
  for _ in 0..<typeReadbackMarkerScopeHops {
    guard case .value(let parent) = marker.parent(current), marker.owned(parent) else { return false }
    if marker.same(parent, webArea) { return true }
    current = parent
  }
  return false
}

/// The primary window's web area: the first AXWebArea breadth first among the app's own elements, within the walk's
/// bounds (the probe's path took 28 nodes at depth 6). An element `owned` rejects, the window included, is skipped: its
/// role is not read, it is never the web area and its children are never followed, so another process cannot choose the
/// page whose marker is read (the probe's `tree()` visited only the app's elements). An element with a text-entry role
/// is a leaf, its children never read, as in the walk; a read that fails, or a search past the node or time bound, finds
/// none.
func readbackWebArea<Element>(_ window: Element, _ walk: ReadbackFocusWalk<Element>, owned: (Element) -> Bool) -> Element? {
  let started = walk.now()
  var queue: [(element: Element, depth: Int)] = [(window, 0)]
  var index = 0
  while index < queue.count {
    if index >= typeReadbackFocusWalkNodes || walk.now() - started > typeReadbackFocusWalkMs { return nil }
    let (element, depth) = queue[index]
    index += 1
    guard owned(element) else { continue }
    switch walk.role(element) {
    case .failed: return nil
    case .value(let role) where role == "AXWebArea": return element
    case .value(let role) where typeReadbackFocusWalkRoles.contains(role): continue
    case .value, .absent: break
    }
    guard depth < typeReadbackFocusWalkDepth else { continue }
    switch walk.children(element) {
    case .failed: return nil
    case .absent: break
    case .value(let children): queue += children.map { ($0, depth + 1) }
    }
  }
  return nil
}

/// After an event, whether `field` is still the field typed keys reach, never through the marker (ruling 1ea561bc:824):
/// a field the application's focus or the walk found is looked up again that way (`again`, which takes no marker route)
/// and must be the same element; one the marker route found is asked itself, the same element, and must read AXFocused
/// true. Neither reads anything that depends on what was typed, so a concealed request makes the same reads.
///
/// Only a positive answer is a moved focus (#414; the review of f217f062..45172367, from the hosted runs on 45172367):
/// another element named, no element found by a lookup that finished, or AXFocused false or absent. A check that could
/// not finish (`unfinished`: a call not sent for lack of time, one that timed out, a walk left unfinished) is unknown.
func readbackStillFocused<Element>(_ field: Element, found lookup: ReadbackLookup, again: () -> Element?,
                                   isFocused: (Element) -> ReadbackWalkRead<Bool>, same: (Element, Element) -> Bool,
                                   unfinished: () -> Bool) -> ReadbackFocus {
  switch lookup {
  case .focus:
    if let again = again() { return same(again, field) ? .focused : .moved }
    return unfinished() ? .unknown : .moved
  case .marker:
    switch isFocused(field) {
    case .value(true): return .focused
    case .failed where unfinished(): return .unknown
    case .value(false), .absent, .failed: return .moved
    }
  }
}

/// What a focus check found (`readbackStillFocused`): the field still the focus, the focus moved, or not known.
enum ReadbackFocus: Equatable { case focused, moved, unknown }
