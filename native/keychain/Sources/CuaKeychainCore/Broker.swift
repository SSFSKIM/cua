// The private per-connection secret broker. `cua serve` starts one `cua-keychain broker` per MCP connection, hands it
// a socket path it owns and a random capability token on stdin (never argv or a file), and ends it by closing that
// stdin. Only the trusted sky wrapper, through node_repl's nativePipe, and the server itself (for labels) connect.
//
// Wire (protocol 1), one request and one reply per connection, each a frame: a 4-byte big-endian length, then that
// many bytes of UTF-8 JSON.
//   request  {"v":1,"token":"<capability>","op":"read","label":"<label>"}  or  {"v":1,"token":"…","op":"list"}
//   reply    {"ok":true,"value":"…"} | {"ok":true,"labels":[…]} | {"ok":false,"error":"<code>"}
// Codes: unauthorized, malformed, oversized, invalid_label, not_found, denied, locked, unavailable,
// unsupported_value, response_too_large. The token is checked before anything else in the request is looked at.
// Requests over `requestMaxBytes` are refused from their header without reading the body; a client that does not
// finish its request within `readTimeoutSeconds` is dropped; connections beyond `maxConnections` are closed at once.
// Peers must run as this user. The endpoint is created 0600 and never replaces an existing path; stop() removes it
// only if it is still the socket this broker created.
import Foundation
import Darwin

public struct BrokerConfig: Sendable {
  public let socketPath: String
  public let token: String
  public init(socketPath: String, token: String) { self.socketPath = socketPath; self.token = token }
}

public struct BrokerLimits: Sendable {
  public var requestMaxBytes: Int
  public var responseMaxBytes: Int
  public var readTimeoutSeconds: Double
  public var maxConnections: Int
  public init(requestMaxBytes: Int, responseMaxBytes: Int, readTimeoutSeconds: Double, maxConnections: Int) {
    self.requestMaxBytes = requestMaxBytes
    self.responseMaxBytes = responseMaxBytes
    self.readTimeoutSeconds = readTimeoutSeconds
    self.maxConnections = maxConnections
  }
  public static let standard = BrokerLimits(requestMaxBytes: 1024, responseMaxBytes: 262_144, readTimeoutSeconds: 2, maxConnections: 16)
}

public enum BrokerStartError: Error, Equatable {
  case notAbsolute, pathTooLong, endpointExists
  case socketFailed(Int32)

  public var code: String {
    switch self {
    case .notAbsolute: return "endpoint_not_absolute"
    case .pathTooLong: return "endpoint_path_too_long"
    case .endpointExists: return "endpoint_exists"
    case .socketFailed: return "endpoint_failed"
    }
  }
}

public final class Broker: @unchecked Sendable {
  private let config: BrokerConfig
  private let token: [UInt8]
  private let store: SecretStore
  private let limits: BrokerLimits
  private let lock = NSLock()
  private var listener: Int32 = -1
  private var wake: [Int32] = [-1, -1]
  private var identity: (dev: dev_t, ino: ino_t)?
  private var active = 0
  private var stopped = false
  private let loopDone = DispatchSemaphore(value: 0)
  private let queue = DispatchQueue(label: "cua-keychain.broker", attributes: .concurrent)

  public init(config: BrokerConfig, store: SecretStore, limits: BrokerLimits = .standard) {
    self.config = config
    self.token = Array(config.token.utf8)
    self.store = store
    self.limits = limits
  }

