import AppKit
import CoreGraphics
import Foundation

// The vendor's mouse-event recipe (the spec's Design, "Input" route 2; R/F-helper-logic.md §5.3, R/sky-behaviour.md §11):
// each event made by AppKit and taken as its CGEvent, with no event source; the global point as its location and the
// window-local point through the private CGEventSetWindowLocation; the button in field 3, mouse subtype 3 in field 7,
// the window id in fields 91 and 92; for n clicks, down and up with click count i for i = 1…n, no moves; posted back to
// back to one process. The real pointer is never moved.

enum MouseButton: Equatable {
  case left, right, middle

  /// The facade's `mouse_button`: left, right, middle, l, r, m, 0, 1 or 2 (R/A-contract.md §1.4).
  init?(wire: Any?) {
    switch wire {
    case nil, is NSNull: self = .left
    case let name as String:
      switch name {
      case "left", "l", "0": self = .left
      case "right", "r", "1": self = .right
      case "middle", "m", "2": self = .middle
      default: return nil
      }
    case let number as NSNumber where CFGetTypeID(number) != CFBooleanGetTypeID():
      switch number.doubleValue {
      case 0: self = .left
      case 1: self = .right
      case 2: self = .middle
      default: return nil
      }
    default: return nil
    }
  }

  /// Field 3's value: 0 left, 1 right, 2 other.
  var number: Int64 {
    switch self {
    case .left: 0
    case .right: 1
    case .middle: 2
    }
  }

  var down: NSEvent.EventType {
    switch self {
    case .left: .leftMouseDown
    case .right: .rightMouseDown
    case .middle: .otherMouseDown
    }
  }

  var up: NSEvent.EventType {
    switch self {
    case .left: .leftMouseUp
    case .right: .rightMouseUp
    case .middle: .otherMouseUp
    }
  }
}

/// One mouse event of a click, as data: the type and the click count it carries, and the event number of its pair.
struct MouseEventPlan: Equatable {
  let type: NSEvent.EventType
  let clickCount: Int
  let pair: Int
}

/// For n clicks: down then up with click count i, for i = 1…n (F §5.3).
func clickEventPlan(_ button: MouseButton, count: Int) -> [MouseEventPlan] {
  (1...max(1, count)).flatMap { i in [MouseEventPlan(type: button.down, clickCount: i, pair: i), MouseEventPlan(type: button.up, clickCount: i, pair: i)] }
}

/// A CGEventField by number, including the ones the public enum does not name (the tap reads 51, the window id).
func eventField(_ raw: UInt32) -> CGEventField {
  CGEventField(rawValue: raw) ?? unsafeBitCast(raw, to: CGEventField.self)
}

/// `CGEventSetWindowLocation`, private (recovered by name, F §11): resolved with dlsym, skipped when absent.
private typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
private let setWindowLocation: SetWindowLocation? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation")
  .map { unsafeBitCast($0, to: SetWindowLocation.self) }

/// The vendor's one counter of event numbers, one per down/up pair.
private let eventNumbers = NSLock()
nonisolated(unsafe) private var lastEventNumber = 0

private func nextEventNumber() -> Int {
  eventNumbers.lock()
  defer { eventNumbers.unlock() }
  lastEventNumber += 1
  return lastEventNumber
}

/// Where a click goes: the global point (top-left origin, as AX and CGEvent locations are), the window under it and the
/// process that owns that window's element.
struct ClickTarget {
  let point: CGPoint
  let windowFrame: CGRect?
  let windowID: CGWindowID?
  let pid: pid_t
}

/// The events of `count` clicks at `target` with `flags`, made and ready to post; empty when AppKit made none.
func clickEvents(_ target: ClickTarget, button: MouseButton, count: Int, flags: CGEventFlags) -> [CGEvent] {
  var numbers: [Int: Int] = [:]
  var events: [CGEvent] = []
  for plan in clickEventPlan(button, count: count) {
    let number = numbers[plan.pair] ?? nextEventNumber()
    numbers[plan.pair] = number
    guard let event = mouseEvent(plan.type, at: target.point, in: target, number: number, clickCount: plan.clickCount,
                                 button: button, flags: flags) else { return [] }
    events.append(event)
  }
  return events
}

