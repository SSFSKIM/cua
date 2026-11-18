import AppKit
import Foundation

guard ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { exit(2) }
func emit(_ q: [String: Any]) {
    let d = try! JSONSerialization.data(withJSONObject:q)
    print(String(decoding:d, as:UTF8.self)); fflush(stdout)
}

final class Fixture: NSObject {
    let window = NSWindow(contentRect:NSRect(x:400,y:140,width:570,height:210),styleMask:[.titled,.closable],backing:.buffered,defer:false)
    let secure = NSSecureTextField(frame:NSRect(x:25,y:120,width:500,height:28))
    let setup = NSTextField(frame:NSRect(x:25,y:160,width:500,height:28))
    var trial = -1, effect = "none", first = "", key = false, hit = false
    // Diagnostics only (Unix ms): last genuine printable target key arrival, the mutation insert's completion, and whether it advanced the caret.
    var lastKeyAtMs: Double?, addedAtMs: Double?, addAdvanced: Bool?, lastKeyAppliedAtMs: Double?, armed = false
    var editor: NSTextView? { secure.currentEditor() as? NSTextView }

    func launch() {
        secure.setAccessibilityLabel("PW walk test")
        setup.setAccessibilityLabel("Setup control")
        window.contentView?.addSubview(setup); window.contentView?.addSubview(secure)
        window.title = "PW walk owned AppKit fixture"
        // The field editor's own text change, delivered while a proceeding genuine key is armed (never the monitor's injected insert).
        NotificationCenter.default.addObserver(forName:NSText.didChangeNotification, object:nil, queue:nil) { [weak self] n in
            guard let self, self.armed, let editor = self.editor, n.object as AnyObject === editor else { return }
            self.lastKeyAppliedAtMs = Date().timeIntervalSince1970 * 1000
            self.armed = false
        }
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps:true)
        NSEvent.addLocalMonitorForEvents(matching:.keyDown) { [weak self] e in
            guard let self, let field = self.editor, self.window.firstResponder === field,
                  let ch = e.characters, ch.count == 1 else { return e }
            self.key = true
            var printable = false
            if let u = ch.unicodeScalars.first, u.value >= 0x20, u.value != 0x7f, !(0xF700...0xF8FF).contains(u.value), !e.isARepeat {
                printable = true
                self.lastKeyAtMs = Date().timeIntervalSince1970 * 1000
            }
            // Arm the applied stamp only for a printable key the monitor lets proceed, and only after any injected insert below;
            // disarmed once this event's dispatch has finished so a later unrelated change is never credited to it.
            func proceed() -> NSEvent {
                if printable {
                    self.armed = true
                    DispatchQueue.main.async { self.armed = false }
                }
                return e
            }
            guard !self.hit, ch == self.first, self.effect != "none" else { return proceed() }
            self.hit = true
            if self.effect != "drop" {
                let before = field.selectedRange()
                field.insertText("z", replacementRange:before)
                let after = field.selectedRange()
                self.addAdvanced = after.location == before.location + 1 && after.length == 0
                self.addedAtMs = Date().timeIntervalSince1970 * 1000
            }
            return self.effect == "add" ? proceed() : nil
        }
        emit(["ready":true])
    }
    func command(_ q:[String:Any]) {
        let op = q["op"] as? String, n = q["trial"] as? Int
        if op == "prepare", let n {
            window.makeFirstResponder(setup); secure.stringValue = ""
            trial = n; effect = "none"; first = ""; key = false; hit = false
            lastKeyAtMs = nil; addedAtMs = nil; addAdvanced = nil; lastKeyAppliedAtMs = nil; armed = false
        } else if op == "seed", n == trial, let value = q["expected"] as? String,
                  let start = q["start"] as? Int, let end = q["end"] as? Int {
            secure.stringValue = value
            window.makeFirstResponder(secure)
            editor?.setSelectedRange(NSRange(location:start,length:end-start))
            effect = q["effect"] as? String ?? "none"; first = q["first"] as? String ?? ""
        }
        let field = editor, range = field?.selectedRange(), value = field?.string ?? secure.stringValue
        var out: [String:Any] = ["trial":trial,"shape":secure.window === window,"focused":field != nil && window.firstResponder === field,
              "plainFocused":setup.currentEditor() != nil && window.firstResponder === setup.currentEditor(),
              "exact":value == (q["expected"] as? String),"controlExact":value == (q["control"] as? String),
              "selection":range?.location == (q["start"] as? Int) && range.map(NSMaxRange) == (q["end"] as? Int),
              "hit":hit,"key":key,"input":key,"request":q["request"] ?? 0]
        if op == "read" {
            // Caret positions are known fixture constants passed by the caller; null when unavailable.
            func caretIs(_ k: String) -> Any {
                guard let want = (q[k] as? NSNumber)?.intValue, let range else { return NSNull() }
                return range.location == want && range.length == 0
            }
            out["lastKeyAtMs"] = lastKeyAtMs ?? NSNull(); out["lastKeyAppliedAtMs"] = lastKeyAppliedAtMs ?? NSNull(); out["addedAtMs"] = addedAtMs ?? NSNull()
            out["addAdvancedCaret"] = addAdvanced ?? NSNull()
            out["requestedCaretOk"] = caretIs("requestedCaret"); out["controlCaretOk"] = caretIs("controlCaret")
        }
        emit(out)
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let fixture = Fixture()
fixture.launch()
DispatchQueue.global().async {
    while let line = readLine() {
        guard let q = (try? JSONSerialization.jsonObject(with:Data(line.utf8))) as? [String:Any] else { continue }
        DispatchQueue.main.async { fixture.command(q) }
    }
}
app.run()
