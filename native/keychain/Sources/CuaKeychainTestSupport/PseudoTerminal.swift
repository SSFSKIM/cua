// Test-owned pseudo-terminals: a pair whose slave side stands in for the user's terminal in-process, and a child
// process started with a pty as its controlling terminal (the same position as `cua secrets set` run by a human).
// Output from the slave side is collected continuously from the master.
import Foundation
import Darwin

public struct TerminalModes: Equatable, CustomStringConvertible {
  public let lflag: tcflag_t
  public let iflag: tcflag_t
  public var echo: Bool { lflag & tcflag_t(ECHO) != 0 }
  public var description: String { "lflag=0x\(String(lflag, radix: 16)) iflag=0x\(String(iflag, radix: 16))" }
  /// PENDIN is kernel bookkeeping (input to be reprinted after a mode switch), not a mode anyone sets; ignored.
  init(_ t: termios) { lflag = t.c_lflag & ~tcflag_t(PENDIN); iflag = t.c_iflag }
}

public enum ExitStatus: Equatable, Sendable {
  case exited(Int32)
  case signalled(Int32)
}

public struct PseudoTerminalTimeout: Error, CustomStringConvertible {
  public let waitingFor: String
  public var description: String { "timed out waiting for \(waitingFor)" }
}

/// Collects everything written to a pty master. Owns the master descriptor: it is closed by the collecting thread
/// itself once `stop()` is called, so no thread ever reads a descriptor number that was closed and reused.
final class OutputCollector: @unchecked Sendable {
  private let lock = NSLock()
  private var bytes: [UInt8] = []
  private var finished = false
  private let exited = DispatchSemaphore(value: 0)

  init(master: Int32) {
    Thread.detachNewThread { [self] in
      var buffer = [UInt8](repeating: 0, count: 4096)
      while !isFinished {
        var p = pollfd(fd: master, events: Int16(POLLIN), revents: 0)
        let ready = poll(&p, 1, 50)
        if ready <= 0 { continue }
        let n = Darwin.read(master, &buffer, buffer.count)
        if n > 0 { lock.lock(); bytes.append(contentsOf: buffer[0..<n]); lock.unlock() } else if n == 0 || errno != EINTR { usleep(20_000) }
      }
      close(master)
      exited.signal()
    }
  }

  func stop() {
    lock.lock(); finished = true; lock.unlock()
    _ = exited.wait(timeout: .now() + 2)
  }

  private var isFinished: Bool { lock.lock(); defer { lock.unlock() }; return finished }
  var count: Int { lock.lock(); defer { lock.unlock() }; return bytes.count }
  func text(from offset: Int = 0) -> String {
    lock.lock(); defer { lock.unlock() }
    return String(decoding: bytes[min(offset, bytes.count)...], as: UTF8.self)
  }
}

/// Writes to a pty master, giving up after `timeout` if the terminal stops taking input (a reader that went away must
/// not hang the test).
private func writeAllBytes(_ fd: Int32, _ bytes: [UInt8], timeout: Double = 3) {
  let flags = fcntl(fd, F_GETFL)
  _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
  defer { _ = fcntl(fd, F_SETFL, flags) }
  let deadline = Date().addingTimeInterval(timeout)
  var offset = 0
  while offset < bytes.count && Date() < deadline {
    let n = bytes[offset...].withUnsafeBytes { Darwin.write(fd, $0.baseAddress, $0.count) }
    if n > 0 { offset += n; continue }
    if n < 0 && errno != EAGAIN && errno != EINTR { return }
    var p = pollfd(fd: fd, events: Int16(POLLOUT), revents: 0)
    _ = poll(&p, 1, 20)
  }
}

/// Bytes queued for reading on a terminal descriptor that nobody has read yet.
public func pendingInput(_ fd: Int32) -> Int32 {
  var count: Int32 = 0
  _ = ioctl(fd, 0x4004_667f /* FIONREAD: _IOR('f', 127, int) */, &count)
  return count
}

/// Default terminal modes of a fresh pty, used as the explicit starting modes of every spawned pty.
public func defaultTerminalModes() -> termios {
  var master: Int32 = -1, slave: Int32 = -1
  var t = termios()
  if openpty(&master, &slave, nil, nil, nil) == 0 {
    tcgetattr(slave, &t)
    close(master); close(slave)
  }
  return t
}

public final class PseudoTerminalPair: @unchecked Sendable {
  public let master: Int32
  public let slave: Int32
  private let collector: OutputCollector

  public init() throws {
    var m: Int32 = -1, s: Int32 = -1
    guard openpty(&m, &s, nil, nil, nil) == 0 else { throw POSIXError(.init(rawValue: errno) ?? .EIO) }
    master = m
    slave = s
    collector = OutputCollector(master: m)
  }

  deinit {
    collector.stop()
    close(slave)
  }

  public func modes() -> TerminalModes { var t = termios(); tcgetattr(slave, &t); return TerminalModes(t) }
  public func drainOutput() -> String { collector.text() }
  /// Input typed but not read by anyone (it would reach whatever reads the terminal next).
  public var unreadInput: Int32 { pendingInput(slave) }

  /// Runs `body` (which reads from `slave`) on another thread, typing each answer once a new prompt — output ending
  /// in ": " or "] " — has appeared since the previous answer. Returns the body's result, or a timeout error.
  public func run<T>(_ body: @escaping () throws -> T, typing answers: [String] = [], timeout: Double = 10) -> Result<T, Error> {
    run(body, typingBytes: answers.map { Array($0.utf8) }, timeout: timeout)
  }

