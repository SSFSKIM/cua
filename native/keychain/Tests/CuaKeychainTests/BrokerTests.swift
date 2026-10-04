// The per-connection broker over a real unix socket, with injected in-memory storage.
import Testing
import Foundation
import Darwin
@testable import CuaKeychainCore
import CuaKeychainTestSupport

let TOKEN = "tok-" + String(repeating: "A", count: 40)

struct RunningBroker {
  let broker: Broker
  let path: String
  let dir: TemporaryDirectory
  let store: MemoryStore

  init(store: MemoryStore = MemoryStore(["work-password": "pw-sentinel-zz", "other": "o"]), limits: BrokerLimits = .standard) throws {
    dir = try TemporaryDirectory()
    path = dir.path + "/b.sock"
    self.store = store
    broker = Broker(config: BrokerConfig(socketPath: path, token: TOKEN), store: store, limits: limits)
    try broker.start()
  }

  func request(_ object: [String: Any]) throws -> [String: Any] {
    try BrokerTestClient.request(path, json: object)
  }
}

@Suite(.serialized) struct BrokerTests {
  @Test func readReturnsTheValueToTheRightToken() throws {
    let b = try RunningBroker(); defer { b.broker.stop() }
    let reply = try b.request(["v": 1, "token": TOKEN, "op": "read", "label": "work-password"])
    #expect(reply["ok"] as? Bool == true)
    #expect(reply["value"] as? String == "pw-sentinel-zz")
  }

  @Test func listReturnsSortedLabelsOnly() throws {
    let b = try RunningBroker(); defer { b.broker.stop() }
    let reply = try b.request(["v": 1, "token": TOKEN, "op": "list"])
    #expect(reply["ok"] as? Bool == true)
    #expect(reply["labels"] as? [String] == ["other", "work-password"])
    #expect(reply["value"] == nil)
  }

  @Test(arguments: ["wrong-" + String(repeating: "B", count: 40), "", String(TOKEN.dropLast())])
  func aWrongTokenGetsNothing(token: String) throws {
    let b = try RunningBroker(); defer { b.broker.stop() }
    let reply = try b.request(["v": 1, "token": token, "op": "read", "label": "work-password"])
    #expect(reply as NSDictionary == ["ok": false, "error": "unauthorized"] as NSDictionary)
    #expect(b.store.operations.isEmpty)
  }

  @Test func aMissingTokenIsUnauthorizedEvenForList() throws {
    let b = try RunningBroker(); defer { b.broker.stop() }
    #expect(try b.request(["v": 1, "op": "list"])["error"] as? String == "unauthorized")
    #expect(b.store.operations.isEmpty)
  }

  @Test(arguments: [
    (["v": 2, "token": TOKEN, "op": "read", "label": "x"], "malformed"),
    (["v": 1, "token": TOKEN, "op": "get", "label": "x"], "malformed"),
    (["v": 1, "token": TOKEN, "op": "read"], "malformed"),
    (["v": 1, "token": TOKEN, "op": "list", "label": "x"], "malformed"),
    (["v": 1, "token": TOKEN, "op": "read", "label": "x", "extra": true], "malformed"),
    (["v": 1, "token": TOKEN, "op": "read", "label": "bad label"], "invalid_label"),
    (["v": 1, "token": TOKEN, "op": "read", "label": "missing"], "not_found"),
  ] as [([String: Any], String)])
  func requestsAreValidatedAfterAuthentication(request: [String: Any], error: String) throws {
    let b = try RunningBroker(); defer { b.broker.stop() }
    let reply = try b.request(request)
    #expect(reply as NSDictionary == ["ok": false, "error": error] as NSDictionary)
  }

  @Test(arguments: [(StoreError.denied, "denied"), (StoreError.locked, "locked"), (StoreError.unavailable(-25291), "unavailable")])
  func storageFailuresAreTypedOutcomes(failure: StoreError, error: String) throws {
    let store = MemoryStore(["k": "v"]); store.failures["k"] = failure
    let b = try RunningBroker(store: store); defer { b.broker.stop() }
    #expect(try b.request(["v": 1, "token": TOKEN, "op": "read", "label": "k"]) as NSDictionary == ["ok": false, "error": error] as NSDictionary)
  }

  @Test func aNonUTF8StoredValueIsNotSent() throws {
    let store = MemoryStore(); store.put("k", [0xff, 0xfe])
    let b = try RunningBroker(store: store); defer { b.broker.stop() }
    #expect(try b.request(["v": 1, "token": TOKEN, "op": "read", "label": "k"])["error"] as? String == "unsupported_value")
  }

  @Test func malformedFramesAreRejected() throws {
    let b = try RunningBroker(); defer { b.broker.stop() }
    #expect(try BrokerTestClient.raw(b.path, BrokerTestClient.frame(Array("not json".utf8)))["error"] as? String == "malformed")
    #expect(try BrokerTestClient.raw(b.path, BrokerTestClient.frame(Array("[1,2]".utf8)))["error"] as? String == "malformed")
    #expect(try BrokerTestClient.raw(b.path, [0, 0, 0, 0])["error"] as? String == "malformed")
  }

