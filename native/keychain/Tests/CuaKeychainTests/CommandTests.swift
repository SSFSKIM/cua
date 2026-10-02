// The helper's command routes against injected in-memory storage, with a pseudo-terminal standing in for the user's.
import Testing
import Foundation
@testable import CuaKeychainCore
import CuaKeychainTestSupport

/// Runs one helper command with captured stdout/stderr, typing `input` on a pseudo-terminal when one is offered.
struct Harness {
  let store: MemoryStore
  var terminal: PseudoTerminalPair? = nil
  var stdout = ""
  var stderr = ""
  var exit: Int32 = -1

  init(store: MemoryStore = MemoryStore(), terminal: Bool = true) throws {
    self.store = store
    if terminal { self.terminal = try PseudoTerminalPair() }
  }

  mutating func run(_ args: [String], typing: [String] = []) -> Int32 {
    let out = Captured(), err = Captured()
    let pty = terminal
    let io = HelperIO(
      stdout: { out.append($0) }, stderr: { err.append($0) },
      openTerminal: {
        guard let pty else { throw TerminalError.notATerminal }
        return Terminal(fd: pty.slave)
      })
    let store = self.store
    let code: Int32
    if let pty {
      code = (try? pty.run({ runCommand(args, store: store, io: io) }, typing: typing).get()) ?? -1
    } else {
      code = runCommand(args, store: store, io: io)
    }
    stdout = out.text; stderr = err.text; exit = code
    return code
  }

  var screen: String { terminal?.drainOutput() ?? "" }
}

final class Captured: @unchecked Sendable {
  private let lock = NSLock()
  private var parts: [String] = []
  func append(_ s: String) { lock.lock(); parts.append(s); lock.unlock() }
  var text: String { lock.lock(); defer { lock.unlock() }; return parts.joined() }
}

@Suite(.serialized) struct CommandTests {
  @Test func setStoresExactlyTheConfirmedBytesAndReportsCreation() throws {
    var h = try Harness()
    #expect(h.run(["set", "work-password"], typing: ["v4lue é\r", "v4lue é\r"]) == 0)
    #expect(h.store.value("work-password") == Array("v4lue é".utf8))
    #expect(h.stdout.contains("Stored secret \"work-password\""))
    let screen = h.screen
    #expect(screen.contains("work-password"))
    #expect(!screen.contains("v4lue"))
    #expect(!h.stdout.contains("v4lue") && !h.stderr.contains("v4lue"))
  }

  @Test func setAgainReplacesTheValue() throws {
    var h = try Harness(store: MemoryStore(["k": "old"]))
    #expect(h.run(["set", "k"], typing: ["new\r", "new\r"]) == 0, "\(h.stderr)")
    #expect(h.store.value("k") == Array("new".utf8))
    #expect(h.stdout.contains("Replaced secret \"k\""))
  }

  @Test func mismatchedConfirmationStoresNothing() throws {
    var h = try Harness(store: MemoryStore(["k": "keep"]))
    #expect(h.run(["set", "k"], typing: ["first-xyz\r", "second-xyz\r"]) == 1)
    #expect(h.store.value("k") == Array("keep".utf8))
    #expect(h.stderr.contains("[mismatch]"))
    #expect(!(h.stderr + h.stdout + h.screen).contains("-xyz"))
  }

  @Test func cancellingStoresNothingAndTouchesNoStorage() throws {
    var h = try Harness()
    #expect(h.run(["set", "k"], typing: ["abc\u{3}"]) == 1)
    #expect(h.stderr.contains("[cancelled]"))
    #expect(h.store.operations.isEmpty)
  }

  @Test func setWithoutATerminalIsRefusedBeforeStorage() throws {
    var h = try Harness(terminal: false)
    #expect(h.run(["set", "k"]) == 1)
    #expect(h.stderr.contains("[no_terminal]"))
    #expect(h.store.operations.isEmpty)
  }

