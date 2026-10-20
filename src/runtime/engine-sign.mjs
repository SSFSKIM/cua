// Signing `cua Engine.app` (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "Install, signing and
// permissions"; the Decision Log's "M1b's signing route" and "M1b pre-flight" item 2).
//
// The identity is the owner's Apple Development certificate, named by CUA_SIGNING_IDENTITY or by `signingIdentity` in
// ~/.config/cua/engine.json (a SHA-1 or common name from `security find-identity -v -p codesigning`); without one a build
// refuses. Ad hoc (`--sign adhoc`) exists for the hosted CI runner and is never a default. The identity is never printed:
// every refusal's text has it redacted, and what callers report about a signature is its kind and whether it matches
// the configured identity, never the name or the hash.
//
// The login keychain is unlocked only in the GUI login: an SSH session sees it locked (codesign fails
// errSecInternalComponent), and an unlock does not carry across SSH connections. So when this process is not in the
// GUI session (`launchctl managername` is not Aqua), the codesign step runs as a one-shot launchd job bootstrapped into
// gui/<uid>: this file run as `--job <bundle> <result file>`, which resolves the identity from the setting itself, so no
// command line launchd or ps shows carries it (an identity that came from CUA_SIGNING_IDENTITY reaches the job through
// its plist's environment). The wait for the job is bounded; a job that does not finish is booted out and the build fails
// saying a keychain prompt from codesign is waiting on the console: the owner's one-time step is answering it with the
// login password and Always Allow, and the prompt outlives the job (Surprises, 2026-10-19T21:03Z).
import {execFile, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {CuaError, fail} from './errors.mjs';
import {escapeXml} from '../remote/plist.mjs';

export const SIGN_JOB_SCRIPT = fileURLToPath(import.meta.url);
export const SIGN_JOB_TIMEOUT_MS = 45_000;
const CODESIGN = '/usr/bin/codesign';
const LAUNCHCTL = '/bin/launchctl';
const JOB_LABEL_PREFIX = 'io.github.ssfskim.cua.engine.sign';
const POLL_MS = 200;

// ---- settings and the identity ----

export const engineSettingsPath = (env = process.env) => join(env.HOME || homedir(), '.config', 'cua', 'engine.json');

// ~/.config/cua/engine.json as an object ({} when absent); anything else there is a refusal naming the file.
export function readEngineSettings({env = process.env} = {}) {
  const path = engineSettingsPath(env);
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return {};
    fail('engine_settings_invalid', `cannot read ${path}: ${error.code ?? error.message}`);
  }
  let settings;
  try { settings = JSON.parse(text); } catch { settings = undefined; }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    fail('engine_settings_invalid', `${path} is not a JSON object`, {hint: 'fix or remove it'});
  return settings;
}

const IDENTITY_HINT = 'set "signingIdentity" in ~/.config/cua/engine.json to your Apple Development identity\'s SHA-1 or common name, '
  + 'as `security find-identity -v -p codesigning` lists it; on a CI runner, which holds no grants, build with --sign adhoc '
  + '(an ad hoc signature changes with every build, so a Mac\'s grants would not survive a rebuild)';

// -> {identity, source: 'env' | 'settings'}.
export function resolveSigningIdentity({env = process.env} = {}) {
  if (typeof env.CUA_SIGNING_IDENTITY === 'string' && env.CUA_SIGNING_IDENTITY.trim()) return {identity: env.CUA_SIGNING_IDENTITY.trim(), source: 'env'};
  const {signingIdentity} = readEngineSettings({env});
  if (signingIdentity !== undefined && typeof signingIdentity !== 'string')
    fail('engine_settings_invalid', `signingIdentity in ${engineSettingsPath(env)} is not a string`, {hint: IDENTITY_HINT});
  if (signingIdentity?.trim()) return {identity: signingIdentity.trim(), source: 'settings'};
  fail('engine_identity_missing', `no signing identity for cua's engine: neither CUA_SIGNING_IDENTITY nor signingIdentity in ${engineSettingsPath(env)} names one`, {hint: IDENTITY_HINT});
}

// The configured identity, or null when none is configured or the settings cannot be read (for reporting a match).
export function configuredIdentity({env = process.env} = {}) {
  try { return resolveSigningIdentity({env}).identity; } catch (error) {
    if (error instanceof CuaError) return null;
    throw error;
  }
}

