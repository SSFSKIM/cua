import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

// The primary window off screen (#367; the Decision Log's #367 entry). A window whose frame lies outside every display,
// or that the window server does not show on the current Space, gives an observation that can look empty (a Chromium
// window it does not show paints nothing and exposes no page) and a screenshot that no coordinate could act on, with
// nothing saying why. The observation names the placement in the Skyshot's `window.placement` ("offScreen",
// "anotherSpace"), which the service prints as one line, and takes no screenshot, as for a minimized window, the reason
// in `screenshotOmitted` ("windowOffScreen", "windowOnAnotherSpace") and the facade's screenshot error naming the remedy.
// Nothing else changes: an on-screen window's Skyshot gains no key, and no input is refused for it (ruling 782, below,
// refuses a Raise on a window on another Space, and an app whose windows there accessibility does not list).
//
// Detection, cheap and claiming only what it read:
// - Off screen: the window's AX frame (already read for the walk and the capture) overlaps no screen's frame (the
//   NSScreen frames ScreenScaleCache keeps, top-left global points like AX frames) by any area. Pure geometry, read
//   first, so a window the window server also lists as not on screen is still named for where it is.
// - Another Space: the window lies on a display but its CGWindow carries no kCGWindowIsOnscreen (the window server
//   omits the key for a window it does not show; one CGWindowListCopyWindowInfo(.optionIncludingWindow) read, about
//   0.1 ms), and its AXMinimized reads false and its app's AXHidden reads false (Minimized.swift's rule runs first),
//   since a minimized window and a hidden app's are the other causes of the flag's absence an observation meets.
// - No usable frame (none, or under one point), no screens read, no window number, or an unread AXMinimized or AXHidden:
//   no claim, and the observation is as it was (a capture it plans still fails noCapturableWindow where it did).

/// Where the primary window is when it is not shown on any display.
enum WindowPlacement: String {
  case offScreen, anotherSpace

  /// The reason a requested screenshot was not taken, as the Skyshot and the result's meta carry it.
  var screenshotOmitted: String { self == .offScreen ? "windowOffScreen" : "windowOnAnotherSpace" }
}

/// The window's placement from its AX frame, the screens' frames, the window server's on-screen flag, and the window's
/// AXMinimized and its app's AXHidden (each nil when unread; the last three read only as needed) -> nil when it is
/// shown, or when nothing read says not. Both claims need a usable frame and the screens: without them the window's
/// geometry is unknown, and the capture's own noCapturableWindow stands. Another Space needs the flag read absent and
/// the window confirmed not minimized and its app confirmed not hidden, since either also clears the flag.
func windowPlacement(frame: CGRect?, screens: [CGRect], onScreen: () -> Bool?, minimized: () -> Bool?, appHidden: () -> Bool?) -> WindowPlacement? {
  guard let frame, frame.width >= 1, frame.height >= 1, !screens.isEmpty else { return nil }
  let onADisplay = screens.contains { screen in
    let overlap = screen.intersection(frame)
    return !overlap.isNull && overlap.width > 0 && overlap.height > 0
  }
  if !onADisplay { return .offScreen }
  if onScreen() == false, minimized() == false, appHidden() == false { return .anotherSpace }
  return nil
}

/// What an observation does with its primary window once its placement is read: a placed window is not captured, the
/// reason given when a screenshot was asked for; with no placement the minimized rule's plan stands, so a capture it
/// plans still runs and every other noCapturableWindow cause (no frame, a frame under one point, no window number, a
/// window the shareable content does not list) still fails the observation as before.
func placementObservation(_ placement: WindowPlacement?, plan: (capture: Bool, screenshotOmitted: String?), includeScreenshot: Bool) -> (capture: Bool, screenshotOmitted: String?) {
  guard let placement else { return plan }
  return (false, includeScreenshot ? placement.screenshotOmitted : nil)
}

/// The Skyshot's `window`: its title, frame and pid, and its placement only when there is one, so an on-screen
/// window's Skyshot is as before.
func windowWire(title: String?, frame: CGRect?, pid: pid_t, placement: WindowPlacement?) -> [String: Any] {
  var wire: [String: Any] = ["title": title ?? NSNull(), "frame": rectWire(frame), "pid": Int(pid)]
  if let placement { wire["placement"] = placement.rawValue }
  return wire
}

/// The window server's on-screen flag for a window number: true when its info carries kCGWindowIsOnscreen true, false
/// when the key is absent (the window server omits it for a window it does not show), nil when the window is not listed.
func windowServerOnScreen(_ number: CGWindowID) -> Bool? {
  guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], number) as? [[String: Any]],
        let info = list.first(where: { ($0[kCGWindowNumber as String] as? Int).map(CGWindowID.init) == number }) else { return nil }
  return info[kCGWindowIsOnscreen as String] as? Bool ?? false
}

/// A window's placement read live (the observation's, and the Raise refusal's): its AX frame against the screens, then
/// the window server's flag, its AXMinimized and its app's AXHidden, each only as needed.
func livePlacement(of window: AXUIElement, application: AXUIElement, frame windowFrame: CGRect?) -> WindowPlacement? {
  windowPlacement(
    frame: windowFrame, screens: screenScales.current.map(\.frame),
    onScreen: { windowNumber(of: window, pid: pid(of: window), frame: windowFrame).flatMap(windowServerOnScreen) },
    minimized: { bool(attribute(window, kAXMinimizedAttribute)) }, appHidden: { bool(attribute(application, kAXHiddenAttribute)) })
}

