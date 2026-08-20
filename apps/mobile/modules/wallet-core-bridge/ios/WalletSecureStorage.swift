import CryptoKit
import Foundation
import Security

// Stage 5D.6B — native-only iOS secure-storage layer.
//
// Originally proved out the Stage 5D.6A architecture against synthetic,
// non-secret bytes only; as of Stage 5D.8C/5D.8D (wallet creation/persist)
// this is the PRODUCTION store for the wallet's canonical BIP-39 entropy —
// `store()`/`read()` are called with the real, secret entropy bytes by
// `WalletNativeCreateOrchestrator` (write) and by every native-only reader
// of that entropy since (`WalletNativeMnemonicReconstructor`,
// `WalletNativeEthereumAddressProvider`,
// `WalletNativeEthereumTransactionSigner`). The cryptographic mechanism
// itself is unchanged from its original design and design rationale: Secure
// Enclave P-256 key -> ephemeral ECDH -> HKDF-derived AES-GCM key ->
// encrypted envelope, persisted in the Keychain under
// `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`.
//
// NOT exposed to Expo/React Native: this type is deliberately `internal`
// (Swift's default access level — no `public` anywhere in this file), so it
// is invisible outside this Pod's own module and unreachable from
// `WalletCoreBridgeModule`'s `Function(...)` surface. Only native code that
// already legitimately holds (or is about to create) the wallet's entropy
// may call into this file — this type has no notion of Expo/RN at all, and
// nothing here ever forwards a byte of what it stores or reads anywhere but
// back to its own native caller.

/// Structural, non-secret error categories. Never carries a secret value —
/// only OS status codes and case names.
enum WalletSecureStorageError: Error, Equatable {
    case secureHardwareUnavailable
    case itemNotFound
    case itemAlreadyExists
    case storageWriteFailure(OSStatus)
    case storageReadFailure(OSStatus)
    case storageDeleteFailure(OSStatus)
    case authenticationFailed
    case corruptEnvelope
}

/// Native-only synthetic-data secure-storage prototype.
///
/// Cryptographic mechanism, verified against the installed CryptoKit/Security
/// APIs before this file was written (Stage 5D.6B report §D/§E):
///
/// - A `SecureEnclave.P256.KeyAgreement.PrivateKey` is generated once and its
///   non-exportable `dataRepresentation` reference is persisted in the
///   Keychain. The Secure Enclave never holds AES key material directly — it
///   can only hold a P-256 key (verified from `Security/SecItem.h`'s
///   `kSecAttrTokenIDSecureEnclave` documentation).
/// - Each `store(data:)` call generates a **fresh, ephemeral, software**
///   `P256.KeyAgreement.PrivateKey` (never persisted — its private half is
///   discarded immediately after use). ECDH between the ephemeral private key
///   and the Secure Enclave key's public half produces a `SharedSecret`,
///   which is passed through HKDF-SHA256 to derive the actual AES-GCM key.
/// - The ephemeral key's **public** half (non-secret) is stored alongside the
///   ciphertext in the envelope, because `read()` must reproduce the exact
///   same shared secret using only the Secure Enclave's own private key plus
///   that stored ephemeral public key — which ECDH's scalar-multiplication
///   commutativity guarantees is identical to the secret computed at
///   `store()` time (`ephemeralPriv * enclavePub == enclavePriv *
///   ephemeralPub`). No AES key, wrapped or otherwise, is ever persisted.
enum WalletSecureStorage {
    // MARK: - Fixed, non-secret identifiers

    private static let service = "com.swisswallet.WalletSecureStorage.prototype"
    private static let keyAccount = "secureEnclaveKey"
    private static let envelopeAccount = "envelope"

    /// Fixed HKDF context binding — non-secret, must be identical between
    /// `store()` and `read()` or the derived AES key will differ.
    private static let hkdfInfo = Data("WalletSecureStorage.v1.AESGCM".utf8)

    private static let envelopeVersion = 1
    private static let envelopeAlgorithm = "P256-ECDH+HKDF-SHA256+AES-GCM"

    // MARK: - Envelope (Stage 5D.6B report §G)

