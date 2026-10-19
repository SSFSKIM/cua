import AppKit
import ApplicationServices
import XCTest
@testable import Engine

// The tuning round's rules: the web-area wait once per process, and the app-resolution cache's invalidation.

final class WebAreaOncePerProcessTests: XCTestCase {
  func testTheWaitRunsAfterEnablingOrOnChromiumUntilAWebAreaWasSeenInTheProcess() {
    XCTAssertTrue(webAreaWaitNeeded(switchOn: true, enabledNow: true, chromium: false, seen: false))
    XCTAssertTrue(webAreaWaitNeeded(switchOn: true, enabledNow: false, chromium: true, seen: false))
    XCTAssertFalse(webAreaWaitNeeded(switchOn: true, enabledNow: false, chromium: true, seen: true), "seen in this process: skipped")
    XCTAssertFalse(webAreaWaitNeeded(switchOn: true, enabledNow: false, chromium: false, seen: false))
    XCTAssertFalse(webAreaWaitNeeded(switchOn: false, enabledNow: true, chromium: true, seen: false))
  }

  func testAWebAreaSeenIsRememberedPerProcessLaunchNotPerPid() {
    let web = WebAccessibility()
    let launched = Date(timeIntervalSince1970: 1_000)
    XCTAssertFalse(web.hasSeenWebArea(pid: 4242, launched: launched))
    web.noteWebArea(pid: 4242, launched: launched)
    XCTAssertTrue(web.hasSeenWebArea(pid: 4242, launched: launched))
    XCTAssertFalse(web.hasSeenWebArea(pid: 4242, launched: Date(timeIntervalSince1970: 2_000)), "a relaunch reusing the pid starts over")
    XCTAssertFalse(web.hasSeenWebArea(pid: 4243, launched: launched))
  }
}

final class ResolutionCacheTests: XCTestCase {
  private let app = ResolvedApp(appPath: "/Applications/Fake.app", bundleIdentifier: "com.example.fake", displayName: "Fake", running: nil)

  func testAHitIsServedUntilTheWorkspaceChanges() {
    let cache = ResolutionCache()
    XCTAssertNil(cache.lookup("com.example.fake"))
    cache.store("com.example.fake", app)
    XCTAssertEqual(cache.lookup("com.example.fake")?.appPath, "/Applications/Fake.app")
    XCTAssertNil(cache.lookup("Fake"), "keyed by the request's own string")
    cache.invalidate()  // an app launched or terminated somewhere
    XCTAssertNil(cache.lookup("com.example.fake"))
  }

  func testAnEntryWhoseProcessEndedIsNotServed() {
    let cache = ResolutionCache()
    cache.store("self", ResolvedApp(appPath: "/x.app", bundleIdentifier: nil, displayName: "x", running: NSRunningApplication.current))
    XCTAssertNotNil(cache.lookup("self"), "a live process is served")
    XCTAssertNotNil(cache.lookup("self", isAlive: { _ in true }))
    XCTAssertNil(cache.lookup("self", isAlive: { _ in false }), "a terminated process misses even before the notification lands")
  }
}

// Tuning iteration 1 (the mini sitting): the window capture runs beside the tree walk and is joined after it.

final class ConcurrentCaptureTests: XCTestCase {
  func testTheCaptureRunsOffTheCallingThreadAndOverlapsTheWalk() {
    let started = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
    let pending = PendingCapture<[String: Any]> { timings in
      XCTAssertFalse(Thread.isMainThread)
      started.signal()
      release.wait()
      timings.add("capture", 40)
      timings.set("screenshotBytes", 1234)
      return ["path": "/tmp/x.jpg"]
    }
    XCTAssertEqual(started.wait(timeout: .now() + 2), .success, "the capture began before the walk finished")
    release.signal()
    let joined = pending.wait()
    XCTAssertEqual(try joined.result.get()["path"] as? String, "/tmp/x.jpg")
    var timings = Timings()
    timings.add("walk", 50)
    timings.add("capture", 1)
    timings.merge(joined.timings)
    XCTAssertEqual(timings.wire["captureMs"] as? Double, 41)
    XCTAssertEqual(timings.wire["walkMs"] as? Double, 50)
    XCTAssertEqual(timings.wire["screenshotBytes"] as? Int, 1234)
  }

  func testACaptureFailureReachesTheJoin() {
    let pending = PendingCapture<[String: Any]> { _ in throw EngineError(name: "screenCaptureFailed", "no window") }
    XCTAssertThrowsError(try pending.wait().result.get())
  }
}

