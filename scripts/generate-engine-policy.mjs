#!/usr/bin/env node
// Writes native/engine/Sources/Engine/Policy.generated.swift, the engine's copy of the forbidden list, from
// src/services/engine/policy.mjs (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Interfaces, Policy).
// Run after editing the list there; test/services-engine-policy.test.mjs fails until the two agree.
//
//   node scripts/generate-engine-policy.mjs
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SWIFT_POLICY_FILE, swiftPolicySource} from '../src/services/engine/policy.mjs';

const path = join(dirname(fileURLToPath(import.meta.url)), '..', SWIFT_POLICY_FILE);
writeFileSync(path, swiftPolicySource());
console.log(path);
