// Preloaded (NODE_OPTIONS=--import) into the fake VM's node processes: the VM is linux-x64, whatever host runs the test,
// so the checkout's own code (manifest.mjs's selectPin as an old provisioner calls it, the real `cua install`) answers as
// it does on a VM, and takes the install fixture's x64 assets.
Object.defineProperty(process, 'platform', {value: 'linux'});
Object.defineProperty(process, 'arch', {value: 'x64'});