    /// The smallest envelope the chosen mechanism actually requires: no
    /// separate nonce/tag fields, since `AES.GCM.SealedBox.combined` already
    /// packs nonce+ciphertext+tag; no wrapped DEK, since no AES key is ever
    /// persisted (it's re-derived from the Secure Enclave key on every read).
    private struct Envelope: Codable {
        let version: Int
        let algorithm: String
        /// Non-secret: the ephemeral ECDH counterpart's public key
        /// (`P256.KeyAgreement.PublicKey.rawRepresentation`).
        let ephemeralPublicKey: Data
        /// `AES.GCM.SealedBox.combined` (nonce + ciphertext + tag).
        let sealed: Data
    }

    // MARK: - Public (internal-only) API

    /// Stores `data` under Secure Enclave-gated AES-GCM encryption. Rejects
    /// (does not overwrite) an already-existing item — see Stage 5D.6B
    /// report §I.
    static func store(data: Data) throws {
        guard SecureEnclave.isAvailable else {
            throw WalletSecureStorageError.secureHardwareUnavailable
        }

        // Only `.itemNotFound` means "absent" — any other error (a real
        // Keychain/Secure Enclave failure) must propagate, not be silently
        // treated as "no existing item" (Stage 5D.6 review finding).
        let envelopeAlreadyExists: Bool
        do {
            _ = try readEnvelopeData()
            envelopeAlreadyExists = true
        } catch WalletSecureStorageError.itemNotFound {
            envelopeAlreadyExists = false
        }
        if envelopeAlreadyExists {
            throw WalletSecureStorageError.itemAlreadyExists
        }

        let enclaveKey = try loadOrCreateEnclaveKey()

        let ephemeralKey = P256.KeyAgreement.PrivateKey()
        let sharedSecret = try ephemeralKey.sharedSecretFromKeyAgreement(with: enclaveKey.publicKey)
        let symmetricKey = deriveSymmetricKey(from: sharedSecret)

        let sealedBox: AES.GCM.SealedBox
        do {
            sealedBox = try AES.GCM.seal(data, using: symmetricKey)
        } catch {
            throw WalletSecureStorageError.storageWriteFailure(errSecParam)
        }
        guard let combined = sealedBox.combined else {
            throw WalletSecureStorageError.storageWriteFailure(errSecParam)
        }

        let envelope = Envelope(
            version: envelopeVersion,
            algorithm: envelopeAlgorithm,
            ephemeralPublicKey: ephemeralKey.publicKey.rawRepresentation,
            sealed: combined
        )
        let encodedEnvelope: Data
        do {
            encodedEnvelope = try JSONEncoder().encode(envelope)
        } catch {
            throw WalletSecureStorageError.storageWriteFailure(errSecParam)
        }

        try addKeychainItem(account: envelopeAccount, data: encodedEnvelope)
    }

    /// Reads and decrypts the stored data. Throws `.itemNotFound` if nothing
    /// is stored, `.corruptEnvelope` if the AEAD integrity check fails.
    static func read() throws -> Data {
        guard SecureEnclave.isAvailable else {
            throw WalletSecureStorageError.secureHardwareUnavailable
        }

        let encodedEnvelope = try readEnvelopeData()
        let envelope: Envelope
        do {
            envelope = try JSONDecoder().decode(Envelope.self, from: encodedEnvelope)
        } catch {
            throw WalletSecureStorageError.corruptEnvelope
        }

        guard envelope.version == envelopeVersion, envelope.algorithm == envelopeAlgorithm else {
            throw WalletSecureStorageError.corruptEnvelope
        }

        let enclaveKey = try loadEnclaveKey()

        let ephemeralPublicKey: P256.KeyAgreement.PublicKey
        do {
            ephemeralPublicKey = try P256.KeyAgreement.PublicKey(rawRepresentation: envelope.ephemeralPublicKey)
        } catch {
            throw WalletSecureStorageError.corruptEnvelope
        }

        let sharedSecret: SharedSecret
        do {
            sharedSecret = try enclaveKey.sharedSecretFromKeyAgreement(with: ephemeralPublicKey)
        } catch {
            throw WalletSecureStorageError.corruptEnvelope
        }
        let symmetricKey = deriveSymmetricKey(from: sharedSecret)

        do {
            let sealedBox = try AES.GCM.SealedBox(combined: envelope.sealed)
            return try AES.GCM.open(sealedBox, using: symmetricKey)
        } catch {
            // AEAD authentication failure (tampered/corrupted ciphertext or
            // tag) and malformed `combined` data both fail closed here.
            throw WalletSecureStorageError.corruptEnvelope
        }
    }

