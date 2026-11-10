// Runner-only instrumentation. Never applied to the probe checkout or proposed as production code.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2];
const path=join(root,'native/engine/Sources/Engine/Input.swift');
let s=readFileSync(path,'utf8');
function replace(a,b){if(!s.includes(a))throw Error('engine hook missing: '+a);s=s.replace(a,b);}
replace('      return ["meta": meta.wire]\n    } catch let error as EngineError {\n      throw withMeta(error, meta)\n    }\n  }\n\n  // MARK: type_text',
`      var probe = spike354Wait(args, application: application, text: nil)
      probe["pid"] = pid; probe["target"] = target
      return ["meta": meta.wire, "probe354": probe]
    } catch let error as EngineError {
      throw withMeta(error, meta)
    }
  }

  // MARK: type_text`);
replace('  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {',
`  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {
    // Same-RPC changes only the RPC boundary: the key precedes ALL normal text preflight in both arms.
    var spike354PreKeyResult: Any?
    if let key = args["spike354PreKey"] as? String {
      var keyArgs = args
      keyArgs["key"] = key
      keyArgs.removeValue(forKey: "spike354PreKey")
      spike354PreKeyResult = try pressKey(keyArgs, context)
    }`);
replace('                  meta: &meta)\n      return ["meta": meta.wire]',
`                  meta: &meta)
      var probe = spike354Wait(args, application: application, text: text)
      probe["pid"] = pid; probe["target"] = target
      return ["meta": meta.wire, "probe354": probe, "preKey354": spike354PreKeyResult ?? NSNull()]`);
writeFileSync(path,s);
copyFileSync(new URL('./wait.swift',import.meta.url),join(root,'native/engine/Sources/Engine/Spike354.swift'));
