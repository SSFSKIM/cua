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

/// How long the walk may spend reading parents (ruling 1206): past it no further parent is read and the keys stay where
/// main sends them. A real chain from a focused element to its application is a few dozen levels of sub-millisecond
/// reads, and the walk usually ends at the focused element itself (the Open panel's list did), so this leaves ample room
/// for a deep or slow chain while a hung app costs keys at most a quarter of a second (plus one read's 50 ms floor),
/// not the 300 one-second messaging timeouts the depth bound alone allowed. The request's deadline bounds it too.
let keyTargetWalkBudgetMs: Double = 250

/// The vendor's out-of-process keyboard target: the focused element first, then its parents, `maxDepth` of them at most;
/// at each, the actual pid (`actualPid`, nil passes the element over) and its process's kind (`.unknown` passes it over
/// too). The first element that classifies ends the walk: its pid when the process is prohibited-policy and not the
/// app's, else nil (the keys stay with the app). A parent is read only when it will be inspected, and only while
/// `leftMs` (the walk's time left) is positive; `parent` is given that time to bound its read. No answer by then is nil,
/// and `cutOff` is told: the walk stopped at its time, not at an answer or the chain's end. A parent read that answers
/// nothing once the time is spent (its messaging timeout, set to the time left, fired) is told as cut off too (ruling
/// 1210); the answer is nil either way, so the flag never changes where the keys go.
func remoteViewKeyOwner<Element>(of focused: Element, appPid: pid_t, parent: (Element, Double) -> Element?, actualPid: (Element) -> pid_t?,
                                 kind: (pid_t) -> OwningProcessKind, leftMs: () -> Double = { .infinity }, maxDepth: Int = 300,
                                 cutOff: () -> Void = {}) -> pid_t? {
  var current = focused
  var depth = 0
  while true {
    if let owner = actualPid(current) {
      switch kind(owner) {
      case .unknown: break
      case .application: return nil
      case .prohibited: return owner == appPid ? nil : owner
      }
    }
    guard depth < maxDepth else { return nil }
    let left = leftMs()
    guard left > 0 else {
      cutOff()
      return nil
    }
    guard let next = parent(current, left) else {
      if leftMs() <= 0 { cutOff() }
      return nil
    }
    current = next
    depth += 1
  }
}

/// The process keyboard events go to, given the app's focused element: the remote view's service when the walk finds
/// one, else the focused element's public owner (`publicOwner`, as before #582), else the app (no focused element). With
/// no `actualPid` (the symbol absent) the walk is not made.
func keyboardTarget<Element>(focused: Element?, appPid: pid_t, publicOwner: (Element) -> pid_t, parent: (Element, Double) -> Element?,
                             actualPid: ((Element) -> pid_t?)?, kind: (pid_t) -> OwningProcessKind,
                             leftMs: () -> Double = { .infinity }, cutOff: () -> Void = {}) -> pid_t {
  guard let focused else { return appPid }
  if let actualPid, let remote = remoteViewKeyOwner(of: focused, appPid: appPid, parent: parent, actualPid: actualPid, kind: kind,
                                                    leftMs: leftMs, cutOff: cutOff) {
    return remote
  }
  return publicOwner(focused)
}

/// The reads keyboard targeting makes: the live ones, replaced in the unit tests (a fake tree, the symbol forced missing,
/// a fake clock, a forbidden process).
struct KeyTargetReads {
  var focused: (AXUIElement) -> AXUIElement?
  /// An element's parent, read within the milliseconds given.
  var parent: (AXUIElement, Double) -> AXUIElement?
  /// AXUIElementGetPid's answer, 0 when it has none.
  var publicPid: (AXUIElement) -> pid_t
  /// `_AXUIElementGetActualPid`, nil when it did not resolve.
  var actualPid: ((AXUIElement) -> pid_t?)?
  var kind: (pid_t) -> OwningProcessKind
  /// The walk's clock (ms).
  var now: () -> Double = monotonicMilliseconds
  /// The forbidden list on the keys' process (OwnerPolicy.swift): throws Policy's refusal.
  var refuseForbidden: (pid_t) throws -> Void = { try refuseForbiddenOwner($0) }

