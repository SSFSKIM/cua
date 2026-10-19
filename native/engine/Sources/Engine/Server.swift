import Darwin
import Foundation

// The socket server (the spec's Design, "Socket and peer check" and "Process model"): `engine.sock` beside the bundle
// (from Bundle.main.bundlePath) or at CUA_ENGINE_SOCKET for a direct run, in a 0700 directory; `flock` on `engine.lock`
// beside it before the socket is unlinked or bound, the loser exiting at once; every connection from another uid closed
// on accept (getpeereid). One thread per connection, which reads its next request only after answering the last. An
// engine that finds another one already serving at the socket (connect succeeds) exits rather than replacing it.
// Every exit is logged with its reason (Lifecycle.swift).

struct ServerPaths {
  let socket: String
  let directory: String
  let lock: String
  let usage: String

  /// Exit status when no socket can be chosen (EX_USAGE), or the lock or a live socket shows another engine (EX_TEMPFAIL).
  static let usageExit: Int32 = 64
  static let lockHeldExit: Int32 = 75

  static func resolve(environment: [String: String] = ProcessInfo.processInfo.environment) -> ServerPaths {
    let socket: String
    if let override = environment["CUA_ENGINE_SOCKET"], !override.isEmpty {
      socket = override
    } else if isBundled {
      socket = (Bundle.main.bundlePath as NSString).deletingLastPathComponent + "/engine.sock"
    } else {
      fail(usageExit, "cua-engine runs outside cua Engine.app: set CUA_ENGINE_SOCKET to the socket path it should bind")
    }
    guard socket.hasPrefix("/") else { fail(usageExit, "CUA_ENGINE_SOCKET must be an absolute path") }
    let directory = (socket as NSString).deletingLastPathComponent
    return ServerPaths(socket: socket, directory: directory, lock: directory + "/engine.lock", usage: directory + "/usage.json")
  }
}

func fail(_ status: Int32, _ message: String) -> Never {
  FileHandle.standardError.write(Data("cua-engine: \(message)\n".utf8))
  Lifecycle.exit(message, status: status)
}

final class Server: @unchecked Sendable {
  let paths: ServerPaths
  let engine: Engine
  private var listener: Int32 = -1
  private var lockFD: Int32 = -1
  private let lock = NSLock()
  private var open: [Int: ConnectionState] = [:]
  private var nextConnection = 1
  /// Set, with the listener closed, under `lock` once a shutdown is accepted: nothing is accepted after it.
  private var shuttingDown = false

  init(paths: ServerPaths) {
    self.paths = paths
    self.engine = Engine(paths: paths)
  }

  /// Claims the directory, the lock and the socket, then accepts on a thread of its own.
  func start() {
    signal(SIGPIPE, SIG_IGN)
    prepareDirectory()
    takeLock()
    bindSocket()
    engine.server = self
    Lifecycle.started(socket: paths.socket)
    let thread = Thread { [self] in acceptLoop() }
    thread.name = "cua-engine accept"
    thread.start()
  }

  private func prepareDirectory() {
    let dir = paths.directory
    let parent = (dir as NSString).deletingLastPathComponent
    try? FileManager.default.createDirectory(atPath: parent, withIntermediateDirectories: true)
    if mkdir(dir, 0o700) != 0 && errno != EEXIST { fail(1, "cannot create \(dir): \(String(cString: strerror(errno)))") }
    var info = stat()
    guard lstat(dir, &info) == 0, (info.st_mode & S_IFMT) == S_IFDIR else { fail(1, "\(dir) is not a directory") }
    guard info.st_uid == getuid() else { fail(1, "uid refusal: \(dir) belongs to another user") }
    if info.st_mode & 0o777 != 0o700 && chmod(dir, 0o700) != 0 { fail(1, "cannot make \(dir) private: \(String(cString: strerror(errno)))") }
  }

  private func takeLock() {
    lockFD = Darwin.open(paths.lock, O_RDWR | O_CREAT | O_CLOEXEC, 0o600)
    if lockFD < 0 { fail(1, "cannot open \(paths.lock): \(String(cString: strerror(errno)))") }
    if flock(lockFD, LOCK_EX | LOCK_NB) != 0 {
      if errno == EWOULDBLOCK { fail(ServerPaths.lockHeldExit, "lock loser: another engine holds \(paths.lock); exiting") }
      fail(1, "cannot lock \(paths.lock): \(String(cString: strerror(errno)))")
    }
  }

