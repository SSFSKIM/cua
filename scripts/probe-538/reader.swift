// #538's hosted probe of S (not of record): one reading of the front and key applications and the window order, outside
// either engine. Compiled once by ./probe.mjs (swiftc), run before and after every act; one JSON line out:
//
//   {"at", "front": {pid, bundleId} | null, "key": {pid, bundleId} | null, "axFocused": {pid, bundleId} | null,
//    "axTrusted", "windows": [{ownerPid, ownerName, ownerBundleId, layer, number, bounds}] | null, "displays"}
//
// `front` is NSWorkspace's frontmost application (what the engine's `frontmost()` reads); `key` the window server's key
// focus process (CPSGetKeyFocusProcess, what the engine's `keyFocus()` reads); `axFocused` the system-wide focused
// application by accessibility, read only when this process is trusted (null otherwise). `windows` lists every on-screen
// window front to back at every layer, as ../native-matrix/system-windows.swift does, without window titles.
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

typealias GetKeyFocusProcess = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, UnsafeMutablePointer<DarwinBoolean>) -> Int32
typealias GetProcessPID = @convention(c) (UnsafePointer<ProcessSerialNumber>, UnsafeMutablePointer<pid_t>) -> Int32
let handle = UnsafeMutableRawPointer(bitPattern: -2)
let getKeyFocusProcess = dlsym(handle, "CPSGetKeyFocusProcess").map { unsafeBitCast($0, to: GetKeyFocusProcess.self) }
let getProcessPID = dlsym(handle, "GetProcessPID").map { unsafeBitCast($0, to: GetProcessPID.self) }

func keyFocusPid() -> pid_t? {
  guard let getKeyFocusProcess, let getProcessPID else { return nil }
  var process = ProcessSerialNumber()
  var flag = DarwinBoolean(false)
  guard getKeyFocusProcess(&process, &flag) == 0 else { return nil }
  var pid: pid_t = 0
  return getProcessPID(&process, &pid) == 0 && pid > 0 ? pid : nil
}

func app(_ pid: pid_t?) -> Any {
  guard let pid else { return NSNull() }
  return ["pid": Int(pid), "bundleId": NSRunningApplication(processIdentifier: pid)?.bundleIdentifier ?? NSNull()] as [String: Any]
}

func axFocusedPid() -> pid_t? {
  guard AXIsProcessTrusted() else { return nil }
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(AXUIElementCreateSystemWide(), kAXFocusedApplicationAttribute as CFString, &value) == .success,
        let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  var pid: pid_t = 0
  return AXUIElementGetPid(value as! AXUIElement, &pid) == .success ? pid : nil
}

let now = Int((Date().timeIntervalSince1970 * 1000).rounded())
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
let windows: [[String: Any]]? = list?.compactMap { entry in
  guard let pid = entry[kCGWindowOwnerPID as String] as? Int,
        let number = entry[kCGWindowNumber as String] as? Int,
        let boundsDictionary = entry[kCGWindowBounds as String] as? NSDictionary,
        let bounds = CGRect(dictionaryRepresentation: boundsDictionary as CFDictionary),
        bounds.width > 1, bounds.height > 1,
        (entry[kCGWindowAlpha as String] as? Double ?? 1) > 0 else { return nil }
  return [
    "ownerPid": pid,
    "ownerName": entry[kCGWindowOwnerName as String] as? String ?? NSNull(),
    "ownerBundleId": NSRunningApplication(processIdentifier: pid_t(pid))?.bundleIdentifier ?? NSNull(),
    "layer": entry[kCGWindowLayer as String] as? Int ?? 0,
    "number": number,
    "bounds": ["x": Double(bounds.origin.x), "y": Double(bounds.origin.y), "width": Double(bounds.width), "height": Double(bounds.height)],
  ]
}
var displayCount: UInt32 = 0
var displayIds = [CGDirectDisplayID](repeating: 0, count: 16)
let displays: [[String: Double]]? = CGGetActiveDisplayList(16, &displayIds, &displayCount) == .success && displayCount > 0
  ? displayIds.prefix(Int(displayCount)).map { id in
      let b = CGDisplayBounds(id)
      return ["x": Double(b.origin.x), "y": Double(b.origin.y), "width": Double(b.width), "height": Double(b.height)]
    }
  : nil
let reading: [String: Any] = [
  "at": now,
  "front": app(NSWorkspace.shared.frontmostApplication?.processIdentifier),
  "key": app(keyFocusPid()),
  "axTrusted": AXIsProcessTrusted(),
  "axFocused": app(axFocusedPid()),
  "windows": windows.map { $0 as Any } ?? NSNull(),
  "displays": displays.map { $0 as Any } ?? NSNull(),
]
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: reading, options: [.sortedKeys]))
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
