#!/usr/bin/env bash
# Xcode Run Script build phase (see WalletCoreBridge.podspec's script_phase).
#
# Cross-compiles packages/wallet-core for whichever platform/architecture Xcode is
# currently building ($PLATFORM_NAME / $ARCHS / $CONFIGURATION), so the same podspec
# supports a physical iPhone (aarch64-apple-ios) and an Apple Silicon iOS Simulator
# (aarch64-apple-ios-sim) without ever manually swapping a prebuilt .a file: each
# build regenerates the exact static library the platform being built needs.
#
# Also fails the build loudly if the committed Swift bindings in
# packages/wallet-core/generated/swift have drifted from the current Rust source.
set -euo pipefail

# Xcode's build environment PATH omits ~/.cargo/bin; restore a normal PATH so cargo/
# rustup resolve. Not device- or developer-specific: this is just Cargo's standard
# install location, the same on every machine that has it installed via rustup.
export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust via https://rustup.rs and re-run." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MODULE_DIR/../../../.." && pwd)"
WALLET_CORE_DIR="$REPO_ROOT/packages/wallet-core"
OUT_DIR="$SCRIPT_DIR/Rust"
OUT_LIB="$OUT_DIR/libwallet_core.a"

mkdir -p "$OUT_DIR"

CARGO_PROFILE="dev"
CARGO_PROFILE_DIR="debug"
if [[ "${CONFIGURATION:-Debug}" == "Release" ]]; then
  CARGO_PROFILE="release"
  CARGO_PROFILE_DIR="release"
fi

# Map the Xcode platform/arch being built right now to Rust target triple(s).
TARGETS=()
case "${PLATFORM_NAME:-}" in
  iphoneos)
    TARGETS+=("aarch64-apple-ios")
    ;;
  iphonesimulator)
    for arch in ${ARCHS:-arm64}; do
      case "$arch" in
        arm64) TARGETS+=("aarch64-apple-ios-sim") ;;
        x86_64) TARGETS+=("x86_64-apple-ios") ;;
        *)
          echo "error: unsupported simulator arch '$arch'" >&2
          exit 1
          ;;
      esac
    done
    ;;
  *)
    echo "error: unsupported PLATFORM_NAME '${PLATFORM_NAME:-<unset>}'. This script only supports iphoneos/iphonesimulator." >&2
    exit 1
    ;;
esac

CARGO_ARGS=(--manifest-path "$WALLET_CORE_DIR/Cargo.toml" --lib)
if [[ "$CARGO_PROFILE" == "release" ]]; then
  CARGO_ARGS+=(--release)
fi

BUILT_LIBS=()
for target in "${TARGETS[@]}"; do
  rustup target add "$target" >/dev/null 2>&1 || true
  cargo build "${CARGO_ARGS[@]}" --target "$target"
  BUILT_LIBS+=("$WALLET_CORE_DIR/target/$target/$CARGO_PROFILE_DIR/libwallet_core.a")
done

if [[ "${#BUILT_LIBS[@]}" -eq 1 ]]; then
  cp "${BUILT_LIBS[0]}" "$OUT_LIB"
else
  # Multiple simulator architectures requested (e.g. arm64 + x86_64) — combine into
  # one fat binary for this single platform. Device and simulator are still never
  # combined into the same file (Apple does not support that; see podspec comments).
  lipo -create "${BUILT_LIBS[@]}" -output "$OUT_LIB"
fi

echo "wallet-core: built $OUT_LIB for ${PLATFORM_NAME} (${TARGETS[*]}, $CARGO_PROFILE)"

# Bindings drift check: fail clearly if generated/swift no longer matches src/lib.rs,
# instead of silently linking a library whose exported API doesn't match the
# committed Swift bindings actually being compiled.
"$WALLET_CORE_DIR/scripts/generate-bindings.sh" --check
