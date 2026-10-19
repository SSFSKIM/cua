import AppKit
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
    let pending = PendingCapture { timings in
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
    let pending = PendingCapture { _ in throw EngineError(name: "screenCaptureFailed", "no window") }
    XCTAssertThrowsError(try pending.wait().result.get())
  }
}

// Tuning iteration 2 (the mini sitting): the screenshot at the display's pixel size, and coordinate clicks mapped back.

final class PixelScaleTests: XCTestCase {
  func testTheCaptureIsTheFrameTimesTheScale() {
    let frame = CGRect(x: 308, y: 102, width: 610, height: 860)
    XCTAssertTrue(screenshotPixelSize(frame, scale: 2) == (1220, 1720), "the vendor's TextEdit size on the mini")
    XCTAssertTrue(screenshotPixelSize(frame, scale: 1) == (610, 860))
  }

  func testAScreenshotPointMapsBackToWindowPoints() {
    XCTAssertEqual(windowPoint(fromScreenshot: 1220, 860, scale: 2), CGPoint(x: 610, y: 430))
    XCTAssertEqual(windowPoint(fromScreenshot: 15, 7, scale: 1), CGPoint(x: 15, y: 7))
  }

  func testTheScaleOfTheDisplayUnderAFrameIsAtLeastOne() {
    let main = CGDisplayBounds(CGMainDisplayID())
    XCTAssertGreaterThanOrEqual(pixelScale(of: CGRect(x: main.midX, y: main.midY, width: 10, height: 10)), 1)
    XCTAssertEqual(pixelScale(of: CGRect(x: -1e7, y: -1e7, width: 10, height: 10)), 1, "no display: points")
  }
}
