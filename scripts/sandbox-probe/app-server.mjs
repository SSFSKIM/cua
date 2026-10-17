// The native helper's app-server exchange (#115 M0): the audit of what cli-slot.mjs recorded between the helper and the
// signed CLI's `app-server --listen stdio://`, and the replay's answers built from that audit (the stub M2's compat
// app-server becomes). Only the audited form is ever printed or committed.
//
// A recorded exchange is cli-slot.mjs's JSONL: {t, dir: 'in' (helper -> app-server) | 'out' (app-server -> helper),
// line}. The audit pairs each request with its answer by id, keeps the server's notifications, renders every path the
// environment explains as a placeholder (${CODEX_HOME}, ${CUA_HOME}, ${HOME}; the longest value first), and withholds,
// as "<withheld>" with a finding naming the field (never its value):
//   - a non-empty value under a credential- or account-shaped key, except a setting's flag, number or enum word (a
//     lowercase identifier such as "file" or "chatgpt") under a key that does not name an identifier or a secret
//     itself (allow_login_shell, cli_auth_credentials_store); those are kept and listed as `reviewed`;
//   - a token-shaped string (a JWT, or a long unbroken base64/hex run);
//   - a user path (under /Users or /home) the environment does not render.

const SENSITIVE_KEY = /token|secret|password|passwd|credential|cookie|api[_-]?key|auth|account|email|bearer|session[_-]?id|user[_-]?id|login|workspace[_-]?id|org(anization)?[_-]?id/i;
// Keys whose value is itself an identifier or a secret: never kept, whatever the value looks like.
const IDENTIFIER_KEY = /(^|_)(id|ids|email|token|tokens|secret|password|key|cookie|credentials?)$/i;
const ENUM_WORD = /^[a-z][a-z0-9_-]{0,31}$/;
const JWT = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/;
const OPAQUE = /^[A-Za-z0-9+/=_-]{32,}$/;
const USER_PATH = /(^|[^A-Za-z0-9])\/(Users|home)\/[^/\s]+/;
const PLACEHOLDER_NAMES = ['CODEX_HOME', 'CUA_HOME', 'HOME'];
export const WITHHELD = '<withheld>';

const empty = value => value === null || value === false || value === '' || (Array.isArray(value) && value.length === 0)
  || (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

const keptSetting = (key, value) => !IDENTIFIER_KEY.test(key)
  && (typeof value === 'boolean' || typeof value === 'number' || (typeof value === 'string' && ENUM_WORD.test(value)));

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
      if (SENSITIVE_KEY.test(key) && !empty(item)) {
        if (keptSetting(key, item)) { reviewed.push({path: at, kept: typeof item}); return [key, item]; }
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
async function main() {
  const {parseArgs} = await import('node:util');
  const {readFileSync, writeFileSync} = await import('node:fs');
  const {values, positionals} = parseArgs({allowPositionals: true, options: {'codex-home': {type: 'string'}, 'cua-home': {type: 'string'}, home: {type: 'string'}, out: {type: 'string'}}});
  const [command, file] = positionals;
  if (command !== 'audit' || !file || !values.out) throw new Error('usage: app-server.mjs audit <exchange.jsonl> --codex-home <dir> --cua-home <dir> --home <dir> --out <file>');
  const records = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(record => record.dir);
  const audit = auditExchange(records, {env: {CODEX_HOME: values['codex-home'], CUA_HOME: values['cua-home'], HOME: values.home}});
  writeFileSync(values.out, `${JSON.stringify(audit, null, 2)}\n`);
  process.stderr.write(`audited ${records.length} lines: ${audit.requests.length} requests, ${audit.findings.length} withheld, ${audit.reviewed.length} reviewed\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
