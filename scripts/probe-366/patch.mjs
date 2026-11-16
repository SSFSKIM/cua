// Runner-only patches to a detached, pinned main tree. No product files in the kit branch change.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function render(root) {
 const files=new Map(),dir=join(root,'native/engine/Sources/Engine');
 const edit=(name,from,to)=>{
  const key=join(dir,name),s=files.get(key)??readFileSync(key,'utf8');
  if(s.split(from).length!==2)throw Error('exact unique hook missing in '+name+': '+from);
  files.set(key,s.replace(from,to));
 };
 edit('DesktopGate.swift','  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }',
`  spike366Log("post", ["eventType": event.type.rawValue, "pid": pid, "x": event.location.x, "y": event.location.y,
                        "subtype": NSEvent(cgEvent: event)?.subtype.rawValue ?? 0, "window": event.getIntegerValueField(eventField(91))])
  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }`);
 // DesktopGate does not otherwise import AppKit.
 edit('DesktopGate.swift','import Foundation','import Foundation\nimport AppKit');
 edit('DesktopGate.swift','  DesktopGate.allows("AXUIElementPerformAction(\\(action))") ? AXUIElementPerformAction(element, action as CFString) : .cannotComplete',
`  spike366Log("perform.begin", ["action": action, "element": CFHash(element)])
  let error = DesktopGate.allows("AXUIElementPerformAction(\\(action))") ? AXUIElementPerformAction(element, action as CFString) : .cannotComplete
  spike366Log("perform.end", ["action": action, "element": CFHash(element), "error": error.rawValue])
  return error`);
 edit('DesktopGate.swift','  DesktopGate.allows("AXUIElementSetAttributeValue(\\(attribute))") ? AXUIElementSetAttributeValue(element, attribute as CFString, value) : .cannotComplete',
`  spike366Log("write.begin", ["attribute": attribute, "element": CFHash(element)])
  let error = DesktopGate.allows("AXUIElementSetAttributeValue(\\(attribute))") ? AXUIElementSetAttributeValue(element, attribute as CFString, value) : .cannotComplete
  spike366Log("write.end", ["attribute": attribute, "element": CFHash(element), "error": error.rawValue])
  return error`);
 edit('AX.swift','  return (error == .success ? value : nil, error)',
`  if ["AXValue", "AXFocused", "AXMain", "AXFrontmost"].contains(attribute) {
    var record: [String: Any] = ["attribute": attribute, "element": CFHash(element), "error": error.rawValue]
    if let v = value as? String { record["value"] = String(v.prefix(120)) }
    else if let v = value as? NSNumber { record["value"] = v }
    spike366Log("read", record)
  }
  return (error == .success ? value : nil, error)`);
 edit('FocusHold.swift','    elementActionRoute(believesFocus: ActivationSystem().believesItHasFocus(owner), insideHeldMenu: connection.menuSpan.app == app.key)',
`    if ["bare", "bare-no-focus"].contains(spike366Variant) { spike366Log("candidate.skipHold"); return .action }
    return elementActionRoute(believesFocus: ActivationSystem().believesItHasFocus(owner), insideHeldMenu: connection.menuSpan.app == app.key)`);
 edit('ElementInput.swift','  guard let role = fieldNeedingFocus(element, ax: ax) else { return false }',
`  if ["no-focus", "bare-no-focus"].contains(spike366Variant) { spike366Log("candidate.skipFieldFocus"); return false }
  guard let role = fieldNeedingFocus(element, ax: ax) else { return false }`);
 edit('Activation.swift','  private func postClick(at point: CGPoint) {',
`  private func postClick(at point: CGPoint) {
    if spike366Variant == "no-click" { spike366Log("candidate.skipActivationClick", ["x": point.x, "y": point.y]); return }`);
 edit('Input.swift','        let pointing = ElementPointing(target.element, owner: target.owner, ax: ax)',
`        if args["probe366HoldOnly"] as? Bool == true {
          try holdElementFocus(target, app: app, appPid: appPid, guarding: guarding, context: context, meta: &meta)
          return ["meta": meta.wire]
        }
        let pointing = ElementPointing(target.element, owner: target.owner, ax: ax)`);
 for(const [file,signature] of [['Input.swift','  func click(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {'],['ValueSetting.swift','  func setValue(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {']]) {
  edit(file,signature,signature+'\n    let probe366Finish = spike366Scope(args); defer { probe366Finish() }');
 }
 return files;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const root=process.argv[2];if(!root)throw Error('patch.mjs <detached-main-tree> [--check]');
 const files=render(root);
 if(!process.argv.includes('--check')) {
  if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('materializing patches is hosted-only');
  for(const [path,s]of files)writeFileSync(path,s);
  copyFileSync(new URL('./trace.swift',import.meta.url),join(root,'native/engine/Sources/Engine/Spike366.swift'));
 }
 console.log(JSON.stringify({checked:process.argv.includes('--check'),files:[...files.keys()]}));
}
