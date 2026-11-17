import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=join(dirname(fileURLToPath(import.meta.url)),'fixture'),require=createRequire(join(dir,'package.json'));
await require('esbuild').build({entryPoints:[join(dir,'page.jsx')],bundle:true,format:'iife',outfile:join(dir,'bundle.js'),define:{'process.env.NODE_ENV':'"production"'}});
