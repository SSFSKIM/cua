// What a host asks for one sandboxed child (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "The own
// host launches through it directly"): the role's profile (./policy.mjs) rendered for the OS, with the child's
// environment (./env.mjs), ready to spawn. On macOS that is /usr/bin/sandbox-exec, which applies the profile and execs
// the command, so the child process is the command itself. On Linux it is the pinned helper (./linux.mjs), checked
// against its pin before every launch, which runs the command inside bubblewrap and seccomp.
import {prepareDenyTargets, roleProfile, stateKey} from './policy.mjs';
import {seatbeltCommand} from './seatbelt.mjs';
import {linuxCommand, verifyHelper} from './linux.mjs';
import {sandboxedEnv} from './env.mjs';

// -> {command, args, env, cwd}. `state`: the call's sandbox state (undefined: the default mode); `role`: 'kernel' |
// 'worker'; `command`: [file, ...args]; `env`: the child's environment before the sandbox's own rule; `cwd`: where it
// runs when the state names no sandbox cwd; `denyRead`: the launch's deny list (CUA_SANDBOX_DENY_READ), whose missing
// targets are dealt with by platform before the kernel's profile is rendered (policy.mjs prepareDenyTargets); `network`:
// the worker's; `helper`: on Linux, the pinned helper ({path, sha256}, ./linux.mjs helperFor), whose bytes are checked
// here. Disabled runs the command as it is. Throws SandboxStateError (a state or deny target that cannot be rendered) or
// CuaError (sandbox_unavailable: a Linux helper that is missing or not the pinned one).
export function sandboxedLaunch({platform, state, role, command, env, cwd, readPaths, denyRead, network = 'restricted', helper, fs}) {
  if (stateKey({state, readPaths}) === 'disabled') return {command: command[0], args: command.slice(1), env: {...env}, cwd};
  const checked = platform === 'linux' ? verifyHelper(helper) : null;
  const prepared = role === 'kernel' && denyRead ? prepareDenyTargets(denyRead, {platform, home: env.HOME}) : denyRead;
  const rendered = roleProfile({state, role, readPaths, denyRead: prepared, network});
  const launchCwd = rendered.cwd ?? cwd;
  const childEnv = sandboxedEnv(env, {platform, network: rendered.profile.network});
  if (platform === 'linux') {
    const {file, args} = linuxCommand({profile: rendered.profile, cwd: launchCwd, command, helper: checked});
    return {command: file, args, env: childEnv, cwd: launchCwd};
  }
  const {file, args} = seatbeltCommand({profile: rendered.profile, cwd: launchCwd, command, tmpdir: env.TMPDIR, metadataGrants: role === 'kernel' ? prepared?.metadataOnly ?? [] : [], ...(fs ? {fs} : {})});
  return {command: file, args, env: childEnv, cwd: launchCwd};
}