  @Test(arguments: [["set"], ["set", "bad label"], ["set", "k", "hunter2-value"], ["set", "--value", "hunter2-value"], ["set", "k", "--value=hunter2-value"]])
  func setRefusesAnythingButOneValidLabel(args: [String]) throws {
    var h = try Harness()
    #expect(h.run(args) == 2)
    #expect(h.store.operations.isEmpty)
    #expect(!h.stderr.contains("hunter2"))
  }

  @Test(arguments: ["get", "read", "show", "export", "print", "dump", "value"])
  func thereIsNoValueReturningCommand(command: String) throws {
    var h = try Harness(store: MemoryStore(["k": "secret-value-zz"]))
    #expect(h.run([command, "k"]) == 2)
    #expect(!(h.stdout + h.stderr).contains("secret-value-zz"))
    #expect(h.store.operations.isEmpty)
  }

  @Test func listPrintsSortedLabelsOnlyAsJSON() throws {
    var h = try Harness(store: MemoryStore(["b": "vb-zz", "a": "va-zz"]), terminal: false)
    #expect(h.run(["list"]) == 0)
    let json = try JSONSerialization.jsonObject(with: Data(h.stdout.utf8)) as? [String: [String]]
    #expect(json == ["labels": ["a", "b"]])
    #expect(!h.stdout.contains("-zz"))
  }

  @Test func listReportsStorageFailureByCode() throws {
    let store = MemoryStore(); store.failAll = .locked
    var h = try Harness(store: store, terminal: false)
    #expect(h.run(["list"]) == 1)
    #expect(h.stderr.contains("[locked]"))
  }

  @Test func removeWithYesDeletesOnlyTheNamedSecret() throws {
    var h = try Harness(store: MemoryStore(["a": "1", "b": "2"]), terminal: false)
    #expect(h.run(["remove", "a", "--yes"]) == 0)
    #expect(h.store.value("a") == nil)
    #expect(h.store.value("b") == Array("2".utf8))
    #expect(h.stdout.contains("Removed secret \"a\""))
  }

  @Test func removeAsksAtTheTerminalAndKeepsTheSecretUnlessConfirmed() throws {
    var yes = try Harness(store: MemoryStore(["a": "1"]))
    #expect(yes.run(["remove", "a"], typing: ["y\n"]) == 0)
    #expect(yes.store.value("a") == nil)
    var no = try Harness(store: MemoryStore(["a": "1"]))
    #expect(no.run(["remove", "a"], typing: ["\n"]) == 1)
    #expect(no.store.value("a") == Array("1".utf8))
    #expect(no.stderr.contains("[cancelled]"))
  }

  @Test func removeWithoutConfirmationOrTerminalIsRefused() throws {
    var h = try Harness(store: MemoryStore(["a": "1"]), terminal: false)
    #expect(h.run(["remove", "a"]) == 1)
    #expect(h.stderr.contains("[no_terminal]"))
    #expect(h.store.value("a") == Array("1".utf8))
  }

  @Test func removingAMissingSecretFailsNotFound() throws {
    var h = try Harness(terminal: false)
    #expect(h.run(["remove", "nope", "--yes"]) == 1)
    #expect(h.stderr.contains("[not_found]"))
  }

  @Test(arguments: [(StoreError.denied, "[denied]"), (StoreError.locked, "[locked]"), (StoreError.unavailable(-25291), "[unavailable]")])
  func storageFailuresDuringSetAreReportedByCode(error: StoreError, code: String) throws {
    let store = MemoryStore(); store.failures["k"] = error
    var h = try Harness(store: store)
    #expect(h.run(["set", "k"], typing: ["abc-zz\r", "abc-zz\r"]) == 1)
    #expect(h.stderr.contains(code))
    #expect(!(h.stderr + h.screen).contains("abc-zz"))
  }

  @Test func helpNamesNoValueReturningRoute() throws {
    var h = try Harness(terminal: false)
    #expect(h.run(["help"]) == 0)
    #expect(h.stdout.contains("set <label>"))
    #expect(!h.stdout.contains("get"))
  }
}
