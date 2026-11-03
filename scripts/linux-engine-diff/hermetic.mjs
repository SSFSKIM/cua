// A test run of the harness's modules (`node --test`, which marks each test process with NODE_TEST_CONTEXT) reaches no
// real X display, whatever DISPLAY its shell has: on import DISPLAY becomes a name that is no display, so every X
// tool a test runs by mistake fails at once instead of connecting (task 41: a hermetic test once reached the person's
// frozen `:0`). A test that needs a display serves a fake one of its own and names it explicitly. The modules with X
// entry points (xtools.mjs, audit.mjs) import this first.

/** The DISPLAY of a test process: no X library parses it as a display. */
export const TEST_DISPLAY = ':cua171-tests-reach-no-display';

/** Whether this process is a `node --test` test. */
export const inTest = (env = process.env) => Boolean(env.NODE_TEST_CONTEXT);

if (inTest()) process.env.DISPLAY = TEST_DISPLAY;
