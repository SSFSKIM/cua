// The engine lane of the acceptance runner (#117 M3.4; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// acceptance 8 and the Decision Log's "M3 pre-flight" item 3): `accept-native --engine vendor|cua` pins one engine for
// every native item, and every result must attest it (the whole-M1b rule: refuse on the attestation, never on the
// selection alone). Pure pieces, testable without a GUI or an engine: the reply check the live TextEdit fixture wraps
// its sessions in, the ledger that observes its approvals by behaviour (per bind, per connection), and what items 3, 4
// and 8 judge from doctor's engine row, verify's report and probe-lifecycle's.
import {abandonedCountProblem, attestationProblem, isAppApproval, isLifecycleRejection} from '../probe/lib.mjs';

const result = (name, status, detail) => ({name, status, detail});

// The step a live scenario (the TextEdit fixture, scripts/probe-secrets.mjs) records once an engine is pinned: FAIL at
// the first result attesting another engine, else PASS with the count of results that attested it.
export const ATTEST_STEP = 'every result attests the pinned engine';

// A result that attested another engine (or none): nothing more may be sent on the lane.
export class AttestationRefusal extends Error {
  constructor(problem) {
    super(`refused on the attestation: ${problem}`);
    this.problem = problem;
  }
}

// Wraps `session.js` (and `dispatch`, the pause wrapper's undelayed send, scripts/mini-pause.mjs pausing) so every reply
// that carries a result is checked against `expected` ({engine, version, build}): a match calls `onAttested()`; the first
// mismatch calls `onRefused(problem)` once and throws an AttestationRefusal, and every later call throws it again
// without sending. A reply with no result (a transport timeout, a JSON-RPC error) or the connection lifecycle's pre-dispatch
// rejection (isLifecycleRejection: no runtime work ran) has nothing to attest and passes.
// With no `expected` (no engine pinned) the session is returned as it is.
export function attestReplies(session, {expected, onAttested = () => {}, onRefused = () => {}}) {
  if (!expected) return session;
  let refusal = null;
  const checked = send => async (...args) => {
    if (refusal) throw refusal;
    const reply = await send(...args);
    if (reply?.result && !isLifecycleRejection(reply.result)) {
      const problem = attestationProblem(reply.result._meta, expected);
      if (problem) {
        refusal = new AttestationRefusal(problem);
        onRefused(problem);
        throw refusal;
      }
      onAttested();
    }
    return reply;
  };
  session.js = checked(session.js.bind(session));
  if (session.dispatch) session.dispatch = checked(session.dispatch);
  return session;
}

// The approvals a fixture observes by behaviour, never by a file the host keeps (the Design's Policy paragraph: a second
// bind in the same connection asks nothing, a new connection asks again). A bind of `app` runs between `begin(name)`
// and `end()`; only then is that connection's approval for `app` accepted (any display name: the engine names the app as
// the system localizes it), and it is counted to that bind. Every other elicitation, the same approval outside a bind
// included (the connection's memory must answer those), is declined and counted to the connection; other server
// requests are declined and not counted. `connections()` is approvalsByBehaviour's input, with `bound` set by the
// fixture once a connection's first bind landed on its own document.
export function approvalLedger({app}) {
  const entries = [];
  let open = null;
  const entry = name => {
    let found = entries.find(e => e.name === name);
    if (!found) entries.push(found = {name, bound: false, binds: [], declined: 0});
    return found;
  };
  return {
    entry,
    begin(name) {
      const bind = {asked: 0, accepted: 0, error: false};
      entry(name).binds.push(bind);
      open = {name, bind};
      return bind;
    },
    end() { open = null; },
    answer(name, msg) {
      if (msg?.method !== 'elicitation/create') return {action: 'decline'};
      if (open?.name === name && isAppApproval(msg, app)) {
        open.bind.asked++;
        open.bind.accepted++;
        return {action: 'accept', content: {}};
      }
      entry(name).declined++;
      return {action: 'decline'};
    },
    connections: () => entries,
  };
}

// ---- accept-native's items: what doctor, verify and probe-lifecycle reported about the pinned engine ----
// `pin` is the run's pinned engine ({engine, pinnedBy}, scripts/probe/pinned-engine.mjs pinLane), null where no engine
// is driven (off macOS, or without the computer surface): then there is nothing engine-specific to judge.

// Item 3: doctor's `engine` row and its report's `engine` object (src/runtime/doctor-engine.mjs). Sessions here must
// drive the pinned engine (`selected`, repl.host's own selection); with cua's engine the row is `pass` or `warn` (Input
// Monitoring missing, say), never `fail` (a grant missing, the engine unreadable) or `skip`; with the vendor's it is
// `skip`, since nothing of cua's engine is in use. -> a check, or null.
export function doctorEngineCheck(doctor, pin) {
  if (!pin) return null;
  const name = `doctor's engine row: sessions here drive the pinned ${pin.engine} engine`;
  const row = doctor?.checks?.find(c => c.name === 'engine');
  const engine = doctor?.engine;
  if (!row || !engine) return result(name, 'FAIL', `doctor reported ${row ? 'no engine object' : 'no engine row'}`);
  const rowOk = pin.engine === 'cua' ? ['pass', 'warn'].includes(row.status) : row.status === 'skip';
  const facts = [`selected ${engine.selected ?? 'none'}${engine.refused ? ` (refused: ${engine.refused.code})` : ''}`,
    `preferred ${engine.preferred ? `${engine.preferred.engine} (${engine.preferred.reason})` : 'none'}`, `row ${row.status}`];
  if (pin.engine === 'cua') {
    const permissions = engine.permissions ?? {};
    facts.push(`permissions ${['accessibility', 'screenRecording', 'inputMonitoring'].map(k => `${k} ${permissions[k] ?? 'unread'}`).join(', ')}`,
      `build ${engine.build && engine.build === engine.approvedBuild ? 'the approved one' : 'not the approved one'}`);
  }
  return result(name, engine.selected === pin.engine && rowOk ? 'PASS' : 'FAIL', facts.join('; '));
}

