# #321's candidates as instrument patches to main's engine, applied on the runner only to a copy (never committed to
# any engine branch). Each edit is an exact replacement that must match once.
#   a  shared mode: the activation-point click is skipped before a pointer holder's own left mouse down (a shared
#      PointerHold, `defersArmClick`), so that mouse down meets the unused arm; the inert click outside the frame is kept
#      for the release as for any deferred hold. #282's refusal of a web-area pointer without an activation-point click
#      is bypassed, so the click is measured, not refused.
#   b  both modes: the activation-point click is replaced by the inert down/up just outside the window's frame, posted
#      right after subtype 1 (never deferred); #282's refusal bypassed the same way.
#   python3 -I patch.py <a|b> <native/engine/Sources/Engine>
import sys

variant, root = sys.argv[1], sys.argv[2]
path = f'{root}/Activation.swift'
text = open(path).read()


def edit(old, new):
    global text
    n = text.count(old)
    if n != 1:
        sys.exit(f'{path}: expected one match, found {n}: {old[:90]!r}')
    text = text.replace(old, new)


PLAN = ("    let plan = activationClickPlan(decision, activationPoint: activationPoint, windowFrame: windowFrame, windowID: windowID, sparing: sparing)\n"
        "    return PlannedClick(activationPoint: activationPoint, decision: decision, kind: plan.kind, point: plan.point)")
OUTSIDE = ("activationClickPlan(.outsideFrame, activationPoint: activationPoint, windowFrame: windowFrame, windowID: windowID, "
           "sparing: sparing)")
if variant == 'a':
    edit(PLAN, "    var plan = activationClickPlan(decision, activationPoint: activationPoint, windowFrame: windowFrame, windowID: windowID, sparing: sparing)\n"
               f"    if defersArmClick, plan.kind == .activationPoint {{ plan = {OUTSIDE} }}  // #321 candidate a\n"
               "    return PlannedClick(activationPoint: activationPoint, decision: decision, kind: plan.kind, point: plan.point)")
elif variant == 'b':
    edit(PLAN, "    var plan = activationClickPlan(decision, activationPoint: activationPoint, windowFrame: windowFrame, windowID: windowID, sparing: sparing)\n"
               f"    if plan.kind == .activationPoint {{ plan = {OUTSIDE}; p321Replaced = true }}  // #321 candidate b\n"
               "    return PlannedClick(activationPoint: activationPoint, decision: decision, kind: plan.kind, point: plan.point)")
    edit("  var defersArmClick = false\n", "  var defersArmClick = false\n  /// #321 candidate b: the activation-point click was replaced by the early inert click.\n  var p321Replaced = false\n")
    edit("    if case .inertOutside(let place, _) = planned.kind, defersArmClick, let point = planned.point {",
         "    if case .inertOutside(let place, _) = planned.kind, defersArmClick, !p321Replaced, let point = planned.point {")
else:
    sys.exit(f'unknown variant {variant}')
edit("    if refusesPointerWithoutActivationPointClick, planned.kind != .activationPoint { throw PointerRefused() }",
     "    if false, refusesPointerWithoutActivationPointClick, planned.kind != .activationPoint { throw PointerRefused() }  // #321: bypassed")
open(path, 'w').write(text)
print(f'patched {path} for candidate {variant}')
