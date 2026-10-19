// The production trusted sky wrapper as the Linux route runs it, for a test machine that is not Linux: src/services/sky.mjs
// createSkyService with the store the launch names (secretsFromEnv, as skyServiceFromEnv reads it) and the vendor module
// in CUA_SKY_SERVICE, with only its platform pinned to linux, whose request shapes it then enforces. On Linux the
// tests register the production module (SKY_SERVICE) itself.
import {pathToFileURL} from 'node:url';
import {createSkyService} from '../../src/services/sky.mjs';
import {secretsFromEnv} from '../../src/services/secret-input.mjs';

const service = createSkyService({platform: 'linux', loadVendor: () => import(pathToFileURL(process.env.CUA_SKY_SERVICE).href), ...secretsFromEnv(process.env)});
export const handleRpc = request => service.handleRpc(request);
