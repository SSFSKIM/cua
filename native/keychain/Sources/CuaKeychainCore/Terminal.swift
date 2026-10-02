// Hidden, confirmed terminal input. The helper reads secrets only from the controlling terminal (/dev/tty, and only
// when stdin is a terminal too), never from arguments, environment or piped input.
//
// Hidden mode turns off echo, canonical line editing and terminal signals (so ^C arrives as a byte and cancels
// cleanly) and edits the line itself: Return ends it, Backspace removes one character, ^U clears, ^C cancels, ^D on an
// empty line cancels, escape sequences (arrow keys) are ignored. Typeahead from before the prompt is discarded. The
// previous modes are restored on every exit path: return, error, and the signals that would otherwise leave the
// user's terminal without echo (SIGTERM, SIGHUP, SIGINT, SIGQUIT), whose handlers restore and then re-raise.
import Darwin

public enum TerminalError: Error, Equatable, Sendable {
  case notATerminal, cancelled, closed, tooLong, empty, invalidEncoding, mismatch
  case io(Int32)

  public var code: String {
    switch self {
    case .notATerminal: return "no_terminal"
    case .cancelled: return "cancelled"
    case .closed: return "terminal_closed"
    case .tooLong: return "too_long"
    case .empty: return "empty"
    case .invalidEncoding: return "invalid_encoding"
    case .mismatch: return "mismatch"
    case .io: return "terminal_error"
    }
  }
}

/// Bytes of a secret held in memory, zeroed when released (best effort: Swift may have copied them).
public final class SecretBuffer {
  public private(set) var bytes: [UInt8]
  init(_ bytes: [UInt8]) { self.bytes = bytes }
  deinit { wipe() }

  public func wipe() {
    for i in bytes.indices { bytes[i] = 0 }
    bytes.removeAll()
  }

  /// Constant-time in the contents for equal lengths.
  public func matches(_ other: SecretBuffer) -> Bool {
    guard bytes.count == other.bytes.count else { return false }
    var diff: UInt8 = 0
    for i in bytes.indices { diff |= bytes[i] ^ other.bytes[i] }
    return diff == 0
  }
}

public final class Terminal {
  public let fd: Int32
  private let ownsDescriptor: Bool

  public init(fd: Int32) { self.fd = fd; ownsDescriptor = false }
  private init(owning fd: Int32) { self.fd = fd; ownsDescriptor = true }
  deinit { if ownsDescriptor { close(fd) } }

  /// The user's terminal: requires stdin to be a terminal and a controlling terminal to open.
  public static func controlling() throws -> Terminal {
    guard isatty(STDIN_FILENO) == 1 else { throw TerminalError.notATerminal }
    let fd = open("/dev/tty", O_RDWR | O_CLOEXEC)
    guard fd >= 0 else { throw TerminalError.notATerminal }
    return Terminal(owning: fd)
  }

  public func write(_ text: String) { writeAll(fd, Array(text.utf8)) }

  public func readHidden(prompt: String, maxBytes: Int = 4096) throws -> SecretBuffer {
    guard isatty(fd) == 1 else { throw TerminalError.notATerminal }
    var saved = termios()
    guard tcgetattr(fd, &saved) == 0 else { throw TerminalError.io(errno) }
    var hidden = saved
    hidden.c_lflag &= ~tcflag_t(ECHO | ECHONL | ICANON | ISIG | IEXTEN)
    withUnsafeMutableBytes(of: &hidden.c_cc) { cc in
      cc[Int(VMIN)] = 1
      cc[Int(VTIME)] = 0
    }
    let restore = ModeRestorer(fd: fd, saved: saved)
    defer { restore.restore() }
    guard tcsetattr(fd, TCSAFLUSH, &hidden) == 0 else { throw TerminalError.io(errno) }
    write(prompt)

    var line: [UInt8] = []
    line.reserveCapacity(min(maxBytes, 4096) + 1)
    defer { for i in line.indices { line[i] = 0 } }
    do {
      try readLineHidden(into: &line, maxBytes: maxBytes)
    } catch {
      write("\n")
      throw error
    }
    write("\n")
    guard !line.isEmpty else { throw TerminalError.empty }
    guard isValidUTF8(line) else { throw TerminalError.invalidEncoding }
    return SecretBuffer(line)
  }

  /// A visible answer (canonical mode, the terminal's own echo and editing), without the line ending.
  public func readLine(prompt: String, maxBytes: Int = 1024) throws -> String {
    guard isatty(fd) == 1 else { throw TerminalError.notATerminal }
    write(prompt)
    var line: [UInt8] = []
    while true {
      let byte = try readByte()
      if byte == 0x0a || byte == 0x0d { break }
      line.append(byte)
      if line.count > maxBytes { throw TerminalError.tooLong }
    }
    return String(decoding: line, as: UTF8.self)
  }

