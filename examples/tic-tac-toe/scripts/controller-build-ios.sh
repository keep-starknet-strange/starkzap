#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CONTROLLER_DIR="${CONTROLLER_C_DIR:-}"
TOOLCHAIN_OVERRIDE="${CONTROLLER_RUST_TOOLCHAIN:-}"
REQUIRED_TARGETS=(
  "aarch64-apple-ios"
  "aarch64-apple-ios-sim"
  "x86_64-apple-ios"
)
PROJECT_TOOLCHAIN=""

function require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name"
    exit 1
  fi
}

function ensure_rust_targets() {
  local toolchain="$1"
  local installed_targets
  installed_targets="$(rustup target list --installed --toolchain "$toolchain" || true)"

  for target in "${REQUIRED_TARGETS[@]}"; do
    if ! echo "$installed_targets" | grep -q "^${target}$"; then
      echo "Installing Rust target for ${toolchain}: $target"
      rustup target add --toolchain "$toolchain" "$target"
    fi
  done
}

function resolve_project_toolchain() {
  if [[ -n "$TOOLCHAIN_OVERRIDE" ]]; then
    PROJECT_TOOLCHAIN="$TOOLCHAIN_OVERRIDE"
    return
  fi

  local detected
  detected="$(cd "$CONTROLLER_DIR" && rustup show active-toolchain | awk '{print $1}')"
  if [[ -z "$detected" ]]; then
    echo "Unable to resolve active rust toolchain for $CONTROLLER_DIR"
    exit 1
  fi
  PROJECT_TOOLCHAIN="$detected"
}

if [[ -z "$CONTROLLER_DIR" ]]; then
  echo "Missing CONTROLLER_C_DIR."
  echo "Set CONTROLLER_C_DIR to your local controller.c checkout, then retry."
  echo "Example: export CONTROLLER_C_DIR=/Users/<you>/Development/controller.c"
  exit 1
fi

if [[ ! -d "$CONTROLLER_DIR" ]]; then
  echo "CONTROLLER_C_DIR does not exist: $CONTROLLER_DIR"
  exit 1
fi

require_command rustup
require_command cargo
require_command xcodebuild
require_command xcrun
resolve_project_toolchain
echo "Using Rust toolchain: $PROJECT_TOOLCHAIN"
ensure_rust_targets "$PROJECT_TOOLCHAIN"

BUILD_SCRIPT="$CONTROLLER_DIR/scripts/build_ios.sh"
if [[ ! -f "$BUILD_SCRIPT" ]]; then
  echo "Could not find build script: $BUILD_SCRIPT"
  exit 1
fi

echo "Building iOS controller binary from: $CONTROLLER_DIR"
RUSTUP_TOOLCHAIN="$PROJECT_TOOLCHAIN" bash "$BUILD_SCRIPT"

echo "Done. iOS binary build completed."
