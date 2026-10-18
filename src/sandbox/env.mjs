// The environment a sandboxed child gets (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "macOS: the
// seatbelt port"): the parent's, minus the names the original never lets a model-reachable child inherit (compared
// case-insensitively, as the original does), plus the markers the original's `codex sandbox` adds, which vendor code
// may read.
//
// Ported from openai/codex@ff6aec96948b70d94983af2641a6b67c94faeff5 (tag rust-v0.159.2, Apache-2.0; ./LICENSE, ./NOTICE):
//   codex-rs/protocol/src/shell_environment.rs:14-27 (the non-inheritable names, compared ignoring ASCII case)
//   codex-rs/cli/src/debug_sandbox.rs:623-629 (CODEX_SANDBOX=seatbelt, CODEX_SANDBOX_NETWORK_DISABLED=1)
// Deviation: CODEX_GUARDIAN_DECISIONS_API_KEY is stripped too (upstream 9552906b2b, after the tag).

export const STRIPPED_ENV = ['CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN', 'NODE_REPL_AUTH_TOKEN', 'OPENAI_FEDERATION_RULE_ID', 'OPENAI_IDENTITY_TOKEN_FILE',
  'OPENAI_WORKLOAD_IDENTITY_CONTEXT', 'CODEX_GUARDIAN_DECISIONS_API_KEY'];
const STRIPPED = new Set(STRIPPED_ENV.map(name => name.toUpperCase()));

// `env` (name -> string) for a child sandboxed on `platform` with `network` ('restricted' | 'enabled'). The seatbelt
// marker is macOS's only; the network flag is set whenever the network is restricted.
export function sandboxedEnv(env, {platform, network}) {
  const out = {};
  for (const [name, value] of Object.entries(env)) if (typeof value === 'string' && !STRIPPED.has(name.toUpperCase())) out[name] = value;
  if (platform === 'darwin') out.CODEX_SANDBOX = 'seatbelt';
  if (network !== 'enabled') out.CODEX_SANDBOX_NETWORK_DISABLED = '1';
  return out;
}