  private func bindSocket() {
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let pathBytes = Array(paths.socket.utf8)
    let capacity = MemoryLayout.size(ofValue: address.sun_path)
    guard pathBytes.count < capacity else { fail(1, "the socket path is longer than \(capacity - 1) bytes: \(paths.socket)") }
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      raw.copyBytes(from: pathBytes)
      raw[pathBytes.count] = 0
    }
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    // Only a stale socket is replaced: anything else at the path is someone's file, and a socket that still accepts a
    // connection is another engine's (one that predates the lock, or holds another lock file).
    var existing = stat()
    if lstat(paths.socket, &existing) == 0 {
      guard (existing.st_mode & S_IFMT) == S_IFSOCK else { fail(1, "\(paths.socket) exists and is not a socket") }
      if isLive(&address) { fail(ServerPaths.lockHeldExit, "live socket found: another engine answers at \(paths.socket); exiting") }
      unlink(paths.socket)
    }
    listener = socket(AF_UNIX, SOCK_STREAM, 0)
    if listener < 0 { fail(1, "socket: \(String(cString: strerror(errno)))") }
    _ = fcntl(listener, F_SETFD, FD_CLOEXEC)
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
    }
    if bound != 0 { fail(1, "cannot bind \(paths.socket): \(String(cString: strerror(errno)))") }
    chmod(paths.socket, 0o600)
    if listen(listener, 16) != 0 { fail(1, "listen: \(String(cString: strerror(errno)))") }
  }

  private func isLive(_ address: inout sockaddr_un) -> Bool {
    let probe = socket(AF_UNIX, SOCK_STREAM, 0)
    guard probe >= 0 else { return false }
    defer { close(probe) }
    let connected = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(probe, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
    }
    return connected == 0
  }

  private func acceptLoop() {
    while true {
      let fd = accept(listener, nil, nil)
      if fd < 0 {
        if errno == EINTR || errno == ECONNABORTED { continue }
        return
      }
      _ = fcntl(fd, F_SETFD, FD_CLOEXEC)
      var on: Int32 = 1
      setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
      var uid: uid_t = 0
      var gid: gid_t = 0
      guard getpeereid(fd, &uid, &gid) == 0, uid == getuid() else {
        Lifecycle.refused("uid refusal: a connection from uid \(uid) closed")
        close(fd)
        continue
      }
      guard let connection = register(fd) else { continue }
      let thread = Thread { [self] in serve(connection) }
      thread.name = "cua-engine connection \(connection.id)"
      thread.stackSize = 4 << 20
      thread.start()
    }
  }

  /// Registers an accepted connection; nil (the connection closed) once a shutdown was accepted.
  private func register(_ fd: Int32) -> ConnectionState? {
    lock.lock()
    defer { lock.unlock() }
    if shuttingDown {
      close(fd)
      return nil
    }
    let connection = ConnectionState(id: nextConnection, fd: fd)
    nextConnection += 1
    open[connection.id] = connection
    return connection
  }

  private func unregister(_ connection: ConnectionState) {
    lock.lock()
    open[connection.id] = nil
    lock.unlock()
    close(connection.fd)
  }

  /// Accepts a shutdown atomically with accept: with no connection open but `connection`, closes the listener under the
  /// lock, so no connection can arrive between the count and the exit, and answers 0; else the busy count.
  func beginShutdown(_ connection: ConnectionState) -> Int {
    lock.lock()
    defer { lock.unlock() }
    let others = open.keys.filter { $0 != connection.id }.count
    guard others == 0 else { return others }
    shuttingDown = true
    close(listener)
    return 0
  }

  /// Open connections other than `connection`: `status.connections` and shutdown's busy count.
  func others(than connection: ConnectionState) -> Int {
    lock.lock()
    defer { lock.unlock() }
    return open.keys.filter { $0 != connection.id }.count
  }

  private func serve(_ connection: ConnectionState) {
    defer { unregister(connection) }
    while true {
      switch readFrame(connection.fd) {
      case .closed:
        return
      case .tooLarge(let length):
        let error = EngineError(rpc: .invalidRequest, "frame is too large: \(length) bytes (the maximum is \(maxFrameSize))")
        writeFrame(connection.fd, responseBody(id: NSNull(), outcome: .failure(error)))
        return
      case .frame(let body):
        let receivedAt = unixMilliseconds()
        switch parseRequest(body) {
        case .failure(let failure):
          writeFrame(connection.fd, responseBody(id: failure.id, outcome: .failure(failure.error)))
        case .success(let request):
          let outcome = engine.handle(request, on: connection, receivedAt: receivedAt)
          let written = writeFrame(connection.fd, responseBody(id: request.id, outcome: outcome.result))
          // An accepted shutdown has closed the listener: the engine exits whether or not the answer reached the client.
          if outcome.exitAfter { stopAndExit() }
          guard written else { return }
        }
      }
    }
  }

  /// After an accepted shutdown (the listener already closed): the socket removed, then exit, which releases the lock.
  func stopAndExit() -> Never {
    unlink(paths.socket)
    Lifecycle.exit("shutdown requested", status: 0)
  }
}

func unixMilliseconds() -> Int64 { Int64((Date().timeIntervalSince1970 * 1000).rounded()) }

/// Monotonic milliseconds, for durations.
func monotonicMilliseconds() -> Double { Double(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)) / 1_000_000 }
