// The control changes ONLY DialogContentModal's trapFocus. This patches our disposable fixture dependency,
// not Electron, cua, the vendor runtime or anything shipped. Pin+exact single replacement fail closed.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),dir=join(root,'fixture');
const require=createRequire(join(dir,'package.json'));
const {build}=require('esbuild');
let patch;
await build({entryPoints:[join(dir,'page.jsx')],bundle:true,format:'iife',outfile:join(dir,'bundle.js'),define:{'process.env.NODE_ENV':'"production"'},plugins:[{
 name:'probe366-no-trap-control',setup(build) {
  build.onLoad({filter:/@radix-ui\/react-dialog\/dist\/index\.mjs$/},async({path})=>{
   const source=readFileSync(path,'utf8');
   const from='trapFocus: context.open,',to='trapFocus: context.open && window.__probe366Trap !== false,';
   if(source.split(from).length!==2)throw Error('pinned Radix modal trap hook changed');
   const dismiss='onDismiss: () => context.onOpenChange(false)';
   if(source.split(dismiss).length!==2)throw Error('pinned Radix dismiss hook changed');
   const contents=source.replace(from,to).replace(dismiss,'onDismiss: () => { window.__probe366Note("radix.onDismiss"); context.onOpenChange(false); }');
   patch={radix:'1.1.15',sourceSHA256:createHash('sha256').update(source).digest('hex'),trapReplacement:{from,to},dismissHook:true};
   return {contents,loader:'js',resolveDir:dirname(path)};
  });
 }
}]});
if(!patch)throw Error('Radix instrumentation was not used by bundle');
writeFileSync(join(dir,'build.json'),JSON.stringify(patch,null,2));
console.log(JSON.stringify(patch));
