// Runner-only instrumentation. Never applied to the probe checkout or proposed as production code.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2];
const path=join(root,'native/engine/Sources/Engine/Input.swift');
let s=readFileSync(path,'utf8');
function replace(a,b){if(!s.includes(a))throw Error('engine hook missing: '+a);s=s.replace(a,b);}
replace('      return ["meta": meta.wire]\n    } catch let error as EngineError {\n      throw withMeta(error, meta)\n    }\n  }\n\n  // MARK: type_text',
`      let probe = spike354Wait(args, application: application, text: nil)
      return ["meta": meta.wire, "probe354": probe]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  // MARK: type_text`);
replace('      let poster = EventPoster.toProcess(target, sourceState: privateSourceArg(args) ? .privateState : .hidSystemState)\n      let initialSource',
`      if let key = args["spike354PreKey"] as? String {
        _ = try pressKey(["pid": pid, "key": key], context)
      }
      let poster = EventPoster.toProcess(target, sourceState: privateSourceArg(args) ? .privateState : .hidSystemState)
      let initialSource`);
replace('                  meta: &meta)\n      return ["meta": meta.wire]',
`                  meta: &meta)
      let probe = spike354Wait(args, application: application, text: text)
      return ["meta": meta.wire, "probe354": probe]`);
writeFileSync(path,s);
copyFileSync(new URL('./wait.swift',import.meta.url),join(root,'native/engine/Sources/Engine/Spike354.swift'));
