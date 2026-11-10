// Runner-only instrumentation of a scratch worktree of the pinned engine. Never applied to the probe checkout or
// proposed as production code. usage: node patch.mjs <source-root>
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2];
if(!root)throw Error('usage: patch.mjs <source-root>');
const engine=join(root,'native/engine/Sources/Engine'),path=join(engine,'Input.swift');
let s=readFileSync(path,'utf8');
// Each hook point must occur exactly once at the pin, or the patch refuses rather than instrument the wrong place.
function once(anchor,replacement){
 const n=s.split(anchor).length-1;
 if(n!==1)throw Error(`engine hook ${n?'ambiguous':'missing'} (${n}): ${anchor.slice(0,90)}`);
 s=s.replace(anchor,()=>replacement);
}
// press_key: the observer is registered before the route's activation hold, so that hold's traffic is pre-post.
once('      let target = signposted("pressKey.keyboardTarget") { keyboardTarget(application, fallback: pid) }\n',
`      let target = signposted("pressKey.keyboardTarget") { keyboardTarget(application, fallback: pid) }
      let fence354 = Fence354Key(args, pid: pid)
      defer { fence354.close() }
`);
once('      try signposted("pressKey.post") { try keyPresses(presses, checkIntervention: guarding.checkInFlight, post: { poster.post($0) }, meta: &meta) }\n      return ["meta": meta.wire]\n',
`      fence354.willPost()
      try signposted("pressKey.post") { try keyPresses(presses, checkIntervention: guarding.checkInFlight, post: { poster.post($0) }, meta: &meta) }
      let fence354Result = fence354.didPost(poster: poster)
      return ["meta": meta.wire, "fence354": fence354Result]
`);
// type_text: the snapshot is the last thing before the first text event; the readback follows the last one.
once('      try keyText(typedUnits(text, press: layout.press(for:)), concealed: concealed,\n',
`      let readback354 = Fence354Readback(args, pid: pid, text: text, concealed: concealed)
      try keyText(typedUnits(text, press: layout.press(for:)), concealed: concealed,
`);
once('                  meta: &meta)\n      return ["meta": meta.wire]\n    } catch let error as EngineError {\n      throw withMeta(error, meta)\n    }\n  }\n\n  /// A spike cell\'s forced route 3',
`                  meta: &meta)
      return ["meta": meta.wire, "readback354": readback354.confirm()]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  /// A spike cell's forced route 3`);
writeFileSync(path,s);
for(const [from,to] of [['fence.swift','Fence354.swift'],['logic.swift','Fence354Logic.swift']])copyFileSync(new URL('./'+from,import.meta.url),join(engine,to));
console.log('patched',path);
