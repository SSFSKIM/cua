// deploy/cloud-vm/render.sh: the user data it prints is cloud-init.yaml with the parameters and cua-provision.sh filled
// in, its inputs are refused unless plain, and it fits a provider's user-data limit. The VM side (cua-provision.sh) is
// proven live (docs/evidence/2026-10-07-cloud-vm-provisioning.md); here only its shell syntax is checked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {CUA_EXTENSION_ID} from '../src/chrome/extension.mjs';
import {DEFAULT_BASE_URL} from '../scripts/extension-pack.mjs';

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
    "CUA_USER='agent'\nCUA_REF='feat/x-1'\nCUA_REPO='https://github.com/SSFSKIM/cua'\nCUA_DEB='pin'\nCUA_RELAY='wss://1-2-3-4.sslip.io/ws'\n" +
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
  assert.match(conf(plain), /^CUA_USER='cua'\nCUA_REF='main'\nCUA_REPO='https:\/\/github\.com\/SSFSKIM\/cua'\nCUA_DEB='pin'\nCUA_RELAY=''\nCUA_EXTENSION='hosted'\nCUA_EXTENSION_URL='https:\/\/178-104-102-73\.sslip\.io\/ext\/update\.xml'\n$/);
  assert.match(conf(render('--deb', 'https://mirror.example/chatgpt_26.928.40906_amd64.deb')), /CUA_DEB='https:\/\/mirror\.example\/chatgpt_26\.928\.40906_amd64\.deb'/);
  assert.match(conf(render('--deb', `${dir}cloud-init.yaml`)), /CUA_DEB='upload'/);
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
  assert.doesNotMatch(script, /hehggadaopoacecdllhhajmbjkdcmajg|cua login|Sign in to ChatGPT/);
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
