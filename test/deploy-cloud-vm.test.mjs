// deploy/cloud-vm/render.sh: the user data it prints is cloud-init.yaml with the parameters and cua-provision.sh filled
// in, its inputs are refused unless plain, and it fits a provider's user-data limit. The VM side (cua-provision.sh) is
// proven live (docs/evidence/2026-10-07-cloud-vm-provisioning.md); here its shell syntax is checked, and its install
// steps (#171 M6a, the pre-flight's §4.4: cua's own runtime first, the vendor's deb only when asked for) run with stub
// `cua` and `curl`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {CUA_EXTENSION_ID} from '../src/chrome/extension.mjs';
import {DEFAULT_BASE_URL} from '../scripts/extension-pack.mjs';
import {A11Y_ENABLE_COMMAND} from '../src/runtime/linux-desktop.mjs';

const dir = fileURLToPath(new URL('../deploy/cloud-vm/', import.meta.url));
const render = (...args) => spawnSync('bash', [`${dir}render.sh`, ...args], {encoding: 'utf8'});
const contentOf = (text, path) => {
  const match = text.match(new RegExp(`- path: ${path}\\n(?: {4}.*\\n)*? {4}content: (\\S+)`));
  assert.ok(match, `no ${path} in the user data`);
  return Buffer.from(match[1], 'base64');
};

