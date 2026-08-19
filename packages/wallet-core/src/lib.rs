uniffi::setup_scaffolding!();

/// Returns the Wallet Core package version.
///
/// Stage 5A proof only: no wallet, key, storage, network, or cryptographic logic.
#[uniffi::export]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// Returns a deterministic health-check response.
///
/// Stage 5A proof only: used to verify the real Rust/native boundary.
#[uniffi::export]
pub fn health_check() -> String {
    "pong".to_owned()
}

/// V1 HD derivation-path foundation (ADR-003).
///
/// Stage 5B.3 proof only: proves the exact ADR-003 V1 paths can be parsed and
/// derived from a seed. Not exposed via UniFFI. No signing, address encoding,
/// secure storage, or arbitrary-path API is introduced here (see ADR-003 §10).
///
/// Not yet wired to any public API — exercised only by `tests::v1_derivation_paths`
/// in this stage; a later stage wires it to a UniFFI-exported surface.
#[allow(dead_code)]
mod derivation {
    use bitcoin::bip32::{DerivationPath, Xpriv};
    use bitcoin::secp256k1::{PublicKey as Secp256k1PublicKey, Secp256k1};
    use bitcoin::{Address, CompressedPublicKey, Network};
    use sha3::{Digest, Keccak256};
    use std::fmt::Write as _;
    use std::str::FromStr;

    /// The fixed set of V1 derivation paths Wallet Core controls (ADR-003 §2, §4).
    ///
    /// Deliberately a closed enum, not a raw path string: callers select one of
    /// these three policy-defined paths, never an arbitrary derivation string
    /// (ADR-003 §10.1, §10.2). Account 0 / address_index 0 only, per Stage 5B.3 scope.
    pub(crate) enum V1DerivationPath {
        /// ADR-003 §2: `m/44'/60'/0'/0/0`.
        EthereumV1,
        /// ADR-003 §4: `m/84'/0'/0'/0/0` (external/receive branch).
        BitcoinReceiveV1,
        /// ADR-003 §4: `m/84'/0'/0'/1/0` (internal/change branch).
        BitcoinChangeV1,
    }

    impl V1DerivationPath {
        const fn path_str(&self) -> &'static str {
            match self {
                V1DerivationPath::EthereumV1 => "m/44'/60'/0'/0/0",
                V1DerivationPath::BitcoinReceiveV1 => "m/84'/0'/0'/0/0",
                V1DerivationPath::BitcoinChangeV1 => "m/84'/0'/0'/1/0",
            }
        }
    }

    /// Derives the extended private key at a fixed V1 path (ADR-003) from a BIP-32 seed.
    ///
    /// Internal derivation-proof only: not exposed via UniFFI, does not sign, and
    /// does not encode or return any chain-specific address.
    pub(crate) fn derive_v1(seed: &[u8], path: V1DerivationPath) -> Xpriv {
        let secp = Secp256k1::new();
        let mut master = Xpriv::new_master(Network::Bitcoin, seed).expect("valid BIP-32 seed");
        let derivation_path =
            DerivationPath::from_str(path.path_str()).expect("valid Wallet Core V1 path constant");
        let child = master
            .derive_priv(&secp, &derivation_path)
            .expect("valid BIP-32 child derivation");
        // Best-effort erase of the discarded master key's own memory location.
        // Xpriv/SecretKey are Copy, so this does NOT guarantee every
        // compiler-made or historical copy of the master key is also erased.
        master.private_key.non_secure_erase();
        child
    }

    /// The two Bitcoin V1 address kinds Wallet Core derives (ADR-003 §4): the
    /// external/receive branch and the internal/change branch, index 0 only for
    /// this stage. Deliberately closed — not a caller-suppliable branch/index.
    pub(crate) enum BitcoinAddressKindV1 {
        Receive,
        Change,
    }

    impl BitcoinAddressKindV1 {
        const fn path(&self) -> V1DerivationPath {
            match self {
                BitcoinAddressKindV1::Receive => V1DerivationPath::BitcoinReceiveV1,
                BitcoinAddressKindV1::Change => V1DerivationPath::BitcoinChangeV1,
            }
        }
    }

    /// Derives the BIP-84 native SegWit (P2WPKH) Bitcoin mainnet address for a
    /// fixed V1 branch (ADR-003 §4, §8) from a BIP-32 seed.
    ///
    /// Internal only: not exposed via UniFFI. Returns only the public address —
    /// the derived private key/public key never leave this function.
    pub(crate) fn derive_bitcoin_v1_address(seed: &[u8], kind: BitcoinAddressKindV1) -> Address {
        let mut xpriv = derive_v1(seed, kind.path());
        let secp = Secp256k1::new();
        let mut private_key = xpriv.to_priv();
        let compressed_public_key = CompressedPublicKey::from_private_key(&secp, &private_key)
            .expect("BIP-32 derived private key always yields a compressed public key");
        // Best-effort erase; see derive_v1's note on Copy-type limitations.
        xpriv.private_key.non_secure_erase();
        private_key.inner.non_secure_erase();
        Address::p2wpkh(&compressed_public_key, Network::Bitcoin)
    }

    /// Derives the Ethereum V1 address (ADR-003 §2, §8) from a BIP-32 seed, at
    /// the fixed `m/44'/60'/0'/0/0` path only.
    ///
    /// Algorithm: derive the secp256k1 private key at the fixed V1 Ethereum
    /// path, take its uncompressed public key, drop the `0x04` prefix byte,
    /// Keccak-256 hash the remaining 64 bytes, and take the last 20 bytes as
    /// the address. Returns the EIP-55 checksummed `0x`-prefixed display form.
    ///
    /// Internal only: not exposed via UniFFI. Returns only the address string —
    /// the derived private key/public key never leave this function.
    pub(crate) fn derive_ethereum_v1_address(seed: &[u8]) -> String {
        let mut xpriv = derive_v1(seed, V1DerivationPath::EthereumV1);
        let secp = Secp256k1::new();
        let public_key = Secp256k1PublicKey::from_secret_key(&secp, &xpriv.private_key);
        // Best-effort erase; see derive_v1's note on Copy-type limitations.
        xpriv.private_key.non_secure_erase();
        let uncompressed = public_key.serialize_uncompressed();

        let hash = Keccak256::digest(&uncompressed[1..]);
        let address_bytes = &hash[12..];

        to_eip55_checksum_address(address_bytes)
    }

    /// Encodes a 20-byte Ethereum address as an EIP-55 mixed-case checksummed,
    /// `0x`-prefixed hex string (ADR-003 §8).
    fn to_eip55_checksum_address(address_bytes: &[u8]) -> String {
        let lower_hex = to_lower_hex(address_bytes);
        let hash = Keccak256::digest(lower_hex.as_bytes());

        let mut checksummed = String::with_capacity(2 + lower_hex.len());
        checksummed.push_str("0x");
        for (i, ch) in lower_hex.chars().enumerate() {
            if ch.is_ascii_alphabetic() {
                let hash_byte = hash[i / 2];
                let nibble = if i % 2 == 0 {
                    hash_byte >> 4
                } else {
                    hash_byte & 0x0f
                };
                if nibble >= 8 {
                    checksummed.push(ch.to_ascii_uppercase());
                    continue;
                }
            }
            checksummed.push(ch);
        }
        checksummed
    }

    /// Lowercase hex encoding, no `0x` prefix.
    fn to_lower_hex(bytes: &[u8]) -> String {
        let mut out = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            write!(out, "{byte:02x}").expect("writing to a String never fails");
        }
        out
    }
}

