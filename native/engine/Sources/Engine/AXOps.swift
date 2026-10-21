import ApplicationServices
import Foundation

// The Accessibility calls M2a's element methods make (set_value, select_text, perform_secondary_action, the scroll into
// view and the menu-bar record), as one replaceable set: the live API by default, a fake tree in the unit tests, so
// their sequencing is tested without reaching any process.

struct AXOps {
  var role: (AXUIElement) -> String? = { stringAttribute($0, kAXRoleAttribute) }
  var subrole: (AXUIElement) -> String? = { stringAttribute($0, kAXSubroleAttribute) }
  /// The element's frame read now (never the observed one).
  var frame: (AXUIElement) -> CGRect? = liveFrame
  var parent: (AXUIElement) -> AXUIElement? = { elementAttribute($0, kAXParentAttribute) }
  var children: (AXUIElement) -> [AXUIElement] = { elementList(attribute($0, kAXChildrenAttribute)).map(prepare) }
  var actions: (AXUIElement) -> [String] = actionNames(of:)
  var read: (AXUIElement, String) -> CFTypeRef? = { attribute($0, $1) }
  /// An attribute's element value (a scroll area's bars and contents).
  var element: (AXUIElement, String) -> AXUIElement? = { elementAttribute($0, $1) }
  /// Whether the attribute is supported and settable (AXUIElementIsAttributeSettable succeeded and said yes).
  var isSettable: (AXUIElement, String) -> Bool = { element, name in
    var flag = DarwinBoolean(false)
    return AXUIElementIsAttributeSettable(element, name as CFString, &flag) == .success && flag.boolValue
  }
  var write: (AXUIElement, String, CFTypeRef) -> AXError = { AXUIElementSetAttributeValue($0, $1 as CFString, $2) }
  var perform: (AXUIElement, String) -> AXError = { AXUIElementPerformAction($0, $1 as CFString) }
  /// The system's description of an action (AXUIElementCopyActionDescription); nil when it gives none.
  var describe: (AXUIElement, String) -> String? = { element, action in
    var description: CFString?
    guard AXUIElementCopyActionDescription(element, action as CFString, &description) == .success, let description else { return nil }
    return description as String
  }
  var same: (AXUIElement, AXUIElement) -> Bool = { CFEqual($0, $1) }
  var now: () -> Double = monotonicMilliseconds
  var sleep: (Double) -> Void = { usleep(UInt32(max(0, $0) * 1000)) }

  static var live: AXOps { AXOps() }

  /// The part of the element that shows (Routes.swift's visible-frame walk) through these calls.
  func visible(_ element: AXUIElement) -> CGRect? {
    visibleFrame(of: element, frame: frame, role: role, parent: parent, actions: actions)
  }
}

/// The live frame read, reachable from the property above, whose name shadows `frame(of:)` inside the struct.
private func liveFrame(_ element: AXUIElement) -> CGRect? { frame(of: element) }
