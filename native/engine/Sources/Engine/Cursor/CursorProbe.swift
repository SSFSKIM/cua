import AppKit
import Foundation

// `cua-engine --probe cursor` (the spec's M1, Decisions: the panel and views are exercised by a probe; M3 uses it too).
// With no option, a cursor appears on the main screen over a transparent window of the probe's own (at the floating
// level, so it shows above the person's windows for the few seconds it runs; nothing is clicked, focused or activated)
// and runs a scripted set of moves (scoot, long path, edge, backward, drag), presses, thinking, taken over and the fade,
// printing one line per step with its planned duration and the time it took, then a final line. With `--window <id>`
// it holds a cursor still over that window (the window's own level and order) for `--seconds` (default 10), for M3's
// click-through and intervention proof. With `--pose settled|rocking` it draws one cursor over the probe's own opaque
// colour bands (`--backdrop`'s), settled (a request kept in flight) or rocking, its layer tree's clock stopped at a fixed
// phase (`rocking`: 0.6 s into the rock), prints the region to capture (global top-left points) and holds it for
// `--seconds` (default 2, at most 5): a still that two builds, or two `--debug` arms (engine.json's `cursorDebug`
// values, `legacyLayers` the sitting's layers), give at the same phase, for a pixel diff of the cursor's look.

enum CursorProbe {
  static func run(_ arguments: [String]) -> Int32 {
    var window: CGWindowID?
    var seconds: Double?
    var backdrop = false
    var pose: CursorPose?
    var debug: CursorDebug?
    var index = 0
    while index < arguments.count {
      switch arguments[index] {
      case "--window":
        guard index + 1 < arguments.count, let id = UInt32(arguments[index + 1]) else { return Probe.emit(["error": "--window needs a window number"], status: 64) }
        window = id; index += 2
      case "--backdrop":
        backdrop = true; index += 1
      case "--pose":
        guard index + 1 < arguments.count, let named = CursorPose(rawValue: arguments[index + 1]) else { return Probe.emit(["error": "--pose needs settled or rocking"], status: 64) }
        pose = named; index += 2
      case "--debug":
        guard index + 1 < arguments.count, let arm = CursorDebug(rawValue: arguments[index + 1]) else {
          return Probe.emit(["error": "--debug needs one of \(CursorDebug.allCases.map(\.rawValue).joined(separator: ", "))"], status: 64)
        }
        debug = arm; index += 2
      case "--seconds":
        guard index + 1 < arguments.count, let s = Double(arguments[index + 1]), s > 0, s <= 600 else { return Probe.emit(["error": "--seconds needs 0 < n ≤ 600"], status: 64) }
        seconds = s; index += 2
      default:
        return Probe.emit(["error": "usage: --probe cursor [--backdrop] | --probe cursor --window <window number> [--seconds <n>] | --probe cursor --pose settled|rocking [--debug <arm>] [--seconds <n>]"], status: 64)
      }
    }
    if pose != nil, window != nil || backdrop { return Probe.emit(["error": "--pose draws over its own backdrop: no --window or --backdrop"], status: 64) }
    if pose != nil, let seconds, seconds > 5 { return Probe.emit(["error": "--pose holds for at most 5 s"], status: 64) }
    let (held, painted, posed, arm) = (window, backdrop, pose, debug)
    let duration = seconds ?? (pose == nil ? 10 : 2)
    return MainActor.assumeIsolated {
      let application = NSApplication.shared
      application.setActivationPolicy(isBundled ? .accessory : .prohibited)
      let system = CursorSystem(), panels = CursorPanels(debug: arm)
      let hub = CursorHub(environment: system.environment, renderer: panels, system: system)
      Thread {
        let status = posed.map { still(hub, panels: panels, pose: $0, seconds: duration) }
          ?? held.map { hold(hub, window: $0, seconds: duration) } ?? scripted(hub, backdrop: painted)
        DispatchQueue.main.async { exit(status) }
      }.start()
      application.run()
      return 0
    }
  }

