import AppKit
import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

// Screenshot (the spec's Design, "Screenshot"): a JPEG of the key window through ScreenCaptureKit
// (SCContentFilter(desktopIndependentWindow:), SCScreenshotManager.captureImage), at the vendor's size (U1; R/F-helper-
// logic.md §15): the window's bounds times the backing scale factor of the screen that best matches them, 2.0 when none
// does, each side rounded up; quality 0.8, written with mode 0600 into the request's outputDirectory (the engine creates
// it, never through a symbolic link: writePrivately) and returned as a file: URL. CGWindowListCreateImage is deprecated and not a fallback. Nothing here runs before a request asks for a
// capture.

let jpegQuality = 0.8
private let captureTimeoutSeconds = 10

func screenCaptureFailed(_ detail: String) -> EngineError { EngineError(name: "screenCaptureFailed", "The screen capture failed. \(detail)") }

func shareableContent() throws -> SCShareableContent {
  let box = Box<Result<SCShareableContent, Error>>()
  let done = DispatchSemaphore(value: 0)
  SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, error in
    box.value = content.map { .success($0) } ?? .failure(error ?? screenCaptureFailed("No shareable content."))
    done.signal()
  }
  guard done.wait(timeout: .now() + .seconds(captureTimeoutSeconds)) == .success, let outcome = box.value else {
    throw screenCaptureFailed("Listing the shareable content timed out.")
  }
  switch outcome {
  case .success(let content): return content
  case .failure(let error): throw screenCaptureFailed(error.localizedDescription)
  }
}

/// The shareable content, listed once and kept: listing it cost 60 of a 134 ms capture on the MacBook (the spec's
/// Surprises). It is listed again when the on-screen window list changed since, when the window is not in it, or when a
/// cached window fails to capture. A change of order alone (another window brought forward) is not a change of list.
final class ShareableWindowCache: @unchecked Sendable {
  private let lock = NSLock()
  private var content: SCShareableContent?
  private var windowIDs: Set<CGWindowID> = []

  func window(_ id: CGWindowID, timings: inout Timings, refresh: Bool = false) throws -> (window: SCWindow?, cached: Bool) {
    lock.lock()
    defer { lock.unlock() }
    let onScreen = timings.time("screenshotWindowList") { onScreenWindowIDs().map(Set.init) }
    if !refresh, let content, onScreen == nil || onScreen == windowIDs, let window = content.windows.first(where: { $0.windowID == id }) {
      timings.set("screenshotContentCached", true)
      return (window, true)
    }
    let fresh = try timings.time("screenshotContent") { try shareableContent() }
    content = fresh
    windowIDs = onScreen ?? []
    timings.set("screenshotContentCached", false)
    return (fresh.windows.first(where: { $0.windowID == id }), false)
  }
}

let shareableWindows = ShareableWindowCache()

/// The on-screen window numbers, front to back, from `CGWindowListCreate` (public, but unavailable to Swift by name,
/// so resolved with dlsym; about half a millisecond warm). Nil when it cannot be resolved.
private typealias WindowListCreate = @convention(c) (CGWindowListOption, CGWindowID) -> Unmanaged<CFArray>?
private let windowListCreate: WindowListCreate? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreate").map { unsafeBitCast($0, to: WindowListCreate.self) }

func onScreenWindowIDs() -> [CGWindowID]? {
  guard let windowListCreate, let list = windowListCreate(.optionOnScreenOnly, kCGNullWindowID)?.takeRetainedValue() else { return nil }
  // The array holds the window numbers themselves in its value slots, not CFNumbers.
  return (0..<CFArrayGetCount(list)).map { CGWindowID(UInt(bitPattern: CFArrayGetValueAtIndex(list, $0))) }
}

func captureImage(_ filter: SCContentFilter, _ configuration: SCStreamConfiguration) throws -> CGImage {
  let box = Box<Result<CGImage, Error>>()
  let done = DispatchSemaphore(value: 0)
  SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration) { image, error in
    box.value = image.map { .success($0) } ?? .failure(error ?? screenCaptureFailed("No image."))
    done.signal()
  }
  guard done.wait(timeout: .now() + .seconds(captureTimeoutSeconds)) == .success, let outcome = box.value else {
    throw screenCaptureFailed("The capture timed out.")
  }
  switch outcome {
  case .success(let image): return image
  case .failure(let error): throw screenCaptureFailed(error.localizedDescription)
  }
}

func jpegData(_ image: CGImage) -> Data? {
  let data = NSMutableData()
  guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
  CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: jpegQuality] as CFDictionary)
  return CGImageDestinationFinalize(destination) ? data as Data : nil
}

