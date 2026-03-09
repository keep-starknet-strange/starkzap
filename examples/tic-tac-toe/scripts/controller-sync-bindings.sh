#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CONTROLLER_DIR="${CONTROLLER_C_DIR:-}"
TOOLCHAIN_OVERRIDE="${CONTROLLER_RUST_TOOLCHAIN:-}"
PROJECT_TOOLCHAIN=""

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

MODULE_ROOT="$APP_DIR/modules/controller"
TMP_BINDINGS_DIR="$APP_DIR/.tmp/controller-bindings"
LIB_PATH=""
UNIFFI_RUNNER=""
UNIFFI_PACKAGE="github:Larkooo/uniffi-bindgen-react-native#update-uniffi-0.30"

function require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name"
    exit 1
  fi
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

function resolve_library_path() {
  local ext=""
  case "${OSTYPE:-}" in
    darwin*) ext="dylib" ;;
    linux*) ext="so" ;;
    msys*|win32*) ext="dll" ;;
    *)
      echo "Unsupported OSTYPE: ${OSTYPE:-unknown}"
      exit 1
      ;;
  esac

  LIB_PATH="$CONTROLLER_DIR/target/release/libcontroller_uniffi.${ext}"
  if [[ ! -f "$LIB_PATH" ]]; then
    echo "Controller host library not found at: $LIB_PATH"
    echo "Building host library first..."
    (cd "$CONTROLLER_DIR" && RUSTUP_TOOLCHAIN="$PROJECT_TOOLCHAIN" cargo build --release -p controller-uniffi)
  fi

  if [[ ! -f "$LIB_PATH" ]]; then
    echo "Could not build/find host library: $LIB_PATH"
    exit 1
  fi
}

require_command rustup
require_command cargo
require_command npm
resolve_project_toolchain

if command -v uniffi-bindgen-react-native >/dev/null 2>&1; then
  UNIFFI_RUNNER="uniffi-bindgen-react-native"
else
  if npm exec -- uniffi-bindgen-react-native --help >/dev/null 2>&1; then
    UNIFFI_RUNNER="npm exec -- uniffi-bindgen-react-native --"
  else
    require_command npx
    if npx --yes --package="$UNIFFI_PACKAGE" uniffi-bindgen-react-native --help >/dev/null 2>&1; then
      UNIFFI_RUNNER="npx --yes --package=$UNIFFI_PACKAGE uniffi-bindgen-react-native"
    else
      echo "uniffi-bindgen-react-native is not available."
      echo "Install dependencies first: npm install"
      exit 1
    fi
  fi
fi

resolve_library_path

mkdir -p "$MODULE_ROOT"
rm -rf "$TMP_BINDINGS_DIR"
mkdir -p "$TMP_BINDINGS_DIR/src" "$TMP_BINDINGS_DIR/cpp"

echo "Using Rust toolchain: $PROJECT_TOOLCHAIN"
echo "Generating React Native bindings from: $LIB_PATH"

run_bindgen() {
  if [[ "$UNIFFI_RUNNER" == "uniffi-bindgen-react-native" ]]; then
    RUSTUP_TOOLCHAIN="$PROJECT_TOOLCHAIN" uniffi-bindgen-react-native generate jsi bindings \
      --library \
      --ts-dir "$TMP_BINDINGS_DIR/src" \
      --cpp-dir "$TMP_BINDINGS_DIR/cpp" \
      "$LIB_PATH"
  elif [[ "$UNIFFI_RUNNER" == "npm exec -- uniffi-bindgen-react-native --" ]]; then
    RUSTUP_TOOLCHAIN="$PROJECT_TOOLCHAIN" npm exec -- uniffi-bindgen-react-native -- \
      generate jsi bindings \
      --library \
      --ts-dir "$TMP_BINDINGS_DIR/src" \
      --cpp-dir "$TMP_BINDINGS_DIR/cpp" \
      "$LIB_PATH"
  else
    RUSTUP_TOOLCHAIN="$PROJECT_TOOLCHAIN" npx --yes --package="$UNIFFI_PACKAGE" uniffi-bindgen-react-native generate jsi bindings \
      --library \
      --ts-dir "$TMP_BINDINGS_DIR/src" \
      --cpp-dir "$TMP_BINDINGS_DIR/cpp" \
      "$LIB_PATH"
  fi
}

(
  cd "$CONTROLLER_DIR"
  run_bindgen
)

mkdir -p "$MODULE_ROOT/src/generated" "$MODULE_ROOT/cpp/generated"
rm -rf "$MODULE_ROOT/src/generated/"* "$MODULE_ROOT/cpp/generated/"*
cp -R "$TMP_BINDINGS_DIR/src/." "$MODULE_ROOT/src/generated/"
cp -R "$TMP_BINDINGS_DIR/cpp/." "$MODULE_ROOT/cpp/generated/"
rm -rf "$TMP_BINDINGS_DIR"

echo "Done. Controller RN bindings synced."
