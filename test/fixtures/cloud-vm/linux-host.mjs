// Preloaded (NODE_OPTIONS=--import) into the fake VM's node processes: the VM is Linux, whatever host runs the test, so
// the checkout's own code (manifest.mjs's selectPin, as an old provisioner calls it) answers as it does on a VM.
Object.defineProperty(process, 'platform', {value: 'linux'});
