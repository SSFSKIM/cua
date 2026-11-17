import AppKit
import ApplicationServices
import Foundation
import Darwin

// Independent of cua: AX geometry/visibility, CG window lists, NSWorkspace and WindowServer Spaces.
guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { fputs("hosted runners only\n",stderr); exit(2) }
@_silgen_name("_AXUIElementGetWindow") func windowNumber(_ element: AXUIElement, _ number: UnsafeMutablePointer<CGWindowID>) -> AXError
let sky = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY)!
func symbol<T>(_ name: String, _: T.Type) -> T? { dlsym(sky, name).map { unsafeBitCast($0, to: T.self) } }
let connection = symbol("CGSMainConnectionID", (@convention(c) () -> Int32).self)?() ?? 0
let active = symbol("CGSGetActiveSpace", (@convention(c) (Int32) -> UInt64).self)
let managed = symbol("CGSCopyManagedDisplaySpaces", (@convention(c) (Int32) -> Unmanaged<CFArray>?).self)
let spaces = symbol("CGSCopySpacesForWindows", (@convention(c) (Int32, Int32, CFArray) -> Unmanaged<CFArray>?).self)
let rawArgs = Array(CommandLine.arguments.dropFirst())
let selectedNumber = rawArgs.first(where: { $0.hasPrefix("--window=") }).flatMap { UInt32($0.dropFirst(9)) }
let args = rawArgs.filter { !$0.hasPrefix("--window=") }
func attr(_ e: AXUIElement, _ key: String) -> CFTypeRef? { var v: CFTypeRef?; return AXUIElementCopyAttributeValue(e, key as CFString, &v) == .success ? v : nil }
func windows(_ pid: pid_t) -> [AXUIElement] { attr(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement] ?? [] }
func selectedWindow(_ pid: pid_t) -> AXUIElement? {
  let ws = windows(pid)
  guard let selectedNumber else { return ws.first }
  return ws.first { w in var n: CGWindowID = 0; return windowNumber(w,&n) == .success && n == selectedNumber }
}
func rect(_ r: CGRect) -> [String: Double] { ["x":r.origin.x,"y":r.origin.y,"width":r.size.width,"height":r.size.height] }
func usable(_ r: CGRect) -> Bool { [r.origin.x,r.origin.y,r.size.width,r.size.height].allSatisfy { $0.isFinite } && r.size.width >= 1 && r.size.height >= 1 }
func frame(_ w: AXUIElement) -> CGRect? {
  guard let p = attr(w,kAXPositionAttribute), let s = attr(w,kAXSizeAttribute), CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
  var pt = CGPoint.zero; var sz = CGSize.zero
  guard AXValueGetValue(p as! AXValue,.cgPoint,&pt), AXValueGetValue(s as! AXValue,.cgSize,&sz) else { return nil }
  let r = CGRect(origin:pt,size:sz)
  return usable(r) ? r : nil
}
func cgBounds(_ info: [String: Any]?) -> [String: Double]? {
  guard let b=info?[kCGWindowBounds as String] as? [String: Any], let x=b["X"] as? NSNumber, let y=b["Y"] as? NSNumber,
        let width=b["Width"] as? NSNumber, let height=b["Height"] as? NSNumber else { return nil }
  let r=CGRect(x:x.doubleValue,y:y.doubleValue,width:width.doubleValue,height:height.doubleValue)
  return usable(r) ? rect(r) : nil
}
func info(_ pid: pid_t) -> [String: Any] {
  let app = AXUIElementCreateApplication(pid), ws = windows(pid)
  let allReadAt=Date().timeIntervalSince1970
  let all = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]]
  let onReadAt=Date().timeIntervalSince1970
  let on = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]
  let top = NSScreen.screens.first?.frame.maxY ?? 0
  let screens = NSScreen.screens.map { CGRect(x:$0.frame.minX,y:top-$0.frame.maxY,width:$0.frame.width,height:$0.frame.height) }
  let screensKnown = !screens.isEmpty && screens.allSatisfy(usable)
  let front = NSWorkspace.shared.frontmostApplication
  let rows: [[String: Any]] = ws.map { w in
    var n: CGWindowID = 0; let numberResult = windowNumber(w,&n), numberKnown = numberResult == .success && n > 0
    let f = frame(w)
    let cg = numberKnown ? all?.first { ($0[kCGWindowNumber as String] as? UInt32) == n } : nil
    let overlap: Bool? = screensKnown ? f.map { f in screens.contains { let r=$0.intersection(f); return !r.isNull && r.width>0 && r.height>0 } } : nil
    let onscreen: Bool? = numberKnown ? on.map { list in list.contains { ($0[kCGWindowNumber as String] as? UInt32)==n } } : nil
    return ["number": n, "numberResult":numberResult.rawValue, "title":attr(w,kAXTitleAttribute) as? String ?? "", "frame":f.map(rect) as Any? ?? NSNull(),
      "overlapsDisplay":overlap as Any? ?? NSNull(), "geometryStatus":f == nil ? "unknown-frame" : screensKnown ? "known" : "unknown-screens",
      "minimized":attr(w,kAXMinimizedAttribute) ?? NSNull(),"fullScreen":attr(w,"AXFullScreen") ?? NSNull(),
      "cg":cg ?? [:], "cgWindowFound":cg != nil, "cgOnscreen":cg.map { $0[kCGWindowIsOnscreen as String] as? Bool ?? false } as Any? ?? NSNull(),
      "inOnscreenList":onscreen as Any? ?? NSNull(),
      "spaces":numberKnown ? (spaces?(connection,7,[NSNumber(value:n)] as CFArray)?.takeRetainedValue() as Any? ?? NSNull()) : NSNull()]
  }
  // Query the cached window number even if the app's AXWindows vanishes on another Space. Keep AX absence intact.
  let pinnedNumber=selectedNumber ?? (rows.first?["number"] as? UInt32)
  var pinned: [String: Any]? = nil
  if let n=pinnedNumber, n>0 {
    let listed=all?.first { ($0[kCGWindowNumber as String] as? UInt32)==n }
    let includingReadAt=Date().timeIntervalSince1970
    let includingList=CGWindowListCopyWindowInfo([.optionIncludingWindow],n) as? [[String: Any]]
    let exact=includingList?.first { ($0[kCGWindowNumber as String] as? UInt32)==n }
    let owner=(exact ?? listed)?[kCGWindowOwnerPID as String] as? Int
    let exactBounds=cgBounds(exact), bounds=exactBounds ?? cgBounds(listed)
    pinned=["number":n,"ownerPid":owner as Any? ?? NSNull(),"ownerMatches":owner==Int(pid),"cgWindowFound":exact != nil || listed != nil,
      "allCG":listed ?? [:],"allCGOnscreen":listed.map { $0[kCGWindowIsOnscreen as String] as? Bool ?? false } as Any? ?? NSNull(),
      "includingCG":exact ?? [:],"includingCGOnscreen":exact.map { $0[kCGWindowIsOnscreen as String] as? Bool ?? false } as Any? ?? NSNull(),
      "includingListRead":includingList != nil,"allReadAt":allReadAt,"includingReadAt":includingReadAt,"onScreenListReadAt":onReadAt,
      "inOnscreenList":on.map { list in list.contains { ($0[kCGWindowNumber as String] as? UInt32)==n } } as Any? ?? NSNull(),
      "spaces":spaces?(connection,7,[NSNumber(value:n)] as CFArray)?.takeRetainedValue() as Any? ?? NSNull(),
      "cgBounds":bounds as Any? ?? NSNull(),"cgBoundsSource":bounds == nil ? "unknown" : exactBounds != nil ? "optionIncludingWindow" : "optionAll",
      "axWindowAvailable":rows.contains { ($0["number"] as? UInt32)==n && ($0["numberResult"] as? Int32)==0 }]
  }
  return ["at":Date().timeIntervalSince1970,"pid":pid,"selectedWindowNumber":pinnedNumber as Any? ?? NSNull(),"pinnedWindowServer":pinned as Any? ?? NSNull(),
    "hidden":attr(app,kAXHiddenAttribute) ?? NSNull(),"windows":rows,"screens":screens.map(rect),"screensKnown":screensKnown,
    "frontmost":["pid":front?.processIdentifier ?? 0,"bundleId":front?.bundleIdentifier ?? ""],
    "activeSpace":active?(connection) as Any? ?? NSNull(),"managedDisplaySpaces":managed?(connection)?.takeRetainedValue() as Any? ?? NSNull(),
    "symbols":["active":active != nil,"managed":managed != nil,"windowSpaces":spaces != nil]]
}
func set(_ w: AXUIElement,_ key: String,_ value: CFTypeRef) -> Int32 { AXUIElementSetAttributeValue(w,key as CFString,value).rawValue }

