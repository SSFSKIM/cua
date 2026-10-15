// The supervisor's half of the trusted worker's `nodeRepl.launchServices.openApplication`
// (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design "Trusted services and privileged APIs"; the
// worker's half normalizes the target, NR:privileged-node-repl.js:455-472,603-631). The worker sends
// `launch_services_action {id, exec_id, action: 'open_application', application_path?, bundle_identifier?}`; the
// supervisor opens the application through macOS LaunchServices (`/usr/bin/open -a <path>` or `-b <bundle id>`, the OS
// boundary, injectable) and answers `privileged_result`. Kept implemented and boundary-tested on macOS; native
// production use stays on the vendor host until #117. Sentences are the vendor supervisor's (recovered,
// docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md "Gaps" 5) where they exist.
import {execFile} from 'node:child_process';
import {isAbsolute} from 'node:path';

export const PATH_NOT_ABSOLUTE_SENTENCE = 'LaunchServices application path must be absolute';
export const EXACTLY_ONE_SENTENCE = 'LaunchServices open application expected exactly one of application_path or bundle_identifier';
export const DISPATCH_FAILED_PREFIX = 'failed to dispatch LaunchServices open: ';
export const MACOS_ONLY_SENTENCE = 'LaunchServices is available only on macOS';
const OPEN = '/usr/bin/open';
const OPEN_TIMEOUT_MS = 30_000;

// The OS boundary: runs `open` with `args`; rejects with its failure.
export function runOpen(args) {
  return new Promise((resolve, reject) => {
    execFile(OPEN, args, {timeout: OPEN_TIMEOUT_MS, env: {PATH: '/usr/bin:/bin'}}, (error, _stdout, stderr) => {
      if (error) reject(new Error(String(stderr).trim() || error.message));
      else resolve();
    });
  });
}

// A `launch_services_action` -> resolves once LaunchServices was asked to open the application; rejects with the
// sentence the worker is answered.
export async function launchServicesAction(message, {platform = process.platform, open = runOpen} = {}) {
  if (message.action !== 'open_application') throw new Error(`unsupported LaunchServices action: ${String(message.action)}`);
  const path = message.application_path ?? null;
  const bundle = message.bundle_identifier ?? null;
  if ((path === null) === (bundle === null)) throw new Error(EXACTLY_ONE_SENTENCE);
  if (path !== null && (typeof path !== 'string' || !isAbsolute(path))) throw new Error(PATH_NOT_ABSOLUTE_SENTENCE);
  if (bundle !== null && (typeof bundle !== 'string' || !bundle)) throw new Error(EXACTLY_ONE_SENTENCE);
  if (platform !== 'darwin') throw new Error(MACOS_ONLY_SENTENCE);
  try {
    await open(path !== null ? ['-a', path] : ['-b', bundle]);
  } catch (error) {
    throw new Error(`${DISPATCH_FAILED_PREFIX}${error.message}`);
  }
}
