// Instrument only a disposable copy of the pinned reproduction engine.
import {readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const kit=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
export function patchEngine(root){
 root=realpathSync(root);if(root===kit)throw Error('patch requires a scratch engine, not the kit checkout');
 const dir=join(root,'native/engine/Sources/Engine'),input=join(dir,'Input.swift'),helper=join(dir,'Probe360.swift');
 const before=readFileSync(input,'utf8');
 const anchor='      meta.inputRoute = pressKeyRoute(forced: forced, presses: presses, believesFocus: ActivationSystem().believesItHasFocus(pid))';
 if(before.split(anchor).length!==2||existsSync(helper))throw Error('probe360 engine anchor absent, ambiguous, or already patched');
 const after=before.replace(anchor,`      if args["probe360Variant"] != nil {
        defer { context.connection.markActed(app) }
        return try probe360Press(args, application: application, presses: presses, pid: pid, target: target, guarding: guarding, meta: &meta)
      }
`+anchor);
 const body=readFileSync(new URL('./engine.swift',import.meta.url),'utf8');
 writeFileSync(input,after);writeFileSync(helper,body);
 return {patch:'360-v1',baseline:'production EventPoster.event and keyPresses, forced plain post (2-prime); original preflight retained',changes:[
  {path:'native/engine/Sources/Engine/Input.swift',before:hash(before),after:hash(after)},
  {path:'native/engine/Sources/Engine/Probe360.swift',before:null,after:hash(body)}]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(patchEngine(process.argv[2]),null,2));
