#!/usr/bin/env node
// The `cua` command; see src/cli.mjs.
import {main} from '../src/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
