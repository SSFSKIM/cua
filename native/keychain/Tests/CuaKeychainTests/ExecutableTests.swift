// The built executables as separate processes. The production `cua-keychain` (release build from build:helper) is only
// run on paths that refuse or cancel before any storage call, so these tests never touch the Keychain. Storage-backed
// flows run the test host, which is the same command router linked to in-memory storage instead.
import Testing
import Foundation
import Darwin
import CuaKeychainTestSupport

enum Built {
  /// Release products directory: CUA_KEYCHAIN_BIN_DIR from `npm run test:helper`, else this package's .build/release.
  static var dir: String {
    if let dir = ProcessInfo.processInfo.environment["CUA_KEYCHAIN_BIN_DIR"] { return dir }
    let package = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    return package.appendingPathComponent(".build/release").path
  }
  static var production: String { dir + "/cua-keychain" }
  static var testhost: String { dir + "/cua-keychain-testhost" }
  static var ptyDriver: String { dir + "/cua-keychain-pty" }
}

@Suite(.serialized) struct ExecutableTests {
  @Test func productionSetWithoutATerminalRefusesImmediately() throws {
    let started = Date()
    let r = try ProcessRunner.run(Built.production, ["set", "cua-test-label"], timeout: 10)
    #expect(r.status == 1)
    #expect(r.stderr.contains("[no_terminal]"))
    #expect(Date().timeIntervalSince(started) < 5)
  }

  @Test func productionRefusesAValueOnTheCommandLineWithoutEchoingIt() throws {
    let r = try ProcessRunner.run(Built.production, ["set", "cua-test-label", "hunter2-argv"], timeout: 10)
    #expect(r.status == 2)
    #expect(!(r.stdout + r.stderr).contains("hunter2"))
  }

  @Test func productionHasNoValueReturningRoute() throws {
    for command in ["get", "read", "export", "show"] {
      let r = try ProcessRunner.run(Built.production, [command, "cua-test-label"], timeout: 10)
      #expect(r.status == 2, "\(command)")
    }
  }

  @Test func productionHiddenPromptCancelsAndRestoresTheTerminal() throws {
    let p = try PseudoTerminalProcess.spawn(Built.production, ["set", "cua-test-label"])
    let before = p.initialModes
    try p.expect("(input hidden)", timeout: 10)
    p.type("typed-zz\u{3}")
    let status = p.wait(timeout: 10)
    #expect(status == .exited(1))
    #expect(p.modes() == before)
    let screen = p.output
    #expect(screen.contains("[cancelled]"))
    #expect(!screen.contains("typed-zz"))
  }

  @Test func productionOverflowingPasteIsRefusedWithoutEchoingTheRest() throws {
    let p = try PseudoTerminalProcess.spawn(Built.production, ["set", "cua-test-label"])
    let before = p.initialModes
    try p.expect("(input hidden)", timeout: 10)
    p.type(String(repeating: "Q", count: 4500) + "\r")
    #expect(p.wait(timeout: 10) == .exited(1))
    #expect(p.modes() == before)
    usleep(300_000)
    #expect(p.output.contains("[too_long]"))
    #expect(!p.output.contains("QQQQ"))
  }

  @Test func productionMismatchStoresNothingAndRestoresTheTerminal() throws {
    let p = try PseudoTerminalProcess.spawn(Built.production, ["set", "cua-test-label"])
    let before = p.initialModes
    try p.expect("(input hidden)", timeout: 10)
    p.type("one-zz\r")
    try p.expect("confirm", timeout: 10)
    p.type("two-zz\r")
    #expect(p.wait(timeout: 10) == .exited(1))
    #expect(p.modes() == before)
    #expect(p.output.contains("[mismatch]"))
    #expect(!p.output.contains("-zz"))
  }

  @Test func testhostSetSucceedsWithoutEchoAndRestoresTheTerminal() throws {
    let p = try PseudoTerminalProcess.spawn(Built.testhost, ["set", "k"])
    let before = p.initialModes
    try p.expect("(input hidden)", timeout: 10)
    p.type("secret-zz\r")
    try p.expect("confirm", timeout: 10)
    p.type("secret-zz\r")
    #expect(p.wait(timeout: 10) == .exited(0))
    #expect(p.modes() == before)
    #expect(p.output.contains("Stored secret \"k\""))
    #expect(!p.output.contains("secret-zz"))
  }

