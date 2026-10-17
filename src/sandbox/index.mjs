// What a host asks for one sandboxed child (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "The own
// host launches through it directly"): the role's profile (./policy.mjs) rendered for the OS, with the child's
// environment (./env.mjs), ready to spawn. On macOS that is /usr/bin/sandbox-exec, which applies the profile and execs
// the command, so the child process is the command itself. Linux renders through the pinned helper from #115 M3; until
// then the own host on Linux keeps the Codex CLI (src/runtime/sandbox.mjs sandboxArgs).
import {fail} from '../runtime/errors.mjs';
import {prepareDenyTargets, roleProfile, stateKey} from './policy.mjs';
import {seatbeltCommand} from './seatbelt.mjs';
import {sandboxedEnv} from './env.mjs';

// -> {command, args, env, cwd}. `state`: the call's sandbox state (undefined: the default mode); `role`: 'kernel' |
// 'worker'; `command`: [file, ...args]; `env`: the child's environment before the sandbox's own rule; `cwd`: where it
// runs when the state names no sandbox cwd; `denyRead`: the launch's deny list (CUA_SANDBOX_DENY_READ), whose missing
// targets are created before the kernel's profile is rendered; `network`: the worker's. Disabled runs the command as
// it is. Throws SandboxStateError (a state or deny target that cannot be rendered) or CuaError (no renderer here).
export function sandboxedLaunch({platform, state, role, command, env, cwd, readPaths, denyRead, network = 'restricted', fs}) {
  if (stateKey({state, readPaths}) === 'disabled') return {command: command[0], args: command.slice(1), env: {...env}, cwd};
  const prepared = role === 'kernel' && denyRead ? prepareDenyTargets(denyRead) : denyRead;
  const rendered = roleProfile({state, role, readPaths, denyRead: prepared, network});
  const launchCwd = rendered.cwd ?? cwd;
  if (platform !== 'darwin') fail('sandbox_unavailable', `cua renders its own sandbox on macOS only until #115 M3; ${platform} launches through the Codex CLI`);
  const {file, args} = seatbeltCommand({profile: rendered.profile, cwd: launchCwd, command, tmpdir: env.TMPDIR, ...(fs ? {fs} : {})});
  return {command: file, args, env: sandboxedEnv(env, {platform, network: rendered.profile.network}), cwd: launchCwd};
}
