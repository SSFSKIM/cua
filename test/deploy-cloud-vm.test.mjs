// deploy/cloud-vm: the user data render.sh prints is cloud-init.yaml with the parameters and cua-provision.sh filled
// in, its inputs are refused unless plain, and it fits a provider's user-data limit. The VM side (cua-provision.sh) is
// proven live (docs/evidence/2026-10-07-cloud-vm-provisioning.md). Here its shell syntax is checked, its install steps
// run with stubs, and the whole of it, the two generations of it already deployed (frozen under
// test/fixtures/cloud-vm/) and update.sh run on a fake VM (test/fixtures/cloud-vm/vm.mjs): #171 M6b's pre-flight, §3.6.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {CUA_EXTENSION_ID} from '../src/chrome/extension.mjs';
import {DEFAULT_BASE_URL} from '../scripts/extension-pack.mjs';
import {A11Y_ENABLE_COMMAND} from '../src/runtime/linux-desktop.mjs';
import {VENDOR_ENGINE_RETIRED_IN} from '../src/runtime/launch.mjs';
import {INSTALL_JSON, bundleOf, git, makeVm, newProvisioner, repos, truncateBundle} from './fixtures/cloud-vm/vm.mjs';
import {contained, remap} from './fixtures/cloud-vm/remap.mjs';

