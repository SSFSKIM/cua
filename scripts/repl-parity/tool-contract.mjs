// Independent oracle for Table 2 (surface-inventory.md:467-476), not imported from the own host's tools.
// Source: readable chatgpt-26.928.40906 R/cua_node/@oai/cua-repl/instructions/{macos,linux}/browser.md:1-44.
// Both platform files have the pinned SHA-256 below. Surviving instruction bytes are not rewritten.
import {isDeepStrictEqual} from 'node:util';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=readFileSync(new URL('../../test/repl-parity/fixtures/vendor-browser-instructions.md',import.meta.url));
if(createHash('sha256').update(bytes).digest('hex')!=='063027bad00dd242148c8f798a55f420ce5c893547b4d5b352747c8d04e79ed5')throw new Error('Pinned browser instruction source changed');
const browser=bytes.toString('utf8').trim();
export function toolDifferences(left,right){
 const out=[];
 function walk(a,b,path,hasA=true,hasB=true){
  if(hasA&&hasB&&isDeepStrictEqual(a,b))return;
  if(hasA&&hasB&&a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
   for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())walk(a[key],b[key],path?`${path}.${key}`:key,Object.hasOwn(a,key),Object.hasOwn(b,key));
  }else out.push({field:path,left:hasA?{present:true,value:a}:{present:false},right:hasB?{present:true,value:b}:{present:false}});
 }
 walk(left,right,'');return out;
}
export function validateToolAllowance(e){
 const keys=['kind','scope','field','transform','reason'];
 if(Object.keys(e).some(k=>!keys.includes(k))||e.kind!=='tools-description'||e.scope!=='production'||e.field!=='tools.0.description'||e.transform!=='table-2-browser-exclusions'||!e.reason)throw new Error('Invalid tools description allowance scope');
}
export function transformBrowserToolDescription(text,platform){
 if(!['darwin','linux'].includes(platform)||typeof text!=='string'||text.split(browser).length!==2)throw new Error('Tool description must contain exactly the pinned browser instruction source');
 const excluded=[
  ' (including the current IAB tab)',
  'To open a URL in the in-app browser (`@Browser`):\n\n```javascript\nlet tab = await cua.createBrowserTab("iab", url, { visible: boolean });\n```\n\n',
  '- `"mcpapps"`: use `cua.getBrowser({ id: "mcpapps" })` for existing full-screen MCP Apps in the task’s side panel.\n',
  '- `"iab"` (in-app browser): in `createBrowserTab`, use `visible: true` to show the browser; `false` to keep it hidden.\n',
 ];
 let retained=browser;
 for(const unit of excluded){if(retained.split(unit).length!==2)throw new Error('Pinned Table 2 exclusion changed');retained=retained.replace(unit,'');}
 return text.replace(browser,retained);
}
export function compareEffectiveTools(vendor,own,{expected=[],platform}={}){
 for(const e of expected)validateToolAllowance(e);
 if(expected.length>1)throw new Error('Duplicate tool description allowance');
 const control=structuredClone(vendor),accepted=[];
 if(expected.length){
  if(control.tools?.[0]?.name!=='js'||own.tools?.[0]?.name!=='js')throw new Error('Tool description allowance must target js');
  control.tools[0].description=transformBrowserToolDescription(control.tools[0].description,platform);
  if(control.tools[0].description===own.tools[0].description)accepted.push({field:'tools.0.description',transform:expected[0].transform,reason:expected[0].reason});
 }
 const differences=toolDifferences(control,own);return {ok:!differences.length,differences,expected:accepted};
}
