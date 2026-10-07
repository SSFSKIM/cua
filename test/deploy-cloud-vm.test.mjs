// deploy/cloud-vm/render.sh: the user data it prints is cloud-init.yaml with the parameters and cua-provision.sh filled
// in, its inputs are refused unless plain, and it fits a provider's user-data limit. The VM side (cua-provision.sh) is
// proven live (docs/evidence/2026-10-07-cloud-vm-provisioning.md); here only its shell syntax is checked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

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
    "CUA_USER='agent'\nCUA_REF='feat/x-1'\nCUA_REPO='https://github.com/SSFSKIM/cua'\nCUA_DEB='pin'\nCUA_RELAY='wss://1-2-3-4.sslip.io/ws'\n");
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
  assert.match(conf(plain), /^CUA_USER='cua'\nCUA_REF='main'\n.*CUA_DEB='pin'\nCUA_RELAY=''\n$/s);
  assert.match(conf(render('--deb', 'https://mirror.example/chatgpt_26.928.40906_amd64.deb')), /CUA_DEB='https:\/\/mirror\.example\/chatgpt_26\.928\.40906_amd64\.deb'/);
  assert.match(conf(render('--deb', `${dir}cloud-init.yaml`)), /CUA_DEB='upload'/);
});

test('render.sh refuses anything that is not plain (it lands in a shell-sourced file)', () => {
  for (const args of [
    ['--user', 'root'], ['--user', "a'b"], ['--ref', 'main; rm -rf /'], ['--ref', "x'y"], ['--ref', '-x'], ['--ref', '--upload-pack=x'],
    ['--relay', 'ws://relay.example/ws'], ['--relay', "wss://r.example/ws'"], ['--deb', 'http://mirror.example/x.deb'],
    ['--deb', "https://m.example/a'b.deb"], ['--deb', '/nonexistent/chatgpt.deb'], ['--user'], ['--colour', 'x'],
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
