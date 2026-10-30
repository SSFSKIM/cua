import AppKit
import ApplicationServices
import Foundation
import ScreenCaptureKit

// The protocol's methods (Interfaces, EngineProtocol): ping, status, approve, shutdown, and execute with the facade's
// method vocabulary plus resolve_app. Nothing here asks for a permission before a request needs it: status reads the
// grants with the non-prompting preflight calls only. Every execute is refused while the Mac is locked (the spec's
// Design, "Lock screen"), whatever its method; the protocol's own methods answer, so doctor can still read status.

struct ExecutionContext {
  let connection: ConnectionState
  let receivedAt: Int64
  let hidIdleMs: Int
  let deadline: Int64
  let lineage: String?
}

struct Outcome {
  let result: Result<Any, EngineError>
  var exitAfter = false
}

/// The input methods: every error they return carries the input meta (Interfaces, input errors), paste's included, so a
/// lock-screen refusal reads the same on every input method.
/// The methods that act through the keyboard alone: they move no cursor, but they are its activity.
private let keyboardOnlyMethods: Set<String> = ["press_key", "type_text", "paste"]

private let inputMethods: Set<String> = ["click", "press_key", "type_text", "paste", "drag", "perform_secondary_action", "scroll", "select_text", "set_value"]

final class Engine: @unchecked Sendable {
  let paths: ServerPaths
  let apps: AppDirectory
  let webAccessibility = WebAccessibility()
  /// The intervention tap and its ledger (Intervention.swift).
  let intervention: InterventionMonitor
  /// The owner's per-app route-4 override, `routes` in engine.json as read at launch (Config.swift).
  let routes: [String: Int]
  /// Route 3's consecutive guard failures per app, for `routeAdvice` and status (Routes.swift).
  let routeAdvice = RouteAdviceTracker()
  /// The held activations of menus and focus holds, one per process across connections (MenuSpan.swift, FocusHold.swift).
  let heldActivations = HeldActivations()
  /// The workspace's real activations and deactivations, which make a held process's activation stale.
  private var activationObservers: [NSObjectProtocol] = []
  /// Whether the Mac is locked now (the session dictionary; replaced in the unit tests).
  let screenLocked: () -> Bool
  /// The pasteboard a paste writes: the general one (Paste.swift; the unit tests write pasteboards of their own).
  let pasteboardAccess: () -> PasteboardAccess
  /// One paste at a time across every connection, from the snapshot through the restore (Pasteboard.swift).
  let pasteLock = FIFOLock()
  /// The outside world of the paste's route-3 activation (Paste.swift): the system's, replaced in the unit tests.
  let pasteActivation: ActivationSystem
  /// The agent cursor (Cursor/CursorHub.swift): the live one draws; the default keeps its state and draws nothing.
  let cursor: CursorHub
  weak var server: Server?

  init(paths: ServerPaths, routes: [String: Int] = [:], intervention: InterventionMonitor = InterventionMonitor(),
       screenLocked: @escaping () -> Bool = screenIsLocked, pasteboard: @escaping () -> PasteboardAccess = SystemPasteboard.general,
       pasteActivation: ActivationSystem = ActivationSystem(), cursor: CursorHub = CursorHub()) {
    self.paths = paths
    self.apps = AppDirectory(usagePath: paths.usage)
    self.routes = routes
    self.intervention = intervention
    self.screenLocked = screenLocked
    self.pasteboardAccess = pasteboard
    self.pasteActivation = pasteActivation
    self.cursor = cursor
    // The person acting in an app a cursor acts in turns that cursor half-transparent: from the detector's own ledger.
    intervention.ledger.onRecord = { [cursor] pid in cursor.userActed(pid: pid) }
    activationObservers = observeRealActivations(NSWorkspace.shared.notificationCenter, registry: heldActivations)
  }

  func handle(_ request: Request, on connection: ConnectionState, receivedAt: Int64) -> Outcome {
    do {
      switch request.method {
      case "ping": return Outcome(result: .success(try ping(request.params)))
      case "status": return Outcome(result: .success(status(connection)))
      case "approve": return Outcome(result: .success(approve()))
      case "shutdown":
        let others = server?.beginShutdown(connection) ?? 0
        if others > 0 { throw EngineError(name: "busy", "busy", extra: ["connections": others]) }
        return Outcome(result: .success([String: Any]()), exitAfter: true)
      case "execute": return Outcome(result: .success(try execute(request.params, connection, receivedAt)))
      default: throw EngineError(rpc: .methodNotFound, "Method not found: \(request.method.prefix(64))")
      }
    } catch let error as EngineError {
      return Outcome(result: .failure(error))
    } catch {
      return Outcome(result: .failure(EngineError(name: "internalError", "The engine failed: \(error.localizedDescription)")))
    }
  }

