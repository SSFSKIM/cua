// Two value-free Accessibility reads for #187's re-slot (./item-187.mjs) and #259's cell (./item-188.mjs), outside
// either engine. Run as a binary compiled into the harness cache:
//   ax-state window <pid> <x,y,w,h> [<sheet x,y,w,h>]
//       Whether the app and its window at those bounds (global top-left points, the window list's; within 2 pt) hold
//       the key: {"trusted", "ok", "failed", "frontmost", "found", "focused", "main", "focusedWindow", "mainWindow",
//       "focusedWindowElement", "windows", "sheet"?}: the app's AXFrontmost, the matched window's AXFocused (key) and
//       AXMain, whether the app's AXFocusedWindow and AXMainWindow are that window ("run"), another ("other") or none
//       ("none"), the focused one also "sheet" when it is an AXSheet of that window, its AXParent or child (pilot C-4: a sheet
//       on a document is the app's focused window, not the document), the focused window's role, subrole and frame
//       (`focusedWindowElement`, null when there is none, "unread" when AXFocusedWindow's read failed; a sheet's with
//       its AXParent's frame, `parentFrame`), and the count of its AXWindows. `ok` is false, and `failed`
//       names the reads, when a read the answer rests on did not succeed.
//       With sheet bounds, `sheet` says whether the matched window has a child of role AXSheet at them (within 2 pt):
//       the proof that a window-list window Accessibility lists no window for is that window's sheet (null when the
//       window was not matched or its children could not be read, `failed` then naming "sheet").
//   ax-state text <pid> <offset>...
//       The geometry of the app's focused text element: {"trusted", "ok", "failed", "errors", "role", "frame",
//       "characters", "selected", "bounds", "marked"}: its role, frame, character count, selected range, and for each
//       offset the frame of the one character there (AXBoundsForRange), null where it could not be read; `errors` the
//       AXError of each read that failed, by its name in `failed` (#590, ruling 1223); `marked` its marked range,
//       {"range", "rangeError", "marker", "markerLength", "markerError"} (ruling 1229). Numbers and a role only: no
//       text, so its value is never read (its length is the character count).
//   ax-state actions <pid> <x,y,w,h> <role>
//       The actions the first element of <role> under the window at those bounds advertises (#187's premise: whether
//       Chrome's textarea offers AXPress yet): {"trusted", "ok", "failed", "found", "count", "walked", "actions"}: the
//       window found, how many elements of the role the walk met (breadth first, at most 20000 elements and 64 levels),
//       and the first one's action names (AXUIElementCopyActionNames), null when none was met. Names only: no text.
//   ax-state field <pid> <x,y,w,h> <role>
//       The frame of the one element of <role> under the window at those bounds (the matrix's Chrome drag grounds its
//       points on its notes field, ruling 1226): {"trusted", "ok", "failed", "found", "count", "walked", "frame"}: the
//       window found, how many elements of the role the same walk as `actions` met, and the first one's frame (global
//       top-left points, AXPosition and AXSize), null when none was met or it could not be read. Numbers only: no text.
//   ax-state document <pid> <x,y,w,h>
//       Whether the window at those bounds has a document on disk behind it and unsaved edits (#212's unsaved proof,
//       ruling 1221): {"trusted", "ok", "failed", "found", "document", "edited", "editedFrom"}: `document` whether its
//       AXDocument names one (no value is false), `edited` its AXEdited, read on the window, else on its close button
//       (`editedFrom` "window" or "closeButton"). Booleans only: no URL, no title. It reads no folder. More than one
//       window at the bounds (the saved scene document's could be one) reads nothing: `failed` names "ambiguous", with
//       their count (`atBounds`), so no other window's document can answer for the run's.
// It never asks for a grant: an untrusted terminal answers {"trusted": false} and reads nothing.
import ApplicationServices
import Foundation

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}
let args = CommandLine.arguments
guard args.count >= 3, ["window", "text", "actions", "field", "document"].contains(args[1]), let pid = Int32(args[2]) else {
  FileHandle.standardError.write(Data("usage: ax-state window <pid> <x,y,w,h> [<sheet x,y,w,h>] | ax-state text <pid> <offset>... | ax-state actions <pid> <x,y,w,h> <role> | ax-state field <pid> <x,y,w,h> <role> | ax-state document <pid> <x,y,w,h>\n".utf8))
  exit(64)
}
guard AXIsProcessTrusted() else { emit(["trusted": false]); exit(0) }
let app = AXUIElementCreateApplication(pid)
var failed: [String] = []

