// Measurement-only hooks, applied to a detached pinned engine build, never this checkout's product source.
import {readFileSync,writeFileSync,copyFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function patch(root){
 root=realpathSync(root);const kit=realpathSync(new URL('../..',import.meta.url));if(root===kit)throw Error('refusing to patch kit product sources');
 const changes=new Map();
 function edit(name,a,b){const path=join(root,'native/engine/Sources/Engine',name);let s=changes.get(path)??readFileSync(path,'utf8');if(s.split(a).length!==2)throw Error('missing or nonunique hook '+name+': '+a);changes.set(path,s.replace(a,b))}
 edit('Input.swift','  func click(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {',`  func click(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    let spike359 = Spike359Session.start(args)
    defer { spike359?.close(); Spike359Session.active = nil }`);
 edit('Input.swift','        let target = ClickTarget(point: placed.point, windowFrame: placed.windowFrame, windowID: windowID, pid: owner)',`        let target = ClickTarget(point: placed.point, windowFrame: placed.windowFrame, windowID: windowID, pid: owner)
        if spike359?.mode != "natural" { spike359?.bind(hit) }`);
 edit('Input.swift','        let pointing = ElementPointing(target.element, owner: target.owner, ax: ax)',`        let pointing = ElementPointing(target.element, owner: target.owner, ax: ax)
        if spike359?.mode == "notify-selected" { spike359?.bind(target.element) }`);
 edit('Input.swift','      if let note = meta.note { result["note"] = note }\n      return result',`      if let note = meta.note { result["note"] = note }
      if let spike359 { result["probe359"] = spike359.finish() }
      return result`);
 edit('Input.swift',`    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  // MARK: press_key`, `    } catch let error as EngineError {
      var error = withMeta(error, meta)
      if let spike359, spike359.mode == "notify-selected" { error.extra["probe359"] = spike359.finish(refusal: error.errorName) }
      throw error
    }
  }

  // MARK: press_key`);
 edit('Input.swift','  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {',`  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    let spike359 = Spike359Session.startType(args)
    defer { Spike359Session.active = nil }`);
 edit('Input.swift','        return pasteResult(meta, note: note)',`        var result = pasteResult(meta, note: note)
        if let spike359 { result["probe359"] = spike359.finish() }
        return result`);
 edit('Input.swift',`                          meta: &meta)
      return ["meta": meta.wire]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }`, `                          meta: &meta)
      var result: [String: Any] = ["meta": meta.wire]
      if let spike359 { result["probe359"] = spike359.finish() }
      return result
    } catch let error as EngineError {
      var error = withMeta(error, meta)
      if error.errorName == "typeUnconfirmed", let spike359 { error.extra["probe359"] = spike359.finish() }
      throw error
    }`);
 edit('TypeReadback.swift','    plan = readbackSnapshot(reads: reads, settle: &settled)',`    Spike359Session.active?.typeSnapshotStart()
    plan = readbackSnapshot(reads: reads, settle: &settled)
    Spike359Session.active?.typeSnapshotEnd(plan)`);
 edit('TypeReadback.swift','      guard let expected = readbackExpected(before: before, range: range, typed: typed) else { throw unconfirmed(.rangeUnreadable, beforeKey) }',`      guard let expected = readbackExpected(before: before, range: range, typed: typed) else { throw unconfirmed(.rangeUnreadable, beforeKey) }
      Spike359Session.active?.typeExpect(expected)`);
 edit('AX.swift','  let error = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)\n  return (error == .success ? value : nil, error)',`  let begun359 = Date().timeIntervalSince1970 * 1000
  let error = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
  Spike359Session.active?.read(element, attribute, value, error, begun359)
  return (error == .success ? value : nil, error)`);
 edit('DesktopGate.swift','  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }',`  Spike359Session.active?.event("post-start", ["eventType": event.type.rawValue, "pid": pid, "x": event.location.x, "y": event.location.y])
  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }
  Spike359Session.active?.event("post-end", ["eventType": event.type.rawValue, "pid": pid])`);
 edit('DesktopGate.swift','  DesktopGate.allows("AXUIElementPerformAction(\\(action))") ? AXUIElementPerformAction(element, action as CFString) : .cannotComplete',`  Spike359Session.active?.event("action-start", ["name": action, "element": CFHash(element)])
  let result = DesktopGate.allows("AXUIElementPerformAction(\\(action))") ? AXUIElementPerformAction(element, action as CFString) : .cannotComplete
  Spike359Session.active?.event("action-end", ["name": action, "element": CFHash(element), "error": result.rawValue])
  return result`);
 edit('DesktopGate.swift','  DesktopGate.allows("AXUIElementSetAttributeValue(\\(attribute))") ? AXUIElementSetAttributeValue(element, attribute as CFString, value) : .cannotComplete',`  Spike359Session.active?.write(element, attribute, value, "write-start", nil)
  let result = DesktopGate.allows("AXUIElementSetAttributeValue(\\(attribute))") ? AXUIElementSetAttributeValue(element, attribute as CFString, value) : .cannotComplete
  Spike359Session.active?.write(element, attribute, value, "write-end", result)
  return result`);
 for(const [path,s]of changes)writeFileSync(path,s);
 copyFileSync(new URL('./trace.swift',import.meta.url),join(root,'native/engine/Sources/Engine/Spike359.swift'));
 return [...changes.keys()];
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(!process.argv[2])throw Error('detached source path required');console.log(patch(process.argv[2]).join('\n'))}