  public func start() throws {
    let path = config.socketPath
    guard path.hasPrefix("/") else { throw BrokerStartError.notAbsolute }
    var address = sockaddr_un()
    let pathBytes = Array(path.utf8)
    guard pathBytes.count < MemoryLayout.size(ofValue: address.sun_path) else { throw BrokerStartError.pathTooLong }
    var existing = stat()
    if lstat(path, &existing) == 0 { throw BrokerStartError.endpointExists }

    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { throw BrokerStartError.socketFailed(errno) }
    _ = fcntl(fd, F_SETFD, FD_CLOEXEC)
    address.sun_family = sa_family_t(AF_UNIX)
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      for (i, b) in pathBytes.enumerated() { raw[i] = b }
      raw[pathBytes.count] = 0
    }
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    let previousMask = umask(0o177)
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
    }
    let bindErrno = errno
    umask(previousMask)
    guard bound == 0 else {
      close(fd)
      throw bindErrno == EADDRINUSE ? BrokerStartError.endpointExists : BrokerStartError.socketFailed(bindErrno)
    }
    var created = stat()
    guard lstat(path, &created) == 0, chmod(path, 0o600) == 0, listen(fd, 16) == 0 else {
      let e = errno
      close(fd)
      unlink(path)
      throw BrokerStartError.socketFailed(e)
    }
    guard pipe(&wake) == 0 else {
      let e = errno
      close(fd)
      unlink(path)
      throw BrokerStartError.socketFailed(e)
    }
    for w in wake { _ = fcntl(w, F_SETFD, FD_CLOEXEC) }
    identity = (created.st_dev, created.st_ino)
    listener = fd
    Thread.detachNewThread { [self] in acceptLoop() }
  }

  /// Stops accepting, removes the endpoint if it is still ours, and returns once the accept loop has ended.
  /// Connections already accepted finish on their own (bounded by the read timeout).
  public func stop() {
    lock.lock()
    if stopped || listener < 0 { stopped = true; lock.unlock(); return }
    stopped = true
    lock.unlock()
    var byte: UInt8 = 1
    _ = Darwin.write(wake[1], &byte, 1)
    _ = loopDone.wait(timeout: .now() + 5)
    removeEndpoint()
  }

  private func removeEndpoint() {
    guard let identity else { return }
    var current = stat()
    if lstat(config.socketPath, &current) == 0, current.st_dev == identity.dev, current.st_ino == identity.ino,
       current.st_mode & S_IFMT == S_IFSOCK {
      unlink(config.socketPath)
    }
  }

  private func acceptLoop() {
    defer {
      close(listener)
      close(wake[0])
      close(wake[1])
      loopDone.signal()
    }
    while true {
      var fds = [pollfd(fd: listener, events: Int16(POLLIN), revents: 0), pollfd(fd: wake[0], events: Int16(POLLIN), revents: 0)]
      let ready = poll(&fds, 2, -1)
      if ready < 0 { if errno == EINTR { continue } else { return } }
      if fds[1].revents != 0 { return }
      guard fds[0].revents & Int16(POLLIN) != 0 else { continue }
      let connection = accept(listener, nil, nil)
      guard connection >= 0 else { continue }
      _ = fcntl(connection, F_SETFD, FD_CLOEXEC)
      var on: Int32 = 1
      _ = setsockopt(connection, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
      var uid: uid_t = 0, gid: gid_t = 0
      guard getpeereid(connection, &uid, &gid) == 0, uid == geteuid() else { close(connection); continue }
      lock.lock()
      let admitted = active < limits.maxConnections
      if admitted { active += 1 }
      lock.unlock()
      guard admitted else { close(connection); continue }
      queue.async { [self] in
        serve(connection)
        close(connection)
        lock.lock(); active -= 1; lock.unlock()
      }
    }
  }

  private func serve(_ connection: Int32) {
    let deadline = Date().addingTimeInterval(limits.readTimeoutSeconds)
    guard let header = readExactly(connection, 4, deadline: deadline) else { return }
    let length = header.reduce(0) { ($0 << 8) | Int($1) }
    var reply: [String: Any]
    if length == 0 {
      reply = ["ok": false, "error": "malformed"]
    } else if length > limits.requestMaxBytes {
      reply = ["ok": false, "error": "oversized"]
    } else {
      guard var body = readExactly(connection, length, deadline: deadline) else { return }
      reply = respond(to: body)
      for i in body.indices { body[i] = 0 }
    }
    var frame = encode(reply)
    reply.removeAll()
    var timeout = timeval(tv_sec: Int(limits.readTimeoutSeconds.rounded(.up)), tv_usec: 0)
    _ = setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    writeAll(connection, frame)
    for i in frame.indices { frame[i] = 0 }
  }

  private func encode(_ reply: [String: Any]) -> [UInt8] {
    var body = (try? JSONSerialization.data(withJSONObject: reply, options: [.sortedKeys, .withoutEscapingSlashes])).map(Array.init) ?? []
    if body.isEmpty || body.count > limits.responseMaxBytes {
      for i in body.indices { body[i] = 0 }
      body = Array(#"{"error":"response_too_large","ok":false}"#.utf8)
    }
    let n = UInt32(body.count)
    return [UInt8(n >> 24 & 0xff), UInt8(n >> 16 & 0xff), UInt8(n >> 8 & 0xff), UInt8(n & 0xff)] + body
  }

  /// The reply to one request body. The token is compared before any other field is examined.
  func respond(to body: [UInt8]) -> [String: Any] {
    func error(_ code: String) -> [String: Any] { ["ok": false, "error": code] }
    guard let request = (try? JSONSerialization.jsonObject(with: Data(body))) as? [String: Any] else { return error("malformed") }
    guard let presented = request["token"] as? String, constantTimeEqual(Array(presented.utf8), token) else { return error("unauthorized") }
    guard Set(request.keys).isSubset(of: ["v", "token", "op", "label"]),
          let version = request["v"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(), version == 1 as NSNumber,
          let op = request["op"] as? String else { return error("malformed") }
    do {
      switch op {
      case "read":
        guard let label = request["label"] as? String else { return error("malformed") }
        guard Label.isValid(label) else { return error("invalid_label") }
        var bytes = try store.read(label)
        defer { for i in bytes.indices { bytes[i] = 0 } }
        guard isValidUTF8(bytes), let value = String(bytes: bytes, encoding: .utf8) else { return error("unsupported_value") }
        return ["ok": true, "value": value]
      case "list":
        guard request["label"] == nil else { return error("malformed") }
        return ["ok": true, "labels": try store.labels().filter(Label.isValid).sorted()]
      default:
        return error("malformed")
      }
    } catch let failure as StoreError {
      return error(failure.code)
    } catch {
      return ["ok": false, "error": "unavailable"]
    }
  }
}

func constantTimeEqual(_ a: [UInt8], _ b: [UInt8]) -> Bool {
  guard a.count == b.count, !a.isEmpty else { return false }
  var diff: UInt8 = 0
  for i in a.indices { diff |= a[i] ^ b[i] }
  return diff == 0
}

/// Reads exactly `count` bytes before `deadline`, or nil on timeout, EOF or error.
func readExactly(_ fd: Int32, _ count: Int, deadline: Date) -> [UInt8]? {
  var out = [UInt8](repeating: 0, count: count)
  var offset = 0
  while offset < count {
    let remaining = deadline.timeIntervalSinceNow
    guard remaining > 0 else { return nil }
    var p = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
    let ready = poll(&p, 1, Int32(max(1, (remaining * 1000).rounded(.up))))
    if ready < 0 { if errno == EINTR { continue } else { return nil } }
    if ready == 0 { return nil }
    let n = out[offset...].withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress, count - offset) }
    if n > 0 { offset += n } else if n < 0 && errno == EINTR { continue } else { return nil }
  }
  return out
}