/// V1 wallet-secret primitives (BIP-39 entropy/mnemonic/seed), Stage 5D.2.
///
/// Rust-internal only: not exposed via UniFFI. No secret (entropy, mnemonic,
/// seed, passphrase, key material) is handed off to native/React Native by
/// anything in this module — that remains explicitly future work, gated on
/// resolving the entropy-to-native-only UniFFI scoping question raised in
/// the Stage 5D.1 design review.
#[allow(dead_code)]
mod wallet_secret {
    use super::derivation::{
        BitcoinAddressKindV1, derive_bitcoin_v1_address, derive_ethereum_v1_address,
    };
    use bip39::{Language, Mnemonic};
    use zeroize::Zeroizing;

    /// Structural, non-secret error categories (ADR-004 §15). Must never
    /// embed a mnemonic word, passphrase, entropy, seed, or key material.
    #[derive(Debug, PartialEq, Eq)]
    pub(crate) enum WalletError {
        EntropyGenerationFailed,
        InvalidWordCount,
        UnrecognizedWord,
        ChecksumFailed,
    }

    /// Generates V1 entropy (128-bit / 16 bytes, ADR-004 §3) from the OS
    /// CSPRNG via `getrandom`. Deliberately takes no entropy/RNG parameter —
    /// production wallet creation has exactly one entropy source.
    pub(crate) fn generate_v1_entropy() -> Result<Zeroizing<[u8; 16]>, WalletError> {
        let mut entropy = [0u8; 16];
        getrandom::fill(&mut entropy).map_err(|_| WalletError::EntropyGenerationFailed)?;
        Ok(Zeroizing::new(entropy))
    }

    /// Converts V1 entropy into its 12-word English BIP-39 mnemonic
    /// (ADR-004 §2/§3). No word-count parameter: the fixed 16-byte input
    /// already fixes the output at 12 words.
    pub(crate) fn mnemonic_from_entropy(entropy: &[u8; 16]) -> Mnemonic {
        Mnemonic::from_entropy_in(Language::English, entropy)
            .expect("16 bytes is always valid BIP-39 entropy")
    }

    /// Parses/imports an English BIP-39 mnemonic (ADR-004 §2/§8): any
    /// standard checksum-valid length (12/15/18/21/24 words). No network
    /// call, no automatic passphrase, no language other than English.
    pub(crate) fn parse_import_mnemonic(words: &str) -> Result<Mnemonic, WalletError> {
        Mnemonic::parse_in(Language::English, words).map_err(|error| match error {
            bip39::Error::BadWordCount(_) => WalletError::InvalidWordCount,
            bip39::Error::UnknownWord(_) => WalletError::UnrecognizedWord,
            bip39::Error::InvalidChecksum => WalletError::ChecksumFailed,
            // parse_in fixes the language explicitly (English), so
            // AmbiguousLanguages cannot occur; BadEntropyBitCount is only
            // returned by from_entropy_in, never by mnemonic parsing.
            // Mapped defensively rather than treated as unreachable.
            bip39::Error::AmbiguousLanguages(_) | bip39::Error::BadEntropyBitCount(_) => {
                WalletError::InvalidWordCount
            }
        })
    }

    /// Converts a parsed mnemonic back to its canonical BIP-39 entropy
    /// (ADR-005 §2's persisted-secret form): the fixed-size buffer/length
    /// pair `Mnemonic::to_entropy_array` already returns, avoiding a
    /// heap-allocated `Vec` for secret material.
    pub(crate) fn entropy_from_mnemonic(mnemonic: &Mnemonic) -> (Zeroizing<[u8; 33]>, usize) {
        let (entropy, len) = mnemonic.to_entropy_array();
        (Zeroizing::new(entropy), len)
    }

    /// Derives the BIP-39 seed from a mnemonic and an explicitly supplied
    /// passphrase (ADR-004 §7). The passphrase is never cached or stored —
    /// callers must supply it fresh for every derivation (ADR-005 §2).
    pub(crate) fn seed_from_mnemonic(mnemonic: &Mnemonic, passphrase: &str) -> Zeroizing<[u8; 64]> {
        Zeroizing::new(mnemonic.to_seed(passphrase))
    }

    /// Public-data-only V1 address bundle — safe to hold in ordinary
    /// (non-secret) application state.
    #[derive(Debug, PartialEq, Eq)]
    pub(crate) struct V1WalletAddresses {
        pub ethereum: String,
        pub bitcoin_receive: String,
        pub bitcoin_change: String,
    }

