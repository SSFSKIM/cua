import ApplicationServices
import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// #458 (design rulings 977 and 979, PopUpPoint.swift): a kept coordinate click on a closed pop-up button, over fakes
// built from the shapes #458's kit measured (run 44877626226, results.json; scripts/probe-337/README.md §#458):
// - TextEdit's font pop-up: an AXPopUpButton in the document window, actions [AXShowMenu, AXPress], no AXExpanded, the
//   guard's `sameElement` on it; its menu a layer-101 window of TextEdit's over the button.
// - Chrome's `<select>` (416, 159, 57×19): an AXPopUpButton in the page, actions [AXPress, AXShowMenu,
//   AXScrollToVisible], AXExpanded false, and no AXMenu child while closed (`openerMenus: []`, 125/125 rows); the
//   deepest recorded node at the point is one of its options, an AXMenuItem under it (`hitAboveNode`, recorded role
//   AXMenuItem, 15/15). Pressed: AXExpanded true, an AXMenu child, and window 45 at layer 101, (404, 154, 77×82).
// - TextEdit's font-size combo box (715, 70, 52×22): an AXComboBox with actions [AXShowMenu, AXConfirm], AXExpanded false;
//   its arrow hit-tests and is recorded as an AXButton child of it (`sameElement`, 15/15).
// Finder's window lies in front of the app's observed window until a menu opens, which raises the app's above it.

final class PopUpPointTests: XCTestCase {
  private final class Node {
    let role: String
    var enabled: Bool? = true
    var actions: [String]? = ["AXShowMenu", "AXPress"]
    var frame: CGRect?
    var expanded: Bool?
    /// What its AXDOMClassList read answers: AppKit's is unsupported (#469's measurement).
    var viewClass: PopUpViewClass = .unsupported
    /// Its AXParent read fails now.
    var parentFails = false
    /// Runs as its AXExpanded is read (time passing in a read).
    var onExpandedRead: (() -> Void)?
    weak var parent: Node?
    var children: [Node] = []

    init(_ role: String, frame: CGRect? = nil, parent: Node? = nil) {
      self.role = role
      self.frame = frame
      if let parent { self.parent = parent; parent.children.append(self) }
    }
  }

