// H2: backend discovery on the cua route. `cua serve` and the inventory's listing launch (both through buildLaunch)
// set BROWSER_USE_BACKEND_PATHS to the socket of every profile bound on the cua route plus every socket present in
// $CUA_HOME/chrome/b, so a Chrome opened after the launch is found at its pre-listed path; on the vendor route (or with
// no registration) the variable stays unset, so the vendor's own /tmp scan finds OpenAI's hosts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildLaunch, BROWSER_SERVICE, SKY_SERVICE} from '../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {backendDir, socketNameFor, socketPathFor} from '../src/chrome/extension.mjs';
import {backendPaths} from '../src/chrome/discovery.mjs';
import {scratch, fixturePin} from './fixtures/runtime-fixture.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-000000000002';

function fixture(t) {
  const s = scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const pin = parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1}));
  return {home, runtime: runtimeFor({home, pin, record: null})};
}
const browserLaunch = ({home, runtime}) => buildLaunch({runtime, home, sessionId: SESSION, ambient: {}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});

function onCuaRoute(home) {
  mkdirSync(backendDir(home), {recursive: true});
  writeFileSync(join(home, 'chrome', 'cua-registration.json'), JSON.stringify({schema: 1, route: 'cua', launcher: join(home, 'chrome', 'host'), backendsDir: backendDir(home), browsers: {}}));
}
function profiles(home, entries) {
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: entries}));
}

test('with no registration and on the vendor route the backend paths stay unset (the vendor scan finds OpenAI\'s hosts)', t => {
  const f = fixture(t);
  assert.equal(backendPaths(f.home), null);
  assert.equal('BROWSER_USE_BACKEND_PATHS' in browserLaunch(f).env, false);
  mkdirSync(join(f.home, 'chrome'));
  writeFileSync(join(f.home, 'chrome', 'registration.json'), JSON.stringify({schema: 1, browsers: {chrome: {manifest: '/m', replaced: false}}}));
  assert.equal('BROWSER_USE_BACKEND_PATHS' in browserLaunch(f).env, false);
});

test('on the cua route the paths are every cua-route binding\'s socket plus every socket present, sorted and unique', t => {
  const f = fixture(t);
  onCuaRoute(f.home);
  profiles(f.home, {
    personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-personal', boundAt: 'x', route: 'cua'},
    work: {chromeProfileDirectory: 'Profile 1', extensionInstanceId: 'inst-work', boundAt: 'x'},           // vendor route: not listed
    school: {chromeProfileDirectory: 'Profile 2'},                                                          // unbound
  });
  const live = join(backendDir(f.home), 'aaaaaaaaaaaa.sock');
  writeFileSync(live, '');
  writeFileSync(join(backendDir(f.home), 'aaaaaaaaaaaa.json'), '{}');
  writeFileSync(socketPathFor(f.home, socketNameFor('inst-personal')), '');   // the bound profile's host is up too
  const expected = [live, socketPathFor(f.home, socketNameFor('inst-personal'))].sort();
  assert.deepEqual(backendPaths(f.home), expected);
  assert.equal(browserLaunch(f).env.BROWSER_USE_BACKEND_PATHS, expected.join(':'));
});

test('a bound profile whose Chrome is not running is pre-listed, so its host is found once it appears', t => {
  const f = fixture(t);
  onCuaRoute(f.home);
  profiles(f.home, {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-personal', boundAt: 'x', route: 'cua'}});
  assert.deepEqual(backendPaths(f.home), [socketPathFor(f.home, socketNameFor('inst-personal'))]);
});

test('on the cua route with nothing bound and no host the variable is set and empty: no /tmp scan', t => {
  const f = fixture(t);
  onCuaRoute(f.home);
  assert.deepEqual(backendPaths(f.home), []);
  assert.equal(browserLaunch(f).env.BROWSER_USE_BACKEND_PATHS, '');
});

test('a profile registry that does not parse still lists the present sockets; computer-only launches never set it', t => {
  const f = fixture(t);
  onCuaRoute(f.home);
  writeFileSync(join(f.home, 'profiles.json'), 'not json');
  writeFileSync(join(backendDir(f.home), 'bbbbbbbbbbbb.sock'), '');
  assert.deepEqual(backendPaths(f.home), [join(backendDir(f.home), 'bbbbbbbbbbbb.sock')]);
  const computer = buildLaunch({runtime: f.runtime, home: f.home, sessionId: SESSION, ambient: {}, surfaces: ['computer'], services: {sky: SKY_SERVICE}});
  assert.equal('BROWSER_USE_BACKEND_PATHS' in computer.env, false);
});