    /// Composes the existing Stage 5B derivation functions only — no new
    /// derivation path or cryptographic algorithm is introduced here.
    pub(crate) fn derive_v1_wallet_addresses(seed: &[u8]) -> V1WalletAddresses {
        V1WalletAddresses {
            ethereum: derive_ethereum_v1_address(seed),
            bitcoin_receive: derive_bitcoin_v1_address(seed, BitcoinAddressKindV1::Receive)
                .to_string(),
            bitcoin_change: derive_bitcoin_v1_address(seed, BitcoinAddressKindV1::Change)
                .to_string(),
        }
    }

    /// Canonical BIP-39 entropy (ADR-005 §2's persisted-secret form), holding
    /// only the valid-length prefix of the underlying fixed-size buffer.
    ///
    /// This exists to close a narrow but real footgun in the raw
    /// `(Zeroizing<[u8; 33]>, usize)` shape `entropy_from_mnemonic` already
    /// returns (unchanged, per Stage 5D.4 scope): a caller of that tuple
    /// could accidentally read the full 33-byte buffer instead of only the
    /// first `len` bytes, exposing unused zero-padding as if it were part of
    /// the secret. `CanonicalEntropy` only ever exposes the valid prefix via
    /// `as_bytes`. Deliberately no `Debug`/`Display`/serialization impl.
    pub(crate) struct CanonicalEntropy {
        bytes: Zeroizing<[u8; 33]>,
        len: usize,
    }

    impl CanonicalEntropy {
        pub(crate) fn from_generated_16(entropy: Zeroizing<[u8; 16]>) -> Self {
            let mut bytes = [0u8; 33];
            bytes[..16].copy_from_slice(&entropy[..]);
            Self {
                bytes: Zeroizing::new(bytes),
                len: 16,
            }
        }

        fn from_raw_33(bytes: Zeroizing<[u8; 33]>, len: usize) -> Self {
            Self { bytes, len }
        }

        /// The valid entropy bytes only — never the unused tail of the
        /// underlying fixed-size buffer.
        pub(crate) fn as_bytes(&self) -> &[u8] {
            &self.bytes[..self.len]
        }
    }

    /// Output of `create_wallet_v1`. Deliberately holds only what the future
    /// trusted native stage needs: canonical entropy (for secure-storage
    /// hand-off) and the mnemonic sentence (for one-time initial backup
    /// display, ADR-004 §4). No seed, xpriv, private key, or passphrase
    /// field exists here — the seed is derived and dropped internally.
    ///
    /// No `Debug`/`Display`/serialization is derived or implemented, since
    /// this type carries secret material.
    pub(crate) struct CreateWalletOutput {
        pub entropy: CanonicalEntropy,
        pub mnemonic: Mnemonic,
        pub addresses: V1WalletAddresses,
    }

    /// Generates a new V1 wallet: OS-CSPRNG entropy → 12-word mnemonic →
    /// seed (no passphrase — ADR-004 §7: V1 creation never offers one) →
    /// V1 ETH/BTC addresses. The seed is dropped/zeroized before this
    /// function returns; it never appears in `CreateWalletOutput`.
    pub(crate) fn create_wallet_v1() -> Result<CreateWalletOutput, WalletError> {
        let entropy = generate_v1_entropy()?;
        let mnemonic = mnemonic_from_entropy(&entropy);
        let seed = seed_from_mnemonic(&mnemonic, "");
        let addresses = derive_v1_wallet_addresses(seed.as_slice());
        // `seed` is dropped (and zeroized, Zeroizing<[u8;64]>) at the end of
        // this function's scope, before control returns to the caller.
        Ok(CreateWalletOutput {
            entropy: CanonicalEntropy::from_generated_16(entropy),
            mnemonic,
            addresses,
        })
    }

    /// Output of `import_wallet_v1`. Holds canonical entropy (for
    /// secure-storage hand-off) and the PUBLIC address bundle only — never
    /// the mnemonic, the passphrase, or the seed.
    ///
    /// No `Debug`/`Display`/serialization is derived or implemented, since
    /// this type carries secret material.
    pub(crate) struct ImportWalletOutput {
        pub entropy: CanonicalEntropy,
        pub addresses: V1WalletAddresses,
    }

    /// Imports an existing V1 wallet from a user-supplied mnemonic and an
    /// explicitly supplied (never assumed) passphrase: validate → canonical
    /// entropy → seed → V1 ETH/BTC addresses. The mnemonic and seed are
    /// dropped/zeroized (via their own existing `ZeroizeOnDrop`/`Zeroizing`
    /// behavior, unchanged from Stage 5C/5D.2) before this function returns;
    /// neither appears in `ImportWalletOutput`, and the passphrase is never
    /// stored anywhere, per ADR-005 §2.
    pub(crate) fn import_wallet_v1(
        words: &str,
        passphrase: &str,
    ) -> Result<ImportWalletOutput, WalletError> {
        let mnemonic = parse_import_mnemonic(words)?;
        let (entropy_bytes, len) = entropy_from_mnemonic(&mnemonic);
        let seed = seed_from_mnemonic(&mnemonic, passphrase);
        let addresses = derive_v1_wallet_addresses(seed.as_slice());
        // `mnemonic` and `seed` are dropped at the end of this function's
        // scope, before control returns to the caller.
        Ok(ImportWalletOutput {
            entropy: CanonicalEntropy::from_raw_33(entropy_bytes, len),
            addresses,
        })
    }
}

/// Native-only UniFFI FFI surface, Stage 5D.8B.
///
/// Everything here is reachable from Swift/Kotlin (UniFFI exports must be
/// `pub`), but NONE of it is safe to expose through Expo
/// `Function(...)`/`AsyncFunction(...)` to React Native — see the
/// `dangerous_native_only_*` naming convention below and the automated
/// exposure guard at `apps/mobile/modules/wallet-core-bridge/check-no-dangerous-symbols-in-bridge.sh`.
///
/// Trust-boundary invariant (unchanged from every prior stage): seed,
/// `Xpriv`, and secp256k1 private-key material never cross this boundary,
/// or any boundary, at all — nothing in this module touches them. Only
/// entropy and the mnemonic sentence cross here, and only through the two
/// explicitly named dangerous accessors below.
mod ffi {
    use super::wallet_secret;

