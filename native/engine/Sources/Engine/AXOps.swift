import ApplicationServices
import Foundation

// The Accessibility calls M2a's element methods make (set_value, select_text, perform_secondary_action, the scroll into
// view and the menu-bar record), as one replaceable set: the live API by default, a fake tree in the unit tests, so
// their sequencing is tested without reaching any process.

struct AXOps {
  var role: (AXUIElement) -> String? = { stringAttribute($0, kAXRoleAttribute) }
  var subrole: (AXUIElement) -> String? = { stringAttribute($0, kAXSubroleAttribute) }
  /// One batched read of the named attributes (`fetchAttributes`), what `guardedRead` requests through (#405).
  var batch: (AXUIElement, [String]) -> AttributeRead? = { fetchAttributes($0, $1) }
  /// The element's frame read now (never the observed one).
  var frame: (AXUIElement) -> CGRect? = liveFrame
  var parent: (AXUIElement) -> AXUIElement? = { elementAttribute($0, kAXParentAttribute) }
  var children: (AXUIElement) -> [AXUIElement] = { elementList(attribute($0, kAXChildrenAttribute)).map(prepare) }
  /// The element's children, nil when the read failed (no value or an unsupported attribute is an empty list), for a
  /// reading that must tell "none" from "unknown" (MenuConfirm.swift's baseline).
  var childrenRead: (AXUIElement) -> [AXUIElement]? = { element in
    let (value, error) = copyAttribute(element, kAXChildrenAttribute)
    if error == .noValue || error == .attributeUnsupported { return [] }
    return error == .success ? elementList(value).map(prepare) : nil
  }
  /// The application's focused element: `readable` false when the read failed, element nil when there is none.
  var focusedElement: (AXUIElement) -> (element: AXUIElement?, readable: Bool) = { application in
    let (value, error) = copyAttribute(application, kAXFocusedUIElementAttribute)
    if error == .noValue || error == .attributeUnsupported { return (nil, true) }
    guard error == .success, let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return (nil, false) }
    return (prepare(value as! AXUIElement), true)
  }
  var actions: (AXUIElement) -> [String] = actionNames(of:)
  var read: (AXUIElement, String) -> CFTypeRef? = { attribute($0, $1) }
  /// An attribute's element value (a scroll area's bars and contents).
  var element: (AXUIElement, String) -> AXUIElement? = { elementAttribute($0, $1) }
  /// Whether the attribute is supported and settable (AXUIElementIsAttributeSettable succeeded and said yes).
  var isSettable: (AXUIElement, String) -> Bool = { element, name in
    var flag = DarwinBoolean(false)
    return AXUIElementIsAttributeSettable(element, name as CFString, &flag) == .success && flag.boolValue
  }
  var write: (AXUIElement, String, CFTypeRef) -> AXError = gatedWrite
  var perform: (AXUIElement, String) -> AXError = gatedPerform
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
