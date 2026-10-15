#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# The local mint is pinned into the SBF binary only for this suite. Always
# restore the default fail-closed artifact, even when a test fails.
restore_default_build() {
  anchor build --arch v0 --tools-version v1.54
}
trap restore_default_build EXIT

anchor build --arch v0 --tools-version v1.54 -- --features local-test-mint
npm run test:integration:run
