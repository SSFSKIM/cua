// Test utilities: temporary directories with short paths (unix socket paths are limited to 103 bytes), a broker wire
// client, and child processes started in their own session (no controlling terminal) with piped stdio.
import Foundation
import Darwin
import CuaKeychainTestSupport

final class TemporaryDirectory {
  let path: String
  init() throws {
    var template = Array("/tmp/ckt.XXXXXX".utf8CString)
    guard let made = mkdtemp(&template) else { throw POSIXError(.EIO) }
    path = String(cString: made)
  }
  deinit { try? FileManager.default.removeItem(atPath: path) }
}

enum BrokerTestClient {
  struct Failure: Error {}

  static func frame(_ body: [UInt8]) -> [UInt8] {
    let n = UInt32(body.count)
    return [UInt8(n >> 24 & 0xff), UInt8(n >> 16 & 0xff), UInt8(n >> 8 & 0xff), UInt8(n & 0xff)] + body
  }

  static func connect(_ path: String) throws -> Int32 {
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8)
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      for (i, b) in bytes.enumerated() { raw[i] = b }
      raw[bytes.count] = 0
    }
    let r = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
    }
    guard r == 0 else { close(fd); throw POSIXError(.init(rawValue: errno) ?? .EIO) }
    var on: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
    return fd
  }

  /// Sends raw bytes and parses the reply frame.
  static func raw(_ path: String, _ bytes: [UInt8]) throws -> [String: Any] {
    let fd = try connect(path)
    defer { close(fd) }
    var offset = 0
    while offset < bytes.count {
      let n = bytes[offset...].withUnsafeBytes { write(fd, $0.baseAddress, $0.count) }
      if n <= 0 { break }
      offset += n
    }
    guard let header = readAll(fd, 4) else { throw Failure() }
    let length = header.reduce(0) { ($0 << 8) | Int($1) }
    guard let body = readAll(fd, length),
          let reply = (try? JSONSerialization.jsonObject(with: Data(body))) as? [String: Any] else { throw Failure() }
    return reply
  }

  static func request(_ path: String, json: [String: Any]) throws -> [String: Any] {
    try raw(path, frame(Array(try JSONSerialization.data(withJSONObject: json))))
  }

  private static func readAll(_ fd: Int32, _ count: Int, timeout: Double = 5) -> [UInt8]? {
    var out: [UInt8] = []
    let deadline = Date().addingTimeInterval(timeout)
    var buffer = [UInt8](repeating: 0, count: 4096)
    while out.count < count {
      var p = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
      guard poll(&p, 1, Int32(max(1, deadline.timeIntervalSinceNow * 1000))) > 0 else { return nil }
      let n = read(fd, &buffer, min(buffer.count, count - out.count))
      guard n > 0 else { return nil }
      out.append(contentsOf: buffer[0..<n])
    }
    return out
  }

  /// True once the peer closed the connection within `timeout`.
  static func waitForClose(_ fd: Int32, timeout: Double) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    var byte: UInt8 = 0
    while Date() < deadline {
      var p = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
      if poll(&p, 1, 50) > 0 {
        let n = read(fd, &byte, 1)
        if n <= 0 { return true }
      }
    }
    return false
  }

  /// One line from `fd` (without the newline), or nil at EOF/timeout.
  static func readLine(_ fd: Int32, timeout: Double) throws -> String? {
    var line: [UInt8] = []
    let deadline = Date().addingTimeInterval(timeout)
    var byte: UInt8 = 0
    while Date() < deadline {
      var p = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
      guard poll(&p, 1, 50) > 0 else { continue }
      let n = read(fd, &byte, 1)
      if n <= 0 { return line.isEmpty ? nil : String(decoding: line, as: UTF8.self) }
      if byte == 0x0a { return String(decoding: line, as: UTF8.self) }
      line.append(byte)
    }
    return nil
  }
}

/// A child process in a new session (so it has no controlling terminal), with piped stdin/stdout/stderr.
final class ChildProcess: @unchecked Sendable {
  let pid: pid_t
  private let stdin: Int32
  let stdoutFd: Int32
  private let stderrCollector: PipeCollector
  private var status: ExitStatus?

  init(pid: pid_t, stdin: Int32, stdout: Int32, stderr: Int32) {
    self.pid = pid
    self.stdin = stdin
    stdoutFd = stdout
    stderrCollector = PipeCollector(stderr)
  }

  deinit {
    if status == nil { kill(pid, SIGKILL); _ = wait(timeout: 2) }
    close(stdoutFd)
    closeInput()
  }

