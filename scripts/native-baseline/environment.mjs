// A fresh-home path changes each run; its role does not. Everything else affecting this native experiment is exact,
// including whether the runtime was a fresh install or the approved copy reused in place (and which copy).
import {isDeepStrictEqual} from 'node:util';
import {assertManagedNode} from '../repl-parity/node-provenance.mjs';
import {surfaceOf} from './summary.mjs';
const relativeNode = meta => meta.ownNode?.path?.startsWith(meta.home + '/') ? meta.ownNode.path.slice(meta.home.length) : meta.ownNode?.path;
export function comparisonEnvironment(meta) {
  const {CUA_REPL_HOST: _host, ...environment} = meta.environment ?? {};
  return {device:meta.device, identity:meta.deviceIdentity, controller:meta.controllerIdentity, platform:meta.platform, hardware:meta.hardware, os:meta.os,
    display:meta.display, xSession:meta.xSession, gedit:meta.gedit?.version, locale:meta.gedit?.locale, environment,
    checkout:meta.checkout, node:meta.node, ownNode:{path:relativeNode(meta),version:meta.ownNode?.version}, nodeMode:meta.nodeMode,
    runtime:meta.runtime, sandbox:meta.sandbox, protocolVersion:meta.protocolVersion, plan:meta.plan,
    experiment:meta.measurement?.experiment, runtimeReuse:meta.runtimeReuse ? {release:meta.runtimeReuse.release, helper:meta.runtimeReuse.helper} : null};
}
export function environmentProblems(runs) {
  const problems = [], reference = comparisonEnvironment(runs[0]?.meta ?? {});
  for (const {name, meta} of runs) {
    // A run installs fresh, or (macOS) serves the owner-approved runtime copy in place and records it (prepare.mjs).
    const install = meta.measurement?.freshInstall === true || (meta.measurement?.freshInstall === false && meta.runtimeReuse?.helper && meta.runtimeReuse.approvedHome === meta.home);
    if (meta.measurement?.schema !== 2 || !install || !meta.measurement?.experiment) {
      problems.push(`${name}: historical/M0 native baseline is not an M5 comparator; remeasure both triples in one experiment`);
      continue;
    }
    if (meta.nodeMode !== 'managed') problems.push(`${name}: diagnostic Node override is not release performance evidence`);
    try { assertManagedNode(meta); } catch (error) { problems.push(`${name}: ${error.message}`); }
    const answering = meta.answeringNode;
    if (!answering?.path || !answering?.version || !meta.hostAttestations?.length || meta.hostAttestations.some(a => !isDeepStrictEqual(a?._meta?.['cua/nativeExecution'], answering))) problems.push(`${name}: missing or inconsistent answering Node witness`);
    if (meta.host === 'cua' && !isDeepStrictEqual(answering,meta.ownNode)) problems.push(`${name}: answering Node is not the installed managed Node`);
    if (meta.host === 'vendor' && !answering?.path?.startsWith(`${meta.home}/runtimes/${meta.runtime?.release}/`)) problems.push(`${name}: vendor answering Node is outside the run's runtime`);
    if (!meta.controllerIdentity?.hostname || !meta.controllerIdentity?.arch) problems.push(`${name}: controller identity is incomplete`);
    const identity = meta.deviceIdentity;
    if (!identity || identity.alias !== meta.device || !identity.arch || !identity.hostname || !identity.os || !identity.cpu?.model || !(identity.cpu?.count > 0)) problems.push(`${name}: device identity is incomplete`);
    for (const place of ['device','controller']) for (const when of ['before','after']) {
      if (typeof meta.load?.[place]?.[when] !== 'string' || !meta.load[place][when].trim()) problems.push(`${name}: missing ${place} ${when} uptime`);
    }
    // gedit is the native run's target; a browser-surface run drives no app.
    const native = meta.platform === 'linux' && surfaceOf(meta) === 'computer';
    if (native && (!meta.xSession?.DISPLAY || !meta.gedit?.version)) problems.push(`${name}: Linux desktop environment is incomplete`);
    if (native && !meta.gedit?.locale?.LANG) problems.push(`${name}: gedit locale is missing`);
    const actual = comparisonEnvironment(meta);
    for (const key of Object.keys(reference)) if (!isDeepStrictEqual(reference[key],actual[key])) problems.push(`${name}: ${key} environment differs from ${runs[0].name}`);
  }
  return problems;
}
