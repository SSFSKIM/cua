import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_IDENTITY, IdentityRefused, identityVerdict, readIdentity, verifyIdentity } from '../../scripts/linux-engine-diff/app-identity.mjs';

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
  assert.deepEqual(readIdentity(oracle, frame), { application: APP_IDENTITY.impress.application, toolkit: APP_IDENTITY.impress.toolkit, document: 'document presentation' });
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
  assert.deepEqual(identityVerdict({ application: 'x', toolkit: 'y', document: null }, 'kate'), { ok: false, why: ['no identity is declared for family kate'] });
});

test('verifyIdentity throws IdentityRefused for a scene that is not its family, and returns the identity otherwise', () => {
  const writer = office('document text');
  const scene = { label: 'impress-1', family: 'impress', frame: writer.frame };
  assert.throws(() => verifyIdentity(writer.oracle, scene), (e) => e instanceof IdentityRefused && /impress-1 is not impress's application/.test(e.message));
  assert.equal(verifyIdentity(writer.oracle, { ...scene, family: 'writer' }).document, 'document text');
  assert.throws(() => verifyIdentity(writer.oracle, { label: 'w', family: 'writer' }), /no AT-SPI frame/);
});