// Mission Control belongs to Dock. A bounded independent walk retains every discovered label/action and all AX errors.
// It never infers that macOS cannot create Spaces from opening Mission Control alone.
func desktopControl(_ ordinal: Int?) -> [String: Any] {
  guard let dock = NSRunningApplication.runningApplications(withBundleIdentifier:"com.apple.dock").first else { return ["blocker":"Dock process absent"] }
  var queue = [AXUIElementCreateApplication(dock.processIdentifier)], seen = Set<CFHashCode>(), visited = 0
  var nodes: [[String: Any]] = [], candidates: [AXUIElement] = [], candidateIndexes: [Int] = [], errors: [String: Int] = [:]
  let deadline = ProcessInfo.processInfo.systemUptime + 4
  func note(_ name: String,_ error: AXError) { if error != .success && error != .attributeUnsupported && error != .noValue { errors[name+":"+String(error.rawValue),default:0] += 1 } }
  while !queue.isEmpty && visited < 1200 && ProcessInfo.processInfo.systemUptime < deadline {
    let e = queue.removeFirst(); visited += 1
    if !seen.insert(CFHash(e)).inserted { continue }
    AXUIElementSetMessagingTimeout(e,0.08)
    func read(_ name: String) -> CFTypeRef? { var v: CFTypeRef?; let error=AXUIElementCopyAttributeValue(e,name as CFString,&v);note(name,error);return error == .success ? v : nil }
    func text(_ name: String) -> String { String((read(name) as? String ?? "").prefix(300)) }
    let role=text(kAXRoleAttribute), title=text(kAXTitleAttribute), description=text(kAXDescriptionAttribute), identifier=text(kAXIdentifierAttribute)
    var actionNames: CFArray?; let actionError=AXUIElementCopyActionNames(e,&actionNames);note("actions",actionError)
    let actions=actionNames as? [String] ?? [], labels=[title,description,identifier].map { $0.lowercased() }
    let matches: Bool
    if let ordinal {
      matches=labels.contains { $0 == "desktop \(ordinal)" || $0.hasPrefix("desktop \(ordinal),") || $0.hasPrefix("desktop \(ordinal) ") }
        && !labels.contains { $0.contains("remove") }
    } else {
      matches=labels.contains { $0.contains("add desktop") || $0.contains("new desktop") || $0 == "mc.spaces.add" }
    }
    nodes.append(["role":role,"title":title,"description":description,"identifier":identifier,"actions":actions])
    if matches && actions.contains(kAXPressAction) { candidates.append(e);candidateIndexes.append(nodes.count-1) }
    if let children=read(kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf:children) }
  }
  var result: [String: Any] = ["dockPid":dock.processIdentifier,"visited":visited,"complete":queue.isEmpty,"nodes":nodes,"errors":errors,"candidateIndexes":candidateIndexes,
    "request":ordinal.map { "select Desktop \($0)" } ?? "add desktop", "axPressResult":NSNull()]
  if candidates.count == 1 { result["axPressResult"]=AXUIElementPerformAction(candidates[0],kAXPressAction as CFString).rawValue }
  else { result["blocker"]=candidates.isEmpty ? "No matching AXPress control exposed in the bounded Dock walk" : "Ambiguous Dock desktop controls; none pressed" }
  return result
}

