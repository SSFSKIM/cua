import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_IDENTITY, IdentityRefused, identityVerdict, readIdentity, verifiedScene, verifyIdentity, verifySceneIdentity } from '../../scripts/linux-engine-diff/app-identity.mjs';

// A LibreOffice window's AT-SPI tree as the harness's oracle reads it: the application root, the frame, panels down to
// the document (`document` its role), the menu bar's own subtree beside them, pruned
function office(document, { application = APP_IDENTITY.writer.application, toolkit = APP_IDENTITY.writer.toolkit } = {}) {
  const bus = ':1.42';
  const id = (p) => `${bus}:/org/a11y/atspi/accessible/${p}`;
  const nodes = {
    [id('root')]: { role: 'application', name: application, children: [id('frame')] },
    [id('frame')]: { role: 'frame', name: 'x.fodp - LibreOffice', children: [id('menus'), id('client')] },
    [id('menus')]: { role: 'menu bar', children: [id('menu')] },
    [id('menu')]: { role: 'document text', children: [] },
    [id('client')]: { role: 'panel', children: [id('host')] },
    [id('host')]: { role: 'panel', children: [id('root pane')] },
    [id('root pane')]: { role: 'root pane', children: [id('doc')] },
    [id('doc')]: { role: document, children: [] },
  };
  return {
    frame: id('frame'),
    oracle: {
      name: (n) => nodes[n].name,
      role: (n) => nodes[n].role,
      children: (n) => nodes[n].children,
      toolkit: () => ({ toolkit, toolkit_version: '24.2' }),
    },
  };
}

test("a scene's identity is its application's name and toolkit and its frame's first document, the menus pruned", () => {
  const { oracle, frame } = office('document presentation');
  assert.deepEqual(readIdentity(oracle, frame), { application: APP_IDENTITY.impress.application, toolkit: APP_IDENTITY.impress.toolkit, toolkit_major: 24, document: 'document presentation' });
});

test('Writer standing in for Impress is refused, as is another application or toolkit', () => {
  // task 72's review, finding 3: the empty .odp opened in Writer
  const writer = office('document text');
  const asImpress = identityVerdict(readIdentity(writer.oracle, writer.frame), 'impress');
  assert.equal(asImpress.ok, false);
  assert.deepEqual(asImpress.why, ['document "document text", not "document presentation"']);
  assert.equal(identityVerdict(readIdentity(writer.oracle, writer.frame), 'writer').ok, true);
  const other = office('document text', { application: 'gedit' });
  assert.match(identityVerdict(readIdentity(other.oracle, other.frame), 'writer').why.join(), /application "gedit"/);
  const toolkit = office('document text', { toolkit: 'Qt' });
  assert.match(identityVerdict(readIdentity(toolkit.oracle, toolkit.frame), 'writer').why.join(), /toolkit "Qt"/);
  assert.deepEqual(identityVerdict({ application: 'x', toolkit: 'y', document: null }, 'no-such'), { ok: false, why: ['no identity is declared for family no-such'] });
});