  /// The probe's own target: a transparent, mouse-ignoring panel over the main screen's visible frame, at the floating
  /// level, which the cursor attaches to; with `backdrop`, a smaller one painted with colour bands, so a capture of it
  /// holds only the probe's own windows and shows the halo's blur (`side`: a square of that side, `--pose`'s).
  @MainActor private static func makeTarget(backdrop: Bool, side: CGFloat? = nil) -> (CGWindowID, CGRect)? {
    guard let screen = NSScreen.main else { return nil }
    let visible = screen.visibleFrame
    let size = side.map { CGSize(width: $0, height: $0) } ?? CGSize(width: 900, height: 560)
    let frame = backdrop ? CGRect(x: (visible.midX - size.width / 2).rounded(), y: (visible.midY - size.height / 2).rounded(), width: size.width, height: size.height) : visible
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

  /// One cursor over the probe's colour bands, its layer clock stopped (`--pose`): settled, a request kept in flight, so
  /// it is acting and still; or rocking, the request ended, stopped 0.6 s after its rock began. Prints the region around
  /// the tip to capture, then holds for `seconds`.
  private static func still(_ hub: CursorHub, panels: CursorPanels, pose: CursorPose, seconds: Double) -> Int32 {
    guard let (window, frame, primaryHeight) = DispatchQueue.main.sync(execute: {
      MainActor.assumeIsolated { makeTarget(backdrop: true, side: 240).map { ($0.0, $0.1, NSScreen.screens.first?.frame.maxY ?? 0) } }
    }) else { return Probe.emit(["error": "no screen"], status: 2) }
    usleep(150_000)  // the target ordered in and listed
    let tip = CGPoint(x: frame.midX.rounded(), y: (primaryHeight - frame.midY).rounded())
    let connection = 1, app = "cua-cursor-probe"
    hub.begin(connection: connection, app: app, keyboardOnly: false)
    hub.act(connection: connection, app: app, window: window, .click(tip))
    hub.drain()
    if pose == .rocking { hub.end(connection: connection) }
    // Shown (a fade-in at the target), and for `rocking` thinking (0.3 s after the request) and 0.6 s into the rock.
    let phase = 0.6
    var frozen: TimeInterval?
    let deadline = monotonicMilliseconds() + 3_000
    while frozen == nil && monotonicMilliseconds() < deadline {
      usleep(50_000)
      frozen = DispatchQueue.main.sync {
        MainActor.assumeIsolated { () -> TimeInterval? in
          let now = CACurrentMediaTime()
          switch pose {
          case .settled:
            guard hub.lastCommit(connection: connection).map({ now > ($0.motion?.beginTime ?? now) + CursorLifecycle.fadeSeconds + 0.3 }) == true else { return nil }
            panels.freeze(connection: connection, at: now)
            return now
          case .rocking:
            guard let started = panels.rockStartedAt(connection: connection), now > started + phase else { return nil }
            panels.freeze(connection: connection, at: started + phase)
            return started + phase
          }
        }
      }
    }
    let phaseNow = hub.phase(connection: connection) ?? .hidden
    guard frozen != nil else {
      hub.closed(connection: connection)
      hub.drain()
      return Probe.emit(["error": "the cursor did not reach the pose", "phase": "\(phaseNow)"], status: 1)
    }
    usleep(150_000)  // the frozen frame composited
    let side = 160.0
    Probe.stream(["pose": pose.rawValue, "phase": "\(phaseNow)", "capture": ["x": Double(tip.x) - side / 2, "y": Double(tip.y) - side / 2, "width": side, "height": side],
                  "tip": ["x": Double(tip.x), "y": Double(tip.y)], "ready": true])
    usleep(useconds_t(seconds * 1_000_000))
    hub.closed(connection: connection)
    hub.drain()
    usleep(100_000)
    return Probe.emit(["pose": pose.rawValue, "held": seconds], status: 0)
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

/// What `--pose` stills.
enum CursorPose: String {
  case settled, rocking
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
