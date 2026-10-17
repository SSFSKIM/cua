// The native helper's app-server exchange (#115 M0): the audit of what cli-slot.mjs recorded between the helper and the
// signed CLI's `app-server --listen stdio://`, and the replay's answers built from that audit (the stub M2's compat
// app-server becomes). Only the audited form is ever printed or committed.
//
// A recorded exchange is cli-slot.mjs's JSONL: {t, dir: 'in' (helper -> app-server) | 'out' (app-server -> helper),
// line}. The audit pairs each request with its answer by id, keeps the server's notifications, renders every path the
// environment explains as a placeholder (${CODEX_HOME}, ${CUA_HOME}, ${HOME}; the longest value first), and withholds,
// as "<withheld>" with a finding naming the field (never its value):
//   - a non-empty value under a credential-, account- or identifier-shaped key (keys are read in any case style:
//     authToken, auth-token and auth_token alike; any *_id is an identifier), except the settings on SAFE_SETTINGS,
//     each by its exact path and with one of its allowed values; those are kept and listed as `reviewed`;
//   - a token-shaped string (a JWT, or a long unbroken base64/hex run);
//   - a user path (under /Users or /home) the environment does not render.

// Matched against the key in snake_case (normalizeKey).
const SENSITIVE_KEY = /token|secret|passw(or)?d|credential|cookie|api_?key|auth|account|email|bearer|session|login|installation|(^|_)ids?$/;
// The settings the signed CLI's config/read carries under credential-shaped names that are known to be harmless, by
// exact path, with the values they may keep (anything else there is withheld like any other credential-shaped value).
const STORES = ['auto', 'file', 'keyring', 'ephemeral'];
export const SAFE_SETTINGS = {
  'config/read.config.allow_login_shell': value => typeof value === 'boolean',
  'config/read.config.features.auth_elicitation': value => typeof value === 'boolean',
  'config/read.config.cli_auth_credentials_store': value => STORES.includes(value),
  'config/read.config.mcp_oauth_credentials_store': value => STORES.includes(value),
};
export const normalizeKey = key => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/[-\s.]+/g, '_').toLowerCase();
const JWT = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/;
const OPAQUE = /^[A-Za-z0-9+/=_-]{32,}$/;
const USER_PATH = /(^|[^A-Za-z0-9])\/(Users|home)\/[^/\s]+/;
const PLACEHOLDER_NAMES = ['CODEX_HOME', 'CUA_HOME', 'HOME'];
export const WITHHELD = '<withheld>';

const empty = value => value === null || value === false || value === '' || (Array.isArray(value) && value.length === 0)
  || (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

const keptSetting = (path, value) => Object.hasOwn(SAFE_SETTINGS, path) && SAFE_SETTINGS[path](value);

function auditValue(value, {where, env, findings, reviewed}) {
  const order = PLACEHOLDER_NAMES.filter(name => env[name]).sort((a, b) => env[b].length - env[a].length);
  const walk = (node, path) => {
    if (typeof node === 'string') {
      if (JWT.test(node) || (OPAQUE.test(node) && !node.startsWith('/'))) { findings.push({path, reason: 'opaque token-shaped value'}); return WITHHELD; }
      let rendered = node;
      for (const name of order) rendered = rendered.replaceAll(env[name], `\${${name}}`);
      if (USER_PATH.test(rendered)) { findings.push({path, reason: 'a user path the environment does not render'}); return WITHHELD; }
      return rendered;
    }
    if (Array.isArray(node)) return node.map((item, i) => walk(item, `${path}[${i}]`));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, item]) => {
      const at = `${path}.${key}`;
      if (SENSITIVE_KEY.test(normalizeKey(key)) && !empty(item)) {
        if (keptSetting(at, item)) { reviewed.push({path: at, kept: typeof item}); return [key, item]; }
        findings.push({path: at, reason: 'credential- or account-shaped field'});
        return [key, WITHHELD];
      }
      return [key, walk(item, at)];
    }));
    return node;
  };
  return walk(value, where);
}