// The screenshot's size (U1, the spec's Decision Log; R/F-helper-logic.md §15): the window's bounds times the backing
// scale factor of the best-matching screen, 2.0 when none matches, each side rounded up; and coordinate clicks mapped
// back by the size the image really has.

final class ScreenshotSizeTests: XCTestCase {
  /// Two screens side by side in CoreGraphics' global space (top-left origin): a 2x one at the origin, a 1x one right of it.
  private let screens = [ScreenScale(frame: CGRect(x: 0, y: 0, width: 1512, height: 982), backingScale: 2),
                         ScreenScale(frame: CGRect(x: 1512, y: 0, width: 1920, height: 1080), backingScale: 1)]

  func testTheCaptureIsTheFrameTimesTheScaleEachSideRoundedUp() {
    let frame = CGRect(x: 308, y: 102, width: 610, height: 860)
    XCTAssertTrue(screenshotPixelSize(frame, scale: 2) == (1220, 1720), "the vendor's TextEdit size on the mini")
    XCTAssertTrue(screenshotPixelSize(CGRect(x: 0, y: 0, width: 586, height: 488), scale: 2) == (1172, 976), "the 2026-10-14 baseline's")
    XCTAssertTrue(screenshotPixelSize(CGRect(x: 0, y: 0, width: 300.3, height: 200.1), scale: 2) == (601, 401), "600.6 and 400.2, both up")
    XCTAssertTrue(screenshotPixelSize(CGRect(x: 0, y: 0, width: 300.2, height: 100.25), scale: 1.5) == (451, 151), "450.3 and 150.375, both up")
  }

  func testTheScaleIsTheBestMatchingScreensBackingScale() {
    XCTAssertEqual(screenshotScale(for: CGRect(x: 100, y: 100, width: 600, height: 400), screens: screens), 2)
    XCTAssertEqual(screenshotScale(for: CGRect(x: 1600, y: 100, width: 600, height: 400), screens: screens), 1)
    // Spanning both: the screen holding the larger part of the window.
    XCTAssertEqual(screenshotScale(for: CGRect(x: 1400, y: 100, width: 600, height: 400), screens: screens), 1, "112 on the 2x, 488 on the 1x")
    XCTAssertEqual(screenshotScale(for: CGRect(x: 1100, y: 100, width: 600, height: 400), screens: screens), 2, "412 on the 2x, 188 on the 1x")
  }

  func testNoMatchingScreenIsTwo() {
    XCTAssertEqual(screenshotScale(for: CGRect(x: -5_000, y: -5_000, width: 600, height: 400), screens: screens), 2, "off every screen")
    XCTAssertEqual(screenshotScale(for: CGRect(x: 100, y: 100, width: 600, height: 400), screens: []), 2, "no screens at all")
  }

  func testCocoaScreenFramesAreFlippedIntoTheWindowsTopLeftSpace() {
    // The primary screen (Cocoa origin at its bottom-left) and a screen stacked above it, whose Cocoa y is the primary's
    // height: in CoreGraphics' space it sits at negative y.
    let flipped = topLeftFrames(cocoa: [CGRect(x: 0, y: 0, width: 1512, height: 982), CGRect(x: 0, y: 982, width: 1920, height: 1080)])
    XCTAssertEqual(flipped, [CGRect(x: 0, y: 0, width: 1512, height: 982), CGRect(x: 0, y: -1080, width: 1920, height: 1080)])
    XCTAssertEqual(topLeftFrames(cocoa: []), [])
  }

  func testTheSkyshotsScreenshotCarriesItsSizeAndScale() {
    let image = CapturedScreenshot(url: "file:///x.jpg", width: 1220, height: 1720, frame: CGRect(x: 0, y: 0, width: 610, height: 860), scale: 2)
    XCTAssertEqual(NSDictionary(dictionary: image.wire), ["url": "file:///x.jpg", "width": 1220, "height": 1720, "scale": 2.0] as NSDictionary)
  }

  func testThisMacsScreensAnswerAPositiveScale() {
    let main = CGDisplayBounds(CGMainDisplayID())
    XCTAssertGreaterThanOrEqual(screenshotScale(for: CGRect(x: main.midX, y: main.midY, width: 10, height: 10), screens: currentScreenScales()), 1)
  }
}

// The sitting's review: a coordinate click divides by the scale of the screenshot the model was given, and the
// screenshot's file carries the revision its observation reports.

