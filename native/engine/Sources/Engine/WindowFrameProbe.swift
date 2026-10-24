import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

// `--probe window-frame --pid <n> --window <cgWindowID> --frame <x,y,w,h>` (Interfaces, UserProbe):
// place a harness-owned Finder window through the approved bundle's existing Accessibility grant.
// Launched through the approved bundle/open launcher; the JSON result, not open's status, proves completion.
// Coordinates are global desktop points in AX/CG's top-left convention, NOT AppKit bottom-left
// coordinates or backing pixels. Negative origins are legal. Dimensions must be finite and positive.
// The harness must retain the PID + CGWindowID of its OWN window; Finder's bundle ID alone cannot
// establish ownership. For this Finder harness we additionally require com.apple.finder, AXWindow,
// a layer-zero CG entry, and settable AX size AND position. No title/content/focus matching or activation.
// A Finder-only restriction is intentional: do not silently generalize this into arbitrary-app writes.
//
// Exact identity uses existing windowNumber(..., frame: nil). AX.swift then uses its feature-detected
// _AXUIElementGetWindow SPI ONLY: nil frame disables its owner+bounds fallback. This dependence on
// AX.swift is load-bearing. If the helper changes, expose an explicit exact-only helper there.
// A positively read non-AXWindow role is ineligible and excluded (Finder may list its desktop).
// Missing/unreadable roles and unknown identity in ANY AXWindow, duplicate matches, absent SPI,
// absent CG entry, or wrong owner all fail closed. Enumeration is bounded to 128 entries.
//
// Writes are size then position (resize may relocate the window). No raise, focus, unminimize, retries
// of writes, or rollback: two AX writes cannot be atomic. A failure may have partially changed this
// one window. The harness records the refusal, restores Finder chrome/preferences and closes its owned window;
// it must not retry against a different window or claim that the frame was pinned.
// A successful size write must converge in CG before position is written: at most 11 samples /
// 10 sleeps of 50 ms, with same-handle identity checked each time. Size failure leaves position alone.
// Final CG readback has its own unchanged 11 samples / 10 sleeps of 50 ms bound. These bound attempts,
// not OS-call wall time. matched requires BOTH writes and all four CG components within <1 point.
// On failure readBack is the last exact CG reading (or null), never an AX-derived/optimistic frame.
//
// Result: {pid,window,requested,readBack,matched,exitStatus,diagnostic,excludedEntries,trace}.
// diagnostic is null except for identity/size refusals: {stage,reason,windowCount?,matchCount?,unknownEntry?}.
// trace holds <=25 exact-target CG samples {stage,atMs,frame} and <=2 setters
// {attribute,startMs,endMs,axError}, retained on failure too. All times are relative monotonic ms.
// Entry metadata is {index,role,subrole}: zero-based original-list index and allowlisted labels only.
// excludedEntries retains the nonwindows encountered before completion/refusal (at most 128).
// matchCount is present only after a complete scan. No arbitrary AX strings, other window identities,
// or raw OS dictionaries are emitted. Subrole is diagnostic only; it never establishes identity.
// Status: 0 matched; 2 identity/target refused; 3 existing AX trust absent; 4 unsettable/write failure;
// 5 final CG readback did not converge; 6 size did not converge before position (position not written).
// Malformed arguments follow Probe's existing error+exitStatus 64 form.
// No AXIsProcessTrustedWithOptions, screen capture, AppleEvents, permission prompt, titles or values.

struct WindowFrameRequest: Equatable {
  let pid: pid_t
  let window: CGWindowID
  let frame: CGRect

  static func parse(_ arguments: [String]) -> WindowFrameRequest? {
    var pid: pid_t?, window: CGWindowID?, frame: CGRect?
    var rest = arguments[...]
    while let flag = rest.popFirst() {
      guard let value = rest.popFirst() else { return nil }
      switch flag {
      case "--pid" where pid == nil:
        guard let number = Int32(value), number > 0 else { return nil }
        pid = number
      case "--window" where window == nil:
        guard let number = UInt32(value), number != kCGNullWindowID else { return nil }
        window = number
      case "--frame" where frame == nil:
        let parts = value.split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        let numbers = parts.compactMap { Double($0) }
        guard numbers.count == 4, numbers.allSatisfy({ $0.isFinite }) else { return nil }
        let rect = CGRect(x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3])
        guard windowFrameIsValid(rect) else { return nil }
        frame = rect
      default: return nil
      }
    }
    guard let pid, let window, let frame else { return nil }
    return WindowFrameRequest(pid: pid, window: window, frame: frame)
  }
}

