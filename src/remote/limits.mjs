// The agent's limits, from its environment: read by `agent run`, which applies them, and by `agent install`, which
// carries them into the launchd job or systemd unit, so both refuse the same values (invalid_setting).
//   CUA_AGENT_MAX_SESSIONS   default 1: every session drives the same mouse, keyboard and Chrome
//   CUA_AGENT_IDLE_MINUTES   default 15
//   CUA_AGENT_ALLOWED_ORIGINS  browser origins allowed to call, comma-separated; none by default
// CUA_AGENT_CONSOLE_CHECK, the fourth agent setting, is read by src/remote/console.mjs.
import {fail} from '../runtime/errors.mjs';

export const AGENT_SETTINGS = ['CUA_AGENT_MAX_SESSIONS', 'CUA_AGENT_IDLE_MINUTES', 'CUA_AGENT_ALLOWED_ORIGINS', 'CUA_AGENT_CONSOLE_CHECK'];

export function limitsFrom(env) {
  const max = env.CUA_AGENT_MAX_SESSIONS ?? '1';
  if (!/^[1-9]\d{0,3}$/.test(max)) fail('invalid_setting', 'CUA_AGENT_MAX_SESSIONS must be a whole number of sessions, at least 1');
  const idle = env.CUA_AGENT_IDLE_MINUTES ?? '15';
  if (!/^\d+(\.\d+)?$/.test(idle) || !(Number(idle) > 0)) fail('invalid_setting', 'CUA_AGENT_IDLE_MINUTES must be a positive number of minutes');
  const allowedOrigins = (env.CUA_AGENT_ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
  return {maxSessions: Number(max), idleMs: Math.round(Number(idle) * 60_000), allowedOrigins};
}
