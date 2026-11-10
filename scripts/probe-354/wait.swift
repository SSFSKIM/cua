// Runner-only, calibration-dependent candidates. Not a general implementation of key/undo confirmation.
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
  let wantedValue = args["spike354Value"] as? String
  let wantedRange = args["spike354Range"] as? [Int]
  // Missing focused AX calibration is unconfirmable, never a vacuously matching predicate.
  if waitKey && (wantedValue == nil || wantedRange?.count != 2) {
    return ["ms": Date().timeIntervalSince1970 * 1000 - start, "active": true, "reads": 0,
            "confirmed": false, "status": "keyUnconfirmed", "reason": "calibratedAXOracleUnavailable",
            "oracleAvailable": false, "budgetMs": 1000, "budgetKind": "soft-plus-per-AX-timeout", "overrunMs": 0]
  }
  var reads = 0, value: String?, selected: [Int]?, seenRole: String?, matched = false
  AXUIElementSetMessagingTimeout(application, 0.1)
  repeat {
    reads += 1
    value = nil; selected = nil; seenRole = nil
    if let field = elementAttribute(application, kAXFocusedUIElementAttribute) {
      AXUIElementSetMessagingTimeout(field, 0.1)
      seenRole = attribute(field, kAXRoleAttribute) as? String
      value = attribute(field, kAXValueAttribute) as? String
      if let raw = attribute(field, kAXSelectedTextRangeAttribute), CFGetTypeID(raw) == AXValueGetTypeID() {
        var range = CFRange()
        if AXValueGetValue(raw as! AXValue, .cfRange, &range) { selected = [range.location, range.length] }
      }
    }
    if noop { break }
    if waitText { matched = value?.contains(text!) == true }
    else { matched = value == wantedValue && selected == wantedRange }
    if matched { break }
    usleep(5000)
  } while Date().timeIntervalSince1970 * 1000 - start < 1000
  let elapsed = Date().timeIntervalSince1970 * 1000 - start
  return ["ms": elapsed, "active": true, "reads": reads,
          "confirmed": noop ? NSNull() : matched as Any,
          "readCompleted": true, "readable": value != nil && selected != nil,
          "status": noop ? "readCompleted" : (matched ? "confirmed" : (isKey ? "keyUnconfirmed" : "typeUnconfirmed")),
          "oracleAvailable": waitKey ? true as Any : NSNull(),
          "budgetMs": 1000, "budgetKind": "soft-plus-per-AX-timeout", "perAXTimeoutMs": 100,
          "overrunMs": max(0, elapsed - 1000),
          "value": value as Any? ?? NSNull(), "selected": selected as Any? ?? NSNull(), "role": seenRole as Any? ?? NSNull()]
}
