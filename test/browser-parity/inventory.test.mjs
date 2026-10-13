import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const inventoryPath = join(root, 'test/browser-parity/inventory.json');
const milestones = ['M0', 'M1a', 'M1b', 'M1c', 'M2', 'M3'];
const walk = dir => readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(join(dir,e.name)) : e.name.endsWith('.mjs') ? [join(dir,e.name)] : []);
const corpus = async () => Promise.all(walk(join(root,'test/browser-parity/scenarios')).map(async p => (await import(pathToFileURL(p))).default));
const inventory = () => JSON.parse(readFileSync(inventoryPath,'utf8'));
// Milestone completion is inferred from the spec's concern modules; an explicit lower gate is useful during a port.
const currentMilestone = () => process.env.CUA_PARITY_MILESTONE ?? ([['M3','history'],['M2','dialogs'],['M1c','waits'],['M1b','snapshot']].find(([,file])=>existsSync(join(root,`src/browser-service/${file}.mjs`)))?.[0] ?? 'M1a');

test('every wire command has an executable milestone case or an explicit capability-disabled assertion', async () => {
  const rows = inventory(), scenarios = await corpus(), byId = new Map(scenarios.map(s => [s.id,s]));
  assert.equal(byId.size, scenarios.length, 'duplicate scenario id');
  assert.equal(new Set(rows.map(r=>r.type)).size, rows.length, 'duplicate wire type');
  for (const row of rows) {
    assert.match(row.schemaSource, /^chatgpt-26\.928\.40906 BS:\d+/);
    assert.match(row.reachability, /^(always|capability:[a-zA-Z_]+|disabled-on-extension)$/);
    assert.ok(milestones.includes(row.milestone), row.type);
    assert.ok(row.cases.length, `${row.type}: missing cases`);
    for (const id of row.cases) {
      const scenario = byId.get(id);
      assert.ok(scenario, `${row.type}: missing ${id}`);
      assert.ok(scenario.commands.includes(row.type), `${id} does not exercise ${row.type}`);
      assert.equal(scenario.milestone, row.milestone, `${id}: wrong milestone`);
      if (scenario.skip) {
        assert.ok(row.exclusions?.some(e=>e.case===id && e.reason===scenario.skip), `${id}: undocumented exclusion`);
      } else {
        assert.ok(scenario.cells.length, `${id}: no executable cells`);
        if (row.reachability !== 'always' && row.reachability !== 'capability:viewport') {
          assert.ok(scenario.disabledAssertions?.includes(row.type), `${id}: missing explicit disabled-capability assertion`);
        }
      }
    }
    assert.ok(row.cases.some(id=>!byId.get(id).skip), `${row.type}: skips cannot substitute for coverage`);
  }
  for (const s of scenarios) {
    assert.ok(milestones.includes(s.milestone), s.id);
    assert.equal(new Set(s.cells.map(c=>c.label)).size,s.cells.length, s.id);
    const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
    for(const cell of s.cells)if(cell.code)assert.doesNotThrow(()=>new AsyncFunction(cell.code),`${s.id}/${cell.label}: invalid REPL cell`);
    if (!s.id.startsWith('examples/')) for (const command of s.commands) assert.ok(rows.some(r=>r.type===command && r.cases.includes(s.id)), `${s.id}: untracked ${command}`);
    if (!s.skip && !s.id.startsWith('examples/')) {
      const broken = await s.assert({results:s.cells.map(c=>({cell:c.label,ok:false,error:{code:'broken',message:'injected failure'}})),fixtureState:{counter:0,events:[]},service:'vendor'});
      assert.equal(broken.ok,false, `${s.id}: assertions accept a completely broken service`);
    }
  }
});

test('our-service milestone handlers and manifest parity (M1a gate)', {skip:!existsSync(join(root,'src/browser-service/index.mjs')) && 'M0: own service assertions begin at M1a'}, async () => {
  const {checkOwnService} = await import('./support/manifest-probe.mjs');
  await checkOwnService(inventory(), currentMilestone());
});

test('installed vendor manifest, extension-disabled members and wire union', async t => {
  const {vendorPath, checkVendor} = await import('./support/manifest-probe.mjs');
  const path = vendorPath();
  if (!path) return t.skip('vendor module absent: manifest and vendor wire-union assertions not run');
  await checkVendor(path, inventory());
});