const dir = fileURLToPath(new URL('../deploy/cloud-vm/', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/cloud-vm/', import.meta.url));
const render = (...args) => spawnSync('bash', [`${dir}render.sh`, ...args], {encoding: 'utf8'});
const contentOf = (text, path) => {
  const match = text.match(new RegExp(`- path: ${path}\\n(?: {4}.*\\n)*? {4}content: (\\S+)`));
  assert.ok(match, `no ${path} in the user data`);
  return Buffer.from(match[1], 'base64');
};
const noJq = spawnSync('jq', ['--version']).error ? 'jq is not installed here' : false;

test('render.sh fills the conf and embeds cua-provision.sh (gzipped) byte for byte, without the template comments', () => {
  const run = render('--user', 'agent', '--ref', 'feat/x-1', '--relay', 'wss://1-2-3-4.sslip.io/ws');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^#cloud-config\n/);
  assert.doesNotMatch(run.stdout, /^ *# /m);
  assert.doesNotMatch(run.stdout, /@[A-Z_]+@/);
  assert.equal(contentOf(run.stdout, '/etc/cua-provision.conf').toString(),
    "CUA_USER='agent'\nCUA_REF='feat/x-1'\nCUA_REPO='https://github.com/SSFSKIM/cua'\nCUA_RELAY='wss://1-2-3-4.sslip.io/ws'\n" +
    `CUA_EXTENSION='hosted'\nCUA_EXTENSION_URL='${DEFAULT_BASE_URL}update.xml'\n`);
  assert.match(run.stdout, /- path: \/usr\/local\/sbin\/cua-provision\.sh\n {4}encoding: gz\+b64\n/);
  assert.deepEqual(gunzipSync(contentOf(run.stdout, '/usr/local/sbin/cua-provision.sh')), readFileSync(`${dir}cua-provision.sh`));
  assert.match(run.stdout, /runcmd:\n {2}- \[\/usr\/local\/sbin\/cua-provision\.sh\]\n/);
  // AWS EC2 takes at most 16 KiB of user data (Hetzner Cloud 32 KiB).
  assert.ok(Buffer.byteLength(run.stdout) < 16 * 1024, `${Buffer.byteLength(run.stdout)} bytes`);
});

test('render.sh: the defaults', () => {
  const plain = render();
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(contentOf(plain.stdout, '/etc/cua-provision.conf').toString(),
    /^CUA_USER='cua'\nCUA_REF='main'\nCUA_REPO='https:\/\/github\.com\/SSFSKIM\/cua'\nCUA_RELAY=''\nCUA_EXTENSION='hosted'\nCUA_EXTENSION_URL='https:\/\/178-104-102-73\.sslip\.io\/ext\/update\.xml'\n$/);
});

// #171 M6b (F9): the template provisions cua 0.30.0 or later, which installs no ChatGPT package, so --deb is gone. Given,
// it is refused with one sentence, before anything is rendered or created.
test('render.sh and create-hetzner.sh refuse --deb, whatever its value, with one sentence', () => {
  for (const value of ['none', 'pin', 'https://mirror.example/chatgpt_26.928.40906_amd64.deb', `${dir}cloud-init.yaml`]) {
    for (const script of ['render.sh', 'create-hetzner.sh']) {
      const run = spawnSync('bash', [`${dir}${script}`, '--deb', value], {encoding: 'utf8'});
      assert.equal(run.status, 2, `${script} --deb ${value}: ${run.stdout}${run.stderr}`);
      assert.equal(run.stdout, '');
      assert.equal(run.stderr, `${script} takes no --deb: the VM's cua (${VENDOR_ENGINE_RETIRED_IN} or later) installs its own runtime and no ChatGPT package\n`);
    }
  }
});

// The install steps of cua-provision.sh, sourced (it returns before its first step) and run with stubs: `cua` records
// its arguments and answers `install --json` as told, and as_user, log, checklist and doctor stand in for the root-only
// ones; the script's own stop runs, and its exit status is the provisioning's. Chrome's profile, its extension and its
// host's socket are there, so the waits end at once.
function provision(t, {install = INSTALL_JSON, installExit = 0, status = 0}) {
  const scratch = mkdtempSync(join(tmpdir(), 'cua-provision-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const bin = join(scratch, 'bin'), home = join(scratch, 'home'), state = join(scratch, 'state'), log = join(scratch, 'calls.log');
  mkdirSync(state);
  mkdirSync(bin);
  mkdirSync(join(home, '.config', 'google-chrome', 'Default', 'Extensions', CUA_EXTENSION_ID), {recursive: true});
  mkdirSync(join(home, '.local', 'share', 'cua', 'chrome', 'b'), {recursive: true});
  writeFileSync(join(home, '.local', 'share', 'cua', 'chrome', 'b', 'h.sock'), '');
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/usr/bin/env bash\nprintf '${name} %s\\n' "$*" >>'${log}'\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  stub('cua', 'if [[ "$1" == install ]]; then printf \'%s\\n\' "$CUA_INSTALL_JSON"; exit "$CUA_INSTALL_EXIT"; fi; exit 0');
  stub('curl', 'echo "curl: (6) Could not resolve host" >&2; exit 6');
  const script = `source '${dir}cua-provision.sh'
home='${home}' state='${state}'
as_user() { HOME='${home}' "$@"; }
log() { printf 'log %s\\n' "$*" >>'${log}'; }
checklist() { printf 'stop %s\\n' "$1" >>'${log}'; printf '%s\\n' "$1" >'${state}/checklist.txt'; }
doctor() { :; }
provision_cua
echo done >>'${log}'`;
  const run = spawnSync('bash', ['-c', script], {encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, CUA_INSTALL_JSON: JSON.stringify(install), CUA_INSTALL_EXIT: String(installExit)}});
  assert.equal(run.status, status, run.stdout + run.stderr);
  return {calls: readFileSync(log, 'utf8').split('\n').filter(line => /^(cua|curl|stop|done)\b/.test(line)), stdout: run.stdout};
}
const REGISTERED = ['cua install --json', 'cua chrome register', 'cua profiles add me --chrome-profile Default', 'cua profiles bind me'];

test('cua-provision.sh installs and registers cua\'s own runtime and fetches nothing', {skip: noJq}, t => {
  const {calls, stdout} = provision(t, {});
  assert.deepEqual(calls, [...REGISTERED, 'done']);
  assert.match(stdout, /^\{"ok":true,"release":"cua-linux-x64-[^"]+","changed":false,"sessions":\{"browser":true,"computer":true\}\}$/m, 'cua install\'s summary line');
});

// Fix wave 1 (M6a): a failed install of cua's own runtime is a failed provisioning (cloud-init reports it), with the
// install's error and its remedy in the checklist; nothing is registered on a device that has no runtime.
test('cua-provision.sh: a failed install of cua\'s own runtime stops before registering and exits nonzero, keeping the error and its remedy', {skip: noJq}, t => {
  const failed = provision(t, {installExit: 1, status: 1,
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
    ['--relay', 'ws://relay.example/ws'], ['--relay', "wss://r.example/ws'"], ['--user'], ['--colour', 'x'],
    ['--extension', 'vendor'], ['--extension-url', 'http://plain.example/update.xml'], ['--extension-url', "https://q.example/a'b.xml"],
    ['--repo', 'git@github.com:SSFSKIM/cua'], ['--repo', '/nonexistent/cua.bundle'], ['--repo', "https://g.example/a'b"],
  ]) {
    const run = render(...args);
    assert.equal(run.status, 2, `${args.join(' ')}: ${run.stdout}`);
    assert.equal(run.stdout, '');
  }
});

test('the deploy scripts parse', () => {
  for (const script of ['cua-provision.sh', 'render.sh', 'create-hetzner.sh', 'update.sh']) {
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
  const gitHere = (...args) => { const run = spawnSync('git', args, {cwd: repo, encoding: 'utf8'}); assert.equal(run.status, 0, run.stderr); };
  mkdirSync(repo);
  gitHere('init', '-q', '-b', 'my-branch'); gitHere('-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-q', '--allow-empty', '-m', 'x');
  const bundle = join(scratch, 'my bundle.bundle');
  gitHere('bundle', 'create', '-q', bundle, 'my-branch');
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
  assert.doesNotMatch(calls, /\.failed|upload\.deb/);
});

// ---- The whole provisioner on a fake VM (test/fixtures/cloud-vm/vm.mjs) ----

// The fake VM runs scripts as the test's user, on a host that may itself be a VM this template made (its /opt/cua the
// user's own). So its remap is fail-closed: a VM path is moved under the scratch root, a few host paths that are only
// executed or named are left, a path inside the run's own scratch stays, and anything else refuses the text before any
// of it runs. These run on strings alone and touch nothing.
test('the fake VM\'s remap places every VM path, leaves only what is safe, and refuses any other absolute path', () => {
  const root = '/scratch/vm/root', scratch = '/scratch/vm';
  const placed = text => remap(text, root, scratch);
  assert.equal(placed('cd /opt/cua; ls'), `cd ${root}/opt/cua; ls`);
  assert.equal(placed('gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg'), `gpg --dearmor -o ${root}/usr/share/keyrings/google-chrome.gpg`);
  assert.equal(placed('x=/etc\ny=/etc/'), `x=${root}/etc\ny=${root}/etc/`);
  assert.equal(placed('PATH=/usr/local/bin:/usr/bin:/bin env'), `PATH=${root}/usr/local/bin:/usr/bin:/bin env`);
  assert.equal(placed('[[ -S /run/user/$uid/bus ]] && ls /dev/dri/card*'), `[[ -S ${root}/run/user/$uid/bus ]] && ls ${root}/dev/dri/card*`);
  for (const text of ['curl -fsSL https://dl.google.com/linux/linux_signing_key.pub', 'jq \'.desktop //= "dedicated"\'', '$((CUA_DEB_WAIT / 5))',
    '#!/usr/bin/env bash', 'cmd >/dev/null 2>&1', `git -C ${scratch}/origin.git log`, 'cp "$home/.config/x" ~/y'])
    assert.equal(placed(text), text);
  for (const text of ['rm -rf /srv/data', 'cat /home/someone/.ssh/id_ed25519', 'echo x >/tmp/y', 'cp a /usr/lib/x', 'ls /scratch/vmx/root',
    'touch /scratch/vm/../escape', 'cat /proc/1/environ;'])
    assert.throws(() => placed(text), /the fake VM would not place/, text);
  // `//` is left only as a URL's authority (a scheme before it) or as jq's operator; a path with a `..` segment is
  // refused whatever it would normalize to, since the original spelling is what the shell resolves under the root
  for (const text of ['cat //opt/cua/x', 'ls //etc', 'x=//usr/local/bin', '/etc/../../../../opt/cua', 'cp a /var/cache/cua/../../../../../opt/cua/x',
    'ls /opt/cua/..', 'ls /usr/share/../../home'])
    assert.throws(() => placed(text), /the fake VM would not place/, text);
  for (const text of ['git clone git+ssh://host.example/r', 'curl file://localhost/etc', 'jq \'.a // empty\''])
    assert.equal(placed(text), text);
  assert.equal(contained(`${root}/var/cache/cua/cua.bundle.update`, root), `${root}/var/cache/cua/cua.bundle.update`);
  for (const path of [`${root}/../escape`, `${root}/var/cache/../../../escape`, root, '/etc/passwd'])
    assert.throws(() => contained(path, root), /outside the fake VM/, path);
});

// The ssh and scp stubs check before they act: a command naming a path the fake VM will not place runs none of itself,
// and a copy lands inside the root or nowhere. Each refusal here would be harmless anyway (a read, a copy into /tmp or
// the scratch), so the test touches nothing of the host's.
test('the fake VM\'s ssh runs nothing of a command it cannot place, and its scp copies nothing outside the root', {skip: noJq}, async t => {
  const vm = await makeVm(t);
  const ran = join(vm.scratch, 'ran');
  const ssh = spawnSync(join(vm.bin, 'ssh'), ['root@vm', `touch ${ran}; cat /srv/secret`], {env: vm.env, encoding: 'utf8'});
  assert.equal(ssh.status, 97, ssh.stderr);
  assert.match(ssh.stderr, /fake VM: refused: the fake VM would not place \/srv\/secret/);
  assert.ok(!existsSync(ran), 'nothing of the command ran');
  const payload = join(vm.scratch, 'payload');
  writeFileSync(payload, 'x');
  for (const dest of ['/tmp/payload', '/var/cache/cua/../../../payload-escaped', `${vm.scratch}/payload-copy`]) {
    const scp = spawnSync(join(vm.bin, 'scp'), [payload, `root@vm:${dest}`], {env: vm.env, encoding: 'utf8'});
    assert.equal(scp.status, 97, `${dest}: ${scp.stderr}`);
  }
  assert.ok(!existsSync(join(vm.scratch, 'payload-copy')) && !existsSync(join(vm.root, 'var/payload-escaped')));
});

// A destination is judged on disk, not by its spelling: a link inside the root that leads out of it (here to a
// directory of the run's scratch, never anything of the host's) refuses the copy, as a directory on the way and as the
// file itself, and nothing is written where it points.
test('the fake VM\'s scp copies nothing through a link inside the root that leads out of it', {skip: noJq}, async t => {
  const vm = await makeVm(t);
  const outside = join(vm.scratch, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, vm.path('var/cache/cua/linked-dir'));
  symlinkSync(join(outside, 'target'), vm.path('var/cache/cua/linked-file'));
  assert.throws(() => contained(vm.path('var/cache/cua/linked-dir/x'), vm.root), /through the link/);
  const payload = join(vm.scratch, 'payload');
  writeFileSync(payload, 'x');
  for (const dest of ['/var/cache/cua/linked-dir/x', '/var/cache/cua/linked-file']) {
    const scp = spawnSync(join(vm.bin, 'scp'), [payload, `root@vm:${dest}`], {env: vm.env, encoding: 'utf8'});
    assert.equal(scp.status, 97, `${dest}: ${scp.stderr}`);
    assert.match(scp.stderr, /through the link/);
  }
  assert.deepEqual(readdirSync(outside), [], 'nothing written where the links lead');
  // a plain destination under the root still copies
  const ok = spawnSync(join(vm.bin, 'scp'), [payload, 'root@vm:/var/cache/cua/plain'], {env: vm.env, encoding: 'utf8'});
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(vm.read('var/cache/cua/plain'), 'x');
});

// What a run did, by step, from the stubs' calls: 1 the packages, 7's npm ci, 8 cua install, 9 the registration, 10 the
// relay's enrolment and the agent.
const stepsOf = calls => ({
  packages: calls.find(call => call.startsWith('apt-get install')),
  npmCi: calls.includes('npm ci --no-audit --no-fund --loglevel=error'),
  install: calls.filter(call => call.startsWith('cua install')),
  registered: calls.includes('cua chrome register') && calls.includes('cua profiles bind me'),
  relay: calls.includes('cua remote enroll --relay wss://relay.example/ws --json') && calls.includes('cua agent install'),
  // a fetch is any curl but the checklist's look at the cloud's metadata for the VM's address
  fetches: calls.filter(call => call.startsWith('curl ') && !call.includes('169.254.169.254')),
  sleeps: calls.filter(call => call.startsWith('sleep')),
});
// The real `cua install` (bin/cua.mjs) ran on the VM's user's home: it placed cua's runtime there from the install
// fixture's assets, asked for those and nothing else, and none of OpenAI's.
function installedForReal(vm) {
  const served = new Set(Object.keys(JSON.parse(readFileSync(join(vm.scratch, 'fetch-map.json'), 'utf8'))));
  const fetched = vm.fetched();
  assert.ok(fetched.length > 0 && fetched.every(url => served.has(url)), `asked for: ${fetched.join(', ')}`);
  assert.ok(!fetched.some(url => /chatgpt|openai/i.test(url)));
  assert.ok(existsSync(join(vm.home, '.local/share/cua/current.json')), 'the install\'s pointer, in the user\'s cua home');
  assert.match(vm.log(), /^\{"ok":true,"release":"cua-linux-x64-[^"]+","changed":/m, 'the install\'s own summary');
}
const CHECKOUT_SENTENCE = `cua ${VENDOR_ENGINE_RETIRED_IN} has no vendor release for Linux; a cloud VM's provisioner that asks for one is replaced with \`deploy/cloud-vm/update.sh\``;
const debNoLongerUsed = (value, root) => `CUA_DEB=${value} in ${root}/etc/cua-provision.conf is no longer used: cua ${VENDOR_ENGINE_RETIRED_IN} installs no ChatGPT package, so nothing is fetched or waited for`;

test('the new provisioner on cua 0.30.0\'s checkout: no deb tools, cua install, the registration and the relay, nothing fetched or waited for', {skip: noJq}, async t => {
  const vm = await makeVm(t, {script: newProvisioner()});
  const {origin, c} = repos(vm);
  vm.setConf({CUA_REF: 'main', CUA_REPO: origin});
  const run = vm.provision();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const steps = stepsOf(vm.calls());
  assert.doesNotMatch(steps.packages, /\b(binutils|xz-utils)\b/, 'the deb\'s tools leave the package list');
  assert.match(steps.packages, /\bbubblewrap\b/);
  assert.ok(steps.npmCi);
  assert.deepEqual(steps.install, ['cua install --json']);
  assert.ok(steps.registered && steps.relay, vm.calls().join('\n'));
  assert.deepEqual(steps.fetches, []);
  assert.deepEqual(steps.sleeps, []);
  assert.equal(vm.head(), c);
  assert.match(vm.log(), new RegExp(`\\] ref main is commit ${c}\\n`), 'the log names the commit a name resolved to');
  assert.doesNotMatch(vm.log(), /CUA_DEB/);
  assert.match(vm.log(), /\] done\n/);
  installedForReal(vm);
});

// A first boot whose template names an annotated tag: FETCH_HEAD is the tag object, and the checkout is its commit.
test('the new provisioner checks out the commit of an annotated tag on first boot, and installs', {skip: noJq}, async t => {
  const vm = await makeVm(t, {script: newProvisioner()});
  const {origin, c} = repos(vm);
  vm.setConf({CUA_REF: 'v-test', CUA_REPO: origin});
  const run = vm.provision();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(vm.head(), c);
  assert.match(vm.log(), new RegExp(`\\] ref v-test is commit ${c}\\n`));
  assert.deepEqual(stepsOf(vm.calls()).install, ['cua install --json']);
});

// F9: a conf an earlier template wrote may still set CUA_DEB; the new script says once that it is no longer used.
test('the new provisioner with each old conf (pin, a mirror, upload, none) logs one line, fetches nothing, waits for nothing and completes', {skip: noJq}, async t => {
  for (const deb of ['pin', 'https://mirror.example/chatgpt_26.928.40906_amd64.deb', 'upload', 'none']) {
    const vm = await makeVm(t, {script: newProvisioner()});
    const {origin} = repos(vm);
    vm.setConf({CUA_REF: 'main', CUA_REPO: origin, CUA_DEB: deb, CUA_DEB_WAIT: '3600'});
    const run = vm.provision({VM_MIRROR: 'https://mirror.example/'});
    assert.equal(run.status, 0, `${deb}: ${run.stdout}${run.stderr}`);
    const steps = stepsOf(vm.calls());
    const lines = vm.log().split('\n').filter(line => line.includes('CUA_DEB'));
    assert.equal(lines.length, 1, deb);
    assert.match(lines[0], /^\[cua-provision \+\d+s\] /);
    assert.ok(lines[0].endsWith(debNoLongerUsed(deb, vm.root)), lines[0]);
    assert.deepEqual(steps.fetches, [], deb);
    assert.deepEqual(steps.sleeps, [], deb);
    assert.deepEqual(steps.install, ['cua install --json'], deb);
    assert.ok(steps.registered && steps.relay, deb);
    assert.ok(!existsSync(vm.path('var/cache/cua/upload.deb')));
  }
});

// N6: the template provisions cua 0.30.0 or later, and only as the checkout's own provisioner. Both are checked after
// the checkout and before npm ci and cua install; the checkout's provisioner is compared, never run.
test('the new provisioner on a checkout older than 0.30.0, or one whose own provisioner differs, exits 1 before npm ci and cua install', {skip: noJq}, async t => {
  const older = /this template provisions cua 0\.30\.0 or later; CUA_REF main is older: use that ref's own deploy\/cloud-vm\n/;
  // before M6a (a deb pin, no record); M6a's (a deb pin beside the record); and no record without a deb pin: each arm
  // of the check alone, and both
  for (const [at, why] of [
    ['older', older], ['m6a', older], ['norecord', older],
    ['c0', /\/usr\/local\/sbin\/cua-provision\.sh is not this checkout's deploy\/cloud-vm\/cua-provision\.sh \(CUA_REF main, commit [0-9a-f]{40}\): it provisions only the commit whose own provisioner it is, so this VM is upgraded from the operator's checkout with deploy\/cloud-vm\/update\.sh root@<this VM> --ref main\n/],
  ]) {
    const vm = await makeVm(t, {script: newProvisioner()});
    const ids = repos(vm, {push: at});
    vm.setConf({CUA_REF: 'main', CUA_REPO: ids.origin});
    const before = readFileSync(vm.path('usr/local/sbin/cua-provision.sh'));
    const run = vm.provision();
    assert.equal(run.status, 1, `${at}: ${run.stdout}${run.stderr}`);
    assert.match(vm.log(), why, at);
    assert.equal(vm.head(), ids[at], 'the checkout moved; nothing after it ran');
    const steps = stepsOf(vm.calls());
    assert.ok(!steps.npmCi, at);
    assert.deepEqual(steps.install, [], at);
    assert.deepEqual(readFileSync(vm.path('usr/local/sbin/cua-provision.sh')), before, 'the script never replaces itself');
  }
});

test('the new provisioner checks a commit ID out exactly, whatever origin\'s branches say, and exits 1 before cua install when origin cannot give it', {skip: noJq}, async t => {
  const vm = await makeVm(t, {script: newProvisioner()});
  const {origin, c, next} = repos(vm, {push: 'next'});
  vm.setConf({CUA_REF: c, CUA_REPO: origin});
  const run = vm.provision();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(vm.head(), c, `origin's main is ${next}`);
  assert.match(vm.log(), /\] checkout [0-9a-f]+ the commit the update provisions\n/);

  const absent = '0123456789abcdef0123456789abcdef01234567';
  vm.setConf({CUA_REF: absent, CUA_REPO: origin});
  const calls = vm.calls().length;
  const refused = vm.provision();
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(vm.log(), new RegExp(`origin ${origin.replaceAll('.', '\\.')} does not give commit ${absent}: push it there, or set CUA_REF to a commit it has\\n`));
  assert.equal(vm.head(), c);
  assert.deepEqual(stepsOf(vm.calls().slice(calls)).install, []);
});

// ---- The two generations of the deployed provisioner, frozen, on cua 0.30.0's checkout (§3.6's table) ----

const blobId = bytes => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
// Each frozen script is the blob of the commit that deployed it: `git rev-parse <commit>:deploy/cloud-vm/cua-provision.sh`.
const FROZEN = {
  preM6a: ['cua-provision-9d3fdce6b.sh', '70189219c4febe2441b19cfe17c2f0d2b9d4fe04'],
  m6a: ['cua-provision-cb9973e82.sh', '88bab5eb520d842901c75c07c1fc7f1013cc079b'],
};
const frozen = name => {
  const [file, blob] = FROZEN[name];
  const bytes = readFileSync(join(fixtures, file));
  assert.equal(blobId(bytes), blob, `${file} is not its commit's script`);
  return bytes.toString();
};

// update.sh, from the operator's checkout at `c`, repairs the stop a frozen script left: the new provisioner then runs
// through step 10 on the state it found. An old conf's CUA_DEB is one log line; nothing is fetched or waited for.
function repairs(vm, {operator, c}, {deb}) {
  const calls = vm.calls().length;
  const run = vm.update(operator, ['--ref', 'main']);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const steps = stepsOf(vm.calls().slice(calls));
  assert.deepEqual(steps.install, ['cua install --json']);
  assert.ok(steps.registered && steps.relay, vm.calls().slice(calls).join('\n'));
  assert.deepEqual(steps.fetches, []);
  assert.deepEqual(steps.sleeps, []);
  assert.equal(vm.head(), c);
  assert.match(vm.read('etc/cua-provision.conf'), new RegExp(`^CUA_REF='${c}'$`, 'm'));
  assert.equal(vm.log().split(debNoLongerUsed(deb, vm.root)).length, 2, 'the conf\'s CUA_DEB, once');
  installedForReal(vm);
}

test('a provisioner from before M6a exits 1 at its deb pin lookup, before any install, with the checkout\'s sentence in its log; update.sh then completes the VM', {skip: noJq}, async t => {
  for (const deb of ['pin', 'upload']) {
    const vm = await makeVm(t, {script: frozen('preM6a')});
    const ids = repos(vm);
    vm.setConf({CUA_REF: 'main', CUA_REPO: ids.origin, CUA_DEB: deb, CUA_DEB_WAIT: '10'});
    const run = vm.provision();
    assert.equal(run.status, 1, `${deb}: ${run.stdout}${run.stderr}`);
    assert.ok(vm.log().includes(CHECKOUT_SENTENCE), vm.log());
    const steps = stepsOf(vm.calls());
    assert.ok(steps.npmCi, 'its checkout step ran: the checkout moved');
    assert.equal(vm.head(), ids.c);
    assert.deepEqual(vm.calls().filter(call => call.startsWith('cua ')), [], 'no install, no registration');
    assert.deepEqual([steps.fetches, steps.sleeps], [[], []], 'it stops before the deb is fetched or waited for');
    repairs(vm, ids, {deb});
  }
});

test('M6a\'s provisioner with CUA_DEB=none runs clean on cua 0.30.0\'s checkout', {skip: noJq}, async t => {
  const vm = await makeVm(t, {script: frozen('m6a')});
  const ids = repos(vm);
  vm.setConf({CUA_REF: 'main', CUA_REPO: ids.origin, CUA_DEB: 'none'});
  const run = vm.provision();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const steps = stepsOf(vm.calls());
  assert.deepEqual(steps.install, ['cua install --json']);
  assert.ok(steps.registered && steps.relay);
  assert.deepEqual([steps.fetches, steps.sleeps], [[], []]);
  assert.equal(vm.head(), ids.c);
  assert.match(vm.log(), /\] done\n/);
  assert.match(vm.read('var/lib/cua-provision/checklist.txt'), /^(?!.*stopped early)/s);
  installedForReal(vm);
});

// M6a's script with a deb asked for: cua 0.30.0's install reports no vendor tree, so it looks the pin up; the lookup's
// failure (the checkout's sentence, in the log) is lost in a here-string, and the deb step stops on empty values with
// exit 0, its own checklist line, and step 10 skipped. upload first waits out CUA_DEB_WAIT.
test('M6a\'s provisioner with CUA_DEB pin, a mirror or upload installs and registers, then stops at the deb step with exit 0 and skips the relay; update.sh then completes the VM', {skip: noJq}, async t => {
  for (const [deb, stop, sleeps] of [
    ['pin', 'could not download : cua\'s own runtime is installed and registered; copy the pinned deb to the VM\'s @/var/cache/cua/upload.deb and set CUA_DEB=upload, or run cua-provision.sh again', 0],
    ['https://mirror.example/chatgpt_26.928.40906_amd64.deb', 'https://mirror.example/chatgpt_26.928.40906_amd64.deb does not match the pin\'s sha256 for  (removed)', 0],
    ['upload', 'no deb at @/var/cache/cua/upload.deb: copy  there, then run cua-provision.sh again', 2],
  ]) {
    const vm = await makeVm(t, {script: frozen('m6a')});
    const ids = repos(vm);
    vm.setConf({CUA_REF: 'main', CUA_REPO: ids.origin, CUA_DEB: deb, CUA_DEB_WAIT: '10'});
    const run = vm.provision({VM_MIRROR: 'https://mirror.example/'});
    assert.equal(run.status, 0, `${deb}: ${run.stdout}${run.stderr}`);
    const steps = stepsOf(vm.calls());
    assert.deepEqual(steps.install, ['cua install --json'], `${deb}: the plain install, never --archive`);
    assert.ok(steps.registered, deb);
    assert.ok(!steps.relay && !vm.calls().some(call => call.startsWith('cua remote') || call === 'cua agent install'), `${deb}: step 10 skipped`);
    assert.equal(vm.read('var/lib/cua-provision/checklist.txt').split('\n')[1], `  !! provisioning stopped early: ${stop.replaceAll('@', vm.root)}`, deb);
    assert.ok(vm.log().includes(CHECKOUT_SENTENCE), `${deb}: the lookup's error is the checkout's sentence`);
    assert.equal(steps.sleeps.length, sleeps, deb);
    installedForReal(vm);
    repairs(vm, ids, {deb});
  }
});

// ---- update.sh: the script, the conf and the checkout bound to one commit (§3.6) ----

// A VM made by M6a's template, its checkout at c0 from `source`; the conf names `ref`.
async function deployed(t, {push = 'c', repo} = {}) {
  const vm = await makeVm(t, {script: frozen('m6a')});
  const ids = repos(vm, {push});
  vm.checkout(ids.origin, ids.c0);
  vm.setConf({CUA_REF: 'main', CUA_REPO: repo ?? ids.origin, CUA_DEB: 'none'});
  const snapshot = () => ({script: readFileSync(vm.path('usr/local/sbin/cua-provision.sh')), conf: readFileSync(vm.path('etc/cua-provision.conf'))});
  return {vm, ids, before: snapshot(), snapshot};
}
const remoteCalls = vm => vm.calls().filter(call => /^(ssh|scp) /.test(call));
const bundleStops = c => `update.sh: the VM's /var/cache/cua/cua.bundle does not give ${c}: its heads do not name it, or a fetch from it fails; run update.sh again with --bundle, which replaces it with one whose tip is ${c}; the VM's script and conf are unchanged\n`;
const candidateRefused = c => new RegExp(`the bundle copied to root@203\\.0\\.113\\.7:/var/cache/cua/cua\\.bundle\\.update\\.[0-9a-f]{16} does not give ${c}: its heads do not name it, or a fetch from it fails; it was removed, and /var/cache/cua/cua\\.bundle, the VM's script and its conf are unchanged\\n$`);

test('update.sh resolves the ref once, checks the VM\'s source, installs the script by its hash, sets CUA_REF to the commit, runs it and checks HEAD, in that order', {skip: noJq}, async t => {
  const {vm, ids} = await deployed(t);
  // under the quoting rules of bash before 4.3, as an operator's macOS /bin/bash (3.2) has them
  const run = vm.update(ids.operator, ['--ref', 'main'], {BASH_COMPAT: '42'});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const order = [
    /^ssh \. \/etc\/cua-provision\.conf && /,
    /^ssh runuser -u 'cua' -- sh -c '.*' sh '[^']*origin\.git' [0-9a-f]{40}$/,
    /^scp \S+\/cua-provision\.sh \/usr\/local\/sbin\/cua-provision\.sh\.update\.([0-9a-f]{16})$/,
    /^ssh sha256sum \/usr\/local\/sbin\/cua-provision\.sh\.update\.([0-9a-f]{16})$/,
    /^ssh chmod 0755 \/usr\/local\/sbin\/cua-provision\.sh\.update\.([0-9a-f]{16}) && mv -f \/usr\/local\/sbin\/cua-provision\.sh\.update\.\1 \/usr\/local\/sbin\/cua-provision\.sh$/,
    /^ssh sed .* \/etc\/cua-provision\.conf >\/etc\/cua-provision\.conf\.update\.([0-9a-f]{16}) && /,
    /^ssh \/usr\/local\/sbin\/cua-provision\.sh$/,
    /^ssh runuser -u 'cua' -- git -C \/opt\/cua rev-parse HEAD$/,
  ];
  const calls = remoteCalls(vm);
  assert.equal(calls.length, order.length, calls.join('\n'));
  order.forEach((pattern, i) => assert.match(calls[i], pattern));
  // one staging name per run, not a fixed one another run could overwrite
  const ids2 = new Set(calls.map(call => call.match(/\.update\.([0-9a-f]{16})/)?.[1]).filter(Boolean));
  assert.equal(ids2.size, 1, calls.join('\n'));
  assert.equal(vm.update(ids.operator, ['--ref', 'main']).status, 0);
  const again = remoteCalls(vm).slice(order.length).map(call => call.match(/\.update\.([0-9a-f]{16})/)?.[1]).filter(Boolean);
  assert.ok(again.length > 0 && !again.includes([...ids2][0]), 'a second run stages under its own name');
  assert.deepEqual(readFileSync(vm.path('usr/local/sbin/cua-provision.sh')), readFileSync(join(ids.operator, 'deploy/cloud-vm/cua-provision.sh')));
  assert.equal(vm.read('etc/cua-provision.conf'), `CUA_USER='cua'\nCUA_RELAY='wss://relay.example/ws'\nCUA_REF='${ids.c}'\nCUA_REPO='${ids.origin}'\nCUA_DEB='none'\n`);
  assert.equal(vm.head(), ids.c);
  assert.deepEqual(readdirSync(vm.path('usr/local/sbin')), ['cua-provision.sh'], 'no staged copy left');
  assert.match(run.stdout, new RegExp(`update\\.sh: main is ${ids.c}\\n`));
  assert.match(run.stdout, new RegExp(`update\\.sh: the VM's checkout is at ${ids.c}\\n`));
});

test('update.sh refuses, before touching the VM, when its own cua-provision.sh is not the one at the commit', {skip: noJq}, async t => {
  const {vm, ids, before, snapshot} = await deployed(t);
  const other = vm.update(ids.operator, ['--ref', ids.c0]);
  assert.equal(other.status, 1, other.stdout + other.stderr);
  assert.match(other.stderr, new RegExp(`this checkout's deploy/cloud-vm/cua-provision\\.sh is not the one at ${ids.c0} \\(${ids.c0}\\)`));
  appendFileSync(join(ids.operator, 'deploy/cloud-vm/cua-provision.sh'), '# an uncommitted change\n');
  const edited = vm.update(ids.operator);
  assert.equal(edited.status, 1, edited.stdout + edited.stderr);
  assert.match(edited.stderr, new RegExp(`is not the one at ${ids.c} \\(HEAD\\): check out HEAD, or commit the change, then run update\\.sh again\\n$`));
  assert.deepEqual(remoteCalls(vm), []);
  assert.deepEqual(snapshot(), before);
  assert.equal(vm.head(), ids.c0);
});

test('update.sh: a copy whose SHA-256 is not the script\'s is removed, and the VM\'s script and conf stay as they were', {skip: noJq}, async t => {
  const {vm, ids, before, snapshot} = await deployed(t);
  const run = vm.update(ids.operator, [], {VM_SCP_HOOK: 'printf x >>"$1"'});
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /the copy at root@203\.0\.113\.7:\/usr\/local\/sbin\/cua-provision\.sh\.update\.[0-9a-f]{16} has SHA-256 [0-9a-f]{64}, not [0-9a-f]{64}: it was removed, and the VM's script and conf are unchanged\n$/);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(readdirSync(vm.path('usr/local/sbin')), ['cua-provision.sh'], 'no staged copy left');
  assert.ok(!remoteCalls(vm).includes('ssh /usr/local/sbin/cua-provision.sh'));
  assert.equal(vm.head(), ids.c0);
});

// The operator's working copy changes after update.sh has checked it against C (an edit, a branch switch): what the VM
// gets is still C's provisioner, staged once, and the run completes.
test('update.sh ships the provisioner it verified against the commit, whatever the working copy becomes meanwhile', {skip: noJq}, async t => {
  const {vm, ids} = await deployed(t);
  const working = join(ids.operator, 'deploy/cloud-vm/cua-provision.sh');
  const atC = git(ids.operator, 'cat-file', 'blob', `${ids.c}:deploy/cloud-vm/cua-provision.sh`) + '\n';
  const run = vm.update(ids.operator, ['--ref', 'main'], {VM_SSH_HOOK: `printf 'echo a later edit\\n' >>'${working}'`});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.notEqual(readFileSync(working, 'utf8'), atC, 'the working copy changed during the run');
  assert.equal(vm.read('usr/local/sbin/cua-provision.sh'), atC);
  assert.equal(vm.head(), ids.c);
});

test('update.sh with a moving ref: the commit it resolved is what the conf holds and the checkout ends at', {skip: noJq}, async t => {
  const {vm, ids} = await deployed(t);
  // origin's main moves to `next`, whose provisioner is byte for byte the same, once update.sh has resolved main
  const run = vm.update(ids.operator, ['--ref', 'main'], {VM_SSH_HOOK: `git -C '${ids.operator}' push -q '${ids.origin}' ${ids.next}:refs/heads/main`});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(git(ids.origin, 'rev-parse', 'main'), ids.next, 'the ref moved');
  assert.match(vm.read('etc/cua-provision.conf'), new RegExp(`^CUA_REF='${ids.c}'$`, 'm'));
  assert.equal(vm.head(), ids.c);
});

test('update.sh stops at the source check when the VM\'s source lacks the commit, with the VM\'s script and conf byte for byte as before', {skip: noJq}, async t => {
  const {vm, ids, before, snapshot} = await deployed(t, {push: 'c0'});
  const run = vm.update(ids.operator, ['--ref', 'main']);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.equal(run.stderr, `update.sh: the VM's source ${ids.origin} (its CUA_REPO) does not give ${ids.c}: push ${ids.c} (main) there, then run update.sh again; the VM's script and conf are unchanged\n`);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(remoteCalls(vm).map(call => call.split(' ')[0] + ' ' + call.split(' ')[1]), ['ssh .', 'ssh runuser']);
  assert.equal(vm.head(), ids.c0);
});

test('update.sh with a stale uploaded bundle stops naming --bundle; with --bundle it replaces the bundle, checked on the VM first, and ends at the commit', {skip: noJq}, async t => {
  const {vm, ids, before, snapshot} = await deployed(t, {repo: 'upload'});
  const bundle = vm.path('var/cache/cua/cua.bundle');
  bundleOf(ids.operator, ids.c0, bundle);
  // the checkout's origin is the bundle, as the template's upload leaves it
  git(vm.path('opt/cua'), 'remote', 'set-url', 'origin', bundle);
  const stale = readFileSync(bundle);

  const stopped = vm.update(ids.operator, ['--ref', 'main']);
  assert.equal(stopped.status, 1, stopped.stdout + stopped.stderr);
  assert.equal(stopped.stderr, bundleStops(ids.c));
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(readFileSync(bundle), stale);

  // a new bundle that arrives naming another commit is never renamed over the old one
  const wrong = join(vm.scratch, 'wrong.bundle');
  bundleOf(ids.operator, ids.next, wrong);
  const swapped = vm.update(ids.operator, ['--ref', 'main', '--bundle'], {VM_SCP_HOOK: `case "$1" in *.bundle.update.*) cp '${wrong}' "$1" ;; esac`});
  assert.equal(swapped.status, 1, swapped.stdout + swapped.stderr);
  assert.match(swapped.stderr, candidateRefused(ids.c));
  assert.deepEqual(readFileSync(bundle), stale);
  assert.deepEqual(readdirSync(vm.path('var/cache/cua')), ['cua.bundle'], 'the candidate is gone');
  assert.deepEqual(snapshot(), before);

  const recovered = vm.update(ids.operator, ['--ref', 'main', '--bundle']);
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.match(git(vm.scratch, 'bundle', 'list-heads', bundle), new RegExp(`^${ids.c} `, 'm'));
  assert.equal(vm.head(), ids.c);
  assert.match(vm.read('etc/cua-provision.conf'), new RegExp(`^CUA_REF='${ids.c}'$`, 'm'));
  assert.ok(stepsOf(vm.calls()).relay);
});

// A bundle whose header names C but whose pack is cut short: its heads alone would pass. update.sh fetches from it, as
// the desktop user, before anything is promoted, as the live bundle and as a candidate.
test('update.sh refuses a bundle that names the commit but cannot give it, live or as the candidate, and changes nothing', {skip: noJq}, async t => {
  const {vm, ids, before, snapshot} = await deployed(t, {repo: 'upload'});
  const bundle = vm.path('var/cache/cua/cua.bundle');
  bundleOf(ids.operator, ids.c, bundle);
  truncateBundle(bundle);
  assert.match(git(vm.scratch, 'bundle', 'list-heads', bundle), new RegExp(`^${ids.c} `, 'm'), 'its heads still name C');
  git(vm.path('opt/cua'), 'remote', 'set-url', 'origin', bundle);
  const cut = readFileSync(bundle);

  const live = vm.update(ids.operator, ['--ref', 'main']);
  assert.equal(live.status, 1, live.stdout + live.stderr);
  assert.equal(live.stderr, bundleStops(ids.c));
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(readFileSync(bundle), cut);

  const candidate = vm.update(ids.operator, ['--ref', 'main', '--bundle'], {VM_SCP_HOOK: `case "$1" in *.bundle.update.*) cp '${bundle}' "$1" ;; esac`});
  assert.equal(candidate.status, 1, candidate.stdout + candidate.stderr);
  assert.match(candidate.stderr, candidateRefused(ids.c));
  assert.deepEqual(readdirSync(vm.path('var/cache/cua')), ['cua.bundle']);
  assert.deepEqual(snapshot(), before);
  assert.equal(vm.head(), ids.c0);
});

test('update.sh --bundle is refused for a VM whose source is a repository URL, before anything is copied', {skip: noJq}, async t => {
  const {vm, ids, before, snapshot} = await deployed(t);
  const run = vm.update(ids.operator, ['--bundle']);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.equal(run.stderr, `update.sh: --bundle replaces an uploaded bundle, and this VM's CUA_REPO is ${ids.origin}, not upload\n`);
  assert.deepEqual(remoteCalls(vm).map(call => call.split(' ')[1]), ['.']);
  assert.deepEqual(snapshot(), before);
});

test('update.sh exits nonzero, naming the commit it found, when the checkout ends elsewhere', {skip: noJq}, async t => {
  const {vm, ids} = await deployed(t);
  const run = vm.update(ids.operator, ['--ref', 'main'], {VM_PROVISION_OVERRIDE: `git -C '${vm.path('opt/cua')}' fetch -q '${ids.operator}' next && git -C '${vm.path('opt/cua')}' checkout -q --detach ${ids.next}`});
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.equal(run.stderr, `update.sh: the VM's checkout /opt/cua is at ${ids.next}, not ${ids.c}\n`);
});

test('update.sh: usage', () => {
  for (const args of [[], ['--ref'], ['root@a', 'root@b'], ['root@a', '--colour'], ['root@a', '--ref', 'x;y'], ['root@a', '--ref', '-x']]) {
    const run = spawnSync('bash', [`${dir}update.sh`, ...args], {encoding: 'utf8'});
    assert.equal(run.status, 2, `${args.join(' ')}: ${run.stdout}${run.stderr}`);
    assert.equal(run.stdout, '');
  }
});