// Text with every signing identity in it masked, whichever form is configured: the configured string itself, any run of
// 40 hex digits (a certificate's SHA-1), and any Apple certificate name ("Apple Development: Name (TEAMID)" and the other
// kinds), since codesign names the certificate by its subject even when a SHA-1 selected it (its chain warning's
// "… for signer <name>").
const CERTIFICATE_NAME = /\b(?:Apple|Developer ID|Mac|iPhone|3rd Party)[A-Za-z ]{0,40}: [^\n"]*?\([A-Z0-9]{10}\)/g;
export function redact(text, identity) {
  let out = String(text);
  if (identity) out = out.replace(new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<signing identity>');
  return out.replace(/\b[0-9a-f]{40}\b/gi, '<signing identity>').replace(CERTIFICATE_NAME, '<signing identity>');
}

// ---- reading a signature ----

const defaultRunSync = (file, args) => spawnSync(file, args, {encoding: 'utf8', timeout: 60_000});

// The bundle's signature as codesign reports it: {kind: 'identity', sha1, authority} (the leaf certificate's SHA-1, the
// form `security find-identity` lists, and its subject, codesign's first Authority line), {kind: 'adhoc'}, or null when
// the bundle is unsigned or unreadable.
export function readSignature(bundle, {runSync = defaultRunSync} = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'cua-engine-signature-'));
  try {
    const prefix = join(scratch, 'cert');
    const read = runSync(CODESIGN, ['-d', '-vv', `--extract-certificates=${prefix}`, bundle]);
    if (read.status !== 0) return null;
    const details = `${read.stdout ?? ''}${read.stderr ?? ''}`;
    if (existsSync(`${prefix}0`)) {
      const sha1 = createHash('sha1').update(readFileSync(`${prefix}0`)).digest('hex').toUpperCase();
      return {kind: 'identity', sha1, authority: /^Authority=(.*)$/m.exec(details)?.[1] ?? null};
    }
    return /^Signature=adhoc$/m.test(details) ? {kind: 'adhoc'} : null;
  } finally { rmSync(scratch, {recursive: true, force: true}); }
}

// What pending.json and approved.json record for a signature: the leaf's SHA-1, or "adhoc"; null when unsigned.
export const recordedIdentity = signature => (signature?.kind === 'identity' ? signature.sha1 : signature?.kind === 'adhoc' ? 'adhoc' : null);

// Whether a signature is the configured identity's: a SHA-1 compares with the leaf's, a common name with its subject.
// null when nothing is configured.
export function identityMatches(signature, identity) {
  if (!identity) return null;
  if (signature?.kind !== 'identity') return false;
  return /^[0-9a-f]{40}$/i.test(identity) ? signature.sha1 === identity.toUpperCase() : signature.authority === identity;
}

// ---- signing ----

export const runCommand = (file, args, {timeout = 60_000, cwd, env} = {}) => new Promise(done => {
  execFile(file, args, {encoding: 'utf8', timeout, cwd, env, maxBuffer: 64 * 1024 * 1024}, (error, stdout, stderr) => done({
    code: error ? (Number.isInteger(error.code) ? error.code : -1) : 0,
    stdout: stdout ?? '',
    stderr: stderr || (error && !Number.isInteger(error.code) ? `${error.code ?? ''} ${error.message}`.trim() : ''),
    ...(error && !Number.isInteger(error.code) ? {error: error.code ?? 'error'} : {}),
  }));
});

const codesignArgs = (identity, bundle) => ['--force', '--sign', identity, '--options', 'runtime', '--timestamp=none', bundle];
// The last `count` lines of a command's output, joined with `separator`.
export const lastLines = (text, {count = 5, separator = ' / '} = {}) => String(text ?? '').trim().split('\n').slice(-count).join(separator) || 'no detail';
export const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));

// Signs `bundle` with hardened runtime and no entitlements, then verifies it. `identity`: 'adhoc', an identity string
// (treated as coming from the environment), or undefined for the configured one.
export async function signBundle(bundle, {identity, env = process.env, run = runCommand, uid = process.getuid?.(), node = process.execPath,
  tmp = tmpdir(), timeoutMs = SIGN_JOB_TIMEOUT_MS, sleep = sleepFor, now = Date.now} = {}) {
  if (identity === 'adhoc') {
    const signed = await run(CODESIGN, codesignArgs('-', bundle));
    if (signed.code !== 0) fail('engine_sign_failed', `codesign (ad hoc) failed: ${redact(lastLines(signed.stderr))}`);
  } else {
    const resolved = identity ? {identity, source: 'env'} : resolveSigningIdentity({env});
    const manager = await run(LAUNCHCTL, ['managername']);
    if (manager.code === 0 && manager.stdout.trim() === 'Aqua') {
      const signed = await run(CODESIGN, codesignArgs(resolved.identity, bundle));
      if (signed.code !== 0) fail('engine_sign_failed', `codesign failed: ${redact(lastLines(signed.stderr), resolved.identity)}`, {hint: 'check the identity with `security find-identity -v -p codesigning`'});
    } else {
      await signInGuiSession(bundle, resolved, {env, run, uid, node, tmp, timeoutMs, sleep, now});
    }
  }
  const verified = await run(CODESIGN, ['--verify', '--strict', bundle]);
  if (verified.code !== 0) fail('engine_sign_failed', `the signed bundle does not verify: ${redact(lastLines(verified.stderr), identity)}`);
}

