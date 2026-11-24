#!/usr/bin/env node
// One shard of `npm test`, for CI: `node scripts/test-shard.mjs <index>/<total>` runs `node --test` on every
// <total>-th file of the files `npm test` runs, from the <index>-th on. The `npm test` suite takes 11 to 14 minutes on
// GitHub's slower hosted macOS machines (2026-11-24, 16 runs), so ci-kit's test-1 and test-2 gates run it as two jobs.
//
// The files are read from package.json's own `test` script, the plain `node --test "<pattern>"` form that
// scripts/repl-parity/coverage.mjs reads too, so the shards together run what `npm test` runs and nothing else; sorted
// by path, so every shard of one checkout sees the same list. A shard that selects no file exits 2: an empty
// `node --test` passes, and a gate must not.

import { spawnSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The pattern of `npm test`, or undefined when the script is not `node --test "<pattern>"`.
export function npmTestPattern(root) {
  const script = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts?.test;
  return /^node --test ["']?([^"'\s]+)["']?$/.exec(script ?? '')?.[1];
}

// The files `npm test` runs in the checkout at root, relative to it, sorted.
export function npmTestFiles(root) {
  const pattern = npmTestPattern(root);
  if (!pattern) throw new Error('package.json\'s test script is not `node --test "<pattern>"`');
  return globSync(pattern, { cwd: root }).sort();
}

export function parseShard(spec) {
  const match = /^(\d+)\/(\d+)$/.exec(spec ?? '');
  const [index, total] = match ? [Number(match[1]), Number(match[2])] : [];
  if (!match || index < 1 || index > total) throw new Error(`shard: expected <index>/<total> with 1 <= index <= total, got ${JSON.stringify(spec)}`);
  return { index, total };
}

export function shardFiles(files, index, total) {
  return [...files].sort().filter((_, position) => position % total === index - 1);
}

function main([spec]) {
  let files, shard;
  try {
    shard = parseShard(spec);
    files = npmTestFiles(process.cwd());
  } catch (error) {
    console.error(`test-shard: ${error.message}`);
    return 2;
  }
  const mine = shardFiles(files, shard.index, shard.total);
  if (mine.length === 0) {
    console.error(`test-shard: shard ${spec} selects no file of ${files.length}`);
    return 2;
  }
  console.error(`test-shard: shard ${spec}: ${mine.length} of ${files.length} files`);
  const result = spawnSync(process.execPath, ['--test', ...mine], { stdio: 'inherit' });
  if (result.error) console.error(`test-shard: ${result.error.message}`);
  return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
