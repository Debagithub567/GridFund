#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

fixture_dir="${1:-$(mktemp -d /tmp/gridsupport-fan.XXXXXX)}"
mkdir -p "$fixture_dir"
anchor build --arch v0 --tools-version v1.54 -- --features local-test-mint
node scripts/prepare-local-fan-fixture.mjs "$fixture_dir"
restore_default_build() { anchor build --arch v0 --tools-version v1.54; }
trap restore_default_build EXIT
echo "Isolated ledger: $fixture_dir/ledger"
echo "Fund only temporary local fan wallets; no Devnet endpoint is used."
solana-test-validator --reset --ledger "$fixture_dir/ledger" \
  --account 6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS "$fixture_dir/mint.json" \
  --bpf-program H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ target/deploy/gridsupport.so \
  --rpc-port 8899
