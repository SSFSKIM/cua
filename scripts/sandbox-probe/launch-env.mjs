// #115 M2's opening probe (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Plan of Work M2 "First step"): the
// compat executable finds its session's settings file from the TMPDIR and CODEX_HOME that reach `$CODEX_CLI_PATH
// sandbox`, and node_repl hands the kernel's launcher a filtered environment. This judges, from one experiment.mjs run,
// whether each child's launcher call carried both values exactly as buildLaunch set them.
//
// `launches`: what serve-slot.mjs recorded per launch ({cwd, sessionTmp, TMPDIR, CODEX_HOME}); `invocations`: what
// cli-slot.mjs recorded per call ({sub, cwd, command, envValues: {TMPDIR?, CODEX_HOME?}}). A launcher call belongs to
// the launch whose run directory it ran in (node_repl runs its children there). Per value: `equal`, `absent` or
// `rewritten`; a role's verdict is its worst call's.

// The role the compat executable would give `command` ([node, ...options, script, ...args]): the script's basename,
// `trusted-worker.js` the worker and anything else the kernel.
export function roleOfCommand(command) {
  const script = command.slice(1).find(arg => !arg.startsWith('-'));
  return script?.split('/').at(-1) === 'trusted-worker.js' ? 'worker' : 'kernel';
}

const NAMES = ['TMPDIR', 'CODEX_HOME'];
const RANK = {equal: 0, rewritten: 1, absent: 2};

export function launchEnvVerdict({launches, invocations}) {
  const roles = {kernel: null, worker: null};
  let unmatched = 0;
  for (const call of invocations.filter(c => c.sub === 'sandbox')) {
    const launch = launches.find(l => l.cwd === call.cwd);
    if (!launch) { unmatched++; continue; }
    const role = roleOfCommand(call.command ?? []);
    const seen = roles[role] ??= {TMPDIR: 'equal', CODEX_HOME: 'equal', calls: 0};
    seen.calls++;
    for (const name of NAMES) {
      const value = call.envValues?.[name];
      const status = value === undefined ? 'absent' : value === launch[name] ? 'equal' : 'rewritten';
      if (RANK[status] > RANK[seen[name]]) seen[name] = status;
    }
  }
  const good = r => r !== null && NAMES.every(name => r[name] === 'equal');
  return {ok: unmatched === 0 && good(roles.kernel) && good(roles.worker), roles, unmatched};
}
