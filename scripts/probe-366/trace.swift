import AppKit
import ApplicationServices
import Foundation

// This file exists only in a runner's detached source tree. Logging does no AX read of its own.
nonisolated var spike366Variant: String { Thread.current.threadDictionary["probe366Variant"] as? String ?? "main" }
nonisolated var spike366InertPoint: CGPoint? {
  guard let p = Thread.current.threadDictionary["probe366InertPoint"] as? [Double], p.count == 2 else { return nil }
  return CGPoint(x: p[0], y: p[1])
}
func spike366Scope(_ args: [String: Any]) -> () -> Void {
  Thread.current.threadDictionary["probe366Variant"] = args["probe366Variant"] as? String ?? "main"
  Thread.current.threadDictionary["probe366Id"] = args["probe366Id"] as? String ?? "unknown"
  if let p = args["probe366InertPoint"] as? [NSNumber], p.count == 2 {
    Thread.current.threadDictionary["probe366InertPoint"] = p.map { $0.doubleValue }
  }
  spike366Log("scope.begin")
  return {
    spike366Log("scope.end")
    Thread.current.threadDictionary.removeObject(forKey: "probe366Variant")
    Thread.current.threadDictionary.removeObject(forKey: "probe366Id")
    Thread.current.threadDictionary.removeObject(forKey: "probe366InertPoint")
  }
}
func spike366Log(_ kind: String, _ fields: [String: Any] = [:]) {
  var record = fields
  record["at"] = Date().timeIntervalSince1970 * 1000
  record["kind"] = kind
  record["trial"] = Thread.current.threadDictionary["probe366Id"] as? String ?? "outside-action"
  record["variant"] = spike366Variant
  record["frontmostPid"] = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
  if let bytes = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
     let text = String(data: bytes, encoding: .utf8) {
    FileHandle.standardError.write(Data(("PROBE366 " + text + "\n").utf8))
  }
}

// candidate-point:begin
// Pure geometry, shared by the probe carrier and the offline native logic check.
enum Spike366PointError: Error { case missingGeometry, offscreen, unknownVariant }
func spike366CandidatePoint(_ variant: String, window: CGRect?, web: CGRect?, screen: CGRect) throws -> CGPoint? {
  if variant == "main" || variant == "bare" { return nil }
  let region: CGRect
  let point: CGPoint
  if variant == "inert-titlebar" {
    guard let window else { throw Spike366PointError.missingGeometry }
    region = window.intersection(screen)
    point = CGPoint(x: region.minX + region.width * 0.75, y: window.minY + 14)
  } else if variant == "inert-toolbar" {
    guard let web else { throw Spike366PointError.missingGeometry }
    region = web.intersection(screen)
    point = CGPoint(x: region.minX + min(400, region.width / 2), y: web.minY + 22)
  } else { throw Spike366PointError.unknownVariant }
  guard !region.isNull, !region.isEmpty, region.contains(point) else { throw Spike366PointError.offscreen }
  return point
}
// candidate-point:end
func spike366FrameWire(_ r: CGRect?) -> Any {
  guard let r else { return NSNull() }
  return ["x":r.minX,"y":r.minY,"width":r.width,"height":r.height]
}
