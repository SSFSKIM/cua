# #324's runner-only patch of main's engine (never committed to any engine branch). One build serves every variant: the
# patched engine reads P324_MODE once at start. Each edit is an exact replacement that must match once.
#
# Instrumentation, in every mode: JSON lines on stderr, prefixed "P324 ", each with its Unix ms (`t`):
#   hold / release        SLSDisableUpdate taken / SLSReenableUpdate returned (the display frozen between)
#   act / act.restore / act.end   route 3's activation: its planned click kind and hold class; a restore by its guard; its end
#   dlv.post / dlv.above / dlv.restore / dlv.reactivate / dlv.end   the delivery guard (#200, #321): its hold class and
#                         cap, the first sample above, each repair, its end
#   ff / ff.focusWrite / ff.click / ff.skip   focusFieldIfNeeded: the field's state, the AXFocused write and whether it
#                         took, the fallback click
#   pf                    press mode's steps
# and focusingClick keeps the fallback click's delivery record in the method's meta (main drops it).
#
# Modes (P324_MODE):
#   main   main's behaviour
#   press  set_value's and select_text's focusField: the field's AXPick or AXPress if advertised, its focus read back
#          (#313's readingFocus, 300 ms), then if still unfocused its caret written (AXSelectedTextRange {0, 0}) and read
#          back again; never an AXFocused write, never a posted click; unfocused at the end answers clickUnconfirmed
#   c      route 3's activation outside a pointer's delivery (a held activation: set_value, select_text, keys, an element
#          action) that clicked its in-window activation point holds until the order reads back: its guard samples for at
#          least 150 ms after the activation, its hold capped at 200 ms (main: three stable samples, 100 ms)
#   ev     #321's hold (a shared pointer whose activation clicked its point): the 200 ms cap counted from the click's
#          events, not the hold's start; the activation's own timer only past its guard's 1 s timeout
#   ev300  ev, with a ceiling of 300 ms from the hold's start
#   python3 -I patch.py <native/engine/Sources/Engine>
import sys

root = sys.argv[1]


def patch(name, edits):
    path = f'{root}/{name}'
    text = open(path).read()
    for old, new in edits:
        n = text.count(old)
        if n != 1:
            sys.exit(f'{path}: expected one match, found {n}: {old[:100]!r}')
        text = text.replace(old, new)
    open(path, 'w').write(text)
    print(f'patched {path}: {len(edits)} edits')


open(f'{root}/P324.swift', 'w').write(r'''import AppKit
import ApplicationServices
import Foundation

// #324's probe instrumentation and modes (scripts/probe-324/patch.py); never on any engine branch.
let p324Mode: String = ProcessInfo.processInfo.environment["P324_MODE"] ?? "main"

func p324(_ event: String, _ fields: [String: Any] = [:]) {
  var o = fields
  o["ev"] = event
  o["t"] = (Date().timeIntervalSince1970 * 10_000).rounded() / 10
  guard JSONSerialization.isValidJSONObject(o), let d = try? JSONSerialization.data(withJSONObject: o),
        let s = String(data: d, encoding: .utf8) else { return }
  FileHandle.standardError.write(Data("P324 \(s)\n".utf8))
}

/// The activation's own timer for a #321 hold: past the guard's timeout under ev, 300 ms under ev300, else the cap.
func p324Ceiling(_ cap: Double) -> Double {
  switch p324Mode {
  case "ev": return 1_300
  case "ev300": return 300
  default: return cap
  }
}

/// Press mode's focusField: the field's own action, then its caret, each read back; nothing posted, AXFocused unwritten.
func p324PressFocus(_ element: AXUIElement, beforeMutating: () throws -> Void) throws {
  let ax = AXOps.live
  guard let role = ax.role(element), [kAXTextFieldRole, kAXTextAreaRole, "AXDateTimeArea"].contains(role),
        ax.isSettable(element, kAXFocusedAttribute) else {
    p324("pf.skip")
    return
  }
  let focused = { bool(attribute(element, kAXFocusedAttribute)) }
  if focused() == true {
    p324("pf", ["already": true, "role": role])
    return
  }
  let actions = establishedActionNames(of: element) ?? []
  let sleep: (Double) -> Void = { ms in _ = usleep(UInt32(max(0, ms) * 1000)) }
  var steps: [String] = []
  var found = FocusReadback.notReadBack
  if let action = ["AXPick", "AXPress"].first(where: { actions.contains($0) }) {
    try beforeMutating()
    let t0 = monotonicMilliseconds()
    var error = AXError.success
    found = try readingFocus(after: { error = gatedPerform(element, action) }, focused: focused, now: monotonicMilliseconds, sleep: sleep)
    steps.append("\(action) err=\(error.rawValue) \(found.rawValue) \(Int(monotonicMilliseconds() - t0))ms")
  }
  if found != .readBack {
    try beforeMutating()
    let t0 = monotonicMilliseconds()
    var error = AXError.success
    found = try readingFocus(after: {
      error = gatedWrite(element, kAXSelectedTextRangeAttribute, axRangeValue(CFRange(location: 0, length: 0)))
    }, focused: focused, now: monotonicMilliseconds, sleep: sleep)
    steps.append("selection err=\(error.rawValue) \(found.rawValue) \(Int(monotonicMilliseconds() - t0))ms")
  }
  p324("pf", ["role": role, "actions": actions.joined(separator: ","), "steps": steps.joined(separator: "; "), "found": found.rawValue])
  if found != .readBack {
    throw EngineError(name: "clickUnconfirmed", "P324 press mode: the field did not read focused (\(steps.joined(separator: "; ")))")
  }
}
''')
print(f'wrote {root}/P324.swift')

