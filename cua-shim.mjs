#!/usr/bin/env node
// The Claude Code plugin's server entry, kept under its original name: it runs `cua serve` and nothing else. The
// server, its runtime resolution and its settings live in src/mcp/server.mjs; see the README for configuration. The
// earlier desktop-recipe launcher (reading ChatGPT.app's plugin cache, CUA_SHIM_PLUGIN_MCP) is gone: the runtime comes
// from `cua install` under CUA_HOME.
import {main} from './src/cli.mjs';

process.exitCode = await main(['serve']);
