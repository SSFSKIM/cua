import cells from './cells.mjs';
import secrets from './secrets.mjs';
import {validateRegistry} from '../../../scripts/repl-parity/registry.mjs';
export default validateRegistry([...cells,...secrets]);
