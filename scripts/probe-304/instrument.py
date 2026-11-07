# #304 probe builds only (the workflow applies this to runner-side worktrees of main; nothing here reaches a product
# branch). The observation also returns:
#   probeRecord  the stale-point guard's own record (`lineage.screenshot.nodes`), [role, depth, subtreeRecorded, frame,
#                shown, thinGap, gapsBelow.count] per framed node in the record's order;
#   probeReads   the walk's raw reads in emission order (the record's input, `screenshotReads`, frameless nodes too):
#                [number, parent, depth, role, frame, AXChildren count, chosen children (width rule), clipsDescendants,
#                bytes the selection charged, selection order (-1 record-only), entered at once, expanded, recordOnly];
#   probeMenu    the menu bar's node count (the selection's node limit is the budget less it).
# `--wide` also raises the walk's node, byte and deadline budgets (as #299's wide engine did), so an observation holds
# the window's whole tree for the offline simulation.
#   python3 -I scripts/probe-304/instrument.py <engine sources dir> [--wide]
import sys, os
src = sys.argv[1]
wide = '--wide' in sys.argv[2:]

def patch(name, old, new):
    path = os.path.join(src, name)
    text = open(path).read()
    assert text.count(old) == 1, (name, old)
    open(path, 'w').write(text.replace(old, new))

patch('Walk.swift', '  private(set) var recordOnlyReads = 0\n',
      '  private(set) var recordOnlyReads = 0\n'
      '  var probeRows: [[Any]] = []\n'
      '  var probeOrder: [ElementKey: (Int, Int)] = [:]\n')
patch('Walk.swift', '        selectionBytes += jsonBytes(read.wire) + 1\n',
      '        let probeBytes = jsonBytes(read.wire) + 1\n'
      '        selectionBytes += probeBytes\n'
      '        probeOrder[key] = (probeOrder.count, probeBytes)\n')
patch('Walk.swift', '      let number = emit(item.read, depth: visit.depth, parent: visit.parent, inherited: visit.inherited, inMenu: false)\n',
      '      let number = emit(item.read, depth: visit.depth, parent: visit.parent, inherited: visit.inherited, inMenu: false)\n'
      '      probeRows.append([number, visit.parent.map { $0 as Any } ?? NSNull(), visit.depth, item.read.data.role, rectWire(item.read.data.frame),\n'
      '                        item.read.data.children.count, item.read.children.count, clipsDescendants(role: item.read.data.role, actions: item.read.actions),\n'
      '                        probeOrder[key]?.1 ?? 0, probeOrder[key]?.0 ?? -1, enters(item, key), item.expanded, false])\n')
patch('Walk.swift', '      emitRecord(item.read.children + item.recordChildren, parent: number, depth: depth + 1)\n',
      '      probeRows.append([number, parent, depth, data.role, rectWire(data.frame), data.children.count, item.read.children.count,\n'
      '                        clipsDescendants(role: data.role, actions: item.read.actions), 0, -1, enters(item, ElementKey(element: element)), item.expanded, true])\n'
      '      emitRecord(item.read.children + item.recordChildren, parent: number, depth: depth + 1)\n')
patch('Skyshot.swift', '    if let settleMarker { skyshot["settle"] = settleMarker }\n',
      '    if let settleMarker { skyshot["settle"] = settleMarker }\n'
      '    if let probeRecord = lineage.screenshot?.nodes {\n'
      '      skyshot["probeRecord"] = probeRecord.map { n -> [Any] in [n.role, n.depth, n.subtreeRecorded, rectWire(n.frame), n.shown.map { rectWire($0) } ?? NSNull(), n.thinGap, n.gapsBelow.count] }\n'
      '    }\n'
      '    skyshot["probeReads"] = walk.probeRows\n'
      '    skyshot["probeMenu"] = walk.menuBar.count\n')
if wide:
    patch('Walk.swift', 'let maxObservedNodes = 4_000\n', 'let maxObservedNodes = 150_000\n')
    patch('Walk.swift', 'let observationDeadlineMs: Int64 = 10_000\n', 'let observationDeadlineMs: Int64 = 180_000\n')
    patch('Walk.swift', 'let skyshotByteBudget = 6 * 1024 * 1024\n', 'let skyshotByteBudget = 384 * 1024 * 1024\n')
    patch('Protocol.swift', 'let maxFrameSize = 8 * 1024 * 1024\n', 'let maxFrameSize = 768 * 1024 * 1024\n')
else:
    patch('Protocol.swift', 'let maxFrameSize = 8 * 1024 * 1024\n', 'let maxFrameSize = 64 * 1024 * 1024\n')
print('instrumented', src, 'wide' if wide else 'main')