  private let app: pid_t = 501
  private let finder: pid_t = 300
  private let observed: CGWindowID = 28
  private let fontFrame = CGRect(x: 535, y: 70, width: 159, height: 22)
  private let fontPoint = CGPoint(x: 586, y: 81)
  private let selectFrame = CGRect(x: 416, y: 159, width: 57, height: 19)
  private let selectPoint = CGPoint(x: 445, y: 169)
  private let comboFrame = CGRect(x: 715, y: 70, width: 52, height: 22)
  private let arrowPoint = CGPoint(x: 760, y: 81)
  private lazy var person = ListedWindow(number: 40, owner: finder, layer: 0, bounds: CGRect(x: 0, y: 40, width: 380, height: 300))
  private lazy var appWindow = ListedWindow(number: observed, owner: app, layer: 0, bounds: CGRect(x: 400, y: 31, width: 620, height: 679))
  /// AppKit's menu, over the button.
  private lazy var fontMenu = ListedWindow(number: 77, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 535, y: 44, width: 159, height: 660))
  /// Chrome's `<select>` list as measured.
  private lazy var selectMenu = ListedWindow(number: 45, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 404, y: 154, width: 77, height: 82))
  /// The window list now (front to back; nil: the read fails), which a fake press changes; how often it was read.
  private lazy var list: [ListedWindow]? = [person, appWindow]
  private var listReads = 0
  private var frontmost = false

  private var reads: PopUpReads<Node> {
    PopUpReads(role: { $0.role }, parent: { $0.parentFails ? nil : $0.parent }, children: { $0.children }, enabled: { $0.enabled }, actions: { $0.actions },
               frame: { $0.frame }, expanded: { node in node.onExpandedRead?(); return node.expanded }, same: { $0 === $1 },
               viewClass: { $0.viewClass })
  }

  private func windows() -> [ListedWindow]? {
    listReads += 1
    return list
  }

  // MARK: Scenes, as measured

  /// TextEdit: window > font pop-up; the record holds the window and the pop-up, the guard's node the pop-up.
  private func font() -> (popup: Node, verdict: StalePointVerdict<Node>) {
    let window = Node("AXWindow")
    let popup = Node("AXPopUpButton", frame: fontFrame, parent: window)
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(popup, ancestor: 0), current: popup, point: fontPoint)
    verdict.nodes = [recorded(window), recorded(popup, ancestor: 0)]
    return (popup, verdict)
  }

  /// Chrome: window > AXWebArea > AXGroup > `<select>`, closed: no AXMenu child live; the record holds an option under it,
  /// the deepest node at the point (`hitAboveNode`).
  private func select() -> (popup: Node, verdict: StalePointVerdict<Node>) {
    let web = Node("AXWebArea", parent: Node("AXWindow"))
    let group = Node("AXGroup", parent: web)
    let popup = Node("AXPopUpButton", frame: selectFrame, parent: group)
    popup.actions = ["AXPress", "AXShowMenu", "AXScrollToVisible"]
    popup.expanded = false
    popup.viewClass = .answered  // measured: AXDOMClassList [] (#469)
    let option = Node("AXMenuItem", frame: CGRect(x: 416, y: 159, width: 57, height: 19))  // recorded, not a live child
    var verdict = StalePointVerdict<Node>(reason: .hitAboveNode, node: recorded(option, ancestor: 2), current: option, point: selectPoint)
    verdict.nodes = [recorded(web), recorded(group, ancestor: 0), recorded(popup, ancestor: 1), recorded(option, ancestor: 2)]
    return (popup, verdict)
  }

  /// TextEdit's font-size combo box: window > AXComboBox > AXButton (its arrow), the guard's node the arrow.
  private func combo() -> (combo: Node, arrow: Node, verdict: StalePointVerdict<Node>) {
    let window = Node("AXWindow")
    let box = Node("AXComboBox", frame: comboFrame, parent: window)
    box.actions = ["AXShowMenu", "AXConfirm"]
    box.expanded = false
    let arrow = Node("AXButton", frame: CGRect(x: 743, y: 73, width: 20, height: 15), parent: box)
    arrow.actions = ["AXPress"]
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(arrow, ancestor: 1), current: arrow, point: arrowPoint)
    verdict.nodes = [recorded(window), recorded(box, ancestor: 0), recorded(arrow, ancestor: 1)]
    return (box, arrow, verdict)
  }

  private func recorded(_ node: Node, ancestor: Int? = nil) -> ScreenshotNode<Node> {
    var recorded = ScreenshotNode(element: node, role: node.role, title: nil, description: nil, subrole: nil, value: nil,
                                  editableAncestor: nil, labelsUnread: [], frame: node.frame ?? .zero, shown: node.frame,
                                  depth: ancestor.map { $0 + 1 } ?? 0, subtreeRecorded: true)
    recorded.ancestor = ancestor
    return recorded
  }

  private func freshMeta() -> InputMeta {
    InputMeta(ExecutionContext(connection: ConnectionState(id: 1, fd: -1), receivedAt: 1, hidIdleMs: 0, deadline: 2, lineage: nil))
  }

  private func decide(hit: Node?, _ verdict: StalePointVerdict<Node>, at point: CGPoint) -> PopUpPoint<Node> {
    popUpPoint(hit: hit, recorded: recordedPopUp(verdict, same: { $0 === $1 }), point: point, pids: [app], reads: reads,
               frontmost: { self.frontmost }, windows: windows)
  }

  /// The person windows each restore the click ran was handed (numbers, front to back), and what it answers.
  private var restores: [[CGWindowID]] = []
  private var restoreAnswer = PopUpRestoreRecord(windows: 0, ms: 70, complete: true, raises: 1)

  /// The click carried out over a fake clock: `held` runs as the hold does, `onPress` as the AXPress is performed, and
  /// `restore` is recorded (`restores`), answering `restoreAnswer`.
  private func click(_ decision: PopUpPoint<Node>, route: InputRoute = .activation, meta: inout InputMeta,
                     deadlinePassed: @escaping () -> Bool = { false }, held: @escaping () -> Void = {},
                     person: PopUpPersonSignals = PopUpPersonSignals(secondsSinceInput: { .infinity }, frontmost: { nil }),
                     onPress: @escaping (Node, String) -> AXError) throws -> Bool {
    var clock = 0.0
    return try popUpClick(decision, app: "TextEdit", route: route, appWindow: observed, pids: [app], ownPid: 999, reads: reads,
                          windows: { self.list }, now: { clock }, sleep: { clock += $0 }, deadlinePassed: deadlinePassed, person: person,
                          hold: { _, _ in held() }, checkInFlight: {}, perform: onPress, restore: { persons, appWindow, _ in
      XCTAssertEqual(appWindow, self.observed)
      self.restores.append(persons.map(\.number))
      return self.restoreAnswer
    }, meta: &meta)
  }

  private func wire(_ meta: InputMeta) -> [String: Any]? { meta.wire["popUpClick"] as? [String: Any] }

  // MARK: Delivered

  /// TextEdit's font pop-up behind Finder: the hit and the record name the same enabled closed button, so the click is its
  /// AXPress after the hold, with nothing posted (the caller returns on `true`), confirmed once a menu window of the app's
  /// appears over the button. The open raised the app's window above Finder's, so Finder's window is put back at once.
  func testAnAgreeingClosedPopUpIsItsAXPressWithNothingPostedConfirmedWhenItsMenuWindowAppears() throws {
    let scene = font()
    let decision = decide(hit: scene.popup, scene.verdict, at: fontPoint)
    guard case .press(let target) = decision else { return XCTFail("pressed, not \(decision)") }
    XCTAssertTrue(target.element === scene.popup)
    var performed: [String] = []
    var held = 0
    var meta = freshMeta()
    let carried = try click(decision, meta: &meta, held: { held += 1 }) { button, action in
      XCTAssertTrue(button === scene.popup)
      performed.append(action)
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    }
    XCTAssertTrue(carried, "carried: the caller posts no pointer event")
    XCTAssertEqual(performed, ["AXPress"])
    XCTAssertEqual(held, 1)
    XCTAssertEqual(meta.inputRoute, .activation)
    XCTAssertNotNil(meta.startedAt, "the action's interval")
    XCTAssertEqual(wire(meta)?["delivery"] as? String, "action")
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 77)
    XCTAssertEqual(restores, [[40]], "Finder's window, recorded in front before the press, put back")
    XCTAssertEqual((wire(meta)?["restored"] as? [String: Any])?["complete"] as? Bool, true)
    XCTAssertNil(meta.note)
  }

  /// Chrome's `<select>` as measured, dedicated mode: closed it has no AXMenu child, and the record's option under it is
  /// the evidence that it is a `<select>`; pressed, its list opens below it (window 45) and the AXMenu child appears.
  func testChromesClosedSelectIsQualifiedByItsRecordedOptionAndConfirmedByItsList() throws {
    let scene = select()
    XCTAssertTrue(scene.popup.children.isEmpty, "measured: no AXMenu child while closed")
    let recorded = recordedPopUp(scene.verdict, same: { $0 === $1 })
    XCTAssertTrue(recorded?.element === scene.popup)
    XCTAssertEqual(recorded?.holdsOption, true)
    XCTAssertEqual(recorded?.inRecordedWebArea, true)
    let decision = decide(hit: scene.popup, scene.verdict, at: selectPoint)
    guard case .press = decision else { return XCTFail("pressed, not \(decision)") }
    var meta = freshMeta()
    XCTAssertTrue(try click(decision, meta: &meta) { button, _ in
      button.expanded = true
      _ = Node("AXMenu", parent: button)
      self.list = [self.selectMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 45)
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
  }

  /// The app frontmost by route 1: confirmed, and nothing to put back (no window of the person's was in front of it).
  /// Behind, with the app's window not risen over the person's within the watch after the open, nothing moves either; a
  /// rise seen within it is put back.
  func testNothingRaisedMeansNoRestore() throws {
    let scene = font()
    list = [appWindow, person]
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), route: .action, meta: &meta) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(meta.inputRoute, .action)
    XCTAssertEqual(restores, [], "nothing of the person's was in front")
    XCTAssertNil(wire(meta)?["restored"])
    list = [person, appWindow]
    var behind = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &behind) { _, _ in
      self.list = [self.fontMenu, self.person, self.appWindow]
      return .success
    })
    XCTAssertEqual(restores, [], "the app's window never rose: nothing moves")
    XCTAssertNil(wire(behind)?["restored"])
    list = [person, appWindow]
    var late = freshMeta()
    var reads = 0
    var clock = 0.0
    XCTAssertTrue(try popUpClick(decide(hit: scene.popup, scene.verdict, at: fontPoint), app: "TextEdit", route: .action, appWindow: observed,
                                 pids: [app], ownPid: 999, reads: self.reads, windows: {
      reads += 1
      // The menu shows first (the press's first read after it), the app's window rises over Finder's two samples later.
      return reads < 2 ? self.list : reads < 4 ? [self.fontMenu, self.person, self.appWindow] : [self.fontMenu, self.appWindow, self.person]
    }, now: { clock }, sleep: { clock += $0 }, hold: { _, _ in }, checkInFlight: {}, perform: { _, _ in .success },
                                 restore: { persons, _, _ in self.restores.append(persons.map(\.number)); return self.restoreAnswer }, meta: &late))
    XCTAssertEqual(restores, [[40]], "a rise within the watch after the open is put back")
  }

  /// A restore that does not bring the order back within its bound leaves the open confirmed, says `complete: false`,
  /// and puts its note in the answer.
  func testAnIncompleteRestoreKeepsTheOpenConfirmedWithItsNote() throws {
    let scene = font()
    restoreAnswer = PopUpRestoreRecord(windows: 1, ms: 500, complete: false, raises: 250)
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual((wire(meta)?["restored"] as? [String: Any])?["complete"] as? Bool, false)
    XCTAssertEqual(meta.note, "TextEdit's menu is open, but the person's front window could not be put back in front of TextEdit's window, so TextEdit's window may now cover it.")
    XCTAssertEqual(popUpResult(meta)["note"] as? String, meta.note)
  }

  // MARK: The restore (design ruling 1005: the focused window alone)

  /// A fake restore system: the person's frontmost app and focused window, every recorded window resolved by its number
  /// unless `unresolved` names it, the raise and the hold recorded.
  private func fakeSystem(front: pid_t? = 300, focused: CGWindowID? = 40, unresolved: Set<CGWindowID> = [], failing: Set<CGWindowID> = [],
                          raise: @escaping (CGWindowID) -> Void, hold: @escaping () -> () -> Void = { {} },
                          scheduleRelease: @escaping (Double, @escaping @Sendable () -> Void) -> Void = { _, _ in })
    -> PopUpRestoreSystem<CGWindowID> {
    PopUpRestoreSystem(frontmost: { front }, focusedWindow: { _ in focused }, resolve: { persons, left in
      Self.allResolved(persons.filter { !unresolved.contains($0.number) }, left)
    }, raise: { raise($0); return !failing.contains($0) }, hold: hold, scheduleRelease: scheduleRelease)
  }

  /// AXRaise as a person's app answers it: the window to the front of the ordinary layer, below the menu and the cursor.
  private func raising(_ number: CGWindowID, in current: inout [ListedWindow], at index: Int = 1) {
    guard let window = current.first(where: { $0.number == number }) else { return }
    current.removeAll { $0.number == number }
    current.insert(window, at: index)
  }

  /// The qual's layout a with a third app: Finder's F1 (focused) over F2, then the app's window, then Calculator, before
  /// the press; the open raises the app's window over all three.
  private var f1: ListedWindow { ListedWindow(number: 40, owner: finder, layer: 0, bounds: CGRect(x: 760, y: 420, width: 300, height: 300)) }
  private var f2: ListedWindow { ListedWindow(number: 41, owner: finder, layer: 0, bounds: CGRect(x: 240, y: 480, width: 300, height: 300)) }
  private var calculator: ListedWindow { ListedWindow(number: 70, owner: 600, layer: 0, bounds: CGRect(x: 100, y: 100, width: 230, height: 400)) }

  /// Design ruling 1005: only the person's focused window is raised, once, inside the hold (its timer at route 3's
  /// ceiling); the order is read once about 300 ms later, and `complete` says the focused window is back over the app's.
  /// The other covered windows (F2, and Calculator, a third app's) are never raised and are counted as left covered.
  func testOnlyTheFocusedWindowIsRaisedTheOthersLeftCoveredAndCounted() {
    let cursor = ListedWindow(number: 5, owner: 999, layer: 0, bounds: CGRect(x: 0, y: 0, width: 40, height: 40))
    let persons = personWindowsAbove(observed, in: [cursor, f1, f2, calculator, appWindow], pids: [app], ownPid: 999)
    XCTAssertEqual(persons.map(\.number), [40, 41, 70], "front to back; the engine's own window never counted")
    var current = [fontMenu, cursor, appWindow, f1, f2, calculator]
    var raised: [CGWindowID] = []
    var holds = 0, releases = 0
    var scheduled: [Double] = []
    var reads = 0
    var clock = 0.0
    let record = popUpRestoreOrder(persons, appWindow: observed, system: fakeSystem(raise: { number in
      raised.append(number)
      self.raising(number, in: &current, at: 2)
    }, hold: {
      holds += 1
      return { releases += 1 }
    }, scheduleRelease: { ms, _ in scheduled.append(ms) }), windows: { reads += 1; return current }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(raised, [40], "the focused window alone")
    XCTAssertEqual(current.map(\.number), [77, 5, 40, 28, 41, 70], "F1 back over the app's; F2 and Calculator left under it")
    XCTAssertTrue(record.complete, "the focused window is back over the app's")
    XCTAssertEqual([record.windows, record.raises, record.leftCovered], [3, 1, 2])
    XCTAssertEqual(record.ms, 300, accuracy: 0.001, "read once, about 300 ms after the raise")
    XCTAssertEqual(reads, 2, "the trigger's read and the one read after the raise")
    XCTAssertEqual([holds, releases], [1, 1], "one screen-update hold, released")
    XCTAssertEqual(scheduled, [activationPointHoldCeilingMs])
    XCTAssertEqual(record.wire["leftCovered"] as? Int, 2)
    XCTAssertNil(record.wire["skipped"])
  }

  /// A focused window the app's window did not cover is not raised, nor is any other: F2 covered, F1 still over the app's.
  /// And a focused window still covered at the read is recorded incomplete, never raised again.
  func testNothingIsRaisedWhenTheFocusedWindowIsNotCoveredAndAMissIsNotRetried() {
    var raised = 0
    var clock = 0.0
    let uncovered = popUpRestoreOrder([f1, f2], appWindow: observed, system: fakeSystem(raise: { _ in raised += 1 }),
                                      windows: { [self.fontMenu, self.f1, self.appWindow, self.f2] }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(raised, 0)
    XCTAssertTrue(uncovered.complete, "the focused window is over the app's")
    XCTAssertEqual(uncovered.leftCovered, 1)
    clock = 0
    let missed = popUpRestoreOrder([f1, f2], appWindow: observed, system: fakeSystem(raise: { _ in raised += 1 }),
                                   windows: { [self.fontMenu, self.appWindow, self.f1, self.f2] }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(raised, 1, "one raise, no retry")
    XCTAssertFalse(missed.complete)
    XCTAssertNil(missed.stopped)
  }

  /// The focused window's number not proven (`focusUnknown`) or its element not found (`unresolved`), or the window list
  /// not read (`orderUnread`): nothing is raised.
  func testNothingIsRaisedWithoutTheFocusedWindowProven() {
    let cases: [(pid_t?, CGWindowID?, Set<CGWindowID>, Bool, PopUpRestoreStop)] = [
      (nil, 40, [], true, .focusUnknown), (300, nil, [], true, .focusUnknown), (300, 40, [40], true, .unresolved),
      (300, 40, [], false, .orderUnread),
    ]
    for (front, focused, unresolved, listReads, stop) in cases {
      var raised = 0
      var clock = 0.0
      let record = popUpRestoreOrder([f1, f2], appWindow: observed,
                                     system: fakeSystem(front: front, focused: focused, unresolved: unresolved, raise: { _ in raised += 1 }),
                                     windows: { listReads ? [self.appWindow, self.f1, self.f2] : nil }, now: { clock }, sleep: { clock += $0 })
      XCTAssertEqual(raised, 0, "nothing raised: \(stop)")
      XCTAssertEqual(record.stopped, stop)
      XCTAssertFalse(record.complete)
    }
  }

  /// The person's input stops the restore with nothing raised: before anything is read (switching apps during the open:
  /// the frontmost app never read), and just before the raise; after the raise, before the read, `personInput` too.
  func testThePersonsInputStopsTheRestoreWithNothingRaised() {
    var frontReads = 0, raised = 0
    var clock = 0.0
    let first = popUpRestoreOrder([f1], appWindow: observed, system: PopUpRestoreSystem<CGWindowID>(
      frontmost: { frontReads += 1; return self.finder }, focusedWindow: { _ in 40 }, resolve: Self.allResolved,
      raise: { _ in raised += 1; return true }, hold: { {} }),
      windows: { [self.appWindow, self.f1] }, now: { clock }, sleep: { clock += $0 }, intervened: { true })
    XCTAssertEqual(first.stopped, .personInput)
    XCTAssertEqual([frontReads, raised], [0, 0])
    // Input arriving once the focus is read, before the raise.
    var acted = false
    clock = 0
    let beforeRaise = popUpRestoreOrder([f1], appWindow: observed, system: PopUpRestoreSystem<CGWindowID>(
      frontmost: { self.finder }, focusedWindow: { _ in 40 }, resolve: { persons, left in acted = true; return Self.allResolved(persons, left) },
      raise: { _ in raised += 1; return true }, hold: { {} }),
      windows: { [self.appWindow, self.f1] }, now: { clock }, sleep: { clock += $0 }, intervened: { acted })
    XCTAssertEqual(beforeRaise.stopped, .personInput)
    XCTAssertEqual(raised, 0)
    // Input after the raise, before the read.
    var back = false
    var reads = 0
    clock = 0
    let after = popUpRestoreOrder([f1], appWindow: observed, system: fakeSystem(raise: { _ in back = true }), windows: {
      reads += 1
      return back ? [self.f1, self.appWindow] : [self.appWindow, self.f1]
    }, now: { clock }, sleep: { clock += $0 }, intervened: { back })
    XCTAssertEqual(after.stopped, .personInput)
    XCTAssertEqual(reads, 1, "the trigger's read only")
  }

  /// The cutoff: resolution spending it raises nothing and takes no hold; the raise crossing it, or the read crossing
  /// it, ends `bound`, never complete.
  func testTheCutoffEndsTheRestoreAsBound() {
    var clock = 0.0
    var holds = 0, raises = 0
    let resolving = popUpRestoreOrder([f1], appWindow: observed, system: PopUpRestoreSystem<CGWindowID>(frontmost: { self.finder },
      focusedWindow: { _ in 40 }, resolve: { persons, left in clock += 600; return Self.allResolved(persons, left) },
      raise: { _ in raises += 1; return true }, hold: { holds += 1; return {} }),
      windows: { [self.appWindow, self.f1] }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(resolving.stopped, .bound)
    XCTAssertEqual([holds, raises], [0, 0])
    clock = 0
    var reads = 0
    let crossing = popUpRestoreOrder([f1], appWindow: observed, system: fakeSystem(raise: { _ in clock += 520 }),
                                     windows: { reads += 1; return reads == 1 ? [self.appWindow, self.f1] : [self.f1, self.appWindow] },
                                     now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(crossing.stopped, .bound)
    XCTAssertFalse(crossing.complete)
    XCTAssertEqual(reads, 1, "no read past the cutoff")
    clock = 0
    reads = 0
    let slowRead = popUpRestoreOrder([f1], appWindow: observed, system: fakeSystem(raise: { _ in }), windows: {
      reads += 1
      if reads == 2 { clock += 300 }
      return reads == 1 ? [self.appWindow, self.f1] : [self.f1, self.appWindow]
    }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(slowRead.stopped, .bound)
    XCTAssertFalse(slowRead.complete)
  }

  /// The focused window's raise answering an AX error ends the restore as `focusRaiseFailed`, incomplete.
  func testTheFocusedRaiseFailingIsRecorded() {
    var clock = 0.0
    let failed = popUpRestoreOrder([f1, f2], appWindow: observed, system: fakeSystem(failing: [40], raise: { _ in }),
                                   windows: { [self.fontMenu, self.appWindow, self.f1, self.f2] }, now: { clock }, sleep: { clock += $0 })
    XCTAssertEqual(failed.stopped, .focusRaiseFailed)
    XCTAssertFalse(failed.complete)
    XCTAssertEqual([failed.raises, failed.failedRaises], [1, 1])
  }

  // MARK: Unconfirmed

  /// The action's return is not proof: with no new menu window of the app's at the button, the press answers
  /// clickUnconfirmed after the settle; a far one, another app's, or one up before the press does not count.
  func testNoMenuWindowAppearingAnswersClickUnconfirmed() {
    let scene = font()
    let earlier = ListedWindow(number: 60, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 900, y: 600, width: 50, height: 50))
    list = [earlier, person, appWindow]
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
      self.list = [
        ListedWindow(number: 61, owner: self.app, layer: menuWindowLayer, bounds: CGRect(x: 40, y: 600, width: 50, height: 50)),
        ListedWindow(number: 62, owner: 777, layer: menuWindowLayer, bounds: self.fontFrame),
        ListedWindow(number: 60, owner: self.app, layer: menuWindowLayer, bounds: self.fontFrame),
        self.person, self.appWindow,
      ]
      return .success
    }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "clickUnconfirmed")
      XCTAssertEqual((error as? EngineError)?.message,
        "The click could not be confirmed: it was carried by the pop-up button's AXPress action in TextEdit, since a posted click can close the menu it opens, and no menu was seen to open at the button. Observe the app with get_app_state before any retry, and never retry blindly.")
    }
    XCTAssertEqual(restores, [])
    XCTAssertEqual(wire(meta)?["effect"] as? String, "unconfirmed")
    XCTAssertGreaterThanOrEqual(wire(meta)?["ms"] as? Double ?? 0, popUpOpenSettleMs)
  }

  /// A messaging timeout from the press is judged by the effect; any other error is actionFailed.
  func testAnAmbiguousErrorIsJudgedByTheEffectAndAnyOtherFails() throws {
    let scene = font()
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .cannotComplete
    })
    XCTAssertEqual(wire(meta)?["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
    list = [person, appWindow]
    var failed = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &failed) { _, _ in .actionUnsupported }) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
  }

  /// A window list that does not read is never taken for "no menu" (review item 6): unread at the decision, main's path
  /// is kept (`windowsUnread`), nothing read further; unread just before the press, the press goes and answers
  /// clickUnconfirmed with `baselineUnread`, even when a menu then shows; a poll that fails is a sample with nothing
  /// seen, and a later read still confirms.
  func testAnUnreadWindowListIsNeverProofOfClosedOrOfANewMenu() throws {
    let scene = font()
    list = nil
    guard case .kept(.windowsUnread, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("main's: unread") }
    list = [person, appWindow]
    let decision = decide(hit: scene.popup, scene.verdict, at: fontPoint)
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decision, meta: &meta, held: { self.list = nil }) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    }) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed") }
    XCTAssertNotNil(meta.startedAt, "pressed")
    XCTAssertEqual(wire(meta)?["baselineUnread"] as? Bool, true)
    XCTAssertNil(wire(meta)?["menuWindow"])
    list = [person, appWindow]
    var later = freshMeta()
    var pressed = false
    var reads = 0
    var clock = 0.0
    XCTAssertTrue(try popUpClick(decision, app: "TextEdit", route: .action, appWindow: observed, pids: [app], ownPid: 999, reads: self.reads,
                                 windows: {
      reads += 1
      guard pressed else { return self.list }
      return reads == 2 ? nil : [self.fontMenu, self.appWindow, self.person]
    }, now: { clock }, sleep: { clock += $0 }, hold: { _, _ in }, checkInFlight: {}, perform: { _, _ in pressed = true; return .success },
                                 restore: { _, _, _ in self.restoreAnswer }, meta: &later))
    XCTAssertEqual(wire(later)?["polls"] as? Int, 2, "the failed read a sample, the next confirming")
  }

  /// The decision's list is read before the hold; just before the press (after it) the deadline is checked again and
  /// the button must still read closed (review items 5 and 7): a menu of the app's at the button opened during the hold
  /// refuses with nothing pressed, as does an AXExpanded now true; a deadline passed during the hold is timeoutReached,
  /// nothing pressed. A same-app window that appeared elsewhere during the hold is in the baseline, never the effect.
  func testTheCheckJustBeforeThePressRunsAfterTheHold() throws {
    let scene = font()
    for during in ["menu", "expanded", "deadline"] {
      list = [person, appWindow]
      scene.popup.expanded = nil
      var passed = false
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta, deadlinePassed: { passed }, held: {
        switch during {
        case "menu": self.list = [self.fontMenu, self.person, self.appWindow]
        case "expanded": scene.popup.expanded = true
        default: passed = true
        }
      }) { _, _ in XCTFail("not pressed (\(during))"); return .success }) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, during == "deadline" ? "timeoutReached" : "screenChangedSinceScreenshot")
      }
      XCTAssertNil(meta.startedAt, "nothing pressed (\(during))")
    }
    scene.popup.expanded = nil
    list = [person, appWindow]
    let panel = ListedWindow(number: 90, owner: app, layer: menuWindowLayer, bounds: CGRect(x: 700, y: 400, width: 200, height: 200))
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta, held: {
      self.list = [panel, self.person, self.appWindow]
    }) { _, _ in
      // The panel grows over the button: it was there before the press, so it is not the press's menu.
      self.list = [ListedWindow(number: 90, owner: self.app, layer: menuWindowLayer, bounds: self.fontFrame), self.person, self.appWindow]
      return .success
    }) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed") }
  }

  /// The baseline holds every window the list held before the press (re-review item 5): one of the app's then hidden
  /// (alpha 0) or at another layer that shows at the menu layer at the button after it is not the press's menu.
  func testAWindowInTheBaselineThatLaterShowsAsAMenuIsNotThePressesMenu() {
    let scene = font()
    for hidden in [ListedWindow(number: 91, owner: app, layer: menuWindowLayer, bounds: fontFrame, alpha: 0),
                   ListedWindow(number: 92, owner: app, layer: 0, bounds: CGRect(x: 900, y: 600, width: 10, height: 10))] {
      list = [hidden, person, appWindow]
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
        self.list = [ListedWindow(number: hidden.number, owner: self.app, layer: menuWindowLayer, bounds: self.fontFrame), self.appWindow, self.person]
        return .success
      }) { XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed", "window \(hidden.number)") }
    }
  }

  /// The deadline is checked after the last read before the press (re-review item 6): passed during the AXExpanded or
  /// window-list read, the press is timeoutReached with nothing pressed, on the unread-baseline path too.
  func testTheDeadlineIsCheckedAfterTheLastReadBeforeThePress() {
    let scene = font()
    for unread in [false, true] {
      list = [person, appWindow]
      let decision = decide(hit: scene.popup, scene.verdict, at: fontPoint)
      var passed = false
      scene.popup.onExpandedRead = {
        passed = true
        if unread { self.list = nil }
      }
      defer { scene.popup.onExpandedRead = nil }
      var meta = freshMeta()
      XCTAssertThrowsError(try click(decision, meta: &meta, deadlinePassed: { passed }) { _, _ in XCTFail("not pressed"); return .success }) {
        XCTAssertEqual(($0 as? EngineError)?.errorName, "timeoutReached", "unread baseline \(unread)")
      }
      XCTAssertNil(meta.startedAt)
    }
  }

  // MARK: The combo box

  /// TextEdit's font-size combo box as measured (run 44888938314): its arrow, the AXButton "font size" (743, 73, 20×15)
  /// whose trailing edge lies exactly 4.0 pt inside the box's, hit and recorded alike, is pressed by its own AXPress with
  /// TextEdit behind; the list opens as a new layer-0 window of TextEdit's at the combo box (706, 70, 65×250), above the
  /// document window and below the person's, which confirms it, and nothing of the person's was covered, so nothing is
  /// restored.
  func testAComboBoxArrowIsPressedAndItsListConfirmedByANewWindowOfAnyLayer() throws {
    let scene = combo()
    XCTAssertEqual(comboFrame.maxX - scene.arrow.frame!.maxX, 4.0, "measured: exactly 4.0 pt")
    let decision = decide(hit: scene.arrow, scene.verdict, at: arrowPoint)
    guard case .press(let target) = decision else { return XCTFail("pressed, not \(decision)") }
    XCTAssertTrue(target.element === scene.arrow, "the arrow is pressed")
    XCTAssertTrue(target.control === scene.combo, "the combo box is read")
    var performed: [Node] = []
    var meta = freshMeta()
    let list = ListedWindow(number: 830, owner: app, layer: 0, bounds: CGRect(x: 706, y: 70, width: 65, height: 250))
    XCTAssertTrue(try click(decision, meta: &meta) { pressed, _ in
      performed.append(pressed)
      scene.combo.expanded = true
      self.list = [self.person, list, self.appWindow]
      return .success
    })
    XCTAssertTrue(performed.count == 1 && performed[0] === scene.arrow)
    XCTAssertEqual(wire(meta)?["menuWindow"] as? Int, 830)
    XCTAssertEqual(wire(meta)?["arrow"] as? Bool, true)
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(restores, [], "nothing raised over the person's: no restore")
    XCTAssertNil(wire(meta)?["restored"])
  }

  /// A combo box whose arrow has no AXPress (the box itself has none either, AXShowMenu and AXConfirm only): with the app
  /// behind the click is refused with nothing held, performed or sent; frontmost, the posted click opens its list: main's.
  /// A hit on the combo box itself is its text: main's, unrecorded.
  func testAComboBoxWithNoPressableArrowBehindIsRefusedWithNothingSent() {
    let scene = combo()
    scene.arrow.actions = []
    let decision = decide(hit: scene.arrow, scene.verdict, at: arrowPoint)
    guard case .refuse(let role) = decision else { return XCTFail("refused, not \(decision)") }
    XCTAssertEqual(role, "AXComboBox")
    var meta = freshMeta()
    XCTAssertThrowsError(try click(decision, meta: &meta, held: { XCTFail("nothing held") }) { _, _ in
      XCTFail("nothing performed")
      return .success
    }) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "backgroundClickRefused")
      XCTAssertEqual((error as? EngineError)?.message,
        "TextEdit's combo box opens its list only for a pointer click, and a click cua sends to TextEdit while it is not the frontmost app does not leave that list open; neither the combo box nor its arrow has an accessibility action that opens it. Nothing was sent. Ask the person to bring TextEdit to the front, or type the value into the combo box's text field instead (setValue on its element, or click its text and use typeText).")
    }
    XCTAssertNil(meta.startedAt, "nothing sent")
    XCTAssertEqual(wire(meta)?["refused"] as? String, "noAction")
    frontmost = true
    guard case .kept(.frontmost, _) = decide(hit: scene.arrow, scene.verdict, at: arrowPoint) else { return XCTFail("frontmost: main's") }
    var text = StalePointVerdict<Node>(reason: .sameElement, node: recorded(scene.combo, ancestor: 0), current: scene.combo,
                                       point: CGPoint(x: 730, y: 81))
    text.nodes = scene.verdict.nodes
    guard case .notPopUp = decide(hit: scene.combo, text, at: CGPoint(x: 730, y: 81)) else { return XCTFail("its text: main's") }
  }

  // MARK: Main's path

  /// Signals that disagree keep main's path and say so (`notRecorded`, `notHit`); so do a failed or late hit-test
  /// (`noSignal`, the record alone never taken), a disabled button and one already open. Nothing is held or performed.
  func testDisagreeingSignalsOrALateOrFailedHitKeepMainsPath() throws {
    let scene = font()
    let other = Node("AXPopUpButton", frame: fontFrame, parent: scene.popup.parent)
    let button = Node("AXButton", frame: fontFrame, parent: scene.popup.parent)
    let application = Node("AXApplication")
    var clock = 0.0
    let late = windowHit(application: application, window: scene.popup.parent!, at: fontPoint,
                         elementAt: { _, _ in clock += pointHitSignalDeadlineMs + 1; return (.success, scene.popup) },
                         role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { clock })
    let failed = windowHit(application: application, window: scene.popup.parent!, at: fontPoint, elementAt: { _, _ in (.cannotComplete, nil) },
                           role: { $0.role }, parent: { $0.parent }, same: { $0 === $1 }, now: { 0 })
    XCTAssertNil(late.answered)
    XCTAssertNil(failed.answered)
    let unrecorded = StalePointVerdict<Node>(reason: .unrecorded)
    let cases: [(PopUpPoint<Node>, PopUpKept)] = [
      (decide(hit: other, scene.verdict, at: fontPoint), .notRecorded),
      (decide(hit: scene.popup, unrecorded, at: fontPoint), .notRecorded),
      (decide(hit: button, scene.verdict, at: fontPoint), .notHit),
      (decide(hit: late.answered, scene.verdict, at: fontPoint), .noSignal),
      (decide(hit: failed.answered, scene.verdict, at: fontPoint), .noSignal),
    ]
    for (decision, expected) in cases {
      guard case .kept(let why, _) = decision else { return XCTFail("kept, not \(decision)") }
      XCTAssertEqual(why, expected)
      var meta = freshMeta()
      XCTAssertFalse(try click(decision, meta: &meta, held: { XCTFail("nothing held") }) { _, _ in XCTFail("nothing performed"); return .success })
      XCTAssertEqual(wire(meta)?["kept"] as? String, expected.rawValue)
      XCTAssertNil(meta.inputRoute, "left to main's route")
    }
    XCTAssertEqual(listReads, 0, "no window list read on disagreement")
    scene.popup.enabled = false
    guard case .kept(.disabled, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("disabled") }
    scene.popup.enabled = true
    scene.popup.expanded = true
    guard case .kept(.open, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("expanded") }
    scene.popup.expanded = nil
    list = [fontMenu, appWindow, person]
    guard case .kept(.open, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("its menu up") }
  }

  /// A pop-up whose parents do not read to its window (review item 4) is not taken as native: with no web area in the
  /// record, main's path (`ancestryUnread`); with the record's web area above it, a page's control, which is a `<select>`
  /// only with its options recorded under it.
  func testAnUnreadAncestryIsNotNative() {
    let scene = font()
    scene.popup.parentFails = true
    guard case .kept(.ancestryUnread, _) = decide(hit: scene.popup, scene.verdict, at: fontPoint) else { return XCTFail("unread: main's") }
    let page = select()
    page.popup.parent?.parentFails = true
    guard case .press = decide(hit: page.popup, page.verdict, at: selectPoint) else { return XCTFail("the record's web area, its option recorded") }
    var aria = page.verdict
    aria.nodes.removeLast()
    aria.node = aria.nodes[2]
    aria.current = page.popup
    guard case .notPopUp = decide(hit: page.popup, aria, at: selectPoint) else { return XCTFail("a page's own pop-up: main's") }
  }

  /// A click on anything but a pop-up button (a button, a page's ARIA pop-up button with no option recorded under it) is
  /// unchanged: main's, unrecorded, with no window list read.
  func testANonPopUpClickIsUnchanged() throws {
    let scene = font()
    let button = Node("AXButton", frame: fontFrame, parent: scene.popup.parent)
    var onButton = StalePointVerdict<Node>(reason: .sameElement, node: recorded(button, ancestor: 0), current: button, point: fontPoint)
    onButton.nodes = [recorded(scene.popup.parent!), recorded(button, ancestor: 0)]
    let page = select()
    var aria = page.verdict
    aria.nodes.removeLast()
    aria.node = aria.nodes[2]
    aria.current = page.popup
    for (hit, verdict, point) in [(button, onButton, fontPoint), (page.popup, aria, selectPoint)] {
      let decision = decide(hit: hit, verdict, at: point)
      guard case .notPopUp = decision else { return XCTFail("main's, not \(decision)") }
      var meta = freshMeta()
      XCTAssertFalse(try click(decision, meta: &meta) { _, _ in XCTFail("nothing performed"); return .success })
      XCTAssertNil(meta.wire["popUpClick"])
    }
    XCTAssertEqual(listReads, 0)
  }

  /// An open pop-up's item stays #454's: the hit is an AXMenuItem, so #458 says nothing, even with the pop-up button
  /// recorded above the item, and #454's decision delivers the item.
  func testAnOpenPopUpsItemIsStillTheMenuItemPath() {
    let scene = font()
    let menuNode = Node("AXMenu", parent: scene.popup)
    let item = Node("AXMenuItem", frame: CGRect(x: 535, y: 70, width: 159, height: 20), parent: menuNode)
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(item, ancestor: 2), current: item, point: fontPoint)
    verdict.nodes = scene.verdict.nodes + [recorded(menuNode, ancestor: 1), recorded(item, ancestor: 2)]
    XCTAssertTrue(recordedPopUp(verdict, same: { $0 === $1 })?.element === scene.popup, "the pop-up recorded above the item")
    list = [fontMenu, appWindow, person]
    guard case .notPopUp = decide(hit: item, verdict, at: fontPoint) else { return XCTFail("#458 says nothing") }
    let menuReads = MenuItemReads<Node>(role: { $0.role }, parent: { $0.parent }, enabled: { $0.enabled }, actions: { _ in ["AXPick"] },
                                        title: { _ in .absent }, value: { _ in .absent }, focused: { nil }, gone: { _ in false },
                                        same: { $0 === $1 })
    let item454 = menuItemPoint(hit: item, recorded: recordedMenuItems(verdict), reads: menuReads) {
      menuWindowOverPoint(self.fontPoint, target: self.observed, pids: [self.app], list: self.list ?? [])?.number
    }
    guard case .deliver(let target) = item454 else { return XCTFail("#454 delivers, not \(item454)") }
    XCTAssertEqual(target.action, "AXPick")
  }

  // MARK: #282's route

  /// Chrome's `<select>` in a shared-mode page behind is #282's element route (review item 3): it delivers as before, and
  /// on the button the same check runs just before its press, then the effect: confirmed with the order recorded, or
  /// clickUnconfirmed when no list opens; a route that pressed another control answers as #282's alone. The press goes
  /// through `deliverAction` as #282's does: a messaging timeout with the list open is judged by the list (re-review
  /// item 2), on another control it is still actionFailed, and any other error is actionFailed.
  func testAWebAreaRoutesSelectPressGetsTheSameEffectCheckAndOrder() throws {
    let scene = select()
    guard case .press(let target) = decide(hit: scene.popup, scene.verdict, at: selectPoint) else { return XCTFail("qualifies") }
    func run(pressing: Node, opens: Bool, answer: AXError = .success, meta: inout InputMeta) throws {
      list = [person, appWindow]
      var clock = 0.0
      try popUpConfirmingRoute(target, app: "Google Chrome", appWindow: observed, pids: [app], ownPid: 999, reads: reads,
                               windows: { self.list }, now: { clock }, sleep: { clock += $0 }, restore: { persons, _, _ in
        self.restores.append(persons.map(\.number))
        return self.restoreAnswer
      }, route: { beforePress, tolerates, meta in
        // #282's route: its hold, then its final checks on the control it presses, then the press.
        try beforePress(pressing, &meta)
        try withoutActuallyEscaping(tolerates) { judge in
          try deliverAction("AXPress", tolerates: judge, perform: { _ in
            if opens { self.list = [self.selectMenu, self.appWindow, self.person] }
            return answer
          }, meta: &meta)
        }
      }, meta: &meta)
    }
    var meta = freshMeta()
    try run(pressing: scene.popup, opens: true, meta: &meta)
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertEqual(restores.first, [40], "the raised Chrome window put back behind the person's")
    var none = freshMeta()
    XCTAssertThrowsError(try run(pressing: scene.popup, opens: false, meta: &none)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
    }
    var timedOut = freshMeta()
    try run(pressing: scene.popup, opens: true, answer: .cannotComplete, meta: &timedOut)
    XCTAssertEqual(wire(timedOut)?["effect"] as? String, "confirmed", "the observed list decides")
    XCTAssertEqual(wire(timedOut)?["actionError"] as? Int, Int(AXError.cannotComplete.rawValue))
    var refused = freshMeta()
    XCTAssertThrowsError(try run(pressing: scene.popup, opens: false, answer: .actionUnsupported, meta: &refused)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed")
    }
    var other = freshMeta()
    XCTAssertNoThrow(try run(pressing: Node("AXCheckBox"), opens: false, meta: &other))
    XCTAssertNil(other.wire["popUpClick"], "another control pressed: #282's answer alone")
    var otherTimedOut = freshMeta()
    XCTAssertThrowsError(try run(pressing: Node("AXCheckBox"), opens: false, answer: .cannotComplete, meta: &otherTimedOut)) {
      XCTAssertEqual(($0 as? EngineError)?.errorName, "actionFailed", "another control's timeout is #282's")
    }
  }

  /// A page pop-up whose recorded AXMenuItems lie off the point (parked offscreen, the deepest node at the point the
  /// pop-up itself) is no `<select>` by the measured shape (re-review item 3): main's path.
  func testAPagePopUpWithItsRecordedItemsOffThePointKeepsMainsPath() {
    let scene = select()
    var parked = StalePointVerdict<Node>(reason: .sameElement, node: scene.verdict.nodes[2], current: scene.popup, point: selectPoint)
    parked.nodes = Array(scene.verdict.nodes.prefix(3)) + [
      recorded(Node("AXMenuItem", frame: CGRect(x: -2000, y: -2000, width: 57, height: 19)), ancestor: 2),
      recorded(Node("AXMenuItem", frame: CGRect(x: -2000, y: -1981, width: 57, height: 19)), ancestor: 2),
    ]
    XCTAssertEqual(recordedPopUp(parked, same: { $0 === $1 })?.holdsOption, false)
    guard case .notPopUp = decide(hit: scene.popup, parked, at: selectPoint) else { return XCTFail("main's path") }
  }

  /// A combo box's other child button (a clear button at its leading edge) is not its arrow (re-review item 4): it keeps
  /// its own click, while the trailing one is still the arrow; with frames unread only a lone button child counts.
  func testOnlyTheComboBoxsTrailingButtonIsItsArrow() {
    let scene = combo()
    let clear = Node("AXButton", frame: CGRect(x: 717, y: 72, width: 16, height: 18), parent: scene.combo)
    var onClear = StalePointVerdict<Node>(reason: .sameElement, node: recorded(clear, ancestor: 1), current: clear, point: CGPoint(x: 724, y: 81))
    onClear.nodes = scene.verdict.nodes + [recorded(clear, ancestor: 1)]
    XCTAssertNil(popUpControl(clear, reads: reads))
    if case .press = decide(hit: clear, onClear, at: CGPoint(x: 724, y: 81)) { XCTFail("the clear button keeps its own click") }
    guard case .press = decide(hit: scene.arrow, scene.verdict, at: arrowPoint) else { return XCTFail("the trailing arrow") }
    scene.arrow.frame = nil
    XCTAssertNil(popUpControl(scene.arrow, reads: reads), "frames unread and two buttons: none is taken")
    scene.combo.children.removeAll { $0 === clear }
    XCTAssertNotNil(popUpControl(scene.arrow, reads: reads), "frames unread, the lone button")
  }

  // MARK: The review of 97344ee7..a094f620

  /// Item 1: the person's input, or another app brought to the front, since the press stops the restore before its next
  /// raise (`personInput`, incomplete, no note), and the watch for a later rise; the signals read as route 3's guard
  /// reads them, from the dispatch on.
  func testThePersonsInputStopsTheWatchAndTheRestore() throws {
    var input = 10.0  // seconds since the last input
    var front: pid_t? = finder
    var clock = 1_000.0
    let signals = PopUpPersonSignals(secondsSinceInput: { input }, frontmost: { front })
    let intervened = signals.since(clock, now: { clock })
    XCTAssertFalse(intervened())
    clock += 50
    input = 0.02  // 20 ms ago: after the dispatch
    XCTAssertTrue(intervened())
    input = 10
    front = 777
    XCTAssertTrue(intervened(), "another app brought to the front")
    var reads = 0
    // Through the click: a restore stopped by the person adds no note; input during the watch means no restore at all.
    let scene = font()
    restoreAnswer = PopUpRestoreRecord(windows: 1, ms: 4, complete: false, raises: 1, stopped: .personInput)
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertNil(meta.note, "the person's own act: no note blaming cua")
    XCTAssertEqual((wire(meta)?["restored"] as? [String: Any])?["stopped"] as? String, "personInput")
    restores = []
    list = [person, appWindow]
    var watched = freshMeta()
    reads = 0
    var watchClock = 0.0
    XCTAssertTrue(try popUpClick(decide(hit: scene.popup, scene.verdict, at: fontPoint), app: "TextEdit", route: .action, appWindow: observed,
                                 pids: [app], ownPid: 999, reads: self.reads, windows: {
      reads += 1
      return reads < 2 ? self.list : reads < 4 ? [self.fontMenu, self.person, self.appWindow] : [self.fontMenu, self.appWindow, self.person]
    }, now: { watchClock }, sleep: { watchClock += $0 },
       person: PopUpPersonSignals(secondsSinceInput: { reads >= 2 ? 0 : 10 }, frontmost: { self.finder }),
       hold: { _, _ in }, checkInFlight: {}, perform: { _, _ in .success },
       restore: { persons, _, _ in self.restores.append(persons.map(\.number)); return self.restoreAnswer }, meta: &watched))
    XCTAssertEqual(restores, [], "the person's input during the watch: their order is theirs")
  }


  /// Every recorded window resolved by its own number (the fakes' resolver).
  static func allResolved(_ persons: [ListedWindow], _ left: () -> Double) -> [CGWindowID: CGWindowID] {
    Dictionary(uniqueKeysWithValues: persons.map { ($0.number, $0.number) })
  }

  /// A fake AX window: its SPI number (nil: the SPI answers none) and its size, which no lookup reads.
  private struct FakeAXWindow {
    let name: String
    let number: CGWindowID?
  }

  /// Re-review items 1 and 2: a window is resolved only by its own number. No fallback by size: an unnumbered window,
  /// however alone its size, is unresolved. One AXWindows scan per process, stopping at the process's last recorded
  /// window, and no read once the cutoff is spent.
  func testAWindowIsResolvedOnlyByItsOwnNumberOneScanPerProcess() {
    let bounds = CGRect(x: 100, y: 100, width: 400, height: 300)
    let f1 = ListedWindow(number: 40, owner: finder, layer: 0, bounds: bounds)
    let f2 = ListedWindow(number: 41, owner: finder, layer: 0, bounds: CGRect(x: 600, y: 400, width: 200, height: 200))
    let calc = ListedWindow(number: 70, owner: 600, layer: 0, bounds: bounds)
    var scans: [pid_t] = []
    var numberReads = 0
    let windowsOf: (pid_t) -> [FakeAXWindow]? = { pid in
      scans.append(pid)
      return pid == self.finder
        ? [FakeAXWindow(name: "f2", number: 41), FakeAXWindow(name: "f1", number: 40), FakeAXWindow(name: "other", number: 49)]
        : [FakeAXWindow(name: "calc", number: nil)]
    }
    let found = resolveByNumber([f1, f2, calc], left: { 100 }, windowsOf: windowsOf, number: { numberReads += 1; return $0.number })
    XCTAssertEqual(found.mapValues(\.name), [40: "f1", 41: "f2"], "the unnumbered same-sized window is never guessed")
    XCTAssertEqual(scans, [finder, 600], "one scan per process")
    XCTAssertEqual(numberReads, 3, "Finder's scan stops at its last recorded window; Calculator's one window read")
    scans = []
    numberReads = 0
    XCTAssertTrue(resolveByNumber([f1, f2], left: { 0 }, windowsOf: windowsOf, number: { numberReads += 1; return $0.number }).isEmpty)
    XCTAssertEqual([scans.count, numberReads], [0, 0], "no read past the cutoff")
  }


  /// Design ruling 1004, item 2: the wait for the menu is 1.5 s; Chrome's `<select>` list opening about 940 ms after
  /// the press (2/20 in #458's qual) is confirmed.
  func testAMenuOpeningLateWithinOneAndAHalfSecondsIsConfirmed() throws {
    let scene = select()
    var clock = 0.0
    var pressedAt: Double?
    var meta = freshMeta()
    list = [person, appWindow]
    XCTAssertTrue(try popUpClick(decide(hit: scene.popup, scene.verdict, at: selectPoint), app: "Google Chrome", route: .action,
                                 appWindow: observed, pids: [app], ownPid: 999, reads: reads, windows: {
      guard let at = pressedAt, clock - at >= 940 else { return self.list }
      return [self.selectMenu, self.person, self.appWindow]
    }, now: { clock }, sleep: { clock += $0 }, hold: { _, _ in }, checkInFlight: {},
       perform: { _, _ in pressedAt = clock; return .success }, restore: { _, _, _ in self.restoreAnswer }, meta: &meta))
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    XCTAssertGreaterThanOrEqual(wire(meta)?["ms"] as? Double ?? 0, 940)
  }
  /// Item 4: a restore starts only when the app's window crossed above a recorded window; the person's windows swapped
  /// among themselves, the app's still behind both, is no crossing and moves nothing.
  func testOnlyACrossingStartsARestore() throws {
    let f2 = ListedWindow(number: 41, owner: finder, layer: 0, bounds: CGRect(x: 240, y: 480, width: 300, height: 300))
    XCTAssertEqual(appWindowCrossed([person, f2], appWindow: observed, in: [f2, person, appWindow]), false)
    XCTAssertEqual(appWindowCrossed([person, f2], appWindow: observed, in: [person, appWindow, f2]), true)
    let scene = font()
    list = [person, f2, appWindow]
    var meta = freshMeta()
    XCTAssertTrue(try click(decide(hit: scene.popup, scene.verdict, at: fontPoint), meta: &meta) { _, _ in
      self.list = [self.fontMenu, f2, self.person, self.appWindow]
      return .success
    })
    XCTAssertEqual(restores, [], "a swap among the person's windows is theirs")
  }

  /// Item 5: the combo box's list is confirmed only on the measured signals: a new window above the app's document window,
  /// and the combo box not reading AXExpanded false. Below the document window, or with AXExpanded false, it is
  /// unconfirmed; AXExpanded unread does not stand in the way.
  func testTheComboBoxsListIsConfirmedOnlyOnTheMeasuredSignals() throws {
    let listWindow = ListedWindow(number: 830, owner: app, layer: 0, bounds: CGRect(x: 706, y: 70, width: 65, height: 250))
    for (expanded, below, confirms) in [(false, false, false), (true, true, false), (nil, false, true)] as [(Bool?, Bool, Bool)] {
      let scene = combo()
      list = [person, appWindow]
      var meta = freshMeta()
      let run = { try self.click(self.decide(hit: scene.arrow, scene.verdict, at: self.arrowPoint), meta: &meta) { _, _ in
        scene.combo.expanded = expanded
        self.list = below ? [self.person, self.appWindow, listWindow] : [self.person, listWindow, self.appWindow]
        return .success
      } }
      if confirms {
        XCTAssertTrue(try run())
      } else {
        XCTAssertThrowsError(try run(), "expanded \(String(describing: expanded)), below \(below)") {
          XCTAssertEqual(($0 as? EngineError)?.errorName, "clickUnconfirmed")
        }
      }
    }
  }

  /// Item 6: the arrow's own AXEnabled is read before it is pressed; a disabled arrow keeps main's path.
  func testADisabledArrowKeepsMainsPath() {
    let scene = combo()
    scene.arrow.enabled = false
    guard case .kept(.disabled, _) = decide(hit: scene.arrow, scene.verdict, at: arrowPoint) else { return XCTFail("main's path") }
    scene.arrow.enabled = nil
    guard case .kept(.disabled, _) = decide(hit: scene.arrow, scene.verdict, at: arrowPoint) else { return XCTFail("unread: main's path") }
  }

  // MARK: #469: a browser view's pop-up button keeps main's path

  /// Chrome's toolbar as #469's signal run measured it (scripts/probe-337/README.md §"#469 signal" at 4f8c58d1): window >
  /// AXToolbar > the app menu (`BrowserAppMenuButton`) and site information (`LocationIconView`), and tab search
  /// (`TabStripFlatEdgeButton`) in the tab strip outside the toolbar; no web area above any, no children while closed,
  /// AXExpanded not reading, AXDOMClassList answering. The record holds the window, the toolbar and the buttons; the
  /// guard's node is the one clicked.
  private func chromeToolbar(_ name: String) -> (popup: Node, verdict: StalePointVerdict<Node>, point: CGPoint) {
    let window = Node("AXWindow")
    let toolbar = Node("AXToolbar", parent: window)
    let frames = ["app menu": CGRect(x: 980, y: 77, width: 34, height: 34), "site information": CGRect(x: 520, y: 81, width: 26, height: 26),
                  "tab search": CGRect(x: 408, y: 38, width: 28, height: 28)]
    let frame = frames[name]!
    let popup = Node("AXPopUpButton", frame: frame, parent: name == "tab search" ? window : toolbar)
    popup.actions = ["AXPress", "AXShowMenu"]
    popup.viewClass = .answered
    let point = CGPoint(x: frame.midX, y: frame.midY)
    let at = name == "tab search" ? 0 : 1
    var verdict = StalePointVerdict<Node>(reason: .sameElement, node: recorded(popup, ancestor: at), current: popup, point: point)
    verdict.nodes = [recorded(window), recorded(toolbar, ancestor: 0), recorded(popup, ancestor: at)]
    return (popup, verdict, point)
  }

  /// Site information and tab search open a layer-0 bubble that the AXPress brings to the front over the person's window
  /// (#463's run 44959835166: Chrome frontmost 6/6 each, answering a false `clickUnconfirmed`); no attribute read before
  /// the press tells them from the app menu but its view class, which is not allowlisted (ruling 1036). All three keep
  /// main's posted click, `kept: "browserView"`, with nothing held or pressed and no window list read.
  func testChromesToolbarPopUpsKeepMainsPostedClickWithNothingPressed() throws {
    for name in ["site information", "tab search", "app menu"] {
      let scene = chromeToolbar(name)
      let decision = decide(hit: scene.popup, scene.verdict, at: scene.point)
      guard case .kept(.browserView, let role) = decision else { XCTFail("\(name): browserView, not \(decision)"); continue }
      XCTAssertEqual(role, "AXPopUpButton")
      var meta = freshMeta()
      XCTAssertFalse(try click(decision, meta: &meta, held: { XCTFail("\(name): nothing held") }) { _, _ in
        XCTFail("\(name): nothing performed"); return .success
      }, "\(name): main's path posts it")
      XCTAssertEqual(wire(meta)?["kept"] as? String, "browserView")
      XCTAssertNil(meta.inputRoute, "\(name): left to main's route")
    }
    XCTAssertEqual(listReads, 0, "decided before the window list is read")
  }

  /// The two that #458 keeps pressing, with their measured view-class reads: a page's `<select>` answers AXDOMClassList
  /// (an empty list) and is still pressed, the web area deciding it; TextEdit's font pop-up answers unsupported and is
  /// still pressed and confirmed.
  func testASelectAndAnAppKitPopUpAreStillPressedAndConfirmed() throws {
    let page = select()
    XCTAssertEqual(page.popup.viewClass, .answered)
    let pageDecision = decide(hit: page.popup, page.verdict, at: selectPoint)
    guard case .press = pageDecision else { return XCTFail("the <select> pressed, not \(pageDecision)") }
    var meta = freshMeta()
    XCTAssertTrue(try click(pageDecision, meta: &meta) { button, _ in
      button.expanded = true
      self.list = [self.selectMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
    let font = font()
    XCTAssertEqual(font.popup.viewClass, .unsupported)
    list = [person, appWindow]
    let fontDecision = decide(hit: font.popup, font.verdict, at: fontPoint)
    guard case .press = fontDecision else { return XCTFail("TextEdit's pop-up pressed, not \(fontDecision)") }
    meta = freshMeta()
    XCTAssertTrue(try click(fontDecision, meta: &meta) { _, _ in
      self.list = [self.fontMenu, self.appWindow, self.person]
      return .success
    })
    XCTAssertEqual(wire(meta)?["effect"] as? String, "confirmed")
  }

  /// An AXDOMClassList read that fails for any reason but unsupported (no value, cannot complete, a timeout) may be a
  /// browser view's: main's path, `kept: "viewClassUnread"`, nothing pressed.
  func testAnAmbiguousViewClassReadKeepsMainsPath() throws {
    XCTAssertEqual(popUpViewClass(.success), .answered)
    XCTAssertEqual(popUpViewClass(.attributeUnsupported), .unsupported)
    for error in [AXError.noValue, .cannotComplete, .failure, .apiDisabled] { XCTAssertEqual(popUpViewClass(error), .unread, "\(error)") }
    let scene = font()
    scene.popup.viewClass = .unread
    let decision = decide(hit: scene.popup, scene.verdict, at: fontPoint)
    guard case .kept(.viewClassUnread, _) = decision else { return XCTFail("main's, not \(decision)") }
    var meta = freshMeta()
    XCTAssertFalse(try click(decision, meta: &meta, held: { XCTFail("nothing held") }) { _, _ in XCTFail("nothing performed"); return .success })
    XCTAssertEqual(wire(meta)?["kept"] as? String, "viewClassUnread")
    XCTAssertEqual(listReads, 0)
  }

  // MARK: The review of 7e5bb454..67cf8b26 (the hard bar)


}
