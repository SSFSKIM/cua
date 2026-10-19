import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

// Screenshot (the spec's Design, "Screenshot"): a JPEG of the key window through ScreenCaptureKit
// (SCContentFilter(desktopIndependentWindow:), SCScreenshotManager.captureImage), at the display's pixel size (the vendor's size on the mini), quality 0.8, written
// with mode 0600 into the request's outputDirectory and returned as a file: URL. CGWindowListCreateImage is deprecated
// and not a fallback. Nothing here runs before a request asks for a capture.

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

/// Pixels per point of the display under a window frame (global top-left coordinates, as AX reports them): the
/// screenshot is captured at the display's pixel size, as the vendor's was on the mini's 2x scenes. 1 when no display
/// is under the frame. Read when capturing only: a coordinate click divides by the scale of the image the model was
/// given (`ObservedScreenshot`), whatever the display's scale is by then.
func pixelScale(of frame: CGRect) -> CGFloat {
  var display: CGDirectDisplayID = 0
  var count: UInt32 = 0
  guard CGGetDisplaysWithPoint(CGPoint(x: frame.midX, y: frame.midY), 1, &display, &count) == .success, count > 0,
        let mode = CGDisplayCopyDisplayMode(display), mode.width > 0, mode.pixelWidth > 0 else { return 1 }
  return CGFloat(mode.pixelWidth) / CGFloat(mode.width)
}

/// The capture's size in pixels for a window frame in points.
func screenshotPixelSize(_ frame: CGRect, scale: CGFloat) -> (width: Int, height: Int) {
  (Int((frame.width * scale).rounded()), Int((frame.height * scale).rounded()))
}

/// The screenshot's file name: the engine's pid, the revision its observation reports, and a random part.
func screenshotFileName(revision: Int) -> String { "cua-engine-\(getpid())-\(revision)-\(UUID().uuidString.prefix(8)).jpg" }

/// A screenshot as the capture returned it, with the window frame (in points) it was sized for.
struct CapturedScreenshot {
  let url: String
  let width: Int
  let height: Int
  let frame: CGRect

  var wire: [String: Any] { ["url": url, "width": width, "height": height] }
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
  "There is no screenshot of the app's window to place the coordinates in. Try to get the on-screen content again and see if that resolves the issue.")

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
    let size = screenshotPixelSize(frame, scale: pixelScale(of: frame))
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
    let path = (directory as NSString).appendingPathComponent(screenshotFileName(revision: revision))
    try timings.time("screenshotWrite") { try writePrivately(data, to: path) }
    return CapturedScreenshot(url: URL(fileURLWithPath: path).absoluteString, width: image.width, height: image.height, frame: frame)
  }
}

/// Writes `data` to a new file created with mode 0600 (never replacing one).
func writePrivately(_ data: Data, to path: String) throws {
  let fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0o600)
  guard fd >= 0 else { throw screenCaptureFailed("The image file could not be created: \(String(cString: strerror(errno))).") }
  defer { close(fd) }
  var done = 0
  while done < data.count {
    let n = data.withUnsafeBytes { write(fd, $0.baseAddress! + done, data.count - done) }
    if n > 0 { done += n; continue }
    if n < 0 && errno == EINTR { continue }
    throw screenCaptureFailed("The image file could not be written: \(String(cString: strerror(errno))).")
  }
}
