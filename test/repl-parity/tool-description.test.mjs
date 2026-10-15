import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareEffectiveTools,transformBrowserToolDescription} from '../../scripts/repl-parity/tool-contract.mjs';
const expected=[{kind:'tools-description',scope:'production',field:'tools.0.description',transform:'table-2-browser-exclusions',reason:'Table 2 excludes iab and mcpapps only'}];
const vendor=JSON.parse(readFileSync(new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m2/tools-vendor/tools.json',import.meta.url)));
test('approved tool-text edits remove only the named Table 2 units and preserve every surviving byte',()=>{
 const text=vendor.tools[0].description,transformed=transformBrowserToolDescription(text,'darwin');
 assert.ok(text.includes('including the current IAB tab'));assert.ok(!transformed.includes('including the current IAB tab'));
 assert.ok(!transformed.includes('createBrowserTab("iab"'));assert.ok(!transformed.includes('"mcpapps"'));
 for(const retained of ['getTab({ mention: tabMentionUrl })','getTab({ url }, { browser: browserId })','another named browser','getBrowser({ url })'])assert.ok(transformed.includes(retained),retained);
 const own=structuredClone(vendor);own.tools[0].description=transformed;
 assert.equal(compareEffectiveTools(vendor,own,{expected,platform:'darwin'}).ok,true);
 assert.equal(compareEffectiveTools(vendor,own,{platform:'darwin'}).ok,false);
 own.tools[0].description=transformed.replace('another named browser','named browser');assert.equal(compareEffectiveTools(vendor,own,{expected,platform:'darwin'}).ok,false);
 own.tools[0].description=transformed;own.tools[0].inputSchema.properties.code.description+=' drift';assert.equal(compareEffectiveTools(vendor,own,{expected,platform:'darwin'}).ok,false);
 assert.throws(()=>transformBrowserToolDescription(text.replace('Known tab ID','Changed tab ID'),'darwin'),/pinned|source/);
 assert.throws(()=>compareEffectiveTools(vendor,own,{expected:[{...expected[0],field:'tools.0'}],platform:'darwin'}),/scope|allowance/);
});
