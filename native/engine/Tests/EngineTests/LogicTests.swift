import ApplicationServices
import XCTest
@testable import Engine

// The engine's pure rules: sibling matching, the re-fetch verdict, the settle loop on a fake clock, the byte estimate,
// web-shaped detection and the one enablement attribute, the hierarchy route's decoding, the value type.

private func element(_ id: Int) -> AXUIElement { AXUIElementCreateApplication(pid_t(61_000 + id)) }
private func old(_ ids: [Int]) -> [(index: Int, element: AXUIElement)] { ids.map { ($0 * 10, element($0)) } }

final class SiblingMatchTests: XCTestCase {
  func testTheCommonPrefixKeepsItsIndexes() {
    XCTAssertEqual(matchSiblings(old: old([1, 2, 3]), new: [1, 2, 3].map(element)), [10, 20, 30])
  }

  func testAnInsertionIsNewAndTheRestKeepTheirIndexes() {
    XCTAssertEqual(matchSiblings(old: old([1, 2, 3]), new: [1, 9, 2, 3].map(element)), [10, nil, 20, 30])
  }

  func testOnlyTheLongestIncreasingRunOfMovedElementsKeepsItsIndexes() {
    XCTAssertEqual(matchSiblings(old: old([1, 2, 3, 4, 5]), new: [5, 1, 2, 3, 4].map(element)), [nil, 10, 20, 30, 40])
  }

  func testADuplicatedHandleMatchesOnce() {
    XCTAssertEqual(matchSiblings(old: old([1, 2]), new: [2, 2].map(element)), [20, nil])
  }

  func testLongestIncreasingRun() {
    XCTAssertEqual(longestIncreasingRun([3, 1, 2, 5, 4, 6]).count, 4)
    XCTAssertEqual(longestIncreasingRun([]), [])
    let values = [2, 9, 3, 7, 4, 5]
    let run = longestIncreasingRun(values).map { values[$0] }
    XCTAssertEqual(run, run.sorted())
    XCTAssertEqual(run.count, 4)
  }
}

final class RefetchVerdictTests: XCTestCase {
  func testTheVendorsOrder() {
    XCTAssertEqual(RefetchVerdict.of(before: 2, after: 1), .ambiguousBefore)
    XCTAssertEqual(RefetchVerdict.of(before: 0, after: 1), .ambiguousBefore)
    XCTAssertEqual(RefetchVerdict.of(before: 1, after: 0), .noLongerValid)
    XCTAssertEqual(RefetchVerdict.of(before: 1, after: 1), .found)
    XCTAssertEqual(RefetchVerdict.of(before: 1, after: 3), .ambiguousAfter)
    XCTAssertTrue(ElementErrors.ambiguousBeforeRefetch.message.contains("couldn't be started"))
    XCTAssertTrue(ElementErrors.ambiguousAfterRefetch.message.contains("couldn't be finished"))
  }
}

/// A fake clock the settle loop sleeps on, with notifications scheduled by time.
private final class FakeClock {
  var now = 0.0
  var pending: [SettleEvent] = []

  func drain() -> [SettleEvent] {
    let due = pending.filter { $0.at <= now }
    pending.removeAll { $0.at <= now }
    return due
  }
}

final class SettleTests: XCTestCase {
  private func run(_ clock: FakeClock, sample: Double = settleSampleMs, ready: @escaping () -> Bool? = { true }) -> SettleReport {
    runSettle(sampleMs: sample, now: { clock.now }, sleep: { clock.now += $0 }, drain: clock.drain, ready: ready)
  }

  func testAQuietNativeAppSettlesAtTheThirdSample() {
    let report = run(FakeClock())
    XCTAssertFalse(report.capped)
    XCTAssertEqual(report.ms, 300)
    XCTAssertEqual(report.busyWalks, 1)
  }