/// A screen as the size rule reads it: its frame in CoreGraphics' global space (top-left origin, as AX reports window
/// frames) and its backing scale factor.
struct ScreenScale: Equatable {
  let frame: CGRect
  let backingScale: CGFloat
}

/// The vendor's scale for a window frame (F §15, `CGWindow.scale`): the backing scale factor of the best-matching
/// screen, 2.0 when none matches. Best matching is read as the largest intersection with the frame (F §15 marks the
/// reducer unread and infers this), the first screen winning a tie. Read when capturing only: a coordinate click divides
/// by the scale of the image the model was given (`ObservedScreenshot`), whatever the screens say by then.
func screenshotScale(for frame: CGRect, screens: [ScreenScale]) -> CGFloat {
  var best: (area: CGFloat, scale: CGFloat)?
  for screen in screens {
    let overlap = screen.frame.intersection(frame)
    guard !overlap.isNull, overlap.width > 0, overlap.height > 0 else { continue }
    let area = overlap.width * overlap.height
    if best == nil || area > best!.area { best = (area, screen.backingScale) }
  }
  return best?.scale ?? 2.0
}

/// Cocoa screen frames (bottom-left origin at the primary screen, the first) as CoreGraphics' top-left global frames.
func topLeftFrames(cocoa frames: [CGRect]) -> [CGRect] {
  guard let primary = frames.first else { return [] }
  return frames.map { CGRect(x: $0.minX, y: primary.maxY - $0.maxY, width: $0.width, height: $0.height) }
}

/// This Mac's screens now. AppKit keeps NSScreen on the main thread, so this is called there only.
func readScreenScales() -> [ScreenScale] {
  MainActor.assumeIsolated {
    let screens = NSScreen.screens
    return zip(topLeftFrames(cocoa: screens.map(\.frame)), screens).map { ScreenScale(frame: $0, backingScale: $1.backingScaleFactor) }
  }
}

/// The screens as last read on the main thread: read at the engine's start and again on every
/// `NSApplication.didChangeScreenParametersNotification` (a display added, removed, rearranged or rescaled), and read by
/// a capture under a lock, so a capture never waits on the main thread.
final class ScreenScaleCache: @unchecked Sendable {
  private let lock = NSLock()
  private var screens: [ScreenScale] = []
  private let read: () -> [ScreenScale]
  private var observer: NSObjectProtocol?

  init(read: @escaping () -> [ScreenScale] = readScreenScales) { self.read = read }

  /// Reads the screens now and on every change of the screen parameters; called on the main thread, where AppKit posts
  /// the notification.
  func start() {
    refresh()
    observer = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: nil) {
      [weak self] _ in self?.refresh()
    }
  }

  private func refresh() {
    let fresh = read()
    lock.lock()
    screens = fresh
    lock.unlock()
  }

  var current: [ScreenScale] {
    lock.lock()
    defer { lock.unlock() }
    return screens
  }

  deinit { observer.map(NotificationCenter.default.removeObserver) }
}

let screenScales = ScreenScaleCache()

/// The capture's size in pixels for a window frame in points: each side times the scale, rounded up (the vendor's
/// `frintp`, F §15).
func screenshotPixelSize(_ frame: CGRect, scale: CGFloat) -> (width: Int, height: Int) {
  (Int((frame.width * scale).rounded(.up)), Int((frame.height * scale).rounded(.up)))
}

/// The screenshot's file name: the engine's pid, the revision its observation reports, and a random part.
func screenshotFileName(revision: Int) -> String { "cua-engine-\(getpid())-\(revision)-\(UUID().uuidString.prefix(8)).jpg" }

/// A screenshot as the capture returned it, with the window frame (in points) it was sized for and the screen's scale
/// it was sized by.
struct CapturedScreenshot {
  let url: String
  let width: Int
  let height: Int
  let frame: CGRect
  let scale: CGFloat

  var wire: [String: Any] { ["url": url, "width": width, "height": height, "scale": Double(scale)] }
}

/// The screenshot coordinate clicks are placed in: the window it shows and its pixels per point on each axis, the
/// returned image's size over the window's frame at the observation. A coordinate click arrives in that image's pixels
/// and is divided by this scale, never by the scale of the display under the window when the click comes: after a
/// display is unplugged or sleeps, or the window moves to another display, that scale can differ and the click would
/// land at twice or half the offset. The vendor keeps its observation's scaling factor the same way
/// (R/F-helper-logic.md §5.2).
struct ObservedScreenshot {
  let window: AXUIElement
  let scaleX: CGFloat
  let scaleY: CGFloat

  init(window: AXUIElement, image: CapturedScreenshot) {
    self.window = window
    scaleX = CGFloat(image.width) / image.frame.width  // the capture refuses a frame under one point
    scaleY = CGFloat(image.height) / image.frame.height
  }

