// A fake of src/profiles/chrome.mjs's chromeFacts for the three file states each fact can be in, so readiness, add,
// bind and doctor can be driven through "this process may not read Chrome's data directory" (macOS privacy protection
// answers EPERM there to a process without Full Disk Access) without changing real permissions.
//   profiles: {<directory>: {directory?: 'exists'|'missing'|'unreadable', extension?: 'installed'|'absent'|'unreadable', name?}}
// A directory not listed is missing. `localState: 'unreadable'` makes displayNames fail as a refused read would.
import {CuaError} from '../../src/runtime/errors.mjs';

export function fakeChromeFacts(profiles = {}, {code = 'EPERM', localState = 'readable', nativeHost = {present: false}} = {}) {
  const entry = name => profiles[name];
  const directory = name => entry(name) ? entry(name).directory ?? 'exists' : 'missing';
  const extension = name => directory(name) === 'missing' ? 'absent' : directory(name) === 'unreadable' ? 'unreadable' : entry(name).extension ?? 'absent';
  return {
    userData: '/fake/Chrome',
    isDirectoryName: name => typeof name === 'string' && name.length > 0,
    profileDirectoryExists: directory,
    extensionInstalled: extension,
    readError: name => extension(name) === 'unreadable' ? code : undefined,
    displayNames() {
      if (localState === 'unreadable') throw Object.assign(new CuaError('chrome_local_state_unreadable', `this process may not read Chrome's Local State (${code})`), {readError: code});
      return new Map(Object.entries(profiles).filter(([, p]) => typeof p.name === 'string').map(([dir, p]) => [dir, p.name]));
    },
    nativeHost: () => nativeHost,
  };
}
