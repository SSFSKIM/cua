// The vendor release a Linux run's vendor engine ran from, the one lookup the vendor engine's defects
// (./vendor-defects.mjs) and the Linux declarations (./native-linux.mjs) are matched by.
//   - Since #171 M6a a run's runtime is cua's own (runtimeRelease, the derived cua-linux-… release), and the vendor
//     release is recorded apart: vendorRelease, the preparation's (provenance.mjs runtimeFacts; since #171 M6b a run
//     records none), which every connection's recorded provenance (hostAttestations[].executionFacts) must bear out,
//     with the same own runtime.
//   - A record from before M6a served the vendor's runtime itself: its runtimeRelease is that vendor release, and it
//     records no vendor release apart (none, or null from a preparation that had none).
// -> the vendor release, or null when the run does not establish one, which no defect or declaration names: its vendor
// failures stay undeclared, and no engine pair takes it.
const VENDOR_RELEASE = /^\d+\.\d+\.\d+-linux-[a-z0-9]+$/;
const OWN_RELEASE = /^cua-linux-[a-z0-9]+-/;

export function vendorReleaseOf(meta) {
  const runtime = meta?.runtimeRelease, recorded = meta?.vendorRelease;
  if (typeof runtime !== 'string') return null;
  if (VENDOR_RELEASE.test(runtime)) return recorded === undefined || recorded === null ? runtime : null;
  if (!OWN_RELEASE.test(runtime) || typeof recorded !== 'string' || !VENDOR_RELEASE.test(recorded)) return null;
  const facts = (Array.isArray(meta.hostAttestations) ? meta.hostAttestations : []).map(a => a?.executionFacts);
  if (!facts.length || facts.some(f => f?.vendorRelease !== recorded || f?.release !== runtime)) return null;
  return recorded;
}
