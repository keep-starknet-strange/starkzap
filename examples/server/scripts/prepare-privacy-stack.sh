#!/usr/bin/env bash
#
# Opt-in installer for the SNIP-36 privacy proving stack (used only by the
# privacy examples). Downloads PREBUILT binaries — no Rust or Python build —
# into a self-contained, gitignored .privacy-stack/ next to the server.
#
#   npm run prepare:privacy-stack
#
# Pin a release:  SNIP36_TAG=v1.2.3 npm run prepare:privacy-stack
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
STACK_DIR="$SERVER_DIR/.privacy-stack"
BIN_DIR="$STACK_DIR/bin"

REPO="starknet-innovation/snip-36-prover-backend"
# The prebuilt runner is `starknet_os_runner`; a source build names it
# `starknet_transaction_prover`. run-virtual-os.sh accepts either, so we do too.
RUNNER="$STACK_DIR/deps/sequencer/target/release/starknet_os_runner"
RUNNER_ALT="$STACK_DIR/deps/sequencer/target/release/starknet_transaction_prover"
WRAPPER="$STACK_DIR/scripts/run-virtual-os.sh"

# Idempotent: bail early if the stack is already laid out.
if { [ -f "$RUNNER" ] || [ -f "$RUNNER_ALT" ]; } && [ -f "$WRAPPER" ]; then
  echo "✓ privacy stack already present at $STACK_DIR"
  exit 0
fi

command -v jq >/dev/null || echo "WARNING: 'jq' not found — run-virtual-os.sh needs it at prove time."

mkdir -p "$BIN_DIR" "$STACK_DIR/scripts"

# 1. snip36 CLI (for setup) + snip36-playground server, prebuilt into local bin/.
echo "==> installing snip36 binaries into $BIN_DIR"
if [ -n "${SNIP36_TAG:-}" ]; then
  curl -fsSL "https://github.com/$REPO/releases/download/$SNIP36_TAG/install.sh" \
    | SNIP36_INSTALL_DIR="$BIN_DIR" sh -s -- "$SNIP36_TAG"
else
  curl -fsSL "https://github.com/$REPO/releases/latest/download/install.sh" \
    | SNIP36_INSTALL_DIR="$BIN_DIR" sh
fi

# 2. Prebuilt prover deps (stwo prover, runner, sierra compiler, bootloader).
# ponytail: the final [3/4] cairo-compile venv step needs Python <3.13 and is
# NOT used by the prove path (only the from-source build branch touches it), so
# we tolerate its failure and instead verify the binaries we actually need.
echo "==> fetching prebuilt prover deps (a failing venv step is expected — ignore it)"
# setup falls back to CWD when STARKNET_* env vars are absent — it ignores
# SNIP36_PROJECT_DIR on that path — so run it FROM the stack dir.
( cd "$STACK_DIR" && "$BIN_DIR/snip36" setup --prebuilt ) || true

[ -f "$STACK_DIR/deps/bin/stwo-run-and-prove" ] \
  || { echo "ERROR: stwo-run-and-prove missing after setup"; exit 1; }
{ [ -f "$RUNNER" ] || [ -f "$RUNNER_ALT" ]; } \
  || { echo "ERROR: runner binary missing after setup"; exit 1; }

# 3. The playground server spawns $SNIP36_PROJECT_DIR/scripts/run-virtual-os.sh,
#    which setup --prebuilt does not install. Vendor it.
echo "==> vendoring run-virtual-os.sh (patched to honor PROVER_CHAIN_ID)"
REF="${SNIP36_TAG:-main}"
curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/scripts/run-virtual-os.sh" -o "$WRAPPER"
# Upstream pins the runner to SN_SEPOLIA. Make the chain configurable so the
# example can target mainnet too; default stays SN_SEPOLIA.
sed 's|--chain-id SN_SEPOLIA|--chain-id "${PROVER_CHAIN_ID:-SN_SEPOLIA}"|' "$WRAPPER" > "$WRAPPER.tmp" && mv "$WRAPPER.tmp" "$WRAPPER"
grep -q 'PROVER_CHAIN_ID' "$WRAPPER" \
  || { echo "ERROR: failed to patch chain-id in run-virtual-os.sh (upstream format changed?)"; exit 1; }
chmod +x "$WRAPPER"

echo "✓ privacy stack ready at $STACK_DIR"
echo "  start the prover server with:"
echo "    SNIP36_PROJECT_DIR=$STACK_DIR STARKNET_RPC_URL=... STARKNET_ACCOUNT_ADDRESS=0x1 STARKNET_PRIVATE_KEY=0x1 $BIN_DIR/snip36-playground"
