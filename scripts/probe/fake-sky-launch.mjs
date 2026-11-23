import {dirname} from 'node:path';

// The controlled target replaces only sky's delegate; all production service/sandbox settings remain intact.
export function fakeSkyLaunch(launch, target) {
  const key = launch.replHost?.host === 'cua' ? 'CUA_REPL_TRUSTED_CODE_PATHS' : 'NODE_REPL_TRUSTED_CODE_PATHS';
  return {...launch, env: {...launch.env, CUA_SKY_SERVICE: target,
    [key]: `${launch.env[key]}:${dirname(target)}`}};
}
