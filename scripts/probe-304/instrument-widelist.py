# #304's final A/B, the fix's build in the diagnostic groups only (applied after scripts/probe-304/instrument.py to a
# runner-side worktree of fix/304-wide-list; nothing here reaches a product branch). Each wide list `judged` (Walk.swift,
# `shownChildPositions` over a list of more than 100) is also recorded as `probeWideLists`, one entry per list:
#   {role, count, shown (positions taken up), ms (the call's own time), reads: [[position, µs, framed]] in read order,
#    roles: {position: role}}
# where `roles` names the list's last 8 children and every child whose frame read took more than 0.5 ms, read after
# the timed call so `wideListMs` does not carry them. It tells where a list's slow frame reads lie: among its last
# children (a table's columns and header groups) or spread over its rows.
#   python3 -I scripts/probe-304/instrument-widelist.py <engine sources dir>
import sys, os
src = sys.argv[1]

def patch(name, old, new):
    path = os.path.join(src, name)
    text = open(path).read()
    assert text.count(old) == 1, (name, old)
    open(path, 'w').write(text.replace(old, new))

patch('Walk.swift', '  var probeRows: [[Any]] = []\n',
      '  var probeRows: [[Any]] = []\n'
      '  var probeWideLists: [[String: Any]] = []\n')
patch('Walk.swift',
      '    return source.costs.time("wideList") {\n'
      '      shownChildPositions(item.read.children, frame: { self.source.frame($0) }, window: area, expired: { [self] in pastDeadline() })\n'
      '    }\n',
      '    let probeChildren = item.read.children\n'
      '    var probeIndex: [UnsafeMutableRawPointer: Int] = [:]\n'
      '    for (i, child) in probeChildren.enumerated() { probeIndex[Unmanaged.passUnretained(child).toOpaque()] = i }\n'
      '    var probeReads: [[Any]] = []\n'
      '    let probeStart = monotonicMilliseconds()\n'
      '    let probeResult = source.costs.time("wideList") {\n'
      '      shownChildPositions(probeChildren, frame: { element in\n'
      '        let t0 = monotonicMilliseconds()\n'
      '        let found = self.source.frame(element)\n'
      '        probeReads.append([probeIndex[Unmanaged.passUnretained(element).toOpaque()] ?? -1, Int((monotonicMilliseconds() - t0) * 1000), found != nil])\n'
      '        return found\n'
      '      }, window: area, expired: { [self] in pastDeadline() })\n'
      '    }\n'
      '    let probeMs = monotonicMilliseconds() - probeStart\n'
      '    var probeRoles: [String: String] = [:]\n'
      '    let probeNamed = Set(max(0, probeChildren.count - 8)..<probeChildren.count).union(probeReads.compactMap { r in (r[1] as! Int) > 500 ? r[0] as? Int : nil })\n'
      '    for i in probeNamed where i >= 0 && i < probeChildren.count { probeRoles[String(i)] = stringAttribute(probeChildren[i], kAXRoleAttribute) ?? "?" }\n'
      '    probeWideLists.append(["role": item.read.data.role, "count": probeChildren.count, "shown": probeResult.map { $0.count } ?? -1,\n'
      '                           "ms": probeMs, "reads": probeReads, "roles": probeRoles])\n'
      '    return probeResult\n')
patch('Skyshot.swift', '    skyshot["probeMenu"] = walk.menuBar.count\n',
      '    skyshot["probeMenu"] = walk.menuBar.count\n'
      '    skyshot["probeWideLists"] = walk.probeWideLists\n')
print('instrumented wide lists', src)
