import AppKit
import ApplicationServices
import Foundation

// Route 4, the foreground assist (the spec's Design, "Input" route 4; cua's own, the vendor has no such route): activate
// the app, post, then restore the previously frontmost app and its key window. It exists so an app whose background
// delivery fails (a canvas app) still works, and is reachable only through the owner's per-app override
// (`routes: {<bundle id>: 4}` in engine.json, Config.swift): the engine never chooses it on its own. Every result it
// carries reports `inputRoute: 4`, which the non-interference metric counts as a failure outside an owner-accepted
// family. The activation is the engine's own doing, never an intervention: no tapped user event is attributed for it.
//
// The app is activated through the same seam route 3 re-activates the user's app with (ActivationSystem), and must be
// frontmost within `foregroundWaitMs`, polled at route 3's sampling step; an app that does not come to the front is
// refused as activationFailed with nothing delivered. Whatever happens after the activation, the user's app is
// re-activated and its key window raised again, and the restore is checked the same way: a user's app that is not
// frontmost again within the bound fails the action as foregroundRestoreFailed, after the click was posted (its input
// meta says so), since the user is left looking at another app.

/// How long route 4 waits for the activated app, and for the user's app on the restore, to be frontmost: route 3's
/// guard bound.
let foregroundWaitMs: Double = activationGuardTimeoutMs

/// One action's foreground assist for the bound app `appPid` (the app, not a panel's serving process, is activated).
final class ForegroundAssist {
  let appPid: pid_t
  private let system: ActivationSystem

  init(appPid: pid_t, system: ActivationSystem = ActivationSystem()) {
    self.appPid = appPid
    self.system = system
  }

  /// Brings the app to the front, runs `deliver` (the action's events) while it is there, then restores the user's app
  /// and window. An app already frontmost is neither activated nor restored. A failed delivery's error comes first; a
  /// restore that did not take is reported after a delivery that succeeded.
  func run(_ deliver: () throws -> Void) throws {
    let previous = system.frontmost()
    guard let previous, previous != appPid else {
      try deliver()
      return
    }
    let userWindow = system.userWindow(previous)
    let delivered = Result {
      _ = system.reactivate(appPid)
      guard comesToFront(appPid) else {
        throw EngineError(name: "activationFailed",
                          "The action was not performed: the app did not come to the front for its foreground click within 1 s, and the frontmost app was restored. Nothing was clicked; try again.")
      }
      try deliver()
    }
    let restored = restore(previous, window: userWindow?.element)
    try delivered.get()
    guard restored else {
      throw EngineError(name: "foregroundRestoreFailed",
                        "The click was posted with the app in front, but the app that was frontmost before could not be brought back within 1 s; the user may be left looking at this app. Do not repeat the click.")
    }
  }

  /// Polls the frontmost app until it is `pid`, for at most `foregroundWaitMs`.
  private func comesToFront(_ pid: pid_t) -> Bool {
    let started = system.now()
    while system.frontmost() != pid {
      guard system.now() - started < foregroundWaitMs else { return false }
      system.sleep(activationGuardSampleMs)
    }
    return true
  }

  /// The user's app frontmost again, and its key window on top; answers whether the app is frontmost again in time.
  private func restore(_ previous: pid_t, window: AXUIElement?) -> Bool {
    if system.frontmost() != previous { _ = system.reactivate(previous) }
    let restored = comesToFront(previous)
    if let window { system.raise(window) }
    return restored
  }
}