    /// PUBLIC-SAFE. Safe to forward to React Native. Explicit, minimal
    /// conversion from the internal `V1WalletAddresses` (Stage 5D.2/5D.4) —
    /// no new derivation logic.
    #[derive(uniffi::Record)]
    pub struct FfiV1WalletAddresses {
        pub ethereum: String,
        pub bitcoin_receive: String,
        pub bitcoin_change: String,
    }

    impl From<&wallet_secret::V1WalletAddresses> for FfiV1WalletAddresses {
        fn from(addresses: &wallet_secret::V1WalletAddresses) -> Self {
            Self {
                ethereum: addresses.ethereum.clone(),
                bitcoin_receive: addresses.bitcoin_receive.clone(),
                bitcoin_change: addresses.bitcoin_change.clone(),
            }
        }
    }

    /// Structural, non-secret error categories — mirrors `WalletError`
    /// (Stage 5D.2) exactly. No String/Debug payload, no secret value.
    #[derive(uniffi::Error, Debug, PartialEq, Eq)]
    pub enum FfiWalletError {
        EntropyGenerationFailed,
        InvalidWordCount,
        UnrecognizedWord,
        ChecksumFailed,
    }

    impl std::fmt::Display for FfiWalletError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            // Safe: this only ever prints the fixed variant name (via the
            // derived Debug), never any field — the enum has no fields.
            write!(f, "{self:?}")
        }
    }

    impl From<wallet_secret::WalletError> for FfiWalletError {
        fn from(error: wallet_secret::WalletError) -> Self {
            match error {
                wallet_secret::WalletError::EntropyGenerationFailed => {
                    Self::EntropyGenerationFailed
                }
                wallet_secret::WalletError::InvalidWordCount => Self::InvalidWordCount,
                wallet_secret::WalletError::UnrecognizedWord => Self::UnrecognizedWord,
                wallet_secret::WalletError::ChecksumFailed => Self::ChecksumFailed,
            }
        }
    }

    /// NATIVE-ONLY. Opaque handle wrapping the existing `CreateWalletOutput`
    /// (Stage 5D.4) unchanged — no duplicated generation/derivation logic.
    ///
    /// Deliberately no `Debug`, `Display`, or serialization: this type holds
    /// secret material (canonical entropy, the mnemonic sentence) for the
    /// lifetime of the handle. Only `addresses()` is public-safe; the two
    /// `dangerous_native_only_*` accessors must never be called from
    /// anything that could forward their result to Expo/React Native.
    ///
    /// One-shot semantics are NOT enforced. UniFFI exposes this type to
    /// Swift as a shared (`Arc`-backed) handle with `&self`-taking methods;
    /// making the dangerous accessors genuinely consuming/one-shot would
    /// require interior mutability (e.g. a `Mutex<Option<_>>` "already
    /// taken" guard) — deliberately not added in this stage per its own
    /// explicit "do not over-engineer" instruction. The native orchestrator
    /// that will eventually call these (not built in this stage) MUST treat
    /// each dangerous accessor as call-at-most-once by convention; this is
    /// a real, reported limitation, not silently claimed to be enforced.
    #[derive(uniffi::Object)]
    pub struct FfiCreateWalletSecretSession {
        // `pub(crate)`, not `pub`: reachable for deterministic test-fixture
        // construction elsewhere in this crate (see `tests::ffi_create_session`),
        // but never part of the FFI-exposed surface — UniFFI's `#[derive(Object)]`
        // only exposes what's explicitly annotated in the `impl` block below,
        // never raw struct fields, so this remains invisible to Swift/Kotlin.
        pub(crate) output: wallet_secret::CreateWalletOutput,
    }

    #[uniffi::export]
    impl FfiCreateWalletSecretSession {
        /// PUBLIC-SAFE.
        pub fn addresses(&self) -> FfiV1WalletAddresses {
            FfiV1WalletAddresses::from(&self.output.addresses)
        }

        /// NATIVE-ONLY DANGEROUS. Returns the canonical BIP-39 entropy
        /// bytes. Crossing UniFFI necessarily copies these bytes into a
        /// temporary FFI buffer and then a Swift `Data` — Rust's
        /// `Zeroizing`/erase-on-drop guarantees do not extend past this
        /// boundary; the caller is responsible for minimizing this value's
        /// lifetime and erasing it as far as Swift/Foundation allow. See
        /// Stage 5D.8A report §J — this is not overclaimed as solved here.
        pub fn dangerous_native_only_entropy_bytes(&self) -> Vec<u8> {
            self.output.entropy.as_bytes().to_vec()
        }

        /// NATIVE-ONLY DANGEROUS. Returns the mnemonic sentence, for
        /// one-time backup display only. Same FFI-copy caveat as above.
        pub fn dangerous_native_only_mnemonic_words(&self) -> String {
            self.output.mnemonic.to_string()
        }
    }

    /// NATIVE-ONLY DANGEROUS despite being a UniFFI export: returns a
    /// session object carrying secret material. Never call this from any
    /// path reachable by Expo `Function(...)`/`AsyncFunction(...)`.
    ///
    /// Composes the existing `create_wallet_v1()` (Stage 5D.4) unchanged —
    /// entropy generation, mnemonic derivation, seed derivation/erasure,
    /// and address derivation are not duplicated here.
    #[uniffi::export]
    pub fn dangerous_native_only_create_wallet_v1()
    -> Result<FfiCreateWalletSecretSession, FfiWalletError> {
        let output = wallet_secret::create_wallet_v1()?;
        Ok(FfiCreateWalletSecretSession { output })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bip39::{Language, Mnemonic};

    #[test]
    fn version_matches_package_version() {
        assert_eq!(version(), "0.1.0");
    }

    #[test]
    fn health_check_returns_pong() {
        assert_eq!(health_check(), "pong");
    }

    #[test]
    fn bip32_reference_vector_1_matches() {
        use bitcoin::Network;
        use bitcoin::bip32::{DerivationPath, Xpriv};
        use bitcoin::secp256k1::Secp256k1;
        use std::str::FromStr;

        let seed = [
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f,
        ];

        let master = Xpriv::new_master(Network::Bitcoin, &seed).expect("valid BIP-32 master key");

        assert_eq!(
            master.to_string(),
            "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi"
        );

        let secp = Secp256k1::new();
        let path = DerivationPath::from_str("m/0'").expect("valid BIP-32 derivation path");

        let child = master
            .derive_priv(&secp, &path)
            .expect("valid BIP-32 child derivation");

        assert_eq!(
            child.to_string(),
            "xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7"
        );
    }

    #[test]
    fn bip39_reference_vector_1_matches() {
        let entropy = [0u8; 16];

        let mnemonic =
            Mnemonic::from_entropy_in(Language::English, &entropy).expect("valid BIP-39 entropy");

        assert_eq!(
            mnemonic.to_string(),
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        );

        let seed = mnemonic.to_seed("TREZOR");

        let expected_seed = [
            0xc5, 0x52, 0x57, 0xc3, 0x60, 0xc0, 0x7c, 0x72, 0x02, 0x9a, 0xeb, 0xc1, 0xb5, 0x3c,
            0x05, 0xed, 0x03, 0x62, 0xad, 0xa3, 0x8e, 0xad, 0x3e, 0x3e, 0x9e, 0xfa, 0x37, 0x08,
            0xe5, 0x34, 0x95, 0x53, 0x1f, 0x09, 0xa6, 0x98, 0x75, 0x99, 0xd1, 0x82, 0x64, 0xc1,
            0xe1, 0xc9, 0x2f, 0x2c, 0xf1, 0x41, 0x63, 0x0c, 0x7a, 0x3c, 0x4a, 0xb7, 0xc8, 0x1b,
            0x2f, 0x00, 0x16, 0x98, 0xe7, 0x46, 0x3b, 0x04,
        ];

        assert_eq!(seed, expected_seed);
    }

    mod v1_derivation_paths {
        use super::super::derivation::{V1DerivationPath, derive_v1};
        use bitcoin::bip32::DerivationPath;
        use std::str::FromStr;

        /// Fixed, deterministic test-only seed — not a real recovered secret.
        const REFERENCE_SEED: [u8; 32] = [
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b,
            0x1c, 0x1d, 0x1e, 0x1f,
        ];

        #[test]
        fn ethereum_v1_path_parses() {
            DerivationPath::from_str("m/44'/60'/0'/0/0").expect("valid ADR-003 Ethereum V1 path");
        }

        #[test]
        fn bitcoin_receive_v1_path_parses() {
            DerivationPath::from_str("m/84'/0'/0'/0/0")
                .expect("valid ADR-003 Bitcoin receive V1 path");
        }

        #[test]
        fn bitcoin_change_v1_path_parses() {
            DerivationPath::from_str("m/84'/0'/0'/1/0")
                .expect("valid ADR-003 Bitcoin change V1 path");
        }

        #[test]
        fn v1_paths_derive_deterministically_from_seed() {
            let ethereum_first = derive_v1(&REFERENCE_SEED, V1DerivationPath::EthereumV1);
            let ethereum_second = derive_v1(&REFERENCE_SEED, V1DerivationPath::EthereumV1);
            assert_eq!(ethereum_first.to_string(), ethereum_second.to_string());

            let receive_first = derive_v1(&REFERENCE_SEED, V1DerivationPath::BitcoinReceiveV1);
            let receive_second = derive_v1(&REFERENCE_SEED, V1DerivationPath::BitcoinReceiveV1);
            assert_eq!(receive_first.to_string(), receive_second.to_string());

            let change_first = derive_v1(&REFERENCE_SEED, V1DerivationPath::BitcoinChangeV1);
            let change_second = derive_v1(&REFERENCE_SEED, V1DerivationPath::BitcoinChangeV1);
            assert_eq!(change_first.to_string(), change_second.to_string());
        }

        #[test]
        fn v1_paths_derive_to_distinct_keys() {
            let ethereum = derive_v1(&REFERENCE_SEED, V1DerivationPath::EthereumV1);
            let receive = derive_v1(&REFERENCE_SEED, V1DerivationPath::BitcoinReceiveV1);
            let change = derive_v1(&REFERENCE_SEED, V1DerivationPath::BitcoinChangeV1);

            assert_ne!(ethereum.to_string(), receive.to_string());
            assert_ne!(ethereum.to_string(), change.to_string());
            assert_ne!(receive.to_string(), change.to_string());
        }
    }

    mod v1_bitcoin_addresses {
        use super::super::derivation::{BitcoinAddressKindV1, derive_bitcoin_v1_address};
        use bip39::Mnemonic;
        use std::str::FromStr;
        use zeroize::Zeroizing;

        /// BIP-84 spec's own test-vector mnemonic (also BIP-39 test vector 1),
        /// used here with an empty passphrase per the BIP-84 spec's own vectors —
        /// not a real recovered secret.
        const BIP84_SPEC_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        /// Reference addresses reproduced verbatim from the BIP-84 spec's own
        /// published test vectors (bitcoin/bips, bip-0084.mediawiki), derived
        /// independently of this crate's implementation.
        const BIP84_SPEC_FIRST_RECEIVE_ADDRESS: &str = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
        const BIP84_SPEC_FIRST_CHANGE_ADDRESS: &str = "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el";

        // Zeroizing<[u8; 64]> zeroizes this owned seed buffer on drop.
        fn reference_seed() -> Zeroizing<[u8; 64]> {
            let mnemonic = Mnemonic::from_str(BIP84_SPEC_MNEMONIC).expect("valid BIP-39 mnemonic");
            mnemonic.to_seed("").into()
        }

        #[test]
        fn receive_index_0_matches_bip84_spec_vector() {
            let address = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Receive,
            );
            assert_eq!(address.to_string(), BIP84_SPEC_FIRST_RECEIVE_ADDRESS);
        }

        #[test]
        fn change_index_0_matches_bip84_spec_vector() {
            let address = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Change,
            );
            assert_eq!(address.to_string(), BIP84_SPEC_FIRST_CHANGE_ADDRESS);
        }

        #[test]
        fn receive_and_change_addresses_are_distinct() {
            let receive = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Receive,
            );
            let change = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Change,
            );
            assert_ne!(receive.to_string(), change.to_string());
        }

        #[test]
        fn addresses_are_mainnet_native_segwit_bech32() {
            let receive = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Receive,
            );
            let change = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Change,
            );

            // "bc1q" is the mainnet native-SegWit-v0 (P2WPKH) bech32 prefix; a
            // testnet or non-SegWit-v0 address would not produce this prefix.
            assert!(receive.to_string().starts_with("bc1q"));
            assert!(change.to_string().starts_with("bc1q"));
        }
    }

    mod v1_ethereum_address {
        use super::super::derivation::{
            BitcoinAddressKindV1, derive_bitcoin_v1_address, derive_ethereum_v1_address,
        };
        use bip39::Mnemonic;
        use std::str::FromStr;
        use zeroize::Zeroizing;

        /// BIP-39 test vector 1 mnemonic, empty passphrase — not a real recovered
        /// secret. Same mnemonic as `v1_bitcoin_addresses`, but Ethereum's
        /// `m/44'/60'/.../0/0` branch is structurally disjoint from Bitcoin's
        /// `m/84'/0'/...` branch (ADR-003 §9), so both derive from one seed safely.
        const REFERENCE_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        /// Reference address for `m/44'/60'/0'/0/0` derived from
        /// `REFERENCE_MNEMONIC` (empty passphrase), cross-checked independently
        /// against two separate external implementations (ethers.js
        /// `HDNodeWallet.fromPhrase` and the @scure/@noble bip32/bip39/secp256k1
        /// stack), not derived from this crate's own implementation.
        const EXPECTED_CHECKSUM_ADDRESS: &str = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
        const EXPECTED_LOWERCASE_ADDRESS: &str = "0x9858effd232b4033e47d90003d41ec34ecaeda94";

        // Zeroizing<[u8; 64]> zeroizes this owned seed buffer on drop.
        fn reference_seed() -> Zeroizing<[u8; 64]> {
            let mnemonic = Mnemonic::from_str(REFERENCE_MNEMONIC).expect("valid BIP-39 mnemonic");
            mnemonic.to_seed("").into()
        }

        #[test]
        fn ethereum_v1_address_matches_reference_checksum() {
            let address = derive_ethereum_v1_address(reference_seed().as_slice());
            assert_eq!(address, EXPECTED_CHECKSUM_ADDRESS);
        }

        #[test]
        fn ethereum_v1_address_matches_reference_lowercase() {
            let address = derive_ethereum_v1_address(reference_seed().as_slice());
            assert_eq!(address.to_lowercase(), EXPECTED_LOWERCASE_ADDRESS);
        }

        #[test]
        fn ethereum_v1_address_derives_deterministically() {
            let first = derive_ethereum_v1_address(reference_seed().as_slice());
            let second = derive_ethereum_v1_address(reference_seed().as_slice());
            assert_eq!(first, second);
        }

        #[test]
        fn ethereum_address_is_distinct_from_bitcoin_v1_addresses() {
            let ethereum = derive_ethereum_v1_address(reference_seed().as_slice());
            let receive = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Receive,
            )
            .to_string();
            let change = derive_bitcoin_v1_address(
                reference_seed().as_slice(),
                BitcoinAddressKindV1::Change,
            )
            .to_string();

            assert_ne!(ethereum, receive);
            assert_ne!(ethereum, change);
        }
    }

    mod v1_wallet_secret {
        use super::super::wallet_secret::{
            V1WalletAddresses, WalletError, derive_v1_wallet_addresses, entropy_from_mnemonic,
            generate_v1_entropy, mnemonic_from_entropy, parse_import_mnemonic, seed_from_mnemonic,
        };
        use bip39::Mnemonic;
        use std::str::FromStr;

        /// BIP-39 test vector 1 entropy/mnemonic — not a real recovered secret.
        const ZERO_ENTROPY_12_WORD_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        #[test]
        fn production_entropy_generation_succeeds() {
            // Only checks the CSPRNG path doesn't error; never prints/logs the
            // generated value.
            let entropy = generate_v1_entropy().expect("OS CSPRNG should succeed");
            assert_eq!(entropy.len(), 16);
        }

        #[test]
        fn fixed_entropy_produces_expected_12_word_mnemonic() {
            let entropy = [0u8; 16];
            let mnemonic = mnemonic_from_entropy(&entropy);
            assert_eq!(mnemonic.to_string(), ZERO_ENTROPY_12_WORD_MNEMONIC);
        }

        #[test]
        fn mnemonic_to_entropy_round_trips() {
            let entropy = [0u8; 16];
            let mnemonic = mnemonic_from_entropy(&entropy);
            let (recovered, len) = entropy_from_mnemonic(&mnemonic);
            assert_eq!(len, 16);
            assert_eq!(&recovered[..len], &entropy[..]);
        }

        #[test]
        fn valid_12_word_import_succeeds() {
            let mnemonic = mnemonic_from_entropy(&[0u8; 16]);
            let imported = parse_import_mnemonic(&mnemonic.to_string()).expect("valid mnemonic");
            assert_eq!(imported.to_string(), mnemonic.to_string());
        }

        #[test]
        fn valid_15_word_import_succeeds() {
            let entropy = [0u8; 20];
            let mnemonic =
                Mnemonic::from_entropy_in(bip39::Language::English, &entropy).expect("valid");
            assert_eq!(mnemonic.word_count(), 15);
            let imported = parse_import_mnemonic(&mnemonic.to_string()).expect("valid mnemonic");
            assert_eq!(imported.to_string(), mnemonic.to_string());
        }

        #[test]
        fn valid_18_word_import_succeeds() {
            let entropy = [0u8; 24];
            let mnemonic =
                Mnemonic::from_entropy_in(bip39::Language::English, &entropy).expect("valid");
            assert_eq!(mnemonic.word_count(), 18);
            let imported = parse_import_mnemonic(&mnemonic.to_string()).expect("valid mnemonic");
            assert_eq!(imported.to_string(), mnemonic.to_string());
        }

        #[test]
        fn valid_21_word_import_succeeds() {
            let entropy = [0u8; 28];
            let mnemonic =
                Mnemonic::from_entropy_in(bip39::Language::English, &entropy).expect("valid");
            assert_eq!(mnemonic.word_count(), 21);
            let imported = parse_import_mnemonic(&mnemonic.to_string()).expect("valid mnemonic");
            assert_eq!(imported.to_string(), mnemonic.to_string());
        }

        #[test]
        fn valid_24_word_import_succeeds() {
            let entropy = [0u8; 32];
            let mnemonic =
                Mnemonic::from_entropy_in(bip39::Language::English, &entropy).expect("valid");
            assert_eq!(mnemonic.word_count(), 24);
            let imported = parse_import_mnemonic(&mnemonic.to_string()).expect("valid mnemonic");
            assert_eq!(imported.to_string(), mnemonic.to_string());
        }

        #[test]
        fn invalid_word_count_is_rejected() {
            let thirteen_words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
            assert_eq!(
                parse_import_mnemonic(thirteen_words),
                Err(WalletError::InvalidWordCount)
            );
        }

        #[test]
        fn unrecognized_word_is_rejected() {
            let bad_word = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon notabip39word";
            assert_eq!(
                parse_import_mnemonic(bad_word),
                Err(WalletError::UnrecognizedWord)
            );
        }

        #[test]
        fn checksum_invalid_mnemonic_is_rejected() {
            // Same word count and only wordlist words, but the substitution
            // breaks the checksum relationship to the encoded entropy.
            let corrupted = "zoo abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
            assert_eq!(
                parse_import_mnemonic(corrupted),
                Err(WalletError::ChecksumFailed)
            );
        }

        #[test]
        fn seed_from_mnemonic_matches_known_bip39_vector() {
            let mnemonic = Mnemonic::from_str(ZERO_ENTROPY_12_WORD_MNEMONIC).expect("valid");
            let seed = seed_from_mnemonic(&mnemonic, "TREZOR");
            let expected_seed = [
                0xc5, 0x52, 0x57, 0xc3, 0x60, 0xc0, 0x7c, 0x72, 0x02, 0x9a, 0xeb, 0xc1, 0xb5, 0x3c,
                0x05, 0xed, 0x03, 0x62, 0xad, 0xa3, 0x8e, 0xad, 0x3e, 0x3e, 0x9e, 0xfa, 0x37, 0x08,
                0xe5, 0x34, 0x95, 0x53, 0x1f, 0x09, 0xa6, 0x98, 0x75, 0x99, 0xd1, 0x82, 0x64, 0xc1,
                0xe1, 0xc9, 0x2f, 0x2c, 0xf1, 0x41, 0x63, 0x0c, 0x7a, 0x3c, 0x4a, 0xb7, 0xc8, 0x1b,
                0x2f, 0x00, 0x16, 0x98, 0xe7, 0x46, 0x3b, 0x04,
            ];
            assert_eq!(*seed, expected_seed);
        }

        #[test]
        fn address_bundle_matches_established_reference_outputs() {
            let mnemonic = Mnemonic::from_str(ZERO_ENTROPY_12_WORD_MNEMONIC).expect("valid");
            let seed = seed_from_mnemonic(&mnemonic, "");
            let addresses = derive_v1_wallet_addresses(seed.as_slice());
            assert_eq!(
                addresses,
                V1WalletAddresses {
                    ethereum: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94".to_owned(),
                    bitcoin_receive: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu".to_owned(),
                    bitcoin_change: "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el".to_owned(),
                }
            );
        }

        #[test]
        fn address_composition_is_deterministic() {
            let mnemonic = Mnemonic::from_str(ZERO_ENTROPY_12_WORD_MNEMONIC).expect("valid");
            let seed = seed_from_mnemonic(&mnemonic, "");
            let first = derive_v1_wallet_addresses(seed.as_slice());
            let second = derive_v1_wallet_addresses(seed.as_slice());
            assert_eq!(first, second);
        }
    }

    mod v1_wallet_composition {
        use super::super::wallet_secret::{
            CreateWalletOutput, ImportWalletOutput, WalletError, create_wallet_v1, import_wallet_v1,
        };

        /// BIP-39 test vector 1 mnemonic — not a real recovered secret.
        const ZERO_ENTROPY_12_WORD_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        #[test]
        fn create_wallet_succeeds() {
            // Never prints/logs/snapshots the generated mnemonic or entropy.
            create_wallet_v1().expect("OS CSPRNG-backed creation should succeed");
        }

        #[test]
        fn created_wallet_has_exactly_a_12_word_mnemonic() {
            let output = create_wallet_v1().expect("create should succeed");
            assert_eq!(output.mnemonic.word_count(), 12);
        }

        #[test]
        fn created_wallet_returns_non_empty_public_addresses() {
            let output = create_wallet_v1().expect("create should succeed");
            assert!(output.addresses.ethereum.starts_with("0x"));
            assert!(output.addresses.bitcoin_receive.starts_with("bc1q"));
            assert!(output.addresses.bitcoin_change.starts_with("bc1q"));
        }

        #[test]
        fn created_entropy_length_is_exactly_16_bytes() {
            let output = create_wallet_v1().expect("create should succeed");
            assert_eq!(output.entropy.as_bytes().len(), 16);
        }

        #[test]
        fn create_wallet_output_has_no_extra_fields() {
            // Destructuring names every field exactly; this fails to
            // compile if a field (e.g. a seed) is ever silently added.
            let output = create_wallet_v1().expect("create should succeed");
            let CreateWalletOutput {
                entropy: _,
                mnemonic: _,
                addresses: _,
            } = output;
        }

        #[test]
        fn import_of_reference_mnemonic_produces_established_addresses() {
            let output = import_wallet_v1(ZERO_ENTROPY_12_WORD_MNEMONIC, "")
                .expect("valid reference mnemonic");
            assert_eq!(
                output.addresses.ethereum,
                "0x9858EfFD232B4033E47d90003D41EC34EcaEda94"
            );
            assert_eq!(
                output.addresses.bitcoin_receive,
                "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
            );
            assert_eq!(
                output.addresses.bitcoin_change,
                "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el"
            );
        }

        #[test]
        fn explicit_passphrase_changes_derived_addresses() {
            let without_passphrase = import_wallet_v1(ZERO_ENTROPY_12_WORD_MNEMONIC, "")
                .expect("valid mnemonic")
                .addresses;
            let with_passphrase = import_wallet_v1(ZERO_ENTROPY_12_WORD_MNEMONIC, "TREZOR")
                .expect("valid mnemonic")
                .addresses;
            assert_ne!(without_passphrase, with_passphrase);
        }

        #[test]
        fn import_invalid_word_count_propagates_error() {
            // `ImportWalletOutput` deliberately has no Debug/PartialEq (it
            // carries secret entropy), so `matches!` is used instead of
            // `assert_eq!` — it needs neither.
            let thirteen_words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
            assert!(matches!(
                import_wallet_v1(thirteen_words, ""),
                Err(WalletError::InvalidWordCount)
            ));
        }

        #[test]
        fn import_unrecognized_word_propagates_error() {
            let bad_word = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon notabip39word";
            assert!(matches!(
                import_wallet_v1(bad_word, ""),
                Err(WalletError::UnrecognizedWord)
            ));
        }

        #[test]
        fn import_checksum_invalid_mnemonic_propagates_error() {
            let corrupted = "zoo abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
            assert!(matches!(
                import_wallet_v1(corrupted, ""),
                Err(WalletError::ChecksumFailed)
            ));
        }

        #[test]
        fn import_wallet_output_has_no_extra_fields() {
            // Destructuring names every field exactly; this fails to
            // compile if a field (e.g. a seed or the mnemonic) is ever
            // silently added.
            let output =
                import_wallet_v1(ZERO_ENTROPY_12_WORD_MNEMONIC, "").expect("valid mnemonic");
            let ImportWalletOutput {
                entropy: _,
                addresses: _,
            } = output;
        }
    }

    mod ffi_create_session {
        use super::super::ffi::{FfiCreateWalletSecretSession, FfiWalletError};
        use super::super::wallet_secret::{
            CanonicalEntropy, CreateWalletOutput, WalletError, derive_v1_wallet_addresses,
            mnemonic_from_entropy, seed_from_mnemonic,
        };
        use zeroize::Zeroizing;

        /// Same BIP-39 test vector 1 entropy/mnemonic used throughout this
        /// crate's other tests — not a real recovered secret. Constructing a
        /// session from it directly (rather than calling
        /// `dangerous_native_only_create_wallet_v1()`) avoids the flakiness
        /// of comparing independently-random production entropy, per this
        /// stage's own instruction.
        const ZERO_ENTROPY_12_WORD_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        fn deterministic_session() -> FfiCreateWalletSecretSession {
            let entropy: Zeroizing<[u8; 16]> = Zeroizing::new([0u8; 16]);
            let mnemonic = mnemonic_from_entropy(&entropy);
            let seed = seed_from_mnemonic(&mnemonic, "");
            let addresses = derive_v1_wallet_addresses(seed.as_slice());
            let output = CreateWalletOutput {
                entropy: CanonicalEntropy::from_generated_16(entropy),
                mnemonic,
                addresses,
            };
            FfiCreateWalletSecretSession { output }
        }

        #[test]
        fn addresses_match_established_reference_outputs() {
            let addresses = deterministic_session().addresses();
            assert_eq!(
                addresses.ethereum,
                "0x9858EfFD232B4033E47d90003D41EC34EcaEda94"
            );
            assert_eq!(
                addresses.bitcoin_receive,
                "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
            );
            assert_eq!(
                addresses.bitcoin_change,
                "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el"
            );
        }

        #[test]
        fn dangerous_accessors_match_established_reference_values() {
            let session = deterministic_session();
            assert_eq!(session.dangerous_native_only_entropy_bytes(), vec![0u8; 16]);
            assert_eq!(
                session.dangerous_native_only_mnemonic_words(),
                ZERO_ENTROPY_12_WORD_MNEMONIC
            );
        }

        #[test]
        fn ffi_session_has_no_extra_fields() {
            // Destructuring names every field exactly; this fails to compile
            // if a field (e.g. a raw seed) is ever silently added to the
            // session type itself. `CreateWalletOutput`'s own equivalent
            // guard (`create_wallet_output_has_no_extra_fields`, above)
            // already proves the wrapped type carries no seed/Xpriv field.
            let FfiCreateWalletSecretSession { output: _ } = deterministic_session();
        }

        #[test]
        fn wallet_error_maps_structurally_to_ffi_wallet_error() {
            assert_eq!(
                FfiWalletError::from(WalletError::EntropyGenerationFailed),
                FfiWalletError::EntropyGenerationFailed
            );
            assert_eq!(
                FfiWalletError::from(WalletError::InvalidWordCount),
                FfiWalletError::InvalidWordCount
            );
            assert_eq!(
                FfiWalletError::from(WalletError::UnrecognizedWord),
                FfiWalletError::UnrecognizedWord
            );
            assert_eq!(
                FfiWalletError::from(WalletError::ChecksumFailed),
                FfiWalletError::ChecksumFailed
            );
        }
    }
}
