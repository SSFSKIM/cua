// Instruments a disposable engine worktree for the AX read-back probe (ax.swift): the probe file added to the engine target
// and started around type_text's paste route. Fails closed when its one seam is not found exactly once.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SEAM=`      case .paste:
        let note = try typeTextByPaste(`;
export const PATCHED=`      case .paste:
        let probe361 = Probe361Ax.start(args, pid: pid)
        defer { probe361?.finish() }
        let note = try typeTextByPaste(`;
export function patchInput(source){
  const n=source.split(SEAM).length-1;
  if(n!==1)throw Error(`paste seam found ${n} times`);
  return source.replace(SEAM,PATCHED);
}
export function patch(root){
  const dir=join(root,'native/engine/Sources/Engine'),input=join(dir,'Input.swift');
  writeFileSync(input,patchInput(readFileSync(input,'utf8')));
  copyFileSync(fileURLToPath(new URL('./ax.swift',import.meta.url)),join(dir,'Probe361Ax.swift'));
}
if(process.argv[1]===fileURLToPath(import.meta.url))patch(process.argv[2]);
