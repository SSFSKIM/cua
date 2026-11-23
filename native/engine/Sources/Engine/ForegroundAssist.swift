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
// refused as activationFailed with nothing delivered. After delivery, except when the intervention guard stopped it,
// the user's app is re-activated and its key window raised again; an interruption yields without further activation
// or raising. The restore is checked the same way: a user's app that is not
// frontmost again within the bound fails the action as foregroundRestoreFailed, after the click was posted (its input
// meta says so), since the user is left looking at another app. Whether the user's key window came back after the raise
// is read again after the restore and reported (`keyWindowRestored` in the input meta), not enforced: a window that
// refuses the raise leaves the user's app in front with another key window, which the harness's route-4 cell reads.

/// How long route 4 waits for the activated app, and for the user's app on the restore, to be frontmost: route 3's
/// guard bound.
let foregroundWaitMs: Double = activationGuardTimeoutMs

/// One action's foreground assist for the bound app `appPid` (the app, not a panel's serving process, is activated).
final class ForegroundAssist {
  let appPid: pid_t
  private let system: ActivationSystem
  /// After `run`: whether the user's key window is the one it was before the activation (by window number), read after
  /// the restore's raise; nil when no restore ran or the user's key window could not be read before the activation.
  private(set) var keyWindowRestored: Bool?

  init(appPid: pid_t, system: ActivationSystem = ActivationSystem()) {
    self.appPid = appPid
    self.system = system
  }

  /// Brings the app to the front, runs `deliver` (the action's events) while it is there, then restores the user's app
  /// and window, unless delivery stopped on intervention. An app already frontmost is neither activated nor restored.
  /// An ordinary failed delivery's error comes first; a restore failure is reported after a delivery that succeeded.
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
    // An attributed input event may have changed focus deliberately. Once the guard stops delivery, reactivation
    // and AXRaise are optional new mutations, not cleanup: yield rather than overwrite that newer focus.
    if case .failure(let error) = delivered, (error as? EngineError)?.errorName == "userIntervened" {
      throw error
    }
    let restored = restore(previous, window: userWindow?.element)
    readKeyWindow(previous, before: userWindow?.id)
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

  /// Whether the user's app's key window after the restore is `before` (the one read before the activation).
  private func readKeyWindow(_ previous: pid_t, before: CGWindowID?) {
    guard let before else { return }
    keyWindowRestored = system.userWindow(previous)?.id == before
  }
}