func windowFrameIsValid(_ frame: CGRect) -> Bool {
  [frame.origin.x, frame.origin.y, frame.size.width, frame.size.height,
   frame.origin.x + frame.size.width, frame.origin.y + frame.size.height].allSatisfy { $0.isFinite }
    && frame.size.width > 0 && frame.size.height > 0
}

func windowFrameMatches(_ actual: CGRect?, _ requested: CGRect) -> Bool {
  guard let actual, windowFrameIsValid(actual), windowFrameIsValid(requested) else { return false }
  return abs(actual.origin.x - requested.origin.x) < 1 && abs(actual.origin.y - requested.origin.y) < 1
    && abs(actual.size.width - requested.size.width) < 1 && abs(actual.size.height - requested.size.height) < 1
}

func windowFrameSizeMatches(_ actual: CGRect?, _ requested: CGRect) -> Bool {
  guard let actual, windowFrameIsValid(actual), windowFrameIsValid(requested) else { return false }
  return abs(actual.size.width - requested.size.width) < 1 && abs(actual.size.height - requested.size.height) < 1
}

struct WindowFrameIdentity: Equatable {
  let pid: pid_t
  let window: CGWindowID
}

// Dependency seam for the fake-tree tests, like the closures used by TextViewProbe's searches.
struct WindowFrameSource<Element> {
  var trusted: () -> Bool
  var allowedPID: (pid_t) -> Bool
  var windows: (pid_t) -> [Element]?
  var identity: (Element) -> WindowFrameIdentity?
  var cgFrame: (pid_t, CGWindowID) -> CGRect?
  var canSetFrame: (Element) -> Bool
  var setSize: (Element, CGSize) -> AXError
  var setPosition: (Element, CGPoint) -> AXError
  var settle: () -> Void
  // nil includes failed reads and malformed values. Exact identity is consulted only for AXWindow.
  var role: (Element) -> String?
  var subrole: (Element) -> String?
  var now: () -> Double // monotonic milliseconds, never wall-clock time
}

// Only this finite vocabulary may leave the process. Raw AX strings decide role eligibility but
// are never retained in result metadata; unlisted positive values become "other", absent ones "unknown".
struct WindowFrameEntry {
  enum Role: String {
    case window = "AXWindow", scrollArea = "AXScrollArea", group = "AXGroup"
    case application = "AXApplication", sheet = "AXSheet", unknownRole = "AXUnknown"
    case other, unknown
  }
  enum Subrole: String {
    case desktop = "AXDesktop", standardWindow = "AXStandardWindow", dialog = "AXDialog"
    case systemDialog = "AXSystemDialog", floatingWindow = "AXFloatingWindow", unknownSubrole = "AXUnknown"
    case other, unknown
  }
  let index: Int
  let role: Role
  let subrole: Subrole

  init(index: Int, role: String?, subrole: String?) {
    self.index = index
    self.role = role.map { $0.isEmpty ? .unknown : Role(rawValue: $0) ?? .other } ?? .unknown
    self.subrole = subrole.map { $0.isEmpty ? .unknown : Subrole(rawValue: $0) ?? .other } ?? .unknown
  }

  var wire: [String: Any] { ["index": index, "role": role.rawValue, "subrole": subrole.rawValue] }
}

struct WindowFrameDiagnostic {
  enum Stage: String {
    case initialIdentity = "initial-identity"
    case windowList = "ax-window-list"
    case numberMatch = "ax-number-match"
    case beforeSize = "identity-recheck-before-size"
    case beforePosition = "identity-recheck-before-position"
    case sizeConvergence = "size-convergence"
  }
  enum Reason: String {
    case disallowedPID = "disallowed-pid"
    case cgWindowUnavailable = "cg-window-unavailable"
    case unavailable, empty
    case limitExceeded = "limit-exceeded"
    case unknownIdentity = "unknown-identity"
    case wrongOwner = "wrong-owner"
    case invalidNumber = "invalid-number"
    case noMatch = "no-match"
    case ambiguousMatch = "ambiguous-match"
    case axIdentityChanged = "ax-identity-changed"
    case sizeNotConverged = "size-not-converged"
  }
  let stage: Stage
  let reason: Reason
  let windowCount: Int?
  let matchCount: Int?
  var unknownEntry: WindowFrameEntry? = nil

