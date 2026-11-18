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
    var editor: NSTextView? { secure.currentEditor() as? NSTextView }

    func launch() {
        secure.setAccessibilityLabel("PW walk test")
        setup.setAccessibilityLabel("Setup control")
        window.contentView?.addSubview(setup); window.contentView?.addSubview(secure)
        window.title = "PW walk owned AppKit fixture"
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps:true)
        NSEvent.addLocalMonitorForEvents(matching:.keyDown) { [weak self] e in
            guard let self, let field = self.editor, self.window.firstResponder === field,
                  let ch = e.characters, ch.count == 1 else { return e }
            self.key = true
            guard !self.hit, ch == self.first, self.effect != "none" else { return e }
            self.hit = true
            if self.effect != "drop" { field.insertText("z", replacementRange:field.selectedRange()) }
            return self.effect == "add" ? e : nil
        }
        emit(["ready":true])
    }
    func command(_ q:[String:Any]) {
        let op = q["op"] as? String, n = q["trial"] as? Int
        if op == "prepare", let n {
            window.makeFirstResponder(setup); secure.stringValue = ""
            trial = n; effect = "none"; first = ""; key = false; hit = false
        } else if op == "seed", n == trial, let value = q["expected"] as? String,
                  let start = q["start"] as? Int, let end = q["end"] as? Int {
            secure.stringValue = value
            window.makeFirstResponder(secure)
            editor?.setSelectedRange(NSRange(location:start,length:end-start))
            effect = q["effect"] as? String ?? "none"; first = q["first"] as? String ?? ""
        }
        let field = editor, range = field?.selectedRange(), value = field?.string ?? secure.stringValue
        emit(["trial":trial,"shape":secure.window === window,"focused":field != nil && window.firstResponder === field,
              "plainFocused":setup.currentEditor() != nil && window.firstResponder === setup.currentEditor(),
              "exact":value == (q["expected"] as? String),"controlExact":value == (q["control"] as? String),
              "selection":range?.location == (q["start"] as? Int) && range.map(NSMaxRange) == (q["end"] as? Int),
              "hit":hit,"key":key,"input":key,"request":q["request"] ?? 0])
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
