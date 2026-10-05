// Doctor's Chrome checks: passive capability evidence beside runtime health, `pass` or `blocked`, never `fail` (they
// never change doctor's `ok`). Read from files and the process table only (chrome.mjs).
//   chrome.extension.<key>   per registered profile: the OpenAI extension is installed in its Chrome profile; blocked
//                            when absent, and when this process may not read Chrome's data directory (with the code)
//   chrome.profiles          only when $CUA_HOME/profiles.json cannot be read
//   chrome.host.registered   the native-messaging manifest for com.openai.codexextension exists, and the class of
//                            the host it names (desktop's, cua's or other); pass either way
//   chrome.hosts.live        OpenAI hosts currently running under the user's Chrome (a count)
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {CuaError} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';
import {NATIVE_HOST_NAME, PERMISSION_FIX, PERMISSION_HINT, countLiveHosts} from './chrome.mjs';
import {profileStatuses, REASONS} from './registry.mjs';

const result = (name, status, detail) => ({name, status, detail});

export function chromeChecks({home, chrome, psText, userHome = homedir()}) {
  const checks = [];
  let statuses = [];
  try { statuses = profileStatuses({home, chrome}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    checks.push(result('chrome.profiles', 'blocked', `${error.message}; ${error.hint ?? ''}`.trim()));
  }
  for (const p of statuses) {
    const name = `chrome.extension.${p.key}`;
    const where = `(Chrome profile "${p.chromeProfileDirectory}")`;
    if (p.reason === 'chrome_data_unreadable')
      checks.push(result(name, 'blocked', `whether the OpenAI extension is installed is unknown: this process may not read Chrome's data directory (${p.chromeDataError}) ${where}; ${PERMISSION_HINT}`));
    else if (p.reason === 'profile_directory_missing' || p.reason === 'extension_not_installed')
      checks.push(result(name, 'blocked', `${REASONS[p.reason]} ${where}`));
    else checks.push(result(name, 'pass', `the OpenAI extension is installed in Chrome profile "${p.chromeProfileDirectory}" (file presence only; enabled/connected is not checked)`));
  }
  const host = chrome.nativeHost({cuaHome: realHome(home), userHome});
  checks.push(host.readError
    ? result('chrome.host.registered', 'blocked', `whether a native-messaging manifest for ${NATIVE_HOST_NAME} exists is unknown: this process may not read it in ${chrome.userData} (${host.readError}); ${PERMISSION_FIX}`)
    : !host.present
    ? result('chrome.host.registered', 'blocked', `no native-messaging manifest for ${NATIVE_HOST_NAME} in ${chrome.userData}: the OpenAI extension cannot reach a host`)
    : host.unreadable
      ? result('chrome.host.registered', 'blocked', `the native-messaging manifest for ${NATIVE_HOST_NAME} does not name a host path`)
      : result('chrome.host.registered', 'pass', `${host.pathClass}: ${NATIVE_HOST_NAME} names ${host.path}`));
  const live = countLiveHosts(psText);
  checks.push(live
    ? result('chrome.hosts.live', 'pass', `${live} OpenAI Chrome host(s) running under Google Chrome`)
    : result('chrome.hosts.live', 'blocked', 'no OpenAI Chrome host is running: open Chrome with the OpenAI extension enabled in a profile'));
  return checks;
}

export function processTable() {
  try { return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], {encoding: 'utf8', timeout: 5000}); } catch { return ''; }
}