var result: [String: Any] = [:]
if args.first == "preflight" {
  // No request APIs, consent dialogs, or settings changes: these checks only read the current authorization state.
  result=["at":Date().timeIntervalSince1970,"pid":getpid(),"accessibility":AXIsProcessTrusted(),"screenRecording":CGPreflightScreenCaptureAccess(),
    "canPostHid":CGPreflightPostEventAccess(),"inputMonitoring":CGPreflightListenEventAccess()]
} else if args.first == "add-desktop" || args.first == "select-desktop" {
  result=desktopControl(args.first == "select-desktop" ? Int(args[1]) : nil)
} else if args.first == "find" {
  result = ["apps":NSRunningApplication.runningApplications(withBundleIdentifier:args[1]).map { ["pid":$0.processIdentifier,"path":$0.bundleURL?.path ?? ""] }]
} else if ["switch-left","switch-right","mission-control"].contains(args.first ?? "") {
  // The plan's System Events route, not a flags-only CGEvent pair (which did nothing on the hosted image).
  let code = args[0] == "switch-left" ? 123 : args[0] == "switch-right" ? 124 : 126
  let script = "with timeout of 3 seconds\n tell application \"System Events\" to key code \(code) using control down\nend timeout"
  let task=Process(), output=Pipe(), errors=Pipe()
  task.executableURL=URL(fileURLWithPath:"/usr/bin/osascript");task.arguments=["-e",script]
  task.standardOutput=output;task.standardError=errors
  result=["requested":args[0],"mechanism":"osascript/System Events key code","keyCode":code,"modifiers":["control"],"script":script,"posted":NSNull()]
  do {
    try task.run()
    let deadline=ProcessInfo.processInfo.systemUptime+6
    while task.isRunning && ProcessInfo.processInfo.systemUptime<deadline { Thread.sleep(forTimeInterval:0.05) }
    let timedOut=task.isRunning
    if timedOut {
      task.terminate()
      let grace=ProcessInfo.processInfo.systemUptime+0.5
      while task.isRunning && ProcessInfo.processInfo.systemUptime<grace { Thread.sleep(forTimeInterval:0.05) }
      if task.isRunning { kill(task.processIdentifier,SIGKILL) }
    }
    task.waitUntilExit()
    result["exitCode"]=task.terminationStatus;result["timedOut"]=timedOut
    result["stdout"]=String(data:output.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
    result["stderr"]=String(data:errors.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
    if !timedOut && task.terminationStatus==0 { result["posted"]=args[0] }
  } catch { result["launchError"]=error.localizedDescription }
} else if args.first == "escape" {
  for down in [true,false] { CGEvent(keyboardEventSource:nil,virtualKey:53,keyDown:down)?.post(tap:.cghidEventTap) }
  result=["posted":"escape","mechanism":"CGEvent"]
} else if args.first == "activate" {
  let a=NSRunningApplication.runningApplications(withBundleIdentifier:args[1]).first
  result=["activated":a?.activate(options:[]) ?? false]
} else if args.count >= 2, let pid = pid_t(args[1]) {
  if args[0] == "info" { result=info(pid) }
  else if args[0] == "hide" { result=["success":NSRunningApplication(processIdentifier:pid)?.hide() ?? false] }
  else if args[0] == "unhide" { result=["success":NSRunningApplication(processIdentifier:pid)?.unhide() ?? false] }
  else if let w=selectedWindow(pid) {
    switch args[0] {
    case "move": var p=CGPoint(x:Double(args[2])!,y:Double(args[3])!); result=["axResult":set(w,kAXPositionAttribute,AXValueCreate(.cgPoint,&p)!)]
    case "size": var s=CGSize(width:Double(args[2])!,height:Double(args[3])!); result=["axResult":set(w,kAXSizeAttribute,AXValueCreate(.cgSize,&s)!)]
    case "fullscreen": result=["axResult":set(w,"AXFullScreen",args[2]=="true" ? kCFBooleanTrue : kCFBooleanFalse)]
    case "cg-cost":
      var n: CGWindowID = 0; let numberResult=windowNumber(w,&n)
      var samples: [[String: Any]] = []
      if numberResult == .success && n > 0 {
        for _ in 0..<20 {
          let start=DispatchTime.now().uptimeNanoseconds
          let list=CGWindowListCopyWindowInfo([.optionIncludingWindow],n) as? [[String: Any]]
          let elapsed=Double(DispatchTime.now().uptimeNanoseconds-start)/1_000_000
          let cg=list?.first { ($0[kCGWindowNumber as String] as? UInt32)==n }
          samples.append(["elapsedMs":elapsed,"found":cg != nil,"onscreen":cg.map { $0[kCGWindowIsOnscreen as String] as? Bool ?? false } as Any? ?? NSNull()])
        }
      }
      result=["number":n,"numberResult":numberResult.rawValue,"samples":samples,"read":"CGWindowListCopyWindowInfo(.optionIncludingWindow)"]
    default: result=["error":"unknown command"]
    }
  } else { result=["error":"pinned AX window unavailable"] }
} else { result=["error":"missing command or PID"] }
let data=try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys])
print(String(data:data,encoding:.utf8)!)
