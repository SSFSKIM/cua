// A fake cloud VM for deploy/cloud-vm's tests (test/deploy-cloud-vm.test.mjs): a whole provisioner, old or new, runs
// here as the VM runs it, and update.sh drives it over a stubbed ssh and scp. Nothing touches a real VM.
//
// - The VM's file system is a scratch root. Each script's VM paths move under it (remap.mjs), and the ssh and scp stubs
//   remap update.sh's remote commands and copies the same way. The remap is fail-closed: an absolute path it does not
//   know refuses the script or the command before any of it runs, and a copy lands inside the root or nowhere. The
//   VM's desktop user is this test's user, so `runuser` clears the environment as `env -i` does: nothing of the host's
//   (a CUA_HOME, an XDG directory) reaches a command run as that user.
// - Packages, systemd, the user's account and the desktop are stubs that record their calls (`calls()`), and so are
//   Chrome's, the relay's and doctor's `cua` commands. `sleep` returns at once and is recorded, so a wait shows as its
//   sleeps.
// - `cua install` is the real CLI, `bin/cua.mjs` of the VM's checkout, run as the user on the user's home. The checkout's
//   `runtime/` holds T4's fixture pins (test/fixtures/linux-install-archives.mjs), and node runs with the symlinks of
//   `src` and `bin` preserved, so the real code reads those pins. Its fetch serves the fixture's bytes and records each
//   URL asked for (install-fetch.mjs); nothing reaches the network.
// - git is real. The VM's source is a real bare repository or a real bundle, and the checkouts are real clones of
//   `repos()`, whose deploy/cloud-vm/cua-provision.sh is the provisioner as the fake VM runs it.
// - node processes on the VM see a linux-x64 host (linux-host.mjs).
import {spawnSync} from 'node:child_process';
import {chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {remapScript} from './remap.mjs';
import {NODE_VERSION, servedArchives, sha256} from '../linux-install-archives.mjs';
import {writeFixtureModules} from '../module-registry.mjs';

const fixtures = fileURLToPath(new URL('./', import.meta.url));
const checkoutRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const deployDir = join(checkoutRoot, 'deploy', 'cloud-vm');
export const USER = 'cua';
export const UID = '4242';
// cua 0.30.0's `cua install --json` on a home that needs nothing: no `vendor` key (#171 M6b, the pre-flight's §3.3).
// The sourced unit tests' canned answer; the whole-script runs get the real CLI's.
export const INSTALL_JSON = {ok: true, release: 'cua-linux-x64-e0.4.7-n24.22.0-s0.163.0-mb71dc1f8185d', changed: false,
  sessions: {browser: true, computer: true}, retired: []};

// No user or system git configuration reaches any git here (a signing or hooks setting of the host's would).
const gitEnv = {GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0'};

export function git(cwd, ...args) {
  const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args],
    {cwd, encoding: 'utf8', env: {...process.env, ...gitEnv}});
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}

