import AppKit
import Foundation

// `cua-engine --probe cursor` (the spec's M1, Decisions: the panel and views are exercised by a probe; M3 uses it too).
// With no option, a cursor appears on the main screen over a transparent window of the probe's own (at the floating
// level, so it shows above the person's windows for the few seconds it runs; nothing is clicked, focused or activated)
// and runs a scripted set of moves (scoot, long path, edge, backward, drag), presses, thinking, taken over and the fade,
// printing one line per step with its planned duration and the time it took, then a final line. With `--window <id>`
// it holds a cursor still over that window (the window's own level and order) for `--seconds` (default 10), for M3's
// click-through and intervention proof.

enum CursorProbe {
  static func run(_ arguments: [String]) -> Int32 {
    var window: CGWindowID?
    var seconds = 10.0
    var backdrop = false
    var index = 0
    while index < arguments.count {
      switch arguments[index] {
      case "--window":
        guard index + 1 < arguments.count, let id = UInt32(arguments[index + 1]) else { return Probe.emit(["error": "--window needs a window number"], status: 64) }
        window = id; index += 2
      case "--backdrop":
        backdrop = true; index += 1
      case "--seconds":
        guard index + 1 < arguments.count, let s = Double(arguments[index + 1]), s > 0, s <= 600 else { return Probe.emit(["error": "--seconds needs 0 < n ≤ 600"], status: 64) }
        seconds = s; index += 2
      default:
        return Probe.emit(["error": "usage: --probe cursor [--backdrop] | --probe cursor --window <window number> [--seconds <n>]"], status: 64)
      }
    }
    let (held, duration, painted) = (window, seconds, backdrop)
    return MainActor.assumeIsolated {
      let application = NSApplication.shared
      application.setActivationPolicy(isBundled ? .accessory : .prohibited)
      let hub = CursorHub.live()
      Thread {
        let status = held.map { hold(hub, window: $0, seconds: duration) } ?? scripted(hub, backdrop: painted)
        DispatchQueue.main.async { exit(status) }
      }.start()
      application.run()
      return 0
    }
  }

  /// The probe's own target: a transparent, mouse-ignoring panel over the main screen's visible frame, at the floating
  /// level, which the cursor attaches to; with `backdrop`, a smaller one painted with colour bands, so a capture of it
  /// holds only the probe's own windows and shows the halo's blur.
  @MainActor private static func makeTarget(backdrop: Bool) -> (CGWindowID, CGRect)? {
    guard let screen = NSScreen.main else { return nil }
    let visible = screen.visibleFrame
    let frame = backdrop ? CGRect(x: visible.midX - 450, y: visible.midY - 280, width: 900, height: 560) : visible
    let panel = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.isOpaque = false
    panel.backgroundColor = NSColor.white.withAlphaComponent(0.001)
    if backdrop { panel.contentView = BandsView(frame: NSRect(origin: .zero, size: frame.size)) }
    panel.ignoresMouseEvents = true
    panel.hasShadow = false
    panel.level = .floating
    panel.hidesOnDeactivate = false
    panel.title = "cua cursor probe target"
    panel.orderFrontRegardless()
    targetPanel = panel
    return (CGWindowID(panel.windowNumber), frame)
  }
  @MainActor private static var targetPanel: NSPanel?

