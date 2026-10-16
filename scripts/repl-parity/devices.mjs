// Device declarations are routing hints, not measured facts. Preparation records the answering machine and X session.
// Keep device-specific discovery homes here; a new Linux device must never inherit the VM's H4 registration.
export const DEVICES = Object.freeze({
  mini: Object.freeze({platform: 'darwin'}),
  'cua-linux': Object.freeze({platform: 'linux', discoveryHome: '/home/admin/.local/share/cua-h4', captureChrome: true}),
  'cua-bench': Object.freeze({platform: 'linux'}),
});
export function declaredDevice(device) {
  const declaration = DEVICES[device];
  if (!declaration) throw new Error(`Device ${JSON.stringify(device)} is not declared in scripts/repl-parity/devices.mjs`);
  return declaration;
}
export const SESSION_KEYS = ['DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS'];
export const sessionEnvironment = env => Object.fromEntries(SESSION_KEYS.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