  public func run<T>(_ body: @escaping () throws -> T, typingBytes answers: [[UInt8]], timeout: Double = 10) -> Result<T, Error> {
    let done = DispatchSemaphore(value: 0)
    let box = ResultBox<T>()
    Thread.detachNewThread {
      box.set(Result { try body() })
      done.signal()
    }
    var mark = 0
    for answer in answers {
      let deadline = Date().addingTimeInterval(timeout)
      while true {
        let text = collector.text(from: mark)
        if text.hasSuffix(": ") || text.hasSuffix("] ") { break }
        if box.isSet || Date() > deadline { break }
        usleep(5_000)
      }
      if box.isSet { break }
      mark = collector.count
      writeAllBytes(master, answer)
    }
    guard done.wait(timeout: .now() + timeout) == .success, let result = box.current() else {
      return .failure(PseudoTerminalTimeout(waitingFor: "the terminal reader to finish"))
    }
    usleep(20_000)
    return result
  }
}

private final class ResultBox<T>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Result<T, Error>?
  func set(_ v: Result<T, Error>) { lock.lock(); value = v; lock.unlock() }
  func current() -> Result<T, Error>? { lock.lock(); defer { lock.unlock() }; return value }
  var isSet: Bool { current() != nil }
}

public final class PseudoTerminalProcess: @unchecked Sendable {
  public let pid: pid_t
  public let master: Int32
  /// The modes the pty was created with, before the child could change them.
  public let initialModes: TerminalModes
  private let slave: Int32
  private let collector: OutputCollector
  private var consumed = 0
  private var status: ExitStatus?

  private init(pid: pid_t, master: Int32, slave: Int32, initial: termios) {
    self.pid = pid
    self.master = master
    self.slave = slave
    initialModes = TerminalModes(initial)
    collector = OutputCollector(master: master)
  }

  deinit {
    if status == nil { terminate() }
    collector.stop()
    if slave >= 0 { close(slave) }
  }

  /// Starts `path` with a new pty as its controlling terminal and stdin/stdout/stderr.
  public static func spawn(_ path: String, _ arguments: [String], environment: [String: String]? = nil) throws -> PseudoTerminalProcess {
    let env = environment ?? ProcessInfo.processInfo.environment
    // Everything the child touches is prepared before fork: after it, only exec.
    let argv: [UnsafeMutablePointer<CChar>?] = ([path] + arguments).map { strdup($0) } + [nil]
    let envp: [UnsafeMutablePointer<CChar>?] = env.map { strdup("\($0.key)=\($0.value)") } + [nil]
    defer { argv.forEach { free($0) }; envp.forEach { free($0) } }
    var modes = defaultTerminalModes()
    var master: Int32 = -1
    let pid = forkpty(&master, nil, &modes, nil)
    if pid == 0 {
      // Start the program as a shell would: no inherited blocked signals.
      var empty = sigset_t()
      sigemptyset(&empty)
      sigprocmask(SIG_SETMASK, &empty, nil)
      execve(path, argv, envp)
      _exit(127)
    }
    guard pid > 0 else { throw POSIXError(.init(rawValue: errno) ?? .EIO) }
    // A second descriptor on the slave lets the parent read the terminal's modes during and after the child.
    let name = String(cString: ptsname(master))
    let slave = open(name, O_RDWR | O_NOCTTY | O_CLOEXEC)
    return PseudoTerminalProcess(pid: pid, master: master, slave: slave, initial: modes)
  }

  /// Read through the master: the slave descriptor is revoked when the child, its session leader, exits.
  public func modes() -> TerminalModes { var t = termios(); tcgetattr(master, &t); return TerminalModes(t) }
  /// Everything the child wrote to its terminal so far.
  public var output: String { collector.text() }

  public func type(_ text: String) { writeAllBytes(master, Array(text.utf8)) }
  public func typeBytes(_ bytes: [UInt8]) { writeAllBytes(master, bytes) }

  /// Waits until `text` appears in output after the previous match; consumes through it.
  public func expect(_ text: String, timeout: Double) throws {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let pending = collector.text(from: consumed)
      if let range = pending.range(of: text) {
        consumed += pending[..<range.upperBound].utf8.count
        return
      }
      if status != nil || poll() != nil {
        if collector.text(from: consumed).contains(text) { continue }
        break
      }
      usleep(5_000)
    }
    throw PseudoTerminalTimeout(waitingFor: "\"\(text)\"")
  }

  /// The exit status if the child has exited (reaping it), without waiting.
  public func poll() -> ExitStatus? {
    if let status { return status }
    var raw: Int32 = 0
    let r = waitpid(pid, &raw, WNOHANG)
    guard r == pid else { return nil }
    let low = raw & 0x7f
    status = low == 0 ? .exited((raw >> 8) & 0xff) : .signalled(low)
    usleep(30_000)  // let the collector take the last output
    return status
  }

  public func wait(timeout: Double) -> ExitStatus? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let s = poll() { return s }
      usleep(5_000)
    }
    return poll()
  }

  /// SIGTERM (which lets the helper restore the terminal), then SIGKILL after a second.
  public func terminate() {
    guard poll() == nil else { return }
    kill(pid, SIGTERM)
    if wait(timeout: 1) == nil {
      kill(pid, SIGKILL)
      _ = wait(timeout: 2)
    }
  }
}