  func testAWebShapedAppSamplesEvery250Ms() {
    XCTAssertEqual(run(FakeClock(), sample: settleWebSampleMs).ms, 250)
  }

  func testANotificationRestartsTheQuietPeriod() {
    let clock = FakeClock()
    clock.pending = [SettleEvent(name: kAXLayoutChangedNotification, at: 150, counts: true)]
    let report = run(clock)
    XCTAssertEqual(report.ms, 400)
    XCTAssertEqual(report.counts, [kAXLayoutChangedNotification: 1])
  }

  func testAnUnchangedTitleIsCountedButDoesNotRestartTheQuietPeriod() {
    let clock = FakeClock()
    clock.pending = [SettleEvent(name: kAXTitleChangedNotification, at: 150, counts: false)]
    let report = run(clock)
    XCTAssertEqual(report.ms, 300)
    XCTAssertEqual(report.ignoredTitleChanges, 1)
  }

  func testContinuousNotificationsAreCappedAtFiveSecondsAndReported() {
    let clock = FakeClock()
    clock.pending = stride(from: 50.0, through: 6_000, by: 100).map { SettleEvent(name: kAXLayoutChangedNotification, at: $0, counts: true) }
    let report = run(clock)
    XCTAssertTrue(report.capped)
    XCTAssertEqual(report.ms, settleCapMs)
    XCTAssertEqual(report.busyWalks, 0)
  }

  func testABusyTreeKeepsTheSettleWaiting() {
    let clock = FakeClock()
    var answers: [Bool?] = [nil, false, false, true]
    let report = run(clock) { answers.removeFirst() }
    XCTAssertFalse(report.capped)
    XCTAssertEqual(report.busyVetoes, 2)
    XCTAssertEqual(report.busyWalks, 4)
    XCTAssertEqual(report.ms, 600)
  }

  func testTheTenNotifications() {
    XCTAssertEqual(settleNotifications.count, 10)
    XCTAssertFalse(settleNotifications.contains(kAXValueChangedNotification))
  }
}

final class ByteEstimateTests: XCTestCase {
  private func actual(_ value: Any) -> Int { try! JSONSerialization.data(withJSONObject: [value], options: [.withoutEscapingSlashes]).count - 2 }

  func testAStringCostsItsEscapedLength() {
    for sample in ["plain", "quote \" back\\slash", "line\nbreak\ttab\r", "ctl \u{01}\u{1f}", "a/b/c", "한글 😀 é"] {
      XCTAssertEqual(jsonStringBytes(sample), actual(sample), sample)
    }
  }

  func testANodeIsNeverUnderestimated() {
    let node: [String: Any] = ["index": 12, "title": "Say \"hi\"\n", "value": NSNull(), "flags": ["enabled": true], "frame": ["x": 1.5, "y": -2.25],
                               "actions": ["AXPress", "AXShowMenu"], "domClassList": ["a", "b"]]
    XCTAssertGreaterThanOrEqual(jsonBytes(node), actual(node))
  }
}

final class EnablementTests: XCTestCase {
  func testWebShapedApps() {
    XCTAssertTrue(webShaped(info: ["NSPrincipalClass": "AtomApplication"]))
    XCTAssertTrue(webShaped(info: ["NSPrincipalClass": "BrowserCrApplication"]))
    XCTAssertTrue(webShaped(info: ["CFBundleURLTypes": [["CFBundleURLSchemes": ["https", "HTTP"]]]]))
    XCTAssertFalse(webShaped(info: ["NSPrincipalClass": "NSApplication", "CFBundleURLTypes": [["CFBundleURLSchemes": ["file", "x-finder"]]]]))
    XCTAssertFalse(webShaped(info: [:]))
  }

  func testOneAttributeNeverBoth() {
    XCTAssertEqual(enablementAttribute(listed: ["AXEnhancedUserInterface", "AXManualAccessibility"]), "AXManualAccessibility")
    XCTAssertEqual(enablementAttribute(listed: ["AXRole", "AXEnhancedUserInterface"]), "AXEnhancedUserInterface")
    XCTAssertNil(enablementAttribute(listed: ["AXRole"]))
  }

