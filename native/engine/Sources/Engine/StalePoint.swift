import ApplicationServices
import CoreGraphics
import Foundation

// The stale-point guard (#296; the spec's Decision Log, the #296 entry). A coordinate is placed in the connection's last
// screenshot of the app (Screenshot.swift), and an app may re-lay out after it: #294's spike measured Chrome for
// Testing's toolbar moving Reload 36 pt right 18-20 s after launch, so a click at the screenshot's Reload point landed on
// the disabled Forward button and answered success. So every observation that returns a screenshot records, with it, each
// tree node's frame, role, subrole, title and description, and an AXStaticText's value (`ScreenshotNode`), and a
// coordinate pointer action, before anything is posted, takes the deepest recorded node whose shown frame holds the
// point and checks that it is still there: the same
// handle, or a handle re-created in place (the same role, a frame within 2 pt, and the same title, or description where
// neither has a title, whenever both sides can be read; and, #431, only where the record covered the node's region whole
// and holds no other element the match could have taken for it, `recreatedRefused`). It refuses, with nothing posted,
// when that node is gone, when
// its frame read now no longer holds the point, or when the hit-test at the point now answers another interactive
// element that is not itself a recorded node the screenshot showed at the point (#305, `recordedHitAtPoint`); any other
// hit inside a node still in place (its label's text, a group) passes. The vendor posts at the point
// blindly. Where #282 element-routes the pointer (the design session's ruling 1ea561bc ca82a6f4, reversing the first
// build's skip), a refused point is refused before anything is pressed, and a kept one's route presses only the recorded
// node or its control, the guard run again after any wait of the route's (`StalePointGate`). #316 adds two rules (the
// design session's ruling 4701abd8): before the tree is read, a window of the app's at layer 0 above the screenshot's
// window that the screenshot's window list did not hold refuses (`newWindowAbove`: Safari's address-field overlay, which
// swallows the next click anywhere in the page), and a recorded node inside an AXWebArea requires the hit inside that
// same web area (`otherWebArea`: Chrome keeps answering the page a tab has left, and Firefox's urlbar list lies over the
// page). #330 adds rule dL (the design session's ruling 11bec0ed): in a web area, a point the rest keeps refuses when the
// hit lies in an element the record lacks, under a parent the record holds with every child and that lists it now
// (`newElementOverPoint`: a page's own suggestion list over the control). #298 adds rule `relabelled` (the design
// session's ruling 31a62775): a node found by its own handle, its frame still holding the point, refuses when its label's
// words changed (`relabelledLabel`, `stalePointLabelWords`: Save to Delete on one element, while a count or a ticking
// time passes), and the re-created match compares an AXStaticText's value by the same words; the text of an editable
// region the model types into is exempt (`editedInPlace`, ruling 1ea561bc:553). #433: a point kept at an inert layer (a
// node that does not act on its own, with no acting ancestor in its document: a transparent overlay), with a hit that
// names no interactive element, is judged again at the recorded control beneath it (`underlyingTarget`), which a click
// passes through to: gone with no re-created handle #431 accepts, moved off the point, or relabelled, it refuses. #443:
// an inert node kept on its own handle whose recorded control is confirmed destroyed, and which lies in another control
// now, refuses (`controlGoneVerdict`: a decoration moved from a replaced link into its replacement). #442 (ruling 1073): a
// point kept through #433's check or past a non-interactive hit is judged by the control the corrected hit lies in (on
// Chromium, the point hit-tested again after `stalePointCorrectionMs`, through #452's window check); a known control
// that moved over the point refuses (`otherControlOnTopVerdict`, ruling 1078: a button slid over an unchanged link under
// a veil), and anything unread, unrecorded or inconclusive keeps. #452
// (design ruling 928, narrowed by the qualification's measurements): the pointer's events are posted to the app's process
// stamped with the observed window (Mouse.swift `stampWindow`), so the app delivers them to that window whatever lies over
// it; a point the app's own hit-test answers in another of its windows (Chrome's omnibox popup, its `<datalist>` popup, a
// permission bubble), or in a popover over the observed one (`PointHitPlace`, `appWindowOverPoint`), refuses before the
// tree is read; #453 carries a plain left click so refused on a row of one of four overlays by the recorded row's
// AXPress instead (OverlayClick.swift). Everything here reads through closures, so the rule is unit-tested over a fake tree.

/// One node of the tree an observation with a screenshot walked, as the screenshot showed it.
struct ScreenshotNode<Element> {
  let element: Element
  let role: String
  let title: String?
  let description: String?
  /// Its subrole, which #298's rule `relabelled` reads to leave Chrome's tab (AXTabButton) uncompared.
  let subrole: String?
  /// An AXStaticText's value (`screenshotLabelValue`): its label when it has no title or description (#298); nil for
  /// every other role.
  let value: String?
  /// For an AXStaticText, the editable region it lay in at the observation (`screenshotNodes`), derived from what the
  /// walk already read (the design session's ruling 1ea561bc:565): its nearest recorded ancestor of an editable text
  /// role (`stalePointEditableTextRoles`). #298's edited-text exemption (ruling 1ea561bc:553) checks at the click that
  /// the text's AXEditableAncestor, read then, names it. Nil otherwise.
  let editableAncestor: Element?
  /// Its label's attributes whose read failed at the observation, so the label read then is unknown past them (#298).
  let labelsUnread: Set<StalePointLabelPart>
  /// Its AX frame at the observation, in global screen points (top-left origin), as coordinate clicks are posted.
  let frame: CGRect
  /// The part of the frame its clipping ancestors left showing (`visibleFrame`'s rule over the recorded tree): what the
  /// choice of the node under a point tests, so a row scrolled out of its list, or page content scrolled under the
  /// toolbar, is never taken for what the screenshot showed there.
  let shown: CGRect?
  let depth: Int
  /// Whether the walk recorded every child of the element (no width cut, depth cap, budget or deadline, failed read), and
  /// every child of each frameless descendant it reaches only through frameless ones (those are never chosen at a point,
  /// so what they lack is the nearest framed ancestor's): only then can an interactive element inside it that the record
  /// lacks be taken for new.
  let subtreeRecorded: Bool
  /// Whether it is framed as a strip (1 pt or less either way) and the record lacks some of its children (#301): a
  /// collapsed container's, whose children show outside its frame, or a clipping strip's, whose do not. The record cannot
  /// tell the two apart, so only the live hit can: a hit whose ancestors pass through such a node lies in its unrecorded
  /// interior (`stalePointVerdict`), and anywhere else the strip changes nothing.
  var thinGap = false
  /// The `thinGap` strips in its recorded subtree, itself included: the only ones a hit at a point it is chosen for may
  /// pass through and be kept, so a strip elsewhere (beside it, or above it in the tree) never stands behind a new
  /// control covering it.
  var gapsBelow: [Element] = []
  /// The index in the record of its nearest recorded (framed) ancestor, frameless ones passed through (#305's rule 3).
  var ancestor: Int?
  /// The nearest AXWebArea at or above it in the record, frameless ones included (#316's rule G): the document the
  /// screenshot showed it in, which a hit at its point must still lie in.
  var webArea: Element?
  /// Its control in the record (#431): its nearest ancestor, frameless ones included, of `stalePointInteractiveRoles` or
  /// whose actions include AXPress, below its web area, window, sheet or application (`stalePointControlStops`); nil when
  /// it has none (`recreatedRefused`: a recorded element under the same control is no other control, and a re-created
  /// handle lies inside the control while it lives).
  var control: Element?
  /// Whether an ancestor nearer than its control (or than its stop, where it has none) had its action names fail to read
  /// at the observation, so its control is unknown, never taken for inert (the review of main..3ece1a1a, finding 4): no
  /// re-created match is taken for it.
  /// That control's role (#431's review, finding 1): a node whose control is gone is re-created only under a control of
  /// the same role, never a link's text under a button.
  var controlRole: String?
  var controlUnknown = false
  /// Whether its role failed to read at the observation (recorded as AXUnknown; #431's review of 849bcdad, finding 6):
  /// it may be of any role, so it counts as a twin of any node (`recreatedRefused`).
  var roleUnknown = false
  /// Whether it acts on its own (an interactive role or AXPress); nil when its role or action names failed to read
  /// (#431's review of 849bcdad, finding 1): only inert content of a node's own control is exempt from its twins.
  var actionable: Bool? = false
  /// Whether the walk recorded its region whole (#431, the design session's ruling 889): every element of the recorded
  /// subtree of its nearest web area (else of the record's root), its AXChildren read and each child it listed in the
  /// record by handle (`screenshotNodes`' `key`). Judged on the node's own ancestors at the observation, so a container
  /// re-created since never moves the judgement to a complete ancestor; a twin from past the node cap, below the depth
  /// cap or outside the width rule's visible subset leaves it uncovered.
  var regionCovered = false
  /// Whether an ancestor of it in the record, framed or frameless, below its web area, window, sheet or application
  /// (`stalePointControlStops`, so an iframe's document starts afresh), acts on its own (an interactive role or AXPress,
  /// read): #433 judges the control beneath only a node with none, an inert layer, never content of a control.
  var controlAbove = false
  /// Whether its action names, read, included AXPress, whatever its role read (#433's review of 17942ad7, item 2:
  /// `actionable` is nil for a role unread, as #431 needs); a node that recorded AXPress is never an inert layer.
  var pressRecorded = false
  /// #453 (ruling 1082): whether the walk read its AXChildren (or found the attribute absent: a leaf) and recorded every
  /// child it listed (`ScreenshotChildren`), by handle where the listed children are known, else by their count.
  var children: ScreenshotChildren = .whole
  /// #453 (ruling 1083): whether its recorded parent is itself framed, so `ancestor` names its direct parent (no
  /// frameless element recorded between them).
  var parentFramed = false
}

/// What the record holds of a node's own children (#453, ruling 1082).
enum ScreenshotChildren: String, Equatable {
  /// Read (or absent: a leaf), and every one recorded.
  case whole
  /// The AXChildren read failed with an error other than the attribute's absence: unknown.
  case unread = "childrenUnread"
  /// Read, but some child it listed is not in the record (a width cut, the depth cap, the budget or deadline).
  case notAllRecorded = "childrenNotRecorded"
}

/// What an element offers its recorded descendants as their control (`screenshotNodes`, #431).
enum ControlOffer<Element> {
  case control(Element, role: String)
  case unknown
  var element: Element? { if case .control(let element, _) = self { return element } else { return nil } }
  var role: String? { if case .control(_, let role) = self { return role } else { return nil } }
  var unknown: Bool { if case .unknown = self { return true } else { return false } }
}

/// One element as the walk emitted it, for the record (`screenshotNodes`): its lineage number and its parent's.
struct ScreenshotNodeRead<Element> {
  let element: Element
  let number: Int
  let parent: Int?
  let depth: Int
  let role: String
  let title: String?
  let description: String?
  let frame: CGRect?
  let actions: [String]
  let childCount: Int
  /// The elements its AXChildren listed (`ElementData.children`), whose membership in the record says whether the walk
  /// recorded them all (the review of main..3ece1a1a, finding 5: the width rule's visible subset can hold others than
  /// AXChildren lists); nil where only their count is known.
  var children: [Element]? = nil
  /// Whether its action names were read (the review's finding 4): a failed read leaves `actions` empty, and the element
  /// not known to be inert.
  var actionsRead = true
  /// Whether its AXRole read (#431's review of 849bcdad, finding 6): a failed read decodes as AXUnknown.
  var roleRead = true
  /// Whether the walk read its AXChildren (`ElementData.childrenRead`): a failed read counts no children, so with it
  /// unread the record cannot say whether it holds them all (#330's rule dL).
  var childrenRead = true
  /// #453 (ruling 1082): its AXChildren absent, not failed (`ElementData.childrenLeaf`): a leaf, its children all known.
  var childrenLeaf = false
  /// Its AXSubrole, and an AXStaticText's value (`screenshotLabelValue`), for #298's rule `relabelled`.
  var subrole: String? = nil
  var value: String? = nil
  /// The label's attributes whose read failed at the observation (`screenshotLabelsUnread`): an error, not their absence.
  var labelsUnread: Set<StalePointLabelPart> = []
}

/// The attributes a node's label (#298's `stalePointLabel`) is taken from, in priority order: the title, the
/// description, and an AXStaticText's value.
enum StalePointLabelPart: CaseIterable, Hashable {
  case title, description, value
  var attribute: String {
    switch self {
    case .title: return kAXTitleAttribute
    case .description: return kAXDescriptionAttribute
    case .value: return kAXValueAttribute
    }
  }
}

/// One label attribute read now (the review of 7f6eb3dc..b2f00ad5, P2 2): its text, nil when the element lacks it (an
/// absent attribute, or a value that is no text), or unreadable (any other error), which the label must not fall past.
enum StalePointLabelRead: Equatable { case text(String?), unreadable }

/// The label attributes the record keeps as unreadable, from the walk's failed reads (`ElementData.unreadable`): the
/// title and the description, and the value of an AXStaticText only (no other role's value is its label).
func screenshotLabelsUnread(role: String, _ unreadable: Set<String>) -> Set<StalePointLabelPart> {
  Set(StalePointLabelPart.allCases.filter { unreadable.contains($0.attribute) && ($0 != .value || role == "AXStaticText") })
}

/// A label attribute's single read now (`copyAttribute`'s value and error) as `StalePointLabelRead`: a string or an
/// attributed string's text; nothing for kAXErrorNoValue, kAXErrorAttributeUnsupported or a value that is no text;
/// unreadable for any other error.
func stalePointLabelRead(_ value: CFTypeRef?, _ error: AXError) -> StalePointLabelRead {
  switch error {
  case .success: return .text(value.flatMap(labelText))
  case .noValue, .attributeUnsupported: return .text(nil)
  default: return .unreadable
  }
}

/// The value the record keeps of an element (#298): an AXStaticText's, as the walk read it (a string, or an attributed
/// string's text), cut by `bounded` as its labels are; nil for every other role, whose value (a field's text, a
/// checkbox's state) is not its label.
func screenshotLabelValue(role: String, _ value: CFTypeRef?) -> String? {
  guard role == "AXStaticText", let value else { return nil }
  return labelText(value).map(bounded)
}

/// The record of a walk's window tree (`reads` in the walk's preorder, parents before their children): each node with a
/// frame, its shown part cut by every clipping ancestor (a scroll area, a web area, a group that scrolls by the page, a
/// sheet, menu or popover, the window; a window, sheet, menu or popover starts the cut again at its own frame, as the
/// vendor's visible-frame walk stops there; one whose frame is unplaced, `unplacedFrame`, cuts nothing, #312), whether all its children were recorded (a frameless node's unrecorded
/// children counting against its nearest framed ancestor), and whether it is a strip whose children the record lacks
/// (`thinGap`), and whether the walk recorded its region whole (`regionCovered`, #431): `key` identifies an element's
/// handle, by which each child an element's AXChildren listed is looked for in the record; without it only their count
/// is compared.
func screenshotNodes<Element>(_ reads: [ScreenshotNodeRead<Element>], key: ((Element) -> AnyHashable)? = nil) -> [ScreenshotNode<Element>] {
  screenshotRecord(reads, key: key).nodes
}