  /// The live reads over `function`, this process's resolution by default.
  static func live(actualPid function: ActualPid.Function? = ActualPid.resolved) -> KeyTargetReads {
    KeyTargetReads(focused: { elementAttribute($0, kAXFocusedUIElementAttribute) }, parent: { element, leftMs in
      guard let timeout = boundedMessagingTimeout(leftMs: leftMs) else { return nil }
      AXUIElementSetMessagingTimeout(element, timeout)
      defer { AXUIElementSetMessagingTimeout(element, elementMessagingTimeout) }
      return elementAttribute(element, kAXParentAttribute)
    }, publicPid: pid(of:), actualPid: function.map(ActualPid.read), kind: owningProcessKind)
  }

  /// The process keyboard events for `application` (the app `appPid`'s application element) go to, the walk given
  /// `budgetMs` from now, and whether the walk was cut off at that time.
  func target(_ application: AXUIElement, appPid: pid_t, budgetMs: Double = keyTargetWalkBudgetMs) -> KeyTarget {
    let cutoff = now() + budgetMs
    var cutOff = false
    let pid = keyboardTarget(focused: focused(application), appPid: appPid, publicOwner: { owner in
      let pid = publicPid(owner)
      return pid > 0 ? pid : appPid
    }, parent: parent, actualPid: actualPid, kind: kind, leftMs: { cutoff - now() }, cutOff: { cutOff = true })
    return KeyTarget(pid: pid, walkCutOff: cutOff)
  }
}

/// Where keys go, and whether the walk that chose it was cut off at its time (the keys then go where main sent them).
struct KeyTarget: Equatable {
  let pid: pid_t
  var walkCutOff = false
}

/// The notice a model reads when keys were posted after the walk was cut off at its time (rulings 1207 and 1210): they
/// went by ordinary routing to `destination` (`keyDestinationName`). Short, so that before a method's own note (the
/// password field's, 354 characters) both fit the service's 500-character note for an app name up to about 19 characters,
/// and only the method's note is ever cut.
func keyTargetCutOffNotice(destination: String) -> String {
  "The check for an Open or Save panel timed out, so the keys went to \(destination) by ordinary routing and may not have reached such a panel."
}

/// The process keys posted to `pid` went to, as the notice names it: the app by its name when `pid` is the app's, else
/// the process's localized name, else its bundle id, else its pid.
func keyDestinationName(_ pid: pid_t, appPid: pid_t, appName: String,
                        running: (pid_t) -> (name: String?, bundleIdentifier: String?) = { pid in
                          let process = NSRunningApplication(processIdentifier: pid)
                          return (process?.localizedName, process?.bundleIdentifier)
                        }) -> String {
  if pid == appPid { return appName }
  let process = running(pid)
  return process.name ?? process.bundleIdentifier ?? "process \(pid)"
}

/// The cut-off notice for a key input, when its keys were posted after a cut-off final read (`InputMeta.keyTargetCutOff`
/// set and something posted); nil otherwise, so a refusal before the post never claims keys were sent.
func keyTargetCutOffNotice(_ meta: InputMeta, appPid: pid_t, appName: String,
                           running: ((pid_t) -> (name: String?, bundleIdentifier: String?))? = nil) -> String? {
  guard let pid = meta.keyTargetCutOff, meta.startedAt != nil else { return nil }
  let destination = running.map { keyDestinationName(pid, appPid: appPid, appName: appName, running: $0) }
    ?? keyDestinationName(pid, appPid: appPid, appName: appName)
  return keyTargetCutOffNotice(destination: destination)
}

/// A key input's result (press_key, type_text, paste): the input meta and the note a model reads (the result's `note`,
/// which the service puts in the tool result's text, cut at 500 characters): the cut-off notice first, then the
/// method's own note, joined by a space.
func keyInputResult(_ meta: InputMeta, note: String?, appPid: pid_t, appName: String,
                    running: ((pid_t) -> (name: String?, bundleIdentifier: String?))? = nil) -> [String: Any] {
  var result: [String: Any] = ["meta": meta.wire]
  let notes = [keyTargetCutOffNotice(meta, appPid: appPid, appName: appName, running: running), note].compactMap { $0 }
  if !notes.isEmpty { result["note"] = notes.joined(separator: " ") }
  return result
}

