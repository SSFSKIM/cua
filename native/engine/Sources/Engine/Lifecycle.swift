import AppKit
import Foundation
import os

// The engine's start and every way it ends, in the unified log (subsystem io.github.ssfskim.cua.engine, category
// lifecycle), each with its reason: a shutdown request, losing the lock, a live socket already at the path, a refusal
// (another uid's directory or connection), a startup failure, a termination signal, NSApplication's termination, the
// run loop ending, and, as a catch-all, any other exit(). An engine launched through LaunchServices has no terminal, so
// this log is the only witness of why it stopped:
//   log show --predicate 'subsystem == "io.github.ssfskim.cua.engine"' --info --last 1h

enum Lifecycle {
  static let log = Logger(subsystem: "io.github.ssfskim.cua.engine", category: "lifecycle")

  /// Whether an exit's reason was already logged; the atexit catch-all logs only the exits nothing else explained.
  nonisolated(unsafe) private static var explained = false
  private static let signalQueue = DispatchQueue(label: "cua-engine signals")
  nonisolated(unsafe) private static var signalSources: [DispatchSourceSignal] = []

  static func started(socket: String) {
    log.notice("started pid \(getpid(), privacy: .public) build \(engineBuild, privacy: .public) socket \(socket, privacy: .public)")
  }

  /// Logs why the engine exits, then exits with `status`.
  static func exit(_ reason: String, status: Int32) -> Never {
    note(reason, status: status)
    Darwin.exit(status)
  }

  static func note(_ reason: String, status: Int32) {
    explained = true
    log.notice("exiting (status \(status, privacy: .public)): \(reason, privacy: .public)")
  }

  /// Something refused that does not end the engine (a connection from another uid).
  static func refused(_ reason: String) { log.notice("refused: \(reason, privacy: .public)") }

  /// Termination signals, NSApplication's termination and the atexit catch-all.
  static func install() {
    for signalNumber in [SIGTERM, SIGINT, SIGHUP, SIGQUIT, SIGUSR1, SIGUSR2, SIGALRM] {
      signal(signalNumber, SIG_IGN)
      let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: signalQueue)
      source.setEventHandler { Lifecycle.exit("signal \(signalNumber) (\(String(cString: strsignal(signalNumber))))", status: 128 + signalNumber) }
      source.resume()
      signalSources.append(source)
    }
    NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: nil) { _ in
      note("NSApplication terminates (a quit request: logout, System Settings' Quit & Reopen, or an Apple Event)", status: 0)
    }
    atexit {
      if !Lifecycle.explained { Lifecycle.log.notice("exiting: exit() without a logged reason") }
    }
  }
}
