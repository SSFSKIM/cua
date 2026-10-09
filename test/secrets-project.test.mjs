// The secret store's project tier (issue #99): the slug a project's directory is named by, which project a working
// directory belongs to (real git repositories and worktrees in temporary directories), the two tiers read as one, the
// connection's directories, the launch variable that carries the project's to the trusted worker and the services'
// reader built from it, and doctor's project row. Every store lives under a temporary $HOME.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connectionSecrets, fileStore, projectSlug, projectStoreDir, storeDir, tieredStore} from '../src/secrets/store.mjs';
import {projectRoot, rootFromGit, rootFromRevParse} from '../src/secrets/project.mjs';
import {isLabel} from '../src/secrets/label.mjs';
import {REPO} from './fixtures/runtime-fixture.mjs';
import {classifyStore, inspectSecretStore} from '../src/secrets/check.mjs';
import {secretsFromEnv} from '../src/services/secret-input.mjs';

const temp = (t, prefix) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
};
const put = (dir, key, content, mode = 0o600) => {
  mkdirSync(dir, {recursive: true, mode: 0o700});
  writeFileSync(join(dir, key), content, {mode});
  chmodSync(join(dir, key), mode);
};

test('a project is named as Claude Code names its folder under ~/.claude/projects/', () => {
  assert.equal(projectSlug('/Users/new/Developer/GitHub/MAWS'), '-Users-new-Developer-GitHub-MAWS');
  assert.equal(projectSlug('/private/tmp/fold-smoke/.claude/worktrees/72-api-architect'), '-private-tmp-fold-smoke--claude-worktrees-72-api-architect');
  // Past 200 characters: the first 200 and a base-36 hash of the whole path (the mod's tests hold the same value).
  const long = projectSlug(`/Users/new/${'a'.repeat(120)}/${'b'.repeat(100)}`);
  assert.equal(long.length, 207);
  assert.equal(long.slice(195), 'bbbbb-iqtzp2');
  assert.equal(projectStoreDir('/Users/u/repo', {HOME: '/Users/u'}), '/Users/u/.config/claude-secrets/projects/-Users-u-repo');
});

test('a project is the main checkout of the repository around the directory, for its worktrees too, else the directory', t => {
  const root = temp(t, 'cua-project-');
  const repo = join(root, 'repo');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {cwd, stdio: 'ignore'});
  mkdirSync(join(repo, 'sub'), {recursive: true});
  git(repo, 'init', '-q');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'first');
  git(repo, 'worktree', 'add', '-q', join(root, 'repo-wt'));
  assert.equal(projectRoot(repo), repo);
  assert.equal(projectRoot(join(repo, 'sub')), repo);
  assert.equal(projectRoot(join(root, 'repo-wt')), repo, 'a worktree shares its main checkout\'s secrets');
  const plain = join(root, 'plain');
  mkdirSync(plain);
  assert.equal(projectRoot(plain), plain);
  assert.equal(rootFromGit('/work/super/.git/modules/sub', '/work/super/sub'), '/work/super/sub', 'a submodule is its own project');
});

test('the tiers read as one: the project\'s key first, the global one when the project has none, a refusal never falling through', async t => {
  const home = temp(t, 'cua-tiers-');
  const globalDir = storeDir({HOME: home});
  const projectDir = projectStoreDir('/work/repo', {HOME: home});
  put(globalDir, 'SHARED', 'global-value');
  put(globalDir, 'GLOBAL_ONLY', 'global-only');
  put(globalDir, 'BROKEN', 'global-fallback');
  put(projectDir, 'SHARED', 'project-value');
  put(projectDir, 'BROKEN', 'loose', 0o644);
  const store = tieredStore({project: fileStore({dir: projectDir}), global: fileStore({dir: globalDir})});
  assert.equal(await store.read('SHARED'), 'project-value');
  assert.equal(await store.read('GLOBAL_ONLY'), 'global-only');
  await assert.rejects(store.read('BROKEN'), error => error.code === 'insecure_mode' && error.message.includes(projectDir) && !error.message.includes('global-fallback'));
  await assert.rejects(store.read('MISSING'), {code: 'not_found'});
  assert.deepEqual(await store.list(), ['BROKEN', 'GLOBAL_ONLY', 'SHARED']);
  // The global listing leaves the projects/ folder out: it is a directory, not a key.
  assert.deepEqual(await fileStore({dir: globalDir}).list(), ['BROKEN', 'GLOBAL_ONLY', 'SHARED']);
});

