import AppKit
import ApplicationServices
import Foundation

// Where keyboard events go (#582, ruling 1202). A remote-view panel (TextEdit's Open or Save panel, drawn by
// com.apple.appkit.xpc.openAndSavePanelService) answers the app's pid to the public AXUIElementGetPid at every element,
// so keys posted to that pid reach the app and never the panel. The vendor asks the private `_AXUIElementGetActualPid`
// instead (`ApplicationUIElement.targetForKeyboardEvent()` 0x1006f645c → `outOfProcessTarget(for:appPID:)` 0x1006f6668 →
// `UIElement.ProcessType.containingElement(for:ofTypes:)` 0x10077c59c, read from the pinned SkyComputerUseService): from
// the focused element itself up its parent chain (`parentChain(maxDepth: 300, includingSelf: true)`), each element's
// actual pid is classified by its running application (`processType(for:)` 0x10077c8e8); an element whose pid cannot be
// read, or whose process is no finished-launching running application, is passed over, and the first that classifies
// ends the walk. Its pid becomes the keys' target only when its activation policy is prohibited and it is not the app's
// pid; any other first answer keeps the app. The symbol is resolved with dlsym, never linked; absent, the keys go where
// they went before #582, and `status` says so (`actualPid`).

/// `_AXUIElementGetActualPid`: the private pid of the process that actually serves an element. Resolved once with dlsym;
/// nil when this macOS does not export it.
enum ActualPid {
  typealias Function = @convention(c) (AXUIElement, UnsafeMutablePointer<pid_t>) -> AXError
  static let symbol = "_AXUIElementGetActualPid"

  /// The function as `lookup` resolves it (dlsym over the process's images by default; a test answers nil to force it
  /// missing).
  static func resolve(_ lookup: (String) -> UnsafeMutableRawPointer? = { dlsym(UnsafeMutableRawPointer(bitPattern: -2), $0) }) -> Function? {
    lookup(symbol).map { unsafeBitCast($0, to: Function.self) }
  }

  /// This process's resolution, made once.
  static let resolved: Function? = resolve()

  /// The function as a read: an element's actual pid, nil when the call fails.
  static func read(_ function: Function) -> (AXUIElement) -> pid_t? {
    { element in
      var pid: pid_t = 0
      return function(element, &pid) == .success ? pid : nil
    }
  }
}

/// What an element's serving process is to the walk (the vendor's `UIElement.ProcessType`): a running application of
/// regular or accessory policy, one of prohibited policy (an XPC service drawing a remote view), or neither (no running
/// application for the pid, or one not finished launching).
enum OwningProcessKind: Equatable {
  case application, prohibited, unknown
}

/// The live classification, as `processType(for:)` makes it from NSRunningApplication.
func owningProcessKind(_ pid: pid_t) -> OwningProcessKind {
  guard pid > 0, let running = NSRunningApplication(processIdentifier: pid), running.isFinishedLaunching else { return .unknown }
  return running.activationPolicy == .prohibited ? .prohibited : .application
}

/// The vendor's out-of-process keyboard target: the focused element first, then its parents, `maxDepth` of them at most;
/// at each, the actual pid (`actualPid`, nil passes the element over) and its process's kind (`.unknown` passes it over
/// too). The first element that classifies ends the walk: its pid when the process is prohibited-policy and not the
/// app's, else nil (the keys stay with the app).
func remoteViewKeyOwner<Element>(of focused: Element, appPid: pid_t, parent: (Element) -> Element?, actualPid: (Element) -> pid_t?,
                                 kind: (pid_t) -> OwningProcessKind, maxDepth: Int = 300) -> pid_t? {
  var element: Element? = focused
  var depth = 0
  while let current = element, depth <= maxDepth {
    if let owner = actualPid(current) {
      switch kind(owner) {
      case .unknown: break
      case .application: return nil
      case .prohibited: return owner == appPid ? nil : owner
      }
    }
    element = parent(current)
    depth += 1
  }
  return nil
}

/// The process keyboard events go to, given the app's focused element: the remote view's service when the walk finds
/// one, else the focused element's public owner (`publicOwner`, as before #582), else the app (no focused element). With
/// no `actualPid` (the symbol absent) the walk is not made.
func keyboardTarget<Element>(focused: Element?, appPid: pid_t, publicOwner: (Element) -> pid_t, parent: (Element) -> Element?,
                             actualPid: ((Element) -> pid_t?)?, kind: (pid_t) -> OwningProcessKind) -> pid_t {
  guard let focused else { return appPid }
  if let actualPid, let remote = remoteViewKeyOwner(of: focused, appPid: appPid, parent: parent, actualPid: actualPid, kind: kind) {
    return remote
  }
  return publicOwner(focused)
}

/// The reads keyboard targeting makes: the live ones, replaced in the unit tests (a fake tree, the symbol forced missing).
struct KeyTargetReads {
  var focused: (AXUIElement) -> AXUIElement?
  var parent: (AXUIElement) -> AXUIElement?
  /// AXUIElementGetPid's answer, 0 when it has none.
  var publicPid: (AXUIElement) -> pid_t
  /// `_AXUIElementGetActualPid`, nil when it did not resolve.
  var actualPid: ((AXUIElement) -> pid_t?)?
  var kind: (pid_t) -> OwningProcessKind

  /// The live reads over `function`, this process's resolution by default.
  static func live(actualPid function: ActualPid.Function? = ActualPid.resolved) -> KeyTargetReads {
    KeyTargetReads(focused: { elementAttribute($0, kAXFocusedUIElementAttribute) }, parent: { elementAttribute($0, kAXParentAttribute) },
                   publicPid: pid(of:), actualPid: function.map(ActualPid.read), kind: owningProcessKind)
  }

  /// The process keyboard events for `application` (the app `appPid`'s application element) go to.
  func target(_ application: AXUIElement, appPid: pid_t) -> pid_t {
    keyboardTarget(focused: focused(application), appPid: appPid, publicOwner: { owner in
      let pid = publicPid(owner)
      return pid > 0 ? pid : appPid
    }, parent: parent, actualPid: actualPid, kind: kind)
  }
}
