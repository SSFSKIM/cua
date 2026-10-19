// Where measure.mjs's device-side steps run: a declared macOS device over ssh (scripts/repl-parity/devices.mjs, the
// harness checkout at scripts/native-baseline/remote.mjs's PARITY_CHECKOUT, placed by `native-baseline.mjs prepare
// --commit`), or `local`, this Mac, with this checkout as the harness checkout. Every device step is a shell line run in
// the checkout; the engine steps are engine-device.mjs's commands, one JSON line each.
import {execFileSync} from 'node:child_process';
import {remoteCommand, quote, root} from '../../../browser-parity/topology.mjs';
import {PARITY_CHECKOUT} from '../../../native-baseline/remote.mjs';
import {declaredDevice} from '../../../repl-parity/devices.mjs';

const CHECKOUT_PREFIX = `cd ${PARITY_CHECKOUT} && `;

// -> {device, local, checkout, node, command(script) -> {command, args}}.
export function deviceOf(device) {
  if (device === 'local') {
    if (process.platform !== 'darwin') throw new Error('--device local runs on this Mac only');
    return {device, local: true, checkout: root.replace(/\/$/, ''), node: quote(process.execPath), command: script => ({command: '/bin/sh', args: ['-c', script]})};
  }
  if (typeof device !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(device)) throw new Error('--device needs a declared device alias or local');
  if (declaredDevice(device).platform !== 'darwin') throw new Error(`${device} is not a macOS device`);
  return {device, local: false, checkout: PARITY_CHECKOUT, node: 'node', command: script => remoteCommand(device, script)};
}

// A script written for the parity checkout (the baseline's preflight and preparation scripts begin with
// `cd $HOME/Developer/GitHub/cua-parity && `), run in this device's checkout instead.
export function inCheckout(d, script) {
  const body = script.startsWith(CHECKOUT_PREFIX) ? script.slice(CHECKOUT_PREFIX.length) : script;
  return `cd ${d.local ? quote(d.checkout) : d.checkout} && ${body}`;
}

// Runs a shell line in the device's checkout. -> stdout.
export const shellOf = (d, {exec = execFileSync} = {}) => script => {
  const {command, args} = d.command(inCheckout(d, script));
  return exec(command, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
};

// The last line of a device command's output as JSON.
export const lastJson = text => JSON.parse(String(text).trim().split('\n').at(-1));

// engine-device.mjs on the device. `engine`: the bundle (default: the device's approved location).
let watched = null;

export function engineOps(d, shell, {engine} = {}) {
  const run = (...args) => {
    const out = lastJson(shell(`${d.node} scripts/spike/engine/measure/engine-device.mjs ${args.map(quote).join(' ')}${engine ? ` --engine ${quote(engine)}` : ''}`));
    if (out?.error?.errorName === 'device') throw new Error(`engine-device ${args[0]}: ${out.error.message}`);
    return out;
  };
  // A spike probe's result out of the rpc envelope; the engine's refusal thrown with its errorName, code and sentence,
  // and its other members as `data` (probe_tap's mode and preflights, probe_spike activate's `probe` report); an
  // unreachable engine with the reason.
  const probe = (method, op, extra) => {
    const answer = run('rpc', method, JSON.stringify({op, ...extra}));
    if (answer.ok) return answer.result;
    const {code = null, errorName = null, message, ...data} = answer.error ?? {};
    throw Object.assign(new Error(message ?? `the engine is unreachable (${answer.unreachable})`), {errorName, code, data});
  };
  return {
    rpc: (method, params) => run('rpc', method, ...(params ? [JSON.stringify(params)] : [])),
    bundle: () => run('bundle'),
    approved: () => run('approved').approved,
    writeApproved: record => run('write-approved', JSON.stringify(record)),
    launch: ({plain = false} = {}) => run('launch', ...(plain ? ['--plain'] : [])),
    checkoutBuild: () => run('checkout-build'),
    inputSource: arg => run('input-source', arg),
    // probe_tap {op: start, app, seconds, mode: listen|active} | {op: stop}; a refusal's sentence and data carry the
    // mode and both preflights (tapNotCreated's say which grant was missing).
    probeTap: (op, extra = {}) => probe('probe_tap', op, extra),
    // probe_spike {op: activationPoint|activate|selection, app, set?}.
    probeSpike: (op, extra = {}) => probe('probe_spike', op, extra),
    keystroke: (pid, bounds, text) => run('keystroke', String(pid), bounds, text),
    watch: () => { watched = run('watch'); return watched; },
    watchStop: () => { if (!watched) throw new Error('no watch is running'); const answer = run('watch-stop', String(watched.pid), watched.dir); watched = null; return answer.lines ?? []; },
    copy: dir => run('copy', dir),
    removeCopy: dir => run('remove-copy', dir),
  };
}
