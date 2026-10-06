// Loaded with `node --import`: makes the `ws` package unresolvable, as in a checkout (or the plugin copy) that has no
// node_modules, so a test can show which paths never load it.
import {register} from 'node:module';

register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier, context, next) {
  if (specifier === 'ws' || specifier.startsWith('ws/'))
    throw Object.assign(new Error("Cannot find package 'ws' (hidden by test/fixtures/without-ws.mjs)"), {code: 'ERR_MODULE_NOT_FOUND'});
  return next(specifier, context);
}`)}`);
