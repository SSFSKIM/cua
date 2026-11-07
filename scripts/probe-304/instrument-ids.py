# #304 probe builds only, applied after scripts/probe-304/instrument.py (the workflow applies both to a runner-side
# worktree; nothing here reaches a product branch). Each `probeReads` row gains a 14th field, index 13, `chosenIds`: the
# row's chosen children (the width rule's list, `chosen` at index 6 long; a record-only row's own and record-only
# children after them) in their order, each as the `number` (index 0) of the row it was emitted as, wherever it was
# emitted first: a child another parent listed earlier (Chromium's cell, under its row and its column) carries that
# row's number. null for a child the walk never emitted (a failed read, the depth limit, a cycle, or the record's
# negative numbers, which the walk's `seen` does not hold).
#   python3 -I scripts/probe-304/instrument-ids.py <engine sources dir>
import sys, os
src = sys.argv[1]

def patch(name, old, new):
    path = os.path.join(src, name)
    text = open(path).read()
    assert text.count(old) == 1, (name, old)
    open(path, 'w').write(text.replace(old, new))

patch('Walk.swift', '  var probeRows: [[Any]] = []\n',
      '  var probeRows: [[Any]] = []\n'
      '  var probeKids: [[AXUIElement]] = []\n')
patch('Walk.swift', '                        probeOrder[key]?.1 ?? 0, probeOrder[key]?.0 ?? -1, enters(item, key), item.expanded, false])\n',
      '                        probeOrder[key]?.1 ?? 0, probeOrder[key]?.0 ?? -1, enters(item, key), item.expanded, false])\n'
      '      probeKids.append(item.read.children)\n')
patch('Walk.swift', '                        clipsDescendants(role: data.role, actions: item.read.actions), 0, -1, enters(item, ElementKey(element: element)), item.expanded, true])\n',
      '                        clipsDescendants(role: data.role, actions: item.read.actions), 0, -1, enters(item, ElementKey(element: element)), item.expanded, true])\n'
      '      probeKids.append(item.read.children + item.recordChildren)\n')
patch('Skyshot.swift', '    skyshot["probeReads"] = walk.probeRows\n',
      '    skyshot["probeReads"] = zip(walk.probeRows, walk.probeKids).map { row, kids -> [Any] in\n'
      '      row + [kids.map { child -> Any in walk.seen[ElementKey(element: child)].map { $0 as Any } ?? NSNull() }]\n'
      '    }\n')
print('instrumented ids', src)
