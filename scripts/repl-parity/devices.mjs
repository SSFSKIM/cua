// Device declarations are routing hints, not measured facts. Preparation records the answering machine and X session.
// Keep device-specific discovery homes here; a new Linux device must never inherit the VM's H4 registration.
// cua-linux is the Tart VM (declared, kept off since #115); cua-gce is the GCE Ubuntu 24.04 arm64 box that replaces it
// for #115's live Linux runs (its harness-owned Chrome profile is bound in the device's own discovery home).
export const DEVICES = Object.freeze({
  mini: Object.freeze({platform: 'darwin'}),
  'cua-linux': Object.freeze({platform: 'linux', discoveryHome: '/home/admin/.local/share/cua-h4', captureChrome: true}),
  'cua-gce': Object.freeze({platform: 'linux', captureChrome: true}),
  'cua-bench': Object.freeze({platform: 'linux'}),
  // #171's VMs (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Concrete Steps "Once per VM"): cua-171 the
  // x86-64 VM, cua-171-arm64 M5's arm64 VM. Each is prepared as an ssh alias on the VM reaching the VM itself (a key of
  // its own in authorized_keys, HostName 127.0.0.1), so the controller runs in the VM's worktree, as hosted-macos reaches
  // itself; with one ready bound Chrome profile, which prepare requires (`cua profiles add me --chrome-profile Default`,
  // then `cua profiles bind me`); and with gedit, gnome-text-editor and zenity installed.
  'cua-171': Object.freeze({platform: 'linux'}),
  'cua-171-arm64': Object.freeze({platform: 'linux'}),
  // GitHub's hosted macOS runner reaching itself over a loopback ssh alias, which scripts/repl-parity/hosted/hosted.sh
  // sets up there (#159, ci-kit gates sandbox-denials and parity-browser).
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