/// One attribute read: its status and, on success, its value.
func read(_ e: AXUIElement, _ attribute: String) -> (status: AXError, value: CFTypeRef?) {
  var value: CFTypeRef?
  let status = AXUIElementCopyAttributeValue(e, attribute as CFString, &value)
  return (status, status == .success ? value : nil)
}
func element(_ value: CFTypeRef?) -> AXUIElement? {
  guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  return (value as! AXUIElement)
}
func axValue<T>(_ value: CFTypeRef?, _ type: AXValueType, _ empty: T) -> T? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
  var out = empty
  return AXValueGetValue(value as! AXValue, type, &out) ? out : nil
}
func frame(_ e: AXUIElement) -> CGRect? {
  guard let origin = axValue(read(e, kAXPositionAttribute).value, .cgPoint, CGPoint.zero),
        let size = axValue(read(e, kAXSizeAttribute).value, .cgSize, CGSize.zero) else { return nil }
  return CGRect(origin: origin, size: size)
}
func rectWire(_ r: CGRect?) -> Any {
  guard let r else { return NSNull() }
  return ["x": Double(r.minX), "y": Double(r.minY), "width": Double(r.width), "height": Double(r.height)]
}
/// A boolean attribute: its value, or nil with the read named in `failed` (no value is a reading only where noted).
func flag(_ e: AXUIElement, _ attribute: String, _ name: String) -> Bool? {
  let r = read(e, attribute)
  guard r.status == .success, let value = r.value as? Bool else { failed.append(name); return nil }
  return value
}

/// Bounds `x,y,w,h` as a rectangle, nil when they do not parse.
func rect(_ text: String) -> CGRect? {
  let parts = text.split(separator: ",").compactMap { Double($0) }
  return parts.count == 4 ? CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3]) : nil
}
/// Whether an element's frame is `want`, within 2 pt.
func at(_ e: AXUIElement, _ want: CGRect) -> Bool {
  guard let f = frame(e) else { return false }
  let near = { (a: CGFloat, b: CGFloat) in abs(a - b) <= 2 }
  return near(f.minX, want.minX) && near(f.minY, want.minY) && near(f.width, want.width) && near(f.height, want.height)
}
/// The app's windows and the one at `bounds` (global top-left points, within 2 pt); a failed list read is named in
/// `failed`. Nil when the bounds do not parse.
func runWindow(_ bounds: String) -> (windows: [AXUIElement], run: AXUIElement?)? {
  guard let want = rect(bounds) else { return nil }
  let list = read(app, kAXWindowsAttribute)
  let windows = (list.value as? [AXUIElement]) ?? []
  if list.status != .success { failed.append("windows") }
  return (windows, windows.first { at($0, want) })
}

/// The elements of `role` under `root`, breadth first (at most 20000 elements and 64 levels): how many, how many were
/// walked, and the first one met.
func elementsOfRole(_ root: AXUIElement?, _ role: String) -> (count: Int, walked: Int, first: AXUIElement?) {
  var count = 0, walked = 0
  var first: AXUIElement?
  guard let root else { return (0, 0, nil) }
  var level: [AXUIElement] = [root]
  var depth = 0
  while !level.isEmpty, depth < 64, walked < 20_000 {
    var next: [AXUIElement] = []
    for e in level where walked < 20_000 {
      walked += 1
      if read(e, kAXRoleAttribute).value as? String == role { count += 1; if first == nil { first = e } }
      next.append(contentsOf: (read(e, kAXChildrenAttribute).value as? [AXUIElement]) ?? [])
    }
    level = next
    depth += 1
  }
  return (count, walked, first)
}

