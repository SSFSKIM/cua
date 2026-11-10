// Hosted scratch source only. Observational audit, not the spike's shadow exact-reader patch.
import {readFileSync,writeFileSync,readdirSync,copyFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function patchAudit(root){
 const dir=join(root,'native/engine/Sources/Engine'),input=join(dir,'Input.swift');
 const anchor='  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {';
 const s=readFileSync(input,'utf8');
 if(s.split(anchor).length!==2)throw Error('typeText audit hook missing or ambiguous');
 if(s.includes('probe354Audit'))throw Error('source already audited');
 const sources=[];
 function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.swift'))sources.push(p)}}walk(dir);
 const apis={AXUIElementCopyAttributeValue:'probe354CopyAttributeValue',AXUIElementCopyMultipleAttributeValues:'probe354CopyMultipleAttributeValues',AXUIElementCopyParameterizedAttributeValue:'probe354CopyParameterizedAttributeValue'},counts={};
 for(const p of sources){let text=readFileSync(p,'utf8');
  if(p===input)text=text.replace(anchor,anchor+'\n    let probe354AuditTag = Probe354Audit.shared.begin(args)\n    defer { Probe354Audit.shared.finish(probe354AuditTag) }');
  for(const [from,to]of Object.entries(apis)){const re=new RegExp('\\b'+from+'(?=\\s*\\()','g');text=text.replace(re,()=>{counts[from]=(counts[from]??0)+1;return to})}
  writeFileSync(p,text);
 }
 if(!counts.AXUIElementCopyAttributeValue||!counts.AXUIElementCopyMultipleAttributeValues||!counts.AXUIElementCopyParameterizedAttributeValue)throw Error('expected AX audit boundaries missing');
 copyFileSync(new URL('./audit.swift',import.meta.url),join(dir,'Probe354Audit.swift'));
 return {audit:'counts attempted text-bearing and selection-range reads only; no AX requests added; response semantics unchanged',hooks:counts};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('usage: audit-patch.mjs <scratch-source-root>');console.log(JSON.stringify(patchAudit(process.argv[2])));
}