  /// A point in the image's pixels as the window-local point in points.
  func windowPoint(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: CGFloat(x) / scaleX, y: CGFloat(y) / scaleY) }
}

let noScreenshotForCoordinates = EngineError(name: "noScreenshotForCoordinates",
  "There is no screenshot of the app's current window to place the coordinates in. Call getScreenshot to get one, then give coordinates in its pixels.")

extension ConnectionState {
  /// A coordinate click's point in `window`, from its top-left corner in points: (x, y) in the pixels of the
  /// screenshot the app's last observation on this connection returned, divided by that screenshot's scale. Refused,
  /// before anything is posted, when there is no screenshot of `window` to place them in: no observation of the app
  /// returned one yet, the request names a lineage that is not the app's current one (as for an element index), or the
  /// app's primary window is no longer the window the screenshot shows.
  func screenshotPoint(_ x: Double, _ y: Double, app: ResolvedApp, window: AXUIElement, lineage wanted: String?) throws -> CGPoint {
    guard let lineage = lineages[app.key], wanted == nil || wanted == lineage.id,
          let screenshot = lineage.screenshot, CFEqual(screenshot.window, window) else { throw noScreenshotForCoordinates }
    return screenshot.windowPoint(x, y)
  }
}

extension Engine {
  /// The window's JPEG in `directory`, its file named with `revision`, the revision its observation reports.
  func capture(window: AXUIElement, pid: pid_t, frame: CGRect?, into directory: String, name: String, revision: Int, timings: inout Timings) throws -> CapturedScreenshot {
    try requireScreenRecording()
    guard let frame, frame.width >= 1, frame.height >= 1 else { throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)") }
    guard let number = timings.time("screenshotWindowNumber", { windowNumber(of: window, pid: pid, frame: frame) }) else {
      throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)")
    }
    var lookup = try shareableWindows.window(number, timings: &timings)
    guard var target = lookup.window else { throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)") }
    let configuration = SCStreamConfiguration()
    let scale = screenshotScale(for: frame, screens: screenScales.current)
    let size = screenshotPixelSize(frame, scale: scale)
    configuration.width = size.width
    configuration.height = size.height
    configuration.showsCursor = false
    configuration.ignoreShadowsSingleWindow = true
    let image: CGImage
    do {
      image = try timings.time("screenshotCapture") { try captureImage(SCContentFilter(desktopIndependentWindow: target), configuration) }
    } catch where lookup.cached {
      // A cached window that no longer captures: list the shareable content again and retry once.
      lookup = try shareableWindows.window(number, timings: &timings, refresh: true)
      guard let fresh = lookup.window else { throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)") }
      target = fresh
      image = try timings.time("screenshotCapture") { try captureImage(SCContentFilter(desktopIndependentWindow: target), configuration) }
    }
    guard let data = timings.time("screenshotEncode", { jpegData(image) }) else { throw screenCaptureFailed("The image could not be encoded.") }
    let path = try timings.time("screenshotWrite") { try writePrivately(data, into: directory, name: screenshotFileName(revision: revision)) }
    return CapturedScreenshot(url: URL(fileURLWithPath: path).absoluteString, width: image.width, height: image.height, frame: frame, scale: scale)
  }
}

/// Writes `data` to a new file `name` created with mode 0600 in `directory` (never replacing one) -> the file's path.
/// The directory is the session's (the service names it under the session's run directory): created here with mode 0700
/// when missing, since the sandboxed worker writes nothing in the default mode, and never followed when it is a symbolic
/// link, since under the scoped sandbox the kernel may write in the run directory and a link put in the directory's
/// place would steer this write out of the session. Its parent is the launcher's, which no cell can replace.
func writePrivately(_ data: Data, into directory: String, name: String) throws -> String {
  let failure = { (what: String) in screenCaptureFailed("\(what): \(String(cString: strerror(errno))).") }
  if mkdir(directory, 0o700) != 0 && errno != EEXIST { throw failure("The screenshot directory \(directory) could not be created") }
  let dir = open(directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
  guard dir >= 0 else { throw failure("The screenshot directory \(directory) could not be opened (a symbolic link is refused)") }
  defer { close(dir) }
  let fd = openat(dir, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
  guard fd >= 0 else { throw failure("The image file could not be created") }
  defer { close(fd) }
  var done = 0
  while done < data.count {
    let n = data.withUnsafeBytes { write(fd, $0.baseAddress! + done, data.count - done) }
    if n > 0 { done += n; continue }
    if n < 0 && errno == EINTR { continue }
    throw screenCaptureFailed("The image file could not be written: \(String(cString: strerror(errno))).")
  }
  return (directory as NSString).appendingPathComponent(name)
}