if args[1] == "field" {
  guard args.count == 5 else { emit(["trusted": true, "ok": false, "failed": ["usage"]]); exit(64) }
  guard let (_, run) = runWindow(args[3]) else { emit(["trusted": true, "ok": false, "failed": ["bounds"]]); exit(64) }
  let (count, walked, first) = elementsOfRole(run, args[4])
  let found = first.flatMap { frame($0) }
  if first != nil && found == nil { failed.append("frame") }
  emit(["trusted": true, "ok": failed.isEmpty && run != nil, "failed": failed, "found": run != nil, "count": count, "walked": walked, "frame": rectWire(found)])
  exit(0)
}

if args[1] == "actions" {
  guard args.count == 5 else { emit(["trusted": true, "ok": false, "failed": ["usage"]]); exit(64) }
  guard let (_, run) = runWindow(args[3]) else { emit(["trusted": true, "ok": false, "failed": ["bounds"]]); exit(64) }
  let (count, walked, first) = elementsOfRole(run, args[4])
  var actions: Any = NSNull()
  if let first {
    var names: CFArray?
    if AXUIElementCopyActionNames(first, &names) == .success { actions = (names as? [String]) ?? [] } else { failed.append("actions") }
  }
  emit(["trusted": true, "ok": failed.isEmpty && run != nil, "failed": failed, "found": run != nil, "count": count, "walked": walked, "actions": actions])
  exit(0)
}

if args[1] == "document" {
  guard args.count == 4 else { emit(["trusted": true, "ok": false, "failed": ["usage"]]); exit(64) }
  guard let (windows, first) = runWindow(args[3]), let want = rect(args[3]) else { emit(["trusted": true, "ok": false, "failed": ["bounds"]]); exit(64) }
  let atBounds = windows.filter { at($0, want) }.count
  if atBounds > 1 { failed.append("ambiguous") }
  let run = atBounds > 1 ? nil : first
  var document: Any = NSNull(), edited: Any = NSNull(), editedFrom: Any = NSNull()
  if let run {
    // A document on disk: AXDocument's URL (a string or a URL), present and non-empty; no value is none.
    let d = read(run, kAXDocumentAttribute)
    if d.status == .noValue || (d.status == .success && d.value == nil) { document = false }
    else if d.status == .success, let s = d.value as? String { document = !s.isEmpty }
    else if d.status == .success, d.value.map({ CFGetTypeID($0) == CFURLGetTypeID() }) == true { document = true }
    else { failed.append("document") }
    // Unsaved edits: AXEdited on the window, else on its close button, which carries the edited mark.
    if let value = read(run, kAXEditedAttribute).value as? Bool { edited = value; editedFrom = "window" }
    else if let button = element(read(run, kAXCloseButtonAttribute).value), let value = read(button, kAXEditedAttribute).value as? Bool { edited = value; editedFrom = "closeButton" }
    else { failed.append("edited") }
  }
  emit(["trusted": true, "ok": failed.isEmpty && run != nil, "failed": failed, "found": first != nil, "atBounds": atBounds, "document": document, "edited": edited, "editedFrom": editedFrom])
  exit(0)
}

/// Whether `sheet` is a sheet of `window`: its AXParent, or one of the window's AXChildren.
func sheetOf(_ sheet: AXUIElement, _ window: AXUIElement) -> Bool {
  if let parent = element(read(sheet, kAXParentAttribute).value), CFEqual(parent, window) { return true }
  return ((read(window, kAXChildrenAttribute).value as? [AXUIElement]) ?? []).contains { CFEqual($0, sheet) }
}

