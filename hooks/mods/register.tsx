import type { On } from 'claude-code'

import { registerSecrets as registerGuard } from './guard/secrets'
import { registerSecrets } from './secrets'

/**
 * The plugin's one hooks module. The engine loads it only where function
 * hooks are enabled (CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1); the shell hook
 * beside this folder (cua-approve.sh) runs everywhere. `/secret` is cua's
 * own; the secrets guard is devcloud's, vendored (./guard), and stands down
 * while devcloud's plugin is loaded (./one-guard.tsx).
 */
export function register(on: On) {
  registerSecrets(on)
  registerGuard(on)
}
