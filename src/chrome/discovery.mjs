// Where the browser service finds cua's hosts (spec docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md,
// "Socket placement and discovery"). Every launch with the browser surface (`cua serve`, and the profile listing in
// src/profiles/inventory.mjs, both through buildLaunch) sets BROWSER_USE_BACKEND_PATHS to:
//   - the socket of every profile bound on the cua route ($CUA_HOME/chrome/b/<socketNameFor(instance id)>.sock), whether
//     or not its Chrome runs now: the service retries a dead listed path on every listBrowsers, so a Chrome opened after
//     the launch is found there (no restart of `cua serve`);
//   - every *.sock present in $CUA_HOME/chrome/b at launch (a profile not bound yet, as `cua profiles bind` needs).
// The service uses the variable verbatim when it is set, an empty list included, so it never looks anywhere else (in
// particular not in OpenAI's host socket directory). With MAWS backends configured (CUA_BROWSER_BACKENDS,
// src/chrome/client-mode.mjs; spec docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md, "Discovery") this
// process's own client-mode host sockets come first (listening or not yet: the service retries a listed path).
// Client-mode hosts live in chrome/m, which nothing scans: a process never lists another process's.
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {realHome} from '../runtime/layout.mjs';
import {readRegistry} from '../profiles/registry.mjs';
import {backendDir, socketNameFor, socketPathFor} from './extension.mjs';

// -> the absolute socket paths, sorted.
export function backendPaths(home) {
  const root = realHome(home);
  const paths = new Set();
  // A registry that does not parse is doctor's to report (chrome.profiles); the present sockets still serve.
  let profiles = {};
  try { ({profiles} = readRegistry(root)); } catch {}
  for (const {extensionInstanceId, route} of Object.values(profiles))
    if (extensionInstanceId && route === 'cua') paths.add(socketPathFor(root, socketNameFor(extensionInstanceId)));
  let names = [];
  try { names = readdirSync(backendDir(root)); } catch {}
  for (const name of names) if (name.endsWith('.sock')) paths.add(join(backendDir(root), name));
  return [...paths].sort();
}

// The default instance a launch gets when its first MAWS backend has not said hello: the bare prefix, which the trusted
// browser wrapper resolves at selection time to the first listed maws: browser (src/services/browser.mjs).
export const MAWS_INSTANCE_MARKER = 'maws:';

// -> the BROWSER_USE_BACKEND_PATHS list for a launch. `clientHosts` is the process's client-mode host sockets (null
// without MAWS backends).
export function launchBackendPaths(home, {clientHosts = null} = {}) {
  return [...new Set([...(clientHosts ?? []), ...backendPaths(home)])];
}
