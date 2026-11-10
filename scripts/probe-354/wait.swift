// Runner-only candidate timing and effect oracle. Not product implementation.
import Foundation
import ApplicationServices

func spike354Wait(_ args: [String: Any], application: AXUIElement, text: String?) -> [String: Any] {
  let mode = args["spike354Mode"] as? String ?? "baseline"
  let start = Date().timeIntervalSince1970 * 1000
  let isKey = text == nil
  let noop = mode == "ax-noop"
  let waitKey = isKey && (mode == "key-effect" || mode == "combined")
  let waitText = !isKey && (mode == "typed" || mode == "combined")
  if !noop && !waitKey && !waitText { return ["ms": 0, "active": false] }
  var reads = 0, value: String?, selected: [Int]?, seenRole: String?, matched = false
  let wantedValue = args["spike354Value"] as? String
  let wantedRange = args["spike354Range"] as? [Int]
  repeat {
    reads += 1
    if let field = elementAttribute(application, kAXFocusedUIElementAttribute) {
      seenRole = attribute(field, kAXRoleAttribute) as? String
      value = attribute(field, kAXValueAttribute) as? String
      if let raw = attribute(field, kAXSelectedTextRangeAttribute), CFGetTypeID(raw) == AXValueGetTypeID() {
        var range = CFRange()
        if AXValueGetValue(raw as! AXValue, .cfRange, &range) { selected = [range.location, range.length] }
      }
    }
    if noop { matched = true; break }
    if waitText { matched = value?.contains(text!) == true }
    else { matched = (wantedValue == nil || value == wantedValue) && (wantedRange == nil || selected == wantedRange) }
    if matched { break }
    usleep(5000)
  } while Date().timeIntervalSince1970 * 1000 - start < 1000
  return ["ms": Date().timeIntervalSince1970 * 1000 - start, "active": true, "reads": reads,
          "confirmed": matched, "status": matched ? "confirmed" : (isKey ? "keyUnconfirmed" : "typeUnconfirmed"),
          "value": value as Any? ?? NSNull(), "selected": selected as Any? ?? NSNull(), "role": seenRole as Any? ?? NSNull()]
}