/// The record (`screenshotNodes`) with the walk's frameless elements beside it (#435): each read as a framed node is,
/// its role, labels, web area and control known, its frame `CGRect.null` and nothing shown, so it is never chosen at a
/// point or matched in place. Only #431's twin search (`recreatedRefused`) reads them: a twin recorded without a frame
/// that gains one at the removed node's place is the twin a framed one is.
func screenshotRecord<Element>(_ reads: [ScreenshotNodeRead<Element>], key: ((Element) -> AnyHashable)? = nil)
  -> (nodes: [ScreenshotNode<Element>], frameless: [ScreenshotNode<Element>]) {
  var recordedChildren: [Int: Int] = [:]
  for read in reads { if let parent = read.parent { recordedChildren[parent, default: 0] += 1 } }
  let members = key.map { key in Set(reads.map { key($0.element) }) }
  /// #453 (ruling 1083): each read's recorded children by handle, along the record's own parent edges: a child listed by
  /// one element and recorded under another is not recorded for the first.
  let childrenByParent: [Int: Set<AnyHashable>]? = key.map { key in
    var byParent: [Int: Set<AnyHashable>] = [:]
    for read in reads { if let parent = read.parent { byParent[parent, default: []].insert(key(read.element)) } }
    return byParent
  }
  // Children come after their parents, so a backward pass sees a node's whole subtree before the node.
  var incomplete: Set<Int> = []
  /// The reads whose recorded subtree is not whole (#431's `regionCovered`): one of them, or one below, read no
  /// AXChildren, or lacks in the record a child it listed. Judged by handle where the listed children are known (the
  /// review of main..849bcdad, finding 9: Chromium lists a cell under its row and its column, and the walk records it
  /// once), else by their count.
  var broken: Set<Int> = []
  var gapsBelow: [Int: [Element]] = [:]
  /// Each read's own children as the record holds them (#453).
  var ownChildren: [Int: ScreenshotChildren] = [:]
  func thin(_ frame: CGRect) -> Bool { frame.width <= 1 || frame.height <= 1 }
  for read in reads.reversed() {
    let listedRecorded: Bool
    if let members, let key, let children = read.children {
      listedRecorded = children.allSatisfy { members.contains(key($0)) }
    } else {
      listedRecorded = (recordedChildren[read.number] ?? 0) >= read.childCount
    }
    let ownRecorded: Bool
    if let childrenByParent, let key, let children = read.children {
      let recordedHere = childrenByParent[read.number] ?? []
      ownRecorded = children.allSatisfy { recordedHere.contains(key($0)) }
    } else {
      ownRecorded = (recordedChildren[read.number] ?? 0) >= read.childCount
    }
    ownChildren[read.number] = read.childrenLeaf ? .whole : !read.childrenRead ? .unread : ownRecorded ? .whole : .notAllRecorded
    if !read.childrenRead || !listedRecorded { broken.insert(read.number) }
    if broken.contains(read.number), let parent = read.parent { broken.insert(parent) }
    if (recordedChildren[read.number] ?? 0) < read.childCount { incomplete.insert(read.number) }
    if read.frame == nil, incomplete.contains(read.number), let parent = read.parent { incomplete.insert(parent) }
    if let frame = read.frame, thin(frame), incomplete.contains(read.number) { gapsBelow[read.number, default: []].append(read.element) }
    if let parent = read.parent, let below = gapsBelow[read.number] { gapsBelow[parent, default: []].append(contentsOf: below) }
  }
  /// What each node leaves showing to its descendants: nil for no cut, `.null` for nothing.
  var bounds: [Int: CGRect?] = [:]
  /// Each read's nearest framed node at or above it, by its index in `nodes`.
  var framed: [Int: Int] = [:]
  /// Each read's nearest AXWebArea at or above it (#316).
  var webAreas: [Int: Element] = [:]
  /// The editable region each read lies in (#298): itself when its role is an editable text role, else its parent's.
  var regions: [Int: Element] = [:]
  /// What each read offers its descendants as their control (#431): itself when it is one, unknown when its action names
  /// did not read, else its parent's offer; nothing past a control stop.
  var controls: [Int: ControlOffer<Element>] = [:]
  /// The reads that are, or lie below, an element acting on its own, below their document (#433's `controlAbove`).
  var owned: Set<Int> = []
  /// Each read's region (#431): its nearest AXWebArea at or above it, else the record's root, by number.
  var regionRoots: [Int: Int] = [:]
  var nodes: [ScreenshotNode<Element>] = []
  nodes.reserveCapacity(reads.count)
  /// The reads recorded with a frame (#453's `parentFramed`).
  var framedReads: Set<Int> = []
  var frameless: [ScreenshotNode<Element>] = []
  for read in reads {
    let webArea = read.role == "AXWebArea" ? read.element : read.parent.flatMap { webAreas[$0] }
    if let webArea { webAreas[read.number] = webArea }
    if let region = stalePointRegion(read.element, role: read.role, editableAncestor: nil) ?? read.parent.flatMap({ regions[$0] }) {
      regions[read.number] = region
    }
    let control = read.parent.flatMap { controls[$0] }
    // #433: whether it, or an ancestor below its document, acts on its own (known), past unknown wrappers.
    let controlAbove = read.parent.map { owned.contains($0) } ?? false
    if !stalePointControlStops.contains(read.role),
       controlAbove || stalePointInteractiveRoles.contains(read.role) || read.actions.contains("AXPress") {
      owned.insert(read.number)
    }
    if !read.roleRead {
      controls[read.number] = .unknown  // its role unread (finding 6): a control of unknown kind, never inert
    } else if !stalePointControlStops.contains(read.role) {
      if stalePointInteractiveRoles.contains(read.role) || read.actions.contains("AXPress") {
        controls[read.number] = .control(read.element, role: read.role)
      } else if !read.actionsRead {
        controls[read.number] = .unknown
      } else if let control {
        controls[read.number] = control
      }
    }
    let regionRoot = read.role == "AXWebArea" ? read.number : read.parent.flatMap { regionRoots[$0] } ?? read.number
    regionRoots[read.number] = regionRoot
    let boundary = clipBoundaryRoles.contains(read.role)
    let inherited: CGRect? = boundary ? nil : read.parent.flatMap { bounds[$0] ?? nil }
    let own = read.frame
    func cut(_ rect: CGRect?) -> CGRect? {
      guard let rect else { return nil }
      guard let inherited else { return rect }
      return rect.intersection(inherited)
    }
    if clipsDescendants(role: read.role, actions: read.actions) {
      if let own, unplacedFrame(own) {
        bounds[read.number] = .some(inherited)  // an unplaced clipping frame (#312): unknown, so it cuts nothing
      } else {
        bounds[read.number] = .some(own.map { cut($0) } ?? CGRect.null)  // a clipping frame unread: nothing known to show
      }
    } else {
      bounds[read.number] = .some(inherited)
    }
    let ancestor = read.parent.flatMap { framed[$0] }
    func node(frame: CGRect, shown: CGRect?) -> ScreenshotNode<Element> {
      ScreenshotNode(element: read.element, role: read.role, title: read.title, description: read.description,
                     subrole: read.subrole, value: read.value,
                     editableAncestor: read.role == "AXStaticText" ? regions[read.number] : nil,
                     labelsUnread: read.labelsUnread,
                     frame: frame, shown: shown, depth: read.depth,
                     subtreeRecorded: !incomplete.contains(read.number),
                     thinGap: thin(frame) && incomplete.contains(read.number), gapsBelow: gapsBelow[read.number] ?? [],
                     ancestor: ancestor, webArea: webArea, control: control?.element,
                     controlRole: control?.role, controlUnknown: control?.unknown ?? false, roleUnknown: !read.roleRead,
                     actionable: !read.roleRead ? nil
                       : stalePointInteractiveRoles.contains(read.role) || read.actions.contains("AXPress") ? true
                       : read.actionsRead ? false : nil,
                     regionCovered: !broken.contains(regionRoot), controlAbove: controlAbove,
                     pressRecorded: read.actions.contains("AXPress"))
    }
    let parentFramed = read.parent.map { framedReads.contains($0) } ?? false
    guard let frame = own else {
      framed[read.number] = ancestor
      var unframed = node(frame: .null, shown: nil)
      (unframed.thinGap, unframed.gapsBelow) = (false, [])
      unframed.children = ownChildren[read.number] ?? .unread
      unframed.parentFramed = parentFramed
      frameless.append(unframed)
      continue
    }
    framed[read.number] = nodes.count
    var recorded = node(frame: frame, shown: cut(frame).flatMap { $0.isNull || $0.width <= 0 || $0.height <= 0 ? nil : $0 })
    recorded.children = ownChildren[read.number] ?? .unread
    recorded.parentFramed = parentFramed
    framedReads.insert(read.number)
    nodes.append(recorded)
  }
  return (nodes, frameless)
}

/// #330's rule dL: every element of the walk's record (`reads`), framed or frameless, keyed by `key`, with whether the walk
/// recorded every one of its direct children (its AXChildren read, and none left out by a width cut, the depth cap, the
/// budget or deadline, or a failed read of a child). A child such an element lists now that the record lacks is new since
/// the screenshot. An element whose AXChildren read failed decodes as having none, so it never counts as complete (the
/// review of 364e017d..51ce4138). #431 leaves this input as it was (the review of main..849bcdad, finding 4); its own
/// coverage is `ScreenshotNode.regionCovered`.
func screenshotChildrenRecorded<Element, Key: Hashable>(_ reads: [ScreenshotNodeRead<Element>], key: (Element) -> Key) -> [Key: Bool] {
  var recordedChildren: [Int: Int] = [:]
  for read in reads { if let parent = read.parent { recordedChildren[parent, default: 0] += 1 } }
  var complete: [Key: Bool] = [:]
  complete.reserveCapacity(reads.count)
  for read in reads { complete[key(read.element)] = read.childrenRead && (recordedChildren[read.number] ?? 0) >= read.childCount }
  return complete
}

/// Whether `rect` holds `point`, its edges included.
func holdsPoint(_ rect: CGRect, _ point: CGPoint) -> Bool {
  point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY
}

/// The node the screenshot showed at `point`: the deepest recorded node whose shown frame holds it, the later in the walk's
/// order of two at one depth (a later sibling draws above an earlier one).
func deepestScreenshotNode<Element>(at point: CGPoint, in nodes: [ScreenshotNode<Element>]) -> ScreenshotNode<Element>? {
  var best: ScreenshotNode<Element>?
  for node in nodes {
    guard let shown = node.shown, holdsPoint(shown, point) else { continue }
    if best == nil || node.depth >= best!.depth { best = node }
  }
  return best
}

/// The roles the guard takes for interactive: a hit of one of these that is not the recorded node refuses (the
/// false-positive spike's list, probe/296-hosted `scripts/probe-296/tool.swift`).
let stalePointInteractiveRoles: Set<String> = [
  "AXButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXPopUpButton", "AXMenuButton", "AXMenuItem", "AXTextField", "AXTextArea",
  "AXComboBox", "AXSearchField", "AXSecureTextField", "AXSlider", "AXIncrementor", "AXDisclosureTriangle", "AXTab", "AXSwitch",
  "AXColorWell", "AXSegmentedControl",
]
/// How far a re-created handle is looked for: the hit, its parents up to its window (at most this many levels, the bound
/// of every other parent walk here), and this many of its descendants, breadth-first. The spike's search, which matched
/// every re-created control it met at distance 0, used the same 300 descendants.
let stalePointAncestorLevels = 300
let stalePointDescendantBound = 300
/// When the node's handle is gone and the hit-test at the point answers nothing (or an element whose role cannot be read),
/// the page may be mid-replacement: the old node destroyed, the new one not yet hit-testable (the hosted A/B, run
/// 42184616121, chrome/dedicated/recreate/20s: a button replaced every 500 ms refused once as `nodeGone` with no hit). So
/// the point is hit-tested again up to this many times, this many ms apart, and the re-created search runs on the first
/// real hit; the node is gone only if none comes within the bound (150 ms at most).
let stalePointRehits = 3
let stalePointRehitMs: Double = 50
/// How far a re-created handle's frame may lie from the recorded one, each edge, in points.
let stalePointFrameTolerance: CGFloat = 2
/// #442 (ruling 1073): how long the guard waits before hit-testing the point again on an engine whose first answer at a
/// new point is approximate (Chromium's: the deepest element by bounds, the overlay group over a control, corrected
/// asynchronously with no signal when done). Kit `probe/442-measure` measured the correction at a median of 25-35 ms and
/// at most 61 ms (Electron) on idle hosted runners; Safari's first answer is already the page's own hit test.
let stalePointCorrectionMs: Double = 80

/// #442: whether the hit taken again after `stalePointCorrectionMs` named the first hit's element (`same`), another
/// (`changed`), or nothing (`none`: a read that fails, which keeps main's verdict). The meta's `hitCorrection`.
enum StalePointHitCorrection: String, Equatable { case same, changed, none }

/// Why the guard kept or refused a pointer (the meta's `stalePoint.reason`).
enum StalePointReason: String, Equatable {
  /// Kept: no recorded node holds the point (nothing recorded to compare).
  case unrecorded
  /// Kept: the hit-test answers the node itself.
  case sameElement
  /// Kept: the hit-test answers nothing; the node's frame still holds the point.
  case noHit
  /// Kept: the hit is not interactive (its label's text, a group, an image), and the node is still in place.
  case nonInteractiveHit
  /// Kept: the hit is an interactive ancestor of the node (the control its recorded text belongs to).
  case hitAboveNode
  /// Kept, unguarded inside (a stated limit, the design session's ruling 0a14b51f): the hit (or the element a route acts
  /// on) lies inside the node, whose children the record does not all hold, so the screenshot may have shown it; only the
  /// node itself is guarded, as every node is (its own handle with its frame read now holding the point and its label's
  /// words unchanged, #298; or one re-created by role, frame and label): the hit inside it, the node itself or no hit
  /// at all.
  case unrecordedDescendant
  /// Refused: no handle of the node answers, and none re-created in place was found.
  case nodeGone
  /// Refused: the node's frame read now no longer holds the point.
  case frameMoved
  /// Refused: the hit-test now answers another interactive element.
  case interactiveHit
  /// Refused: #282's element route (or #283's focus) would act on an element that is neither the node nor an ancestor
  /// of it (its control), nor inside a node whose children the record does not all hold.
  case pressedOther
  /// Kept (#305, the design session's ruling 45f5e5be): the hit (or the element a route acts on) is another interactive
  /// element, but itself a recorded node the screenshot showed at the point (`recordedHitAtPoint`). The deepest recorded
  /// node is not always what the hit-test answers: a same-depth sibling stacked on top, a toolbar over a deeper page view,
  /// a wrapped text's box over its neighbour, a hit region past its frame (an edge, a toolbar item's padding: ruling
  /// a27fc57c, `recordedHitBy`).
  case recordedHit
  /// Refused (#316's rule W): the app has a window at layer 0 above the screenshot's window that the screenshot's window
  /// list did not hold (`newWindowAbove`); nothing of the tree was read.
  case newWindow
  /// Refused (#316's rule G): the recorded node lies in an AXWebArea and the hit does not (`ScreenshotNode.webArea`): the
  /// point reaches another document now, or something over the page.
  case otherWebArea
  /// Refused (#330's rule dL, `newElementOverPoint`): the recorded node lies in an AXWebArea and the hit lies in an element
  /// the page added over the point since the screenshot (a suggestion list, a popup).
  case newElementOverPoint
  /// Refused (#298, `relabelledLabel`): the node, found by its own handle with its frame still holding the point, reads a
  /// label whose words differ from the recorded one's (Save to Delete on one element).
  case relabelled
  /// Refused (#452, `guardedPointVerdict`): the point lies on another window of the app's own, over the observed one,
  /// which the pointer's events are stamped to (`AppWindowSignal` says how it was found); nothing of the tree was read.
  case appWindowOverPoint
  /// Refused (#443, `controlGoneVerdict`): the node, inert and found by its own handle, lay inside a recorded control
  /// whose handle is confirmed destroyed (`StalePointReads.gone`), so the node outlived the control the screenshot showed
  /// it in, and what it lies in now is not what the screenshot showed (`decomove`: a decoration moved into a new link).
  case controlGone
  /// Refused (#442, `otherControlOnTopVerdict`): on a keep through an inert layer (#433's) or past a non-interactive hit,
  /// the corrected hit lies in a live control the record holds elsewhere, moved over the point (`movedOverPoint`;
  /// `slideover`: button B slid over an unchanged link A under a veil).
  case otherControlOnTop

  var refuses: Bool {
    self == .nodeGone || self == .frameMoved || self == .interactiveHit || self == .pressedOther || self == .newWindow || self == .otherWebArea
      || self == .newElementOverPoint || self == .relabelled || self == .appWindowOverPoint || self == .controlGone || self == .otherControlOnTop
  }
}

/// How the recorded node was found now: its own handle, or one re-created in place.
enum StalePointIdentity: String, Equatable { case handle, recreated }

/// The guard's reading at a point.
struct StalePointVerdict<Element> {
  let reason: StalePointReason
  /// The recorded node (nil only for `unrecorded`).
  var node: ScreenshotNode<Element>?
  var identity: StalePointIdentity?
  /// The node's element as found now: its own handle or the re-created one; nil when gone.
  var current: Element?
  var hitRole: String?
  /// The hit the verdict judged: the action's, or a later one's when the first answered nothing (`stalePointRehits`).
  var hit: Element?
  /// The strips whose children the record lacks in the recorded node's subtree (`ScreenshotNode.gapsBelow`), for the
  /// element route's press verdict.
  var gaps: [Element] = []
  /// Where the verdict was read, for the element route's press verdict (`recordedHitAtPoint`): the posted point (nil when
  /// no recorded node held it), the window's shift since the screenshot, and the record.
  var point: CGPoint?
  var windowShift: CGVector = .zero
  var nodes: [ScreenshotNode<Element>] = []
  /// The record's frameless elements (`screenshotRecord`, #435), which the press verdict's #305 check reads with `nodes`.
  var frameless: [ScreenshotNode<Element>] = []
  /// The record's handle map (`stalePointVerdict`'s `recorded`), which the press verdict's #305 check reads a re-created
  /// identity's candidate against (`recreatedRefused`).
  var recorded: (Element) -> Bool? = { _ in nil }
  /// For `recordedHit`, the frame that carried the point (`recordedHitAtPoint`).
  var recordedHitBy: RecordedHitFrame?
  /// #316's rule G: how many parents of the hit were read to find the recorded node's web area (nil when the rule did not
  /// walk: no web area recorded, no hit, or the hit the node itself).
  var webAreaReads: Int?
  /// #330's rule dL: what it read once the record named a new element on the hit's chain (its parent's children, then the
  /// node's parents when the node is not on the chain); nil when it read nothing.
  var newElementReads: Int?
  /// #316's rule W: the new window over the screenshot's, for `newWindow`.
  var newWindow: ListedWindow?
  /// #452: for `appWindowOverPoint`, the number of the app's window over the observed one at the point (0 when the
  /// hit's window could not be numbered) and the signal that found it.
  var overWindow: CGWindowID?
  var overBy: AppWindowSignal?
  /// #453: for `appWindowOverPoint`, that window's layer and the observed window's, as the list held them (nil unlisted),
  /// which tell the overlay's kind apart (OverlayClick.swift `overlayKind`).
  var overLayer: Int?
  var observedLayer: Int?
  /// #298: the node's label read now, for `relabelled`'s sentence (#433: the control beneath's, when it refused).
  var labelNow: String?
  /// #433: the recorded control beneath a node that does not act on its own (`underlyingTarget`), judged when the verdict
  /// on the node kept the point, and how it was found; `underlyingRefused` when the refusal is that control's, whose
  /// sentence then names the inert node over it and it.
  var underlying: ScreenshotNode<Element>?
  var underlyingIdentity: StalePointIdentity?
  var underlyingRefused = false
  /// #442: for `otherControlOnTop`, the live control the corrected hit lies in, a known control that moved over the point,
  /// and its role read then; `hitCorrection` is set whenever the guard took the hit again after `stalePointCorrectionMs`.
  var onTop: Element?
  var onTopRole: String?
  var hitCorrection: StalePointHitCorrection?
  /// #442: the delayed hit-test's own time, when its answer supplied the refusal (#452's window check on it), which the
  /// meta's `hitMs` then reports.
  var correctedHitMs: Double?
  /// #481 (ruling 1106): the recorded control the element route presses by its handle, where the guard kept the point
  /// and #442's corrected hit lies in it (`correctedRouteControl`); nil, the route is main's, from the action's own hit,
  /// which the verdict keeps.
  var routeControl: Element?
  /// #481 (ruling 1109): which recorded control `routeControl` is, the meta's `stalePoint.routeControl`.
  var routeControlSource: StalePointRouteControl?
  /// #481 (ruling 1123): the record `routeControl` qualified against (its handle, its recorded label), which the route's
  /// gate checks again after a wait or a focus hold (`StalePointGate.check`, `routeQualification`).
  var routeRecord: ScreenshotNode<Element>?
  var refused: Bool { reason.refuses }
}

