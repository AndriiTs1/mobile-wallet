import CryptoKit
import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.2: native mnemonic-reconstruction-from-entropy tests. Synthetic
/// entropy only, via `WalletSecureStorage.store(data:)` directly — never a
/// real recovered secret, and never the create-orchestrator's own FFI path
/// (unrelated to this stage).
final class WalletNativeMnemonicReconstructorTests: XCTestCase {
    override func setUpWithError() throws {
        try? WalletSecureStorage.delete()
    }

    override func tearDownWithError() throws {
        try? WalletSecureStorage.delete()
    }

    func testReconstructsAValid12WordMnemonicFromStoredEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let mnemonic = try WalletNativeMnemonicReconstructor.reconstructMnemonic()

        // Structural only — never logged/printed.
        let words = mnemonic.split(separator: " ")
        XCTAssertEqual(words.count, 12)
    }

    func testReconstructionIsDeterministicForTheSameStoredEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let first = try WalletNativeMnemonicReconstructor.reconstructMnemonic()
        let second = try WalletNativeMnemonicReconstructor.reconstructMnemonic()

        XCTAssertEqual(first, second)
    }

    func testReconstructionDoesNotMutateOrDuplicatePersistedEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xB0, 0xC0, 0xD0, 0xE0, 0xF0, 0x00])
        try WalletSecureStorage.store(data: syntheticEntropy)

        _ = try WalletNativeMnemonicReconstructor.reconstructMnemonic()

        // No mnemonic plaintext is persisted anywhere: reconstruction never
        // writes to storage, so the only thing WalletSecureStorage ever
        // holds remains exactly the original entropy bytes.
        XCTAssertEqual(try WalletSecureStorage.read(), syntheticEntropy)
    }

    func testMissingStoredEntropyFailsStructurally() throws {
        try skipIfSecureEnclaveUnavailable()

        // setUpWithError already ensures storage is empty.
        XCTAssertThrowsError(try WalletNativeMnemonicReconstructor.reconstructMnemonic()) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .itemNotFound)
        }
    }

    func testInvalidStoredEntropyLengthFailsStructurally() throws {
        try skipIfSecureEnclaveUnavailable()

        // Synthetic, deliberately-wrong-length bytes — production storage
        // never persists anything but 16-byte V1 entropy; this proves the
        // reconstruction wrapper still fails closed if it ever did.
        let wrongLengthEntropy = Data([0x01, 0x02, 0x03])
        try WalletSecureStorage.store(data: wrongLengthEntropy)

        XCTAssertThrowsError(try WalletNativeMnemonicReconstructor.reconstructMnemonic()) { error in
            XCTAssertEqual(error as? FfiWalletError, .InvalidEntropyLength)
        }
    }

    // MARK: - Helpers

    private func skipIfSecureEnclaveUnavailable() throws {
        if !CryptoKit.SecureEnclave.isAvailable {
            throw XCTSkip("Secure Enclave unavailable in this environment — requires a physical iPhone, per ADR-005 §19.")
        }
    }
}
