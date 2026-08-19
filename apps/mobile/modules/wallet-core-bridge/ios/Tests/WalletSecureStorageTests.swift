import CryptoKit
import Security
import XCTest
@testable import WalletCoreBridge

/// Stage 5D.6B: synthetic-bytes-only round-trip tests for the native-only
/// `WalletSecureStorage` prototype. No mnemonic, seed, BIP-39 entropy, or
/// private-key material anywhere in this file — only fixed, obviously
/// synthetic bytes, per the Stage 5D.6B scope.
final class WalletSecureStorageTests: XCTestCase {
    /// Fixed, obviously synthetic test bytes — never real wallet material.
    private let syntheticBytes = Data([0x01, 0x02, 0x03, 0x04])

    override func setUpWithError() throws {
        // Best-effort cleanup in case a previous run left an item behind.
        try? WalletSecureStorage.delete()
    }

    override func tearDownWithError() throws {
        try? WalletSecureStorage.delete()
    }

    func testStoreReadDeleteRoundTrip() throws {
        try skipIfSecureEnclaveUnavailable()

        try WalletSecureStorage.store(data: syntheticBytes)
        let readBack = try WalletSecureStorage.read()
        XCTAssertEqual(readBack, syntheticBytes)

        try WalletSecureStorage.delete()
        XCTAssertThrowsError(try WalletSecureStorage.read()) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .itemNotFound)
        }
    }

    func testDuplicateStoreIsRejected() throws {
        try skipIfSecureEnclaveUnavailable()

        try WalletSecureStorage.store(data: syntheticBytes)
        XCTAssertThrowsError(try WalletSecureStorage.store(data: syntheticBytes)) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .itemAlreadyExists)
        }
    }

    func testReadWithoutStoreReportsItemNotFound() throws {
        try skipIfSecureEnclaveUnavailable()

        XCTAssertThrowsError(try WalletSecureStorage.read()) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .itemNotFound)
        }
    }

    func testCorruptedEnvelopeFailsClosed() throws {
        try skipIfSecureEnclaveUnavailable()

        try WalletSecureStorage.store(data: syntheticBytes)

        var storedData = try rawReadEnvelopeData()
        XCTAssertFalse(storedData.isEmpty)
        storedData[storedData.count - 1] ^= 0xFF // flip the last byte
        try rawUpdateEnvelopeData(storedData)

        XCTAssertThrowsError(try WalletSecureStorage.read()) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .corruptEnvelope)
        }
    }

    func testStoredEnvelopeDoesNotContainPlaintextBytes() throws {
        try skipIfSecureEnclaveUnavailable()

        try WalletSecureStorage.store(data: syntheticBytes)
        let storedData = try rawReadEnvelopeData()

        XCTAssertNil(
            storedData.range(of: syntheticBytes),
            "plaintext synthetic bytes must not appear in the persisted envelope"
        )
    }

    func testSecureHardwareUnavailableIsReportedStructurally() throws {
        // `SecureEnclave.isAvailable` is NOT reliably false on Simulator —
        // verified empirically (Stage 5D.6B report §L): on this Apple
        // Silicon host/Xcode combination it returns true, apparently backed
        // by the host Mac's own Secure Enclave. This test therefore only
        // exercises the structural-unavailable path on whatever environment
        // actually reports it unavailable; it is not guaranteed to run on
        // every Simulator. No software fallback pretending to be the Secure
        // Enclave exists in production code either way.
        guard !CryptoKit.SecureEnclave.isAvailable else {
            throw XCTSkip("SecureEnclave.isAvailable is true in this environment; this test only exercises the unavailable path where it is actually false.")
        }
        XCTAssertThrowsError(try WalletSecureStorage.store(data: syntheticBytes)) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .secureHardwareUnavailable)
        }
    }

    // MARK: - Helpers

    private func skipIfSecureEnclaveUnavailable() throws {
        if !CryptoKit.SecureEnclave.isAvailable {
            throw XCTSkip("Secure Enclave unavailable in this environment — requires a physical iPhone, per ADR-005 §19.")
        }
    }

    /// Reads the raw persisted envelope bytes directly via the Keychain,
    /// using identifiers duplicated (not imported) from `WalletSecureStorage`
    /// — this test-only duplication avoids widening that type's production
    /// (internal-to-the-Pod) visibility just to make corruption tests
    /// possible. If these literals ever drift from production, this helper
    /// fails closed (`errSecItemNotFound`), it does not silently pass.
    private func rawReadEnvelopeData() throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.swisswallet.WalletSecureStorage.prototype",
            kSecAttrAccount as String: "envelope",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        XCTAssertEqual(status, errSecSuccess)
        guard let data = result as? Data else {
            XCTFail("expected an existing envelope")
            return Data()
        }
        return data
    }

    private func rawUpdateEnvelopeData(_ data: Data) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.swisswallet.WalletSecureStorage.prototype",
            kSecAttrAccount as String: "envelope",
        ]
        let update: [String: Any] = [kSecValueData as String: data]
        XCTAssertEqual(SecItemUpdate(query as CFDictionary, update as CFDictionary), errSecSuccess)
    }
}
