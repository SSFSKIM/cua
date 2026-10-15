import services from './services.mjs';
import cells from './cells.mjs';
import boundaries from './boundaries.mjs';
import secrets from './secrets.mjs';
import {validateRegistry} from '../../../scripts/repl-parity/registry.mjs';
export default validateRegistry([...cells,...boundaries,...secrets,...services]);