const STUBS = {
  // runuser -u <user> -- [env -i [-C <dir>] [VAR=value]...] <command>: the command as this test's user, with the
  // environment cleared as `env -i` clears it (runuser without it sets HOME, USER and LOGNAME), keeping only the test's
  // PATH, TMPDIR, node options, git settings and the fake VM's own VM_* variables, so the stubs still answer.
  runuser: `user=''
if [[ $1 == -u ]]; then user=$2; shift 2; fi
[[ $1 == -- ]] && shift
keep=()
for name in PATH TMPDIR NODE_OPTIONS GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM GIT_TERMINAL_PROMPT $(compgen -v VM_); do keep+=("$name=\${!name}"); done
if [[ \${1:-} == env ]]; then
  shift
  [[ $1 == -i ]] && shift
  if [[ $1 == -C ]]; then cd "$2" || exit 125; shift 2; fi
  while [[ $1 == *=* ]]; do [[ $1 == PATH=* ]] || keep+=("$1"); shift; done
else
  keep+=("HOME=$VM_ROOT/home/$user" "USER=$user" "LOGNAME=$user")
fi
exec env -i "\${keep[@]}" "$@"`,
  // coreutils' install, without the ownership (-o, -g) the test cannot give
  install: `dir=0 parents=0 mode=''
while [[ $1 == -* ]]; do
  case $1 in -d) dir=1; shift ;; -D) parents=1; shift ;; -m) mode=$2; shift 2 ;; -o|-g) shift 2 ;; *) echo "install stub: $1" >&2; exit 2 ;; esac
done
if ((dir)); then mkdir -p "$@" || exit 1; if [[ -n $mode ]]; then chmod "$mode" "$@"; fi; exit 0; fi
if ((parents)); then mkdir -p "$(dirname "$2")" || exit 1; fi
cp "$1" "$2" || exit 1
if [[ -n $mode ]]; then chmod "$mode" "$2"; fi`,
  'apt-get': 'log',
  dpkg: 'case $1 in --print-architecture) echo amd64 ;; esac',
  id: `echo ${UID}`,
  getent: 'echo "$2:x:4242:4242::$VM_ROOT/home/$2:/bin/bash"',
  useradd: 'log',
  loginctl: 'log',
  sysctl: ':',
  dconf: ':',
  gpg: 'log',
  systemctl: 'log',
  hostname: 'if [[ $1 == -I ]]; then echo 203.0.113.7; else echo cua-vm; fi',
  sleep: 'log',
  // npm ci in the checkout: its node_modules, as this checkout's own (the real CLI imports from it)
  npm: `log
if [[ $1 == ci ]]; then ln -sfn "$VM_NODE_MODULES" node_modules; fi`,
  // cua: the real CLI for install; Chrome's, the relay's and doctor's commands answer as cua 0.30.0's do
  cua: `log
case "$1 \${2:-}" in
  "install "*) exec node "$VM_ROOT/opt/cua/bin/cua.mjs" "$@" ;;
  "doctor "*) echo '{"ok":true,"checks":[{"name":"platform","status":"pass"}]}' ;;
  "remote show") echo '{}' ;;
  "remote enroll") echo '{"ok":true}' ;;
esac
exit 0`,
  // curl: nothing answers but a mirror named by VM_MIRROR, which serves some bytes; an empty URL is curl's own error
  curl: `log
out='' url=''
while (($#)); do case $1 in -o) out=$2; shift 2 ;; --retry|--max-time) shift 2 ;; -*) shift ;; *) url=$1; shift ;; esac; done
[[ -n $url ]] || { echo 'curl: (3) URL rejected: Malformed input to a URL function' >&2; exit 3; }
if [[ -n \${VM_MIRROR:-} && $url == "$VM_MIRROR"* ]]; then printf 'a mirror deb\\n' >"$out"; exit 0; fi
echo "curl: (6) Could not resolve host: \${url#*://}" >&2; exit 6`,
  // GNU's sha256sum as the scripts call it: \`sha256sum <file>...\` and \`sha256sum -c --status\` (lines on stdin)
  sha256sum: `hash() { node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1" 2>/dev/null; }
if [[ $1 == -c ]]; then
  status=0 any=0
  while read -r want file; do any=1; if [[ -z $file || "$(hash "$file")" != "$want" ]]; then status=1; fi; done
  ((any)) || exit 1
  exit $status
fi
for f; do h="$(hash "$f")" || { echo "sha256sum: $f: No such file or directory" >&2; exit 1; }; printf '%s  %s\\n' "$h" "$f"; done`,
  // ssh [options] <target> <command...>: the command, its VM paths remapped, run here by bash as the VM's root shell runs
  // it; a command naming a path the fake VM will not place runs nothing (exit 97). VM_SSH_HOOK runs once, before the
  // first command (a ref that moves meanwhile); VM_PROVISION_OVERRIDE runs in place of the provisioner (a run that ends
  // elsewhere).
  ssh: `while (($#)); do case $1 in -o|-i|-p|-F|-l) shift 2 ;; -*) shift ;; *) break ;; esac; done
shift
cmd="$*"
printf 'ssh %s\\n' "$cmd" >>"$VM_CALLS"
placed="$(printf '%s' "$cmd" | node "$VM_REMAP" "$VM_ROOT" "$VM_SCRATCH")" || exit 97
if [[ -n \${VM_SSH_HOOK:-} && ! -e $VM_ROOT/.ssh-hook-ran ]]; then : >"$VM_ROOT/.ssh-hook-ran"; bash -c "$VM_SSH_HOOK" || exit 1; fi
if [[ $cmd == /usr/local/sbin/cua-provision.sh && -n \${VM_PROVISION_OVERRIDE:-} ]]; then exec bash -c "$VM_PROVISION_OVERRIDE"; fi
exec bash -c "$placed"`,
  // scp [options] <file> <target>:<path>: a copy to the remapped path, which must lie inside the root (else exit 97,
  // nothing copied). VM_SCP_HOOK then runs with that path (a copy that arrives changed).
  scp: `while (($#)); do case $1 in -o|-i|-P|-F) shift 2 ;; -*) shift ;; *) break ;; esac; done
printf 'scp %s %s\\n' "$1" "\${2#*:}" >>"$VM_CALLS"
dest="$(printf '%s' "\${2#*:}" | node "$VM_REMAP" "$VM_ROOT" "$VM_SCRATCH" --contained)" || exit 97
cp "$1" "$dest" || exit 1
if [[ -n \${VM_SCP_HOOK:-} ]]; then bash -c "$VM_SCP_HOOK" scp-hook "$dest" || exit 1; fi`,
};