test('verifyIdentity throws IdentityRefused for a scene that is not its family, and returns the identity otherwise', () => {
  const writer = office('document text');
  const scene = { label: 'impress-1', family: 'impress', frame: writer.frame };
  assert.throws(() => verifyIdentity(writer.oracle, scene), (e) => e instanceof IdentityRefused && /impress-1 is not impress's application/.test(e.message));
  assert.equal(verifyIdentity(writer.oracle, { ...scene, family: 'writer' }).document, 'document text');
  assert.throws(() => verifyIdentity(writer.oracle, { label: 'w', family: 'writer' }), /no AT-SPI frame/);
});

// a one-application tree with no document: a Qt or GTK scene's frame, its toolkit's version as the bridge gives it
function plain({ application, toolkit, version = null, bus = ':1.7' }) {
  const id = (p) => `${bus}:/org/a11y/atspi/accessible/${p}`;
  const reads = [];
  const nodes = { [id('root')]: { role: 'application', name: application, children: [id('frame')] }, [id('frame')]: { role: 'frame', name: 'x', children: [id('panel')] }, [id('panel')]: { role: 'panel', children: [] } };
  return {
    frame: id('frame'),
    reads,
    oracle: {
      name: (n) => nodes[n].name,
      role: (n) => (reads.push(n), nodes[n].role),
      children: (n) => nodes[n].children,
      toolkit: () => ({ toolkit, toolkit_version: version }),
    },
  };
}

test("the toolkit's major version is read from its version, and a Qt 5 scene standing for Qt 6 is refused", () => {
  const qt5 = plain({ application: 'qt-input.py', toolkit: 'Qt', version: '5.15.13' });
  assert.equal(readIdentity(qt5.oracle, qt5.frame).toolkit_major, 5);
  assert.equal(identityVerdict(readIdentity(qt5.oracle, qt5.frame), 'qt5-input').ok, true);
  assert.deepEqual(identityVerdict(readIdentity(qt5.oracle, qt5.frame), 'qt6-input').why, ['toolkit_major 5, not 6']);
  // a version the bridge does not give, or gives with no leading number, has no major, which a Qt family refuses
  const none = plain({ application: 'qt-input.py', toolkit: 'Qt', version: null });
  assert.equal(readIdentity(none.oracle, none.frame).toolkit_major, null);
  assert.equal(identityVerdict(readIdentity(none.oracle, none.frame), 'qt6-input').ok, false);
  const odd = plain({ application: 'qt-input.py', toolkit: 'Qt', version: 'v6' });
  assert.equal(readIdentity(odd.oracle, odd.frame).toolkit_major, null);
});

test("a document is looked for only when it is asked for, and the family's check asks only where it declares one", () => {
  const gedit = plain({ application: 'gedit', toolkit: 'gtk', version: '3.24' });
  assert.equal(readIdentity(gedit.oracle, gedit.frame, { document: false }).document, undefined);
  assert.deepEqual(gedit.reads, []);
  assert.equal(readIdentity(gedit.oracle, gedit.frame).document, null);
  assert.ok(gedit.reads.length > 0);
  gedit.reads.length = 0;
  assert.equal(verifyIdentity(gedit.oracle, { label: 'g', frame: gedit.frame }, 'gedit').application, 'gedit');
  assert.deepEqual(gedit.reads, [], 'gedit declares no document: no walk');
  // a family that declares one is walked, and refused where its frame holds none
  assert.throws(() => verifyIdentity(gedit.oracle, { label: 'w', frame: gedit.frame }, 'writer'), /document null, not "document text"/);
});

test('a scene with no frame is verified through its window state, every window of a several-window scene, without changing the scene', async () => {
  const gtk4 = plain({ application: 'Unnamed', toolkit: 'GTK', version: '4.14.2' });
  const asked = [];
  const desktop = { state: async (w) => (asked.push(w.id), { ax_tree_source: 'at_spi', ax_tree: { id: gtk4.frame } }) };
  const scene = { label: 'dup', id: 1, windows: [{ id: 1, label: 'dup-1' }, { id: 2, label: 'dup-2' }] };
  const identity = await verifySceneIdentity(desktop, gtk4.oracle, scene, 'gtk4-input');
  assert.deepEqual(asked, [1, 2]);
  assert.equal(identity.length, 2);
  assert.equal(identity[0].application, 'Unnamed');
  assert.equal(scene.windows[0].frame, undefined, "the scene's own fields are left as they were");
  // a window whose state has no AT-SPI tree is refused for a family verified through AT-SPI
  const bare = { state: async () => ({ ax_tree_source: 'x11', ax_tree: { id: '0x00400001' } }) };
  await assert.rejects(verifySceneIdentity(bare, gtk4.oracle, { label: 'x', id: 3 }, 'gtk4-input'), (e) => e instanceof IdentityRefused && /no AT-SPI frame/.test(e.message));
  // a scene that carries its frame is read at it, and its window state is not asked
  asked.length = 0;
  assert.equal((await verifySceneIdentity(desktop, gtk4.oracle, { label: 'y', id: 4, frame: gtk4.frame }, 'gtk4-input')).toolkit, 'GTK');
  assert.deepEqual(asked, []);
  // GTK 4's scene is not GTK 3's
  await assert.rejects(verifySceneIdentity(desktop, gtk4.oracle, { label: 'z', id: 5 }, 'gedit'), /toolkit "GTK", not "gtk"/);
});

test("a scene's windows whose state cannot be read alone (several of one title) are verified at their process's one application", async () => {
  // run ident-2 (task 74): the engine refuses a window that "matches several accessibility windows"
  const gtk4 = plain({ application: 'Unnamed', toolkit: 'GTK', version: '4.14.5', bus: ':1.3' });
  const root = ':1.3:/org/a11y/atspi/accessible/root';
  const oracle = { ...gtk4.oracle, appsOf: (pid) => (pid === 77 ? [root] : pid === 78 ? [root, ':1.4:/org/a11y/atspi/accessible/root'] : []) };
  const refused = { state: async (w) => { throw new Error(`reading ${w.label} failed: Window ${w.id} matches several accessibility windows`); } };
  const scene = { label: 'dup', id: 1, pid: 77, windows: [{ id: 1, label: 'dup-1', pid: 77 }, { id: 2, label: 'dup-2', pid: 77 }] };
  assert.deepEqual((await verifySceneIdentity(refused, oracle, scene, 'identity-gtk4')).map((i) => i.application), ['Unnamed', 'Unnamed']);
  // a process with no application or several, and a window state that cannot be read: refused, the read's error said
  await assert.rejects(verifySceneIdentity(refused, oracle, { label: 'two', id: 3, pid: 78 }, 'identity-gtk4'), (e) => e instanceof IdentityRefused && /matches several accessibility windows/.test(e.message));
  await assert.rejects(verifySceneIdentity(refused, oracle, { label: 'none', id: 4, pid: 79 }, 'identity-gtk4'), IdentityRefused);
});

test("a runner's opened scene is kept with its identity, or closed and refused", async () => {
  const closed = [];
  const desktop = { close: async (scenes) => closed.push(...scenes.map((s) => s.label)), state: async () => assert.fail('no state') };
  const wmClassOf = (id) => (id === 10 ? APP_IDENTITY.xterm.wm_class : 'other / Other');
  const ok = { label: 'x', id: 10 };
  assert.equal(await verifiedScene(desktop, null, ok, 'xterm', { wmClassOf }), ok);
  assert.deepEqual(ok.identity, { wm_class: APP_IDENTITY.xterm.wm_class });
  await assert.rejects(verifiedScene(desktop, null, { label: 'y', id: 11 }, 'xterm', { wmClassOf }), IdentityRefused);
  assert.deepEqual(closed, ['y']);
});

test('a family with no AT-SPI tree is verified by its WM_CLASS, and refused on any other', async () => {
  const classes = { 10: APP_IDENTITY.xterm.wm_class, 11: 'gedit / Gedit' };
  const wmClassOf = (id) => classes[id];
  const desktop = { state: async () => assert.fail('a tree-less family reads no window state') };
  assert.deepEqual(await verifySceneIdentity(desktop, null, { label: 'x', id: 10 }, 'xterm', { wmClassOf }), { wm_class: APP_IDENTITY.xterm.wm_class });
  await assert.rejects(verifySceneIdentity(desktop, null, { label: 'g', id: 11 }, 'xterm', { wmClassOf }), (e) => e instanceof IdentityRefused && /wm_class "gedit \/ Gedit", not /.test(e.message));
  await assert.rejects(verifySceneIdentity(desktop, null, { label: 'k', id: 11 }, 'no-such-family', { wmClassOf }), /no identity is declared for family no-such-family/);
});