patch('Activation.swift', [
    ("    _ = disableUpdate?(connection)\n    return { _ = reenableUpdate?(connection) }",
     "    _ = disableUpdate?(connection)\n    p324(\"hold\")\n    return { _ = reenableUpdate?(connection); p324(\"release\") }"),
    ("    system.schedule(untilOrderReadsBack ? activationPointHoldCapMs : activationHoldCapMs) { release() }\n"
     "    postActivation(planned)\n"
     "    let started = system.now()\n"
     "    defer { guardMs = ((system.now() - started) * 1000).rounded() / 1000 }\n"
     "    let needed = holdsThroughDelivery ? activationGuardStableSamplesBeforeDelivery : activationGuardStableSamples\n"
     "    var stable = 0\n"
     "    while stable < needed {\n",
     "    let p324c = p324Mode == \"c\" && !holdsThroughDelivery && planned.kind == .activationPoint\n"
     "    system.schedule(untilOrderReadsBack ? p324Ceiling(activationPointHoldCapMs) : (p324c ? activationPointHoldCapMs : activationHoldCapMs)) { release() }\n"
     "    postActivation(planned)\n"
     "    let started = system.now()\n"
     "    p324(\"act\", [\"pid\": Int(pid), \"kind\": \"\\(planned.kind)\", \"untilOrder\": untilOrderReadsBack, \"throughDelivery\": holdsThroughDelivery, \"c\": p324c])\n"
     "    defer { guardMs = ((system.now() - started) * 1000).rounded() / 1000; p324(\"act.end\", [\"guardMs\": guardMs ?? -1]) }\n"
     "    let needed = holdsThroughDelivery ? activationGuardStableSamplesBeforeDelivery : activationGuardStableSamples\n"
     "    var stable = 0\n"
     "    while stable < needed || (p324c && system.now() - started < activationPointGuardMinimumMs) {\n"),
    ("        stable = 0\n        userWindow.restore()\n",
     "        stable = 0\n        userWindow.restore()\n        p324(\"act.restore\", [\"ms\": system.now() - started])\n"),
    ("      system.schedule(opened.capMs) { release() }",
     "      system.schedule(opened.untilOrderReadsBack ? p324Ceiling(opened.capMs) : opened.capMs) { release() }"),
    ("    let capMs = hold.capMs\n", "    var capMs = hold.capMs\n"),
    ("    post()\n    let posted = system.now()\n",
     "    post()\n    let posted = system.now()\n"
     "    if hold.untilOrderReadsBack, p324Mode == \"ev\" || p324Mode == \"ev300\" {\n"
     "      var deadline = posted + activationPointHoldCapMs\n"
     "      if p324Mode == \"ev300\" { deadline = min(deadline, hold.startedAt + 300) }\n"
     "      capMs = deadline - hold.startedAt\n"
     "      let release = hold.release\n"
     "      system.schedule(max(0, deadline - system.now())) { release() }\n"
     "    }\n"
     "    p324(\"dlv.post\", [\"untilOrder\": hold.untilOrderReadsBack, \"capMs\": capMs, \"ownHold\": action === self, \"pointer\": pointer,\n"
     "                      \"postedAfterHoldStartMs\": posted - hold.startedAt, \"kind\": clickKind.map { \"\\($0)\" } ?? \"none\"])\n"),
    ("            if raiseSeen == nil { raiseSeen = at }\n",
     "            if raiseSeen == nil { raiseSeen = at; p324(\"dlv.above\", [\"ms\": at - posted]) }\n"),
    ("        let accepted = system.reactivate(hold.user.pid)\n",
     "        let accepted = system.reactivate(hold.user.pid)\n        p324(\"dlv.reactivate\", [\"accepted\": accepted, \"released\": released])\n"),
    ("        window.restore()\n        if !released { outcome.restores += 1 }\n",
     "        window.restore()\n        p324(\"dlv.restore\", [\"released\": released, \"ms\": system.now() - posted])\n        if !released { outcome.restores += 1 }\n"),
    ("    let held = ended - hold.startedAt\n    hold.release()\n",
     "    let held = ended - hold.startedAt\n"
     "    p324(\"dlv.end\", [\"guardMs\": outcome.guardMs, \"heldMs\": held, \"capMs\": capMs, \"capped\": outcome.capped, \"raiseLeft\": outcome.raiseLeft])\n"
     "    hold.release()\n"),
])

