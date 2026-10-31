import AppKit
import ApplicationServices
import Foundation

// The cursor's view of the system (the hub's `CursorEnvironment`, the live one): the screens and the accessibility
// display options as last read on the main thread (refreshed by AppKit's notifications, read by the cursor queue under a
// lock, so it never waits on main), the on-screen window list, the frontmost app as the activation notifications name it,
// an element's current frame and window by Accessibility, NSWorkspace's and the distributed notification centres, and an
// `NSProcessInfo` activity (`.userInitiatedAllowingIdleSystemSleep`: plain `.userInitiated` includes
// `.idleSystemSleepDisabled`) held while a cursor shows.

/// The frontmost app as the last activation notification named it (`NSWorkspace.applicationUserInfoKey`). Read while
/// the notification is delivered, NSWorkspace's `frontmostApplication` still answers the previous app (measured on the
/// MacBook, 2026-10-30: it caught up 1–17 ms later), so a check run from the notification would keep the old level until
/// the next quarter-second check. Registered before the hub's observers on the same centre, so it is current when they run.
final class FrontmostApp: @unchecked Sendable {
  private let lock = NSLock()
  private var current: pid_t?
  private var token: NSObjectProtocol?
  private let center: NotificationCenter

  init(center: NotificationCenter, initial: pid_t?) {
    self.center = center
    current = initial
    token = center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: nil) { [weak self] note in
      guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
      self?.lock.withLock { self?.current = app.processIdentifier }
    }
  }

  deinit {
    if let token { center.removeObserver(token) }
  }

  var pid: pid_t? { lock.withLock { current } }
}

final class CursorSystem: @unchecked Sendable {
  private let lock = NSLock()
  private let frontmost: FrontmostApp
  private var screens: CursorScreens = .none
  private var reduceMotion = false
  private var increaseContrast = false
  private var activity: NSObjectProtocol?
  private var observers: [(NotificationCenter, NSObjectProtocol)] = []

  /// Reads AppKit now and on every change; on the main thread, where AppKit posts the notifications. Its observers are
  /// registered before the hub's, so a notification refreshes these readings before the hub re-reads them.
  @MainActor init() {
    let workspace = NSWorkspace.shared.notificationCenter
    frontmost = FrontmostApp(center: workspace, initial: NSWorkspace.shared.frontmostApplication?.processIdentifier)
    refresh()
    observers.append((NotificationCenter.default, NotificationCenter.default.addObserver(
      forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: nil) { [weak self] _ in
        MainActor.assumeIsolated { self?.refresh() }
      }))
    observers.append((workspace, workspace.addObserver(
      forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: nil) { [weak self] _ in
        MainActor.assumeIsolated { self?.refresh() }
      }))
  }

  deinit {
    for (center, token) in observers { center.removeObserver(token) }
  }

  @MainActor private func refresh() {
    let fresh = CursorScreens.current()
    let workspace = NSWorkspace.shared
    let (reduce, contrast) = (workspace.accessibilityDisplayShouldReduceMotion, workspace.accessibilityDisplayShouldIncreaseContrast)
    lock.withLock {
      screens = fresh
      reduceMotion = reduce
      increaseContrast = contrast
    }
  }

  var environment: CursorEnvironment {
    var e = CursorEnvironment()
    e.screens = { [self] in lock.withLock { screens } }
    e.reduceMotion = { [self] in lock.withLock { reduceMotion } }
    e.increaseContrast = { [self] in lock.withLock { increaseContrast } }
    e.windowList = onScreenWindowList
    e.frontmostPid = { [frontmost] in frontmost.pid ?? frontmostPid() }
    e.elementFrame = { frame(of: prepare($0)) }
    e.elementWindow = { element in
      let element = prepare(element)
      guard let window = elementAttribute(element, kAXWindowAttribute) else { return nil }
      return windowNumber(of: window, pid: pid(of: element), frame: frame(of: window))
    }
    e.appWindow = { pid in
      guard let window = primaryWindow(of: prepare(AXUIElementCreateApplication(pid))) else { return nil }
      return windowNumber(of: window, pid: pid, frame: frame(of: window))
    }
    e.workspaceCenter = NSWorkspace.shared.notificationCenter
    e.distributedCenter = DistributedNotificationCenter.default()
    e.appCenter = NotificationCenter.default
    e.timers = true
    e.activity = { [self] showing in
      lock.withLock {
        if showing, activity == nil {
          activity = ProcessInfo.processInfo.beginActivity(options: .userInitiatedAllowingIdleSystemSleep, reason: "cua's agent cursor is on screen")
        } else if !showing, let held = activity {
          ProcessInfo.processInfo.endActivity(held)
          activity = nil
        }
      }
    }
    e.log = { FileHandle.standardError.write(Data("cua-engine: cursor: \($0)\n".utf8)) }
    return e
  }
}

extension CursorHub {
  /// The engine's hub, drawing on this Mac's screens, with `debug`'s arm (engine.json `cursorDebug`); created on the
  /// main thread.
  @MainActor static func live(debug: CursorDebug? = nil) -> CursorHub {
    let system = CursorSystem()
    return CursorHub(environment: system.environment, renderer: CursorPanels(debug: debug), system: system)
  }
}
