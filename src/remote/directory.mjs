// The devices a stdio connection can switch its target to (src/mcp/target.mjs), as the server process sees them: the
// registry (src/remote/devices.mjs) and each device's credential in the secret store (the client credential under
// CUA_DEVICE_<id>, src/remote/device.mjs clientSecretKey), both read at every call, so `cua devices add` and `/secret`
// take effect without a reconnect; and the device session client (src/remote/client.mjs) to reach one. The credential
// is read here, in the server process, and handed to the client only: no result, error or diagnostic carries it.
//
// deviceDirectory({env}) → {list(), probe(name), open(name, {initializeParams, onMessage, signal, diagnostics})}:
// - list() → [{name, deviceId, relayUrl}], by name; an unreadable registry throws its CuaError (devices_invalid).
// - probe(name) → {status: online|offline|locked|unauthorized, code?}, never opening a session (probeDevice); a device
//   with no usable credential reads unauthorized, credential_missing, without asking it.
// - open(name, …) → an open device session; a DeviceError device_unknown or credential_missing before anything is sent,
//   else whatever the open itself rejects with. Its diagnostics are prefixed with the device's name.
import {fileStore, SecretStoreError, storeDir} from '../secrets/store.mjs';
import {clientSecretKey} from './device.mjs';
import {DEVICE_NAME, endpointOf, readDevices} from './devices.mjs';
import {DeviceError, openDeviceSession, probeDevice} from './client.mjs';

export function deviceDirectory({env = process.env, fetch = globalThis.fetch, store = fileStore({dir: storeDir(env)}), probeTimeoutMs = 3000} = {}) {
  function entryOf(name) {
    const devices = readDevices({env});
    if (typeof name === 'string' && DEVICE_NAME.test(name) && Object.hasOwn(devices, name)) return {name, ...devices[name]};
    // The name is not repeated (the caller names a well-formed one): anything else may be a credential pasted in the
    // wrong place.
    throw new DeviceError('device_unknown', 'no device is registered under that name; devices_list shows the registered names, and the user adds one with cua devices add');
  }

  async function credentialOf({deviceId}) {
    const key = clientSecretKey(deviceId);
    try { return await store.read(key); } catch (error) {
      if (!(error instanceof SecretStoreError)) throw error;
      throw new DeviceError('credential_missing', `no usable credential is stored under ${key} (${error.code}); the user stores it with /secret ${key}, or cua devices import <client config>`);
    }
  }

  return {
    async list() {
      return Object.entries(readDevices({env})).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, entry]) => ({name, ...entry}));
    },
    async probe(name) {
      let entry;
      let credential;
      try {
        entry = entryOf(name);
        credential = await credentialOf(entry);
      } catch (error) {
        if (error.code === 'credential_missing') return {status: 'unauthorized', code: 'credential_missing'};
        if (error.code === 'device_unknown') return {status: 'offline', code: 'device_unknown'};
        throw error;
      }
      return probeDevice({endpoint: endpointOf(entry), credential, fetch, timeoutMs: probeTimeoutMs});
    },
    async open(name, {initializeParams, onMessage, signal, diagnostics = () => {}}) {
      const entry = entryOf(name);
      const credential = await credentialOf(entry);
      return openDeviceSession({endpoint: endpointOf(entry), credential, initializeParams, fetch, onMessage, signal,
        diagnostics: line => diagnostics(`device ${name}: ${line}`)});
    },
  };
}
