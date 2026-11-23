#!/bin/bash
# task 89: the tag linux-engine-v0.4.0 fetched into the parity clone (pre-flight §1, T1), and what it names
set -u
P=/Users/new/Developer/GitHub/cua-parity
cd "$P"
echo "parity clone HEAD before: $(git rev-parse HEAD)"
git fetch origin tag linux-engine-v0.4.0 --no-tags 2>&1 | tail -2
echo "tag: $(git rev-parse 'linux-engine-v0.4.0^{commit}')"
