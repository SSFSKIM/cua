import AppKit
import Foundation

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {
    fatalError("hosted only")
}

func emit(_ message: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: message)
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(
    contentRect: NSRect(x: 100, y: 100, width: 600, height: 300),
    styleMask: [.titled, .closable], backing: .buffered, defer: false
)
window.title = "PW walk owned AppKit fixture"
let content = window.contentView!

let field = NSSecureTextField(frame: NSRect(x: 30, y: 252, width: 500, height: 30))
field.setAccessibilityLabel("PW walk test")
content.addSubview(field)

let ordinary = NSTextField(frame: NSRect(x: 30, y: 205, width: 250, height: 32))
ordinary.stringValue = "public-control"
ordinary.setAccessibilityLabel("Public control")
content.addSubview(ordinary)

let notes = NSTextView(frame: NSRect(x: 300, y: 205, width: 270, height: 32))
notes.string = "public-textarea"
notes.setAccessibilityLabel("Public notes")
content.addSubview(notes)

// Fit all 216 editable fields in the inherited 600×300 content rect without scrolling.
let bench = NSView(frame: NSRect(x: 30, y: 12, width: 540, height: 180))
for i in 0..<216 {
    let cell = NSTextField(frame: NSRect(x: (i % 18) * 30, y: (11 - i / 18) * 15, width: 28, height: 14))
    cell.isEditable = true
    cell.font = .systemFont(ofSize: 9)
    cell.stringValue = "bench-value-\(i)"
    bench.addSubview(cell)
}

window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
window.makeFirstResponder(field)
emit(["ready": true, "pid": ProcessInfo.processInfo.processIdentifier])

DispatchQueue.global().async {
    while let line = readLine() {
        guard let request = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any],
              let trial = request["trial"] as? Int,
              let value = request["value"] as? String,
              let large = request["large"] as? Bool else { continue }
        DispatchQueue.main.async {
            if large && bench.superview == nil {
                content.addSubview(bench)
            } else if !large {
                bench.removeFromSuperview()
            }

            // End any existing field-editor session before installing the next value.
            window.makeFirstResponder(nil)
            field.stringValue = value
            window.makeFirstResponder(field)
            let length = field.stringValue.utf16.count
            let editor = field.currentEditor()
            editor?.selectedRange = NSRange(location: 0, length: min(7, length))
            let range = editor?.selectedRange
            let selection = range.flatMap { $0.location == NSNotFound ? nil : $0 }
            emit([
                "trial": trial,
                "length": length,
                "focused": app.isActive && window.isKeyWindow && editor != nil && window.firstResponder === editor,
                "selectionStart": selection.map { $0.location as Any } ?? NSNull(),
                "selectionEnd": selection.map { NSMaxRange($0) as Any } ?? NSNull(),
                "large": bench.superview != nil,
            ])
        }
    }
}
app.run()
