// Logging only, in a detached hosted tree. No reads, timing gates, forced routes or argument changes.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2],dir=join(root,'native/engine/Sources/Engine');
function edit(name,old,next){const p=join(dir,name),s=readFileSync(p,'utf8');if(s.split(old).length!==2)throw Error('unique hook missing '+name);writeFileSync(p,s.replace(old,next));}
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted only');
writeFileSync(join(dir,'Probe389.swift'),`import AppKit
import Foundation
func probe389(_ kind: String, _ fields: [String:Any] = [:]) {
 var r=fields; r["kind"]=kind; r["at"]=Date().timeIntervalSince1970*1000
 r["frontmostPid"]=NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
 if let b=try? JSONSerialization.data(withJSONObject:r,options:[.sortedKeys]) { FileHandle.standardError.write(Data("PROBE389 ".utf8)+b+Data("\\n".utf8)) }
}
`);
edit('Activation.swift','  private func postClick(at point: CGPoint) {','  private func postClick(at point: CGPoint) {\n    probe389("activation.inertClick", ["pid":pid,"windowID":windowID ?? 0,"x":point.x,"y":point.y])');
edit('FocusHold.swift','    meta.inputRoute = .activation','    probe389("hold.request", ["pid":pid,"alreadyHeld":context.connection.focusHeld.contains(pid)])\n    meta.inputRoute = .activation');
edit('DesktopGate.swift','  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }','  probe389("post", ["pid":pid,"type":event.type.rawValue,"x":event.location.x,"y":event.location.y,"windowID":event.getIntegerValueField(eventField(91))])\n  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }');
edit('DesktopGate.swift','  DesktopGate.allows("AXUIElementPerformAction(\\(action))") ? AXUIElementPerformAction(element, action as CFString) : .cannotComplete',`  probe389("perform.begin", ["action":action])
  let result = DesktopGate.allows("AXUIElementPerformAction(\\(action))") ? AXUIElementPerformAction(element, action as CFString) : .cannotComplete
  probe389("perform.end", ["action":action,"error":result.rawValue])
  return result`);
