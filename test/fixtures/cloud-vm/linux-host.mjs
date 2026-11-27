// Preloaded (NODE_OPTIONS=--import) into the fake VM's node processes: the VM is linux-x64 with glibc (Ubuntu), whatever
// host runs the test, so the checkout's own code (manifest.mjs's selectPin as an old provisioner calls it, the real
// `cua install`) answers as it does on a VM, and takes the install fixture's x64 glibc assets. On macOS node's report
// has no glibc version, which the module tree would read as musl.
Object.defineProperty(process, 'platform', {value: 'linux'});
Object.defineProperty(process, 'arch', {value: 'x64'});
const getReport = process.report.getReport.bind(process.report);
process.report.getReport = (...args) => {
  const report = getReport(...args);
  report.header.glibcVersionRuntime ??= '2.39';
  return report;
};
