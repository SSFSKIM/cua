// Test-owned pseudo-terminal driver: the private seeding channel for the opt-in live Keychain fixture (and M6's
// acceptance roundtrip). It runs a program with a fresh pty as its controlling terminal and answers its prompts from
// a script the parent writes to this driver's stdin, exactly as a person typing at that terminal would. It adds no
// input route to the helper: `cua-keychain set` still reads only its controlling terminal, and this driver is never
// built by `npm run build:helper` or located by cua.
//
//   cua-keychain-pty [--timeout-ms N] -- <program> [args...]
//   stdin:  {"steps":[{"expect":"<text the program prints>","send":"<what to type>"}, ...]}
//   stdout: {"exit":<code|null>,"signal":<n|null>,"timedOut":<bool>,"failedStep":<index|null>,
//            "terminalRestored":<bool>,"output":"<what the program wrote to its terminal>"}
// What was typed is never written anywhere. Exit 0 when the program exited 0 within the timeout, 1 otherwise, 2 usage.
// On timeout the program gets SIGTERM, then SIGKILL a second later.
import Foundation
import CuaKeychainTestSupport

func usage() -> Never {
  FileHandle.standardError.write(Data("usage: cua-keychain-pty [--timeout-ms N] -- <program> [args...] < script.json\n".utf8))
  exit(2)
}

var arguments = Array(CommandLine.arguments.dropFirst())
var timeoutMs = 10_000
if arguments.first == "--timeout-ms" {
  guard arguments.count >= 2, let value = Int(arguments[1]), value > 0 else { usage() }
  timeoutMs = value
  arguments.removeFirst(2)
}
guard arguments.first == "--", arguments.count >= 2 else { usage() }
let program = arguments[1]
let programArguments = Array(arguments.dropFirst(2))

struct Step { let expect: String; let send: String }
let input = FileHandle.standardInput.readDataToEndOfFile()
guard let script = (try? JSONSerialization.jsonObject(with: input)) as? [String: Any],
      let rawSteps = script["steps"] as? [[String: Any]] else { usage() }
let steps: [Step] = rawSteps.compactMap { step in
  guard let expect = step["expect"] as? String, let send = step["send"] as? String else { return nil }
  return Step(expect: expect, send: send)
}
guard steps.count == rawSteps.count else { usage() }

let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
let child: PseudoTerminalProcess
do { child = try PseudoTerminalProcess.spawn(program, programArguments) } catch {
  FileHandle.standardError.write(Data("cua-keychain-pty: could not start the program\n".utf8))
  exit(1)
}

var failedStep: Int?
for (index, step) in steps.enumerated() {
  do { try child.expect(step.expect, timeout: max(0, deadline.timeIntervalSinceNow)) } catch { failedStep = index; break }
  child.type(step.send)
}
var status = failedStep == nil ? child.wait(timeout: max(0, deadline.timeIntervalSinceNow)) : child.poll()
let timedOut = status == nil
if timedOut {
  child.terminate()
  status = child.poll()
}
let restored = child.modes() == child.initialModes

var report: [String: Any] = [
  "timedOut": timedOut, "terminalRestored": restored, "output": child.output,
  "modes": ["initial": child.initialModes.description, "final": child.modes().description],
  "exit": NSNull(), "signal": NSNull(), "failedStep": failedStep.map { $0 as Any } ?? NSNull(),
]
switch status {
case .exited(let code)?: report["exit"] = Int(code)
case .signalled(let signal)?: report["signal"] = Int(signal)
case nil: break
}
let data = (try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])) ?? Data()
FileHandle.standardOutput.write(data + Data("\n".utf8))
exit(!timedOut && status == .exited(0) ? 0 : 1)
