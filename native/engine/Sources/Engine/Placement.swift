import ApplicationServices
import CoreGraphics
import Foundation

// The primary window off screen (#367; the Decision Log's #367 entry). A window whose frame lies outside every display,
// or that the window server does not show on the current Space, gives an observation that can look empty (a Chromium
// window it does not show paints nothing and exposes no page) and a screenshot that no coordinate could act on, with
// nothing saying why. The observation names the placement in the Skyshot's `window.placement` ("offScreen",
// "anotherSpace"), which the service prints as one line, and takes no screenshot, as for a minimized window, the reason
// in `screenshotOmitted` ("windowOffScreen", "windowOnAnotherSpace") and the facade's screenshot error naming the remedy.
// Nothing else changes: an on-screen window's Skyshot gains no key, and no input is refused for it.
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
