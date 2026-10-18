// The recovered `codex sandbox` launch template (docs/doperpowers/research/2026-10-14-own-repl-host/
// node-repl-embedded-INDEX.md "Default timeout and launch templates"), rendered as the pinned node_repl renders it (its
// live kernel command lines, observed 2026-10-14):
//   codex sandbox -c shell_environment_policy.inherit="all" -c default_permissions="node_repl"
//     -c permissions.node_repl={filesystem = {"<read path>" = "read", ..., ":root" = "read", ...}, network = {enabled = false}}
//     -- <node> --experimental-vm-modules <script> <args>...
// cua's own host launched its Linux children this way until #115 M3; since then nothing in cua renders it. It stays here
// as the oracle of what node_repl hands its launcher: the macOS vendor host's compat executable parses exactly this
// (src/sandbox/codex-compat.mjs), and M0's probes (the argv capture, the tz probe's `codex` launcher) ran the signed CLI
// with it. `policy` is src/sandbox/policy.mjs policyTable's result for the call's state.
const tomlString = value => JSON.stringify(value);
const tomlValue = value => (typeof value === 'string' ? tomlString(value)
  : `{${Object.entries(value).map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`).join(', ')}}`);

// The launcher argv for `command` ([executable, ...args]) under a non-disabled `policy`.
export function sandboxArgs(policy, command) {
  const filesystem = policy.filesystem.map(([key, access]) => `${tomlString(key)} = ${tomlValue(access)}`).join(', ');
  return ['sandbox', '-c', 'shell_environment_policy.inherit="all"', '-c', 'default_permissions="node_repl"',
    '-c', `permissions.node_repl={filesystem = {${filesystem}}, network = {enabled = false}}`, '--', ...command];
}
