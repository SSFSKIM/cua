// The frame of one control in a harness window, for #200's coordinate click on a plain push button (./raise.mjs case f:
// the Electron fixture's button): an observation carries no element frames, so the kit reads the frame here, through
// Accessibility, and clicks its middle by coordinates. Run as a binary compiled into the harness cache:
//   element-frame <pid> <role> <name>
// The first element of <role> whose title, description or value is <name> in the process's windows (breadth first,
// 4,000 elements at most), its frame in global top-left points. It sets AXManualAccessibility on the app first, as the
// engine's observations do, so a Chromium app has its tree; Chromium builds that tree asynchronously (#200's first live
// check read 13 elements and no button right after setting it), so the walk is retried every 100 ms for up to 3 s. Only
// roles and those three attributes are read. One JSON line out: {"trusted", "found", "frame", "walks"} or {"trusted",
// "found": false, "error", "walks"}. It never asks for a grant: an untrusted terminal answers "not trusted" and reads
// nothing.
import ApplicationServices
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}
let args = CommandLine.arguments
guard args.count == 4, let pid = Int32(args[1]) else { emit(["found": false, "error": "usage: element-frame <pid> <role> <name>"]); exit(2) }
let role = args[2], name = args[3]
guard AXIsProcessTrusted() else { emit(["trusted": false, "found": false, "error": "this terminal is not trusted for Accessibility"]); exit(0) }

func copy(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success ? value : nil
}
func frame(_ element: AXUIElement) -> CGRect? {
  guard let p = copy(element, kAXPositionAttribute), let s = copy(element, kAXSizeAttribute),
        CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
  var origin = CGPoint.zero, size = CGSize.zero
  guard AXValueGetValue(p as! AXValue, .cgPoint, &origin), AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
  return CGRect(origin: origin, size: size)
}
let app = AXUIElementCreateApplication(pid)
AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
let names = [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute]
/// One breadth-first walk of the process's windows: the first match's frame, and how many elements were read.
func walk() -> (frame: CGRect?, visited: Int) {
  var queue = (copy(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
  var visited = 0
  while !queue.isEmpty, visited < 4_000 {
    let element = queue.removeFirst()
    visited += 1
    if copy(element, kAXRoleAttribute) as? String == role, names.contains(where: { copy(element, $0) as? String == name }),
       let r = frame(element) {
      return (r, visited)
    }
    queue.append(contentsOf: (copy(element, kAXChildrenAttribute) as? [AXUIElement]) ?? [])
  }
  return (nil, visited)
}
let retryMs = 100.0, boundMs = 3_000.0
let started = Date()
var walks = 0
while true {
  let (found, visited) = walk()
  walks += 1
  if let r = found {
    emit(["trusted": true, "found": true, "walks": walks, "frame": ["x": Double(r.minX), "y": Double(r.minY), "width": Double(r.width), "height": Double(r.height)]])
    exit(0)
  }
  if Date().timeIntervalSince(started) * 1000 + retryMs > boundMs {
    emit(["trusted": true, "found": false, "walks": walks,
          "error": "no \(role) named \(name) in the process's windows after \(walks) walks over \(Int(boundMs)) ms (\(visited) elements read in the last)"])
    exit(0)
  }
  usleep(useconds_t(retryMs * 1000))
}
