// Device declarations are routing hints, not measured facts. Preparation records the answering machine and X session.
// Keep device-specific discovery homes here; a new Linux device must never inherit the VM's H4 registration.
// cua-linux is the Tart VM (declared, kept off since #115); cua-gce is the GCE Ubuntu 24.04 arm64 box that replaces it
// for #115's live Linux runs (its harness-owned Chrome profile is bound in the device's own discovery home).
export const DEVICES = Object.freeze({
  mini: Object.freeze({platform: 'darwin'}),
  'cua-linux': Object.freeze({platform: 'linux', discoveryHome: '/home/admin/.local/share/cua-h4', captureChrome: true}),
  'cua-gce': Object.freeze({platform: 'linux', captureChrome: true}),
  'cua-bench': Object.freeze({platform: 'linux'}),
  // GitHub's hosted macOS runner reaching itself over a loopback ssh alias (#159; scripts/spike-159/hosted.sh sets it up).
  'hosted-macos': Object.freeze({platform: 'darwin'}),
});
export function declaredDevice(device) {
  const declaration = DEVICES[device];
  if (!declaration) throw new Error(`Device ${JSON.stringify(device)} is not declared in scripts/repl-parity/devices.mjs`);
  return declaration;
}
// A live lane's device: any declared one (each is an ssh alias, never this machine; `local` is not declared).
export const isDeclaredDevice = device => typeof device === 'string' && Object.hasOwn(DEVICES, device);
export const SESSION_KEYS = ['DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS'];
export const sessionEnvironment = env => Object.fromEntries(SESSION_KEYS.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