    /// Deletes both the envelope and the Secure Enclave key reference. A
    /// missing item is not an error (delete is idempotent).
    static func delete() throws {
        try deleteKeychainItem(account: envelopeAccount)
        try deleteKeychainItem(account: keyAccount)
    }

    /// Stage 5E.6. Returns whether a wallet secret is currently persisted
    /// — a structural existence check only. Reads only the raw encrypted
    /// envelope's mere presence (`readEnvelopeData()`); never decrypts it,
    /// never touches the Secure Enclave key, never returns any byte
    /// content. Only `.itemNotFound` is treated as "absent" (`false`); any
    /// other error (a genuine Keychain/hardware failure) propagates
    /// unchanged, unmapped to `false` — a real failure must never be
    /// reported as "no wallet" (mirrors the same "only `.itemNotFound`
    /// means absent" discipline `store()` already applies above).
    static func exists() throws -> Bool {
        do {
            _ = try readEnvelopeData()
            return true
        } catch WalletSecureStorageError.itemNotFound {
            return false
        }
    }

    // MARK: - Secure Enclave key lifecycle

    private static func loadOrCreateEnclaveKey() throws -> SecureEnclave.P256.KeyAgreement.PrivateKey {
        // Only `.itemNotFound` means "no key yet, create one" — a corrupted
        // reference, hardware failure, or other real error must propagate,
        // never silently trigger generating a replacement key (Stage 5D.6
        // review finding).
        do {
            return try loadEnclaveKey()
        } catch WalletSecureStorageError.itemNotFound {
            // Absent — fall through to create a new Secure Enclave key.
        }

        var accessControlError: Unmanaged<CFError>?
        guard
            let accessControl = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                [],
                &accessControlError
            )
        else {
            throw WalletSecureStorageError.secureHardwareUnavailable
        }

        let enclaveKey: SecureEnclave.P256.KeyAgreement.PrivateKey
        do {
            enclaveKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: accessControl)
        } catch {
            throw WalletSecureStorageError.secureHardwareUnavailable
        }

        try addKeychainItem(account: keyAccount, data: enclaveKey.dataRepresentation)
        return enclaveKey
    }

    private static func loadEnclaveKey() throws -> SecureEnclave.P256.KeyAgreement.PrivateKey {
        let keyData = try readKeychainItem(account: keyAccount)
        do {
            return try SecureEnclave.P256.KeyAgreement.PrivateKey(dataRepresentation: keyData)
        } catch {
            throw WalletSecureStorageError.corruptEnvelope
        }
    }

    private static func deriveSymmetricKey(from sharedSecret: SharedSecret) -> SymmetricKey {
        sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data(),
            sharedInfo: hkdfInfo,
            outputByteCount: 32
        )
    }

    private static func readEnvelopeData() throws -> Data {
        try readKeychainItem(account: envelopeAccount)
    }

    // MARK: - Keychain primitives (generic byte-blob store/read/delete)

    private static func addKeychainItem(account: String, data: Data) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            kSecValueData as String: data,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status != errSecDuplicateItem else {
            throw WalletSecureStorageError.itemAlreadyExists
        }
        guard status == errSecSuccess else {
            throw WalletSecureStorageError.storageWriteFailure(status)
        }
    }

    private static func readKeychainItem(account: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status != errSecItemNotFound else {
            throw WalletSecureStorageError.itemNotFound
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw WalletSecureStorageError.storageReadFailure(status)
        }
        return data
    }

    private static func deleteKeychainItem(account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw WalletSecureStorageError.storageDeleteFailure(status)
        }
    }
}
