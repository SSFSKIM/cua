// #282 probe diagnostic: what AX answers at a screen point in a process's first window and in the application, each
// hit's role chain up to its window (the walk the engine's pointerView makes). Usage: hit <pid> <x> <y>; one JSON line.
import ApplicationServices
import Foundation

let args = CommandLine.arguments
guard args.count == 4, let pid = pid_t(args[1]), let x = Float(args[2]), let y = Float(args[3]) else { print("{\"usage\":true}"); exit(2) }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil }
func chain(_ start: AXUIElement?) -> [String] {
  var out: [String] = [], cur = start, n = 0
  while let e = cur, n < 300 {
    let role = attr(e, kAXRoleAttribute) as? String ?? "?"
    out.append(role)
    if ["AXWindow", "AXSheet", "AXApplication"].contains(role) { break }
    cur = attr(e, kAXParentAttribute).map { $0 as! AXUIElement }
    n += 1
  }
  return out
}
func hit(_ e: AXUIElement) -> (String, [String]) {
  var h: AXUIElement?
  let err = AXUIElementCopyElementAtPosition(e, x, y, &h)
  return ("\(err.rawValue)", chain(h))
}
let app = AXUIElementCreateApplication(pid)
let windows = (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
let (we, wc) = windows.first.map(hit) ?? ("noWindow", [])
let (ae, ac) = hit(app)
let out: [String: Any] = ["trusted": AXIsProcessTrusted(), "windows": windows.count, "windowHitError": we, "windowChain": wc, "appHitError": ae, "appChain": ac]
print(String(data: try! JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