test('a connection with a project has both directories and lists both tiers; without one (the HTTP agent) only the global', async t => {
  const home = temp(t, 'cua-conn-');
  put(storeDir({HOME: home}), 'GLOBAL_KEY', 'g');
  put(projectStoreDir('/work/repo', {HOME: home}), 'PROJECT_KEY', 'p');
  put(projectStoreDir('/work/repo', {HOME: home}), 'CUA_DEVICE_x', 'p');
  const withProject = connectionSecrets({enabled: true, env: {HOME: home}, project: '/work/repo'});
  assert.equal(withProject.dir, storeDir({HOME: home}));
  assert.equal(withProject.projectDir, projectStoreDir('/work/repo', {HOME: home}));
  assert.deepEqual(await withProject.list(), ['GLOBAL_KEY', 'PROJECT_KEY']);
  const agent = connectionSecrets({enabled: true, env: {HOME: home}});
  assert.equal(agent.projectDir, undefined);
  assert.deepEqual(await agent.list(), ['GLOBAL_KEY']);
});

test('the trusted services read the project\'s directory first when the launch names one', async t => {
  const home = temp(t, 'cua-env-');
  const globalDir = storeDir({HOME: home});
  const projectDir = projectStoreDir('/work/repo', {HOME: home});
  put(globalDir, 'KEY', 'global-value');
  put(projectDir, 'KEY', 'project-value');
  assert.equal(await secretsFromEnv({CUA_SECRETS_DIR: globalDir, CUA_SECRETS_PROJECT_DIR: projectDir}).secrets.read('KEY'), 'project-value');
  assert.equal(await secretsFromEnv({CUA_SECRETS_DIR: globalDir}).secrets.read('KEY'), 'global-value');
  assert.equal(await secretsFromEnv({CUA_SECRETS_DIR: globalDir, CUA_SECRETS_PROJECT_DIR: 'relative'}).secrets.read('KEY'), 'global-value');
  assert.equal(secretsFromEnv({CUA_SECRETS_PROJECT_DIR: projectDir}).secretsUnavailable, 'secrets_not_configured');
});

test('doctor reports the project tier of the working directory beside the global store', t => {
  const home = temp(t, 'cua-doctor-');
  const cwd = temp(t, 'cua-doctor-cwd-');
  const none = inspectSecretStore({env: {HOME: home}, cwd});
  assert.equal(none.project.root, cwd);
  const absent = classifyStore(none.project, {project: none.project.root});
  assert.equal(absent.name, 'secrets.project');
  assert.equal(absent.status, 'skip');
  assert.match(absent.detail, new RegExp(`no project secrets for ${cwd}`));
  put(projectStoreDir(cwd, {HOME: home}), 'K', 'v');
  const stored = inspectSecretStore({env: {HOME: home}, cwd});
  const row = classifyStore(stored.project, {project: stored.project.root});
  assert.equal(row.status, 'pass');
  assert.match(row.detail, /^1 secret in .*projects\/.* for /);
  put(projectStoreDir(cwd, {HOME: home}), 'LOOSE', 'v', 0o644);
  assert.equal(classifyStore(inspectSecretStore({env: {HOME: home}, cwd}).project, {project: cwd}).status, 'fail');
  assert.equal(classifyStore(stored.project, {project: cwd, enabled: false}).status, 'skip');
});

test('"projects", in any case, is never a key: the label rule, the store\'s write and the CLI refuse it', async t => {
  for (const key of ['projects', 'PROJECTS', 'Projects']) assert.equal(isLabel(key), false, key);
  assert.equal(isLabel('projects_key'), true);
  const home = temp(t, 'cua-label-');
  await assert.rejects(fileStore({dir: storeDir({HOME: home})}).write('Projects', 'v'), {code: 'invalid_label'});
  const cli = spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'secrets', 'set', 'projects'],
    {cwd: home, env: {...process.env, HOME: home, CUA_HOME: join(home, 'cua-home')}, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe']});
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /not "projects"/);
});

test('a git older than 2.31 echoes --path-format=absolute back, and the directory itself stands as the project', () => {
  assert.equal(rootFromRevParse('--path-format=absolute\n.git\n/work/repo\n', '/work/repo/sub'), '/work/repo/sub');
  assert.equal(rootFromRevParse('.git\n/work/repo\n', '/work/repo/sub'), '/work/repo/sub');
  assert.equal(rootFromRevParse('/work/repo/.git\n/work/repo-wt\n', '/work/repo-wt'), '/work/repo');
});