/// A key input's error, with its meta (`withMeta`) and, when its keys were posted after a cut-off final read, the notice
/// after its own sentence (ruling 1210: a typeUnconfirmed after typed text, a ⌘V that timed out).
func keyInputError(_ error: EngineError, _ meta: InputMeta, appPid: pid_t, appName: String,
                   running: ((pid_t) -> (name: String?, bundleIdentifier: String?))? = nil) -> EngineError {
  let carried = withMeta(error, meta)
  guard let notice = keyTargetCutOffNotice(meta, appPid: appPid, appName: appName, running: running) else { return carried }
  return EngineError(code: carried.code, errorName: carried.errorName, message: carried.message + " " + notice, extra: carried.extra)
}

extension EngineError {
  /// An error made again with all its parts (`keyInputError`'s message with the notice).
  init(code: Int, errorName: String, message: String, extra: [String: Any]) {
    self.code = code
    self.errorName = errorName
    self.message = message
    self.extra = extra
  }
}

/// The request's deadline passed before its keys were sent (ruling 1206): refused, never posted late.
let keysDeadlinePassed = EngineError(name: "timeoutReached",
  "timeoutReached: the request's deadline passed before its keys were sent. Nothing was sent.")

/// Refuses keys whose request is past its deadline (`deadline`, Unix ms), just before the first is posted.
func refuseLateKeys(deadline: Int64, now: () -> Int64 = unixMilliseconds) throws {
  if now() >= deadline { throw keysDeadlinePassed }
}

extension Engine {
  /// The process keyboard events go to, press_key's, type_text's (both routes) and paste's alike: a remote-view panel's
  /// service when the vendor's walk finds one (#582), else the public owner of the app's focused element, else the app
  /// (`pid`). The walk is bounded by `keyTargetWalkBudgetMs` and by the request's deadline when one is given.
  func keyboardTarget(_ application: AXUIElement, fallback pid: pid_t, deadline: Int64? = nil) -> pid_t {
    keyTarget(application, fallback: pid, deadline: deadline).pid
  }

  /// `keyboardTarget`'s answer with whether its walk was cut off at its time budget.
  func keyTarget(_ application: AXUIElement, fallback pid: pid_t, deadline: Int64? = nil) -> KeyTarget {
    let left = deadline.map { Double($0 - unixMilliseconds()) } ?? .infinity
    return keyTargetReads.target(application, appPid: pid, budgetMs: min(keyTargetWalkBudgetMs, left))
  }

  /// Before anything is touched (ruling 1206): the keys' process as it reads now, refused when a forbidden process serves
  /// it, else driven for the app by the intervention detector from now on (ruling 1207), so a person's key into it while
  /// the action waits for its lock or activation stops the action. The keys themselves go to `finalKeyTarget`'s answer.
  @discardableResult
  func earlyKeyTarget(_ application: AXUIElement, pid: pid_t, app: ResolvedApp, context: ExecutionContext) throws -> pid_t {
    let target = keyboardTarget(application, fallback: pid, deadline: context.deadline)
    try keyTargetReads.refuseForbidden(target)
    actionTargets(target, app: app, connection: context.connection)
    return target
  }

  /// The keys' process once any activation has run, read again just before the first key event (ruling 1206: an
  /// activation can move focus between a document and its Open or Save panel, so a read before it can name the wrong
  /// process): refused when a forbidden process serves it, then driven for the app as well. Only this read's process gets
  /// the keys. The activation itself stays the app's.
  func finalKeyTarget(_ application: AXUIElement, pid: pid_t, app: ResolvedApp, context: ExecutionContext) throws -> KeyTarget {
    let target = keyTarget(application, fallback: pid, deadline: context.deadline)
    try keyTargetReads.refuseForbidden(target.pid)
    actionTargets(target.pid, app: app, connection: context.connection)
    return target
  }
}