  private func ping(_ params: [String: Any]) throws -> [String: Any] {
    guard let client = params["clientApiVersion"] as? String else {
      throw EngineError(rpc: .invalidParams, "Invalid params: clientApiVersion is required")
    }
    guard client == serverApiVersion else {
      throw EngineError(.incompatibleClientVersion, "The client speaks \(client.prefix(64)); this engine speaks \(serverApiVersion).")
    }
    return ["serverApiVersion": serverApiVersion, "engineVersion": engineVersion, "build": engineBuild]
  }

  private func status(_ connection: ConnectionState) -> [String: Any] {
    [
      "engineVersion": engineVersion,
      "build": engineBuild,
      "accessibility": AXIsProcessTrusted(),
      "screenRecording": CGPreflightScreenCaptureAccess(),
      "inputMonitoring": CGPreflightListenEventAccess(),  // the non-prompting listen preflight; the engine never requests it
      "canPostHid": CGPreflightPostEventAccess(),
      "socket": paths.socket,
      "pid": Int(getpid()),
      "bundlePath": Bundle.main.bundlePath,
      "connections": server?.others(than: connection) ?? 0,
      // What doctor reports beside the grants: the per-app route-4 override as this engine read it at launch, and the
      // apps route 3's guard has failed three actions in a row for (each named by `routeAdvice` on its refusal).
      "routes": routes,
      "routeAdvice": routeAdvice.advised,
    ]
  }