  private static func scripted(_ hub: CursorHub, backdrop: Bool) -> Int32 {
    guard let (window, frame, primaryHeight) = DispatchQueue.main.sync(execute: {
      MainActor.assumeIsolated { makeTarget(backdrop: backdrop).map { ($0.0, $0.1, NSScreen.screens.first?.frame.maxY ?? 0) } }
    }) else { return Probe.emit(["error": "no screen"], status: 2) }
    if backdrop {
      Probe.stream(["backdrop": ["x": Double(frame.minX), "y": Double(primaryHeight - frame.maxY), "width": Double(frame.width), "height": Double(frame.height)]])
    }
    usleep(150_000)  // the target ordered in and listed
    // Global top-left points inside the visible frame.
    func global(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint {
      CGPoint(x: frame.minX + frame.width * fx, y: primaryHeight - (frame.minY + frame.height * (1 - fy)))
    }
    let app = "cua-cursor-probe"
    let connection = 1
    var steps: [[String: Any]] = []
    func step(_ name: String, settle extra: Double = 0.25, _ action: () -> Void) {
      let started = monotonicMilliseconds()
      hub.begin(connection: connection, app: app, keyboardOnly: false)
      action()
      hub.end(connection: connection)
      hub.drain()
      let planned = hub.lastCommit(connection: connection)?.motion.map { $0.trajectory.duration } ?? 0
      let mode = hub.lastCommit(connection: connection)?.motion.map { "\($0.trajectory.mode)" } ?? "none"
      usleep(useconds_t((planned + extra) * 1_000_000))
      let line: [String: Any] = ["step": name, "mode": mode, "plannedMs": Int((planned * 1000).rounded()),
                                 "ms": Int((monotonicMilliseconds() - started).rounded()), "phase": "\(hub.phase(connection: connection) ?? .hidden)"]
      steps.append(line)
      Probe.stream(line)
    }
    func click(_ p: CGPoint) { hub.act(connection: connection, app: app, window: window, .click(p)) }
    step("appear") { click(global(0.3, 0.5)) }
    step("scoot") { click(global(0.36, 0.56)) }
    step("path") { click(global(0.75, 0.3)) }
    step("edge") { click(global(0.985, 0.6)) }
    step("backward") {
      click(global(0.15, 0.2))
    }
    step("backward-down-right") { click(global(0.7, 0.8)) }
    step("drag", settle: 0.4) { hub.act(connection: connection, app: app, window: window, .drag([global(0.55, 0.7), global(0.35, 0.45)])) }
    step("scroll") { hub.act(connection: connection, app: app, window: window, .scroll(global(0.4, 0.5))) }
    // Thinking: the motion has settled and no action has come.
    let thinkingStarted = monotonicMilliseconds()
    usleep(1_500_000)
    Probe.stream(["step": "thinking", "ms": Int((monotonicMilliseconds() - thinkingStarted).rounded()), "phase": "\(hub.phase(connection: connection) ?? .hidden)"])
    let takenStarted = monotonicMilliseconds()
    hub.userActed(pid: getpid())
    hub.drain()
    usleep(1_000_000)
    Probe.stream(["step": "taken over", "ms": Int((monotonicMilliseconds() - takenStarted).rounded()), "phase": "\(hub.phase(connection: connection) ?? .hidden)"])
    let fadeStarted = monotonicMilliseconds()
    hub.hide(connection: connection)
    usleep(useconds_t((CursorLifecycle.fadeSeconds + 0.1) * 1_000_000))
    hub.tick()
    let faded = hub.phase(connection: connection) ?? .hidden
    Probe.stream(["step": "fade", "ms": Int((monotonicMilliseconds() - fadeStarted).rounded()), "phase": "\(faded)"])
    hub.closed(connection: connection)
    hub.drain()
    usleep(100_000)
    return Probe.emit(["steps": steps.count + 3, "hidden": faded == .hidden], status: faded == .hidden ? 0 : 1)
  }

  /// A cursor held still over `window`'s centre: a request kept in flight, so it never fades, until `seconds` pass.
  private static func hold(_ hub: CursorHub, window: CGWindowID, seconds: Double) -> Int32 {
    guard let listed = onScreenWindowList().first(where: { $0.number == window }) else {
      return Probe.emit(["error": "window \(window) is not on screen"], status: 2)
    }
    let app = "cua-cursor-probe#\(listed.owner)"
    hub.begin(connection: 1, app: app, keyboardOnly: false)
    hub.act(connection: 1, app: app, window: window, .click(CGPoint(x: listed.bounds.midX, y: listed.bounds.midY)))
    hub.drain()
    let shown = hub.lastCommit(connection: 1)?.shown ?? false
    Probe.stream(["holding": Int(window), "at": ["x": Double(listed.bounds.midX), "y": Double(listed.bounds.midY)], "shown": shown])
    usleep(useconds_t(seconds * 1_000_000))
    let phase = hub.phase(connection: 1) ?? .hidden
    hub.end(connection: 1)
    hub.closed(connection: 1)
    hub.drain()
    usleep(100_000)
    return Probe.emit(["held": seconds, "phase": "\(phase)"], status: shown ? 0 : 1)
  }
}

/// The backdrop's colour bands.
private final class BandsView: NSView {
  override func draw(_ dirtyRect: NSRect) {
    let colors: [NSColor] = [.white, .black, .systemRed, .systemGreen, .systemYellow, .systemTeal, .systemBlue, .white]
    var x: CGFloat = 0, i = 0
    while x < bounds.width {
      colors[i % colors.count].setFill()
      NSRect(x: x, y: 0, width: 48, height: bounds.height).fill()
      x += 48; i += 1
    }
    NSColor.black.setFill()
    NSRect(x: 0, y: bounds.midY - 12, width: bounds.width, height: 24).fill()
  }
}