// A VM provisioned as far as the user's desktop: its root, the desktop user's home with Chrome's Default profile, cua's
// extension and its host's socket (so the provisioner's waits end at once) and the user bus. `script` is installed as
// /usr/local/sbin/cua-provision.sh, remapped. setConf writes /etc/cua-provision.conf (the desktop user and a relay,
// unless given); checkout() clones the VM's source to /opt/cua at a commit, as an earlier provisioning left it.
export async function makeVm(t, {script} = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'cua-vm-'));
  const root = join(scratch, 'root'), bin = join(scratch, 'bin'), callsFile = join(scratch, 'calls.log');
  const home = join(root, 'home', USER);
  for (const dir of ['etc/apt/apt.conf.d', 'etc/sysctl.d', 'usr/local/bin', 'usr/local/sbin', 'var/log', 'var/cache/cua', 'var/lib', 'opt', 'root', `run/user/${UID}`,
    `home/${USER}/.config/google-chrome/Default/Extensions/jkejaaijdfpohkdhankllbekkhmnippb`, `home/${USER}/.local/share/cua/chrome/b`]) mkdirSync(join(root, dir), {recursive: true});
  mkdirSync(join(scratch, 'tmp'));
  writeFileSync(join(home, '.local/share/cua/chrome/b/h.sock'), '');
  const bus = createServer();
  await new Promise((resolve, reject) => { bus.once('error', reject); bus.listen(join(root, 'run/user', UID, 'bus'), resolve); });
  t.after(() => { bus.close(); rmSync(scratch, {recursive: true, force: true}); });
  mkdirSync(bin);
  writeFileSync(callsFile, '');
  writeFileSync(join(scratch, 'fetched.log'), '');
  for (const [name, body] of Object.entries(STUBS)) {
    const logged = body.replace(/^log$/m, `printf '%s %s\\n' ${name} "$*" >>"$VM_CALLS"`);
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${logged}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const preload = name => `--import=${pathToFileURL(join(fixtures, name))}`;
  const vm = {
    t, scratch, root, home, bin,
    env: {...process.env, ...gitEnv, PATH: `${bin}:${process.env.PATH}`, TMPDIR: join(scratch, 'tmp'), VM_ROOT: root, VM_SCRATCH: scratch,
      VM_CALLS: callsFile, VM_REMAP: join(fixtures, 'remap-cli.mjs'), VM_NODE_MODULES: join(checkoutRoot, 'node_modules'),
      VM_FETCH_MAP: join(scratch, 'fetch-map.json'), VM_FETCH_LOG: join(scratch, 'fetched.log'),
      NODE_OPTIONS: ['--preserve-symlinks', '--preserve-symlinks-main', preload('linux-host.mjs'), preload('install-fetch.mjs')].join(' ')},
    path: path => join(root, path),
    read: path => readFileSync(join(root, path), 'utf8'),
    calls: () => readFileSync(callsFile, 'utf8').split('\n').filter(Boolean),
    // the URLs the real `cua install` asked for
    fetched: () => readFileSync(join(scratch, 'fetched.log'), 'utf8').split('\n').filter(Boolean),
    log: () => readFileSync(join(root, 'var/log/cua-provision.log'), 'utf8'),
    head: () => git(join(root, 'opt/cua'), 'rev-parse', 'HEAD'),
    setConf(values) {
      const conf = {CUA_USER: USER, CUA_RELAY: 'wss://relay.example/ws', ...values};
      writeFileSync(join(root, 'etc/cua-provision.conf'), Object.entries(conf).map(([key, value]) => `${key}='${value}'\n`).join(''));
    },
    checkout(source, commit) {
      git(join(root, 'opt'), 'clone', '-q', source, 'cua');
      git(join(root, 'opt/cua'), 'checkout', '-q', '--detach', commit);
    },
    install(text) {
      writeFileSync(join(root, 'usr/local/sbin/cua-provision.sh'), remapScript(text, root));
      chmodSync(join(root, 'usr/local/sbin/cua-provision.sh'), 0o755);
    },
    // the installed provisioner, run as cloud-init or `ssh root@<vm> /usr/local/sbin/cua-provision.sh` runs it
    provision(env = {}) {
      return spawnSync('bash', [join(root, 'usr/local/sbin/cua-provision.sh')], {encoding: 'utf8', env: {...vm.env, ...env}, timeout: 120_000});
    },
    // deploy/cloud-vm/update.sh from the operator's checkout `operator`, to this VM
    update(operator, args = [], env = {}) {
      return spawnSync('bash', [join(operator, 'deploy/cloud-vm/update.sh'), 'root@203.0.113.7', ...args],
        {cwd: operator, encoding: 'utf8', env: {...vm.env, ...env}, timeout: 120_000});
    },
  };
  if (script !== undefined) vm.install(script);
  return vm;
}

