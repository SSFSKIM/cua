// A fake VM's file system for the cloud template's tests (test/fixtures/cloud-vm/vm.mjs): the paths a provisioner or
// update.sh's remote commands name on the VM move under a scratch root, so the scripts run here unprivileged, on any
// host. Only those paths move: /tmp, a macOS temporary directory (/var/folders) and the scratch repositories stay.
const VM_PATHS = /(^|[\s'"=(<>:])\/(etc|var\/cache|var\/lib|var\/log|opt\/cua|usr\/local|root|run\/user|dev\/dri)(?=[/\s'"]|$)/gm;

export const remap = (text, root) => text.replace(VM_PATHS, (_, before, path) => `${before}${root}/${path}`);

// A provisioner as the fake VM runs it: its paths remapped, and its root check met (the test runs it unprivileged).
// Nothing else in it changes. A VM path the remap missed refuses the script: run as the test's user, it could reach
// the host's own /opt/cua (a VM made by this template runs its tests as the user who owns that checkout).
export function remapScript(text, root) {
  const check = '[[ $EUID == 0 ]]';
  if (text.split(check).length !== 2) throw new Error('the provisioner\'s root check is not where the fake VM expects it');
  const remapped = remap(text, root).replace(check, '[[ 0 == 0 ]]');
  const missed = remapped.replaceAll(`${root}/`, '<root>').match(/\/(etc|var\/cache|var\/lib|var\/log|opt\/cua|usr\/local|root|run\/user|dev\/dri)(?=[/\s'"]|$).*/m);
  if (missed) throw new Error(`the fake VM would not remap a path in the provisioner: ${missed[0]}`);
  return remapped;
}