  func writeInput(_ text: String) {
    let bytes = Array(text.utf8)
    _ = bytes.withUnsafeBytes { write(stdin, $0.baseAddress, $0.count) }
  }
  private var inputClosed = false
  func closeInput() { if !inputClosed { inputClosed = true; close(stdin) } }

  func readLine(timeout: Double) throws -> String? { try BrokerTestClient.readLine(stdoutFd, timeout: timeout) }
  var stderr: String { stderrCollector.text }

  func wait(timeout: Double) -> ExitStatus? {
    if let status { return status }
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
      var raw: Int32 = 0
      if waitpid(pid, &raw, WNOHANG) == pid {
        let low = raw & 0x7f
        status = low == 0 ? .exited((raw >> 8) & 0xff) : .signalled(low)
        return status
      }
      usleep(5_000)
    } while Date() < deadline
    return nil
  }
}

final class PipeCollector: @unchecked Sendable {
  private let lock = NSLock()
  private var data = Data()
  private let done = DispatchSemaphore(value: 0)
  init(_ fd: Int32) {
    Thread.detachNewThread { [self] in
      var buffer = [UInt8](repeating: 0, count: 4096)
      while true {
        let n = read(fd, &buffer, buffer.count)
        if n > 0 { lock.lock(); data.append(contentsOf: buffer[0..<n]); lock.unlock(); continue }
        if n < 0 && errno == EINTR { continue }
        break
      }
      close(fd)
      done.signal()
    }
  }
  func finish(timeout: Double) { _ = done.wait(timeout: .now() + timeout) }
  var text: String { lock.lock(); defer { lock.unlock() }; return String(decoding: data, as: UTF8.self) }
}

enum ProcessRunner {
  struct Result { let status: Int32?; let stdout: String; let stderr: String }

  static func start(_ path: String, _ arguments: [String], environment extra: [String: String] = [:]) throws -> ChildProcess {
    var input: [Int32] = [0, 0], output: [Int32] = [0, 0], errors: [Int32] = [0, 0]
    guard pipe(&input) == 0, pipe(&output) == 0, pipe(&errors) == 0 else { throw POSIXError(.EIO) }
    var actions: posix_spawn_file_actions_t?
    posix_spawn_file_actions_init(&actions)
    defer { posix_spawn_file_actions_destroy(&actions) }
    posix_spawn_file_actions_adddup2(&actions, input[0], 0)
    posix_spawn_file_actions_adddup2(&actions, output[1], 1)
    posix_spawn_file_actions_adddup2(&actions, errors[1], 2)
    for fd in input + output + errors { posix_spawn_file_actions_addclose(&actions, fd) }
    var attributes: posix_spawnattr_t?
    posix_spawnattr_init(&attributes)
    defer { posix_spawnattr_destroy(&attributes) }
    posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETSID | POSIX_SPAWN_CLOEXEC_DEFAULT))
    let env = ProcessInfo.processInfo.environment.merging(extra) { $1 }
    let argv: [UnsafeMutablePointer<CChar>?] = ([path] + arguments).map { strdup($0) } + [nil]
    let envp: [UnsafeMutablePointer<CChar>?] = env.map { strdup("\($0.key)=\($0.value)") } + [nil]
    defer { argv.forEach { free($0) }; envp.forEach { free($0) } }
    var pid: pid_t = 0
    let r = posix_spawn(&pid, path, &actions, &attributes, argv, envp)
    close(input[0]); close(output[1]); close(errors[1])
    guard r == 0 else { close(input[1]); close(output[0]); close(errors[0]); throw POSIXError(.init(rawValue: r) ?? .EIO) }
    return ChildProcess(pid: pid, stdin: input[1], stdout: output[0], stderr: errors[0])
  }

  /// Runs to completion (killed at `timeout`), feeding `input` (or nothing) on stdin.
  static func run(_ path: String, _ arguments: [String], input: String? = nil, timeout: Double) throws -> Result {
    let child = try start(path, arguments)
    let stdout = PipeCollector(dup(child.stdoutFd))
    if let input { child.writeInput(input) }
    child.closeInput()
    let status = child.wait(timeout: timeout)
    if status == nil { kill(child.pid, SIGKILL); _ = child.wait(timeout: 2) }
    stdout.finish(timeout: 2)
    usleep(20_000)
    let code: Int32?
    if case .exited(let c)? = status { code = c } else { code = nil }
    return Result(status: code, stdout: stdout.text, stderr: child.stderr)
  }
}