  var wire: [String: Any] {
    var result: [String: Any] = ["stage": stage.rawValue, "reason": reason.rawValue]
    if let windowCount { result["windowCount"] = windowCount }
    if let matchCount { result["matchCount"] = matchCount }
    if let unknownEntry { result["unknownEntry"] = unknownEntry.wire }
    return result
  }
}

struct WindowFrameTrace {
  enum Stage: String { case initial, afterSize = "after-size", finalReadback = "final" }
  enum Attribute: String { case size, position }
  struct Sample {
    let stage: Stage
    let atMs: Double
    let frame: CGRect?
    var wire: [String: Any] { ["stage": stage.rawValue, "atMs": atMs, "frame": rectWire(frame)] }
  }
  struct Setter {
    let attribute: Attribute
    let startMs: Double
    let endMs: Double
    let error: AXError
    var wire: [String: Any] {
      ["attribute": attribute.rawValue, "startMs": startMs, "endMs": endMs, "axError": Int(error.rawValue)]
    }
  }
  var samples: [Sample] = []
  var setters: [Setter] = []
  var wire: [String: Any] { ["samples": samples.map { $0.wire }, "setters": setters.map { $0.wire }] }
}

struct WindowFrameResult {
  let readBack: CGRect?
  let matched: Bool
  let exitStatus: Int32
  var diagnostic: WindowFrameDiagnostic? = nil
  var excludedEntries: [WindowFrameEntry] = []
  var trace = WindowFrameTrace()

  func wire(for request: WindowFrameRequest) -> [String: Any] {
    ["pid": Int(request.pid), "window": request.window, "requested": rectWire(request.frame),
     "readBack": rectWire(readBack), "matched": matched, "exitStatus": Int(exitStatus),
     "diagnostic": diagnostic.map { $0.wire as Any } ?? NSNull(),
     "excludedEntries": excludedEntries.map { $0.wire }, "trace": trace.wire]
  }
}

