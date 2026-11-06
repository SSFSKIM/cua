# #305's A/B, the fix's build only (the workflow applies this to a runner-side worktree of fix/305-recorded-hit; nothing
# here reaches a product branch): the stalePoint meta of a `recordedHit` also says how `recordedHitAtPoint` matched the
# hit, by its own handle (CFEqual) or as a re-created one (role, frame within 2 pt, label), as `probeRecordedHitBy`.
#   python3 -I scripts/probe-305/instrument-hit.py <engine sources dir>
import sys, os
path = os.path.join(sys.argv[1], 'StalePoint.swift')
text = open(path).read()

def patch(old, new):
    global text
    assert text.count(old) == 1, old
    text = text.replace(old, new)

patch('func recordedHitAtPoint<Element>', 'nonisolated(unsafe) var probeRecordedHitBy: String?\n\nfunc recordedHitAtPoint<Element>')
patch('  if !handles.isEmpty { return handles.contains(where: showed) }',
      '  if !handles.isEmpty { probeRecordedHitBy = "handle"; return handles.contains(where: showed) }')
patch('  return nodes.contains { node in', '  probeRecordedHitBy = "recreated"\n  return nodes.contains { node in')
patch('    if afterActivation { wire["afterActivation"] = true }',
      '    if afterActivation { wire["afterActivation"] = true }\n    if reason == .recordedHit, let by = probeRecordedHitBy { wire["probeRecordedHitBy"] = by }')
open(path, 'w').write(text)
print('instrumented recordedHit', path)