  /// Requests both grants with their prompts; once both are granted, captures one display image and discards it,
  /// which raises the capture confirmation of a new on-disk copy. Only the owner, at the console, answers these.
  private func approve() -> [String: Any] {
    let accessibility = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)
    let screenRecording = CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()
    var captured = false
    if accessibility && screenRecording, let content = try? shareableContent(), let display = content.displays.first {
      let configuration = SCStreamConfiguration()
      configuration.width = display.width
      configuration.height = display.height
      captured = (try? captureImage(SCContentFilter(display: display, excludingWindows: []), configuration)) != nil
    }
    return ["accessibility": accessibility, "screenRecording": screenRecording, "captured": captured]
  }

  private func execute(_ params: [String: Any], _ connection: ConnectionState, _ receivedAt: Int64) throws -> Any {
    // The deadline first, before anything is dispatched (the vendor's order, F §8.9); a settle or a launch wait still
    // running when it passes is cancelled as timeoutReached (cua's addition, Skyshot.swift).
    let deadline = (params["deadlineUnixMilliseconds"] as? NSNumber)?.int64Value ?? receivedAt + 120_000
    guard deadline > receivedAt else { throw EngineError(rpc: .deadlineExceeded, "Request deadline exceeded") }
    guard let method = params["method"] as? String else { throw EngineError(rpc: .invalidParams, "Invalid params: method is required") }
    let args = params["args"] as? [String: Any] ?? [:]
    let context = ExecutionContext(connection: connection, receivedAt: receivedAt, hidIdleMs: hidIdleMilliseconds(),
                                   deadline: deadline, lineage: params["lineage"] as? String)
    // The lock screen, then every app-scoped method resolves, so the forbidden list holds on every call whoever the
    // client is. An input method refused here carries the input meta like any other error of an input method (nothing
    // posted).
    // A request on the connection holds off the menu span's idle bound while it runs; a span that lapsed while idle takes
    // its record with it before anything reads the record (MenuSpan.swift).
    if let lapsed = connection.menuSpan.requestBegan() { connection.menuRecords[lapsed] = nil }
    _ = connection.focusHold.requestBegan()  // the focus hold's bound likewise (FocusHold.swift); a lapse there clears nothing
    var target: ResolvedApp?
    // Only a request on the record (an observation of the held app, or a press or record on it) restarts the idle bound,
    // and only one that observes or acts on the focus hold's app restarts that one's.
    defer {
      let onRecord = target != nil && target?.key == connection.menuSpan.app && menuSpanRenewingMethods.contains(method)
      connection.menuSpan.requestEnded(onRecord: onRecord)
      connection.focusHold.requestEnded(onRecord: focusHoldRenews(method: method, app: target?.key, heldApp: connection.focusHold.app))
    }
    do {
      try refuseWhenLocked(isLocked: screenLocked)
      if method != "list_apps" && (args["app"] != nil || args["pid"] != nil) { target = try resolveApp(args) }
    } catch let error as EngineError where inputMethods.contains(method) {
      throw withMeta(error, InputMeta(context))
    }
    // The cursor's activity (the spec's Design, "Hooks"): every request counts, a keyboard-only one may bring a faded
    // cursor back at its last point in the app; the 5 s idle runs from the end of the last request.
    cursor.begin(connection: connection.id, app: target?.key, keyboardOnly: keyboardOnlyMethods.contains(method))
    defer { cursor.end(connection: connection.id) }
    // The held menu activation: kept for the recorded menu's observations, ended after the item press (unless the
    // request recorded a menu anew), ended before anything aimed elsewhere.
    let step = menuSpanStep(method: method, app: target?.key, heldApp: connection.menuSpan.app,
                            inRecordedMenu: target.map { connection.inRecordedMenu(args, app: $0.key, lineage: context.lineage) } ?? false)
    do {
      try connection.enterMenuSpan(step)
    } catch let error as EngineError where inputMethods.contains(method) {
      throw withMeta(error, InputMeta(context))
    }
    // The focus hold ends before anything aimed at another app.
    if focusHoldEndsBefore(app: target?.key, heldApp: connection.focusHold.app) { connection.endFocusHold() }
    let spanBefore = connection.menuSpan.serial
    defer { if step == .endAfter && connection.menuSpan.serial == spanBefore { connection.endMenuInteraction() } }
    switch method {
    case "list_apps": return apps.list()
    case "resolve_app":
      let app = try target ?? resolveApp(args)  // resolved once, above, for the menu span's decision too
      apps.recordUse(app)
      return app.wire
    case "get_app_state": return try getAppState(args, context)
    case "click": return try click(args, context)
    case "press_key": return try pressKey(args, context)
    case "type_text": return try typeText(args, context)
    case "paste": return try paste(args, context)
    case "set_value": return try setValue(args, context)
    case "select_text": return try selectText(args, context)
    case "perform_secondary_action": return try performSecondaryAction(args, context)
    case "scroll": return try scroll(args, context)
    case "drag": return try drag(args, context)
    default:
      throw EngineError(name: "unknownMethod", "Unknown method: \(method.prefix(64))")
    }
  }

  /// The app a request names, by `app` (bundle id, name or path) or `pid`.
  func resolveApp(_ args: [String: Any]) throws -> ResolvedApp {
    if let app = args["app"] as? String { return try apps.resolve(app) }
    if let pid = args["pid"] as? NSNumber { return try apps.resolve(pid: pid_t(truncatingIfNeeded: pid.int64Value)) }
    throw EngineError.invalidArguments("app is required")
  }

  /// Fails `permissionsPending` without the Accessibility grant, asking for it once with the system prompt.
  func requireAccessibility() throws {
    guard !AXIsProcessTrusted() else { return }
    _ = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)
    throw EngineError(.permissionsPending, "cua Engine needs the Accessibility permission: allow \"cua Engine\" in System Settings > Privacy & Security > Accessibility, then retry.")
  }

  /// Fails `permissionsPending` without the Screen Recording grant, asking for it with the system prompt; macOS applies
  /// a new grant only to a relaunched engine.
  func requireScreenRecording() throws {
    guard !CGPreflightScreenCaptureAccess() else { return }
    _ = CGRequestScreenCaptureAccess()
    throw EngineError(.permissionsPending, "cua Engine needs the Screen Recording permission: allow \"cua Engine\" in System Settings > Privacy & Security > Screen & System Audio Recording; a relaunch of the engine is pending before screenshots can use it.")
  }

}

/// Fails `screenLocked` (−10020) with the vendor's first sentence (R/sky-behaviour.md §19) while the Mac is locked; no
/// auto-unlock and no guardian (the spec's Design, "Lock screen").
func refuseWhenLocked(isLocked: () -> Bool) throws {
  guard isLocked() else { return }
  throw EngineError(.screenLocked, "The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.")
}

/// The session dictionary's lock flag (`CGSSessionScreenIsLocked`); absent reads as unlocked.
func sessionIsLocked(_ session: [String: Any]?) -> Bool {
  (session?["CGSSessionScreenIsLocked"] as? NSNumber)?.boolValue == true
}

/// Whether the console session is locked now.
func screenIsLocked() -> Bool { sessionIsLocked(CGSessionCopyCurrentDictionary() as? [String: Any]) }

/// Milliseconds since the last input event of any kind at the HID level, machine-wide.
func hidIdleMilliseconds() -> Int {
  let anyInput = CGEventType(rawValue: ~0)!
  return Int((CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: anyInput) * 1000).rounded())
}