  @Test func aSignalDuringHiddenInputStillRestoresTheTerminal() throws {
    for signal in [SIGTERM, SIGHUP] {
      let p = try PseudoTerminalProcess.spawn(Built.testhost, ["set", "k"])
      let before = p.initialModes
      try p.expect("(input hidden)", timeout: 10)
      #expect(p.modes() != before, "hidden mode is active while the prompt waits")
      kill(p.pid, signal)
      #expect(p.wait(timeout: 10) == .signalled(signal))
      #expect(p.modes() == before)
    }
  }

  @Test func testhostBrokerServesThenCleansUpOnInputEOF() throws {
    let dir = try TemporaryDirectory()
    let path = dir.path + "/t.sock"
    let child = try ProcessRunner.start(Built.testhost, ["broker"], environment: ["CUA_KEYCHAIN_TESTHOST_SEED": "{\"k\":\"v-zz\"}"])
    child.writeInput("{\"socket\":\"\(path)\",\"token\":\"\(TOKEN)\"}\n")
    #expect(try child.readLine(timeout: 10) == "{\"protocol\":1,\"ready\":true}")
    #expect(try BrokerTestClient.request(path, json: ["v": 1, "token": TOKEN, "op": "read", "label": "k"])["value"] as? String == "v-zz")
    child.closeInput()
    #expect(child.wait(timeout: 10) == .exited(0))
    #expect(!FileManager.default.fileExists(atPath: path))
  }

  @Test func testhostBrokerCleansUpOnSIGTERM() throws {
    let dir = try TemporaryDirectory()
    let path = dir.path + "/t.sock"
    let child = try ProcessRunner.start(Built.testhost, ["broker"], environment: [:])
    child.writeInput("{\"socket\":\"\(path)\",\"token\":\"\(TOKEN)\"}\n")
    #expect(try child.readLine(timeout: 10) == "{\"protocol\":1,\"ready\":true}")
    kill(child.pid, SIGTERM)
    #expect(child.wait(timeout: 10) == .exited(0))
    #expect(!FileManager.default.fileExists(atPath: path))
  }

  @Test func ptyDriverSeedsThroughTheHiddenPromptAndReportsOnlyMetadata() throws {
    let script = "{\"steps\":[{\"expect\":\"(input hidden)\",\"send\":\"drv-zz\\r\"},{\"expect\":\"confirm\",\"send\":\"drv-zz\\r\"}]}"
    let r = try ProcessRunner.run(Built.ptyDriver, ["--timeout-ms", "10000", "--", Built.testhost, "set", "k"], input: script, timeout: 20)
    #expect(r.status == 0)
    let report = try JSONSerialization.jsonObject(with: Data(r.stdout.utf8)) as? [String: Any]
    #expect(report?["exit"] as? Int == 0)
    #expect(report?["timedOut"] as? Bool == false)
    #expect(report?["terminalRestored"] as? Bool == true)
    #expect((report?["output"] as? String)?.contains("Stored secret \"k\"") == true)
    #expect(!r.stdout.contains("drv-zz") && !r.stderr.contains("drv-zz"))
  }

  @Test func ptyDriverTimesOutAndKillsAStuckChild() throws {
    let script = "{\"steps\":[{\"expect\":\"never printed\",\"send\":\"x\\r\"}]}"
    let started = Date()
    let r = try ProcessRunner.run(Built.ptyDriver, ["--timeout-ms", "500", "--", Built.testhost, "set", "k"], input: script, timeout: 20)
    #expect(r.status == 1)
    #expect(Date().timeIntervalSince(started) < 10)
    let report = try JSONSerialization.jsonObject(with: Data(r.stdout.utf8)) as? [String: Any]
    #expect(report?["timedOut"] as? Bool == true)
    #expect(report?["failedStep"] as? Int == 0)
    #expect(report?["terminalRestored"] as? Bool == true)
  }
}
