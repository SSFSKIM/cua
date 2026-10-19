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
    let content = try timings.time("screenshotContent") { try shareableContent() }
    guard let target = content.windows.first(where: { $0.windowID == number }) else {
      throw EngineError(name: "noCapturableWindow", "No capturable window found: \(name)")
    }
    let configuration = SCStreamConfiguration()
    configuration.width = Int(frame.width.rounded())
    configuration.height = Int(frame.height.rounded())
    configuration.showsCursor = false
    configuration.ignoreShadowsSingleWindow = true
    let image = try timings.time("screenshotCapture") { try captureImage(SCContentFilter(desktopIndependentWindow: target), configuration) }
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