  @Test func anOversizedRequestIsRefusedWithoutReadingIt() throws {
    let b = try RunningBroker(); defer { b.broker.stop() }
    // Declares 1 MiB and sends only the header: the reply must come without waiting for the body.
    let started = Date()
    #expect(try BrokerTestClient.raw(b.path, [0, 0x10, 0, 0])["error"] as? String == "oversized")
    #expect(Date().timeIntervalSince(started) < 1)
    let big = BrokerTestClient.frame(Array(repeating: UInt8(ascii: "a"), count: BrokerLimits.standard.requestMaxBytes + 1))
    #expect(try BrokerTestClient.raw(b.path, big)["error"] as? String == "oversized")
  }

  @Test func aStalledClientIsDroppedAndOthersAreStillServed() throws {
    let b = try RunningBroker(limits: BrokerLimits(requestMaxBytes: 1024, responseMaxBytes: 262_144, readTimeoutSeconds: 0.3, maxConnections: 16))
    defer { b.broker.stop() }
    let stalled = try BrokerTestClient.connect(b.path)
    defer { close(stalled) }
    _ = [UInt8]([0, 0]).withUnsafeBytes { write(stalled, $0.baseAddress, 2) }
    #expect(try b.request(["v": 1, "token": TOKEN, "op": "list"])["ok"] as? Bool == true)
    #expect(BrokerTestClient.waitForClose(stalled, timeout: 2))
  }

  @Test func theEndpointIsPrivateAndRemovedOnStop() throws {
    let b = try RunningBroker()
    var st = stat()
    #expect(lstat(b.path, &st) == 0)
    #expect(st.st_mode & 0o777 == 0o600)
    #expect(st.st_mode & S_IFMT == S_IFSOCK)
    b.broker.stop()
    #expect(lstat(b.path, &st) == -1)
    #expect(throws: (any Error).self) { try BrokerTestClient.connect(b.path) }
  }

  @Test func stopLeavesAReplacedPathAlone() throws {
    let b = try RunningBroker()
    unlink(b.path)
    FileManager.default.createFile(atPath: b.path, contents: Data("not ours".utf8))
    b.broker.stop()
    #expect(FileManager.default.fileExists(atPath: b.path))
  }

  @Test func anExistingPathIsNeverReplaced() throws {
    let dir = try TemporaryDirectory()
    let path = dir.path + "/b.sock"
    FileManager.default.createFile(atPath: path, contents: Data("x".utf8))
    let broker = Broker(config: BrokerConfig(socketPath: path, token: TOKEN), store: MemoryStore(), limits: .standard)
    #expect(throws: BrokerStartError.endpointExists) { try broker.start() }
    #expect(try String(contentsOfFile: path, encoding: .utf8) == "x")
  }

  @Test func anOverlongPathIsRefused() throws {
    let dir = try TemporaryDirectory()
    let path = dir.path + "/" + String(repeating: "p", count: 120) + ".sock"
    let broker = Broker(config: BrokerConfig(socketPath: path, token: TOKEN), store: MemoryStore(), limits: .standard)
    #expect(throws: BrokerStartError.pathTooLong) { try broker.start() }
  }

  @Test func brokerModeServesUntilItsInputCloses() throws {
    let dir = try TemporaryDirectory()
    let path = dir.path + "/m.sock"
    let input = Pipe(), output = Pipe()
    let store = MemoryStore(["k": "v-zz"])
    let done = DispatchSemaphore(value: 0)
    let box = Captured()
    Thread.detachNewThread {
      let code = runBrokerMode(input: input.fileHandleForReading.fileDescriptor, output: output.fileHandleForWriting.fileDescriptor, store: store, limits: .standard)
      box.append("\(code)")
      done.signal()
    }
    input.fileHandleForWriting.write(Data("{\"socket\":\"\(path)\",\"token\":\"\(TOKEN)\"}\n".utf8))
    let ready = try BrokerTestClient.readLine(output.fileHandleForReading.fileDescriptor, timeout: 5)
    #expect(ready == "{\"protocol\":1,\"ready\":true}")
    #expect(try BrokerTestClient.request(path, json: ["v": 1, "token": TOKEN, "op": "read", "label": "k"])["value"] as? String == "v-zz")
    try input.fileHandleForWriting.close()
    #expect(done.wait(timeout: .now() + 5) == .success)
    #expect(box.text == "0")
    #expect(!FileManager.default.fileExists(atPath: path))
  }

  @Test(arguments: ["not json\n", "{\"socket\":\"/tmp/x.sock\"}\n", "{\"socket\":\"rel.sock\",\"token\":\"\(TOKEN)\"}\n", "{\"socket\":\"/tmp/x.sock\",\"token\":\"short\"}\n", ""])
  func brokerModeRejectsABadConfiguration(config: String) throws {
    let input = Pipe(), output = Pipe()
    input.fileHandleForWriting.write(Data(config.utf8))
    try input.fileHandleForWriting.close()
    let code = runBrokerMode(input: input.fileHandleForReading.fileDescriptor, output: output.fileHandleForWriting.fileDescriptor, store: MemoryStore(), limits: .standard)
    #expect(code == 1)
    let line = try BrokerTestClient.readLine(output.fileHandleForReading.fileDescriptor, timeout: 1)
    #expect(line?.hasPrefix("{\"error\":") == true)
    #expect(line?.contains("\"ready\":false") == true)
    #expect(line?.contains(TOKEN) == false)
  }
}
