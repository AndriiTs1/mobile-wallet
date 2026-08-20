import CryptoKit
import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.0: native Ethereum-V1-public-address-derivation tests.
/// Synthetic entropy only, via `WalletSecureStorage.store(data:)` directly
/// — never a real recovered secret, mirroring
/// `WalletNativeMnemonicReconstructorTests`'s exact approach.
final class WalletNativeEthereumAddressProviderTests: XCTestCase {
    /// Reference address for the all-zero 16-byte entropy vector, already
    /// cross-checked independently elsewhere in this crate/suite (Rust's
    /// own `v1_ethereum_address`/`ffi_ethereum_address` tests) — not
    /// re-derived here, just reused as a known-good expected value.
    private static let zeroEntropyExpectedAddress = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94"

    override func setUpWithError() throws {
        try? WalletSecureStorage.delete()
    }

    override func tearDownWithError() throws {
        try? WalletSecureStorage.delete()
    }

    // MARK: - Deterministic known address

    func testDerivesTheKnownAddressFromZeroEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let zeroEntropy = Data(repeating: 0x00, count: 16)
        try WalletSecureStorage.store(data: zeroEntropy)

        let address = try WalletNativeEthereumAddressProvider.address()

        XCTAssertEqual(address, Self.zeroEntropyExpectedAddress)
    }

    func testDerivationIsDeterministicForTheSameStoredEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let first = try WalletNativeEthereumAddressProvider.address()
        let second = try WalletNativeEthereumAddressProvider.address()

        XCTAssertEqual(first, second)
    }

    func testDerivationDoesNotMutateOrDuplicatePersistedEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xB0, 0xC0, 0xD0, 0xE0, 0xF0, 0x00])
        try WalletSecureStorage.store(data: syntheticEntropy)

        _ = try WalletNativeEthereumAddressProvider.address()

        XCTAssertEqual(try WalletSecureStorage.read(), syntheticEntropy)
    }

    func testMissingStoredEntropyFailsStructurally() throws {
        try skipIfSecureEnclaveUnavailable()

        // setUpWithError already ensures storage is empty.
        XCTAssertThrowsError(try WalletNativeEthereumAddressProvider.address()) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .itemNotFound)
        }
    }

    func testInvalidStoredEntropyLengthFailsStructurally() throws {
        try skipIfSecureEnclaveUnavailable()

        let wrongLengthEntropy = Data([0x01, 0x02, 0x03])
        try WalletSecureStorage.store(data: wrongLengthEntropy)

        XCTAssertThrowsError(try WalletNativeEthereumAddressProvider.address()) { error in
            XCTAssertEqual(error as? FfiWalletError, .InvalidEntropyLength)
        }
    }

    // MARK: - Return value is a bare public address string

    func testReturnValueIsABarePublicAddressString() throws {
        try skipIfSecureEnclaveUnavailable()

        let zeroEntropy = Data(repeating: 0x00, count: 16)
        try WalletSecureStorage.store(data: zeroEntropy)

        let address = try WalletNativeEthereumAddressProvider.address()
        XCTAssertTrue(address.hasPrefix("0x"))
        XCTAssertEqual(address.count, 42)
    }

    // MARK: - No biometric dependency for this public-data read

    func testProviderFileHasNoBiometricAuthorizerReference() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumAddressProvider.swift")
        XCTAssertFalse(source.contains("WalletBiometricAuthorizer"), "reading a public address must not require device-owner authentication")
    }

    // MARK: - Entropy never crosses into RN / no secret return surface

    func testProviderFileReturnsOnlyThePublicAddress() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumAddressProvider.swift")
        XCTAssertTrue(source.contains("static func address() throws -> String {"))
        for term in ["mnemonic", "seed", "privateKey", "xpriv", "path:", "derivationPath"] {
            XCTAssertFalse(source.contains(term), "WalletNativeEthereumAddressProvider.swift must not reference \(term)")
        }
    }

    // MARK: - Helpers

    private func skipIfSecureEnclaveUnavailable() throws {
        if !CryptoKit.SecureEnclave.isAvailable {
            throw XCTSkip("Secure Enclave unavailable in this environment — requires a physical iPhone, per ADR-005 §19.")
        }
    }

    private func codeOnlySource(of filename: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .appendingPathComponent(filename)
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
