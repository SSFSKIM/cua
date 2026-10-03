// M10 --fixtures: the --with-tabs machinery against the fake runtime (fake-runtime.mjs), before any live run. Each
// case starts the probe's real test page and the fake runtime through the real owned anchor, runs the same session,
// cells, elicitation policy, leftover accounting, judge and report reduction as the live layer, then checks what the
// case is about: the accept/decline matrix on the wire, leftover reporting, target selection, and that no seeded
// user-tab title/URL, token or socket path reaches a report.
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnUpstream} from '../../../../src/mcp/upstream.mjs';
import {reportLeaks} from './classify.mjs';
import {decideElicitation} from './elicitation.mjs';
import {publicObservations} from './live-layer.mjs';
import {runBrowserSession} from './session.mjs';
import {judgeTabs, LEFTOVER} from './tabs.mjs';
import {startTestPage} from './test-page.mjs';
import {originAccessRequest, downloadRequest, rawCdpRequest, historyRequest, ALL_SITES_SCOPE_KEY} from './vendor-shapes.mjs';

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url));
const PNG_SHA256 = createHash('sha256').update(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')).digest('hex');
const ALL_TAB_SCENARIOS = ['list-tabs-reach', 'target-browser', 'create-tab', 'owned-page', 'fill-input', 'click-dom-change', 'screenshot', 'close-created-tab', 'elicitations-own-origin-only', 'user-tabs-untouched'];

// Generated sentinels standing for user data the probe must never report.
function sentinels() {
  const tag = randomBytes(8).toString('hex');
  return {
    title: `SENTINELTITLE${tag}`,
    url: `https://sentinel-${tag}.example/private/inbox?token=SENTINELTOKEN${tag}${tag}`,
    host: `sentinel-${tag}.example`,
    token: `SENTINELTOKEN${tag}${tag}`,
    socket: `/tmp/codex-browser-use/${randomUUID()}.sock`,
  };
}

const userTabs = (s, ids) => ids.map(id => ({id: String(id), providerTabId: String(id), title: `${s.title} ${id}`, url: `${s.url}&tab=${id}`}));

// Decline matrices sent during listTabs: every request must be declined on the wire. Foreign requests (not the probe
// page) leave the elicitation verdict PASS; refused shapes naming the probe origin make it BLOCKED.
function foreignMatrix(origin, s) {
  const port = Number(new URL(origin).port);
  return [
    ['user-tab-origin', originAccessRequest(new URL(s.url).origin)],
    ['lookalike-host', originAccessRequest(`http://127.0.0.1.${s.host}:${port}`)],
    ['localhost-alias', originAccessRequest(`http://localhost:${port}`)],
    ['different-port', originAccessRequest(`http://127.0.0.1:${port === 65535 ? port - 1 : port + 1}`)],
    ['unknown-shape', {mode: 'form', requestedSchema: {type: 'object', properties: {}}, message: `Something about ${s.url}`, _meta: {tool_name: 'mystery'}}],
    ['raw-cdp-own-origin', rawCdpRequest(origin)],
    ['download-own-origin', downloadRequest(origin)],
    ['history', historyRequest()],
  ].map(([label, params]) => ({label, params}));
}
function ownOriginVariants(origin, s) {
  return [
    ['two-origins', originAccessRequest(origin, {meta: {tool_params: {origin, origins: [origin, new URL(s.url).origin]}}})],
    ['persistent-all-sites-grant', originAccessRequest(origin, {meta: {[ALL_SITES_SCOPE_KEY]: 'all-sites'}})],
    ['url-mode', originAccessRequest(origin, {params: {mode: 'url', url: s.url}})],
    ['asks-for-input', originAccessRequest(origin, {params: {requestedSchema: {type: 'object', properties: {secret: {type: 'string'}}}}})],
  ].map(([label, params]) => ({label, params}));
}
const labels = matrix => matrix('http://127.0.0.1:1', sentinels()).map(e => e.label);

async function runCase({name, browsers, browserIndex, scenario = {}, extras = () => []}) {
  const s = sentinels();
  const page = await startTestPage();
  const scratch = realpathSync(mkdtempSync('/tmp/cua-m10-fixture-'));
  const logFile = join(scratch, 'answers.jsonl');
  const fake = {
    browsers: browsers(s),
    extraElicitations: extras(page.origin, s),
    // What a vendor error quoting user data could look like: a real tab's title and URL, and a host socket path.
    errorText: `tab "${s.title} 101" at ${s.url}&tab=101 via ${s.socket}`,
    ...scenario,
  };
  const env = {PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '/', FAKE_RUNTIME_SCENARIO: JSON.stringify(fake), FAKE_RUNTIME_LOG: logFile};
  const upstream = spawnUpstream({command: process.execPath, args: [FAKE], env, cwd: scratch}, {stderr: 'ignore'});
  let o;
  let teardown;
  try {
    o = await runBrowserSession({upstream, policy: msg => decideElicitation(msg, {origin: page.origin}), withTabs: true, page, browserIndex, label: 'M10', clientName: 'cua-m10-fixtures', screenshotDir: scratch});
  } finally {
    teardown = await upstream.terminate({budgetMs: 5000});
    o ??= {};
    o.testPage = {requests: page.requests()};
    await page.close();
  }
  const answers = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const screenshotKept = Boolean(o.screenshotFile && existsSync(o.screenshotFile));
  delete o.screenshotFile;
  rmSync(scratch, {recursive: true, force: true});
  o.withTabs = true;
  o.teardown = {confirmed: teardown.confirmed};
  const observations = publicObservations(o);
  const scenarios = judgeTabs(o);
  const reportText = JSON.stringify({observations, scenarios});
  const forbidden = [s.title, s.url, s.host, s.token, s.socket, page.origin, page.url, page.documentMarker, page.typedMarker];
  return {name, o, observations, scenarios, answers, screenshotKept, teardown, reportText, forbidden, leaks: reportLeaks(reportText, forbidden)};
}

const statusOf = (run, id) => run.scenarios.find(x => x.id === id)?.status;
const answerOf = (run, label) => run.answers.find(a => a.label === label)?.answer;
const isSessionAccept = a => a?.action === 'accept' && a._meta?.persist === 'session' && Object.keys(a._meta).length === 1;

const CASES = [
  {id: 'fixture-happy-path', title: 'one profile: the full owned-page round trip passes; only the own-origin request is accepted, for the session; the created tab is closed and confirmed gone',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101, 102, 103])}]},
    check: r => [
      ...ALL_TAB_SCENARIOS.filter(id => statusOf(r, id) !== 'PASS').map(id => `${id} is ${statusOf(r, id)}`),
      ...(isSessionAccept(answerOf(r, 'own-origin')) ? [] : ['own-origin answer was not {accept, _meta:{persist:"session"}}']),
      ...(r.o.tabs?.screenshot?.sha256 === PNG_SHA256 && r.screenshotKept ? [] : ['screenshot hash/file mismatch']),
      ...(r.o.listTabs?.[0]?.tabCount === 3 ? [] : ['user tab count not reduced to 3']),
      ...(r.o.tabs?.leftover?.status === LEFTOVER.none ? [] : ['a leftover was reported']),
    ]},
  {id: 'fixture-decline-foreign', title: 'declined on the wire, verdict still PASS: user-tab origin, lookalike host, localhost alias, different port, unknown shape, raw CDP, download, history; the own origin accepted for the session',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101])}], extras: foreignMatrix},
    check: r => [
      ...labels(foreignMatrix).filter(label => answerOf(r, label)?.action !== 'decline').map(label => `${label} was not declined`),
      ...(isSessionAccept(answerOf(r, 'own-origin')) ? [] : ['own-origin not accepted for the session']),
      ...(statusOf(r, 'elicitations-own-origin-only') === 'PASS' ? [] : [`elicitation verdict ${statusOf(r, 'elicitations-own-origin-only')}`]),
      ...(r.o.elicitations?.length === labels(foreignMatrix).length + 1 ? [] : [`inventory has ${r.o.elicitations?.length} entries`]),
    ]},
  {id: 'fixture-decline-own-origin-variants', title: 'refused shapes naming the probe origin are declined on the wire and make the verdict BLOCKED: two origins, persistent all-sites grant, URL mode, input-asking form',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101])}], extras: ownOriginVariants},
    check: r => [
      ...labels(ownOriginVariants).filter(label => answerOf(r, label)?.action !== 'decline').map(label => `${label} was not declined`),
      ...(isSessionAccept(answerOf(r, 'own-origin')) ? [] : ['the exact own-origin request was not accepted for the session']),
      ...(statusOf(r, 'elicitations-own-origin-only') === 'BLOCKED' ? [] : [`elicitation verdict ${statusOf(r, 'elicitations-own-origin-only')}`]),
    ]},
  {id: 'fixture-unstructured-own-origin', title: 'an access request naming the probe origin only in its message is declined and the elicitation verdict is BLOCKED (no text matching); the created tab is still closed',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101])}], scenario: {originRequest: 'unstructured'}},
    check: r => [
      ...(answerOf(r, 'own-origin')?.action === 'decline' ? [] : ['unstructured own-origin request was not declined']),
      ...(statusOf(r, 'elicitations-own-origin-only') === 'BLOCKED' ? [] : [`elicitation verdict ${statusOf(r, 'elicitations-own-origin-only')}`]),
      ...(statusOf(r, 'owned-page') === 'FAIL' && statusOf(r, 'fill-input') === 'BLOCKED' ? [] : ['input was not withheld']),
      ...(statusOf(r, 'close-created-tab') === 'PASS' ? [] : ['the created tab was not closed']),
    ]},
  {id: 'fixture-leftover-close-fails', title: 'close() fails: the possible leftover is reported for the user and nothing further is sent (no confirmation listTabs, no retry)',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101])}], scenario: {close: 'throw'}},
    check: r => [
      ...(r.o.tabs?.leftover?.status === LEFTOVER.possiblyOpen && /close it by hand/.test(r.o.tabs.leftover.note) ? [] : ['leftover not reported as possibly open']),
      ...(r.o.cellsSent?.at(-1) === 'closeCreatedTab' ? [] : ['a cell followed the failed close']),
      ...(statusOf(r, 'close-created-tab') === 'FAIL' ? [] : ['close verdict not FAIL']),
    ]},
  {id: 'fixture-leftover-still-listed', title: 'close() returns but the tab is still listed: reported as an open leftover',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101])}], scenario: {close: 'linger'}},
    check: r => [
      ...(r.o.tabs?.leftover?.status === LEFTOVER.open && /close it by hand/.test(r.o.tabs.leftover.note) ? [] : ['leftover not reported as open']),
      ...(statusOf(r, 'close-created-tab') === 'FAIL' ? [] : ['close verdict not FAIL']),
    ]},
  {id: 'fixture-create-fails', title: 'createBrowserTab fails: no tab id is guessed, nothing is closed, and a possible new tab is reported for the user',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101])}], scenario: {createFails: true}},
    check: r => [
      ...(r.o.tabs?.leftover?.status === LEFTOVER.unknown ? [] : ['leftover not unknown']),
      ...(r.o.cellsSent?.includes('closeCreatedTab') ? ['a close was attempted without a tab id'] : []),
    ]},
  {id: 'fixture-ambiguous-profiles', title: 'two backends showing different tabs and no --browser-index: BLOCKED, no tab created',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101, 102])}, {id: '2', tabs: userTabs(s, [201])}]},
    check: r => [
      ...(statusOf(r, 'target-browser') === 'BLOCKED' ? [] : ['target not BLOCKED']),
      ...(r.o.cellsSent?.includes('createBrowserTab') ? ['a tab was created'] : []),
    ]},
  {id: 'fixture-same-profile', title: 'two backends showing the same tabs (one profile): the round trip runs on the first',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101, 102])}, {id: '2', tabs: userTabs(s, [101, 102])}]},
    check: r => [
      ...(r.o.tabs?.target?.index === 0 ? [] : ['target not 0']),
      ...(statusOf(r, 'close-created-tab') === 'PASS' && statusOf(r, 'click-dom-change') === 'PASS' ? [] : ['round trip did not pass']),
    ]},
  {id: 'fixture-explicit-index', title: 'distinct profiles with --browser-index 1: the round trip runs on browser 1 only',
    run: {browsers: s => [{id: '1', tabs: userTabs(s, [101])}, {id: '2', tabs: userTabs(s, [201])}], browserIndex: 1},
    check: r => [
      ...(r.o.tabs?.target?.index === 1 ? [] : ['target not 1']),
      ...(statusOf(r, 'close-created-tab') === 'PASS' ? [] : ['round trip did not close']),
    ]},
];

