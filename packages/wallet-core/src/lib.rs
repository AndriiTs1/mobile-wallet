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
    use bitcoin::Network;
    use bitcoin::bip32::{DerivationPath, Xpriv};
    use bitcoin::secp256k1::Secp256k1;
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
        let master = Xpriv::new_master(Network::Bitcoin, seed).expect("valid BIP-32 seed");
        let derivation_path =
            DerivationPath::from_str(path.path_str()).expect("valid Wallet Core V1 path constant");
        master
            .derive_priv(&secp, &derivation_path)
            .expect("valid BIP-32 child derivation")
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
}
