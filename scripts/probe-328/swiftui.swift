// #328's SwiftUI app (bundled as SwiftUI328.app): one window, a ScrollView of 200 rows beside a List of 200 rows, each
// reporting its content offset (onScrollGeometryChange) to the state file argv[1] (JSON, every change and every 100 ms),
// and every scroll-wheel event reaching the app's dispatch, with its window; argv[2] is a command file (`<n> reset`).
import AppKit
import SwiftUI

func now() -> Double { (Date().timeIntervalSince1970 * 10_000).rounded() / 10 }
final class Box: @unchecked Sendable {
  var offsets: [String: Double] = ["scroll": 0, "list": 0]
  var wheels: [[String: Any]] = []
  let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/swiftui328.json"
  func write() {
    let s: [String: Any] = ["t": now(), "offsets": offsets, "wheels": wheels, "active": NSApp.isActive, "key": NSApp.keyWindow?.title ?? NSNull()]
    if let d = try? JSONSerialization.data(withJSONObject: s) { try? d.write(to: URL(fileURLWithPath: path + ".tmp")); rename(path + ".tmp", path) }
  }
}
let box = Box()

struct Rows: View {
  @State private var top = ScrollPosition(edge: .top)
  @State private var listTop = ScrollPosition(edge: .top)
  @State private var seq = 0
  let tick = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()
  var body: some View {
    HStack(spacing: 10) {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(0..<200, id: \.self) { i in Text("swiftui row \(i)").frame(height: 22) }
        }.frame(maxWidth: .infinity, alignment: .leading)
      }
      .scrollPosition($top)
      .onScrollGeometryChange(for: Double.self, of: { Double($0.contentOffset.y) }) { _, y in box.offsets["scroll"] = y; box.write() }
      .accessibilityIdentifier("swiftui.scroll")
      List(0..<200, id: \.self) { i in Text("list row \(i)") }
        .scrollPosition($listTop)
        .onScrollGeometryChange(for: Double.self, of: { Double($0.contentOffset.y) }) { _, y in box.offsets["list"] = y; box.write() }
        .accessibilityIdentifier("swiftui.list")
    }.frame(width: 570, height: 280)
    .onReceive(tick) { _ in
      // argv[2]: "<n> reset" puts both at the top, once per sequence number.
      guard CommandLine.arguments.count > 2, let text = try? String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8) else { return }
      let parts = text.split(separator: " ").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      guard parts.count >= 2, let n = Int(parts[0]), n > seq else { return }
      seq = n
      if parts[1] == "reset" { top.scrollTo(edge: .top); listTop.scrollTo(edge: .top); box.wheels.removeAll() }
    }
  }
}

@main
struct SwiftUI328: App {
  init() {
    NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel]) { e in
      box.wheels.append(["t": now(), "window": e.window?.title ?? NSNull(), "phase": e.phase.rawValue, "dy": e.scrollingDeltaY, "precise": e.hasPreciseScrollingDeltas])
      if box.wheels.count > 200 { box.wheels.removeFirst(box.wheels.count - 200) }
      return e
    }
    Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in box.write() }
  }
  var body: some Scene { WindowGroup("swiftui328") { Rows() } }
}
