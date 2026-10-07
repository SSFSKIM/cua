// The Chrome route of a cua home (spec docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md,
// "Registration, launch, binding, doctor"): `cua` (cua's own extension and host, `cua chrome register`) or `vendor`
// (the ChatGPT extension and OpenAI's host, `cua chrome register --vendor`), set by whichever registration ran last.
// Each route keeps its own record, so neither overwrites the other's backups:
//   $CUA_HOME/chrome/cua-registration.json   the cua route's record (registration.mjs registerCuaHost)
//   $CUA_HOME/chrome/registration.json       the vendor route's record (registration.mjs registerHost)
// The route is `cua` when the cua record exists and was written after the vendor record, else `vendor` when the vendor
// record exists, else none (null). A vendor record that names no browser (what `unregister --vendor` leaves) counts as
// absent, so unregistering the vendor route never moves a home off a cua registration that is still in place.
// `cua chrome register --vendor` touches the vendor record (chooseVendorRoute) so it counts as the last registration
// even when it changed no manifest.
import {readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {realHome} from '../runtime/layout.mjs';
import {OPENAI_EXTENSION_ID} from '../profiles/chrome.mjs';
import {CUA_EXTENSION_ID} from './extension.mjs';

export const cuaRecordFile = home => join(home, 'chrome', 'cua-registration.json');
export const vendorRecordFile = home => join(home, 'chrome', 'registration.json');

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// The cua record, or null when it is absent or not one: {schema: 1, route: 'cua', launcher, backendsDir,
// browsers: {<browser>: {manifestPath, previous: <launcher path>|null, backupSha256?}}}.
export function readCuaRecord(home) {
  const record = readJson(cuaRecordFile(realHome(home)));
  return record?.schema === 1 && record.route === 'cua' && isObject(record.browsers) ? record : null;
}

const writtenAt = path => { try { return statSync(path).mtimeMs; } catch { return null; } };

// -> 'cua' | 'vendor' | null
export function chromeRoute(home) {
  const root = realHome(home);
  const cua = readCuaRecord(root) ? writtenAt(cuaRecordFile(root)) : null;
  const vendorRecord = readJson(vendorRecordFile(root));
  const vendor = vendorRecord?.schema === 1 && isObject(vendorRecord.browsers) && Object.keys(vendorRecord.browsers).length ? writtenAt(vendorRecordFile(root)) : null;
  if (cua !== null && (vendor === null || cua > vendor)) return 'cua';
  return vendor !== null ? 'vendor' : null;
}

// A binding's route: a binding without one was made on the vendor route (before the cua route existed), and a home
// with no registration is read as the vendor route, as it was before.
export const effectiveRoute = route => route ?? 'vendor';

// The extension whose presence and instance stores the route's checks read.
export const extensionIdFor = route => (effectiveRoute(route) === 'cua' ? CUA_EXTENSION_ID : OPENAI_EXTENSION_ID);
