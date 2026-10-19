import ApplicationServices
import Foundation

// Thin helpers over the Accessibility API. Every element the engine touches gets a 1 s messaging timeout (a timeout set
// on the application element does not reach its descendants), so a hung app costs a bounded wait per call.

let elementMessagingTimeout: Float = 1.0

func prepare(_ element: AXUIElement) -> AXUIElement {
  AXUIElementSetMessagingTimeout(element, elementMessagingTimeout)
  return element
}

func copyAttribute(_ element: AXUIElement, _ attribute: String) -> (value: CFTypeRef?, error: AXError) {
  var value: CFTypeRef?
  let error = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
  return (error == .success ? value : nil, error)
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? { copyAttribute(element, name).value }

func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
  guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  return prepare(value as! AXUIElement)
}

func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
  guard let value = attribute(element, name), CFGetTypeID(value) == CFStringGetTypeID() else { return nil }
  return (value as! String)
}

func pid(of element: AXUIElement) -> pid_t {
  var pid: pid_t = 0
  AXUIElementGetPid(element, &pid)
  return pid
}

/// A value from a batched fetch: nil for the error placeholders AXUIElementCopyMultipleAttributeValues puts in the
/// slot of an attribute the element lacks.
func present(_ value: Any?) -> CFTypeRef? {
  guard let value else { return nil }
  let ref = value as CFTypeRef
  if CFGetTypeID(ref) == AXValueGetTypeID(), AXValueGetType(ref as! AXValue) == .axError { return nil }
  if CFGetTypeID(ref) == CFNullGetTypeID() { return nil }
  return ref
}

/// The elements of an AXChildren value (an empty list for anything else).
func elementList(_ value: CFTypeRef?) -> [AXUIElement] {
  guard let value, CFGetTypeID(value) == CFArrayGetTypeID() else { return [] }
  return (value as! [AnyObject]).compactMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
}

func point(_ value: CFTypeRef?) -> CGPoint? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
  var point = CGPoint.zero
  return AXValueGetValue(value as! AXValue, .cgPoint, &point) ? point : nil
}

func size(_ value: CFTypeRef?) -> CGSize? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
  var size = CGSize.zero
  return AXValueGetValue(value as! AXValue, .cgSize, &size) ? size : nil
}

func bool(_ value: CFTypeRef?) -> Bool? {
  guard let value else { return nil }
  if CFGetTypeID(value) == CFBooleanGetTypeID() { return CFBooleanGetValue((value as! CFBoolean)) }
  if CFGetTypeID(value) == CFNumberGetTypeID() { return (value as! NSNumber).intValue != 0 }
  return nil
}

func frame(of element: AXUIElement) -> CGRect? {
  guard let origin = point(attribute(element, kAXPositionAttribute)), let extent = size(attribute(element, kAXSizeAttribute)) else { return nil }
  return CGRect(origin: origin, size: extent)
}

func rectWire(_ rect: CGRect?) -> Any {
  guard let rect else { return NSNull() }
  return ["x": Double(rect.origin.x), "y": Double(rect.origin.y), "width": Double(rect.size.width), "height": Double(rect.size.height)]
}

/// The longest a string value runs in a Skyshot: longer ones are cut and marked.
let maxValueLength = 10_000
let truncatedSuffix = "[truncated]"

/// Cuts `text` to `maxValueLength` UTF-16 units without splitting a surrogate pair, marking the cut.
func bounded(_ text: String) -> String {
  let units = text.utf16
  guard units.count > maxValueLength else { return text }
  var end = units.index(units.startIndex, offsetBy: maxValueLength)
  if UTF16.isTrailSurrogate(units[end]) { end = units.index(before: end) }
  return String(text[..<end]) + truncatedSuffix
}

/// A JSON scalar for an attribute value: strings bounded, numbers and booleans as they are, URLs as their absolute
/// string; anything else (points, ranges, elements) has no text form here and is null.
func scalar(_ value: CFTypeRef?) -> Any? {
  guard let value else { return nil }
  let type = CFGetTypeID(value)
  if type == CFStringGetTypeID() { return bounded(value as! String) }
  if type == CFBooleanGetTypeID() { return CFBooleanGetValue((value as! CFBoolean)) }
  if type == CFNumberGetTypeID() {
    let number = value as! NSNumber
    if CFNumberIsFloatType((value as! CFNumber)) {
      let double = number.doubleValue
      return double.isFinite ? double : nil
    }
    return number.int64Value
  }
  if type == CFURLGetTypeID() { return bounded((value as! URL).absoluteString) }
  if type == CFAttributedStringGetTypeID() { return bounded((value as! NSAttributedString).string) }
  return nil
}

/// The pseudo-identity of an element handle for dictionaries: CFEqual and CFHash, as the lineage table compares them.
struct ElementKey: Hashable {
  let element: AXUIElement
  static func == (a: ElementKey, b: ElementKey) -> Bool { CFEqual(a.element, b.element) }
  func hash(into hasher: inout Hasher) { hasher.combine(CFHash(element)) }
}

/// `_AXUIElementGetWindow`, the window number of a window element: SPI, resolved with dlsym and feature-detected; nil
/// when absent, and the caller then matches the window list by owner and bounds.
private typealias GetWindowFunction = @convention(c) (AXUIElement, UnsafeMutablePointer<CGWindowID>) -> AXError
private let getWindowFunction: GetWindowFunction? = {
  guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "_AXUIElementGetWindow") else { return nil }
  return unsafeBitCast(symbol, to: GetWindowFunction.self)
}()

func windowNumber(of window: AXUIElement, pid: pid_t, frame: CGRect?) -> CGWindowID? {
  if let getWindowFunction {
    var id: CGWindowID = 0
    if getWindowFunction(window, &id) == .success, id != 0 { return id }
  }
  guard let frame, let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
  else { return nil }
  for info in list where (info[kCGWindowOwnerPID as String] as? Int).map(pid_t.init) == pid && (info[kCGWindowLayer as String] as? Int) == 0 {
    guard let bounds = info[kCGWindowBounds as String] as? NSDictionary, let rect = CGRect(dictionaryRepresentation: bounds) else { continue }
    if abs(rect.minX - frame.minX) < 1 && abs(rect.minY - frame.minY) < 1 && abs(rect.width - frame.width) < 1 && abs(rect.height - frame.height) < 1 {
      return (info[kCGWindowNumber as String] as? Int).map { CGWindowID($0) }
    }
  }
  return nil
}
