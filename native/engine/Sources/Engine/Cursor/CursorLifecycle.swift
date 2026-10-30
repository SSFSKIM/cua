import CoreGraphics
import Foundation

// One cursor's states (the spec's Design, "What the person sees", its state table; "Motion", keyboard-only actions;
// "Lifecycle and identity"). Pure: every transition takes the time it happens at, and `nextDeadline` says when the hub's
// timer must call `tick` next. Activity is per request: `begin` and `end` bracket every execute request, so nothing fades
// while a request is in flight and the 5 s idle runs from the end of the last one (O3).

enum CursorPhase: Equatable, Sendable {
  case hidden, acting, thinking, takenOver, fading

  var visible: Bool { self != .hidden }
}

/// Where a cursor last pointed in an app: the global point (top-left origin) and the window it was attached to.
struct CursorPoint: Equatable, Sendable {
  let global: CGPoint
  let window: CGWindowID
}

enum CursorBeginEffect: Equatable {
  case none
  /// A keyboard request brought a hidden or fading cursor back at its last point in the request's app.
  case reappear(CursorPoint)
}

struct CursorLifecycle {
  /// The idle bound before the fade (O3) and the fade itself (the vendor's fade-in time, VC §2, used both ways).
  static let idleSeconds = 5.0
  static let fadeSeconds = 0.44

  private(set) var phase: CursorPhase = .hidden
  private(set) var inFlight = 0
  /// When the last request ended, while none is in flight.
  private(set) var idleSince: TimeInterval?
  /// When the motion now playing settles (acting → thinking).
  private(set) var motionSettlesAt: TimeInterval?
  private(set) var fadeEndsAt: TimeInterval?
  /// The last point per app key (`ResolvedApp.key`).
  private(set) var lastPoints: [String: CursorPoint] = [:]

  /// A request began (Methods.swift's prologue). It cancels a fade, clears taken over, and a keyboard-only request brings
  /// a hidden or fading cursor back at its last point in the request's app (staying hidden when it has none there).
  @discardableResult
  mutating func begin(app: String?, keyboardOnly: Bool, now: TimeInterval) -> CursorBeginEffect {
    inFlight += 1
    idleSince = nil
    switch phase {
    case .hidden:
      guard keyboardOnly, let app, let point = lastPoints[app] else { return .none }
      settle(now: now)
      return .reappear(point)
    case .fading:
      fadeEndsAt = nil
      if keyboardOnly, let app, let point = lastPoints[app] {
        settle(now: now)
        return .reappear(point)
      }
      phase = .thinking
    case .takenOver:
      settle(now: now)
    case .acting, .thinking:
      break
    }
    return .none
  }

  /// A request ended (the prologue's defer): with none left in flight the idle bound starts.
  mutating func end(now: TimeInterval) {
    inFlight = max(inFlight - 1, 0)
    if inFlight == 0 { idleSince = now }
  }

  /// An action reached a hook: the cursor is acting until its motion settles. Answers whether it was hidden, so it fades
  /// in at the target rather than gliding in from nowhere.
  mutating func acted(app: String, at point: CursorPoint, settlesAt: TimeInterval, now: TimeInterval) -> Bool {
    let wasHidden = phase == .hidden
    phase = .acting
    fadeEndsAt = nil
    motionSettlesAt = settlesAt
    lastPoints[app] = point
    return wasHidden
  }

  /// The motion now playing was replaced (planned again under a changed Reduce Motion): it settles at `settlesAt`.
  /// The requests in flight and the idle bound are untouched.
  mutating func motionReplaced(settlesAt: TimeInterval) {
    if phase == .acting { motionSettlesAt = settlesAt }
  }

  /// The engine's intervention detection attributed the person's event to the app the cursor acts in.
  mutating func userActed(now: TimeInterval) {
    if phase == .acting || phase == .thinking {
      phase = .takenOver
      motionSettlesAt = nil
    }
  }

  /// end_task, or the screen locking: fade at once.
  mutating func hide(now: TimeInterval) {
    guard phase.visible, phase != .fading else { return }
    phase = .fading
    motionSettlesAt = nil
    fadeEndsAt = now + Self.fadeSeconds
  }

  /// Every transition due at `now`, in order.
  mutating func tick(now: TimeInterval) {
    if phase == .acting, let settles = motionSettlesAt, settles <= now {
      phase = .thinking
      motionSettlesAt = nil
    }
    if phase == .acting || phase == .thinking || phase == .takenOver, let fadeAt, fadeAt <= now {
      phase = .fading
      motionSettlesAt = nil
      fadeEndsAt = fadeAt + Self.fadeSeconds
    }
    if phase == .fading, let ends = fadeEndsAt, ends <= now {
      phase = .hidden
      fadeEndsAt = nil
    }
  }

  /// When `tick` has work next; nil while nothing is pending (hidden, or a request in flight with the motion settled).
  var nextDeadline: TimeInterval? {
    switch phase {
    case .hidden: return nil
    case .fading: return fadeEndsAt
    case .acting: return [motionSettlesAt, fadeAt].compactMap { $0 }.min()
    case .thinking, .takenOver: return fadeAt
    }
  }

  /// When the fade now playing began.
  var fadeStartedAt: TimeInterval? { phase == .fading ? fadeEndsAt.map { $0 - Self.fadeSeconds } : nil }

  /// When the idle fade starts: five seconds after the last request ended, while none is in flight.
  private var fadeAt: TimeInterval? { idleSince.map { $0 + Self.idleSeconds } }

  /// Shown with no motion to play: acting, settling at once.
  private mutating func settle(now: TimeInterval) {
    phase = .acting
    fadeEndsAt = nil
    motionSettlesAt = now
  }
}
