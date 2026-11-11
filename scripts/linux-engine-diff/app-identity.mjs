// The application under test, verified before a cell counts (#171 M4, T16's fix wave; the design session, 2026-11-10).
// A scene's launch command and window title say what was asked for, not what came: an empty .odp launched with
// `--impress` opened in Writer, and T16's Impress rows then measured Writer (task 72's review, finding 3). So a runner
// reads the application through AT-SPI, as the harness's own reads (oracle.mjs) see it, and refuses the scene unless it
// is the one named: its AT-SPI application's name and toolkit, and, where one application serves several document
// types (LibreOffice's modules share one process), the role of the document its frame holds.

import { splitNodeId } from './matrix-judge.mjs';

/** A scene whose application is not the one under test: its cells never count. */
export class IdentityRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'IdentityRefused';
  }
}

/**
 * What each family's application must show: `application` (the AT-SPI application's Name), `toolkit` (its
 * `ToolkitName`), and `document` (the role of the first document node under the frame, where the family has one). As
 * read on the #171 VM (task 72's fix wave, `--plan identity`): LibreOffice 24.2 on its gtk3 plugin is `soffice` with
 * toolkit `gtk` in every module, so only the document's role tells Writer, Calc and Impress apart.
 */
export const APP_IDENTITY = {
  writer: { application: 'soffice', toolkit: 'gtk', document: 'document text' },
  calc: { application: 'soffice', toolkit: 'gtk', document: 'document spreadsheet' },
  impress: { application: 'soffice', toolkit: 'gtk', document: 'document presentation' },
  'gtk3-frame': { application: 'point-gtk3.py', toolkit: 'gtk', document: null },
};

/** The roles a document search stops at: below them is content, not the window's structure. */
const DOCUMENT = /^document /;
const PRUNE = ['menu bar', 'menu', 'popup menu', 'tool bar', 'status bar', 'table'];

/**
 * The identity of a scene's application through AT-SPI, from its frame: `{application, toolkit, document}`, the
 * document the role of the first document node met breadth first (null for none within `limit` nodes).
 */
export function readIdentity(oracle, frame, { limit = 400 } = {}) {
  const at = splitNodeId(String(frame));
  if (!at) throw new Error(`${frame} is not an AT-SPI node`);
  const root = `${at.bus}:/org/a11y/atspi/accessible/root`;
  const get = (read) => {
    try {
      return read();
    } catch {
      return null;
    }
  };
  const application = get(() => oracle.name(root));
  const { toolkit } = oracle.toolkit(frame);
  let document = null;
  const queue = [frame];
  for (let seen = 0; queue.length && seen < limit && document === null; seen++) {
    const id = queue.shift();
    const role = get(() => oracle.role(id));
    if (role === null) continue;
    if (DOCUMENT.test(role)) document = role;
    else if (!PRUNE.includes(role)) queue.push(...(get(() => oracle.children(id)) ?? []));
  }
  return { application, toolkit, document };
}

/**
 * Whether an identity is the family's (`APP_IDENTITY`): `{ok, why}`, `why` naming each part that differs. A family
 * with no entry is refused, so a runner cannot count a family nobody said how to verify.
 */
export function identityVerdict(identity, family, expected = APP_IDENTITY[family]) {
  if (!expected) return { ok: false, why: [`no identity is declared for family ${family}`] };
  const why = [];
  for (const part of ['application', 'toolkit', 'document']) {
    if (expected[part] === undefined) continue;
    if ((identity?.[part] ?? null) !== expected[part]) why.push(`${part} ${JSON.stringify(identity?.[part] ?? null)}, not ${JSON.stringify(expected[part])}`);
  }
  return { ok: why.length === 0, why };
}

/**
 * Verifies a scene's application (`scene.frame`, its AT-SPI frame) as its family's before any of its cells counts;
 * throws `IdentityRefused` otherwise. Returns the identity read, for the run's record.
 */
export function verifyIdentity(oracle, scene, family = scene.family) {
  if (!scene.frame) throw new IdentityRefused(`${scene.label}: no AT-SPI frame to verify its application by`);
  const identity = readIdentity(oracle, scene.frame);
  const verdict = identityVerdict(identity, family);
  if (!verdict.ok) throw new IdentityRefused(`${scene.label} is not ${family}'s application: ${verdict.why.join('; ')}`);
  return identity;
}
