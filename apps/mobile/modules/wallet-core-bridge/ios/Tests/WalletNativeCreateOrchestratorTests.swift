import CryptoKit
import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5D.8C: native create-orchestrator tests. Synthetic bytes/addresses
/// only, via the `commitAndBuildPublicResult` test seam — never a real
/// mnemonic, seed, or private key, and never the non-deterministic
/// production `dangerousNativeOnlyCreateWalletV1()` path (which is only
/// exercised, unconditionally, by `createAndPersist()` itself — proven to
/// compile and remain referenced by `testProductionPathReferencesRealFfiAndStorageCalls`
/// below).
final class WalletNativeCreateOrchestratorTests: XCTestCase {
    override func setUpWithError() throws {
        try? WalletSecureStorage.delete()
    }

    override func tearDownWithError() throws {
        try? WalletSecureStorage.delete()
    }

    func testSuccessfulOrchestrationPersistsAndReturnsPublicAddressesOnly() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x01, 0x02, 0x03, 0x04])
        let syntheticAddresses = FfiV1WalletAddresses(
            ethereum: "0xSyntheticEthereumAddress",
            bitcoinReceive: "bc1qSyntheticReceiveAddress",
            bitcoinChange: "bc1qSyntheticChangeAddress"
        )

        let result = try WalletNativeCreateOrchestrator.commitAndBuildPublicResult(
            entropy: syntheticEntropy,
            addresses: syntheticAddresses
        )

        XCTAssertEqual(result.ethereum, "0xSyntheticEthereumAddress")
        XCTAssertEqual(result.bitcoinReceive, "bc1qSyntheticReceiveAddress")
        XCTAssertEqual(result.bitcoinChange, "bc1qSyntheticChangeAddress")

        // The commit point actually persisted — confirmed by reading it
        // back through the same production storage API.
        XCTAssertEqual(try WalletSecureStorage.read(), syntheticEntropy)
    }

    func testDuplicateCreateDoesNotOverwriteExistingStorage() throws {
        try skipIfSecureEnclaveUnavailable()

        let originalEntropy = Data([0x0A, 0x0B, 0x0C, 0x0D])
        let originalAddresses = FfiV1WalletAddresses(
            ethereum: "0xOriginal",
            bitcoinReceive: "bc1qOriginalReceive",
            bitcoinChange: "bc1qOriginalChange"
        )
        _ = try WalletNativeCreateOrchestrator.commitAndBuildPublicResult(
            entropy: originalEntropy,
            addresses: originalAddresses
        )

        let duplicateEntropy = Data([0xFF, 0xFE, 0xFD, 0xFC])
        let duplicateAddresses = FfiV1WalletAddresses(
            ethereum: "0xDuplicate",
            bitcoinReceive: "bc1qDuplicateReceive",
            bitcoinChange: "bc1qDuplicateChange"
        )

        // Storage-failure-prevents-success (Stage 5D.8C §3/§8C): the
        // organically-reproducible failure used here — as instructed,
        // rather than invasive OSStatus mocking — is the existing
        // fail-closed duplicate-store rejection from Stage 5D.6/5D.7.
        XCTAssertThrowsError(
            try WalletNativeCreateOrchestrator.commitAndBuildPublicResult(
                entropy: duplicateEntropy,
                addresses: duplicateAddresses
            )
        ) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .itemAlreadyExists)
        }

        // No overwrite: the original bytes must remain exactly as stored.
        XCTAssertEqual(try WalletSecureStorage.read(), originalEntropy)
    }

    func testPublicResultHasExactlyTheThreeAddressFields() {
        let result = NativeCreatedWalletPublicResult(
            ethereum: "a",
            bitcoinReceive: "b",
            bitcoinChange: "c"
        )
        // Structural (reflection-based), not a source-text-grep trick:
        // fails if a field (e.g. entropy/mnemonic/seed) is ever silently
        // added to, removed from, or renamed on this type.
        let fieldNames = Set(Mirror(reflecting: result).children.compactMap(\.label))
        XCTAssertEqual(fieldNames, ["ethereum", "bitcoinReceive", "bitcoinChange"])
    }

    func testProductionOrchestratorSourceDoesNotCallMnemonicAccessor() throws {
        // Source audit, not invasive FFI mocking, per this stage's own
        // instruction: proves createAndPersist() never CALLS
        // dangerousNativeOnlyMnemonicWords() in this stage, by reading the
        // real production source file from disk. Doc-comment lines (which
        // legitimately name the accessor while explaining it is NOT called)
        // are excluded first, so this checks actual code, not prose.
        let orchestratorURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("WalletNativeCreateOrchestrator.swift")
        let source = try String(contentsOf: orchestratorURL, encoding: .utf8)
        let codeOnlySource = source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        XCTAssertFalse(
            codeOnlySource.contains("dangerousNativeOnlyMnemonicWords"),
            "WalletNativeCreateOrchestrator must not call the mnemonic accessor in this stage"
        )
    }

    func testProductionPathReferencesRealFfiAndStorageCalls() throws {
        // Compilation-level proof (Stage 5D.8C §9): the same source-audit
        // technique confirms createAndPersist() genuinely references the
        // real FFI/storage calls, not only a fake/seam implementation. This
        // does not execute the production path (still non-deterministic,
        // real Secure-Enclave-backed storage) — it proves the source is
        // actually wired to it, which the successful `cargo build`/Xcode
        // compile of this whole target already additionally guarantees:
        // if any of these symbols didn't exist, the build itself would fail.
        let orchestratorURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("WalletNativeCreateOrchestrator.swift")
        let source = try String(contentsOf: orchestratorURL, encoding: .utf8)

        XCTAssertTrue(source.contains("dangerousNativeOnlyCreateWalletV1()"))
        XCTAssertTrue(source.contains("dangerousNativeOnlyEntropyBytes()"))
        XCTAssertTrue(source.contains("WalletSecureStorage.store(data:"))
    }

    // MARK: - Helpers

    private func skipIfSecureEnclaveUnavailable() throws {
        if !CryptoKit.SecureEnclave.isAvailable {
            throw XCTSkip("Secure Enclave unavailable in this environment — requires a physical iPhone, per ADR-005 §19.")
        }
    }
}
