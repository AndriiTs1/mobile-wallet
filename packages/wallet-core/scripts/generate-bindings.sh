#!/usr/bin/env bash
# Regenerates the committed UniFFI Swift bindings in packages/wallet-core/generated/swift
# from the current Rust source, using the host-only tool crate at tools/uniffi-bindgen.
#
# Usage:
#   scripts/generate-bindings.sh           regenerate generated/swift in place
#   scripts/generate-bindings.sh --check   fail if generated/swift is stale relative to source
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WALLET_CORE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$WALLET_CORE_DIR/../.." && pwd)"
BINDGEN_MANIFEST="$REPO_ROOT/tools/uniffi-bindgen/Cargo.toml"
# Committed inside the Expo module (not packages/wallet-core) because CocoaPods only
# picks up source_files/preserve_paths/public_header_files patterns that resolve
# inside the pod's own directory tree — a pattern pointing outside it (even a
# genuinely matching one) is silently dropped by `pod install`, not an error.
COMMITTED_DIR="$REPO_ROOT/apps/mobile/modules/wallet-core-bridge/ios/Generated"

CHECK=0
if [[ "${1:-}" == "--check" ]]; then
  CHECK=1
fi

cd "$WALLET_CORE_DIR"

# Host build (no --target): produces a cdylib for the current machine, used only so
# uniffi-bindgen can read the exported UniFFI metadata. Its code is never shipped —
# the real per-platform static libraries are built separately by
# apps/mobile/modules/wallet-core-bridge/ios/build-rust.sh.
cargo build --lib --quiet

HOST_DYLIB="target/debug/libwallet_core.dylib"
if [[ ! -f "$HOST_DYLIB" ]]; then
  echo "error: expected host library not found at $HOST_DYLIB" >&2
  exit 1
fi

OUT_DIR="$COMMITTED_DIR"
if [[ "$CHECK" -eq 1 ]]; then
  OUT_DIR="$(mktemp -d)"
  trap 'rm -rf "$OUT_DIR"' EXIT
fi

mkdir -p "$OUT_DIR"
cargo run --manifest-path "$BINDGEN_MANIFEST" --release --quiet -- \
  generate --library "$HOST_DYLIB" --language swift --out-dir "$OUT_DIR"

if [[ "$CHECK" -eq 1 ]]; then
  if ! diff -rq "$COMMITTED_DIR" "$OUT_DIR" >/dev/null 2>&1; then
    echo "error: packages/wallet-core/generated/swift is stale relative to packages/wallet-core/src." >&2
    echo "Run packages/wallet-core/scripts/generate-bindings.sh and commit the result." >&2
    diff -rq "$COMMITTED_DIR" "$OUT_DIR" >&2 || true
    exit 1
  fi
  echo "generated/swift is up to date."
else
  echo "Regenerated $COMMITTED_DIR"
fi