// This checkout's provisioner, cua 0.30.0's (makeVm and repos remap it for the fake VM).
export const newProvisioner = () => readFileSync(join(deployDir, 'cua-provision.sh'), 'utf8');

// The fake VM's install fixture, from T4's (linux-install-archives.mjs): a copy of this checkout's runtime/ whose
// Linux pins (the module lock and its provenance, Node's, the helper's, the engine's, and the record's lock hash) name
// the fixture's bytes, and the fetch map install-fetch.mjs serves them from.
function installFixture(vm) {
  const archives = servedArchives(vm.t);
  const dir = join(vm.scratch, 'fixture-runtime'), served = join(vm.scratch, 'served');
  cpSync(join(checkoutRoot, 'runtime'), dir, {recursive: true});
  const json = value => JSON.stringify(value, null, 2) + '\n';
  // the module tree's registry, as servedArchives writes it, written over the checkout's own lock and provenance
  const registry = writeFixtureModules(join(dir, 'modules'));
  const record = JSON.parse(readFileSync(join(dir, 'linux-runtime.json'), 'utf8'));
  record.modules.lock = sha256(registry.lockText);
  writeFileSync(join(dir, 'linux-runtime.json'), json(record));
  // The pins' own URLs stay (their parsers hold them to the releases'); their hashes and lengths are the fixture's, and
  // the fixture's bytes are served at those URLs.
  mkdirSync(served);
  const map = {};
  const serve = (url, bytes) => { map[url] = join(served, sha256(bytes)); writeFileSync(map[url], bytes); };
  const pinFile = path => JSON.parse(readFileSync(join(dir, path), 'utf8'));
  const engine = pinFile('engine/linux-engine.json'), fixtureEngine = archives.enginePin.assets.x64;
  engine.assets.x64.sha256 = fixtureEngine.sha256;
  serve(engine.assets.x64.url, archives.serve[fixtureEngine.url]);
  const helper = pinFile('sandbox/linux-sandbox.json'), fixtureHelper = archives.helper.assets['linux-x64'];
  helper.assets['linux-x64'] = {...helper.assets['linux-x64'], length: fixtureHelper.length, sha256: fixtureHelper.sha256};
  serve(helper.assets['linux-x64'].url, archives.serve[fixtureHelper.url]);
  serve(archives.nodePin.archive.url, archives.serve[archives.nodePin.archive.url]);
  writeFileSync(join(dir, `releases/node/${NODE_VERSION}-linux-x64.json`), json(archives.nodePin));
  writeFileSync(join(dir, 'engine/linux-engine.json'), json(engine));
  writeFileSync(join(dir, 'sandbox/linux-sandbox.json'), json(helper));
  for (const [url, bytes] of registry.tarballs) serve(url, bytes);
  writeFileSync(join(vm.scratch, 'fetch-map.json'), JSON.stringify(map));
  return dir;
}

