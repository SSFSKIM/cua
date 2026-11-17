// Run from the trusted checkout, never from the downloaded artifact directory.
import {realpathSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectSafariAX,writeSafariAXTables} from '../safari-ax.mjs';
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.argv[2];if(!root)throw Error('usage: safari-ax-table.mjs <Safari-AX-artifact-root>');
 const {rows,collection}=collectSafariAX(root);writeSafariAXTables(root,rows);
 writeFileSync(join(root,'diagnostic-coverage.json'),JSON.stringify(collection,null,2));
 console.log(JSON.stringify(collection));if(!collection.complete)process.exitCode=1;
}
