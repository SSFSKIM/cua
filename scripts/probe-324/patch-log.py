# #324's A/B check: logging only, applied on the runner to both heads (A = main 74fe29f8, B = fix/324-caret-first), never
# committed to any engine branch. The heads' product logic is untouched; P324_DELAY_MS's injected wait is the one test
# hook (the residue's slow activation made on purpose). Each edit is an exact replacement matching once; where the heads
# differ, the first alternative that matches is taken.
#   hold / release.call / release   SLSDisableUpdate taken / SLSReenableUpdate called / returned (Unix ms, stderr "P324 ")
#   act / act.delay / act.restore / dlv.post / dlv.above / dlv.restore / dlv.end   route 3's activation and delivery guard
#   python3 -I patch-log.py <native/engine/Sources/Engine> [--secure-on]
#     --secure-on   B's `caretFirstCoversSecureFields` turned on (the password-field variant)
import sys

root = sys.argv[1]
secure_on = '--secure-on' in sys.argv[2:]


def patch(name, edits):
    path = f'{root}/{name}'
    text = open(path).read()
    for alternatives in edits:
        for old, new in alternatives:
            if text.count(old) == 1:
                text = text.replace(old, new)
                break
        else:
            sys.exit(f'{path}: no alternative matched once: {alternatives[0][0][:100]!r}')
    open(path, 'w').write(text)
    print(f'patched {path}: {len(edits)} edits')


open(f'{root}/P324.swift', 'w').write(r'''import Foundation

// #324's A/B logging (scripts/probe-324/patch-log.py); never on any engine branch.
func p324(_ event: String, _ fields: [String: Any] = [:]) {
  var o = fields
  o["ev"] = event
  o["t"] = (Date().timeIntervalSince1970 * 10_000).rounded() / 10
  guard JSONSerialization.isValidJSONObject(o), let d = try? JSONSerialization.data(withJSONObject: o),
        let s = String(data: d, encoding: .utf8) else { return }
  FileHandle.standardError.write(Data("P324 \(s)\n".utf8))
}

let p324Delay: (Double, Double)? = {
  guard let s = ProcessInfo.processInfo.environment["P324_DELAY_MS"] else { return nil }
  let parts = s.split(separator: "-").compactMap { Double($0) }
  return parts.count == 2 && parts[0] <= parts[1] ? (parts[0], parts[1]) : nil
}()
func p324DelayMs() -> Double { p324Delay.map { Double.random(in: $0.0...$0.1) } ?? 0 }
''')
print(f'wrote {root}/P324.swift')

patch('Activation.swift', [
    [("    _ = disableUpdate?(connection)\n    return { _ = reenableUpdate?(connection) }",
      "    _ = disableUpdate?(connection)\n    p324(\"hold\")\n    return { p324(\"release.call\"); _ = reenableUpdate?(connection); p324(\"release\") }"),
     ("    _ = disableUpdate(connection)\n    stamp.arm()\n    return {\n      stamp.stamp(monotonicMilliseconds())\n      _ = reenableUpdate(connection)\n    }",
      "    _ = disableUpdate(connection)\n    p324(\"hold\")\n    stamp.arm()\n    return {\n      stamp.stamp(monotonicMilliseconds())\n      p324(\"release.call\")\n      _ = reenableUpdate(connection)\n      p324(\"release\")\n    }")],
    [("    postActivation(planned)\n    let started = system.now()\n",
      "    postActivation(planned)\n    let started = system.now()\n    p324(\"act\", [\"pid\": Int(pid), \"kind\": \"\\(planned.kind)\", \"untilOrder\": untilOrderReadsBack])\n")],
    [("        stable = 0\n        userWindow.restore()\n",
      "        stable = 0\n        userWindow.restore()\n        p324(\"act.restore\")\n")],
    [("    if holdsThroughDelivery {\n      keepsHold = true\n",
      "    if holdsThroughDelivery, p324Delay != nil {\n      let p324Wait = p324DelayMs()\n      p324(\"act.delay\", [\"ms\": p324Wait])\n      system.sleep(p324Wait)\n    }\n"
      "    if holdsThroughDelivery {\n      keepsHold = true\n")],
    [("    post()\n    let posted = system.now()\n",
      "    post()\n    let posted = system.now()\n    p324(\"dlv.post\", [\"untilOrder\": hold.untilOrderReadsBack, \"ownHold\": action === self, \"postedAfterHoldStartMs\": posted - hold.startedAt])\n")],
    [("            if raiseSeen == nil { raiseSeen = at }\n",
      "            if raiseSeen == nil { raiseSeen = at; p324(\"dlv.above\", [\"ms\": at - posted]) }\n")],
    [("        window.restore()\n        if !released { outcome.restores += 1 }\n",
      "        window.restore()\n        p324(\"dlv.restore\", [\"released\": released, \"ms\": system.now() - posted])\n        if !released { outcome.restores += 1 }\n")],
    [("    let held = ended - hold.startedAt\n    hold.release()\n",
      "    let held = ended - hold.startedAt\n    p324(\"dlv.end\", [\"guardMs\": outcome.guardMs, \"heldMs\": held, \"capped\": outcome.capped])\n    hold.release()\n")],
])

if secure_on:
    patch('ElementInput.swift', [[("let caretFirstCoversSecureFields = false\n", "let caretFirstCoversSecureFields = true  // #324's password-field variant\n")]])