export async function runFixturesLayer() {
  const scenarios = [];
  const runs = [];
  for (const c of CASES) {
    let run;
    let problems;
    try {
      run = await runCase({name: c.id, ...c.run});
      problems = c.check(run);
      if (!run.teardown.confirmed) problems.push('fake runtime teardown unconfirmed');
    } catch (e) {
      problems = [`case threw: ${String(e?.message ?? e).slice(0, 200)}`];
    }
    if (run) runs.push(run);
    scenarios.push({id: c.id, title: c.title, status: problems.length ? 'FAIL' : 'PASS', detail: {problems,
      ...(run ? {verdicts: Object.fromEntries(run.scenarios.map(x => [x.id, x.status])), leftover: run.o.tabs?.leftover?.status ?? null, elicitations: run.o.elicitations?.map(e => `${e.kind}:${e.answered}`)} : {})}});
  }
  const leaky = runs.filter(r => r.leaks.length);
  const guard = reportLeaks(JSON.stringify({text: 'https://sentinel.example/x', path: '/Users/x/y'}), []);
  scenarios.push({id: 'fixture-report-sanitization', title: 'no seeded user-tab title/URL, token, socket path, probe origin or page marker appears in any case report, and the leak guard catches a deliberately leaky report',
    status: runs.length === CASES.length && !leaky.length && guard.length >= 2 ? 'PASS' : 'FAIL',
    detail: {casesScanned: runs.length, leakyCases: leaky.map(r => ({name: r.name, findings: r.leaks})), guardFindingsOnLeakyReport: guard.length}});
  return {layer: 'fixtures', milestone: 'M10', chromeAttached: false, liveRun: false, scenarios, caseReports: runs.map(r => ({name: r.name, observations: r.observations, scenarios: r.scenarios})), forbidden: runs.flatMap(r => r.forbidden)};
}