export function auditExchange(records, {env}) {
  const findings = [], reviewed = [], requests = [], serverNotifications = [], clientNotifications = [];
  const responses = {}, errors = {}, byId = new Map();
  let jsonrpc = false, idType = null;
  for (const {dir, line} of records) {
    let message;
    try { message = JSON.parse(line); } catch { findings.push({path: `${dir}-line`, reason: 'not JSON'}); continue; }
    if (Object.hasOwn(message, 'jsonrpc')) jsonrpc = true;
    if (dir === 'in') {
      if (message.id === undefined) { clientNotifications.push(message.method); continue; }
      idType ??= typeof message.id;
      byId.set(JSON.stringify(message.id), message.method);
      requests.push({id: message.id, method: message.method, params: auditValue(message.params ?? null, {where: `${message.method}.params`, env, findings, reviewed})});
    } else if (message.id === undefined) {
      serverNotifications.push({method: message.method, params: auditValue(message.params ?? null, {where: `${message.method}.params`, env, findings, reviewed})});
    } else {
      const method = byId.get(JSON.stringify(message.id)) ?? `unpaired:${JSON.stringify(message.id)}`;
      byId.delete(JSON.stringify(message.id));
      if (message.error) errors[method] = auditValue(message.error, {where: `${method}.error`, env, findings, reviewed});
      else responses[method] = auditValue(message.result ?? null, {where: method, env, findings, reviewed});
    }
  }
  return {ok: findings.length === 0, framing: {jsonrpc, idType}, requests, clientNotifications, responses, errors, serverNotifications,
    unanswered: [...byId.values()], findings, reviewed};
}

// `responses` with each ${NAME} filled from `env`.
export function renderResponses(responses, env) {
  const fill = node => (typeof node === 'string' ? node.replace(/\$\{([A-Z_]+)\}/g, (_, name) => {
    if (typeof env[name] !== 'string' || env[name] === '') throw new Error(`the replay needs ${name} in its environment`);
    return env[name];
  }) : Array.isArray(node) ? node.map(fill) : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v)])) : node);
  return fill(responses);
}

// The replay's answer to one message from the helper, or null for a notification.
export function replayAnswer(message, {responses, framing}) {
  if (message.id === undefined) return null;
  const envelope = {...(framing.jsonrpc ? {jsonrpc: '2.0'} : {}), id: message.id};
  if (Object.hasOwn(responses, message.method)) return {...envelope, result: responses[message.method]};
  return {...envelope, error: {code: -32601, message: `cua replay: ${message.method} is not a recorded method; only ${Object.keys(responses).join(', ')} are answered`}};
}

// node scripts/sandbox-probe/app-server.mjs audit <raw exchange.jsonl> --codex-home <dir> --cua-home <dir> --home <dir> --out <file>
//   the audited form of one recorded exchange (cli-slot.mjs's app-server-<pid>.jsonl), as the replay reads it.
// node scripts/sandbox-probe/app-server.mjs reaudit <experiment.json> --codex-home <dir> --cua-home <dir> --home <dir>
//   replaces each app-server audit in an experiment.mjs result with a fresh audit of its raw exchange (rawLogDir, on
//   the device), so committed evidence follows the current audit rules; prints what changed, never a withheld value.
async function main() {
  const {parseArgs} = await import('node:util');
  const {readFileSync, writeFileSync} = await import('node:fs');
  const {join} = await import('node:path');
  const {values, positionals} = parseArgs({allowPositionals: true, options: {'codex-home': {type: 'string'}, 'cua-home': {type: 'string'}, home: {type: 'string'}, out: {type: 'string'}}});
  const [command, file] = positionals;
  const env = {CODEX_HOME: values['codex-home'], CUA_HOME: values['cua-home'], HOME: values.home};
  const readExchange = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(record => record.dir);
  if (command === 'audit' && file && values.out) {
    const records = readExchange(file);
    const audit = auditExchange(records, {env});
    writeFileSync(values.out, `${JSON.stringify(audit, null, 2)}\n`);
    process.stderr.write(`audited ${records.length} lines: ${audit.requests.length} requests, ${audit.findings.length} withheld, ${audit.reviewed.length} reviewed\n`);
  } else if (command === 'reaudit' && file) {
    const result = JSON.parse(readFileSync(file, 'utf8'));
    for (const server of result.appServers.filter(s => s.audit)) {
      const audit = auditExchange(readExchange(join(result.rawLogDir, server.file)), {env});
      const changed = JSON.stringify(audit) !== JSON.stringify(server.audit);
      process.stdout.write(`${JSON.stringify({file, exchange: server.file, changed, findings: audit.findings, reviewed: audit.reviewed})}\n`);
      server.audit = audit;
    }
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  } else throw new Error('usage: app-server.mjs audit <exchange.jsonl> ... --out <file> | reaudit <experiment.json> --codex-home <dir> --cua-home <dir> --home <dir>');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