/// The reads the guard makes (the unit tests' seams; `.live` over the Accessibility API).
struct StalePointReads<Element> {
  var role: (Element) -> String?
  var frame: (Element) -> CGRect?
  var parent: (Element) -> Element?
  var children: (Element) -> [Element]?
  var title: (Element) -> String?
  var description: (Element) -> String?
  /// The element's AXValue as text (#298), read only where the recorded node is an AXStaticText; a seam without one
  /// reads none, so a value never counts.
  var value: (Element) -> String? = { _ in nil }
  /// The element's AXEditableAncestor and its action names (#298's edited-text exemption), the names nil when their read
  /// failed and an empty list when it has none (`establishedActionNames`); a seam without them reads none, so no text
  /// counts as edited.
  var editableAncestor: (Element) -> Element? = { _ in nil }
  var actions: (Element) -> [String]? = { _ in nil }
  /// A label attribute read so that a failed read is told from an absent one (#298's rule, the review of
  /// 7f6eb3dc..b2f00ad5, P2 2). A seam without it reads through `title`, `description` and `value`, whose nil is absence.
  var label: ((Element, StalePointLabelPart) -> StalePointLabelRead)? = nil
  var same: (Element, Element) -> Bool
  /// Whether the element's handle names a destroyed element (#431's review, finding 1: a new control stands in for the
  /// recorded one only once that one is gone): live, its AXRole read answering kAXErrorInvalidUIElement, so a read that
  /// merely fails is not gone. A seam without it takes an element whose frame reads none for gone.
  var gone: ((Element) -> Bool)? = nil

  func isGone(_ element: Element) -> Bool { gone?(element) ?? (frame(element) == nil) }

  func readLabel(_ element: Element, _ part: StalePointLabelPart) -> StalePointLabelRead {
    if let label { return label(element, part) }
    switch part {
    case .title: return .text(title(element))
    case .description: return .text(description(element))
    case .value: return .text(value(element))
    }
  }
}

extension StalePointReads where Element == AXUIElement {
  static var live: StalePointReads<AXUIElement> {
    StalePointReads(role: { attribute($0, kAXRoleAttribute) as? String }, frame: liveFrameRead,
                    parent: { elementAttribute($0, kAXParentAttribute) }, children: childrenRead,
                    title: { liveLabel($0, kAXTitleAttribute) }, description: { liveLabel($0, kAXDescriptionAttribute) },
                    value: { liveLabel($0, kAXValueAttribute) }, editableAncestor: { elementAttribute($0, "AXEditableAncestor") },
                    actions: { establishedActionNames(of: $0) },
                    label: { element, part in
                      let read = copyAttribute(element, part.attribute)
                      return stalePointLabelRead(read.value, read.error)
                    }, same: { CFEqual($0, $1) }, gone: { copyAttribute($0, kAXRoleAttribute).error == .invalidUIElement })
  }
}

private func liveFrameRead(_ element: AXUIElement) -> CGRect? { frame(of: element) }

/// A title, description or value read now as the walk records it (ElementData): a string or an attributed string's text.
private func liveLabel(_ element: AXUIElement, _ name: String) -> String? {
  attribute(element, name).flatMap(labelText)
}

/// A label's text as the walk takes it: a string, or an attributed string's text; nil for any other value.
private func labelText(_ value: CFTypeRef) -> String? {
  let type = CFGetTypeID(value)
  if type == CFStringGetTypeID() { return value as? String }
  if type == CFAttributedStringGetTypeID() { return (value as! NSAttributedString).string }
  return nil
}

private func nonEmpty(_ text: String?) -> String? { text.flatMap { $0.isEmpty ? nil : $0 } }

/// Whether a re-created handle's label agrees with the recorded node's (the design session's amendment, 0c0b70f0): the
/// same title when both have one, else the same description when neither has a title and both have one, else, when
/// neither side has a title or description and both have an AXStaticText's value (#298: a link's or a clickable div's
/// text, re-created by a same-width replacement), values with the same words (`stalePointLabelWords`). A label either
/// side cannot read (or does not carry) never counts against the match. The record holds labels as the walk keeps them,
/// cut by `bounded` (10,000 UTF-16 units); the label read now (`title`, `description`, `value`) is cut the same way
/// first, so a long label compares like for like. `value` is passed only for an AXStaticText.
func stalePointLabelsAgree(recordedTitle: String?, recordedDescription: String?, recordedValue: String? = nil, title: String?,
                           description: String?, value: String? = nil) -> Bool {
  let title = title.map(bounded), description = description.map(bounded)
  let (oldTitle, newTitle) = (nonEmpty(recordedTitle), nonEmpty(title))
  if let oldTitle, let newTitle { return oldTitle == newTitle }
  guard oldTitle == nil, newTitle == nil else { return true }
  let (oldDescription, newDescription) = (nonEmpty(recordedDescription), nonEmpty(description))
  if let oldDescription, let newDescription { return oldDescription == newDescription }
  if oldDescription == nil, newDescription == nil, let old = nonEmpty(recordedValue), let new = nonEmpty(value.map(bounded)) {
    return stalePointLabelWords(old) == stalePointLabelWords(new)
  }
  return true
}

/// A node's label (#298): its title if non-empty, else its description, else its value (which the record keeps, and
/// the guard reads, for an AXStaticText only).
func stalePointLabel(title: String?, description: String?, value: String?) -> String? {
  nonEmpty(title) ?? nonEmpty(description) ?? nonEmpty(value)
}

/// A label's words (#298; the spike's rule as measured, `scripts/probe-298/analyze.mjs`'s `besideNumbers`, mode `run`):
/// its lowercased letter runs, after taking out every number (an ASCII digit run with internal `.`, `,` or `:`) together
/// with the letter words that follow it up to the next punctuation mark (any character neither a letter, a digit nor
/// white space). So a count's or a time's unit and its inflection go with it ("1 item", "Elapsed 11.6 s", "3 new").
func stalePointLabelWords(_ label: String) -> [String] {
  let scalars = Array(label.lowercased().unicodeScalars)
  func isDigit(_ s: Unicode.Scalar) -> Bool { s.value >= 0x30 && s.value <= 0x39 }
  func isLetter(_ s: Unicode.Scalar) -> Bool {
    switch s.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: return true
    default: return false
    }
  }
  /// JavaScript's `\s`, as the spike's tokenizer skipped it: neither a word nor punctuation.
  func isSpace(_ s: Unicode.Scalar) -> Bool {
    s.properties.generalCategory == .spaceSeparator || ["\t", "\n", "\u{0B}", "\u{0C}", "\r", "\u{FEFF}", "\u{2028}", "\u{2029}"].contains(s)
  }
  var words: [String] = []
  var afterNumber = false
  var index = 0
  while index < scalars.count {
    let scalar = scalars[index]
    if isDigit(scalar) {
      index += 1
      while index < scalars.count {
        if isDigit(scalars[index]) {
          index += 1
        } else if [".", ",", ":"].contains(scalars[index]), index + 1 < scalars.count, isDigit(scalars[index + 1]) {
          index += 2
        } else {
          break
        }
      }
      afterNumber = true
    } else if isLetter(scalar) {
      var word = String.UnicodeScalarView()
      while index < scalars.count, isLetter(scalars[index]) {
        word.append(scalars[index])
        index += 1
      }
      if !afterNumber { words.append(String(word)) }
    } else {
      if !isSpace(scalar) { afterNumber = false }  // punctuation ends a number's words
      index += 1
    }
  }
  return words
}

/// The nodes whose label #298's rule does not compare: document titles, which flash and gain tab-state suffixes ("Ann
/// messaged you", "- Audio playing"; #316's rule G already guards the document's identity), on the window, the web area
/// and Chrome's tab (the design session's ruling 31a62775 (b)).
let relabelUncomparedRoles: Set<String> = ["AXWindow", "AXWebArea"]
let relabelUncomparedSubroles: Set<String> = ["AXTabButton"]

/// #298's rule `relabelled` (the design session's ruling 31a62775), on a node found by its own handle whose frame still
/// holds the point: the label it reads now when that label's words differ from the recorded label's, both labels
/// non-empty, the node not one of the uncompared (`relabelUncomparedRoles`, `relabelUncomparedSubroles`); else nil. It
/// reads the title, then the description only when the title is empty or absent, then (for an AXStaticText) the value
/// only when both are, each cut as the record's was. A label never falls past an attribute whose read failed, at the
/// observation (`ScreenshotNode.labelsUnread`) or now (`StalePointReads.readLabel`): the label is then unknown, and the
/// rule keeps the point (the review of 7f6eb3dc..b2f00ad5, P2 2: a button "Save" described "Save changes", its title
/// read failing on one side, would otherwise compare its description with its title).
func relabelledLabel<Element>(_ node: ScreenshotNode<Element>, _ reads: StalePointReads<Element>) -> String? {
  guard !relabelUncomparedRoles.contains(node.role), !relabelUncomparedSubroles.contains(node.subrole ?? "") else { return nil }
  let parts: [StalePointLabelPart] = node.role == "AXStaticText" ? [.title, .description, .value] : [.title, .description]
  var was: String?
  for part in parts {
    if node.labelsUnread.contains(part) { return nil }
    let recorded = part == .title ? node.title : part == .description ? node.description : node.value
    if let text = nonEmpty(recorded) {
      was = text
      break
    }
  }
  guard let was else { return nil }
  let element = node.element
  var now: String?
  for part in parts {
    guard case .text(let text) = reads.readLabel(element, part) else { return nil }
    if let text = nonEmpty(text.map(bounded)) {
      now = text
      break
    }
  }
  guard let now, stalePointLabelWords(was) != stalePointLabelWords(now) else { return nil }
  // The edited-text exemption (ruling 1ea561bc:553): the text of an editable region, changed by the model's own typing.
  if let region = node.editableAncestor, editedInPlace(element, region: region, reads) { return nil }
  return now
}

/// The roles of an editable text region for #298's edited-text exemption: a text area or a text field, and a
/// contenteditable region, which Chromium, WebKit and Gecko expose as an AXTextArea (#283's focus route reaches one
/// there). The record derives a text's region from these alone (the design session's ruling 1ea561bc:565), since the
/// walk reads no AXEditableAncestor: a contenteditable group the browsers expose as a plain group is not told apart
/// from any group, and its text stays judged.
let stalePointEditableTextRoles: Set<String> = ["AXTextArea", "AXTextField"]

/// The editable region an element names for #298's edited-text exemption: the one its AXEditableAncestor names (read
/// at the click only; the record passes none), else the element itself when its role is an editable text role; nil
/// otherwise. Never the element answering the attribute, which may be a link or a chip inside the region (the review
/// of b2f00ad5..25b23fbb, P2 1).
func stalePointRegion<Element>(_ element: Element, role: String?, editableAncestor: Element?) -> Element? {
  editableAncestor ?? (role.map(stalePointEditableTextRoles.contains) == true ? element : nil)
}

/// #298's edited-text exemption (the design session's ruling 1ea561bc:553): whether `text`, read now, lies in `region`,
/// the region the record derived for it, with nothing actionable between them. At the click (ruling 1ea561bc:565) the
/// text's AXEditableAncestor is read live and must name `region`; where that read answers nothing (failed or absent),
/// the region its nearest parent names (`stalePointRegion`: that parent's AXEditableAncestor, or the parent itself by
/// its role), up to its web area, window, sheet or application, must. Then every element strictly between the text and the region is read: one of
/// `stalePointInteractiveRoles` (a link, a button), or one whose actions include AXPress (a mention or a chip), keeps
/// the text judged. A click there only places a caret, and the text changing is the model's own typing; a control's text
/// is not. Read only where the rule would otherwise refuse, or a re-created text's words disagree.
func editedInPlace<Element>(_ text: Element, region: Element, _ reads: StalePointReads<Element>) -> Bool {
  func regionAbove() -> Element? {
    var current = text
    for _ in 0..<stalePointAncestorLevels {
      guard let next = reads.parent(current), let role = reads.role(next) else { return nil }
      if let named = stalePointRegion(next, role: role, editableAncestor: reads.editableAncestor(next)) { return named }
      if role == "AXWebArea" || stalePointWalkStops.contains(role) { return nil }
      current = next
    }
    return nil
  }
  guard let now = reads.editableAncestor(text) ?? regionAbove(), reads.same(now, region) else { return false }
  var current = text
  for _ in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { return false }
    if reads.same(next, region) { return true }
    // A role or action names that cannot be read leave the element not known to be inert (the review of
    // b2f00ad5..25b23fbb, P2 2): the text stays judged.
    guard let role = reads.role(next), let actions = reads.actions(next) else { return false }
    if stalePointInteractiveRoles.contains(role) || actions.contains("AXPress") { return false }
    current = next
  }
  return false
}

/// The largest distance between two frames' corresponding edges.
func frameDistance(_ a: CGRect, _ b: CGRect) -> CGFloat {
  max(abs(a.minX - b.minX), abs(a.minY - b.minY), abs(a.maxX - b.maxX), abs(a.maxY - b.maxY))
}

private let stalePointWalkStops: Set<String> = ["AXWindow", "AXSheet", "AXApplication"]

/// `element`'s parents, nearest first, up to its window, sheet or application (included) or `stalePointAncestorLevels`.
private func ancestors<Element>(of element: Element, _ reads: StalePointReads<Element>) -> [Element] {
  var found: [Element] = []
  var current = element
  for _ in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { break }
    found.append(next)
    if stalePointWalkStops.contains(reads.role(next) ?? "") { break }
    current = next
  }
  return found
}

/// Whether `element` lies inside `container` (a strict descendant): its parents walked until one is `container`, up to
/// `stalePointAncestorLevels`, reading nothing else.
private func isInside<Element>(_ element: Element, _ container: Element, _ reads: StalePointReads<Element>) -> Bool {
  var current = element
  for _ in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { return false }
    if reads.same(next, container) { return true }
    current = next
  }
  return false
}

/// #316's rule G: whether `hit` is `area` or lies inside it, its parents walked (nothing else read) until one is `area`, up
/// to `stalePointAncestorLevels`, how many were read, and the chain walked: the hit, then each parent read (inside, the
/// area last), which #330's rule dL judges. Inside, the walk stops at the area, so a hit in a nested document (an iframe's
/// web area inside the page's) reaches the page's further up; outside, it ends at the application, whose parent is none.
func liesIn<Element>(_ hit: Element, _ area: Element, _ reads: StalePointReads<Element>) -> (inside: Bool, reads: Int, chain: [Element]) {
  if reads.same(hit, area) { return (true, 0, [hit]) }
  var chain = [hit]
  var current = hit
  for level in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(current) else { return (false, level + 1, chain) }
    chain.append(next)
    if reads.same(next, area) { return (true, level + 1, chain) }
    current = next
  }
  return (false, stalePointAncestorLevels, chain)
}

/// How #330's rule dL reads an element of the hit's chain against the record (`newElementOverPoint`).
private enum ChainStatus { case recorded(allChildren: Bool), new, insideNew, unknown }

/// #330's rule dL (the design session's ruling 11bec0ed): whether the hit lies in an element the page added over the point
/// since the screenshot, and what that took to read. `chain` is the hit and its parents up to the recorded node's web area
/// (rule G's walk, `liesIn`, which found the hit inside); `recorded` answers, for each element of the record, whether the
/// walk recorded every one of its children (`screenshotChildrenRecorded`), and nil for an element the record lacks. From
/// the web area down, an element is recorded; new (the record lacks it, its parent recorded with every child); inside a
/// new one; or unknown (the record lacks it, under a parent whose children the record does not all hold, or under an
/// unknown one). The topmost new element refuses when its parent's AXChildren lists it now, since Chrome hit-tests a
/// button to its label's text, which no AXChildren lists and the walk never records, and when it neither is nor holds one
/// of `found`, the recorded nodes as found now: the node at the point (#296's control re-created in place, and a wrapper
/// re-created around it, are the node, not something over it; the design session's acceptance cd365f0e), and a hit #305
/// kept as a recorded control, perhaps re-created in place (the review of 364e017d..51ce4138). Nothing is read until the
/// record names a new element; then its parent's children, and, for each of `found` not on the chain, its parents up to
/// the new element or the web area.
func newElementOverPoint<Element>(chain: [Element], found: [Element], recorded: (Element) -> Bool?,
                                  reads: StalePointReads<Element>) -> (found: Bool, reads: Int) {
  var parent = ChainStatus.unknown
  var topmost: Int?
  for index in chain.indices.reversed() {
    let status: ChainStatus
    if let allChildren = recorded(chain[index]) {
      status = .recorded(allChildren: allChildren)
    } else {
      switch parent {
      case .new, .insideNew: status = .insideNew
      case .recorded(allChildren: true): status = .new
      case .recorded(allChildren: false), .unknown: status = .unknown
      }
    }
    if case .new = status { topmost = index; break }
    parent = status
  }
  guard let topmost else { return (false, 0) }
  let element = chain[topmost]
  var offChain: [Element] = []
  for node in found {
    if let at = chain.firstIndex(where: { reads.same($0, node) }) {
      if topmost >= at { return (false, 0) }  // a recorded node as found now, or an element holding it
    } else {
      offChain.append(node)
    }
  }
  var count = 1
  guard reads.children(chain[topmost + 1])?.contains(where: { reads.same($0, element) }) == true else { return (false, count) }
  guard let area = chain.last else { return (true, count) }
  for node in offChain {
    var below = node
    for _ in 0..<stalePointAncestorLevels {
      guard let next = reads.parent(below) else { break }
      count += 1
      if reads.same(next, element) { return (false, count) }
      if reads.same(next, area) { break }
      below = next
    }
  }
  return (true, count)
}