test('render.sh fills the conf and embeds cua-provision.sh (gzipped) byte for byte, without the template comments', () => {
  const run = render('--user', 'agent', '--ref', 'feat/x-1', '--relay', 'wss://1-2-3-4.sslip.io/ws');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^#cloud-config\n/);
  assert.doesNotMatch(run.stdout, /^ *# /m);
  assert.doesNotMatch(run.stdout, /@[A-Z_]+@/);
  assert.equal(contentOf(run.stdout, '/etc/cua-provision.conf').toString(),
    "CUA_USER='agent'\nCUA_REF='feat/x-1'\nCUA_REPO='https://github.com/SSFSKIM/cua'\nCUA_DEB='none'\nCUA_RELAY='wss://1-2-3-4.sslip.io/ws'\n" +
    `CUA_EXTENSION='hosted'\nCUA_EXTENSION_URL='${DEFAULT_BASE_URL}update.xml'\n`);
  assert.match(run.stdout, /- path: \/usr\/local\/sbin\/cua-provision\.sh\n {4}encoding: gz\+b64\n/);
  assert.deepEqual(gunzipSync(contentOf(run.stdout, '/usr/local/sbin/cua-provision.sh')), readFileSync(`${dir}cua-provision.sh`));
  assert.match(run.stdout, /runcmd:\n {2}- \[\/usr\/local\/sbin\/cua-provision\.sh\]\n/);
  // AWS EC2 takes at most 16 KiB of user data (Hetzner Cloud 32 KiB).
  assert.ok(Buffer.byteLength(run.stdout) < 16 * 1024, `${Buffer.byteLength(run.stdout)} bytes`);
});

test('render.sh: defaults, a mirror URL, and a local deb meaning the operator uploads it', () => {
  const conf = run => contentOf(run.stdout, '/etc/cua-provision.conf').toString();
  const plain = render();
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(conf(plain), /^CUA_USER='cua'\nCUA_REF='main'\nCUA_REPO='https:\/\/github\.com\/SSFSKIM\/cua'\nCUA_DEB='none'\nCUA_RELAY=''\nCUA_EXTENSION='hosted'\nCUA_EXTENSION_URL='https:\/\/178-104-102-73\.sslip\.io\/ext\/update\.xml'\n$/);
  assert.match(conf(render('--deb', 'https://mirror.example/chatgpt_26.928.40906_amd64.deb')), /CUA_DEB='https:\/\/mirror\.example\/chatgpt_26\.928\.40906_amd64\.deb'/);
  assert.match(conf(render('--deb', `${dir}cloud-init.yaml`)), /CUA_DEB='upload'/);
  assert.match(conf(render('--deb', 'pin')), /CUA_DEB='pin'/);
  assert.match(conf(render('--deb', 'none')), /CUA_DEB='none'/);
});

// The install steps of cua-provision.sh, sourced (it returns before its first step) and run with stubs: `cua` records
// its arguments and answers `install --json` as told, `curl` fails as an unreachable server does, and as_user, log,
// checklist and doctor stand in for the root-only ones; the script's own stops run, and their exit status is the
// provisioning's. Chrome's profile, its extension and its host's socket are there, so the waits end at once.
// `checkout` is an M6a checkout (its runtime/linux-runtime.json there) unless `older`; `upload` is a deb the operator
// copied, whose SHA-256 the pin then names.
function provision(t, {deb, install = {ok: true, vendor: {failed: {code: 'download_failed'}}}, installExit = 0, status = 0, older = false, upload}) {
  const scratch = mkdtempSync(join(tmpdir(), 'cua-provision-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const bin = join(scratch, 'bin'), home = join(scratch, 'home'), cache = join(scratch, 'cache'), state = join(scratch, 'state'), log = join(scratch, 'calls.log');
  const checkout = join(scratch, 'checkout');
  mkdirSync(state);
  mkdirSync(bin);
  mkdirSync(cache);
  mkdirSync(join(checkout, 'runtime'), {recursive: true});
  if (!older) writeFileSync(join(checkout, 'runtime', 'linux-runtime.json'), '{}');
  if (upload !== undefined) writeFileSync(join(cache, 'upload.deb'), upload);
  const pinSha = upload === undefined ? '0'.repeat(64) : createHash('sha256').update(upload).digest('hex');
  mkdirSync(join(home, '.config', 'google-chrome', 'Default', 'Extensions', CUA_EXTENSION_ID), {recursive: true});
  mkdirSync(join(home, '.local', 'share', 'cua', 'chrome', 'b'), {recursive: true});
  writeFileSync(join(home, '.local', 'share', 'cua', 'chrome', 'b', 'h.sock'), '');
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/usr/bin/env bash\nprintf '${name} %s\\n' "$*" >>'${log}'\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  stub('cua', 'if [[ "$1" == install ]]; then printf \'%s\\n\' "$CUA_INSTALL_JSON"; exit "$CUA_INSTALL_EXIT"; fi; exit 0');
  stub('curl', 'echo "curl: (6) Could not resolve host" >&2; exit 6');
  const script = `source '${dir}cua-provision.sh'
cache='${cache}' home='${home}' state='${state}' checkout='${checkout}' CUA_DEB='${deb}' CUA_DEB_WAIT=5
as_user() { HOME='${home}' "$@"; }
log() { printf 'log %s\\n' "$*" >>'${log}'; }
checklist() { printf 'stop %s\\n' "$1" >>'${log}'; printf '%s\\n' "$1" >'${state}/checklist.txt'; }
doctor() { :; }
pin_of_host() { echo '26.928.40906-linux-x64 https://example.invalid/chatgpt_26.928.40906_amd64.deb ${pinSha}'; }
provision_cua
echo done >>'${log}'`;
  const run = spawnSync('bash', ['-c', script], {encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, CUA_INSTALL_JSON: JSON.stringify(install), CUA_INSTALL_EXIT: String(installExit)}});
  assert.equal(run.status, status, run.stdout + run.stderr);
  return {calls: readFileSync(log, 'utf8').split('\n').filter(line => /^(cua|curl|stop|done)\b/.test(line)), stdout: run.stdout, cache};
}
const REGISTERED = ['cua install --json', 'cua chrome register', 'cua profiles add me --chrome-profile Default', 'cua profiles bind me'];
const noJq = spawnSync('jq', ['--version']).error ? 'jq is not installed here' : false;

test('cua-provision.sh with CUA_DEB=none installs and registers cua\'s own runtime and fetches nothing', {skip: noJq}, t => {
  const {calls, stdout} = provision(t, {deb: 'none'});
  assert.deepEqual(calls, [...REGISTERED, 'done']);
  assert.match(stdout, /^\{"ok":true,"release":null,"changed":null,"sessions":null\}$/m, 'cua install\'s summary line');
});

test('cua-provision.sh with CUA_DEB=pin and no reachable deb: the own runtime first, as under none, then the fetch, then the stop', {skip: noJq}, t => {
  const {calls, cache} = provision(t, {deb: 'pin'});
  assert.deepEqual(calls.slice(0, REGISTERED.length), REGISTERED);
  assert.deepEqual(calls.slice(REGISTERED.length), [
    `curl -fL --retry 3 --silent --show-error -o ${cache}/chatgpt_26.928.40906_amd64.deb.part https://example.invalid/chatgpt_26.928.40906_amd64.deb`,
    'stop could not download https://example.invalid/chatgpt_26.928.40906_amd64.deb: cua\'s own runtime is installed and registered; copy the pinned deb to the VM\'s '
      + `${cache}/upload.deb and set CUA_DEB=upload, or run cua-provision.sh again`]);
});

test('cua-provision.sh: a vendor tree cua install already placed is not fetched again for `pin`; an explicit mirror is still fetched and checked', {skip: noJq}, t => {
  const vendor = {ok: true, vendor: {release: '26.928.40906-linux-x64', changed: true}};
  const placed = provision(t, {deb: 'pin', install: vendor});
  assert.deepEqual(placed.calls, [...REGISTERED, 'done']);
  const mirror = provision(t, {deb: 'https://mirror.example/chatgpt_26.928.40906_amd64.deb', install: vendor});
  assert.deepEqual(mirror.calls.slice(REGISTERED.length).map(line => line.split(' ')[0]), ['curl', 'stop'], 'the operator\'s source, then its check');
  assert.match(mirror.calls.at(-2), / https:\/\/mirror\.example\/chatgpt_26\.928\.40906_amd64\.deb$/);
});

// A checkout older than M6a (no runtime/linux-runtime.json) installs from the vendor's deb, so a supplied deb is had
// first and its failure fails the provisioning, as that checkout's own provisioner did; under none its plain install
// fetches the pin's URL itself (task 156).
test('cua-provision.sh for a checkout older than M6a: a supplied deb first, then its install, then the registration; none installs plainly', {skip: noJq}, t => {
  const uploaded = provision(t, {deb: 'upload', older: true, upload: 'the deb'});
  assert.deepEqual(uploaded.calls, [`cua install --archive ${uploaded.cache}/chatgpt_26.928.40906_amd64.deb --json`, ...REGISTERED.slice(1), 'done']);
  const unreachable = provision(t, {deb: 'pin', older: true, status: 1});
  assert.deepEqual(unreachable.calls, [
    `curl -fL --retry 3 --silent --show-error -o ${unreachable.cache}/chatgpt_26.928.40906_amd64.deb.part https://example.invalid/chatgpt_26.928.40906_amd64.deb`,
    `stop could not download https://example.invalid/chatgpt_26.928.40906_amd64.deb: copy the pinned deb to the VM's ${unreachable.cache}/upload.deb and set CUA_DEB=upload, or run cua-provision.sh again`]);
  const failed = provision(t, {deb: 'upload', older: true, upload: 'the deb', installExit: 1, status: 1, install: {ok: false, error: {code: 'archive_hash_mismatch', message: 'no'}}});
  assert.deepEqual(failed.calls.slice(1), [`stop cua install --archive ${failed.cache}/chatgpt_26.928.40906_amd64.deb failed (exit 1): no; then run cua-provision.sh again`]);
  assert.deepEqual(provision(t, {deb: 'none', older: true}).calls, [...REGISTERED, 'done']);
});

// The same deb for an M6a checkout comes after its own runtime is installed and registered.
test('cua-provision.sh for an M6a checkout: an uploaded deb comes after the own runtime and its registration', {skip: noJq}, t => {
  const {calls, cache} = provision(t, {deb: 'upload', upload: 'the deb'});
  assert.deepEqual(calls, [...REGISTERED, `cua install --archive ${cache}/chatgpt_26.928.40906_amd64.deb --json`, 'done']);
});

// Fix wave 1: a failed install of cua's own runtime is a failed provisioning (cloud-init reports it), with the install's
// error and its remedy in the checklist; nothing is registered on a device that has no runtime.
test('cua-provision.sh: a failed install of cua\'s own runtime stops before registering and exits nonzero, keeping the error and its remedy', {skip: noJq}, t => {
  const failed = provision(t, {deb: 'none', installExit: 1, status: 1,
    install: {ok: false, error: {code: 'download_failed', message: 'cua\'s module tree was not installed: could not fetch', hint: 'run `node /opt/cua/bin/cua.mjs install` again'}}});
  assert.deepEqual(failed.calls, ['cua install --json',
    'stop cua install failed (exit 1): cua\'s module tree was not installed: could not fetch; run `node /opt/cua/bin/cua.mjs install` again; then run cua-provision.sh again']);
});

test('render.sh: the cua extension from the Store or a self-hosted update URL; the repository from a URL or an uploaded bundle', () => {
  const conf = (...args) => { const run = render(...args); assert.equal(run.status, 0, run.stderr); return contentOf(run.stdout, '/etc/cua-provision.conf').toString(); };
  assert.match(conf('--extension', 'store'), /CUA_EXTENSION='store'\n/);
  assert.match(conf('--extension-url', 'https://other.example/ext/update.xml'), /CUA_EXTENSION='hosted'\nCUA_EXTENSION_URL='https:\/\/other\.example\/ext\/update\.xml'\n/);
  assert.match(conf('--repo', 'https://git.example/me/cua.git'), /CUA_REPO='https:\/\/git\.example\/me\/cua\.git'\n/);
  // A local file is a git bundle the operator copies to the VM (create-hetzner.sh --repo does); the VM waits for it.
  assert.match(conf('--repo', `${dir}cloud-init.yaml`), /CUA_REPO='upload'\n/);
});

test('cua-provision.sh force-installs cua\'s own extension: its id is CUA_EXTENSION_ID', () => {
  const script = readFileSync(`${dir}cua-provision.sh`, 'utf8');
  assert.equal(script.match(/^EXTENSION_ID=([a-p]{32})\b/m)?.[1], CUA_EXTENSION_ID);
  assert.doesNotMatch(script, /hehggadaopoacecdllhhajmbjkdcmajg|cua login|codex\.login|Sign in to ChatGPT/);
});

// #171 M3: a provisioned VM's desktop is the agent's, and its session has AT-SPI's IsEnabled on before any application
// starts, which Qt 6 needs to put its tree on the bus (doctor's accessibility.enabled row names the same command).
test('cua-provision.sh turns org.a11y.Status IsEnabled on at the session\'s start, after the bus and before Chrome', () => {
  const script = readFileSync(`${dir}cua-provision.sh`, 'utf8');
  const autostart = script.match(/IFS= read -r -d '' autostart <<'CONF' \|\| true\n([\s\S]*?)\nCONF\n/)?.[1];
  assert.ok(autostart, 'the session\'s autostart');
  const lines = autostart.split('\n');
  const at = prefix => lines.findIndex(line => line.startsWith(prefix));
  assert.ok(at(`${A11Y_ENABLE_COMMAND} `) > at('/usr/libexec/at-spi-bus-launcher --launch-immediately'), autostart);
  assert.ok(at(`${A11Y_ENABLE_COMMAND} `) < at('google-chrome '), autostart);
});

test('cua-provision.sh sets "desktop": "dedicated" in the user\'s engine.json, beside its other keys, keeping a mode already set', t => {
  const script = readFileSync(`${dir}cua-provision.sh`, 'utf8');
  const filter = script.match(/^desktop_filter='([^']*)'$/m)?.[1];
  assert.ok(filter, 'the filter the script applies to engine.json');
  assert.match(script, /^settings="\$home\/\.config\/cua\/engine\.json"$/m);
  if (spawnSync('jq', ['--version']).error) return t.skip('jq is not installed here');
  const apply = input => {
    const run = spawnSync('jq', ['-c', filter], {input, encoding: 'utf8'});
    return run.status === 0 ? JSON.parse(run.stdout) : {refused: run.status};
  };
  assert.deepEqual(apply('{}'), {desktop: 'dedicated'});
  assert.deepEqual(apply('{"engine": "cua", "signingIdentity": "x"}'), {engine: 'cua', signingIdentity: 'x', desktop: 'dedicated'});
  assert.deepEqual(apply('{"desktop": "shared"}'), {desktop: 'shared'}, 'the owner\'s mode stays');
  assert.deepEqual(apply('{"desktop": null}'), {desktop: 'dedicated'});
  assert.equal(typeof apply('[1]').refused, 'number', 'anything but an object is refused');
  assert.equal(typeof apply('{').refused, 'number');
});

test('render.sh refuses anything that is not plain (it lands in a shell-sourced file)', () => {
  for (const args of [
    ['--user', 'root'], ['--user', "a'b"], ['--ref', 'main; rm -rf /'], ['--ref', "x'y"], ['--ref', '-x'], ['--ref', '--upload-pack=x'],
    ['--relay', 'ws://relay.example/ws'], ['--relay', "wss://r.example/ws'"], ['--deb', 'http://mirror.example/x.deb'],
    ['--deb', "https://m.example/a'b.deb"], ['--deb', '/nonexistent/chatgpt.deb'], ['--user'], ['--colour', 'x'],
    ['--extension', 'vendor'], ['--extension-url', 'http://plain.example/update.xml'], ['--extension-url', "https://q.example/a'b.xml"],
    ['--repo', 'git@github.com:SSFSKIM/cua'], ['--repo', '/nonexistent/cua.bundle'], ['--repo', "https://g.example/a'b"],
  ]) {
    const run = render(...args);
    assert.equal(run.status, 2, `${args.join(' ')}: ${run.stdout}`);
    assert.equal(run.stdout, '');
  }
});

test('the deploy scripts parse', () => {
  for (const script of ['cua-provision.sh', 'render.sh', 'create-hetzner.sh']) {
    const run = spawnSync('bash', ['-n', `${dir}${script}`], {encoding: 'utf8'});
    assert.equal(run.status, 0, `${script}: ${run.stderr}`);
  }
});

test('create-hetzner.sh copies an upload whose local path has a space to the name the VM watches', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'cua hetzner '));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const bin = join(scratch, 'bin'), remote = join(scratch, 'remote'), log = join(scratch, 'calls.log');
  mkdirSync(bin); mkdirSync(remote);
  // A git bundle holding the ref, at a path with a space.
  const repo = join(scratch, 'repo');
  const git = (...args) => { const run = spawnSync('git', args, {cwd: repo, encoding: 'utf8'}); assert.equal(run.status, 0, run.stderr); };
  mkdirSync(repo);
  git('init', '-q', '-b', 'my-branch'); git('-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-q', '--allow-empty', '-m', 'x');
  const bundle = join(scratch, 'my bundle.bundle');
  git('bundle', 'create', '-q', bundle, 'my-branch');
  // Stand-ins: hcloud knows no server of that name and creates it; ssh succeeds; scp copies into remote/.
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/usr/bin/env bash\nprintf '${name} %s\\n' "$*" >>'${log}'\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  stub('hcloud', 'case "$*" in *"server describe"*-o*) echo 1;; *"server describe"*) exit 1;; *"server ip"*) echo 203.0.113.9;; esac; exit 0');
  stub('ssh', 'exit 0');
  stub('ssh-keygen', 'exit 0');
  stub('scp', `cp "\${@: -2:1}" '${remote}/'"$(basename "\${@: -1}")"`);
  const run = spawnSync('bash', [`${dir}create-hetzner.sh`, '--name', 'cua-test', '--ref', 'my-branch', '--repo', bundle],
    {encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, HCLOUD_CONTEXT: 'cua'}});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(readFileSync(join(remote, 'cua.bundle.part')), readFileSync(bundle));
  const calls = readFileSync(log, 'utf8');
  assert.match(calls, /mv \/var\/cache\/cua\/cua\.bundle\.part \/var\/cache\/cua\/cua\.bundle/);
  assert.doesNotMatch(calls, /\.failed/);
});