patch('ElementInput.swift', [
    ("  guard let role = ax.role(element), focusFieldRoles.contains(role), ax.isSettable(element, kAXFocusedAttribute) else { return false }\n"
     "  if bool(ax.read(element, kAXFocusedAttribute)) == true { return false }\n",
     "  guard let role = ax.role(element), focusFieldRoles.contains(role), ax.isSettable(element, kAXFocusedAttribute) else { p324(\"ff.skip\"); return false }\n"
     "  let p324Focused = bool(ax.read(element, kAXFocusedAttribute)) == true\n"
     "  p324(\"ff\", [\"role\": role, \"focused\": p324Focused])\n"
     "  if p324Focused { return false }\n"),
    ("    _ = ax.write(element, kAXFocusedAttribute, kCFBooleanTrue)\n"
     "    if bool(ax.read(element, kAXFocusedAttribute)) == true { return false }\n"
     "  }\n"
     "  try beforeMutating()\n"
     "  try click()\n",
     "    let p324Written = ax.write(element, kAXFocusedAttribute, kCFBooleanTrue)\n"
     "    let p324Took = bool(ax.read(element, kAXFocusedAttribute)) == true\n"
     "    p324(\"ff.focusWrite\", [\"error\": Int(p324Written.rawValue), \"took\": p324Took])\n"
     "    if p324Took { return false }\n"
     "  }\n"
     "  p324(\"ff.click\", [\"straight\": straightToClick])\n"
     "  try beforeMutating()\n"
     "  try click()\n"),
    ("  meta.routeAdvice = clickMeta.routeAdvice\n}",
     "  meta.routeAdvice = clickMeta.routeAdvice\n  meta.delivery = clickMeta.delivery  // #324's probe: main drops it\n}"),
    ("    let connection = context.connection\n"
     "    try focusFieldIfNeeded(target.element, bundleIdentifier: app.bundleIdentifier, ax: .live, beforeMutating: guarding.checkInFlight) {\n",
     "    let connection = context.connection\n"
     "    if p324Mode == \"press\" { return try p324PressFocus(target.element, beforeMutating: guarding.checkInFlight) }\n"
     "    try focusFieldIfNeeded(target.element, bundleIdentifier: app.bundleIdentifier, ax: .live, beforeMutating: guarding.checkInFlight) {\n"),
])