if args[1] == "window" {
  guard args.count == 4 || args.count == 5 else { emit(["trusted": true, "ok": false, "failed": ["usage"]]); exit(64) }
  guard let (windows, run) = runWindow(args[3]) else { emit(["trusted": true, "ok": false, "failed": ["bounds"]]); exit(64) }
  let sheetBounds = args.count == 5 ? rect(args[4]) : nil
  if args.count == 5 && sheetBounds == nil { emit(["trusted": true, "ok": false, "failed": ["bounds"]]); exit(64) }
  let frontmost = flag(app, kAXFrontmostAttribute, "frontmost")
  var answer: [String: Any] = ["trusted": true, "windows": windows.count, "found": run != nil]
  answer["frontmost"] = frontmost ?? NSNull()
  if let run {
    answer["focused"] = flag(run, kAXFocusedAttribute, "focused") ?? NSNull()
    answer["main"] = flag(run, kAXMainAttribute, "main") ?? NSNull()
  } else {
    answer["focused"] = NSNull()
    answer["main"] = NSNull()
  }
  // The app's focused and main windows: none (no value) is a reading; any other failure is not. A sheet of the matched
  // window holding the focus is its own side; the focused window is described whatever it is. An AXSheet is classified
  // before the direct-equality path: where Accessibility lists a sheet among the app's windows the bounds lookup can
  // match the sheet itself, and a focused sheet is never the window read ('other', its parent described by frame).
  answer["focusedWindowElement"] = NSNull()
  for (attribute, key) in [(kAXFocusedWindowAttribute, "focusedWindow"), (kAXMainWindowAttribute, "mainWindow")] {
    let r = read(app, attribute)
    if r.status == .noValue || (r.status == .success && element(r.value) == nil) { answer[key] = "none" }
    else if r.status == .success, let w = element(r.value) {
      let role = read(w, kAXRoleAttribute).value as? String
      if role == kAXSheetRole as String {
        if key == "focusedWindow", let run, !CFEqual(run, w), sheetOf(w, run) { answer[key] = "sheet" } else { answer[key] = "other" }
      }
      else if let run, CFEqual(run, w) { answer[key] = "run" }
      else { answer[key] = "other" }
      if key == "focusedWindow" {
        var described: [String: Any] = ["role": role.map { $0 as Any } ?? NSNull(), "subrole": (read(w, kAXSubroleAttribute).value as? String).map { $0 as Any } ?? NSNull(), "frame": rectWire(frame(w))]
        // A sheet's parent, by its frame (ruling 1214: which window a focused sheet lies on), and what decided its side
        // (ruling 1219, s3; diagnostics only): sheetOf's own answer against the window read, its parent's role, and
        // whether the app lists the sheet among its AXWindows.
        if role == kAXSheetRole as String {
          let parent = element(read(w, kAXParentAttribute).value)
          described["parentFrame"] = rectWire(parent.flatMap { frame($0) })
          described["parentRole"] = parent.flatMap { read($0, kAXRoleAttribute).value as? String }.map { $0 as Any } ?? NSNull()
          described["sheetOf"] = run.map { sheetOf(w, $0) as Any } ?? NSNull()
          described["listed"] = windows.contains { CFEqual($0, w) }
        }
        answer["focusedWindowElement"] = described
      }
    }
    else {
      answer[key] = NSNull(); failed.append(key)
      if key == "focusedWindow" { answer["focusedWindowElement"] = "unread" }
    }
  }
  // The sheet asked about: an AXSheet child of the matched window at its bounds.
  if let sheetBounds {
    let children = run.map { read($0, kAXChildrenAttribute) }
    if let children, children.status == .success, let list = children.value as? [AXUIElement] {
      answer["sheet"] = list.contains { read($0, kAXRoleAttribute).value as? String == kAXSheetRole && at($0, sheetBounds) }
    } else {
      answer["sheet"] = NSNull()
      if run != nil { failed.append("sheet") }
    }
  }
  answer["ok"] = failed.isEmpty && run != nil
  answer["failed"] = failed
  emit(answer)
  exit(0)
}