/// Where each of a drag's events lies.
enum DragPoint: Equatable { case start, middle, end }

/// One event of a drag, as data (F §16.6): its type, its point, its click count, and whether it takes the drag's
/// second event number (the dragged events do; the down and the up share the first).
struct DragEventPlan: Equatable {
  let type: NSEvent.EventType
  let at: DragPoint
  let clickCount: Int
  let secondNumber: Bool
}

/// The vendor's drag (FUN_100744b44): left down at the start (click count 1, number N), dragged at the start, the
/// midpoint and the end (click count 0, number N + 1), left up at the end (click count 1, number N).
let dragEventPlan: [DragEventPlan] = [
  DragEventPlan(type: .leftMouseDown, at: .start, clickCount: 1, secondNumber: false),
  DragEventPlan(type: .leftMouseDragged, at: .start, clickCount: 0, secondNumber: true),
  DragEventPlan(type: .leftMouseDragged, at: .middle, clickCount: 0, secondNumber: true),
  DragEventPlan(type: .leftMouseDragged, at: .end, clickCount: 0, secondNumber: true),
  DragEventPlan(type: .leftMouseUp, at: .end, clickCount: 1, secondNumber: false),
]

/// A drag's five events from `start` to `end`, all aimed at the start's window (`window`, whose frame and id place
/// them), with `flags`; empty when AppKit made none. A drag takes two event numbers.
func dragEvents(from start: CGPoint, to end: CGPoint, window: ClickTarget, flags: CGEventFlags) -> [CGEvent] {
  let first = nextEventNumber(), second = nextEventNumber()
  let middle = CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2)
  var events: [CGEvent] = []
  for plan in dragEventPlan {
    let point = plan.at == .start ? start : plan.at == .middle ? middle : end
    guard let event = mouseEvent(plan.type, at: point, in: window, number: plan.secondNumber ? second : first,
                                 clickCount: plan.clickCount, button: .left, flags: flags) else { return [] }
    events.append(event)
  }
  return events
}

/// One mouse event made by AppKit with the vendor's fields (F §5.3): the global point, the button in field 3, subtype 3
/// in field 7, and the window's id and window-local point from `window` when it names one.
private func mouseEvent(_ type: NSEvent.EventType, at point: CGPoint, in window: ClickTarget, number: Int, clickCount: Int,
                        button: MouseButton, flags: CGEventFlags) -> CGEvent? {
  guard let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: 0,
                                       windowNumber: Int(window.windowID ?? 0), context: nil, eventNumber: number,
                                       clickCount: clickCount, pressure: 1.0)?.cgEvent else { return nil }
  event.flags = flags
  event.location = point
  event.setIntegerValueField(.mouseEventButtonNumber, value: button.number)
  event.setIntegerValueField(.mouseEventSubtype, value: 3)
  stampWindow(event, id: window.windowID, frame: window.windowFrame, point: point, windowIDField: false)
  return event
}

/// Aims an event at a window: its id in fields 91 and 92 (and 51 when `windowIDField`, a scroll's), and the point in the
/// window's own coordinates through the private CGEventSetWindowLocation (unflipped, F does not say when the vendor's
/// flipped case applies). Nothing without a window id.
func stampWindow(_ event: CGEvent, id: CGWindowID?, frame: CGRect?, point: CGPoint, windowIDField: Bool) {
  guard let id else { return }
  if windowIDField { event.setIntegerValueField(eventField(51), value: Int64(id)) }
  event.setIntegerValueField(eventField(91), value: Int64(id))
  event.setIntegerValueField(eventField(92), value: Int64(id))
  if let frame { setWindowLocation?(event, CGPoint(x: point.x - frame.minX, y: point.y - frame.minY)) }
}

/// Posts `events` to `pid` back to back, each stamped with the current time, through `post` (route 3's seam passes its
/// own). Returns the Unix milliseconds of the first and last post.
func postToProcess(_ events: [CGEvent], pid: pid_t, post: (CGEvent, pid_t) -> Void = { $0.postToPid($1) }) -> (startedAt: Int64, endedAt: Int64) {
  let startedAt = unixMilliseconds()
  for event in events {
    event.timestamp = DispatchTime.now().uptimeNanoseconds
    post(event, pid)
  }
  return (startedAt, unixMilliseconds())
}