func runWindowFrame<Element>(_ request: WindowFrameRequest, source: WindowFrameSource<Element>) -> WindowFrameResult {
  var excludedEntries: [WindowFrameEntry] = []
  var trace = WindowFrameTrace()
  let started = source.now()
  var readBack: CGRect?
  // Every CG call uses the requested owner/number; trace records the reading when the call returns.
  // Guard reads count too: <=2 initial + <=12 after-size + <=11 final samples on any path.
  func sample(_ stage: WindowFrameTrace.Stage) -> CGRect? {
    readBack = source.cgFrame(request.pid, request.window)
    trace.samples.append(.init(stage: stage, atMs: source.now() - started, frame: readBack))
    return readBack
  }
  func write(_ attribute: WindowFrameTrace.Attribute, operation: () -> AXError) -> AXError {
    let start = source.now() - started
    let error = operation()
    trace.setters.append(.init(attribute: attribute, startMs: start, endMs: source.now() - started, error: error))
    return error
  }
  func fail(_ status: Int32, readBack: CGRect? = nil) -> WindowFrameResult {
    WindowFrameResult(readBack: readBack, matched: false, exitStatus: status,
                      excludedEntries: excludedEntries, trace: trace)
  }
  func refuse(_ stage: WindowFrameDiagnostic.Stage, _ reason: WindowFrameDiagnostic.Reason,
              readBack: CGRect? = nil, windowCount: Int? = nil, matchCount: Int? = nil,
              unknownEntry: WindowFrameEntry? = nil) -> WindowFrameResult {
    WindowFrameResult(readBack: readBack, matched: false, exitStatus: 2,
                      diagnostic: WindowFrameDiagnostic(stage: stage, reason: reason,
                                                        windowCount: windowCount, matchCount: matchCount,
                                                        unknownEntry: unknownEntry),
                      excludedEntries: excludedEntries, trace: trace)
  }
  func sizeNotConverged() -> WindowFrameResult {
    WindowFrameResult(readBack: readBack, matched: false, exitStatus: 6,
                      diagnostic: WindowFrameDiagnostic(stage: .sizeConvergence, reason: .sizeNotConverged,
                                                        windowCount: nil, matchCount: nil),
                      excludedEntries: excludedEntries, trace: trace)
  }
  func entry(_ element: Element, index: Int, role: String?) -> WindowFrameEntry {
    WindowFrameEntry(index: index, role: role, subrole: source.subrole(element))
  }
  guard source.trusted() else { return fail(3) }
  guard source.allowedPID(request.pid) else { return refuse(.initialIdentity, .disallowedPID) }
  // This CG read both proves the owner/number pair and establishes the WindowServer connection
  // BEFORE AX reads, important for probes launched via open (the FocusProbe connection pattern).
  guard let initial = sample(.initial) else { return refuse(.initialIdentity, .cgWindowUnavailable) }
  guard let windows = source.windows(request.pid) else { return refuse(.windowList, .unavailable, readBack: initial) }
  guard !windows.isEmpty else { return refuse(.windowList, .empty, readBack: initial, windowCount: 0) }
  guard windows.count <= 128 else { return refuse(.windowList, .limitExceeded, readBack: initial, windowCount: windows.count) }
  let wanted = WindowFrameIdentity(pid: request.pid, window: request.window)
  var candidates: [(index: Int, element: Element)] = []
  for (index, element) in windows.enumerated() {
    let role = source.role(element)
    guard let role, !role.isEmpty else {
      return refuse(.numberMatch, .unknownIdentity, readBack: initial, windowCount: windows.count,
                    unknownEntry: entry(element, index: index, role: role))
    }
    guard role == kAXWindowRole else {
      excludedEntries.append(entry(element, index: index, role: role))
      continue
    }
    // A positive nonwindow cannot be our AXWindow target. An unresolved AXWindow still could
    // hide a second match, so never skip it, even when an earlier element matched exactly.
    guard let identity = source.identity(element) else {
      return refuse(.numberMatch, .unknownIdentity, readBack: initial, windowCount: windows.count,
                    unknownEntry: entry(element, index: index, role: role))
    }
    guard identity.pid == request.pid else {
      return refuse(.numberMatch, .wrongOwner, readBack: initial, windowCount: windows.count,
                    unknownEntry: entry(element, index: index, role: role))
    }
    guard identity.window != 0 else {
      return refuse(.numberMatch, .invalidNumber, readBack: initial, windowCount: windows.count,
                    unknownEntry: entry(element, index: index, role: role))
    }
    if identity == wanted { candidates.append((index, element)) }
  }
  guard candidates.count == 1 else {
    return refuse(.numberMatch, candidates.isEmpty ? .noMatch : .ambiguousMatch,
                  readBack: initial, windowCount: windows.count, matchCount: candidates.count)
  }
  let (index, element) = candidates[0]
  guard source.canSetFrame(element) else { return fail(4, readBack: initial) }

  // Keep the same AX handle, rechecking its role and exact identity before each write. Subrole
  // is read only for exclusion/refusal metadata; no retries or reselection after a race.
  func recheckFailure(_ stage: WindowFrameDiagnostic.Stage, phase: WindowFrameTrace.Stage) -> WindowFrameResult? {
    guard source.allowedPID(request.pid) else {
      return refuse(stage, .disallowedPID, readBack: sample(phase))
    }
    let role = source.role(element)
    guard role == kAXWindowRole, source.identity(element) == wanted else {
      return refuse(stage, .axIdentityChanged, readBack: sample(phase),
                    unknownEntry: entry(element, index: index, role: role))
    }
    guard sample(phase) != nil else {
      return refuse(stage, .cgWindowUnavailable, readBack: nil)
    }
    return nil
  }
  if let failure = recheckFailure(.beforeSize, phase: .initial) { return failure }
  guard write(.size, operation: { source.setSize(element, request.frame.size) }) == .success else {
    return fail(4, readBack: sample(.afterSize))
  }

  // AX acceptance can precede layout. A dependent position write may otherwise preserve stale size.
  // This is an ordering safeguard, not a claim about the cause of any particular app's refusal.
  for attempt in 0..<11 {
    if attempt > 0 { source.settle() }
    if let failure = recheckFailure(.beforePosition, phase: .afterSize) { return failure }
    if windowFrameSizeMatches(readBack, request.frame) { break }
  }
  guard windowFrameSizeMatches(readBack, request.frame) else { return sizeNotConverged() }
  // Revalidate the same target immediately before the write. If size was lost since convergence,
  // refuse rather than knowingly letting the position write carry stale dimensions forward.
  if let failure = recheckFailure(.beforePosition, phase: .afterSize) { return failure }
  guard windowFrameSizeMatches(readBack, request.frame) else { return sizeNotConverged() }
  guard write(.position, operation: { source.setPosition(element, request.frame.origin) }) == .success else {
    return fail(4, readBack: sample(.finalReadback))
  }

  for attempt in 0..<11 {
    if attempt > 0 { source.settle() }
    // sample assigns nil too: disappearance must not return stale geometry as current.
    if windowFrameMatches(sample(.finalReadback), request.frame) {
      return WindowFrameResult(readBack: readBack, matched: true, exitStatus: 0,
                               excludedEntries: excludedEntries, trace: trace)
    }
  }
  return fail(5, readBack: readBack)
}