// text
let offsets = args.dropFirst(3).compactMap { Int($0) }
let focusedRead = read(app, kAXFocusedUIElementAttribute)
var errors: [String: Any] = [:]
guard let focused = element(focusedRead.value) else {
  emit(["trusted": true, "ok": false, "failed": ["focused"], "errors": ["focused": Int(focusedRead.status.rawValue)], "role": NSNull(), "frame": NSNull(), "characters": NSNull(),
        "selected": NSNull(), "bounds": offsets.map { _ in NSNull() }])
  exit(0)
}
/// A read that failed, named in `failed` and its AXError kept (success with no usable value as kAXErrorNoValue's).
func failedRead(_ name: String, _ status: AXError) {
  failed.append(name)
  errors[name] = Int(status == .success ? AXError.noValue.rawValue : status.rawValue)
}
let roleRead = read(focused, kAXRoleAttribute)
let role = roleRead.value as? String
if role == nil { failedRead("role", roleRead.status) }
let box = frame(focused)
if box == nil { failed.append("frame") }
let charactersRead = read(focused, kAXNumberOfCharactersAttribute)
let characters = charactersRead.value as? Int
if characters == nil { failedRead("characters", charactersRead.status) }
let selectedRead = read(focused, kAXSelectedTextRangeAttribute)
let selected = axValue(selectedRead.value, .cfRange, CFRange(location: 0, length: 0))
if selected == nil { failedRead("selected", selectedRead.status) }
// The marked range (ruling 1229: an input method's composition still open in the element), presence and length only:
// the Cocoa text system's AXTextInputMarkedRange, and a web view's AXTextInputMarkedTextMarkerRange with its length
// (AXLengthForTextMarkerRange). Never named in `failed`: an element that keeps no marked range is a reading, and the
// read-back's `ok` (#590) does not rest on it. Each read that gave no number keeps its AXError.
var marked: [String: Any] = ["range": NSNull(), "rangeError": NSNull(), "marker": false, "markerLength": NSNull(), "markerError": NSNull()]
let markedRead = read(focused, "AXTextInputMarkedRange")
if let r = axValue(markedRead.value, .cfRange, CFRange(location: 0, length: 0)) {
  marked["range"] = ["location": r.location == kCFNotFound ? NSNull() : r.location as Any, "length": r.length]
} else { marked["rangeError"] = Int(markedRead.status == .success ? AXError.noValue.rawValue : markedRead.status.rawValue) }
let markerRead = read(focused, "AXTextInputMarkedTextMarkerRange")
if let m = markerRead.value, CFGetTypeID(m) == AXTextMarkerRangeGetTypeID() {
  marked["marker"] = true
  var length: CFTypeRef?
  let status = AXUIElementCopyParameterizedAttributeValue(focused, "AXLengthForTextMarkerRange" as CFString, m, &length)
  if status == .success, let n = length as? Int { marked["markerLength"] = n }
  else { marked["markerError"] = Int(status == .success ? AXError.noValue.rawValue : status.rawValue) }
} else { marked["markerError"] = Int(markerRead.status == .success ? AXError.noValue.rawValue : markerRead.status.rawValue) }
var bounds: [Any] = []
for offset in offsets {
  var range = CFRange(location: offset, length: 1)
  var value: CFTypeRef?
  let status = withUnsafePointer(to: &range) { pointer -> AXError in
    guard let parameter = AXValueCreate(.cfRange, pointer) else { return .failure }
    return AXUIElementCopyParameterizedAttributeValue(focused, kAXBoundsForRangeParameterizedAttribute as CFString, parameter, &value)
  }
  let rect = status == .success ? axValue(value, .cgRect, CGRect.zero) : nil
  if rect == nil { failed.append("bounds:\(offset)") }
  bounds.append(rectWire(rect))
}
emit(["trusted": true, "ok": failed.isEmpty, "failed": failed, "errors": errors, "role": role ?? NSNull(), "frame": rectWire(box), "characters": characters ?? NSNull(),
      "selected": selected.map { ["location": $0.location, "length": $0.length] } ?? NSNull(), "bounds": bounds, "marked": marked])