/// Up to `stalePointDescendantBound` of `element`'s descendants, breadth-first.
private func descendants<Element>(of element: Element, _ reads: StalePointReads<Element>) -> [Element] {
  var queue = reads.children(element) ?? []
  var head = 0
  while head < queue.count && queue.count < stalePointDescendantBound {
    queue.append(contentsOf: reads.children(queue[head]) ?? [])
    head += 1
  }
  return Array(queue.prefix(stalePointDescendantBound))
}

/// Where a control is looked for above an element (#431's `ScreenshotNode.control`): never past its web area, window,
/// sheet or application.
let stalePointControlStops: Set<String> = ["AXWebArea", "AXWindow", "AXSheet", "AXApplication"]

/// #431 (the design session's rulings 1ea561bc:884/885 and 889): whether a handle found in place of `node` by #296's
/// re-created match (its role, its frame within 2 pt, its label agreeing) or #305's re-created identity of a hit is
/// refused. Safari gives a link moved in the page new accessibility handles (#431's hosted smoke, run 44520748737), so a
/// same-label link that slid into the removed node's place cannot be told from the node re-created by anything the
/// tree says of it now; what refuses is read from the record, and the label is used only to refuse. It refuses when:
/// 1. the walk did not record the node's region whole (`ScreenshotNode.regionCovered`): an element like it past the node
///    cap, below the depth cap or outside the width rule's visible subset could be what came;
/// 2. the record cannot say what the node's control was (`ScreenshotNode.controlUnknown`);
/// 3. the node's own handle still lives (`StalePointReads.isGone` answers no: its frame read only failed), or the record
///    holds the candidate as another node, framed or frameless (the review of main..849bcdad, findings 3 and 8; of
///    849bcdad..38a55469, item 1);
/// 4. the record holds a twin (`recreatedTwin`): another element the match could have taken for the node, framed or
///    frameless (`frameless`, #435: a twin recorded without a frame that gains one at the node's place);
/// 5. the candidate's nearest web area is not the node's (finding 7: an iframe's document laid over the node's place);
/// 6. the candidate's nearest control (an ancestor of `stalePointInteractiveRoles` or with AXPress, below
///    `stalePointControlStops`) is not the node's: where the record had none, it has one (finding 2); while the node's
///    control lives, it is another element; once that control is gone, it is none, an element the record holds, or one
///    of another role than the recorded control's (a link's text under a button, `twinbtn`).
/// A parent, role or action-name read that fails on the way up refuses.
func recreatedRefused<Element>(_ candidate: Element, of node: ScreenshotNode<Element>, nodes: [ScreenshotNode<Element>],
                               frameless: [ScreenshotNode<Element>], recorded: (Element) -> Bool?,
                               _ reads: StalePointReads<Element>) -> Bool {
  guard node.regionCovered, !node.controlUnknown, reads.isGone(node.element) else { return true }
  /// Whether the record holds `element`: the screenshot's handle map, framed and frameless (`recorded`), else a framed
  /// node by its handle (the review of 849bcdad..38a55469, item 1).
  func recordedNode(_ element: Element) -> Bool { recorded(element) != nil || nodes.contains { reads.same($0.element, element) } }
  if recordedNode(candidate) || recreatedTwinFound(of: node, among: [nodes, frameless], reads) { return true }
  func controlDiffers(_ control: (element: Element, role: String)?) -> Bool {
    guard let recorded = node.control else { return control != nil }
    guard let control else { return true }
    if !reads.isGone(recorded) { return !reads.same(recorded, control.element) }
    return recordedNode(control.element) || control.role != node.controlRole
  }
  var control: (element: Element, role: String)?
  var controlFound = false
  var below = candidate
  for _ in 0..<stalePointAncestorLevels {
    guard let next = reads.parent(below), let role = reads.role(next) else { return true }
    if !controlFound {
      if stalePointControlStops.contains(role) {
        controlFound = true
      } else if stalePointInteractiveRoles.contains(role) {
        (control, controlFound) = ((next, role), true)
      } else {
        guard let actions = reads.actions(next) else { return true }
        if actions.contains("AXPress") { (control, controlFound) = ((next, role), true) }
      }
    }
    // A web area node (a document re-created) is judged by #316's and #330's rules, not here.
    if role == "AXWebArea" {
      guard node.role == "AXWebArea" || node.webArea.map({ reads.same($0, next) }) == true else { return true }
      return controlDiffers(control)
    }
    if stalePointWalkStops.contains(role) {
      guard node.webArea == nil || node.role == "AXWebArea" else { return true }
      return controlDiffers(control)
    }
    below = next
  }
  return true
}

/// #431's twin search (`recreatedRefused`'s refusal 4): whether `peers` hold a twin of `node` (`recreatedTwin`). The node's
/// side of the label rule is normalized once per search, on first use, by `nodeLabelWords` (#435's review of 66ae2e8d: a
/// long text's words were taken again for every peer compared, before delivery, with thousands of peers on a large page).
func recreatedTwinFound<Element>(of node: ScreenshotNode<Element>, among peers: [[ScreenshotNode<Element>]], _ reads: StalePointReads<Element>,
                                 nodeLabelWords: (String) -> [String] = stalePointLabelWords) -> Bool {
  var words: [String]?
  func nodeWords(_ text: String) -> [String] {
    if let words { return words }
    let taken = nodeLabelWords(text)
    words = taken
    return taken
  }
  return peers.contains { $0.contains { recreatedTwin($0, of: node, reads, nodeWords: nodeWords) } }
}

/// #431's twin (ruling 889 (i)): whether `other`, a recorded node, is another element #296's match could have taken for
/// `node`: of its role (or of a role unread then, which may be it; the review of main..849bcdad, finding 6), in its region
/// (the same web area, else outside every web area), with a label that agrees (`recreatedLabelsAgree`), and not the
/// node's own control or that control's inert content (an element acting on its own, a link or anything with AXPress or
/// whose role or actions did not read, under the same control is another action: finding 1). `nodeWords` gives the words
/// of the node's own value (`recreatedLabelsAgree`).
func recreatedTwin<Element>(_ other: ScreenshotNode<Element>, of node: ScreenshotNode<Element>, _ reads: StalePointReads<Element>,
                            nodeWords: (String) -> [String] = stalePointLabelWords) -> Bool {
  guard !reads.same(other.element, node.element), other.roleUnknown || other.role == node.role else { return false }
  guard other.webArea.map({ area in node.webArea.map { reads.same(area, $0) } ?? false }) ?? (node.webArea == nil) else { return false }
  if let control = node.control {
    if reads.same(other.element, control) { return false }
    if other.actionable == false, let owner = other.control, reads.same(owner, control) { return false }
  }
  return recreatedLabelsAgree(node, other, aWords: nodeWords)
}

/// The match's label rule (`stalePointLabelsAgree`) between two recorded nodes, which never falls past a label read that
/// failed on either side (the review of main..849bcdad, finding 5): the title, then the description, then an
/// AXStaticText's value by its words; at the first that either side failed to read they agree, at the first both carry
/// they agree when it is the same, at the first only one carries they agree; carrying none, they agree. `aWords` gives the
/// words of `a`'s value (`stalePointLabelWords`; a search over many `b` takes them once, `recreatedTwinFound`).
func recreatedLabelsAgree<Element>(_ a: ScreenshotNode<Element>, _ b: ScreenshotNode<Element>,
                                   aWords: (String) -> [String] = stalePointLabelWords) -> Bool {
  for part in StalePointLabelPart.allCases {
    if a.labelsUnread.contains(part) || b.labelsUnread.contains(part) { return true }
    func text(_ node: ScreenshotNode<Element>) -> String? {
      nonEmpty(part == .title ? node.title : part == .description ? node.description : node.value)
    }
    switch (text(a), text(b)) {
    case let (x?, y?): return part == .value ? aWords(x) == stalePointLabelWords(y) : x == y
    case (nil, nil): continue
    default: return true
    }
  }
  return true
}

/// A handle re-created in place of `node` near `hit`: among the hit, its ancestors and its descendants (the bounds above),
/// the element of the node's role whose frame lies nearest the recorded one moved by `windowShift` (the window's move
/// since the screenshot), within `stalePointFrameTolerance`, whose label agrees (`stalePointLabelsAgree`), and whether the
/// record refuses it (`recreatedRefused` over the record, #431): a refused match is judged as main judges it, so a rule
/// that refuses it keeps its reason, and refuses whatever else would keep it (`stalePointVerdict`).
func recreatedHandle<Element>(of node: ScreenshotNode<Element>, near hit: Element, windowShift: CGVector = .zero,
                              nodes: [ScreenshotNode<Element>], frameless: [ScreenshotNode<Element>], recorded: (Element) -> Bool?,
                              _ reads: StalePointReads<Element>) -> (element: Element, frame: CGRect, refused: Bool)? {
  let expected = node.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)
  var best: (element: Element, frame: CGRect, distance: CGFloat)?
  for candidate in [hit] + ancestors(of: hit, reads) + descendants(of: hit, reads) {
    guard reads.role(candidate) == node.role, let frame = reads.frame(candidate) else { continue }
    let distance = frameDistance(frame, expected)
    guard distance <= stalePointFrameTolerance, best.map({ distance < $0.distance }) ?? true else { continue }
    let (title, description) = (reads.title(candidate), reads.description(candidate))
    func agrees(value: String?) -> Bool {
      stalePointLabelsAgree(recordedTitle: node.title, recordedDescription: node.description, recordedValue: node.value, title: title,
                            description: description, value: value)
    }
    // #298's edited-text exemption: a text re-created in its recorded editable region (typed over) is matched without
    // its value, its title and description still compared.
    guard agrees(value: node.value == nil ? nil : reads.value(candidate))
            || (node.editableAncestor.map { editedInPlace(candidate, region: $0, reads) } == true && agrees(value: nil)) else { continue }
    best = (candidate, frame, distance)
  }
  guard let best else { return nil }
  return (best.element, best.frame, recreatedRefused(best.element, of: node, nodes: nodes, frameless: frameless, recorded: recorded, reads))
}

/// The guard at `point` (#296): the deepest recorded node there (`deepestScreenshotNode`) found now, by its own handle
/// while its frame reads (or while the hit or one of its ancestors is it), else by a re-created handle
/// (`recreatedHandle`), and judged against `hit`, the hit-test at the point the action already took.
///
/// `point` is where the events are posted, in the window as it lies now (`coordinatePlacement` offsets the screenshot's
/// point by the window's current origin); the record's frames are where the window lay at the screenshot. So the node
/// is chosen at the point moved back by `windowShift` (the window's current origin less its origin at the screenshot),
/// the point the model meant in the image, while its frame read now is checked against the posted point, and a
/// re-created handle is matched against the recorded frame moved by the shift. A window that only moved keeps every node.
///
/// With the node's handle gone and no real hit (none, or one whose role cannot be read), `rehit` hit-tests the point again
/// (`stalePointRehits` times, `sleep` `stalePointRehitMs` before each) until a real hit comes, which the rest judges.
///
/// `recorded` is the record's every element, framed or frameless, with whether its children all were recorded
/// (`screenshotChildrenRecorded`; nil for an element the record lacks), which #330's rule dL judges the hit's chain by.
/// `frameless` is the record's frameless elements (`screenshotRecord`), which #431's twin search reads beside `nodes`.
///
/// #433: a point kept at an inert layer (a node that does not act on its own, with no acting ancestor in its document),
/// by a hit that names no interactive element, is judged again at the recorded control beneath it (`underlyingTarget`,
/// `underlyingRefusal`), since a click passes through such a layer (a `pointer-events: none` overlay) to whatever lies
/// under it now.
///
/// #442: a point kept through an inert layer, or past a non-interactive hit, is judged once more by the control the hit
/// lies in (`otherControlOnTopVerdict`); `correctedHit`, given only for an engine whose first answer at a new point is
/// approximate (Chromium's), hit-tests the point again after `sleep` `stalePointCorrectionMs`, and that answer is judged,
/// after #452's check of where it answered (`windowCheck`, `appWindowVerdict`).
func stalePointVerdict<Element>(at point: CGPoint, windowShift: CGVector = .zero, nodes: [ScreenshotNode<Element>],
                                frameless: [ScreenshotNode<Element>] = [],
                                recorded: @escaping (Element) -> Bool? = { _ in nil }, hit first: Element?,
                                rehit: () -> Element? = { nil }, sleep: (Double) -> Void = { _ in },
                                correctedHit: (() -> WindowHit<Element>)? = nil,
                                windowCheck: (WindowHit<Element>) -> StalePointVerdict<Element>? = { _ in nil },
                                reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  let kept = inertLayerVerdict(at: point, windowShift: windowShift, nodes: nodes, frameless: frameless, recorded: recorded, hit: first,
                               rehit: rehit, sleep: sleep, reads: reads)
  return otherControlOnTopVerdict(kept, correctedHit: correctedHit, windowCheck: windowCheck, sleep: sleep, reads)
}

/// `stalePointVerdict` before #442's check: #296's verdict, #443's `controlGone`, then #433's check of the control beneath
/// an inert layer.
private func inertLayerVerdict<Element>(at point: CGPoint, windowShift: CGVector, nodes: [ScreenshotNode<Element>],
                                        frameless: [ScreenshotNode<Element>], recorded: @escaping (Element) -> Bool?, hit first: Element?,
                                        rehit: () -> Element?, sleep: (Double) -> Void,
                                        reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  var verdict = recordedNodeVerdict(at: point, windowShift: windowShift, nodes: nodes, frameless: frameless, recorded: recorded,
                                    hit: first, rehit: rehit, sleep: sleep, reads: reads)
  if let refused = controlGoneVerdict(verdict, reads) { return refused }
  let shown = CGPoint(x: point.x - windowShift.dx, y: point.y - windowShift.dy)
  // A hit on a control names what the click reaches, judged by #296 and #305.
  // A hit that advertises AXPress (a clickable group) names a control too, for this gate only.
  guard !verdict.refused, let node = verdict.node, !(verdict.hitRole.map(stalePointInteractiveRoles.contains) ?? false),
        verdict.hit.flatMap(reads.actions)?.contains("AXPress") != true,
        case let targets = underlyingTargets(of: node, current: verdict.current ?? node.element, at: shown, in: nodes, reads),
        let target = targets.first
  else { return verdict }
  // Kept while any control under the point is still there (hosted batch B, `bgbutton`: an unrelated button behind the
  // link removed); refused, on the first, only when none is.
  func judge(_ control: ScreenshotNode<Element>) -> (refusal: StalePointReason?, identity: StalePointIdentity?, labelNow: String?) {
    underlyingRefusal(control, at: point, windowShift: windowShift, hit: verdict.hit, nodes: nodes, frameless: frameless,
                      recorded: recorded, reads)
  }
  let judged = judge(target)
  guard let reason = judged.refusal else {
    (verdict.underlying, verdict.underlyingIdentity) = (target, judged.identity)
    return verdict
  }
  for control in targets.dropFirst() {
    let answer = judge(control)
    if answer.refusal == nil {
      (verdict.underlying, verdict.underlyingIdentity) = (control, answer.identity)
      return verdict
    }
  }
  var refused = StalePointVerdict(reason: reason, node: node, identity: verdict.identity, current: verdict.current, hitRole: verdict.hitRole,
                                  hit: verdict.hit, gaps: verdict.gaps, point: point, windowShift: windowShift, nodes: nodes,
                                  frameless: frameless, recorded: recorded, webAreaReads: verdict.webAreaReads,
                                  newElementReads: verdict.newElementReads)
  (refused.underlying, refused.underlyingIdentity, refused.labelNow, refused.underlyingRefused) = (target, judged.identity, judged.labelNow, true)
  return refused
}

