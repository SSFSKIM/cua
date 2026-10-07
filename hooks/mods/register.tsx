import type { On } from 'claude-code'

import { registerSecrets } from './secrets'

/**
 * The plugin's one hooks module. The engine loads it only where function
 * hooks are enabled (CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1); elsewhere the
 * plugin is its MCP server alone.
 */
export function register(on: On) {
  registerSecrets(on)
}