  func testTheInstalledFinderAndTextEditAreNotWebShaped() throws {
    for path in ["/System/Library/CoreServices/Finder.app", "/System/Applications/TextEdit.app"] {
      let info = try XCTUnwrap(NSDictionary(contentsOfFile: path + "/Contents/Info.plist") as? [String: Any], path)
      XCTAssertFalse(webShaped(info: info), path)
    }
  }
}

final class FetchDecodeTests: XCTestCase {
  func testTheHierarchyRouteDecodesToTheSameElementDataAsThePublicRoute() throws {
    let spi = try XCTUnwrap(HierarchySPI.shared, "AXUIElementCopyHierarchy and its keys resolve on this macOS")
    var range = CFRange(location: 3, length: 2)
    let children = [element(1), element(2)] as CFArray
    let values: [String: CFTypeRef] = [
      "AXRole": "AXRow" as CFString, "AXTitle": "Row" as CFString, "AXValue": 7 as CFNumber, "AXDisclosing": kCFBooleanTrue,
      "AXRowIndexRange": AXValueCreate(.cfRange, &range)!, "AXDOMClassList": ["x", "y"] as CFArray, "AXChildren": children,
      "AXHelp": "help" as CFString,
    ]
    var entry: [String: Any] = [:]
    for (name, value) in values { entry[name] = [spi.valueKey: value] }
    entry["AXChildren"] = [spi.valueKey: children, spi.countKey: 140]
    var unsupported = AXError.attributeUnsupported
    entry["AXSubrole"] = [spi.errorKey: AXValueCreate(.axError, &unsupported)!]

    let decoded = spi.decode(entry)
    XCTAssertFalse(decoded.incomplete)
    XCTAssertEqual(decoded.childCount, 140)
    let viaHierarchy = ElementData(values: decoded.values, childCount: decoded.childCount)
    let viaPublic = ElementData(values: values, childCount: 140)
    let a = nodeWire(index: 0, depth: 0, pid: 1, data: viaHierarchy, actions: [], flags: (false, false, false), valueMarkdown: nil, children: 0, shown: nil)
    let b = nodeWire(index: 0, depth: 0, pid: 1, data: viaPublic, actions: [], flags: (false, false, false), valueMarkdown: nil, children: 0, shown: nil)
    XCTAssertEqual(NSDictionary(dictionary: a), NSDictionary(dictionary: b))
    XCTAssertEqual(a["rowIndexRange"] as? [Int], [3, 5])
    XCTAssertEqual(a["domClassList"] as? [String], ["x", "y"])
    XCTAssertEqual(a["valueType"] as? String, "number")
    XCTAssertEqual((a["flags"] as? [String: Any])?["expanded"] as? Bool, true)
    XCTAssertEqual((a["flags"] as? [String: Any])?["disclosable"] as? Bool, true)
    XCTAssertNil(a["placeholder"], "an attribute the element does not carry is absent")
    XCTAssertTrue(a["subrole"] is NSNull)
  }

  func testAnIncompleteMarkIsSeen() throws {
    let spi = try XCTUnwrap(HierarchySPI.shared)
    XCTAssertTrue(spi.decode([spi.incompleteKey: true]).incomplete)
    XCTAssertTrue(spi.decode(["AXChildren": [spi.valueKey: [] as CFArray, spi.incompleteKey: true]]).incomplete)
  }

  func testValueTypes() {
    XCTAssertEqual(valueType("a") as? String, "string")
    XCTAssertEqual(valueType(true) as? String, "boolean")
    XCTAssertEqual(valueType(Int64(3)) as? String, "number")
    XCTAssertEqual(valueType(2.5) as? String, "number")
    XCTAssertTrue(valueType(nil) is NSNull)
  }
}