/// #442 (rulings 1073 and 1078): which control a click at a kept point reaches, where the tree alone cannot say. #433's
/// check vouches for the recorded controls beneath an inert layer, and a non-interactive hit (`nonInteractiveHit`) is
/// kept without asking whose control it lies in, but neither sees stacking: kit `probe/442-measure`, `slideover`, button B
/// slid by a transform over an unchanged link A under a veil, kept and landed on B (Electron) or pressed the veil to no
/// effect (CfT's element route). The page's own hit test does see it: the corrected AX hit named `elementFromPoint`'s
/// element in 1,694 of 1,695 rows, through `pointer-events: none` and by z-order. So, only on those two keep paths (the
/// verdict kept, and #433's check ran and kept, or the reason is `nonInteractiveHit`):
/// - The hit judged is the corrected one: with `correctedHit` (Chromium, whose first answer is the deepest element by
///   bounds, corrected 25-61 ms later with no signal), the point hit-tested again after `stalePointCorrectionMs`, and that
///   answer first goes through #452's window check (`windowCheck`: a window of the app's that arrived over the point
///   during the wait refuses `appWindowOverPoint`); otherwise the action's own. The verdict keeps the action's own hit;
///   `hitCorrection` records whether the second answer differed.
/// - Its control is the nearest element at or above it that acts on its own (`firstActing`, #443's `liveControl`).
/// - A recorded candidate of #433's beneath the layer that the hit names is judged by #433's test (its handle, its label,
///   its frame under the pointer: `underlyingRefusal`), whichever it is, not only the first survivor.
/// - Otherwise the control refuses (`otherControlOnTop`) only as a known control that moved over the target
///   (`movedOverPoint`): live, recorded by handle as a control, at a recorded frame that did not hold the point, and not
///   the recorded control at the point (the node, the node's recorded control, or the recorded control of recorded
///   content the screenshot showed at the point that the hit is).
/// Anything unread, unrecorded or inconclusive keeps the verdict as it came (ruling 1078): no hit, no control or one
/// that does not classify, a control the record lacks (a cut walk) or holds as inert, no answer to the second hit-test.
func otherControlOnTopVerdict<Element>(_ kept: StalePointVerdict<Element>, correctedHit: (() -> WindowHit<Element>)?,
                                       windowCheck: (WindowHit<Element>) -> StalePointVerdict<Element>?, sleep: (Double) -> Void,
                                       _ reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  guard !kept.refused, let node = kept.node, let point = kept.point,
        kept.reason == .nonInteractiveHit || kept.underlying != nil else { return kept }
  var verdict = kept
  var hit = kept.hit
  if let correctedHit {
    sleep(stalePointCorrectionMs)
    let again = correctedHit()
    let correction = again.element.map { now in kept.hit.map { reads.same($0, now) } == true ? .same : .changed } ?? StalePointHitCorrection.none
    verdict.hitCorrection = correction
    if var over = windowCheck(again) {
      // The refusal is the delayed hit's: its timing is reported, but the action's own hit stays the verdict's.
      (over.hit, over.hitCorrection, over.correctedHitMs) = (kept.hit, correction, again.ms)
      return over
    }
    hit = again.element
  }
  guard let hit, let control = firstActing(from: hit, reads).element else { return verdict }
  let meant = CGPoint(x: point.x - kept.windowShift.dx, y: point.y - kept.windowShift.dy)
  /// #481: a kept verdict, carrying the recorded control the route may press from the corrected hit.
  func keptRouting(_ kept: StalePointVerdict<Element>) -> StalePointVerdict<Element> {
    guard verdict.hitCorrection == .changed else { return kept }
    var routed = kept
    if let qualified = correctedRouteControl(control, hit: hit, node: node, kept, reads) {
      (routed.routeControl, routed.routeControlSource, routed.routeRecord) = (qualified.control, qualified.source, qualified.record)
    }
    return routed
  }
  // #433's candidates beneath the layer: the one the hit names, passing #433's test, is the control beneath. One that
  // fails it is left to the rule below (the last review: a front link shrunk away from the point while its text stays
  // there is what main keeps and lands on), never refused for #433's reason here.
  if kept.underlying != nil,
     let named = underlyingTargets(of: node, current: kept.current ?? node.element, at: meant, in: kept.nodes, reads)
       .first(where: { reads.same($0.element, control) }) {
    let judged = underlyingRefusal(named, at: point, windowShift: kept.windowShift, hit: hit, nodes: kept.nodes, frameless: kept.frameless,
                                   recorded: kept.recorded, reads)
    if judged.refusal == nil {
      (verdict.underlying, verdict.underlyingIdentity) = (named, judged.identity)
      return keptRouting(verdict)
    }
  }
  guard movedOverPoint(control, node: node, at: meant, kept, reads) else { return keptRouting(verdict) }
  var refused = refusal(of: kept, reason: .otherControlOnTop, hitCorrection: verdict.hitCorrection)
  (refused.onTop, refused.onTopRole) = (control, reads.role(control))
  return refused
}

/// #481 (rulings 1106, 1123): the recorded control the element route presses by its handle from #442's corrected hit,
/// or nil for main's route from the action's own first hit. Only the recorded control the verdict vouches for at the
/// point, all of these holding:
/// - the corrected hit's acting control (`control`, `firstActing`) is, by handle, #433's control beneath the inert layer
///   that #433's test kept (`beneath`), or the node's own recorded control (`ScreenshotNode.control`, `node`);
/// - that control qualifies now, by its own label-checked test on the corrected hit itself (`routeQualification`): never
///   #433's keep from before the wait, nor `underlyingRefusal`'s frame-unread pass, which reads no label (ruling 1123:
///   a link relabelled "Open" to "Delete" during the 80 ms wait is not pressed);
/// - the corrected hit lies inside the node's recorded web area (#316's `liesIn`), so browser chrome the re-hit reaches
///   in the same window never counts;
/// - its role is one the element route presses (`webAreaPressableRoles`), so no walk from the hit is needed.
/// A control the record lacks (a new wrapper, a front control the walk cut) can never qualify, nor one inside a node the
/// record holds incompletely.
func correctedRouteControl<Element>(_ control: Element, hit: Element, node: ScreenshotNode<Element>, _ kept: StalePointVerdict<Element>,
                                    _ reads: StalePointReads<Element>)
  -> (control: Element, source: StalePointRouteControl, record: ScreenshotNode<Element>)? {
  guard let point = kept.point, let area = node.webArea, liesIn(hit, area, reads).inside,
        let role = reads.role(control), webAreaPressableRoles.contains(role) else { return nil }
  let candidate: (record: ScreenshotNode<Element>, source: StalePointRouteControl)
  if kept.underlyingIdentity == .handle, let beneath = kept.underlying, reads.same(beneath.element, control) {
    candidate = (beneath, .beneath)
  } else if let own = node.control, reads.same(own, control), let recorded = kept.nodes.first(where: { reads.same($0.element, own) }) {
    candidate = (recorded, .node)
  } else {
    return nil
  }
  guard routeQualification(candidate.record, at: point, hit: hit, reads) == nil else { return nil }
  return (control, candidate.source, candidate.record)
}

/// #481 (ruling 1123): why the recorded control the route would press no longer qualifies, or nil when it does: its own
/// handle, its frame read now holding `point` (or, that frame unread, the hit inside it and its handle not gone), and its
/// label read now and confirmed unchanged (`routeLabelConfirmed`). Applied to the corrected hit at the decision and, on
/// the route's gate, after any wait or focus hold (`StalePointGate.check`), with whatever hit is fresh then.
func routeQualification<Element>(_ record: ScreenshotNode<Element>, at point: CGPoint, hit: Element?,
                                 _ reads: StalePointReads<Element>) -> (reason: StalePointReason, labelNow: String?)? {
  let element = record.element
  if let frame = reads.frame(element) {
    guard holdsPoint(frame, point) else { return (.frameMoved, nil) }
  } else {
    guard reads.gone?(element) != true, let hit, reads.same(hit, element) || isInside(hit, element, reads) else { return (.nodeGone, nil) }
  }
  guard routeLabelConfirmed(record, reads) else { return (.relabelled, relabelledLabel(record, reads)) }
  return nil
}

/// #481 (ruling 1123): whether the control's label, read now, is confirmed the recorded one: the first non-empty of its
/// title, then description (then an AXStaticText's value), read the way #298's `relabelledLabel` reads it, with the same
/// words; both sides empty is the same label. A read that fails, then or now, confirms nothing.
func routeLabelConfirmed<Element>(_ record: ScreenshotNode<Element>, _ reads: StalePointReads<Element>) -> Bool {
  let parts: [StalePointLabelPart] = record.role == "AXStaticText" ? [.title, .description, .value] : [.title, .description]
  var was: String?
  for part in parts {
    if record.labelsUnread.contains(part) { return false }
    if let text = nonEmpty(part == .title ? record.title : part == .description ? record.description : record.value) {
      was = text
      break
    }
  }
  var now: String?
  for part in parts {
    guard case .text(let text) = reads.readLabel(record.element, part) else { return false }
    if let text = nonEmpty(text.map(bounded)) {
      now = text
      break
    }
  }
  switch (was, now) {
  case (nil, nil): return true
  case let (was?, now?): return stalePointLabelWords(was) == stalePointLabelWords(now)
  default: return false
  }
}

/// #481 (ruling 1109): the source of the control the route pressed from the corrected hit: #433's control beneath the
/// inert layer (`beneath`) or the node's own recorded control (`node`).
enum StalePointRouteControl: String, Equatable { case node, beneath }

/// #442: a refusal of a kept verdict, carrying what it judged (#433's check included) and the hit's correction.
private func refusal<Element>(of kept: StalePointVerdict<Element>, reason: StalePointReason,
                              hitCorrection: StalePointHitCorrection?) -> StalePointVerdict<Element> {
  var refused = StalePointVerdict(reason: reason, node: kept.node, identity: kept.identity, current: kept.current, hitRole: kept.hitRole,
                                  hit: kept.hit, gaps: kept.gaps, point: kept.point, windowShift: kept.windowShift, nodes: kept.nodes,
                                  frameless: kept.frameless, recorded: kept.recorded, webAreaReads: kept.webAreaReads,
                                  newElementReads: kept.newElementReads)
  (refused.underlying, refused.underlyingIdentity, refused.hitCorrection) = (kept.underlying, kept.underlyingIdentity, hitCorrection)
  return refused
}

/// #442 (ruling 1078 and the last review): whether `control`, live (`firstActing` read it now), is a known control that
/// moved over the target. All of these hold:
/// - the record holds it by its own handle as a control (an interactive role or AXPress read then, as `controlVouches`
///   asks), at frames that place it (an unplaced frame, `unplacedFrame`, says nowhere), every one (2 pt widened) away
///   from the point the model meant (`meant`, the screenshot's space);
/// - #305's rule does not take it at the point (`recordedHitAtPoint`: in place by its own shown frame or its nearest
///   recorded ancestor's padding);
/// - it is not the recorded control at the point: not `node` itself, not `node`'s recorded control
///   (`ScreenshotNode.control`, by handle, never the live parent), and no recorded content of it was shown at the point (a
///   link's text drawn outside the link's box, whatever the hit names); and `node`'s control is known (no wrapper of
///   unread actions, `controlUnknown`).
/// Unrecorded, recorded inert, frameless or unplaced, or an ownership the record cannot say: not known, so no.
func movedOverPoint<Element>(_ control: Element, node: ScreenshotNode<Element>, at meant: CGPoint, _ verdict: StalePointVerdict<Element>,
                             _ reads: StalePointReads<Element>) -> Bool {
  let records = verdict.nodes.filter { reads.same($0.element, control) }
  let placed = records.filter { !$0.frame.isNull && !unplacedFrame($0.frame) }
  guard !placed.isEmpty, records.allSatisfy({ $0.actionable == true || $0.pressRecorded }),
        !placed.contains(where: { holdsPoint($0.frame.insetBy(dx: -stalePointFrameTolerance, dy: -stalePointFrameTolerance), meant) }),
        !node.controlUnknown,
        !(reads.same(node.element, control) || node.control.map({ reads.same($0, control) }) == true),
        !verdict.nodes.contains(where: { recorded in
          recorded.control.map { reads.same($0, control) } == true && recorded.shown.map { holdsPoint($0, meant) } == true
        })
  else { return false }
  guard let point = verdict.point else { return false }
  return recordedHitAtPoint(control, at: point, windowShift: verdict.windowShift, nodes: verdict.nodes, frameless: verdict.frameless,
                            recorded: verdict.recorded, reads) == nil
}

/// #443: a point #296 keeps on an inert node found by its own handle (no interactive role, no AXPress recorded, read at
/// the observation) is refused when the node has moved into another control: its recorded control
/// (`ScreenshotNode.control`, #431's: its nearest recorded ancestor, frameless ones included, of an interactive role or
/// with AXPress, below its document) is confirmed gone, its handle answering kAXErrorInvalidUIElement
/// (`StalePointReads.gone`, never the fallback on an unread frame), and the control the node lies in now
/// (`liveControl`) is another one (`controlDiffers`: another label, or a frame off the recorded control's): kit
/// `probe/433-qual`, `decomove`, a decoration moved from a replaced link into its replacement, kept 40/40 on main.
/// Everything else keeps main's verdict: a recorded control that lives or reads unreadably; a node in no acting
/// ancestor now (hosted smoke 44997131965, `overlaprow`: the decoration left in its row under a front link, which takes
/// the click); a control in the recorded one's place with its label, whatever its role (`rolechange`: WebKit re-creates
/// a link's object as AXButton when the page sets role="button", the decoration surviving); a node re-created in place
/// (its control with it, `remount`); a node of unknown actions or under an ancestor of unknown actions (no control
/// recorded); a hit #305 keeps (`recordedHit`); and a recorded control in place at the point that the node or the hit
/// lies in now (`controlVouches`: the review of dfe6f443..1d3b0963, a front link B the decoration moved into, or whose
/// text is hit, answering `hitAboveNode` or `nonInteractiveHit`, never `recordedHit`), or whose recorded content in place
/// is the hit (`contentVouches`, a front link's text drawn outside its frame).
func controlGoneVerdict<Element>(_ verdict: StalePointVerdict<Element>, _ reads: StalePointReads<Element>) -> StalePointVerdict<Element>? {
  guard !verdict.refused, verdict.reason != .recordedHit, verdict.identity == .handle, let node = verdict.node,
        node.actionable == false, !node.pressRecorded, let control = node.control, reads.gone?(control) == true,
        let recorded = (verdict.nodes + verdict.frameless).first(where: { reads.same($0.element, control) }),
        let current = verdict.current, let now = liveControl(above: current, reads),
        controlDiffers(now, from: recorded, windowShift: verdict.windowShift, reads), !controlVouches(now, verdict, reads),
        !(verdict.hit.flatMap { liveControl(at: $0, reads) }.map { controlVouches($0, verdict, reads) } ?? false),
        !(verdict.hit.map { contentVouches($0, verdict, reads) } ?? false)
  else { return nil }
  return StalePointVerdict(reason: .controlGone, node: node, identity: verdict.identity, current: verdict.current, hitRole: verdict.hitRole,
                           hit: verdict.hit, gaps: verdict.gaps, point: verdict.point, windowShift: verdict.windowShift, nodes: verdict.nodes,
                           frameless: verdict.frameless, recorded: verdict.recorded, webAreaReads: verdict.webAreaReads,
                           newElementReads: verdict.newElementReads)
}

/// #443: the control an element lies in now: the element itself (`liveControl(at:)`) or its nearest ancestor
/// (`liveControl(above:)`) that acts on its own (an interactive role or AXPress, read now), below its document (a
/// `stalePointControlStops` role); nil when none, within the parent walk's bound (`stalePointAncestorLevels`), and nil
/// too when the walk meets an element it cannot classify (its role unread and no AXPress read, or its role read inert and
/// its actions unread) before any control: what holds the node now is then unknown, so a farther control (an outer
/// clickable card) is never compared in its place (the re-review of f394677e, item 1).
func liveControl<Element>(at element: Element, _ reads: StalePointReads<Element>) -> Element? {
  firstActing(from: element, reads).element
}

func liveControl<Element>(above element: Element, _ reads: StalePointReads<Element>) -> Element? {
  reads.parent(element).flatMap { firstActing(from: $0, reads).element }
}

/// What `firstActing` found: an acting element, none below the document (or within the walk's bound), or an element it
/// could not classify first (#442 tells the last two apart: no control is a finding, an unread one is not).
enum LiveControlRead<Element> {
  case control(Element)
  case none
  case unknown
  var element: Element? { if case .control(let element) = self { return element } else { return nil } }
}

func firstActing<Element>(from start: Element, _ reads: StalePointReads<Element>) -> LiveControlRead<Element> {
  var next: Element? = start
  var levels = 0
  while let element = next, levels < stalePointAncestorLevels {
    let role = reads.role(element)
    if role.map({ stalePointControlStops.contains($0) || stalePointWalkStops.contains($0) }) == true { return .none }
    let actions = reads.actions(element)
    if role.map(stalePointInteractiveRoles.contains) == true || actions?.contains("AXPress") == true { return .control(element) }
    if role == nil || actions == nil { return .unknown }
    (next, levels) = (reads.parent(element), levels + 1)
  }
  return .unknown  // a parent unread, or past the bound: what holds it is not known
}

/// #443: whether the control a node lies in now is confirmed another than its recorded one: a label that reads otherwise,
/// or a frame read now more than 2 pt off the recorded control's (a recorded control without a frame, or a frame unread
/// now, says nothing). The label is compared as `stalePointLabelsAgree` does, title first, then description, but an
/// attribute unread on either side, then or now, ends the comparison with no difference, and the next is compared only
/// where both sides are known to lack it (the re-review of f394677e, item 3). The role is not compared: a control
/// re-created in place may change it (`rolechange`).
func controlDiffers<Element>(_ now: Element, from recorded: ScreenshotNode<Element>, windowShift: CGVector,
                             _ reads: StalePointReads<Element>) -> Bool {
  for part in [StalePointLabelPart.title, .description] {
    guard !recorded.labelsUnread.contains(part), case .text(let live) = reads.readLabel(now, part) else { break }
    let old = nonEmpty(part == .title ? recorded.title : recorded.description), fresh = nonEmpty(live.map(bounded))
    if let old, let fresh { if old != fresh { return true } else { break } }
    if old != nil || fresh != nil { break }
  }
  guard !recorded.frame.isNull, let live = reads.frame(now) else { return false }
  return frameDistance(live, recorded.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)) > stalePointFrameTolerance
}

/// #443: whether `control`, the one the node or the verdict's hit lies in now, is a recorded control the screenshot
/// showed at the point, by its recorded handle (never a match re-created by role and label, which a same-label
/// replacement would pass), its shown frame holding the point and its frame read now in place: then it takes the click,
/// as #305 lets it. `decomove`'s B is the replacement, recorded elsewhere if at all, so it never vouches. The record must
/// hold it as a control (an interactive role or AXPress, read then): an inert wrapper that gained AXPress since never
/// vouches (the re-review of f394677e, item 2).
func controlVouches<Element>(_ control: Element, _ verdict: StalePointVerdict<Element>, _ reads: StalePointReads<Element>) -> Bool {
  guard let point = verdict.point, let live = reads.frame(control) else { return false }
  let meant = CGPoint(x: point.x - verdict.windowShift.dx, y: point.y - verdict.windowShift.dy)
  return verdict.nodes.contains { recorded in
    reads.same(recorded.element, control) && (recorded.actionable == true || recorded.pressRecorded)
      && recorded.shown.map { holdsPoint($0, meant) } == true && inPlace(live, recorded, verdict.windowShift)
  }
}

