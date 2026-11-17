import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {removeProfile} from './first-cleanup.mjs';
const here=dirname(fileURLToPath(import.meta.url));
test('persistent profile cleanup failure is an outcome, not an exception that stops subsequent trials',()=>{
 let options;const result=removeProfile('/owned/profile',(path,opts)=>{assert.equal(path,'/owned/profile');options=opts;throw Object.assign(Error('directory not empty'),{code:'ENOTEMPTY'});});
 assert.equal(result.attempted,true);assert.equal(result.ok,false);assert.match(result.error,/ENOTEMPTY.*directory not empty/);
 assert.equal(options.recursive,true);assert.equal(options.force,true);assert.ok(options.maxRetries>0&&options.maxRetries<20);assert.ok(options.retryDelay>0);
});
test('normal owned profile deletion succeeds and leaves no data',()=>{
 mkdirSync(join(here,'.offline'),{recursive:true});const scratch=mkdtempSync(join(here,'.offline/cleanup-')),profile=join(scratch,'profile');
 try {mkdirSync(profile);writeFileSync(join(profile,'data'),'owned');const result=removeProfile(profile);assert.equal(result.ok,true);assert.equal(existsSync(profile),false);}
 finally {rmSync(scratch,{recursive:true,force:true});}
});
