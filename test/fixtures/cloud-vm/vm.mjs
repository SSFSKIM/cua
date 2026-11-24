// A fake cloud VM for deploy/cloud-vm's tests (test/deploy-cloud-vm.test.mjs): a whole provisioner, old or new, runs
// here as the VM runs it, and update.sh drives it over a stubbed ssh and scp. Nothing touches a real VM.
//
// - The VM's file system is a scratch root: each script's VM paths move under it (remap.mjs), and update.sh's remote
//   commands and copies are remapped the same way by the ssh and scp stubs. The VM's desktop user is this test's user.
// - Packages, systemd, the user's account and the desktop are stubs that record their calls (`calls()`); `cua` is a stub
//   that answers as cua 0.30.0's CLI does for the provisioner (its install's JSON, doctor's, the relay's), and `sleep`
//   returns at once and is recorded, so a wait shows as its sleeps.
// - git is real. The VM's source is a real bare repository or a real bundle, and the checkouts are real clones of
//   `repos()`: commits whose `src` and `runtime` are links to this checkout's own, so a checkout's manifest.mjs is the
//   real one, and whose deploy/cloud-vm/cua-provision.sh is the provisioner as the fake VM runs it.
// - node processes on the VM see a Linux host (linux-host.mjs).
import {spawnSync} from 'node:child_process';
import {chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {remapScript} from './remap.mjs';

const fixtures = fileURLToPath(new URL('./', import.meta.url));
const checkoutRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const deployDir = join(checkoutRoot, 'deploy', 'cloud-vm');
export const USER = 'cua';
export const UID = '4242';
// cua 0.30.0's `cua install --json` on a home that needs nothing: no `vendor` key (#171 M6b, the pre-flight's §3.3).
export const INSTALL_JSON = {ok: true, release: 'cua-linux-x64-e0.4.5-n24.22.0-s0.163.0-mb71dc1f8185d', changed: false,
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
  // runuser -u <user> -- [env -i [-C <dir>] [VAR=value]...] <command>: the command as this test's user, in that directory
  // and with those variables, but on the test's PATH, so the stubs answer.
  runuser: `[[ $1 == -u ]] && shift 2
[[ $1 == -- ]] && shift
if [[ $1 == env ]]; then
  shift
  [[ $1 == -i ]] && shift
  if [[ $1 == -C ]]; then cd "$2" || exit 125; shift 2; fi
  while [[ $1 == *=* ]]; do [[ $1 == PATH=* ]] || export "$1"; shift; done
fi
exec "$@"`,
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
  npm: 'log',
  // cua 0.30.0's CLI as the provisioner meets it
  cua: `log
case "$1 \${2:-}" in
  "install "*) printf '%s\\n' "$VM_INSTALL_JSON"; exit "\${VM_INSTALL_EXIT:-0}" ;;
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
  // it. VM_SSH_HOOK runs once, before the first command (a ref that moves meanwhile); VM_PROVISION_OVERRIDE runs in
  // place of the provisioner (a run that ends elsewhere).
  ssh: `while (($#)); do case $1 in -o|-i|-p|-F|-l) shift 2 ;; -*) shift ;; *) break ;; esac; done
shift
cmd="$*"
printf 'ssh %s\\n' "$cmd" >>"$VM_CALLS"
if [[ -n \${VM_SSH_HOOK:-} && ! -e $VM_ROOT/.ssh-hook-ran ]]; then : >"$VM_ROOT/.ssh-hook-ran"; bash -c "$VM_SSH_HOOK" || exit 1; fi
if [[ $cmd == /usr/local/sbin/cua-provision.sh && -n \${VM_PROVISION_OVERRIDE:-} ]]; then exec bash -c "$VM_PROVISION_OVERRIDE"; fi
exec bash -c "$(printf '%s' "$cmd" | node "$VM_REMAP" "$VM_ROOT")"`,
  // scp [options] <file> <target>:<path>: a copy to the remapped path. VM_SCP_HOOK then runs with that path (a copy
  // that arrives changed).
  scp: `while (($#)); do case $1 in -o|-i|-P|-F) shift 2 ;; -*) shift ;; *) break ;; esac; done
printf 'scp %s %s\\n' "$1" "\${2#*:}" >>"$VM_CALLS"
dest="$(printf '%s' "\${2#*:}" | node "$VM_REMAP" "$VM_ROOT")"
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
  writeFileSync(join(home, '.local/share/cua/chrome/b/h.sock'), '');
  const bus = createServer();
  await new Promise((resolve, reject) => { bus.once('error', reject); bus.listen(join(root, 'run/user', UID, 'bus'), resolve); });
  t.after(() => { bus.close(); rmSync(scratch, {recursive: true, force: true}); });
  mkdirSync(bin);
  writeFileSync(callsFile, '');
  for (const [name, body] of Object.entries(STUBS)) {
    const logged = body.replace(/^log$/m, `printf '%s %s\\n' ${name} "$*" >>"$VM_CALLS"`);
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${logged}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const vm = {
    scratch, root, home, bin,
    env: {...process.env, ...gitEnv, PATH: `${bin}:${process.env.PATH}`, VM_ROOT: root, VM_CALLS: callsFile, VM_REMAP: join(fixtures, 'remap-cli.mjs'),
      VM_INSTALL_JSON: JSON.stringify(INSTALL_JSON), NODE_OPTIONS: `--import=${pathToFileURL(join(fixtures, 'linux-host.mjs'))}`},
    path: path => join(root, path),
    read: path => readFileSync(join(root, path), 'utf8'),
    calls: () => readFileSync(callsFile, 'utf8').split('\n').filter(Boolean),
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

// The repositories of one test, for the VM `vm`: the operator's checkout (`operator`, branch main) and the VM's source,
// a bare repository (`origin`). Commits, each with this checkout's `src` and `runtime` (links) and its update.sh:
// - `older`: a checkout before 0.30.0 (a Linux deb pin under runtime/releases/, no runtime/linux-runtime.json);
// - `c0`: the commit the VM's checkout is at before an update, with another provisioner;
// - `c`: the commit an update provisions, whose provisioner is cua 0.30.0's;
// - `next`: a later commit, branch next, with the same provisioner.
// origin's main is `c` unless `push` says otherwise.
export function repos(vm, {push = 'c'} = {}) {
  const operator = join(vm.scratch, 'operator'), origin = join(vm.scratch, 'origin.git');
  mkdirSync(join(operator, 'deploy/cloud-vm'), {recursive: true});
  git(operator, 'init', '-q', '-b', 'main');
  copyFileSync(join(deployDir, 'update.sh'), join(operator, 'deploy/cloud-vm/update.sh'));
  const provisioner = text => writeFileSync(join(operator, 'deploy/cloud-vm/cua-provision.sh'), remapScript(text, vm.root));
  const commit = message => { git(operator, 'add', '-A'); git(operator, 'commit', '-q', '-m', message); return git(operator, 'rev-parse', 'HEAD'); };
  mkdirSync(join(operator, 'runtime/releases'), {recursive: true});
  writeFileSync(join(operator, 'runtime/releases/26.928.40906-linux-x64.json'), '{}\n');
  provisioner(readFileSync(join(fixtures, 'cua-provision-cb9973e82.sh'), 'utf8'));
  const older = commit('a checkout before cua 0.30.0');
  rmSync(join(operator, 'runtime'), {recursive: true});
  symlinkSync(join(checkoutRoot, 'src'), join(operator, 'src'));
  symlinkSync(join(checkoutRoot, 'runtime'), join(operator, 'runtime'));
  const c0 = commit('the VM\'s commit before the update');
  provisioner(newProvisioner());
  const c = commit('the commit the update provisions');
  git(operator, 'checkout', '-q', '-b', 'next');
  writeFileSync(join(operator, 'NEXT'), 'a later change\n');
  const next = commit('a later commit with the same provisioner');
  git(operator, 'checkout', '-q', 'main');
  git(vm.scratch, 'init', '-q', '--bare', '-b', 'main', origin);
  const ids = {older, c0, c, next};
  git(operator, 'push', '-q', origin, `${ids[push]}:refs/heads/main`);
  return {operator, origin, ...ids};
}

// A git bundle of `commit` from the operator's checkout, as `git bundle create cua.bundle <branch>` makes one.
export function bundleOf(operator, commit, file) {
  git(operator, 'branch', '-f', 'bundled', commit);
  git(operator, 'bundle', 'create', '-q', file, 'bundled');
  git(operator, 'branch', '-D', 'bundled');
}