final class ObservedScreenshotTests: XCTestCase {
  private let app = ResolvedApp(appPath: "/Applications/Fake.app", bundleIdentifier: "com.example.fake", displayName: "Fake", running: nil)
  private let window = AXUIElementCreateApplication(61_001)  // fake handles: nothing is sent to any process
  private let otherWindow = AXUIElementCreateApplication(61_002)

  /// A connection whose observation of the app returned `image` of `window`, or none.
  private func connection(_ image: CapturedScreenshot?) -> (ConnectionState, Lineage) {
    let connection = ConnectionState(id: 1, fd: -1)
    let lineage = Lineage()
    lineage.commit(Revision())
    if let image { lineage.screenshot = ObservedScreenshot(window: window, image: image) }
    connection.lineages[app.key] = lineage
    return (connection, lineage)
  }

  func testACoordinateClickDividesByTheObservedImagesScaleNotTheDisplaysNow() throws {
    // The window sits on the main display, whose scale now differs from the one the observed image was taken at (the
    // window moved, or a display changed, between the observation and the click).
    let main = CGDisplayBounds(CGMainDisplayID())
    let frame = CGRect(x: main.minX + 10, y: main.minY + 10, width: 610, height: 430)
    let now = screenshotScale(for: frame, screens: currentScreenScales())
    let observed: CGFloat = now == 2 ? 1 : 2
    let size = screenshotPixelSize(frame, scale: observed)
    let (connection, _) = connection(CapturedScreenshot(url: "file:///x.jpg", width: size.width, height: size.height, frame: frame, scale: observed))
    XCTAssertEqual(try connection.screenshotPoint(Double(305 * observed), Double(430 * observed), app: app, window: window, lineage: nil),
                   CGPoint(x: 305, y: 430))
  }

  func testEachAxisDividesByItsOwnScale() throws {
    // A frame whose pixel size rounded up on one axis: each axis maps back by the image's own size over the frame's, so
    // the image's far corner is the window's.
    let frame = CGRect(x: 0, y: 0, width: 300.3, height: 200)
    let size = screenshotPixelSize(frame, scale: 2)  // 601 × 400: x's scale is 601 / 300.3, y's exactly 2
    let (connection, _) = connection(CapturedScreenshot(url: "file:///x.jpg", width: size.width, height: size.height, frame: frame, scale: 2))
    let corner = try connection.screenshotPoint(Double(size.width), Double(size.height), app: app, window: window, lineage: nil)
    XCTAssertEqual(corner.x, 300.3, accuracy: 1e-9)
    XCTAssertEqual(corner.y, 200, accuracy: 1e-9)
  }

  func testWithoutAScreenshotOfTheWindowTheClickIsRefused() throws {
    let image = CapturedScreenshot(url: "file:///x.jpg", width: 1220, height: 860, frame: CGRect(x: 0, y: 0, width: 610, height: 430), scale: 2)
    let refused: [(String, ConnectionState, AXUIElement, String?)] = [
      ("no observation of the app on this connection", ConnectionState(id: 1, fd: -1), window, nil),
      ("observations, none with a screenshot", connection(nil).0, window, nil),
      ("the app's primary window is another window now", connection(image).0, otherWindow, nil),
      ("the request names another lineage", connection(image).0, window, "Lother"),
    ]
    for (reason, connection, window, lineage) in refused {
      XCTAssertThrowsError(try connection.screenshotPoint(10, 10, app: app, window: window, lineage: lineage), reason) { error in
        XCTAssertEqual((error as? EngineError)?.errorName, "noScreenshotForCoordinates", reason)
        XCTAssertTrue((error as? EngineError)?.message.contains("getScreenshot") == true, reason)
      }
    }
    let (named, lineage) = connection(image)
    XCTAssertEqual(try named.screenshotPoint(20, 10, app: app, window: window, lineage: lineage.id), CGPoint(x: 10, y: 5), "the current lineage, named")
  }

  func testTheScreenshotIsNamedWithTheRevisionItsObservationReports() {
    let lineage = Lineage()
    lineage.commit(Revision())  // an earlier observation
    // As get_app_state orders it: the capture is named when it starts, before the walk commits the observation.
    let name = screenshotFileName(revision: lineage.nextRevision)
    lineage.commit(Revision())
    XCTAssertTrue(name.hasPrefix("cua-engine-\(getpid())-\(lineage.revision)-"), name)
    XCTAssertEqual(lineage.revision, 2)
  }
}
