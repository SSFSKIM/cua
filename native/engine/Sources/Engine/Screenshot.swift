import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

// Screenshot (the spec's Design, "Screenshot"): a JPEG of the key window through ScreenCaptureKit
// (SCContentFilter(desktopIndependentWindow:), SCScreenshotManager.captureImage), scaled to points, quality 0.8, written
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

extension Engine {
  /// The window's JPEG in `directory`: `{url, width, height}`.
  func capture(window: AXUIElement, pid: pid_t, frame: CGRect?, into directory: String, name: String, revision: Int, timings: inout Timings) throws -> [String: Any] {
    try requireScreenRecording()
    guard let frame, frame.width >= 1, frame.height >= 1 else { throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)") }
    guard let number = timings.time("screenshotWindowNumber", { windowNumber(of: window, pid: pid, frame: frame) }) else {
      throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)")
    }
    var lookup = try shareableWindows.window(number, timings: &timings)
    guard var target = lookup.window else { throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)") }
    let configuration = SCStreamConfiguration()
    configuration.width = Int(frame.width.rounded())
    configuration.height = Int(frame.height.rounded())
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
    let path = (directory as NSString).appendingPathComponent("cua-engine-\(getpid())-\(revision)-\(UUID().uuidString.prefix(8)).jpg")
    try timings.time("screenshotWrite") { try writePrivately(data, to: path) }
    return ["url": URL(fileURLWithPath: path).absoluteString, "width": image.width, "height": image.height]
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
