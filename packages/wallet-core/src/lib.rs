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
    ///
    /// `pub(crate)`, not private: Stage 5G.1's `signing` module reuses this
    /// exact function to validate a caller-supplied mixed-case destination
    /// address's checksum — no second EIP-55 implementation.
    pub(crate) fn to_eip55_checksum_address(address_bytes: &[u8]) -> String {
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
    ///
    /// `pub(crate)`, not private: Stage 5G.1's `signing` module reuses this
    /// to render the signed-transaction/tx-hash hex strings — no second hex
    /// encoder.
    pub(crate) fn to_lower_hex(bytes: &[u8]) -> String {
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
        InvalidEntropyLength,
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

    /// Stage 5E.2: deterministically reconstructs the BIP-39 mnemonic
    /// sentence from previously-persisted canonical V1 entropy (ADR-005
    /// §2's "reveal reconstructs the sentence from the stored entropy"
    /// design) — never generates new entropy, never touches the seed.
    /// V1 accepts exactly 16 bytes (128-bit, 12-word) canonical entropy;
    /// any other length fails structurally rather than silently
    /// truncating or padding. Composes the existing `mnemonic_from_entropy`
    /// unchanged — no second BIP-39 implementation.
    pub(crate) fn mnemonic_from_canonical_entropy_v1(
        entropy: &[u8],
    ) -> Result<Mnemonic, WalletError> {
        let fixed: Zeroizing<[u8; 16]> = Zeroizing::new(
            entropy
                .try_into()
                .map_err(|_| WalletError::InvalidEntropyLength)?,
        );
        Ok(mnemonic_from_entropy(&fixed))
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

/// Ethereum V1 EIP-1559 (type 0x02) transaction signing, Stage 5G.1.
///
/// Rust-internal only: not exposed via UniFFI directly (see `mod ffi`'s
/// thin wrapper below). Composes the existing `derivation::derive_v1`
/// (Stage 5B.3) for key derivation — no second derivation implementation.
/// The derived `Xpriv`/`SecretKey` never leaves this module; only the
/// public, non-secret signed-transaction hex/hash cross out of it.
///
/// Trust-boundary design (ADR-002 §4 invariants 4/7): `ValidatedEthereumV1Transaction`
/// deliberately holds no caller-supplied signing hash field — the signing
/// hash is always computed here, from these validated fields, via the
/// canonical EIP-1559 RLP encoding. There is no code path in this module
/// that accepts an opaque hash/bytes blob and signs it blindly.
mod signing {
    use super::derivation::{V1DerivationPath, derive_v1, to_eip55_checksum_address, to_lower_hex};
    use secp256k1::{Message, Secp256k1, SecretKey};
    use sha3::{Digest, Keccak256};

    /// Structural, non-secret error categories. Never carries a secret
    /// value, a raw crypto-library error, or an RN-suppliable hash —
    /// mirrors `WalletError`'s closed-enum-of-variant-names discipline.
    #[derive(Debug, PartialEq, Eq)]
    pub(crate) enum EthereumSigningError {
        InvalidDestinationAddress,
        InvalidChainId,
        InvalidNumericField,
        InvalidCalldata,
        SigningFailed,
    }

    /// Caller-supplied, not-yet-validated V1 Ethereum transaction intent —
    /// only public transaction fields, never a private key, seed, entropy,
    /// mnemonic, xpriv, or precomputed signing hash.
    ///
    /// Every wei-denominated quantity (`value_wei_decimal`,
    /// `max_fee_per_gas_wei_decimal`, `max_priority_fee_per_gas_wei_decimal`)
    /// is a decimal-digit `String`, never a floating-point type — wei
    /// amounts routinely exceed JS's safe-integer/float-precision range.
    /// `chain_id`/`nonce`/`gas_limit` are plain integers: their realistic
    /// range never approaches any floating-point precision limit, so no
    /// string indirection is needed for them.
    #[derive(Debug, Clone)]
    pub(crate) struct EthereumV1TransactionIntent {
        pub chain_id: u64,
        pub nonce: u64,
        pub to_hex: String,
        pub value_wei_decimal: String,
        pub gas_limit: u64,
        pub max_fee_per_gas_wei_decimal: String,
        pub max_priority_fee_per_gas_wei_decimal: String,
        pub data_hex: String,
    }

    /// A structurally validated EIP-1559 V1 Ethereum transaction — every
    /// field has already been format/range checked (ADR-002 §4 invariant 4)
    /// before a value of this type can exist. All fields are public
    /// transaction data, safe to log structurally (never derived from or
    /// containing secret material).
    #[derive(Debug, PartialEq, Eq)]
    pub(crate) struct ValidatedEthereumV1Transaction {
        pub chain_id: u64,
        pub nonce: u64,
        pub to: [u8; 20],
        pub value_wei: u128,
        pub gas_limit: u64,
        pub max_fee_per_gas_wei: u128,
        pub max_priority_fee_per_gas_wei: u128,
        pub data: Vec<u8>,
    }

    /// The only value this module ever returns to a caller: a signed
    /// transaction and its hash, both non-secret, both hex-encoded.
    #[derive(Debug, PartialEq, Eq)]
    pub(crate) struct SignedEthereumV1Transaction {
        pub signed_tx_hex: String,
        pub tx_hash_hex: String,
    }

    impl EthereumV1TransactionIntent {
        /// Structural validation (ADR-002 §4 invariant 4): rejects
        /// malformed/unsupported input before any signing is attempted.
        /// Every field is independently checked; no field is trusted
        /// merely because another field is valid.
        pub(crate) fn validate(
            &self,
        ) -> Result<ValidatedEthereumV1Transaction, EthereumSigningError> {
            if self.chain_id == 0 {
                return Err(EthereumSigningError::InvalidChainId);
            }
            if self.gas_limit == 0 {
                return Err(EthereumSigningError::InvalidNumericField);
            }

            let to = parse_ethereum_address(&self.to_hex)?;

            let value_wei = parse_decimal_u128(&self.value_wei_decimal)
                .ok_or(EthereumSigningError::InvalidNumericField)?;
            let max_fee_per_gas_wei = parse_decimal_u128(&self.max_fee_per_gas_wei_decimal)
                .ok_or(EthereumSigningError::InvalidNumericField)?;
            let max_priority_fee_per_gas_wei =
                parse_decimal_u128(&self.max_priority_fee_per_gas_wei_decimal)
                    .ok_or(EthereumSigningError::InvalidNumericField)?;
            // EIP-1559 balanced-arithmetic structural check (ADR-002 §4
            // invariant 7): the priority fee can never exceed the max fee.
            if max_priority_fee_per_gas_wei > max_fee_per_gas_wei {
                return Err(EthereumSigningError::InvalidNumericField);
            }

            let data =
                parse_hex_bytes(&self.data_hex).ok_or(EthereumSigningError::InvalidCalldata)?;

            Ok(ValidatedEthereumV1Transaction {
                chain_id: self.chain_id,
                nonce: self.nonce,
                to,
                value_wei,
                gas_limit: self.gas_limit,
                max_fee_per_gas_wei,
                max_priority_fee_per_gas_wei,
                data,
            })
        }
    }

    /// Parses/validates a `0x`-prefixed, 20-byte Ethereum destination
    /// address. An all-lowercase or all-uppercase hex body is accepted
    /// without a checksum requirement; a mixed-case body must match its own
    /// EIP-55 checksum exactly or is rejected — the same convention
    /// established wallets use to catch accidental transcription/copy
    /// corruption, reusing this crate's own already-tested EIP-55 encoder
    /// (no second checksum implementation).
    fn parse_ethereum_address(hex: &str) -> Result<[u8; 20], EthereumSigningError> {
        let stripped = hex
            .strip_prefix("0x")
            .ok_or(EthereumSigningError::InvalidDestinationAddress)?;
        if stripped.len() != 40 {
            return Err(EthereumSigningError::InvalidDestinationAddress);
        }

        let mut bytes = [0u8; 20];
        for i in 0..20 {
            let byte_str = &stripped[i * 2..i * 2 + 2];
            bytes[i] = u8::from_str_radix(byte_str, 16)
                .map_err(|_| EthereumSigningError::InvalidDestinationAddress)?;
        }

        let has_upper = stripped.chars().any(|c| c.is_ascii_uppercase());
        let has_lower = stripped.chars().any(|c| c.is_ascii_lowercase());
        if has_upper && has_lower {
            let expected = to_eip55_checksum_address(&bytes);
            if expected != hex {
                return Err(EthereumSigningError::InvalidDestinationAddress);
            }
        }

        Ok(bytes)
    }

    /// Parses a plain (no sign, no separators, no leading `0x`) decimal
    /// digit string into a `u128`. `u128` comfortably covers any realistic
    /// wei-denominated quantity for native ETH (total supply is ~1.2 * 10^26
    /// wei, far under `u128::MAX`'s ~3.4 * 10^38) without needing a full
    /// 256-bit integer type.
    fn parse_decimal_u128(input: &str) -> Option<u128> {
        if input.is_empty() || input.len() > 39 || !input.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        input.parse::<u128>().ok()
    }

    /// Parses a `0x`-prefixed even-length hex byte string (`"0x"` alone
    /// means empty calldata). Structural format validation only — this
    /// module never interprets or decodes the *meaning* of calldata (e.g.
    /// as an ERC-20 `transfer` call); that belongs to a future Send/Review
    /// stage, out of this stage's scope.
    fn parse_hex_bytes(input: &str) -> Option<Vec<u8>> {
        let stripped = input.strip_prefix("0x")?;
        if stripped.len() % 2 != 0 {
            return None;
        }
        (0..stripped.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&stripped[i..i + 2], 16).ok())
            .collect()
    }

    /// Strips leading zero bytes, matching RLP's canonical "positive
    /// integer" encoding rule (no leading zero bytes; zero itself encodes
    /// as the empty string) — used for the ECDSA signature's `r`/`s`
    /// fields, which the `rlp` crate's own `u128`/`u64` integer helpers
    /// cannot represent (secp256k1 signature scalars can exceed 16 bytes).
    fn strip_leading_zeros(bytes: &[u8]) -> &[u8] {
        match bytes.iter().position(|&b| b != 0) {
            Some(index) => &bytes[index..],
            None => &[],
        }
    }

    /// The canonical EIP-1559 unsigned-transaction RLP payload (the exact
    /// preimage this module hashes and signs):
    /// `0x02 || rlp([chain_id, nonce, max_priority_fee_per_gas, max_fee_per_gas,
    /// gas_limit, to, value, data, access_list])`. `access_list` is always
    /// the empty list — access-list support is out of this V1 stage's
    /// scope.
    pub(crate) fn rlp_encode_unsigned(tx: &ValidatedEthereumV1Transaction) -> Vec<u8> {
        let mut stream = rlp::RlpStream::new();
        stream.begin_list(9);
        stream.append(&tx.chain_id);
        stream.append(&tx.nonce);
        stream.append(&tx.max_priority_fee_per_gas_wei);
        stream.append(&tx.max_fee_per_gas_wei);
        stream.append(&tx.gas_limit);
        stream.append(&tx.to.to_vec());
        stream.append(&tx.value_wei);
        stream.append(&tx.data);
        stream.begin_list(0);

        let rlp_body = stream.out();
        let mut out = Vec::with_capacity(1 + rlp_body.len());
        out.push(0x02u8);
        out.extend_from_slice(&rlp_body);
        out
    }

    /// The canonical EIP-1559 signed-transaction RLP encoding: the same 9
    /// fields as `rlp_encode_unsigned`, plus `y_parity`, `r`, `s`.
    fn rlp_encode_signed(
        tx: &ValidatedEthereumV1Transaction,
        y_parity: u8,
        r: [u8; 32],
        s: [u8; 32],
    ) -> Vec<u8> {
        let mut stream = rlp::RlpStream::new();
        stream.begin_list(12);
        stream.append(&tx.chain_id);
        stream.append(&tx.nonce);
        stream.append(&tx.max_priority_fee_per_gas_wei);
        stream.append(&tx.max_fee_per_gas_wei);
        stream.append(&tx.gas_limit);
        stream.append(&tx.to.to_vec());
        stream.append(&tx.value_wei);
        stream.append(&tx.data);
        stream.begin_list(0);
        stream.append(&y_parity);
        stream.append(&strip_leading_zeros(&r).to_vec());
        stream.append(&strip_leading_zeros(&s).to_vec());

        let rlp_body = stream.out();
        let mut out = Vec::with_capacity(1 + rlp_body.len());
        out.push(0x02u8);
        out.extend_from_slice(&rlp_body);
        out
    }

    fn keccak256(bytes: &[u8]) -> [u8; 32] {
        let digest = Keccak256::digest(bytes);
        let mut out = [0u8; 32];
        out.copy_from_slice(&digest);
        out
    }

    /// Signs an already-validated transaction with a caller-owned secret
    /// key. Deliberately takes `&SecretKey`, not a seed: this is the
    /// signing-algorithm layer, independent of key derivation, so it can be
    /// exercised directly against a known-answer key in tests without going
    /// through BIP-32 derivation at all. Never erases `secret_key` itself —
    /// it is borrowed, not owned; the caller (`sign_validated_ethereum_v1_transaction`
    /// below) is responsible for erasing its own owned copy.
    pub(crate) fn sign_validated_with_key(
        secret_key: &SecretKey,
        tx: &ValidatedEthereumV1Transaction,
    ) -> Result<SignedEthereumV1Transaction, EthereumSigningError> {
        let unsigned = rlp_encode_unsigned(tx);
        let signing_hash = keccak256(&unsigned);

        let secp = Secp256k1::new();
        let message = Message::from_digest(signing_hash);
        let recoverable_sig = secp.sign_ecdsa_recoverable(&message, secret_key);
        let (recovery_id, compact) = recoverable_sig.serialize_compact();

        let y_parity = match recovery_id.to_i32() {
            0 => 0u8,
            1 => 1u8,
            // Not expected for an uncompressed-recovery ECDSA signature on
            // this curve in practice; fails closed rather than panicking or
            // silently truncating an unexpected recovery id.
            _ => return Err(EthereumSigningError::SigningFailed),
        };
        let mut r = [0u8; 32];
        r.copy_from_slice(&compact[..32]);
        let mut s = [0u8; 32];
        s.copy_from_slice(&compact[32..]);

        let signed = rlp_encode_signed(tx, y_parity, r, s);
        let tx_hash = keccak256(&signed);

        Ok(SignedEthereumV1Transaction {
            signed_tx_hex: format!("0x{}", to_lower_hex(&signed)),
            tx_hash_hex: format!("0x{}", to_lower_hex(&tx_hash)),
        })
    }

    /// Derives the Ethereum V1 key from `seed` (composing the existing
    /// `derivation::derive_v1` unchanged — no second derivation
    /// implementation), signs `tx`, then best-effort erases its own local
    /// copy of the derived private key before returning. `seed` itself is
    /// caller-owned and not erased here — the caller (`mod ffi` below)
    /// owns that lifetime.
    pub(crate) fn sign_validated_ethereum_v1_transaction(
        seed: &[u8],
        tx: &ValidatedEthereumV1Transaction,
    ) -> Result<SignedEthereumV1Transaction, EthereumSigningError> {
        let mut xpriv = derive_v1(seed, V1DerivationPath::EthereumV1);
        let result = sign_validated_with_key(&xpriv.private_key, tx);
        // Best-effort erase; see the `derivation` module's own note on
        // Copy-type erasure limitations.
        xpriv.private_key.non_secure_erase();
        result
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
    use super::derivation;
    use super::signing;
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
        InvalidEntropyLength,
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
                wallet_secret::WalletError::InvalidEntropyLength => Self::InvalidEntropyLength,
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

    /// NATIVE-ONLY DANGEROUS, Stage 5E.2. Reconstructs the BIP-39 mnemonic
    /// sentence from previously-persisted canonical V1 entropy — the exact
    /// bytes `WalletSecureStorage.read()` returns, native-side. Never
    /// generates new entropy and never creates/retains a session; this is
    /// the "reveal reconstructs the sentence from stored entropy" path
    /// ADR-005 §2 anticipated. Composes `wallet_secret::mnemonic_from_canonical_entropy_v1`
    /// unchanged — no second BIP-39 implementation.
    ///
    /// V1 requires exactly 16 bytes of entropy; any other length fails
    /// structurally with `FfiWalletError::InvalidEntropyLength` rather than
    /// silently truncating/padding. The caller-owned `entropy` buffer is
    /// best-effort zeroed before this function returns (mirroring the
    /// `derivation` module's own `non_secure_erase()` comments: this is not
    /// a guarantee against every compiler- or allocator-level copy). Never
    /// call this from any path reachable by Expo `Function(...)`/
    /// `AsyncFunction(...)`.
    #[uniffi::export]
    pub fn dangerous_native_only_mnemonic_from_entropy_v1(
        mut entropy: Vec<u8>,
    ) -> Result<String, FfiWalletError> {
        let result = wallet_secret::mnemonic_from_canonical_entropy_v1(&entropy)
            .map(|mnemonic| mnemonic.to_string())
            .map_err(FfiWalletError::from);
        entropy.fill(0);
        result
    }

    /// PUBLIC-SAFE, Stage 5G.2.0. Returns ONLY the public V1 Ethereum
    /// address — never entropy, mnemonic, seed, private key, xpriv, or any
    /// other secret material. Despite taking entropy as a parameter (the
    /// same shape as the dangerous mnemonic-reconstruction function above),
    /// this is deliberately NOT named `dangerous_native_only_*`: that
    /// prefix (and the dedicated guard script that enforces it) exists to
    /// flag functions whose RETURN value is secret and must never reach
    /// Expo/React Native — this function's return value carries no such
    /// requirement, since Ethereum addresses are public data by design
    /// (ADR-003 §8). It must still only ever be called from native code
    /// that already holds the entropy itself (the native orchestrator
    /// reading `WalletSecureStorage`) — React Native has no entropy to
    /// supply in the first place under any correct call path, so this
    /// function's input shape does not create a secret-derivation oracle
    /// reachable from RN.
    ///
    /// Composes `wallet_secret::mnemonic_from_canonical_entropy_v1` (Stage
    /// 5D.2) and `derivation::derive_ethereum_v1_address` (Stage 5B.3)
    /// unchanged — no second BIP-39/derivation implementation, no new
    /// derivation path, and no arbitrary-path parameter: the fixed V1
    /// Ethereum path (`m/44'/60'/0'/0/0`, ADR-003 §2) is the only path this
    /// function can ever derive. V1 requires exactly 16 bytes of entropy;
    /// any other length fails structurally with
    /// `FfiWalletError::InvalidEntropyLength`. The caller-owned `entropy`
    /// buffer is best-effort zeroed before this function returns (same
    /// caveat as `dangerous_native_only_mnemonic_from_entropy_v1` above:
    /// not a guarantee against every compiler-/allocator-level copy). The
    /// derived seed is a local binding, used only for the one derivation
    /// call, and is dropped (zeroized via its own `Zeroizing` type,
    /// unchanged from `seed_from_mnemonic`) at the end of this function.
    #[uniffi::export]
    pub fn derive_ethereum_v1_address_v1(mut entropy: Vec<u8>) -> Result<String, FfiWalletError> {
        let result = wallet_secret::mnemonic_from_canonical_entropy_v1(&entropy)
            .map_err(FfiWalletError::from)
            .map(|mnemonic| wallet_secret::seed_from_mnemonic(&mnemonic, ""))
            .map(|seed| derivation::derive_ethereum_v1_address(seed.as_slice()));
        entropy.fill(0);
        result
    }

    /// PUBLIC-SAFE (input/output shape only — this record carries no secret
    /// field). Structured, public V1 Ethereum EIP-1559 transaction intent —
    /// see `signing::EthereumV1TransactionIntent`'s own doc comment for why
    /// wei-denominated quantities are decimal strings, not integers/floats.
    /// No field here can ever hold a private key, seed, entropy, mnemonic,
    /// xpriv, or precomputed signing hash — the Rust struct this converts
    /// to has no such field either.
    #[derive(uniffi::Record)]
    pub struct FfiEthereumV1TransactionIntent {
        pub chain_id: u64,
        pub nonce: u64,
        pub to_hex: String,
        pub value_wei_decimal: String,
        pub gas_limit: u64,
        pub max_fee_per_gas_wei_decimal: String,
        pub max_priority_fee_per_gas_wei_decimal: String,
        pub data_hex: String,
    }

    impl From<&FfiEthereumV1TransactionIntent> for signing::EthereumV1TransactionIntent {
        fn from(intent: &FfiEthereumV1TransactionIntent) -> Self {
            Self {
                chain_id: intent.chain_id,
                nonce: intent.nonce,
                to_hex: intent.to_hex.clone(),
                value_wei_decimal: intent.value_wei_decimal.clone(),
                gas_limit: intent.gas_limit,
                max_fee_per_gas_wei_decimal: intent.max_fee_per_gas_wei_decimal.clone(),
                max_priority_fee_per_gas_wei_decimal: intent
                    .max_priority_fee_per_gas_wei_decimal
                    .clone(),
                data_hex: intent.data_hex.clone(),
            }
        }
    }

    /// PUBLIC-SAFE. The only thing `dangerous_native_only_sign_ethereum_transaction_v1`
    /// ever returns on success: a signed transaction and its hash, both
    /// non-secret, both hex-encoded. Safe to forward to React Native.
    #[derive(uniffi::Record, Debug, PartialEq, Eq)]
    pub struct FfiSignedEthereumV1Transaction {
        pub signed_tx_hex: String,
        pub tx_hash_hex: String,
    }

    impl From<signing::SignedEthereumV1Transaction> for FfiSignedEthereumV1Transaction {
        fn from(signed: signing::SignedEthereumV1Transaction) -> Self {
            Self {
                signed_tx_hex: signed.signed_tx_hex,
                tx_hash_hex: signed.tx_hash_hex,
            }
        }
    }

    /// Structural, non-secret error categories — mirrors
    /// `signing::EthereumSigningError` exactly. No String/Debug payload, no
    /// secret value, no OS/crypto-library error detail.
    #[derive(uniffi::Error, Debug, PartialEq, Eq)]
    pub enum FfiEthereumSigningError {
        InvalidDestinationAddress,
        InvalidChainId,
        InvalidNumericField,
        InvalidCalldata,
        SigningFailed,
    }

    impl std::fmt::Display for FfiEthereumSigningError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            // Safe: this only ever prints the fixed variant name (via the
            // derived Debug), never any field — the enum has no fields.
            write!(f, "{self:?}")
        }
    }

    impl From<signing::EthereumSigningError> for FfiEthereumSigningError {
        fn from(error: signing::EthereumSigningError) -> Self {
            match error {
                signing::EthereumSigningError::InvalidDestinationAddress => {
                    Self::InvalidDestinationAddress
                }
                signing::EthereumSigningError::InvalidChainId => Self::InvalidChainId,
                signing::EthereumSigningError::InvalidNumericField => Self::InvalidNumericField,
                signing::EthereumSigningError::InvalidCalldata => Self::InvalidCalldata,
                signing::EthereumSigningError::SigningFailed => Self::SigningFailed,
            }
        }
    }

    /// NATIVE-ONLY DANGEROUS, Stage 5G.1. Takes caller-owned entropy (the
    /// exact bytes `WalletSecureStorage.read()` returns, native-side —
    /// best-effort zeroed before this function returns, mirroring
    /// `dangerous_native_only_mnemonic_from_entropy_v1` above) plus a
    /// structured, public transaction intent. Reconstructs the mnemonic and
    /// derives the seed internally (empty passphrase — matches
    /// `create_wallet_v1`'s current V1-only behavior; a passphrase-protected
    /// imported wallet is out of this stage's scope, see the report's Risks
    /// section), derives the Ethereum V1 signing key internally, validates
    /// and signs the transaction, and returns ONLY the signed transaction
    /// hex and its hash. The private key never leaves this function — it is
    /// never returned, never logged, and this function has no code path
    /// that could expose it. Never call this from any path reachable by
    /// Expo `Function(...)`/`AsyncFunction(...)`.
    ///
    /// Single sensitive native operation, by design (Stage 5G.1's own audit
    /// conclusion, §D): there is no separate "authorize signing" call and no
    /// reusable authorization/session state anywhere in this crate — the
    /// native caller (a future `WalletEthereumSigningPresenter`-style
    /// orchestrator, not built in this stage) is expected to perform its
    /// own fresh `WalletBiometricAuthorizer.authorize(...)` immediately
    /// before calling this function, every single time.
    #[uniffi::export]
    pub fn dangerous_native_only_sign_ethereum_transaction_v1(
        mut entropy: Vec<u8>,
        intent: FfiEthereumV1TransactionIntent,
    ) -> Result<FfiSignedEthereumV1Transaction, FfiEthereumSigningError> {
        let internal_intent = signing::EthereumV1TransactionIntent::from(&intent);

        let result = internal_intent.validate().and_then(|validated| {
            let mnemonic = wallet_secret::mnemonic_from_canonical_entropy_v1(&entropy)
                .map_err(|_| signing::EthereumSigningError::SigningFailed)?;
            let seed = wallet_secret::seed_from_mnemonic(&mnemonic, "");
            signing::sign_validated_ethereum_v1_transaction(seed.as_slice(), &validated)
        });

        entropy.fill(0);

        result
            .map(FfiSignedEthereumV1Transaction::from)
            .map_err(FfiEthereumSigningError::from)
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
            generate_v1_entropy, mnemonic_from_canonical_entropy_v1, mnemonic_from_entropy,
            parse_import_mnemonic, seed_from_mnemonic,
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
        fn canonical_entropy_reconstructs_expected_12_word_mnemonic() {
            let mnemonic =
                mnemonic_from_canonical_entropy_v1(&[0u8; 16]).expect("valid 16-byte entropy");
            assert_eq!(mnemonic.to_string(), ZERO_ENTROPY_12_WORD_MNEMONIC);
        }

        #[test]
        fn canonical_entropy_reconstruction_is_deterministic() {
            let first = mnemonic_from_canonical_entropy_v1(&[0u8; 16]).expect("valid entropy");
            let second = mnemonic_from_canonical_entropy_v1(&[0u8; 16]).expect("valid entropy");
            assert_eq!(first.to_string(), second.to_string());
        }

        #[test]
        fn canonical_entropy_wrong_length_is_rejected() {
            assert_eq!(
                mnemonic_from_canonical_entropy_v1(&[0u8; 15]),
                Err(WalletError::InvalidEntropyLength)
            );
            assert_eq!(
                mnemonic_from_canonical_entropy_v1(&[0u8; 17]),
                Err(WalletError::InvalidEntropyLength)
            );
            assert_eq!(
                mnemonic_from_canonical_entropy_v1(&[]),
                Err(WalletError::InvalidEntropyLength)
            );
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
            assert_eq!(
                FfiWalletError::from(WalletError::InvalidEntropyLength),
                FfiWalletError::InvalidEntropyLength
            );
        }
    }

    mod ffi_mnemonic_from_entropy {
        use super::super::ffi::{FfiWalletError, dangerous_native_only_mnemonic_from_entropy_v1};

        /// Same BIP-39 test vector 1 entropy/mnemonic used throughout this
        /// crate's other tests — not a real recovered secret.
        const ZERO_ENTROPY_12_WORD_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        #[test]
        fn reconstructs_expected_mnemonic_from_valid_entropy() {
            let mnemonic = dangerous_native_only_mnemonic_from_entropy_v1(vec![0u8; 16])
                .expect("valid 16-byte entropy");
            assert_eq!(mnemonic, ZERO_ENTROPY_12_WORD_MNEMONIC);
        }

        #[test]
        fn is_deterministic_for_the_same_entropy() {
            let first = dangerous_native_only_mnemonic_from_entropy_v1(vec![0u8; 16])
                .expect("valid entropy");
            let second = dangerous_native_only_mnemonic_from_entropy_v1(vec![0u8; 16])
                .expect("valid entropy");
            assert_eq!(first, second);
        }

        #[test]
        fn invalid_entropy_length_fails_structurally() {
            assert_eq!(
                dangerous_native_only_mnemonic_from_entropy_v1(vec![0u8; 15]),
                Err(FfiWalletError::InvalidEntropyLength)
            );
            assert_eq!(
                dangerous_native_only_mnemonic_from_entropy_v1(vec![0u8; 32]),
                Err(FfiWalletError::InvalidEntropyLength)
            );
            assert_eq!(
                dangerous_native_only_mnemonic_from_entropy_v1(Vec::new()),
                Err(FfiWalletError::InvalidEntropyLength)
            );
        }
    }

    mod ffi_ethereum_address {
        use super::super::ffi::{FfiWalletError, derive_ethereum_v1_address_v1};

        /// Same BIP-39 test vector 1 entropy used throughout this crate's
        /// other tests — not a real recovered secret. Reference address
        /// cross-checked independently in Stage 5B.3/5D.4's own tests
        /// (`v1_ethereum_address`, `ffi_create_session`), not re-derived
        /// from this crate's own implementation here.
        const EXPECTED_CHECKSUM_ADDRESS: &str = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";

        #[test]
        fn derives_expected_address_from_valid_entropy() {
            let address =
                derive_ethereum_v1_address_v1(vec![0u8; 16]).expect("valid 16-byte entropy");
            assert_eq!(address, EXPECTED_CHECKSUM_ADDRESS);
        }

        #[test]
        fn is_deterministic_for_the_same_entropy() {
            let first = derive_ethereum_v1_address_v1(vec![0u8; 16]).expect("valid entropy");
            let second = derive_ethereum_v1_address_v1(vec![0u8; 16]).expect("valid entropy");
            assert_eq!(first, second);
        }

        #[test]
        fn distinct_entropy_derives_a_distinct_address() {
            let first = derive_ethereum_v1_address_v1(vec![0u8; 16]).expect("valid entropy");
            let second = derive_ethereum_v1_address_v1(vec![0xAB; 16]).expect("valid entropy");
            assert_ne!(first, second);
        }

        #[test]
        fn invalid_entropy_length_fails_structurally() {
            assert_eq!(
                derive_ethereum_v1_address_v1(vec![0u8; 15]),
                Err(FfiWalletError::InvalidEntropyLength)
            );
            assert_eq!(
                derive_ethereum_v1_address_v1(vec![0u8; 32]),
                Err(FfiWalletError::InvalidEntropyLength)
            );
            assert_eq!(
                derive_ethereum_v1_address_v1(Vec::new()),
                Err(FfiWalletError::InvalidEntropyLength)
            );
        }

        /// This function returns a bare `String` — there is no struct/enum
        /// shape here that could grow a second, secret-bearing field the
        /// way a `Record`/`Object` type could. This test exists mainly to
        /// document that fact structurally: the return type itself is
        /// `Result<String, FfiWalletError>`, nothing else, verified simply
        /// by this call compiling and the value behaving as a plain string.
        #[test]
        fn return_value_is_a_bare_public_address_string() {
            let address = derive_ethereum_v1_address_v1(vec![0u8; 16]).expect("valid entropy");
            assert!(address.starts_with("0x"));
            assert_eq!(address.len(), 42);
        }
    }

    mod ethereum_signing {
        use super::super::signing::{
            EthereumSigningError, EthereumV1TransactionIntent, rlp_encode_unsigned,
            sign_validated_ethereum_v1_transaction, sign_validated_with_key,
        };
        use secp256k1::ecdsa::{RecoverableSignature, RecoveryId};
        use secp256k1::{Message, PublicKey, Secp256k1, SecretKey};
        use sha3::{Digest, Keccak256};

        /// A fixed, widely-published TEST-ONLY secret key (Hardhat/Anvil
        /// local test-network default account #0's private key) — never a
        /// real mainnet key, and deliberately NOT derived via this crate's
        /// own BIP-32 derivation code, so it is a genuinely independent
        /// ground truth for the reference-vector tests below (independent
        /// of `derive_v1`, not merely a different call to the same
        /// derivation function).
        const REFERENCE_SECRET_KEY_BYTES: [u8; 32] = [
            0xac, 0x09, 0x74, 0xbe, 0xc3, 0x9a, 0x17, 0xe3, 0x6b, 0xa4, 0xa6, 0xb4, 0xd2, 0x38,
            0xff, 0x94, 0x4b, 0xac, 0xb4, 0x78, 0xcb, 0xed, 0x5e, 0xfc, 0xae, 0x78, 0x4d, 0x7b,
            0xf4, 0xf2, 0xff, 0x80,
        ];

        fn reference_secret_key() -> SecretKey {
            SecretKey::from_slice(&REFERENCE_SECRET_KEY_BYTES).expect("valid secp256k1 scalar")
        }

        fn reference_intent() -> EthereumV1TransactionIntent {
            EthereumV1TransactionIntent {
                chain_id: 1,
                nonce: 0,
                to_hex: "0x000000000000000000000000000000000000dEaD".to_string(),
                value_wei_decimal: "1000000000000000000".to_string(), // 1 ETH
                gas_limit: 21000,
                max_fee_per_gas_wei_decimal: "30000000000".to_string(), // 30 gwei
                max_priority_fee_per_gas_wei_decimal: "1000000000".to_string(), // 1 gwei
                data_hex: "0x".to_string(),
            }
        }

        /// Independently decodes `signed_tx_hex`'s RLP structure (using the
        /// `rlp` crate's own *decoder*, a different code path from the
        /// `RlpStream` *encoder* this crate's signing code uses to produce
        /// it) and recovers the signer's public key via secp256k1's own
        /// ECDSA recovery math — mathematically distinct from ECDSA
        /// signature creation, even though both live in the same
        /// underlying library. This is not "call the same function again."
        fn recover_signer_public_key(
            signed_tx_hex: &str,
            tx: &super::super::signing::ValidatedEthereumV1Transaction,
        ) -> PublicKey {
            let hex_body = signed_tx_hex.strip_prefix("0x").expect("0x-prefixed");
            let bytes = decode_hex(hex_body);
            assert_eq!(bytes[0], 0x02, "type-0x02 transaction envelope prefix byte");

            let rlp = rlp::Rlp::new(&bytes[1..]);
            assert_eq!(rlp.item_count().expect("valid RLP list"), 12);
            let y_parity: u8 = rlp
                .at(9)
                .expect("y_parity field")
                .as_val()
                .expect("valid y_parity");
            let r_bytes = rlp
                .at(10)
                .expect("r field")
                .data()
                .expect("valid r bytes")
                .to_vec();
            let s_bytes = rlp
                .at(11)
                .expect("s field")
                .data()
                .expect("valid s bytes")
                .to_vec();

            let mut compact = [0u8; 64];
            compact[32 - r_bytes.len()..32].copy_from_slice(&r_bytes);
            compact[64 - s_bytes.len()..64].copy_from_slice(&s_bytes);

            let recovery_id = RecoveryId::from_i32(y_parity as i32).expect("valid recovery id");
            let recoverable_sig =
                RecoverableSignature::from_compact(&compact, recovery_id).expect("valid signature");

            let unsigned = rlp_encode_unsigned(tx);
            let digest = Keccak256::digest(unsigned.as_slice());
            let mut signing_hash = [0u8; 32];
            signing_hash.copy_from_slice(&digest);
            let message = Message::from_digest(signing_hash);

            let secp = Secp256k1::new();
            secp.recover_ecdsa(&message, &recoverable_sig)
                .expect("recovery should succeed for a validly-produced signature")
        }

        fn decode_hex(hex: &str) -> Vec<u8> {
            (0..hex.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("valid hex"))
                .collect()
        }

        #[test]
        fn signature_recovers_to_the_known_signer_public_key() {
            let secret_key = reference_secret_key();
            let secp = Secp256k1::new();
            let expected_public_key = PublicKey::from_secret_key(&secp, &secret_key);

            let validated = reference_intent()
                .validate()
                .expect("valid reference intent");
            let signed =
                sign_validated_with_key(&secret_key, &validated).expect("signing should succeed");

            let recovered = recover_signer_public_key(&signed.signed_tx_hex, &validated);
            assert_eq!(recovered, expected_public_key);
        }

        #[test]
        fn signing_is_deterministic_for_the_same_key_and_transaction() {
            let secret_key = reference_secret_key();
            let validated = reference_intent()
                .validate()
                .expect("valid reference intent");

            let first = sign_validated_with_key(&secret_key, &validated).expect("signs");
            let second = sign_validated_with_key(&secret_key, &validated).expect("signs");

            assert_eq!(first, second);
        }

        #[test]
        fn signed_tx_hash_is_the_keccak256_of_the_signed_tx_bytes() {
            let secret_key = reference_secret_key();
            let validated = reference_intent()
                .validate()
                .expect("valid reference intent");
            let signed = sign_validated_with_key(&secret_key, &validated).expect("signs");

            let signed_bytes = decode_hex(
                signed
                    .signed_tx_hex
                    .strip_prefix("0x")
                    .expect("0x-prefixed"),
            );
            let expected_hash_bytes = Keccak256::digest(signed_bytes.as_slice());
            let expected_hash_hex = format!("0x{}", hex_encode(&expected_hash_bytes));

            assert_eq!(signed.tx_hash_hex, expected_hash_hex);
        }

        fn hex_encode(bytes: &[u8]) -> String {
            bytes.iter().map(|b| format!("{b:02x}")).collect()
        }

        /// Mutating any single field of an otherwise-identical intent
        /// changes the resulting signature/hash. Combined with the plain
        /// fact that neither `EthereumV1TransactionIntent` nor
        /// `ValidatedEthereumV1Transaction` has a hash field anywhere in
        /// their definitions (see this module's own source), this
        /// demonstrates the signing hash is always derived from these
        /// structured fields — there is no alternate channel by which a
        /// caller could supply a precomputed hash instead.
        #[test]
        fn mutating_any_intent_field_changes_the_signing_result() {
            let secret_key = reference_secret_key();

            let base_signed = sign_validated_with_key(
                &secret_key,
                &reference_intent().validate().expect("valid"),
            )
            .expect("signs");

            let mut nonce_changed = reference_intent();
            nonce_changed.nonce = 1;
            let nonce_signed =
                sign_validated_with_key(&secret_key, &nonce_changed.validate().expect("valid"))
                    .expect("signs");
            assert_ne!(base_signed, nonce_signed);

            let mut value_changed = reference_intent();
            value_changed.value_wei_decimal = "2000000000000000000".to_string();
            let value_signed =
                sign_validated_with_key(&secret_key, &value_changed.validate().expect("valid"))
                    .expect("signs");
            assert_ne!(base_signed, value_signed);

            let mut to_changed = reference_intent();
            to_changed.to_hex = "0x000000000000000000000000000000000000beef".to_string();
            let to_signed =
                sign_validated_with_key(&secret_key, &to_changed.validate().expect("valid"))
                    .expect("signs");
            assert_ne!(base_signed, to_signed);

            let mut chain_id_changed = reference_intent();
            chain_id_changed.chain_id = 11155111; // Sepolia, still a valid chain id
            let chain_id_signed =
                sign_validated_with_key(&secret_key, &chain_id_changed.validate().expect("valid"))
                    .expect("signs");
            assert_ne!(base_signed, chain_id_signed);

            let mut data_changed = reference_intent();
            data_changed.data_hex = "0x1234".to_string();
            let data_signed =
                sign_validated_with_key(&secret_key, &data_changed.validate().expect("valid"))
                    .expect("signs");
            assert_ne!(base_signed, data_signed);
        }

        /// Proves the seed-based composed entry point (`mod ffi`'s actual
        /// production call) agrees exactly with the lower-level, key-based
        /// `sign_validated_with_key` this test file otherwise exercises
        /// directly — i.e. `derive_v1` composition introduces no
        /// discrepancy. Reuses this crate's existing BIP-39 test-vector-1
        /// seed convention — not a real recovered secret.
        #[test]
        fn seed_based_entry_point_matches_direct_key_based_signing() {
            let seed = [
                0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
                0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b,
                0x1c, 0x1d, 0x1e, 0x1f,
            ];
            let validated = reference_intent()
                .validate()
                .expect("valid reference intent");

            let via_seed = sign_validated_ethereum_v1_transaction(&seed, &validated)
                .expect("seed-based signing should succeed");

            let xpriv = super::super::derivation::derive_v1(
                &seed,
                super::super::derivation::V1DerivationPath::EthereumV1,
            );
            let via_key = sign_validated_with_key(&xpriv.private_key, &validated)
                .expect("key-based signing should succeed");

            assert_eq!(via_seed, via_key);
        }

        #[test]
        fn malformed_destination_address_is_rejected() {
            let cases = [
                "000000000000000000000000000000000000dead",   // missing 0x
                "0xdead",                                     // too short
                "0x000000000000000000000000000000000000dexy", // invalid hex chars
                "0x000000000000000000000000000000000000DEAD0", // too long
                "0x000000000000000000000000000000000000dEAD", // mixed case, wrong checksum
            ];
            for to_hex in cases {
                let mut intent = reference_intent();
                intent.to_hex = to_hex.to_string();
                assert_eq!(
                    intent.validate(),
                    Err(EthereumSigningError::InvalidDestinationAddress),
                    "expected rejection for {to_hex:?}"
                );
            }
        }

        #[test]
        fn all_lowercase_or_all_uppercase_address_is_accepted_without_checksum() {
            let mut lower = reference_intent();
            lower.to_hex = "0x000000000000000000000000000000000000dead".to_string();
            assert!(lower.validate().is_ok());

            let mut upper = reference_intent();
            upper.to_hex = "0x000000000000000000000000000000000000DEAD".to_string();
            assert!(upper.validate().is_ok());
        }

        #[test]
        fn zero_chain_id_is_rejected() {
            let mut intent = reference_intent();
            intent.chain_id = 0;
            assert_eq!(intent.validate(), Err(EthereumSigningError::InvalidChainId));
        }

        #[test]
        fn zero_gas_limit_is_rejected() {
            let mut intent = reference_intent();
            intent.gas_limit = 0;
            assert_eq!(
                intent.validate(),
                Err(EthereumSigningError::InvalidNumericField)
            );
        }

        #[test]
        fn invalid_numeric_fields_are_rejected() {
            for field_setter in [
                (|i: &mut EthereumV1TransactionIntent| i.value_wei_decimal = "".to_string())
                    as fn(&mut EthereumV1TransactionIntent),
                |i: &mut EthereumV1TransactionIntent| i.value_wei_decimal = "12.5".to_string(),
                |i: &mut EthereumV1TransactionIntent| i.value_wei_decimal = "-1".to_string(),
                |i: &mut EthereumV1TransactionIntent| i.value_wei_decimal = "0x10".to_string(),
                |i: &mut EthereumV1TransactionIntent| {
                    i.max_fee_per_gas_wei_decimal = "abc".to_string()
                },
            ] {
                let mut intent = reference_intent();
                field_setter(&mut intent);
                assert_eq!(
                    intent.validate(),
                    Err(EthereumSigningError::InvalidNumericField)
                );
            }
        }

        #[test]
        fn priority_fee_exceeding_max_fee_is_rejected() {
            let mut intent = reference_intent();
            intent.max_priority_fee_per_gas_wei_decimal = "40000000000".to_string(); // 40 gwei
            intent.max_fee_per_gas_wei_decimal = "30000000000".to_string(); // 30 gwei
            assert_eq!(
                intent.validate(),
                Err(EthereumSigningError::InvalidNumericField)
            );
        }

        #[test]
        fn priority_fee_equal_to_max_fee_is_accepted() {
            let mut intent = reference_intent();
            intent.max_priority_fee_per_gas_wei_decimal = "30000000000".to_string();
            intent.max_fee_per_gas_wei_decimal = "30000000000".to_string();
            assert!(intent.validate().is_ok());
        }

        #[test]
        fn malformed_calldata_is_rejected() {
            let cases = ["1234", "0x123", "0xzz"];
            for data_hex in cases {
                let mut intent = reference_intent();
                intent.data_hex = data_hex.to_string();
                assert_eq!(
                    intent.validate(),
                    Err(EthereumSigningError::InvalidCalldata),
                    "expected rejection for {data_hex:?}"
                );
            }
        }

        #[test]
        fn empty_calldata_and_zero_value_are_both_valid() {
            let mut intent = reference_intent();
            intent.data_hex = "0x".to_string();
            intent.value_wei_decimal = "0".to_string();
            assert!(intent.validate().is_ok());
        }
    }

    mod ffi_ethereum_signing {
        use super::super::ffi::{
            FfiEthereumSigningError, FfiEthereumV1TransactionIntent,
            dangerous_native_only_sign_ethereum_transaction_v1,
        };
        use super::super::signing::EthereumSigningError;

        /// Same BIP-39 test vector 1 entropy used throughout this crate's
        /// other tests — not a real recovered secret.
        const ZERO_ENTROPY: [u8; 16] = [0u8; 16];

        fn reference_ffi_intent() -> FfiEthereumV1TransactionIntent {
            FfiEthereumV1TransactionIntent {
                chain_id: 1,
                nonce: 0,
                to_hex: "0x000000000000000000000000000000000000dead".to_string(),
                value_wei_decimal: "1000000000000000000".to_string(),
                gas_limit: 21000,
                max_fee_per_gas_wei_decimal: "30000000000".to_string(),
                max_priority_fee_per_gas_wei_decimal: "1000000000".to_string(),
                data_hex: "0x".to_string(),
            }
        }

        #[test]
        fn valid_entropy_and_intent_produce_a_signed_transaction() {
            let result = dangerous_native_only_sign_ethereum_transaction_v1(
                ZERO_ENTROPY.to_vec(),
                reference_ffi_intent(),
            )
            .expect("valid entropy and intent should sign successfully");
            assert!(result.signed_tx_hex.starts_with("0x02"));
            assert!(result.tx_hash_hex.starts_with("0x"));
            assert_eq!(result.tx_hash_hex.len(), 66); // "0x" + 64 hex chars
        }

        #[test]
        fn signing_is_deterministic_for_the_same_entropy_and_intent() {
            let first = dangerous_native_only_sign_ethereum_transaction_v1(
                ZERO_ENTROPY.to_vec(),
                reference_ffi_intent(),
            )
            .expect("signs");
            let second = dangerous_native_only_sign_ethereum_transaction_v1(
                ZERO_ENTROPY.to_vec(),
                reference_ffi_intent(),
            )
            .expect("signs");
            assert_eq!(first.signed_tx_hex, second.signed_tx_hex);
            assert_eq!(first.tx_hash_hex, second.tx_hash_hex);
        }

        #[test]
        fn malformed_intent_is_rejected_before_any_entropy_use() {
            let mut intent = reference_ffi_intent();
            intent.chain_id = 0;
            assert_eq!(
                dangerous_native_only_sign_ethereum_transaction_v1(ZERO_ENTROPY.to_vec(), intent),
                Err(FfiEthereumSigningError::InvalidChainId)
            );
        }

        #[test]
        fn invalid_entropy_length_fails_generically_not_structurally() {
            // Deliberately generic (SigningFailed), NOT
            // FfiWalletError::InvalidEntropyLength — per this stage's own
            // requirement that any Rust/storage-layer failure surface only
            // a generic signing error, never storage/crypto-layer detail.
            let result = dangerous_native_only_sign_ethereum_transaction_v1(
                vec![0u8; 3],
                reference_ffi_intent(),
            );
            assert_eq!(result, Err(FfiEthereumSigningError::SigningFailed));
        }

        #[test]
        fn error_enum_maps_structurally_to_ffi_error() {
            assert_eq!(
                FfiEthereumSigningError::from(EthereumSigningError::InvalidDestinationAddress),
                FfiEthereumSigningError::InvalidDestinationAddress
            );
            assert_eq!(
                FfiEthereumSigningError::from(EthereumSigningError::InvalidChainId),
                FfiEthereumSigningError::InvalidChainId
            );
            assert_eq!(
                FfiEthereumSigningError::from(EthereumSigningError::InvalidNumericField),
                FfiEthereumSigningError::InvalidNumericField
            );
            assert_eq!(
                FfiEthereumSigningError::from(EthereumSigningError::InvalidCalldata),
                FfiEthereumSigningError::InvalidCalldata
            );
            assert_eq!(
                FfiEthereumSigningError::from(EthereumSigningError::SigningFailed),
                FfiEthereumSigningError::SigningFailed
            );
        }

        #[test]
        fn ffi_intent_has_no_secret_or_hash_fields() {
            // Destructuring names every field exactly; this fails to
            // compile if a private key, seed, entropy, mnemonic, xpriv, or
            // precomputed-hash field is ever silently added to the
            // RN-facing intent shape.
            let FfiEthereumV1TransactionIntent {
                chain_id: _,
                nonce: _,
                to_hex: _,
                value_wei_decimal: _,
                gas_limit: _,
                max_fee_per_gas_wei_decimal: _,
                max_priority_fee_per_gas_wei_decimal: _,
                data_hex: _,
            } = reference_ffi_intent();
        }
    }
}
