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
