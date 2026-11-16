// Offline check of side.swift's `serve` region, which side.test.mjs prepends to this file. Foundation only: no AppKit,
// no AX, no window or app access, so it needs no hosted runner. The ops are stand-ins for the helper's requests.
import Foundation

let beat = Beat()
func handle(_ line: String) -> String? {
  guard let q = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] else { return nil }
  var a: [String: Any] = ["onMainThread": Thread.isMainThread]
  switch q["op"] as? String {
  case "pulse": a["turns"] = beat.count; a["ageMs"] = beat.ageMs
  case "echo": a["seq"] = q["seq"]
  case "slow": let before = beat.count; Thread.sleep(forTimeInterval: 0.3); a["turnsDuring"] = beat.count - before
  default: a["error"] = "unknown"
  }
  return (try? JSONSerialization.data(withJSONObject: a, options: [.sortedKeys])).flatMap { String(data: $0, encoding: .utf8) }
}
if CommandLine.arguments.dropFirst().first == "legacy" {
  // Negative control: the shape side.swift had, with the main thread owning stdin so its run loop never turns.
  RunLoop.main.add(Timer(timeInterval: 0.005, repeats: true) { _ in beat.tick() }, forMode: .common)
  while let line = readLine() { if let answer = handle(line) { print(answer); fflush(stdout) } }
} else {
  serve(beat: beat, handle: handle)
}