/// #443: whether the verdict's hit is recorded content of a control in place that takes the click (the re-review of
/// f394677e, item 4: a front link's text drawn outside the link's own frame, which `controlVouches` cannot take at the
/// point): the hit, by its recorded handle, its shown frame holding the point and its frame read now in place, whose
/// recorded control (`ScreenshotNode.control`) is the control it lies in now (`liveControl(above:)`) and is itself in
/// place (a frameless one cannot be shown so).
func contentVouches<Element>(_ hit: Element, _ verdict: StalePointVerdict<Element>, _ reads: StalePointReads<Element>) -> Bool {
  guard let point = verdict.point, let live = reads.frame(hit) else { return false }
  let meant = CGPoint(x: point.x - verdict.windowShift.dx, y: point.y - verdict.windowShift.dy)
  guard let content = verdict.nodes.first(where: { reads.same($0.element, hit) }), content.shown.map({ holdsPoint($0, meant) }) == true,
        inPlace(live, content, verdict.windowShift), let owner = content.control,
        let now = liveControl(above: hit, reads), reads.same(owner, now), let ownerFrame = reads.frame(owner),
        let recordedOwner = verdict.nodes.first(where: { reads.same($0.element, owner) }) else { return false }
  return inPlace(ownerFrame, recordedOwner, verdict.windowShift)
}

/// Whether a frame read now lies within `stalePointFrameTolerance` of a recorded node's, the window's shift applied.
private func inPlace<Element>(_ live: CGRect, _ recorded: ScreenshotNode<Element>, _ windowShift: CGVector) -> Bool {
  frameDistance(live, recorded.frame.offsetBy(dx: windowShift.dx, dy: windowShift.dy)) <= stalePointFrameTolerance
}

/// #433: the recorded controls beneath an inert layer at `node`'s point, one of which a click there passes through to:
/// when `node` does not act on its own (no interactive role and no AXPress; where its role or actions did not read at
/// the observation, its handle as found now, `current`, read again, and one that acts now is its own target) and the
/// record holds no acting ancestor of it below its document (`ScreenshotNode.controlAbove`: content of a control is
/// main's to judge), every recorded node whose shown frame holds the point that acts on its own, or whose role or actions
/// did not read (unknown, not inert), and is neither `node` nor one of its recorded ancestors, the innermost only (a card
/// around a link is the link), in `deepestScreenshotNode`'s order (deeper first, then the later in the walk). The
/// verdict keeps the point while any of them is still there (hosted batch B, `bgbutton`): which of two overlapping
/// siblings draws on top is not in the tree, so the check vouches for the recorded controls, not for stacking. `shown` is
/// the point in the screenshot's space.
func underlyingTargets<Element>(of node: ScreenshotNode<Element>, current: Element, at shown: CGPoint,
                                in nodes: [ScreenshotNode<Element>], _ reads: StalePointReads<Element>) -> [ScreenshotNode<Element>] {
  guard node.actionable != true, !node.pressRecorded, !node.controlAbove else { return [] }
  if node.actionable == nil,
     reads.role(current).map(stalePointInteractiveRoles.contains) == true || reads.actions(current)?.contains("AXPress") == true {
    return []
  }
  func ancestors(_ start: Int?) -> Set<Int> {
    var found: Set<Int> = []
    var index = start
    while let at = index, found.insert(at).inserted { index = nodes[at].ancestor }
    return found
  }
  let above = ancestors(node.ancestor)
  let controls = nodes.indices.filter {
    nodes[$0].actionable != false && !above.contains($0) && !reads.same(nodes[$0].element, node.element)
      && nodes[$0].shown.map { holdsPoint($0, shown) } == true
  }
  // The innermost only: a control holding another under the point (a card around a link) is not its own target.
  let holders = controls.reduce(into: Set<Int>()) { $0.formUnion(ancestors(nodes[$1].ancestor)) }
  // `deepestScreenshotNode`'s order: deeper first, then the later in the walk.
  return controls.filter { !holders.contains($0) }.sorted { nodes[$0].depth != nodes[$1].depth ? nodes[$0].depth > nodes[$1].depth : $0 > $1 }
    .map { nodes[$0] }
}