// Only geometric metadata is inspected. CG's API may return additional keys; do not log/serialize
// its dictionaries, and never consult kCGWindowName. No screen recording permission is requested.
func windowFrameCGEntry(_ entries: [[String: Any]], pid: pid_t, window: CGWindowID) -> CGRect? {
  let matching = entries.filter {
    ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid
      && ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == window
  }
  guard matching.count == 1, let entry = matching.first,
        (entry[kCGWindowLayer as String] as? NSNumber)?.intValue == 0,
        let bounds = entry[kCGWindowBounds as String] as? NSDictionary,
        let frame = CGRect(dictionaryRepresentation: bounds), windowFrameIsValid(frame) else { return nil }
  return frame
}

private func liveWindowFrameSource() -> WindowFrameSource<AXUIElement> {
  WindowFrameSource(
    trusted: { AXIsProcessTrusted() },
    allowedPID: { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier == "com.apple.finder" },
    windows: { pid in
      let app = prepare(AXUIElementCreateApplication(pid))
      let read = copyAttribute(app, kAXWindowsAttribute)
      guard read.error == .success, let value = read.value, CFGetTypeID(value) == CFArrayGetTypeID() else { return nil }
      let array = value as! CFArray
      let count = CFArrayGetCount(array)
      // nil means no usable bounded list (AX error, malformed value or excessive count).
      // Preserve a valid empty array so it is distinguishable from an unavailable list.
      guard count <= 128 else { return nil }
      let windows = elementList(value)
      guard windows.count == count else { return nil } // malformed array must not hide an ambiguous element
      return windows.map(prepare)
    },
    identity: { element in
      let owner = pid(of: element)
      guard owner > 0, let number = windowNumber(of: element, pid: owner, frame: nil) else { return nil }
      return WindowFrameIdentity(pid: owner, window: number)
    },
    cgFrame: { pid, window in
      guard let list = CGWindowListCopyWindowInfo(.optionIncludingWindow, window) as? [[String: Any]] else { return nil }
      return windowFrameCGEntry(list, pid: pid, window: window)
    },
    canSetFrame: { element in
      var sizeSettable: DarwinBoolean = false, positionSettable: DarwinBoolean = false
      let sizeError = AXUIElementIsAttributeSettable(element, kAXSizeAttribute as CFString, &sizeSettable)
      let positionError = AXUIElementIsAttributeSettable(element, kAXPositionAttribute as CFString, &positionSettable)
      return sizeError == .success && positionError == .success && sizeSettable.boolValue && positionSettable.boolValue
    },
    setSize: { element, requested in
      var size = requested
      guard let value = AXValueCreate(.cgSize, &size) else { return .failure }
      return AXUIElementSetAttributeValue(element, kAXSizeAttribute as CFString, value)
    },
    setPosition: { element, requested in
      var point = requested
      guard let value = AXValueCreate(.cgPoint, &point) else { return .failure }
      return AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, value)
    },
    settle: { usleep(50_000) },
    role: { stringAttribute($0, kAXRoleAttribute) },
    subrole: { stringAttribute($0, kAXSubroleAttribute) },
    now: monotonicMilliseconds)
}

extension Probe {
  static func windowFrame(_ arguments: [String]) -> Int32 {
    guard let request = WindowFrameRequest.parse(arguments) else {
      return emit(["error": "usage: --probe window-frame --pid <n> --window <cgWindowID> --frame <x,y,w,h>"], status: 64)
    }
    let result = runWindowFrame(request, source: liveWindowFrameSource())
    return emit(result.wire(for: request), status: result.exitStatus)
  }
}