// Ruling 1ea561bc:782 (the Decision Log's entry for it), from the hosted measurement (run 44122922177): a window's Raise
// action on a window on another Space answered success and did nothing, in all four cases; and an Electron app whose
// only window is on another Space lists no window in AXWindows there, so its observation read the primary window as
// absent, reopened the app, and failed `timeoutReached` after the 5 s primary-window wait. Both now answer the refusal
// below at once, with the reason and remedy of the screenshot's another-Space error (render.mjs's
// WINDOW_PLACEMENT.anotherSpace, word for word after the app's name; test/services-engine-render.test.mjs pins it).

/// The refusal of a window on another Space that cannot be read or raised from here.
func windowOnAnotherSpace(app: String) -> EngineError {
  EngineError(name: "windowOnAnotherSpace", "The \(app) window is on another Space. Ask the user to bring it here or switch to its Space.")
}

/// A window the window server lists for an app: what the absence check reads of its CGWindowListCopyWindowInfo entry.
struct SpacedWindow: Equatable {
  let number: CGWindowID
  let layer: Int
  let onScreen: Bool
}

/// Whether an app that accessibility lists no window for has its windows on another Space: none of its layer-0 windows
/// is on screen, at least one is on a Space and on none of the Spaces the displays show now, and the app is confirmed
/// not hidden. Each claim needs a positive read, so an app that is merely slow to open its window (no window listed, or
/// one on the current Space), one with only ordered-out windows (on no Space: a closed document's buffer, a hidden
/// helper), and an unread current Space or hidden flag all answer false, and the observation reopens and waits as
/// before. The Space reads are made only once a window could answer yes, the hidden flag last.
func windowsOnAnotherSpace(_ windows: [SpacedWindow], currentSpaces: () -> Set<UInt64>, spaces: (CGWindowID) -> Set<UInt64>,
                           appHidden: () -> Bool?) -> Bool {
  let normal = windows.filter { $0.layer == 0 }
  guard !normal.isEmpty, !normal.contains(where: \.onScreen) else { return false }
  let current = currentSpaces()
  guard !current.isEmpty else { return false }
  guard normal.contains(where: { let on = spaces($0.number); return !on.isEmpty && on.isDisjoint(with: current) }) else { return false }
  return appHidden() == false
}

/// A Raise on a window read as on another Space is refused before anything is sent. Any other action, any other
/// element, and a Raise on a window off every display or shown here go ahead (the placement is read only for a Raise
/// on a window).
func raiseRefusal(action: String, role: String?, placement: () -> WindowPlacement?, app: String) -> EngineError? {
  guard action == kAXRaiseAction, role == kAXWindowRole, placement() == .anotherSpace else { return nil }
  return windowOnAnotherSpace(app: app)
}

/// The window server's windows of `pid`: one CGWindowListCopyWindowInfo(.optionAll) read, which lists windows on every
/// Space (about 2.5 ms with 200 windows listed).
func listedWindows(pid: pid_t) -> [SpacedWindow] {
  guard let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] else { return [] }
  return list.compactMap { info in
    guard (info[kCGWindowOwnerPID as String] as? Int).map(pid_t.init) == pid, let number = info[kCGWindowNumber as String] as? Int,
          let layer = info[kCGWindowLayer as String] as? Int else { return nil }
    return SpacedWindow(number: CGWindowID(number), layer: layer, onScreen: info[kCGWindowIsOnscreen as String] as? Bool ?? false)
  }
}

/// SkyLight's Space reads (private, resolved with dlsym; an empty set when absent or unread, which claims nothing).
enum SpaceMembership {
  private typealias ConnectionID = @convention(c) () -> Int32
  private typealias ManagedSpaces = @convention(c) (Int32) -> Unmanaged<CFArray>?
  private typealias SpacesForWindows = @convention(c) (Int32, Int32, CFArray) -> Unmanaged<CFArray>?
  private static let mainConnectionID: ConnectionID? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSMainConnectionID").map { unsafeBitCast($0, to: ConnectionID.self) }
  private static let managedSpaces: ManagedSpaces? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSCopyManagedDisplaySpaces").map { unsafeBitCast($0, to: ManagedSpaces.self) }
  private static let spacesForWindows: SpacesForWindows? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "SLSCopySpacesForWindows").map { unsafeBitCast($0, to: SpacesForWindows.self) }

  /// The Space each display shows now (each managed display's "Current Space").
  static func current() -> Set<UInt64> {
    guard let connection = mainConnectionID?(), let displays = managedSpaces?(connection)?.takeRetainedValue() as? [[String: Any]] else { return [] }
    return Set(displays.compactMap { (($0["Current Space"] as? [String: Any])?["ManagedSpaceID"] as? NSNumber)?.uint64Value })
  }

  /// The Spaces a window is on (every kind, mask 7); none for a window ordered out.
  static func of(_ number: CGWindowID) -> Set<UInt64> {
    guard let connection = mainConnectionID?(),
          let spaces = spacesForWindows?(connection, 7, [NSNumber(value: number)] as CFArray)?.takeRetainedValue() as? [NSNumber] else { return [] }
    return Set(spaces.map(\.uint64Value))
  }
}

/// The absence check the observation's preparation runs before it would reopen an app with no accessible window: the
/// refusal when that app's windows are on another Space, else nil.
func absentWindowRefusal(pid: pid_t, app: String) -> EngineError? {
  windowsOnAnotherSpace(listedWindows(pid: pid), currentSpaces: SpaceMembership.current, spaces: SpaceMembership.of,
                        appHidden: { NSRunningApplication(processIdentifier: pid)?.isHidden }) ? windowOnAnotherSpace(app: app) : nil
}