/// #433: whether the control under a kept point (`underlyingTarget`) is still there, as #296 judges a recorded node: its
/// own handle, its frame read now holding `point` and its label's words unchanged (#298's `relabelledLabel`), or the
/// point's hit inside it; else a handle re-created in place (`recreatedHandle`), looked for from its nearest recorded
/// ancestor that survives (the review of 0f79602f, item 3: a parent rebuilt in place, the overlay alive beside it, so the
/// hit on the overlay reaches nothing under it), that #431's record does not refuse (`recreatedRefused`: a twin in the
/// record, a region not recorded whole, its own handle alive with only its frame unread). A control whose role or actions
/// did not read is never taken as re-created (item 2: what replaced it is unknown too). The refusal's reason (nil when
/// kept), how the control was found, and for `relabelled` the label it reads now.
func underlyingRefusal<Element>(_ target: ScreenshotNode<Element>, at point: CGPoint, windowShift: CGVector, hit: Element?,
                                nodes: [ScreenshotNode<Element>], frameless: [ScreenshotNode<Element>], recorded: (Element) -> Bool?,
                                _ reads: StalePointReads<Element>)
  -> (refusal: StalePointReason?, identity: StalePointIdentity?, labelNow: String?) {
  if let frame = reads.frame(target.element) {
    guard holdsPoint(frame, point) else { return (.frameMoved, .handle, nil) }
    if let now = relabelledLabel(target, reads) { return (.relabelled, .handle, now) }
    return (nil, .handle, nil)
  }
  if let hit, reads.same(hit, target.element) || isInside(hit, target.element, reads) { return (nil, .handle, nil) }
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

/// #296's verdict on the recorded node at the point: `stalePointVerdict` before #433's check of the control beneath it.
private func recordedNodeVerdict<Element>(at point: CGPoint, windowShift: CGVector, nodes: [ScreenshotNode<Element>],
                                          frameless: [ScreenshotNode<Element>], recorded: @escaping (Element) -> Bool?, hit first: Element?,
                                          rehit: () -> Element?, sleep: (Double) -> Void,
                                          reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  let shown = CGPoint(x: point.x - windowShift.dx, y: point.y - windowShift.dy)
  guard let node = deepestScreenshotNode(at: shown, in: nodes) else { return StalePointVerdict(reason: .unrecorded, hit: first) }
  var hit = first
  var hitRole = hit.flatMap(reads.role)
  let nodeFrame = reads.frame(node.element)
  if nodeFrame == nil, hitRole == nil {
    for _ in 0..<stalePointRehits {
      sleep(stalePointRehitMs)
      guard let again = rehit(), let role = reads.role(again) else { continue }
      (hit, hitRole) = (again, role)
      break
    }
  }
  var verdict = StalePointVerdict(reason: .nodeGone, node: node, hitRole: hitRole, hit: hit, point: point, windowShift: windowShift, nodes: nodes,
                                  frameless: frameless, recorded: recorded)
  var currentFrame: CGRect?
  /// #431: the re-created match the record refuses (`recreatedRefused`), judged on as main judges it so that a rule that
  /// refuses it (#330's `newElementOverPoint`, a moved frame, another control hit) keeps its reason; whatever would keep it
  /// is refused as `nodeGone` (`finished`), so a refused match never carries a pointer.
  var vetoed = false
  if let frame = nodeFrame {
    (verdict.current, verdict.identity, currentFrame) = (node.element, .handle, frame)
  } else if let hit, reads.same(hit, node.element) || isInside(hit, node.element, reads) {
    (verdict.current, verdict.identity) = (node.element, .handle)  // its frame unread, but the point reaches it
  } else if let hit, let found = recreatedHandle(of: node, near: hit, windowShift: windowShift, nodes: nodes, frameless: frameless,
                                                 recorded: recorded, reads) {
    (verdict.current, verdict.identity, currentFrame) = (found.element, .recreated, found.frame)
    vetoed = found.refused
  }
  guard let current = verdict.current else { return verdict }
  let gone = verdict
  func finished(_ judged: StalePointVerdict<Element>) -> StalePointVerdict<Element> {
    guard vetoed, !judged.refused else { return judged }
    var refused = gone
    (refused.current, refused.identity, refused.webAreaReads, refused.newElementReads) = (nil, nil, judged.webAreaReads, judged.newElementReads)
    return refused
  }
  let gaps = node.gapsBelow
  var webAreaReads: Int?
  var newElementReads: Int?
  func judged(_ reason: StalePointReason) -> StalePointVerdict<Element> {
    StalePointVerdict(reason: reason, node: node, identity: verdict.identity, current: current, hitRole: hitRole, hit: hit, gaps: gaps,
                      point: point, windowShift: windowShift, nodes: nodes, frameless: frameless, recorded: recorded, webAreaReads: webAreaReads,
                      newElementReads: newElementReads)
  }
  // Judged in order: the node's identity (above) and its frame, then the hit (the reasons name what was read, kept or
  // refused). A node the record holds incompletely has passed as every node passes by here (the design session's
  // ruling 2db3ba75), and whatever the point reaches inside it (no hit, the node itself, anything under it) is its
  // unrecorded interior, kept unguarded and said so.
  if let currentFrame, !holdsPoint(currentFrame, point) { return finished(judged(.frameMoved)) }
  // #298's rule `relabelled`: the node on its own handle, its frame read now holding the point, relabelled in place. A
  // node the record holds incompletely is judged too (the design session's 2db3ba75), before its interior is kept.
  if nodeFrame != nil, let now = relabelledLabel(node, reads) {
    var refused = judged(.relabelled)
    refused.labelNow = now
    return refused
  }
  // #316's rule G: a node the screenshot showed in a web area is judged only by a hit in that same web area, its nearest
  // one in the record (so an iframe's hit passes inside the page's, and a page's inside its iframe's own). The hit that is
  // the node's own handle is in it by the record; an empty hit is judged as before.
  var chain: [Element]?
  if let hit, let area = node.webArea, !reads.same(hit, node.element) {
    let walk = liesIn(hit, area, reads)
    webAreaReads = walk.reads
    if !walk.inside { return finished(judged(.otherWebArea)) }
    chain = walk.chain
  }
  func judgedByHit() -> StalePointVerdict<Element> {
    if !node.subtreeRecorded, hit.map({ reads.same($0, current) || isInside($0, current, reads) }) ?? true {
      return judged(.unrecordedDescendant)
    }
    guard let hit else { return judged(.noHit) }
    if reads.same(hit, current) { return judged(.sameElement) }
    guard let hitRole, stalePointInteractiveRoles.contains(hitRole) else { return judged(.nonInteractiveHit) }
    if isInside(current, hit, reads) { return judged(.hitAboveNode) }
    // #301: an interactive hit under a strip in the node's recorded subtree whose children the record lacks lies in its
    // unrecorded interior (a collapsed container's control the budget cut), so the node, which passed as every node does,
    // is all that is checked.
    if insideGap(hit, gaps, reads) { return judged(.unrecordedDescendant) }
    // #305: the hit is itself a recorded node the screenshot showed at the point, in its place.
    if let by = recordedHitAtPoint(hit, at: point, windowShift: windowShift, nodes: nodes, frameless: frameless, recorded: recorded, reads) {
      var kept = judged(.recordedHit)
      kept.recordedHitBy = by
      return kept
    }
    return judged(.interactiveHit)
  }
  let byHit = judgedByHit()
  // #330's rule dL, after #296's checks and rule G: a point they keep in a web area refuses when the hit lies in an element
  // the page added over it since the screenshot (`newElementOverPoint`), judged on G's walk. A refusal keeps its reason.
  guard !byHit.refused, let chain else { return finished(byHit) }
  // The recorded nodes as found now: the node, and a hit #305 kept as a recorded control (its own handle or one
  // re-created in place).
  let found = byHit.reason == .recordedHit ? [current] + (hit.map { [$0] } ?? []) : [current]
  let added = newElementOverPoint(chain: chain, found: found, recorded: recorded, reads: reads)
  if added.reads > 0 { newElementReads = added.reads }
  guard added.found else {
    var kept = byHit
    kept.newElementReads = newElementReads
    return finished(kept)
  }
  return judged(.newElementOverPoint)
}

/// Which frame carried a `recordedHit` (#305, the design session's ruling a27fc57c; the meta's `recordedHitBy`): the
/// hit's own shown frame, or its nearest recorded ancestor's.
enum RecordedHitFrame: String, Equatable { case hit, ancestor }

/// The roles whose frame never carries a recorded hit's point as its nearest recorded ancestor (ruling a27fc57c): areas
/// that hold whole regions of controls, not one control's padding. Nor does an ancestor covering more than this share of
/// the window's area.
let recordedHitAreaRoles: Set<String> = ["AXWindow", "AXWebArea", "AXScrollArea", "AXSplitGroup", "AXApplication"]
let recordedHitAncestorShare: CGFloat = 0.25

/// #305's rule (the design session's rulings 45f5e5be and a27fc57c): whether `element`, an interactive hit (or an
/// element route's target) the verdict would otherwise refuse, is itself a recorded node the screenshot showed at the
/// point, still there, and which frame carried it. All three hold:
/// 1. it is a recorded node: its handle `CFEqual` to a recorded one; else, while that node's own handle reads no frame
///    (gone, as #296 takes a re-created handle only then), #296's re-created identity: its role, its frame within 2 pt of
///    the recorded one moved by `windowShift`, and its label agreeing (`stalePointLabelsAgree`), and, as #296's (#431's
///    ruling 889), not refused by the record (`recreatedRefused`). A hit that is a recorded handle is that node and no
///    other, so a lookalike elsewhere never stands in for it;
/// 2. it has not moved: its frame read now lies within 2 pt of the recorded one moved by the shift;
/// 3. the point the model meant (`point` less the shift) lies in a shown frame (`ScreenshotNode.shown`, what its clipping
///    ancestors left in the image), widened by 2 pt: its own (`.hit`), or else its nearest recorded ancestor's
///    (`.ancestor`; Safari answers its address field anywhere in the toolbar item's padding), when that ancestor has not
///    moved either, is not one of `recordedHitAreaRoles` and covers at most `recordedHitAncestorShare` of the window's
///    area (the record's root). Never an ancestor further up.
/// Read only where the verdict would refuse: the element's frame, role and labels, a frame read per recorded node of its
/// role and frame that its handle does not match, and the ancestor's frame.
func recordedHitAtPoint<Element>(_ element: Element, at point: CGPoint, windowShift: CGVector, nodes: [ScreenshotNode<Element>],
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

/// Whether `element` lies inside one of `gaps` (strips in the chosen node's recorded subtree whose children the record
/// lacks): its parents, read once up to
/// its window, sheet or application (`ancestors`), compared with each. Read only where the verdict would otherwise
/// refuse, and only when the record has a gap.
private func insideGap<Element>(_ element: Element, _ gaps: [Element], _ reads: StalePointReads<Element>) -> Bool {
  guard !gaps.isEmpty else { return false }
  return ancestors(of: element, reads).contains { ancestor in gaps.contains { reads.same(ancestor, $0) } }
}

/// #316's rule W (the design session's ruling 4701abd8): the frontmost window of `pid`'s at layer 0 above `target` in
/// `list` (the window list, front to back) that the screenshot's window list (`recorded`) did not hold; nil when there is
/// none, or when the list does not hold the target, which nothing is then above. Such a window refuses wherever it lies:
/// Safari's address-field overlay takes the next page click anywhere, not only under its bounds. No app is excepted, so
/// Chrome's omnibox popup, also a window of its own, refuses too, which the ruling accepts as one re-observation.
func newWindowAbove(target: CGWindowID, pid: pid_t, recorded: Set<CGWindowID>, list: [ListedWindow]) -> ListedWindow? {
  var found: ListedWindow?
  for window in list {
    if window.number == target { return found }
    if found == nil, window.owner == pid, window.layer == 0, !recorded.contains(window.number) { found = window }
  }
  return nil
}

/// #452: where the app's own hit-test at a coordinate's point answered (Input.swift `windowHit`), the signal the rule reads.
enum PointHitPlace: Equatable {
  /// In the observed window, `inPopover` when its ancestry to the window passed an AXPopover (TextEdit's colour-well
  /// popover, whose own window AX folds into the document window's tree).
  case observedWindow(inPopover: Bool)
  /// In another of the app's windows (Chrome's omnibox and `<datalist>` popups, a permission bubble), its number when read
  /// (only by a timed hit-test, `hitTestOutcome`).
  case otherWindow(CGWindowID?)
  /// No answer, an ancestry that reads to no window, or an answer past `pointHitSignalDeadlineMs`: main's verdict stands.
  case unread
}

/// #452 (design ruling 940): the longest a coordinate's hit-test may take for its answer to count as the rule's signal.
/// The hit-test is main's own, each of its messages bounded by `elementMessagingTimeout` (1 s, AX.swift `prepare`); one
/// that takes longer than this answered an app busy enough that the answer may be stale, so the rule keeps main's verdict.
let pointHitSignalDeadlineMs: Double = 500

/// Which of #452's signals refused (the meta's `stalePoint.by`).
enum AppWindowSignal: String, Equatable {
  /// The app's hit-test answered in another of its windows.
  case axHit
  /// The hit lay in an AXPopover, and the window list holds a window of the app's over the observed one at the point.
  case popover
}

/// #452 (design ruling 928): the app's topmost window at `point` (global, top-left) when it is not `target`, the observed
/// window the pointer's events are stamped to; nil when that is the target, when no window of the app's above it holds the
/// point, or when `list` (front to back) does not hold the target. Read among `pid`'s windows alone (the events go to the
/// process, not through the window server's hit-test, so another app's window takes none of them), at the target's own
/// layer (the child windows the screenshot's desktop-independent capture includes are ordered at their parent's), that
/// show something (alpha above 0). The window list cannot tell a window that ignores mouse events (Chrome's status bubble
/// and hover cards) from one that takes them, so it only confirms the popover signal and never refuses alone
/// (`guardedPointVerdict`).
func appWindowOverPoint(_ point: CGPoint, target: CGWindowID, pid: pid_t, list: [ListedWindow]) -> ListedWindow? {
  guard let observed = list.first(where: { $0.number == target }) else { return nil }
  for window in list {
    if window.number == target { return nil }
    if window.owner == pid, window.layer == observed.layer, window.alpha > 0, window.bounds.contains(point) { return window }
  }
  return nil
}

/// #452's check of the window the app's hit-test answered in (`number`), against the on-screen list (front to back): it
/// covers the point when the list holds it, not transparent (alpha above 0; the review of 023a3bee: run 44822312301's
/// window 44, of alpha 0, over the visible page), its bounds holding the point, and, when the list holds the observed
/// window (`target`), in front of it, at any layer (the review of 023a3bee..e98276d2). A window the list does not hold
/// is not on screen, or the list did not read: false, as for one that no longer covers the point, and main's verdict
/// stands.
func hitWindowCovers(_ number: CGWindowID, point: CGPoint, target: CGWindowID?, list: [ListedWindow]) -> Bool {
  guard let index = list.firstIndex(where: { $0.number == number }) else { return false }
  let window = list[index]
  guard window.alpha > 0, window.bounds.contains(point) else { return false }
  if let target, let observed = list.firstIndex(where: { $0.number == target }) { return index < observed }
  return true
}

/// The guard at a coordinate click's or drag start's point (#296, #316, #452), all before anything is posted: rule W from
/// the window list (`windows`, the on-screen list read at most once, only when there is a target window number: about
/// 0.3 ms, p95 1 ms, with 30 windows on screen on the MacBook) where there is a recorded list to compare; then #452 from
/// where the app's hit-test answered (`place`): in another window of the app's that covers the point in the list
/// (`hitWindowCovers`), at any layer, it refuses (`axHit`); in a
/// popover of the observed window, it refuses when the list holds a window of the app's over the observed one at the
/// point (`popover`); and only when these keep the point, the tree's verdict (`tree`, `stalePointVerdict`). The
/// qualification (kit `probe/337-measure` README ac805945) set the signals: the omnibox popup, Chrome's `<datalist>` popup
/// (layer 999) and a permission bubble answer in their own windows; TextEdit's colour-well popover answers an AXPopover in
/// the document window's tree; Chrome's status bubble and tab hover card, which pass clicks through, answer the observed
/// window's own elements and keep, as does a hit unread or too late, or one in a window of alpha 0, unlisted or
/// unnumbered. Both call sites take this one, so a drag's start is
/// guarded as a click is.
func guardedPointVerdict<Element>(at point: CGPoint, hit: Element?, place: PointHitPlace = .unread, target: CGWindowID?, pid: pid_t,
                                  recorded: Set<CGWindowID>?, windows: () -> [ListedWindow],
                                  tree: () -> StalePointVerdict<Element>) -> StalePointVerdict<Element> {
  var read: [ListedWindow]?
  func list() -> [ListedWindow] {
    if let read { return read }
    let list = windows()
    read = list
    return list
  }
  if let target, let recorded, let new = newWindowAbove(target: target, pid: pid, recorded: recorded, list: list()) {
    return StalePointVerdict(reason: .newWindow, hit: hit, point: point, newWindow: new)
  }
  if let over = appWindowVerdict(at: point, hit: hit, place: place, target: target, pid: pid, windows: list) { return over }
  return tree()
}

/// #452's refusal from where a hit-test answered (`place`): in another window of the app's that covers the point in the
/// list (`axHit`), or in a popover of the observed window with a window of the app's over the observed one at the point
/// (`popover`); nil otherwise. It carries the over window's layer and the observed one's (#453's `OverlayClick` reads
/// them). `guardedPointVerdict` runs it on the action's hit-test, and #442's check on its re-hit after the wait, with a
/// list read then (`windows`, read only when a rule needs it, once per verdict).
func appWindowVerdict<Element>(at point: CGPoint, hit: Element?, place: PointHitPlace, target: CGWindowID?, pid: pid_t,
                               windows: () -> [ListedWindow]) -> StalePointVerdict<Element>? {
  var read: [ListedWindow]?
  func list() -> [ListedWindow] {
    if let read { return read }
    let list = windows()
    read = list
    return list
  }
  func over(_ number: CGWindowID, _ by: AppWindowSignal) -> StalePointVerdict<Element> {
    let list = list()
    return StalePointVerdict(reason: .appWindowOverPoint, hit: hit, point: point, overWindow: number, overBy: by,
                             overLayer: list.first { $0.number == number }?.layer,
                             observedLayer: target.flatMap { target in list.first { $0.number == target }?.layer })
  }
  switch place {
  case .otherWindow(let number):
    // Only a window the screenshot can have shown over the point (`hitWindowCovers`); otherwise main's verdict.
    if let number, hitWindowCovers(number, point: point, target: target, list: list()) { return over(number, .axHit) }
  case .observedWindow(inPopover: true):
    if let target, let window = appWindowOverPoint(point, target: target, pid: pid, list: list()) { return over(window.number, .popover) }
  case .observedWindow(inPopover: false), .unread: break
  }
  return nil
}

/// The meta's `stalePoint` (#296): what the guard decided ("kept" | "refused"), why, how it found the node, the recorded
/// node's role and the hit's, for `recordedHit` the frame that carried it (`recordedHitBy`), its time (both checks' when
/// there were two), and `rechecked` when an element route's wait
/// made it run again before the press (`StalePointGate`), whose verdict this then is. Value-free: roles and enumeration
/// words.
struct StalePointRecord: Equatable {
  enum Verdict: String { case kept, refused }
  let verdict: Verdict
  let reason: StalePointReason
  let identity: StalePointIdentity?
  let recordedRole: String?
  let hitRole: String?
  /// For `recordedHit` (#305, ruling a27fc57c): whether the hit's own shown frame or its nearest recorded ancestor's
  /// carried the point.
  let recordedHitBy: RecordedHitFrame?
  let ms: Double
  var rechecked = false
  /// The check that answered ran after the route's focus hold had activated the app (`pressAfterFinalCheck`): a refusal
  /// then pressed nothing, but the activation ran.
  var afterActivation = false
  /// #316's costs, apart from `ms`, which covers them: rule W's window-list read and check, and rule G's parent reads.
  var windowsMs: Double?
  let webAreaReads: Int?
  /// #330's rule dL's reads (`StalePointVerdict.newElementReads`), also inside `ms`.
  let newElementReads: Int?
  /// For `newWindow`, the new window's number.
  let newWindow: CGWindowID?
  /// For `appWindowOverPoint` (#452), the number of the app's window over the observed one at the point (0 unread), and
  /// the signal that found it (`by`).
  let overWindow: CGWindowID?
  let overBy: AppWindowSignal?
  /// #452 (design ruling 940): how long the coordinate's hit-test took, the AX reads #452's signal comes from; set by the
  /// guard's caller.
  var hitMs: Double?
  /// #433: the role of the recorded control beneath the node that the guard judged too, and how it was found.
  let underlyingRole: String?
  let underlyingIdentity: StalePointIdentity?
  /// #443: for `controlGone`, the role of the recorded control found gone; #442: for `otherControlOnTop`, the role of
  /// the live control on top.
  let controlRole: String?
  /// #442: whether the guard took the hit again after `stalePointCorrectionMs` (Chromium, on its two keep paths), and
  /// whether that answer named the first one's element.
  let hitCorrection: StalePointHitCorrection?
  /// #481: "corrected" when the element route pressed the recorded control #442's corrected hit lies in
  /// (`StalePointVerdict.routeControl`); stamped by the route on whatever record stands when it ends, so a later check's
  /// record keeps it. Absent: the route, if any, came from the action's own hit.
  var routeHit: String?
  /// #481 (ruling 1109): with `routeHit`, which recorded control was pressed (`StalePointRouteControl`), stamped the same way.
  var routeControl: String?

  init<Element>(_ verdict: StalePointVerdict<Element>, ms: Double, rechecked: Bool = false) {
    self.verdict = verdict.refused ? .refused : .kept
    reason = verdict.reason
    identity = verdict.identity
    recordedRole = verdict.node?.role
    hitRole = verdict.hitRole
    recordedHitBy = verdict.recordedHitBy
    webAreaReads = verdict.webAreaReads
    newElementReads = verdict.newElementReads
    newWindow = verdict.newWindow?.number
    overWindow = verdict.overWindow
    overBy = verdict.overBy
    underlyingRole = verdict.underlying?.role
    underlyingIdentity = verdict.underlyingIdentity
    controlRole = verdict.reason == .controlGone ? verdict.node?.controlRole
      : verdict.reason == .otherControlOnTop ? verdict.onTopRole : nil
    hitCorrection = verdict.hitCorrection
    self.ms = ms
    self.rechecked = rechecked
  }

  var wire: [String: Any] {
    var wire: [String: Any] = ["verdict": verdict.rawValue, "reason": reason.rawValue, "ms": (ms * 1000).rounded() / 1000]
    if let identity { wire["identity"] = identity.rawValue }
    if let recordedRole { wire["recordedRole"] = recordedRole }
    if let hitRole { wire["hitRole"] = hitRole }
    if let recordedHitBy { wire["recordedHitBy"] = recordedHitBy.rawValue }
    if let windowsMs { wire["windowsMs"] = (windowsMs * 1000).rounded() / 1000 }
    if let webAreaReads { wire["webAreaReads"] = webAreaReads }
    if let newElementReads { wire["newElementReads"] = newElementReads }
    if let newWindow { wire["newWindow"] = Int(newWindow) }
    if let overWindow { wire["overWindow"] = Int(overWindow) }
    if let overBy { wire["by"] = overBy.rawValue }
    if let hitMs { wire["hitMs"] = (hitMs * 1000).rounded() / 1000 }
    if let underlyingRole { wire["underlyingRole"] = underlyingRole }
    if let underlyingIdentity { wire["underlyingIdentity"] = underlyingIdentity.rawValue }
    if let controlRole { wire["controlRole"] = controlRole }
    if let hitCorrection { wire["hitCorrection"] = hitCorrection.rawValue }
    if let routeHit { wire["routeHit"] = routeHit }
    if let routeControl { wire["routeControl"] = routeControl }
    if rechecked { wire["rechecked"] = true }
    if afterActivation { wire["afterActivation"] = true }
    return wire
  }
}

/// What an element route (#282's press, #283's focus) may act on at a kept point (the design session's ruling 1ea561bc
/// ca82a6f4): the node the screenshot showed there as found now, or an ancestor of it (the control the walk reached
/// from the hit through plain children), or anything inside a node whose children the record does not all hold and
/// which itself passed (the `unrecordedDescendant` limit, its reason then that one), or a recorded node the screenshot
/// showed at the point and still there (`recordedHit`, #305), or anything at a point no recorded node holds
/// (`unrecorded`). Otherwise the verdict becomes `pressedOther`, refused.
func stalePointPressVerdict<Element>(_ pressed: Element, _ verdict: StalePointVerdict<Element>,
                                     reads: StalePointReads<Element>) -> StalePointVerdict<Element> {
  guard !verdict.refused, let node = verdict.node, let current = verdict.current else { return verdict }
  if reads.same(pressed, current) || isInside(current, pressed, reads) { return verdict }
  func judged(_ reason: StalePointReason) -> StalePointVerdict<Element> {
    var judged = StalePointVerdict(reason: reason, node: node, identity: verdict.identity, current: current, hitRole: reads.role(pressed),
                                   hit: pressed, gaps: verdict.gaps, point: verdict.point, windowShift: verdict.windowShift,
                                   nodes: verdict.nodes, frameless: verdict.frameless, recorded: verdict.recorded,
                                   webAreaReads: verdict.webAreaReads,  // #316: the hit's walk, which this verdict was judged after
                                   newElementReads: verdict.newElementReads)  // #330: and rule dL's reads on it
    (judged.underlying, judged.underlyingIdentity) = (verdict.underlying, verdict.underlyingIdentity)  // #433: the check ran
    judged.hitCorrection = verdict.hitCorrection  // #442: and the hit was taken again
    return judged
  }
  // Inside a node the record holds incompletely, or under one of its strips whose children it lacks (#301).
  if (!node.subtreeRecorded && isInside(pressed, current, reads)) || insideGap(pressed, verdict.gaps, reads) {
    return judged(.unrecordedDescendant)
  }
  // #305: the element is itself a recorded node the screenshot showed at the point, in its place.
  if let point = verdict.point,
     let by = recordedHitAtPoint(pressed, at: point, windowShift: verdict.windowShift, nodes: verdict.nodes, frameless: verdict.frameless,
                                 recorded: verdict.recorded, reads) {
    var kept = judged(.recordedHit)
    kept.recordedHitBy = by
    return kept
  }
  return judged(.pressedOther)
}

/// The hit an action's element route is built from after the guard (the review of c8f37a93..7f79ca34): the action's own,
/// unless the guard's re-hit recovered another (`stalePointRehits`), whose view the action then classifies again.
enum StalePointRouteHit<Element> {
  case unchanged
  case recovered(Element)
}

func stalePointRouteHit<Element>(_ hit: Element?, _ verdict: StalePointVerdict<Element>, same: (Element, Element) -> Bool) -> StalePointRouteHit<Element> {
  guard let judged = verdict.hit else { return .unchanged }
  if let hit, same(hit, judged) { return .unchanged }
  return .recovered(judged)
}

/// #296's order at an element route's press (the review of c8f37a93..7f79ca34): the focus hold first when the app does
/// not believe it has focus (`hold`, whose activation guard polls), then the final check of the element about to be
/// acted on (`finalCheck`, told whether a hold ran, so whether a wait may have come since the early check), then the
/// action. A refusal there leaves the hold as every refusal after it does (FocusHold.swift).
func pressAfterFinalCheck(holds: Bool, hold: () throws -> Void, finalCheck: (_ afterHold: Bool) throws -> Void,
                          perform: () throws -> Void) throws {
  if holds { try hold() }
  try finalCheck(holds)
  try perform()
}

/// What an element route's recheck answered (`StalePointGate.recheck`): its verdict, and the costs the record carries for
/// it (#456): its own hit-test's time (`hitMs`, the hit #452's rule judged then) and its window-list read (`windowsMs`,
/// none when #452's rule read no list).
struct StalePointRecheck<Element> {
  let verdict: StalePointVerdict<Element>
  var hitMs: Double?
  var windowsMs: Double?

  init(_ verdict: StalePointVerdict<Element>, hitMs: Double? = nil, windowsMs: Double? = nil) {
    self.verdict = verdict
    self.hitMs = hitMs
    self.windowsMs = windowsMs
  }
}

/// #296's check where a kept point is carried by an element route: the first verdict (the click's), and the guard run
/// again at the point with a fresh hit-test (`recheck`, `recheckedPointVerdict`: #452's rule on that hit-test first,
/// #456), which the route asks for when it waited (#282's action re-read, #283's focus settle and box re-read; up to
/// `webAreaRereadDeadline`) since the page can change meanwhile, and a window of the app's own can open over the point.
struct StalePointGate<Element> {
  let first: StalePointVerdict<Element>
  let firstMs: Double
  /// The first check's window-list read (#316's rule W, `StalePointRecord.windowsMs`), which the record this gate
  /// answers replaces in the meta: it is kept there, with every recheck's own read added (`costs`).
  var firstWindowsMs: Double? = nil
  /// The first check's hit-test time (#452, `StalePointRecord.hitMs`), carried on the same way until a recheck takes
  /// a hit-test of its own; then the latest recheck's.
  var firstHitMs: Double? = nil
  /// The app a refusal's sentence names (#452's names it).
  var app = "The app"
  let recheck: () -> StalePointRecheck<Element>
  /// What the checks so far cost, which each record carries whole (the review of edbfbd23..e1a01d42, P2): a route's
  /// final check after its focus hold replaces the early check's record in the meta, so the time and window-list reads
  /// add up across every check this gate ran, and the hit-test time is the last hit-test's.
  private let costs: StalePointGateCosts

  /// The first check's verdict and its record (`Engine.stalePointGuard`'s), whose time and window-list read this gate's
  /// record carries on.
  init(first: StalePointVerdict<Element>, record: StalePointRecord, app: String = "The app",
       recheck: @escaping () -> StalePointRecheck<Element>) {
    self.init(first: first, firstMs: record.ms, firstWindowsMs: record.windowsMs, firstHitMs: record.hitMs, app: app, recheck: recheck)
  }

  init(first: StalePointVerdict<Element>, firstMs: Double, firstWindowsMs: Double? = nil, firstHitMs: Double? = nil,
       app: String = "The app", recheck: @escaping () -> StalePointRecheck<Element>) {
    self.first = first
    self.firstMs = firstMs
    self.firstWindowsMs = firstWindowsMs
    self.firstHitMs = firstHitMs
    self.app = app
    self.recheck = recheck
    costs = StalePointGateCosts(ms: firstMs, windowsMs: firstWindowsMs, hitMs: firstHitMs)
  }

  /// The verdict on `pressed` just before the route acts on it: the first one, or after a wait the recheck's, each
  /// judged by `stalePointPressVerdict`; its record (`rechecked` after a wait; the time and window-list reads of every
  /// check so far, the first's included; the hit-test time of the last hit judged) and its refusal.
  func check(_ pressed: Element, waited: Bool, afterActivation: Bool = false, now: () -> Double,
             reads: StalePointReads<Element>) -> (record: StalePointRecord, refusal: EngineError?) {
    let started = now()
    let rechecked = waited ? recheck() : nil
    var verdict = stalePointPressVerdict(pressed, rechecked?.verdict ?? first, reads: reads)
    // #481 (ruling 1123): the control the route presses from #442's corrected hit qualifies again after a wait or a
    // focus hold, on its own label-checked test, whatever the fresh check's correction: main's broader press verdict
    // would take a relabelled ancestor of a child (`hitAboveNode`).
    if let rechecked, !verdict.refused, let record = first.routeRecord, let control = first.routeControl, reads.same(control, pressed),
       let point = first.point, let failed = routeQualification(record, at: point, hit: rechecked.verdict.hit, reads) {
      verdict = StalePointVerdict(reason: failed.reason, node: record, identity: .handle, current: pressed, point: point,
                                  windowShift: first.windowShift, nodes: first.nodes, frameless: first.frameless)
      verdict.labelNow = failed.labelNow
    }
    costs.ms += now() - started
    if let rechecked {
      if let again = rechecked.windowsMs { costs.windowsMs = (costs.windowsMs ?? 0) + again }
      costs.hitMs = rechecked.hitMs
    }
    let outcome = stalePointOutcome(verdict, ms: costs.ms, afterActivation: afterActivation, app: app, reads: reads)
    var record = outcome.record
    record.windowsMs = costs.windowsMs
    record.hitMs = costs.hitMs
    record.rechecked = waited
    record.afterActivation = afterActivation
    return (record, outcome.refusal)
  }
}

/// `StalePointGate`'s running costs (`StalePointGate.costs`).
private final class StalePointGateCosts {
  var ms: Double
  var windowsMs: Double?
  var hitMs: Double?

  init(ms: Double, windowsMs: Double?, hitMs: Double?) {
    self.ms = ms
    self.windowsMs = windowsMs
    self.hitMs = hitMs
  }
}

/// The first check a field route (#283's focus, #315's press) makes once its field is resolved: #359's pending-click
/// wait first (`awaitPendingClick`, answering whether it waited: up to `pendingClickCapMs` after a recent pointer press),
/// then #296's check of the field, rechecked when that wait ran (the review of edbfbd23..e1a01d42, P2), since a window
/// of the app's own can open over the point meanwhile and no later wait need follow. Nil without a gate.
func fieldRouteFirstCheck<Element>(_ field: Element, gate: StalePointGate<Element>?, awaitPendingClick: () -> Bool,
                                   now: () -> Double, reads: StalePointReads<Element>)
  -> (record: StalePointRecord, refusal: EngineError?)? {
  let waited = awaitPendingClick()
  return gate?.check(field, waited: waited, now: now, reads: reads)
}

/// #456: the guard an element route runs again at its point after a wait (`StalePointGate.recheck`): #452's rule
/// (`guardedPointVerdict`) on the recheck's own fresh, timed hit-test (`hit`, `hitTestOutcome`), so a window of the app's
/// own that opened over the point during the wait (Chrome's omnibox popup, TextEdit's colour-well popover) is refused as
/// at the first check, the window list read only when that hit-test's place asks for it; a hit unread or past
/// `pointHitSignalDeadlineMs`, or one in the observed window with nothing of the app's over it, keeps the tree's verdict
/// on the same hit (`tree`), as before. #316's rule W ran at the first check and is not run again (no recorded list).
func recheckedPointVerdict<Element>(at point: CGPoint, hit: WindowHit<Element>, target: CGWindowID?, pid: pid_t,
                                    windows: () -> [ListedWindow],
                                    tree: (Element?) -> StalePointVerdict<Element>) -> StalePointVerdict<Element> {
  guardedPointVerdict(at: point, hit: hit.element, place: hit.place, target: target, pid: pid, recorded: nil, windows: windows) {
    tree(hit.element)
  }
}

/// An element as a refusal's sentence names it: its role and its label (`stalePointLabel`: the title, else the
/// description, else an AXStaticText's value), in quotes (`stalePointShownLabel`).
func stalePointName(role: String?, title: String?, description: String?, value: String? = nil) -> String {
  let role = role ?? "element"
  guard let label = stalePointLabel(title: title, description: description, value: value) else { return role }
  return "\(role) \"\(stalePointShownLabel(label))\""
}

/// A label as a refusal's sentence quotes it: at most 60 characters.
func stalePointShownLabel(_ label: String) -> String {
  label.count > 60 ? String(label.prefix(60)) + "…" : label
}

/// The guard's refusal (#296): the screenshot's element at the point and what became of it, what the point reaches now,
/// and the re-observation that lets the model aim again. Nothing was posted. For `relabelled` (#298), `label` is the
/// label the element reads now.
func screenChangedSinceScreenshot(was: String, reason: StalePointReason, now: String?, label: String? = nil,
                                  afterActivation: Bool = false) -> EngineError {
  let there = now.map { "; \($0) is there now" } ?? ""
  let sent = afterActivation ? "The app was activated in the background, but nothing was pressed." : "Nothing was sent."
  // #298: the element is still there, its own handle, but reads another label.
  if reason == .relabelled, let label {
    return EngineError(name: "screenChangedSinceScreenshot",
      "The screen changed since the screenshot: the \(was) it showed at this point now reads \"\(stalePointShownLabel(label))\". \(sent) Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
  }
  // #330's rule dL: the recorded element is still there, under something the page added; dismissing that is a way on too.
  if reason == .newElementOverPoint {
    return EngineError(name: "screenChangedSinceScreenshot",
      "The screen changed since the screenshot: a new element, such as a suggestion list or popup, has appeared over the \(was) it showed at this point\(there). \(sent) Call getScreenshot for a new screenshot, or press Escape to dismiss what appeared, before clicking.")
  }
  let change: String
  switch reason {
  case .frameMoved: change = "has moved away from it"
  case .interactiveHit, .pressedOther: change = "is no longer what it reaches"
  case .otherWebArea: change = "is in a page the point no longer reaches"
  default: change = "is gone"
  }
  return EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: the \(was) it showed at this point \(change)\(there). \(sent) Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
}

/// #433's refusal (design ruling 905, condition 1): the point lies on an element that does not act on its own (`over`,
/// an overlay or a decoration), and the recorded control a click there reaches (`control`) moved or changed. The same
/// name as the guard's other refusals; its sentence says that the same point would reach whatever is under the layer
/// now, so the model aims again from a new screenshot rather than retrying it. For `relabelled`, `label` is the label
/// the control reads now.
func controlUnderInertChanged(over: String, control: String, reason: StalePointReason, label: String?,
                              afterActivation: Bool = false) -> EngineError {
  let sent = afterActivation ? "The app was activated in the background, but nothing was pressed." : "Nothing was sent."
  let change: String
  switch reason {
  case .frameMoved: change = "has moved away from the point"
  case .relabelled: change = label.map { "now reads \"\(stalePointShownLabel($0))\"" } ?? "has changed"
  default: change = "is gone or was replaced"
  }
  return EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: the point lies on an \(over) that does not act on its own, over the \(control) the screenshot showed there, which a click passes through to; that control \(change). \(sent) Call getScreenshot for a new screenshot and aim again from what it shows; the same point would reach whatever lies under the \(over) now.")
}

/// #443's refusal: the point lies on an element that does not act on its own (`node`, a decoration or a label), inside
/// the recorded control the screenshot showed it in (`control`), and that control is gone while the element lives on,
/// so a click there reaches whatever the element lies in now. The same name as the guard's other refusals.
func inertOutlivedControl(node: String, control: String, afterActivation: Bool = false) -> EngineError {
  let sent = afterActivation ? "The app was activated in the background, but nothing was pressed." : "Nothing was sent."
  return EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: the point lies on an \(node) that does not act on its own, inside the \(control) the screenshot showed there; that control is gone, and the \(node) now lies in whatever replaced it. \(sent) Call getScreenshot for a new screenshot and aim again from what it shows.")
}

/// #442's refusal: the corrected hit at the point lies in a live control (`top`) the screenshot showed elsewhere, now
/// drawn over what it showed at the point (`shown`: the control beneath an inert layer, else the element there), which a
/// click would reach instead. The same name as the guard's other refusals.
func otherControlOnTopRefusal(top: String, shown: String, afterActivation: Bool = false) -> EngineError {
  let sent = afterActivation ? "The app was activated in the background, but nothing was pressed." : "Nothing was sent."
  return EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: the \(top) now lies on top at this point, over the \(shown) the screenshot showed there, and a click would reach it. \(sent) Call getScreenshot for a new screenshot and aim again from what it shows.")
}

/// #316's rule W's refusal: the same name as the guard's other refusals, since the model's remedy is the same (a new
/// screenshot first), with its own sentence, since no element of the screenshot's is at fault. Nothing was posted.
func newWindowOverScreenshot(app: String) -> EngineError {
  EngineError(name: "screenChangedSinceScreenshot",
    "The screen changed since the screenshot: \(app) has opened a window over the one the screenshot showed, which can take the click. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.")
}

/// #452's refusal (design ruling 928): a window of the app's own lies over the observed one at the point, and the click,
/// stamped to the observed window, would reach that window's content under it. The screenshot may well have shown that
/// window (#337: Chrome's omnibox popup open at the observation), so nothing is said to have changed and no page is
/// blamed; the sentence names the ways through: keys for the overlay, or an element the tree holds. Nothing was posted.
func appWindowOverPointRefusal(app: String, afterActivation: Bool = false) -> EngineError {
  let sent = afterActivation ? "The app was activated in the background, but nothing was pressed." : "Nothing was sent."
  return EngineError(name: "appWindowOverPoint",
    "\(app) has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. \(sent) Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getAXState() and click an element it lists.")
}

/// The guard's outcome at a point: its meta record, and the refusal to throw (nil when it kept the pointer). The refusal
/// names what is there now (the verdict's hit; for `pressedOther` the element the route would act on) only when it is
/// known (its role read) and is not the node itself (Chrome's hit-test may still answer a moved control's handle at its
/// old point); otherwise it names nothing there. A `newWindow` or `appWindowOverPoint` refusal names the app (`app`).
func stalePointOutcome<Element>(_ verdict: StalePointVerdict<Element>, ms: Double, afterActivation: Bool = false, app: String = "The app",
                                reads: StalePointReads<Element>) -> (record: StalePointRecord, refusal: EngineError?) {
  let record = StalePointRecord(verdict, ms: ms)
  if verdict.reason == .newWindow { return (record, newWindowOverScreenshot(app: app)) }
  if verdict.reason == .appWindowOverPoint { return (record, appWindowOverPointRefusal(app: app, afterActivation: afterActivation)) }
  guard verdict.refused, let node = verdict.node else { return (record, nil) }
  if verdict.reason == .controlGone {
    let control = node.control.flatMap { control in (verdict.nodes + verdict.frameless).first { reads.same($0.element, control) } }
    return (record, inertOutlivedControl(
      node: stalePointName(role: node.role, title: node.title, description: node.description, value: node.value),
      control: control.map { stalePointName(role: $0.role, title: $0.title, description: $0.description, value: $0.value) }
        ?? node.controlRole ?? "control",
      afterActivation: afterActivation))
  }
  if verdict.reason == .otherControlOnTop, let top = verdict.onTop {
    // What the screenshot showed there: #433's control beneath, else the node's recorded control, else the node.
    let shown = verdict.underlying
      ?? node.control.flatMap { control in (verdict.nodes + verdict.frameless).first { reads.same($0.element, control) } } ?? node
    return (record, otherControlOnTopRefusal(
      top: stalePointName(role: verdict.onTopRole, title: reads.title(top), description: reads.description(top),
                          value: verdict.onTopRole == "AXStaticText" ? reads.value(top) : nil),
      shown: stalePointName(role: shown.role, title: shown.title, description: shown.description, value: shown.value),
      afterActivation: afterActivation))
  }
  if verdict.underlyingRefused, let control = verdict.underlying {
    return (record, controlUnderInertChanged(
      over: stalePointName(role: node.role, title: node.title, description: node.description, value: node.value),
      control: stalePointName(role: control.role, title: control.title, description: control.description, value: control.value),
      reason: verdict.reason, label: verdict.labelNow, afterActivation: afterActivation))
  }
  let was = stalePointName(role: node.role, title: node.title, description: node.description, value: node.value)
  var now: String?
  if verdict.reason != .relabelled, let hit = verdict.hit, let role = verdict.hitRole, !(verdict.current.map { reads.same(hit, $0) } ?? false) {
    now = stalePointName(role: role, title: reads.title(hit), description: reads.description(hit))
  }
  return (record, screenChangedSinceScreenshot(was: was, reason: verdict.reason, now: now, label: verdict.labelNow,
                                               afterActivation: afterActivation))
}

extension ConnectionState {
  /// The screenshot coordinates are placed in (`ObservedScreenshot`: its recorded nodes and its window's origin then).
  func observedScreenshot(app: ResolvedApp) -> ObservedScreenshot? { lineages[app.key]?.screenshot }
}

extension Engine {
  /// #442: whether the app's AX hit-test answers a new point approximately first and corrects it later: a Chromium-family
  /// app (`PageEngine.chromium`, by its Info.plist's principal class: Chrome, Chrome for Testing, Electron), as every other
  /// Chromium-specific rule here decides it.
  func stalePointCorrectsLate(_ app: ResolvedApp) -> Bool { webAccessibility.pageEngine(app.appPath) == .chromium }

  /// #442 with #452: the window check on the re-hit after the wait, with the window list read afresh (a window of the
  /// app's may have opened over the point meanwhile).
  func stalePointWindowCheck(at point: CGPoint, target: CGWindowID?, pid: pid_t, windows: @escaping () -> [ListedWindow])
    -> (WindowHit<AXUIElement>) -> StalePointVerdict<AXUIElement>? {
    { again in appWindowVerdict(at: point, hit: again.element, place: again.place, target: target, pid: pid, windows: windows) }
  }

  /// The guard at a coordinate pointer's posted point, live (`stalePointVerdict` over the Accessibility API), with `hit` the
  /// hit-test the action already took there and `windowOrigin` the origin of the window the point was placed in, now; its
  /// time covers the reads it adds. `rehit` hit-tests the point again (the action's own hit-test). `windowID` is the number
  /// of the window the point was placed in, which #316's rule W looks above among `appPid`'s windows. `place` is where
  /// that hit-test answered, #452's signal, and `hitMs` its time (the meta's `hitMs`). `hitTest` is the bare hit-test at
  /// the point with where it answered, which #442's check takes again after `stalePointCorrectionMs` on a Chromium app
  /// (`correctedHit`) and puts through #452's window check (`stalePointWindowCheck`); it never stands in for the action's
  /// own hit, whose outcome later steps read.
  func stalePointGuard(at point: CGPoint, windowOrigin: CGPoint, windowID: CGWindowID?, hit: AXUIElement?, place: PointHitPlace,
                       hitMs: Double?, rehit: () -> AXUIElement?, hitTest: @escaping () -> WindowHit<AXUIElement>, app: ResolvedApp,
                       appPid: pid_t, context: ExecutionContext)
    -> (record: StalePointRecord, refusal: EngineError?, verdict: StalePointVerdict<AXUIElement>, shift: CGVector) {
    let started = monotonicMilliseconds()
    let correctedHit = stalePointCorrectsLate(app) ? hitTest : nil
    let reads = StalePointReads<AXUIElement>.live
    let screenshot = context.connection.observedScreenshot(app: app)
    let shift = screenshot.map { CGVector(dx: windowOrigin.x - $0.windowOrigin.x, dy: windowOrigin.y - $0.windowOrigin.y) } ?? .zero
    var windowsMs: Double?
    func timedList() -> [ListedWindow] {
      let read = monotonicMilliseconds()
      defer { windowsMs = (windowsMs ?? 0) + monotonicMilliseconds() - read }
      return onScreenWindowList()
    }
    let verdict = guardedPointVerdict(at: point, hit: hit, place: place, target: windowID, pid: appPid, recorded: screenshot?.windowList,
                                      windows: timedList) {
      stalePointVerdict(at: point, windowShift: shift, nodes: screenshot?.nodes ?? [], frameless: screenshot?.frameless ?? [],
                        recorded: { screenshot?.recorded[ElementKey(element: $0)] }, hit: hit, rehit: rehit, sleep: { usleep(UInt32($0 * 1000)) },
                        correctedHit: correctedHit,
                        windowCheck: stalePointWindowCheck(at: point, target: windowID, pid: appPid, windows: timedList), reads: reads)
    }
    var outcome = stalePointOutcome(verdict, ms: monotonicMilliseconds() - started, app: app.displayName, reads: reads)
    outcome.record.windowsMs = windowsMs
    outcome.record.hitMs = verdict.correctedHitMs ?? hitMs
    return (outcome.record, outcome.refusal, verdict, shift)
  }

  /// The guard again at a point an element route was given (`StalePointGate.recheck`), its hit-test taken fresh and
  /// timed (`hitTestOutcome`): #452's rule on it, then `stalePointVerdict` (`recheckedPointVerdict`, #456). `windowID` is
  /// the number of the window the point was placed in, as for the first check.
  func stalePointRecheck(at point: CGPoint, shift: CGVector, window: AXUIElement, windowID: CGWindowID?, appPid: pid_t,
                         app: ResolvedApp, context: ExecutionContext) -> StalePointRecheck<AXUIElement> {
    let rehit = { hitTest(window: window, pid: appPid, at: point) }
    let correctedHit = stalePointCorrectsLate(app) ? { hitTestOutcome(window: window, pid: appPid, at: point, now: monotonicMilliseconds) } : nil
    let screenshot = context.connection.observedScreenshot(app: app)
    let fresh = hitTestOutcome(window: window, pid: appPid, at: point, now: monotonicMilliseconds)
    var windowsMs: Double?
    func timedList() -> [ListedWindow] {
      let read = monotonicMilliseconds()
      defer { windowsMs = (windowsMs ?? 0) + monotonicMilliseconds() - read }
      return onScreenWindowList()
    }
    let verdict = recheckedPointVerdict(at: point, hit: fresh, target: windowID, pid: appPid, windows: timedList) { hit in
      stalePointVerdict(at: point, windowShift: shift, nodes: screenshot?.nodes ?? [], frameless: screenshot?.frameless ?? [],
                        recorded: { screenshot?.recorded[ElementKey(element: $0)] }, hit: hit, rehit: rehit, sleep: { usleep(UInt32($0 * 1000)) },
                        correctedHit: correctedHit,
                        windowCheck: stalePointWindowCheck(at: point, target: windowID, pid: appPid, windows: timedList), reads: .live)
    }
    return StalePointRecheck(verdict, hitMs: verdict.correctedHitMs ?? fresh.ms, windowsMs: windowsMs)
  }
}
