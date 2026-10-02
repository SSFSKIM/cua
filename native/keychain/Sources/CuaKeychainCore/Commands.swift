// The helper's command surface. Values only ever enter through hidden terminal input (`set`) and only ever leave
// through the private broker (`broker`); no command prints, exports or returns a value, and no argument, flag or
// environment variable carries one. Failures print one line, `cua-keychain: <message> [<code>]`, that never repeats
// what the user typed or passed. Exit codes: 0 success, 1 failure, 2 usage.
import Foundation

public struct HelperIO {
  public var stdout: (String) -> Void
  public var stderr: (String) -> Void
  public var openTerminal: () throws -> Terminal

  public init(stdout: @escaping (String) -> Void, stderr: @escaping (String) -> Void, openTerminal: @escaping () throws -> Terminal) {
    self.stdout = stdout
    self.stderr = stderr
    self.openTerminal = openTerminal
  }

  public static var standard: HelperIO {
    HelperIO(
      stdout: { writeAll(STDOUT_FILENO, Array($0.utf8)) },
      stderr: { writeAll(STDERR_FILENO, Array($0.utf8)) },
      openTerminal: { try Terminal.controlling() })
  }
}

/// Read by `cua doctor` from the built binary to confirm it speaks the broker protocol src/secrets/client.mjs expects.
public let brokerProtocolMarker = "cua-keychain broker protocol 1"
public let brokerProtocolVersion = 1

public let usageText = """
  usage: cua-keychain <command>
    set <label>              read a secret at the terminal (hidden, entered twice) and store it
    list                     print the stored labels as JSON, never values
    remove <label> [--yes]   delete that one secret, after confirming at the terminal unless --yes
    broker                   serve one connection's private broker (configured on stdin)
  labels: 1-128 letters, digits, '.', '_' or '-', starting with a letter or digit

  """ + brokerProtocolMarker + "\n"

private let labelRule = "labels are 1-128 letters, digits, '.', '_' or '-', starting with a letter or digit"

/// The whole helper: `broker` serves on stdin/stdout, everything else is a terminal command.
public func helperMain(_ arguments: [String], store: SecretStore) -> Int32 {
  if arguments.first == "broker" {
    guard arguments.count == 1 else {
      HelperIO.standard.stderr("cua-keychain: broker takes no arguments [usage]\n")
      return 2
    }
    return runBrokerProcess(store: store)
  }
  return runCommand(arguments, store: store, io: .standard)
}

public func runCommand(_ arguments: [String], store: SecretStore, io: HelperIO) -> Int32 {
  func fail(_ code: String, _ message: String, exit: Int32 = 1) -> Int32 {
    io.stderr("cua-keychain: \(message) [\(code)]\n")
    return exit
  }
  func usage(_ message: String) -> Int32 {
    io.stderr("cua-keychain: \(message) [usage]\n\(usageText)")
    return 2
  }
  func storeFailure(_ error: Error) -> Int32 {
    guard let error = error as? StoreError else { return fail("unavailable", "the Keychain could not be used") }
    switch error {
    case .notFound: return fail(error.code, "no such secret")
    case .denied: return fail(error.code, "Keychain access was denied")
    case .locked: return fail(error.code, "the Keychain is locked")
    case .unavailable(let status): return fail(error.code, "the Keychain could not be used (status \(status))")
    }
  }

  guard let command = arguments.first else { return usage("missing command") }
  let rest = Array(arguments.dropFirst())
  switch command {
  case "help", "--help", "-h":
    io.stdout(usageText)
    return 0

  case "set":
    guard rest.count == 1 else { return usage("set takes exactly one label; the secret is typed at the terminal, never passed as an argument") }
    let label = rest[0]
    guard Label.isValid(label) else { return fail("invalid_label", labelRule, exit: 2) }
    let terminal: Terminal
    do { terminal = try io.openTerminal() } catch {
      return fail("no_terminal", "set reads the secret at a terminal; run it interactively (piped, scripted and argument input are refused)")
    }
    do {
      let first = try terminal.readHidden(prompt: "Secret for \"\(label)\" (input hidden): ")
      let second = try terminal.readHidden(prompt: "Repeat to confirm (input hidden): ")
      defer { first.wipe(); second.wipe() }
      guard first.matches(second) else { throw TerminalError.mismatch }
      let outcome = try store.write(label, first.bytes)
      io.stdout(outcome == .created ? "Stored secret \"\(label)\".\n" : "Replaced secret \"\(label)\".\n")
      return 0
    } catch let error as TerminalError {
      switch error {
      case .cancelled: return fail(error.code, "cancelled; nothing was stored")
      case .mismatch: return fail(error.code, "the two entries did not match; nothing was stored")
      case .empty: return fail(error.code, "an empty secret was not stored")
      case .tooLong: return fail(error.code, "the secret is longer than 4096 bytes; nothing was stored")
      case .invalidEncoding: return fail(error.code, "the input was not valid UTF-8; nothing was stored")
      default: return fail(error.code, "the terminal could not be read; nothing was stored")
      }
    } catch {
      return storeFailure(error)
    }

  case "list":
    guard rest.isEmpty else { return usage("list takes no arguments") }
    do {
      let labels = try store.labels().filter(Label.isValid).sorted()
      let data = try JSONSerialization.data(withJSONObject: ["labels": labels], options: [.sortedKeys])
      io.stdout(String(decoding: data, as: UTF8.self) + "\n")
      return 0
    } catch {
      return storeFailure(error)
    }

  case "remove":
    let confirmed = rest.contains("--yes")
    let positional = rest.filter { $0 != "--yes" }
    guard positional.count == 1, rest.count - positional.count <= 1 else { return usage("remove takes one label and optionally --yes") }
    let label = positional[0]
    guard Label.isValid(label) else { return fail("invalid_label", labelRule, exit: 2) }
    do {
      guard try store.exists(label) else { return fail("not_found", "no secret named \"\(label)\"") }
      if !confirmed {
        let terminal: Terminal
        do { terminal = try io.openTerminal() } catch {
          return fail("no_terminal", "confirm removal at a terminal, or pass --yes")
        }
        let answer: String
        do { answer = try terminal.readLine(prompt: "Remove secret \"\(label)\" from the Keychain? [y/N] ") } catch {
          return fail("cancelled", "not removed")
        }
        guard ["y", "yes"].contains(answer.trimmingCharacters(in: .whitespaces).lowercased()) else {
          return fail("cancelled", "not removed")
        }
      }
      try store.delete(label)
      io.stdout("Removed secret \"\(label)\".\n")
      return 0
    } catch {
      return storeFailure(error)
    }

  default:
    return usage("unknown command")
  }
}
