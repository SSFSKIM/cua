# #299/#301 probe builds only (the workflow applies this to a runner-side worktree; nothing here reaches a product
# branch): the observation also returns the stale-point guard's own record (`lineage.screenshot.nodes`) as
# `probeRecord`, [role, depth, subtreeRecorded, frame, shown] per node in the record's order, so the A/B judges the guard
# by what it would compare, record-only rows included; and the wire's frame limit is raised to carry it.
#   python3 -I scripts/probe-299/instrument.py <engine sources dir>
import sys, os
src = sys.argv[1]

def patch(name, old, new):
    path = os.path.join(src, name)
    text = open(path).read()
    assert text.count(old) == 1, (name, old)
    open(path, 'w').write(text.replace(old, new))

patch('Skyshot.swift', '    if let settleMarker { skyshot["settle"] = settleMarker }\n',
      '    if let settleMarker { skyshot["settle"] = settleMarker }\n'
      '    if let probeRecord = lineage.screenshot?.nodes {\n'
      '      skyshot["probeRecord"] = probeRecord.map { n -> [Any] in [n.role, n.depth, n.subtreeRecorded, rectWire(n.frame), n.shown.map { rectWire($0) } ?? NSNull()] }\n'
      '    }\n')
patch('Protocol.swift', 'let maxFrameSize = 8 * 1024 * 1024\n', 'let maxFrameSize = 32 * 1024 * 1024\n')
print('instrumented', src)
