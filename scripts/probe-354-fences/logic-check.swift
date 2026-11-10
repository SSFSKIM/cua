// Offline check of logic.swift: swiftc -parse-as-library logic.swift logic-check.swift. Touches no AX or GUI.
import Foundation

@main
struct Fence354LogicCheck {
  static func main() {
    var failures = 0
    func check(_ ok: Bool, _ what: String) { if !ok { failures += 1; print("FAIL", what) } }

    // Replacement in UTF-16 units, as AXSelectedTextRange counts them.
    check(fence354Expected(before: "Old draft", range: [3, 0], typed: "X") == "OldX draft", "caret insertion")
    check(fence354Expected(before: "Old draft", range: [0, 9], typed: "New") == "New", "select-all replacement")
    check(fence354Expected(before: "", range: [0, 0], typed: "abc") == "abc", "empty field")
    check(fence354Expected(before: "a\u{1F600}b", range: [3, 1], typed: "Z") == "a\u{1F600}Z", "range after a surrogate pair")
    check(fence354Expected(before: "a\u{1F600}b", range: [1, 2], typed: "Z") == "aZb", "range covering a surrogate pair")
    check(fence354Expected(before: "abc", range: [4, 0], typed: "Z") == nil, "location past end")
    check(fence354Expected(before: "abc", range: [1, 3], typed: "Z") == nil, "length past end")
    check(fence354Expected(before: "abc", range: [-1, 0], typed: "Z") == nil, "negative location")
    check(fence354Expected(before: "abc", range: [1], typed: "Z") == nil, "malformed range")

    // Secure fields fail closed.
    check(fence354Secure(role: "AXSecureTextField", subrole: .absent), "secure role")
    check(fence354Secure(role: "AXTextField", subrole: .value("AXSecureTextField")), "secure subrole")
    check(fence354Secure(role: "AXTextField", subrole: .failed), "unreadable subrole")
    check(fence354Secure(role: nil, subrole: .absent), "unreadable role")
    check(!fence354Secure(role: "AXTextArea", subrole: .absent), "plain text area")
    check(!fence354Secure(role: "AXTextField", subrole: .value("AXSearchField")), "search subrole")

    // Plans: values are read and reported only for a readable, non-secure, non-concealed field.
    let typed = "New"
    check(fence354Plan(concealed: true, focused: true, role: "AXTextArea", secure: false, value: "x", range: [0, 1], typed: typed) == .refused("concealed"), "concealed first")
    check(fence354Plan(concealed: false, focused: false, role: nil, secure: true, value: nil, range: nil, typed: typed) == .refused("noFocusedElement"), "no focus")
    check(fence354Plan(concealed: false, focused: true, role: nil, secure: true, value: nil, range: nil, typed: typed) == .refused("roleUnreadable"), "role unreadable")
    check(fence354Plan(concealed: false, focused: true, role: "AXTextField", secure: true, value: nil, range: nil, typed: typed) == .refused("secure"), "secure")
    check(fence354Plan(concealed: false, focused: true, role: "AXGroup", secure: false, value: nil, range: nil, typed: typed) == .refused("beforeUnreadable"), "canvas-like")
    check(fence354Plan(concealed: false, focused: true, role: "AXTextArea", secure: false, value: "ab", range: nil, typed: typed) == .refused("beforeUnreadable"), "range unreadable")
    check(fence354Plan(concealed: false, focused: true, role: "AXTextArea", secure: false, value: "ab", range: [3, 0], typed: typed) == .refused("beforeRangeInvalid"), "range invalid")
    let plan = fence354Plan(concealed: false, focused: true, role: "AXTextArea", secure: false, value: "Old", range: [0, 3], typed: typed)
    check(plan == .expect("New") && plan.reportsValues && plan.reason == nil, "readable plan")
    for refused in ["concealed", "secure", "beforeUnreadable", "roleUnreadable", "noFocusedElement"] {
      check(!Fence354Plan.refused(refused).reportsValues, "no values reported when \(refused)")
    }

    // The snapshot's reader order: a fake field whose every read is recorded; a secure or concealed snapshot that
    // touches value or range fails the check, and its unconfirmed answer must carry actual null.
    struct Field { let role: String?; let subrole: Fence354Subrole }
    func snapshot(_ field: Field?, concealed: Bool = false) -> (Fence354Snapshot<Field>, [String]) {
      var calls: [String] = []
      let s = fence354Snapshot(concealed: concealed, typed: typed, focused: { calls.append("focused"); return field },
                               role: { calls.append("role"); return $0.role }, subrole: { calls.append("subrole"); return $0.subrole },
                               value: { _ in calls.append("value"); return "Old draft" }, range: { _ in calls.append("range"); return [0, 9] })
      return (s, calls)
    }
    let secureFields: [(String, Field)] = [("secure role", Field(role: "AXSecureTextField", subrole: .absent)),
                                           ("secure subrole", Field(role: "AXTextField", subrole: .value("AXSecureTextField"))),
                                           ("unreadable subrole", Field(role: "AXTextField", subrole: .failed)),
                                           ("unreadable role", Field(role: nil, subrole: .absent))]
    for (name, field) in secureFields {
      let (s, calls) = snapshot(field)
      check(!calls.contains("value") && !calls.contains("range"), "\(name): no value or range read \(calls)")
      check(s.value == nil && s.range == nil && !s.plan.reportsValues, "\(name): nothing kept or reported")
      check(fence354Reported(s.plan, "leak") == nil, "\(name): unconfirmed carries actual null")
    }
    check(!snapshot(secureFields[3].1).1.contains("subrole"), "unreadable role: subrole not read either")
    for (name, field) in [("concealed plain", Field(role: "AXTextArea", subrole: .absent)), ("concealed secure", secureFields[1].1)] {
      let (s, calls) = snapshot(field, concealed: true)
      check(calls.isEmpty, "\(name): reads nothing at all \(calls)")
      check(s.plan == .refused("concealed") && fence354Reported(s.plan, "leak") == nil, "\(name): refused with actual null")
    }
    let (none, noneCalls) = snapshot(nil)
    check(none.plan == .refused("noFocusedElement") && noneCalls == ["focused"], "no focused field")
    let (plain, plainCalls) = snapshot(Field(role: "AXTextArea", subrole: .absent))
    check(plainCalls == ["focused", "role", "subrole", "value", "range"], "plain field: role and subrole before value \(plainCalls)")
    check(plain.plan == .expect("New") && fence354Reported(plain.plan, "Newer") == "Newer", "plain field: a mismatch reports its readable actual")

    // Post-input transitions: the field changes after `after` value reads. From then on no value or range read may
    // happen and nothing is reported.
    final class Live {
      var role: String? = "AXTextArea", subrole: Fence354Subrole = .absent, calls: [String] = []
      var valueReads = 0, changed = false
      let values: [String], after: Int, change: (Live) -> Void
      init(values: [String], after: Int, change: @escaping (Live) -> Void) { self.values = values; self.after = after; self.change = change }
    }
    func poll(_ f: Live, maxReads: Int = 6) -> Fence354Poll {
      fence354Poll(f, expected: "New", role: { $0.calls.append("role"); return $0.role }, subrole: { $0.calls.append("subrole"); return $0.subrole },
                   value: { x in
                     x.calls.append(x.changed ? "value-after-change" : "value")
                     let v = x.values[min(x.valueReads, x.values.count - 1)]
                     x.valueReads += 1
                     if x.valueReads == x.after { x.change(x); x.changed = true }
                     return v
                   }, range: { x in x.calls.append(x.changed ? "range-after-change" : "range"); return [3, 0] },
                   stop: { f.valueReads >= maxReads }, pause: {})
    }
    let transitions: [(String, (Live) -> Void, String)] = [
      ("role becomes AXSecureTextField", { $0.role = "AXSecureTextField" }, "becameSecureAfterInput"),
      ("subrole becomes AXSecureTextField", { $0.role = "AXTextField"; $0.subrole = .value("AXSecureTextField") }, "becameSecureAfterInput"),
      ("role read fails", { $0.role = nil }, "roleUnreadableAfterInput"),
      ("subrole read fails", { $0.subrole = .failed }, "subroleUnreadableAfterInput"),
    ]
    for (name, change, why) in transitions {
      let f = Live(values: ["N", "Ne", "New"], after: 2, change: change)
      let p = poll(f)
      check(p.closed == why, "\(name): closed as \(why), got \(String(describing: p.closed))")
      check(!f.calls.contains("value-after-change") && !f.calls.contains("range-after-change"), "\(name): no read after the change \(f.calls)")
      check(p.actual == nil && p.actualRange == nil && !p.matched && p.reads == 2, "\(name): nothing reported")
      // A change right after a matching read still closes it before the range read.
      let g = Live(values: ["New"], after: 1, change: change)
      let q = poll(g)
      check(q.closed == why && !g.calls.contains("range-after-change") && q.actual == nil && !q.matched, "\(name) after a match: closed before the range read \(g.calls)")
    }
    let steady = Live(values: ["N", "Ne", "New"], after: 99, change: { _ in })
    let s = poll(steady)
    check(s.matched && s.reads == 3 && s.actual == "New" && s.actualRange == [3, 0] && s.closed == nil, "steady field matches on the third read")
    check(steady.calls == ["role", "subrole", "value", "role", "subrole", "value", "role", "subrole", "value", "role", "subrole", "range"], "recheck before each read \(steady.calls)")
    let never = poll(Live(values: ["Old"], after: 99, change: { _ in }), maxReads: 4)
    check(!never.matched && never.reads == 4 && never.actual == "Old" && never.closed == nil, "a mismatch keeps its readable actual")

    // Only a selected-text change from posting on acknowledges a key.
    check(fence354Accepts(name: "AXSelectedTextChanged", arrivedAt: 10, postStartedAt: 10), "at post start")
    check(!fence354Accepts(name: "AXSelectedTextChanged", arrivedAt: 9.9, postStartedAt: 10), "setup traffic")
    check(!fence354Accepts(name: "AXValueChanged", arrivedAt: 11, postStartedAt: 10), "other notification")

    print(failures == 0 ? "fence354 logic: all checks passed" : "fence354 logic: \(failures) failed")
    exit(failures == 0 ? 0 : 1)
  }
}
