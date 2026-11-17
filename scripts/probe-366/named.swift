import AppKit
import ApplicationServices
import Foundation

// Probe-only target resolution: no Skyshot, lineage walk, AXValue read or full observation.
// The normal click execute pipeline still performs its production input enablement before this method.
private func spike366FindButton(_ application: AXUIElement, name: String, role: String = kAXButtonRole) -> AXUIElement? {
  var queue = [application], seen = Set<CFHashCode>(), i = 0
  while i < queue.count && i < 500 {
    let e = prepare(queue[i]); i += 1
    if !seen.insert(CFHash(e)).inserted { continue }
    if attribute(e,kAXRoleAttribute) as? String == role,
       (attribute(e,kAXTitleAttribute) as? String == name || attribute(e,kAXDescriptionAttribute) as? String == name) { return e }
    queue += (attribute(e,kAXChildrenAttribute) as? [AXUIElement]) ?? []
  }
  return nil
}

extension Engine {
  func spike366NamedPress(_ args: [String:Any], _ context: ExecutionContext, name: String) throws -> Any {
    var meta = InputMeta(context)
    do {
      let (app,pid,guarding) = try inputPrologue(args,context,meta:&meta)
      let application = prepare(AXUIElementCreateApplication(pid)), started = monotonicMilliseconds()
      var button: AXUIElement?
      repeat {
        button = spike366FindButton(primaryWindow(of:application) ?? application,name:name)
        if button != nil { break }
        usleep(50_000)
      } while monotonicMilliseconds() - started < 4_000
      guard let button else { throw EngineError(name:"probeTargetMissing", "The owned probe button was not available.") }
      let owner = ownerPid(of:button,fallback:pid)
      try refuseForbiddenOwner(owner)
      actionTargets(owner,app:app,connection:context.connection)
      let pointing = ElementPointing(button,owner:owner,ax:.live)
      var webFrame: CGRect?
      if spike366Variant == "inert-toolbar" {
        var ancestor: AXUIElement? = button
        for _ in 0..<30 {
          guard let e = ancestor else { break }
          if attribute(e,kAXRoleAttribute) as? String == "AXWebArea" { webFrame = frame(of:e); break }
          ancestor = elementAttribute(e,kAXParentAttribute)
        }
      }
      let screen = CGDisplayBounds(CGMainDisplayID())
      let candidate: CGPoint?
      do { candidate = try spike366CandidatePoint(spike366Variant,window:pointing.windowFrame,web:webFrame,screen:screen) }
      catch { throw EngineError(name:"probePointUnavailable", "The intended inside-window candidate region is not available.") }
      if let candidate { Thread.current.threadDictionary["probe366InertPoint"] = [Double(candidate.x),Double(candidate.y)] }
      let actions = establishedActionNames(of:button) ?? []
      let probe: [String:Any] = ["lookupMs":monotonicMilliseconds()-started,"pid":owner,"window":pointing.windowID as Any? ?? NSNull(),
        "actions":actions,"windowFrame":spike366FrameWire(pointing.windowFrame),"webAreaFrame":spike366FrameWire(webFrame),
        "screenFrame":spike366FrameWire(screen),"candidatePoint":candidate.map { [Double($0.x),Double($0.y)] } as Any? ?? NSNull()]
      spike366Log("named.lookup",probe)
      meta.elementClick = elementClickRecord(.action(kAXPressAction),forced:.action,button:.left,count:1,actions:actions,hit:nil)
      if Thread.current.threadDictionary["probe366PressDeadline"] != nil {
        if let field = spike366FindButton(primaryWindow(of:application) ?? application,name:"Probe search",role:kAXTextFieldRole) {
          Thread.current.threadDictionary["probe366SignalElement"] = field
        }
        spike366BeforeThresholdArming()
      }
      try armingSettle(&meta,acted:{ context.connection.markActed(app) }) { meta in
        try elementActionClick(button,owner:owner,action:kAXPressAction,route:actionRoute(owner:owner,app:app,connection:context.connection),
                               point:pointing.point,windowID:pointing.windowID,app:app,appPid:pid,guarding:guarding,context:context,meta:&meta)
      }
      return ["meta":meta.wire,"probe366":probe]
    } catch let error as EngineError { throw withMeta(error,meta) }
  }
}
