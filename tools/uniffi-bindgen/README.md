# uniffi-bindgen

Host-only binding-generator tool. Not part of the `packages/wallet-core` dependency graph and never shipped to a device — it exists solely to run `uniffi-bindgen generate` against a host build of `wallet-core` to produce Swift bindings.

This crate intentionally has its own `Cargo.toml`/`Cargo.lock`, independent of `packages/wallet-core`. Keep the `uniffi` version pinned here identical to the one in `packages/wallet-core/Cargo.toml` — UniFFI requires the bindgen tool and the library it's generating bindings for to be on the same version.

Used by `packages/wallet-core/scripts/generate-bindings.sh`.
