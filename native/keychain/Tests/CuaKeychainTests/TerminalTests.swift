// Hidden input against a real pseudo-terminal: the production Terminal reads from the pty's slave side while the test
// types on the master side, then checks what reached the screen and that the terminal modes came back.
import Testing
import Foundation
import Darwin
@testable import CuaKeychainCore
import CuaKeychainTestSupport

@Suite(.serialized) struct TerminalTests {
  @Test func hiddenInputReturnsTypedBytesWithoutEchoAndRestoresModes() throws {
    let pty = try PseudoTerminalPair()
    let before = pty.modes()
    let result = pty.run({ try Terminal(fd: pty.slave).readHidden(prompt: "Secret: ") }, typing: ["s3ntinel-é\r"])
    #expect(try result.get().bytes == Array("s3ntinel-é".utf8))
    let screen = pty.drainOutput()
    #expect(screen.contains("Secret: "))
    #expect(!screen.contains("s3nt"))
    #expect(pty.modes() == before)
  }

  @Test func backspaceAndKillLineEditTheHiddenBuffer() throws {
    let pty = try PseudoTerminalPair()
    let result = pty.run({ try Terminal(fd: pty.slave).readHidden(prompt: "Secret: ") }, typing: ["junk\u{15}abX\u{7f}c\u{8}d\n"])
    #expect(try result.get().bytes == Array("abd".utf8))
  }

  @Test func backspaceRemovesAWholeMultibyteCharacter() throws {
    let pty = try PseudoTerminalPair()
    let result = pty.run({ try Terminal(fd: pty.slave).readHidden(prompt: "Secret: ") }, typing: ["aé\u{7f}b\r"])
    #expect(try result.get().bytes == Array("ab".utf8))
  }

  @Test func arrowKeyEscapeSequencesAreIgnored() throws {
    let pty = try PseudoTerminalPair()
    let result = pty.run({ try Terminal(fd: pty.slave).readHidden(prompt: "Secret: ") }, typing: ["a\u{1b}[Db\u{1b}OAc\r"])
    #expect(try result.get().bytes == Array("abc".utf8))
  }

  @Test(arguments: [
    ("\u{3}", TerminalError.cancelled),
    ("partial\u{3}", TerminalError.cancelled),
    ("\u{4}", TerminalError.cancelled),
    ("\r", TerminalError.empty),
    ("\u{ff}\u{fe}\r", TerminalError.invalidEncoding),
  ])
  func failuresRestoreTheTerminal(input: String, expected: TerminalError) throws {
    let pty = try PseudoTerminalPair()
    let before = pty.modes()
    let bytes: [UInt8] = input == "\u{ff}\u{fe}\r" ? [0xff, 0xfe, 0x0d] : Array(input.utf8)
    let result = pty.run({ try Terminal(fd: pty.slave).readHidden(prompt: "Secret: ") }, typingBytes: [bytes])
    #expect(throws: expected) { try result.get() }
    #expect(pty.modes() == before)
    #expect(!pty.drainOutput().contains("partial"))
  }

  @Test func overlongInputIsRefusedAndRestores() throws {
    let pty = try PseudoTerminalPair()
    let before = pty.modes()
    let result = pty.run({ try Terminal(fd: pty.slave).readHidden(prompt: "Secret: ", maxBytes: 8) }, typing: ["123456789\r"])
    #expect(throws: TerminalError.tooLong) { try result.get() }
    #expect(pty.modes() == before)
  }

  @Test func visibleLineReadsAnAnswer() throws {
    let pty = try PseudoTerminalPair()
    let result = pty.run({ try Terminal(fd: pty.slave).readLine(prompt: "Remove? [y/N] ") }, typing: ["yes\n"])
    #expect(try result.get() == "yes")
    #expect(pty.drainOutput().contains("Remove? [y/N] "))
  }

  @Test func aNonTerminalDescriptorIsRefused() throws {
    var fds: [Int32] = [0, 0]
    #expect(pipe(&fds) == 0)
    defer { close(fds[0]); close(fds[1]) }
    #expect(throws: TerminalError.notATerminal) { try Terminal(fd: fds[0]).readHidden(prompt: "Secret: ") }
  }
}