  private func readByte() throws -> UInt8 {
    var byte: UInt8 = 0
    while true {
      let n = Darwin.read(fd, &byte, 1)
      if n == 1 { return byte }
      if n == 0 { throw TerminalError.closed }
      if errno == EINTR { continue }
      throw errno == EIO ? TerminalError.closed : TerminalError.io(errno)
    }
  }

  private enum Escape { case none, start, sequence }

  private func readLineHidden(into line: inout [UInt8], maxBytes: Int) throws {
    var escape = Escape.none
    while true {
      let byte = try readByte()
      switch escape {
      case .start:
        escape = (byte == UInt8(ascii: "[") || byte == UInt8(ascii: "O")) ? .sequence : .none
        continue
      case .sequence:
        if byte >= 0x40 && byte <= 0x7e { escape = .none }
        continue
      case .none:
        break
      }
      switch byte {
      case 0x0d, 0x0a:
        return
      case 0x03:
        throw TerminalError.cancelled
      case 0x04:
        if line.isEmpty { throw TerminalError.cancelled }
      case 0x7f, 0x08:
        // Drop one whole UTF-8 character: continuation bytes, then its lead byte.
        while let last = line.last, last & 0xc0 == 0x80 { line[line.count - 1] = 0; line.removeLast() }
        if !line.isEmpty { line[line.count - 1] = 0; line.removeLast() }
      case 0x15:
        for i in line.indices { line[i] = 0 }
        line.removeAll(keepingCapacity: true)
      case 0x1b:
        escape = .start
      case 0x09:
        line.append(byte)
      case 0x00..<0x20:
        continue
      default:
        line.append(byte)
      }
      if line.count > maxBytes { throw TerminalError.tooLong }
    }
  }
}

/// Whether `bytes` are valid UTF-8, checked without making a String copy of a secret.
func isValidUTF8(_ bytes: [UInt8]) -> Bool {
  var iterator = bytes.makeIterator()
  var decoder = UTF8()
  while true {
    switch decoder.decode(&iterator) {
    case .scalarValue: continue
    case .emptyInput: return true
    case .error: return false
    }
  }
}

func writeAll(_ fd: Int32, _ bytes: [UInt8]) {
  var offset = 0
  while offset < bytes.count {
    let n = bytes[offset...].withUnsafeBytes { Darwin.write(fd, $0.baseAddress, $0.count) }
    if n > 0 { offset += n } else if n < 0 && errno == EINTR { continue } else { return }
  }
}

// Signal-time restoration. Only one hidden read is active at a time in this process; the handler state is plain
// globals because a C signal handler cannot capture.
private var restoreFd: Int32 = -1
private var restoreModes = termios()
private var restoreArmed: sig_atomic_t = 0
private let restoredSignals: [Int32] = [SIGTERM, SIGHUP, SIGINT, SIGQUIT]

private let restoreHandler: @convention(c) (Int32) -> Void = { signal in
  if restoreArmed != 0 {
    var modes = restoreModes
    _ = tcsetattr(restoreFd, TCSANOW, &modes)
  }
  var action = sigaction()
  action.__sigaction_u.__sa_handler = SIG_DFL
  sigemptyset(&action.sa_mask)
  _ = sigaction(signal, &action, nil)
  _ = raise(signal)
}

private final class ModeRestorer {
  private let fd: Int32
  private var saved: termios
  private var previous: [Int32: sigaction] = [:]
  private var done = false

  init(fd: Int32, saved: termios) {
    self.fd = fd
    self.saved = saved
    restoreFd = fd
    restoreModes = saved
    restoreArmed = 1
    // A parent may have started this process with these signals blocked; blocked, they would stay pending and the
    // terminal would never be restored by them.
    var unblock = sigset_t()
    sigemptyset(&unblock)
    for signal in restoredSignals { sigaddset(&unblock, signal) }
    pthread_sigmask(SIG_UNBLOCK, &unblock, nil)
    for signal in restoredSignals {
      var action = sigaction()
      action.__sigaction_u.__sa_handler = restoreHandler
      sigemptyset(&action.sa_mask)
      var old = sigaction()
      if sigaction(signal, &action, &old) == 0 { previous[signal] = old }
    }
  }

  func restore() {
    guard !done else { return }
    done = true
    _ = tcsetattr(fd, TCSANOW, &saved)
    restoreArmed = 0
    for (signal, old) in previous {
      var old = old
      _ = sigaction(signal, &old, nil)
    }
  }
}
