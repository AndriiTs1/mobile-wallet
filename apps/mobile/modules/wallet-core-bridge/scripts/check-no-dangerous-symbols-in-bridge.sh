#!/usr/bin/env bash
# Stage 5D.8B — accidental-Expo-exposure guard.
#
# Fails if any dangerous_native_only_* UniFFI symbol ever appears in a
# bridge-facing file reachable by Expo/React Native. See
# packages/wallet-core/src/lib.rs's `mod ffi` doc comment for why these
# symbols exist and must never cross this specific boundary: they carry
# secret material (canonical entropy, the mnemonic sentence) and are named
# this way specifically so a wrapper like Expo's Function(...)/
# AsyncFunction(...) is never accidentally built around them.
#
# Deliberately scoped to exact, named files — NOT a directory-wide scan.
# The generated UniFFI Swift bindings (ios/Generated/wallet_core.swift)
# legitimately contain these symbol names (that's the whole point of
# exporting them via UniFFI for native-only use), and a future dedicated
# native orchestrator file (e.g. a WalletCreateOrchestrator.swift) is
# expected to call them too. Neither should ever be flagged by this guard —
# only the three files below, which are the actual Expo/RN-reachable
# surface.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

FILES=(
  "$MODULE_DIR/ios/WalletCoreBridgeModule.swift"
  "$MODULE_DIR/src/WalletCoreBridge.types.ts"
  "$MODULE_DIR/src/WalletCoreBridgeModule.ts"
)

FOUND=0
for file in "${FILES[@]}"; do
  if [[ -f "$file" ]]; then
    if grep -inE "dangerous_native_only|DangerousNativeOnly" "$file"; then
      echo "error: dangerous native-only symbol referenced in bridge-facing file: $file" >&2
      FOUND=1
    fi
  fi
done

if [[ "$FOUND" -ne 0 ]]; then
  echo "" >&2
  echo "error: a dangerous_native_only_* UniFFI symbol must never appear in an" >&2
  echo "Expo/React Native-reachable bridge file. See packages/wallet-core/src/lib.rs's" >&2
  echo "'mod ffi' doc comment for the trust-boundary invariant this protects." >&2
  exit 1
fi

echo "ok: no dangerous_native_only symbols found in bridge-facing files."