// The repositories of one test, for the VM `vm`: the operator's checkout (`operator`, branch main) and the VM's source,
// a bare repository (`origin`). Every commit has the rest of this checkout as links (src, bin, docs...) and its update.sh; its
// `runtime/` is the install fixture's (installFixture) unless it is one of the older shapes. Commits:
// - `older`: a checkout from before M6a (a Linux deb pin under runtime/releases/, no runtime/linux-runtime.json);
// - `m6a`: one of M6a's (the deb pin and runtime/linux-runtime.json both);
// - `norecord`: no deb pin, and no runtime/linux-runtime.json;
// - `c0`: the commit the VM's checkout is at before an update, with M6a's provisioner;
// - `c`: the commit an update provisions, whose provisioner is cua 0.30.0's; tagged `v-test`, an annotated tag;
// - `next`: a later commit, branch next, with the same provisioner.
// origin's main is `c` unless `push` says otherwise, and the tag is on origin with `c` alone.
export function repos(vm, {push = 'c'} = {}) {
  const operator = join(vm.scratch, 'operator'), origin = join(vm.scratch, 'origin.git');
  const runtime = installFixture(vm);
  mkdirSync(join(operator, 'deploy/cloud-vm'), {recursive: true});
  git(operator, 'init', '-q', '-b', 'main');
  copyFileSync(join(deployDir, 'update.sh'), join(operator, 'deploy/cloud-vm/update.sh'));
  // the rest of a checkout, as links: what the real CLI reads at its start (src, bin, docs, package.json...)
  for (const name of readdirSync(checkoutRoot)) {
    if (!name.startsWith('.') && !['runtime', 'deploy', 'node_modules'].includes(name)) symlinkSync(join(checkoutRoot, name), join(operator, name));
  }
  const shape = ({pin = false, record = true}) => {
    rmSync(join(operator, 'runtime'), {recursive: true, force: true});
    cpSync(runtime, join(operator, 'runtime'), {recursive: true});
    if (pin) writeFileSync(join(operator, 'runtime/releases/26.928.40906-linux-x64.json'), '{}\n');
    if (!record) rmSync(join(operator, 'runtime/linux-runtime.json'));
  };
  const provisioner = text => writeFileSync(join(operator, 'deploy/cloud-vm/cua-provision.sh'), remapScript(text, vm.root));
  const commit = message => { git(operator, 'add', '-A'); git(operator, 'commit', '-q', '-m', message); return git(operator, 'rev-parse', 'HEAD'); };
  provisioner(readFileSync(join(fixtures, 'cua-provision-cb9973e82.sh'), 'utf8'));
  shape({pin: true, record: false});
  const older = commit('a checkout from before M6a');
  shape({pin: true});
  const m6a = commit('a checkout of M6a\'s');
  shape({record: false});
  const norecord = commit('a checkout with no Linux record');
  shape({});
  const c0 = commit('the VM\'s commit before the update');
  provisioner(newProvisioner());
  const c = commit('the commit the update provisions');
  git(operator, 'tag', '-a', '-m', 'an annotated tag', 'v-test');
  git(operator, 'checkout', '-q', '-b', 'next');
  writeFileSync(join(operator, 'NEXT'), 'a later change\n');
  const next = commit('a later commit with the same provisioner');
  git(operator, 'checkout', '-q', 'main');
  git(vm.scratch, 'init', '-q', '--bare', '-b', 'main', origin);
  const ids = {older, m6a, norecord, c0, c, next};
  git(operator, 'push', '-q', origin, `${ids[push]}:refs/heads/main`, ...push === 'c' ? ['refs/tags/v-test'] : []);
  return {operator, origin, ...ids};
}

// A git bundle of `commit` from the operator's checkout, as `git bundle create cua.bundle <branch>` makes one.
export function bundleOf(operator, commit, file) {
  git(operator, 'branch', '-f', 'bundled', commit);
  git(operator, 'bundle', 'create', '-q', file, 'bundled');
  git(operator, 'branch', '-D', 'bundled');
}

// `file`, a bundle, cut short: its header (and so its heads) whole, its pack not.
export function truncateBundle(file) {
  const bytes = readFileSync(file);
  const header = bytes.indexOf('\n\n') + 2;
  writeFileSync(file, bytes.subarray(0, header + 40));
}
