import XCTest
@testable import Engine

// The engine's own settings in ~/.config/cua/engine.json (the spec's Decision Log, M1a pre-flight item 4): `peerPolicy`,
// whose only value in #117 is "uid", and `routes`, the owner's per-app route-4 override (Design "Input", route 4).

final class EngineSettingsTests: XCTestCase {
  private func parse(_ text: String?) throws -> EngineSettings { try EngineSettings.parse(text.map { Data($0.utf8) }, path: "/h/.config/cua/engine.json") }

  func testAbsentFileOrSettingIsTheUidPolicy() throws {
    XCTAssertEqual(try parse(nil).peerPolicy, .uid)
    XCTAssertEqual(try parse("{}").peerPolicy, .uid)
    XCTAssertEqual(try parse(#"{"engine": "cua", "signingIdentity": "ABC", "routes": {"com.example.app": 4}}"#).peerPolicy, .uid,
                   "the settings other readers own are left alone")
    XCTAssertEqual(try parse(#"{"peerPolicy": "uid"}"#).peerPolicy, .uid)
  }

  func testAnyOtherPeerPolicyStopsTheEngineNamingTheSetting() {
    for text in [#"{"peerPolicy": "ancestor"}"#, #"{"peerPolicy": "UID"}"#, #"{"peerPolicy": ""}"#, #"{"peerPolicy": null}"#,
                 #"{"peerPolicy": 1}"#] {
      XCTAssertThrowsError(try parse(text), text) { error in
        let message = (error as? EngineSettings.Invalid)?.message ?? ""
        XCTAssertTrue(message.contains("peerPolicy") && message.contains("/h/.config/cua/engine.json") && message.contains("\"uid\""), message)
      }
    }
  }

  func testAFileThatIsNotAJSONObjectStopsTheEngine() {
    for text in ["", "not json", "[]", "\"uid\""] {
      XCTAssertThrowsError(try parse(text), text) { error in
        XCTAssertTrue(((error as? EngineSettings.Invalid)?.message ?? "").contains("/h/.config/cua/engine.json"), text)
      }
    }
  }

  func testRoutesAreTheOwnersPerAppRouteFourOverride() throws {
    XCTAssertEqual(try parse(nil).routes, [:], "default none")
    XCTAssertEqual(try parse("{}").routes, [:])
    XCTAssertEqual(try parse(#"{"routes": {}}"#).routes, [:])
    XCTAssertEqual(try parse(#"{"routes": {"com.example.canvas": 4, "com.example.paint": 4}}"#).routes,
                   ["com.example.canvas": 4, "com.example.paint": 4])
  }

  /// A route the engine does not have, or a malformed table, stops the engine naming the setting, as peerPolicy does:
  /// an override the owner wrote is never silently dropped.
  func testAnyOtherRoutesValueStopsTheEngineNamingTheSetting() {
    for text in [#"{"routes": {"com.example.app": 3}}"#, #"{"routes": {"com.example.app": "4"}}"#, #"{"routes": {"com.example.app": true}}"#,
                 #"{"routes": {"com.example.app": 4.5}}"#, #"{"routes": {"": 4}}"#, #"{"routes": [4]}"#, #"{"routes": null}"#] {
      XCTAssertThrowsError(try parse(text), text) { error in
        let message = (error as? EngineSettings.Invalid)?.message ?? ""
        XCTAssertTrue(message.contains("routes") && message.contains("/h/.config/cua/engine.json") && message.contains("4"), message)
      }
    }
  }

  func testTheSettingsLiveUnderHome() {
    XCTAssertEqual(EngineSettings.path(environment: ["HOME": "/Users/x"]), "/Users/x/.config/cua/engine.json")
  }

  func testTheUidPolicyAdmitsOnlyTheEnginesOwnUser() {
    XCTAssertTrue(PeerPolicy.uid.admits(peerUid: getuid()))
    XCTAssertFalse(PeerPolicy.uid.admits(peerUid: getuid() &+ 1))
  }
}