function jobPlist({label, programArguments, environment, log}) {
  const string = text => `<string>${escapeXml(text)}</string>`;
  const env = Object.entries(environment).map(([key, value]) => `\t\t<key>${escapeXml(key)}</key>\n\t\t${string(value)}\n`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t${string(label)}
\t<key>ProgramArguments</key>
\t<array>
${programArguments.map(arg => `\t\t${string(arg)}\n`).join('')}\t</array>
\t<key>EnvironmentVariables</key>
\t<dict>
${env}\t</dict>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>StandardOutPath</key>
\t${string(log)}
\t<key>StandardErrorPath</key>
\t${string(log)}
</dict>
</plist>
`;
}

async function signInGuiSession(bundle, {identity, source}, {env, run, uid, node, tmp, timeoutMs, sleep, now}) {
  const domain = `gui/${uid}`;
  const printed = await run(LAUNCHCTL, ['print', domain]);
  if (printed.code !== 0)
    fail('engine_no_gui_login', `signing cua's engine with your identity needs someone logged in at this Mac's console (launchd has no ${domain} domain), because only the GUI login unlocks the login keychain`,
      {hint: 'log in at the console (Screen Sharing will do), then run cua engine build again'});
  const dir = mkdtempSync(join(tmp, 'cua-engine-sign-'));
  const label = `${JOB_LABEL_PREFIX}.${randomUUID()}`;
  const result = join(dir, 'result.json');
  const plist = join(dir, 'job.plist');
  const environment = {HOME: env.HOME || homedir(), ...(source === 'env' ? {CUA_SIGNING_IDENTITY: identity} : {})};
  writeFileSync(plist, jobPlist({label, programArguments: [node, SIGN_JOB_SCRIPT, '--job', bundle, result], environment, log: join(dir, 'job.log')}), {mode: 0o600});
  let answer;
  try {
    const loaded = await run(LAUNCHCTL, ['bootstrap', domain, plist]);
    if (loaded.code !== 0) fail('engine_sign_failed', `launchctl bootstrap ${domain} failed (exit ${loaded.code}): ${lastLines(loaded.stderr)}`);
    for (const started = now(); !existsSync(result);) {
      // A job that exited without a result died before codesign could answer (its node failed to start, say): its log
      // says why, so that is the refusal, not the keychain prompt's sentence.
      const job = await run(LAUNCHCTL, ['print', `${domain}/${label}`]);
      // (`launchctl print`'s own line for the job, one tab deep; src/remote/launchd.mjs reads the same, but importing it
      // would load the agent's modules into this job.)
      const lastExitCode = job.code === 0 ? /^\tlast exit code = (.*)$/m.exec(job.stdout)?.[1] : undefined;
      if (lastExitCode !== undefined && !/never/i.test(lastExitCode) && !existsSync(result)) {
        let jobLog = '';
        try { jobLog = readFileSync(join(dir, 'job.log'), 'utf8'); } catch {}
        fail('engine_sign_failed', `the signing job in the GUI session exited (${lastExitCode}) without signing: ${redact(lastLines(jobLog), identity)}`);
      }
      if (now() - started >= timeoutMs)
        fail('engine_sign_prompt_waiting', `codesign did not finish within ${Math.round(timeoutMs / 1000)} s in this Mac's GUI session: a keychain prompt from codesign is most likely waiting on the console for the owner`,
          {hint: 'at the console, answer the prompt with the login password and Always Allow (it stays on screen after this build gave up), then run cua engine build again; it signs with no prompt from then on'});
      await sleep(POLL_MS);
    }
    answer = JSON.parse(readFileSync(result, 'utf8'));
  } finally {
    await run(LAUNCHCTL, ['bootout', `${domain}/${label}`]);
    rmSync(dir, {recursive: true, force: true});
  }
  if (answer.code === 'engine_identity_missing' || answer.code === 'engine_settings_invalid')
    fail(answer.code, `the signing job in the GUI session found no usable identity: ${redact(answer.message, identity)}`, {hint: IDENTITY_HINT});
  if (answer.code !== 0) fail('engine_sign_failed', `codesign failed in the GUI session: ${redact(lastLines(answer.stderr), identity)}`, {hint: 'check the identity with `security find-identity -v -p codesigning`'});
}

// The job's side: resolves the identity from its environment and the setting, runs codesign once, and writes
// {code, stderr} (the identity redacted) to `resultPath` by write-then-rename, so the waiting build never reads half.
export function runSignJob({bundle, resultPath, env = process.env, runSync = defaultRunSync}) {
  let answer;
  try {
    const {identity} = resolveSigningIdentity({env});
    const signed = runSync(CODESIGN, codesignArgs(identity, bundle));
    answer = {code: signed.status ?? -1, stderr: redact(`${signed.stderr ?? ''}${signed.error ? ` ${signed.error.message}` : ''}`, identity)};
  } catch (error) {
    answer = error instanceof CuaError ? {code: error.code, message: error.message} : {code: -1, stderr: String(error?.message ?? error)};
  }
  const temporary = `${resultPath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(answer), {mode: 0o600});
  renameSync(temporary, resultPath);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [flag, bundle, resultPath] = process.argv.slice(2);
  if (flag !== '--job' || !bundle || !resultPath) {
    process.stderr.write('usage: engine-sign.mjs --job <bundle> <result file> (run by cua engine build as a launchd job)\n');
    process.exit(2);
  }
  runSignJob({bundle, resultPath});
}