// Item 4: verify's report (verify.mjs). The runtime tree is judged by the host that served (`allExecutablesExpected`:
// the installed release on the vendor host, cua's Node on cua's own, where `allExecutablesRelocated` is null), with no
// installed-desktop runtime path; and, with an engine pinned, verify pinned the same engine and every result attested
// it (a refusal, the launcher's or the attestation's, is one of its problems). -> checks.
export function verifyChecks(report, pin) {
  const processes = report?.processes;
  const host = processes?.host ? ` (${processes.host} host)` : '';
  const checks = [result('runtime executables as the serving host expects; no installed-desktop runtime path',
    processes?.allExecutablesExpected === true && processes.desktopRuntimePaths?.length === 0 ? 'PASS' : 'FAIL',
    processes ? `${processes.ancestry?.length ?? 0} processes (server, anchor, runtime)${host}: ${[...new Set((processes.ancestry ?? []).map(p => p.executable))].join('; ')}`
      + `${processes.desktopRuntimePaths?.length ? `; installed-desktop paths: ${processes.desktopRuntimePaths.join(', ')}` : ''}` : 'no process evidence')];
  if (!pin) return checks;
  const name = `verify pinned the ${pin.engine} engine and every result attested it`;
  const refusals = (report?.problems ?? []).filter(p => /refused on the attestation|the launcher refuses/.test(p));
  const engine = report?.engine;
  const ok = engine?.engine === pin.engine && engine.attested > 0 && !refusals.length;
  const detail = engine ? `verify pinned ${engine.engine} (${engine.pinnedBy}) on the ${engine.host} host; ${engine.attested} result(s) attested`
    + (engine.socket ? `; engine socket: ${engine.socket.bound.length} bound, ${engine.socket.clients.length} client(s), ${engine.socket.unseenClients} unseen; ${engine.startedFromCuaRoots?.length ?? 0} process(es) started from cua's roots` : '')
    : report ? 'verify reported no engine' : 'no verify report';
  checks.push(result(name, ok ? 'PASS' : 'FAIL', `${detail}${refusals.length ? `; ${refusals.join('; ')}` : ''}`));
  return checks;
}

// Item 8: probe-lifecycle's report (scripts/probe-lifecycle.mjs). It pinned the same engine, every result attested it
// (a mismatch refuses the run, `refused`), and with cua's engine no closed connection still holds its socket, every
// connection's client having been seen (an unseen one leaves the release unproven). -> a check, or null.
const CLOSES = [['cancelDuringJs', p => p.cancelDuringJs?.close], ['endTaskWithWorkInFlight', p => p.endTaskWithWorkInFlight?.close],
  ['uncertainCompletion', p => p.uncertainCompletion], ['idleClose', p => p.idleClose]];
export function lifecycleEngineCheck(p, pin) {
  if (!pin) return null;
  const name = `probe-lifecycle pinned the ${pin.engine} engine, every result attested it${pin.engine === 'cua' ? ', and no closed connection holds its socket' : ''}`;
  const engine = p?.engine;
  const problems = [];
  if (p?.refused) problems.push(p.refused);
  if (!engine) problems.push('probe-lifecycle reported no engine');
  else {
    if (engine.engine !== pin.engine) problems.push(`it pinned ${engine.engine}`);
    if (!(engine.attested > 0)) problems.push('no result attested');
    const abandoned = abandonedCountProblem(engine);
    if (abandoned) problems.push(abandoned);
  }
  if (pin.engine === 'cua') for (const [scenario, close] of CLOSES.map(([label, read]) => [label, read(p ?? {})])) {
    if (!close || !Array.isArray(close.engineSocketHeldAfterExit) || !Number.isInteger(close.engineSocketClientsUnseen)) problems.push(`${scenario}: no reading of the engine socket after the close`);
    else {
      if (close.engineSocketHeldAfterExit.length) problems.push(`${scenario}: pid ${close.engineSocketHeldAfterExit.join(', ')} still hold the engine socket`);
      if (close.engineSocketClientsUnseen > 0) problems.push(`${scenario}: ${close.engineSocketClientsUnseen} connection(s) whose client lsof could not show`);
    }
  }
  return result(name, problems.length ? 'FAIL' : 'PASS',
    problems.length ? problems.join('; ') : `pinned ${engine.engine} (${engine.pinnedBy}) on the ${engine.host} host; ${engine.attested} result(s) attested`);
}
