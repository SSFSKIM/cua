// Instruments a disposable worktree of main for the #398 census (never a product build): the engine's own identity
// match gains `ignoringPlaceholder` (default false, so every existing call is unchanged), and every committed
// observation reports its text-field pairs (Probe398Census.swift, on PROBE398_CENSUS=1 only). Exact-match edits: a seam
// that moved fails the patch, never a silent partial instrument.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const MATCHES_SEAM='  func matches(_ other: ElementIdentity, ignoringValue: Bool = false, sameElement: Bool = false) -> Bool {';
export const MATCHES_PATCHED='  func matches(_ other: ElementIdentity, ignoringValue: Bool = false, sameElement: Bool = false, ignoringPlaceholder: Bool = false) -> Bool {';
export const PLACEHOLDER_SEAM='&& placeholder == other.placeholder &&';
export const PLACEHOLDER_PATCHED='&& (ignoringPlaceholder || placeholder == other.placeholder) &&';
export const COMMIT_SEAM='  func commit(_ next: Revision) {\n    revision += 1\n    current = next\n  }';
export const COMMIT_PATCHED='  func commit(_ next: Revision) {\n    revision += 1\n    current = next\n    probe398Census(next, number: revision)\n  }';

const once=(text,seam,patched)=>{
  const at=text.indexOf(seam);
  if(at<0||text.indexOf(seam,at+1)>=0)throw Error('census seam not found exactly once: '+seam.slice(0,60));
  return text.slice(0,at)+patched+text.slice(at+seam.length);
};
export function patchLineage(text){
  return once(once(once(text,MATCHES_SEAM,MATCHES_PATCHED),PLACEHOLDER_SEAM,PLACEHOLDER_PATCHED),COMMIT_SEAM,COMMIT_PATCHED);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const root=process.argv[2];
  if(!root)throw Error('usage: patch-census.mjs <engine worktree>');
  const engine=join(root,'native/engine/Sources/Engine');
  const lineage=join(engine,'Lineage.swift');
  writeFileSync(lineage,patchLineage(readFileSync(lineage,'utf8')));
  copyFileSync(join(dirname(fileURLToPath(import.meta.url)),'Probe398Census.swift'),join(engine,'Probe398Census.swift'));
  console.log('census instrument applied');
}
