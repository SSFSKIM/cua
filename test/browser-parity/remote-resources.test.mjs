import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {traceControl} from '../../scripts/browser-parity/resources.mjs';
test('remote trace shell commands parse empty and multiline traces and clean up their own activation',async t=>{
  const home=mkdtempSync(join(tmpdir(),'parity-remote-shell-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  // Exercise the exact remote shell/Node quoting locally, never an SSH connection.
  writeFileSync(join(home,'ssh'),'#!/bin/sh\nfor arg do last="$arg"; done\nexec /bin/sh -c "$last"\n',{mode:0o700});
  const old=process.env.PATH;process.env.PATH=home+':'+old;t.after(()=>{process.env.PATH=old;});
  const path=join(home,'trace.jsonl');const trace=traceControl({device:'mini',home,path});
  try {
    assert.deepEqual(await trace.read(),[]);
    writeFileSync(path,'{"cdp":"Page.navigate"}\n{"cdp":"DOM.getDocument"}\n');
    assert.deepEqual(await trace.read(),[{cdp:'Page.navigate'},{cdp:'DOM.getDocument'}]);
  } finally {trace.close();}
  assert.equal(existsSync(join(home,'state/host-trace.json')),false);
});
