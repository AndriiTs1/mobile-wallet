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

    // MARK: - Stage 5D.8D: physical-device production E2E

    /// The one test in this file that exercises the REAL production path —
    /// `createAndPersist()` itself, not the `commitAndBuildPublicResult`
    /// synthetic seam — driving the actual `dangerousNativeOnlyCreateWalletV1()`
    /// FFI call, real OS-CSPRNG entropy, real V1 address derivation, and real
    /// Secure-Enclave-backed Keychain persistence. Per ADR-005 §19, only a
    /// physical device exercises genuine Secure Enclave behavior; this test
    /// still compiles and runs on Simulator (where `SecureEnclave.isAvailable`
    /// is also true), but its result is authoritative for hardware-backed
    /// guarantees only when run on real hardware.
    func testCreateAndPersistProductionPathRoundTripsOnRealHardware() throws {
        try skipIfSecureEnclaveUnavailable()

        // (1) Storage is empty before this test — enforced by setUpWithError.

        // (2) The real production path: FFI create -> real entropy -> real
        // addresses -> WalletSecureStorage.store(data:) -> public result.
        let firstResult = try WalletNativeCreateOrchestrator.createAndPersist()

        // (3) Non-empty.
        XCTAssertFalse(firstResult.ethereum.isEmpty)
        XCTAssertFalse(firstResult.bitcoinReceive.isEmpty)
        XCTAssertFalse(firstResult.bitcoinChange.isEmpty)

        // (4) Structurally plausible, using the same established formats the
        // Rust test suite already asserts (packages/wallet-core/src/lib.rs:
        // EIP-55 Ethereum address = "0x" + 40 hex chars = 42 total; bech32
        // mainnet P2WPKH Bitcoin addresses = "bc1q" prefix; receive/change
        // are distinct branches).
        XCTAssertTrue(firstResult.ethereum.hasPrefix("0x"))
        XCTAssertEqual(firstResult.ethereum.count, 42)
        XCTAssertTrue(firstResult.bitcoinReceive.hasPrefix("bc1q"))
        XCTAssertTrue(firstResult.bitcoinChange.hasPrefix("bc1q"))
        XCTAssertNotEqual(firstResult.bitcoinReceive, firstResult.bitcoinChange)

        // (5)/(6) Persisted canonical entropy is real, Keychain-backed
        // storage, exactly 16 bytes (128-bit BIP-39 entropy, V1's 12-word
        // create default per ADR-004 §3). Never printed/logged — only its
        // byte count is asserted, and it is compared (never displayed) below.
        // `Data`'s own description never renders raw bytes (Foundation
        // prints only a byte count), so even an assertion-failure message
        // here cannot leak the value into test output.
        let firstPersistedEntropy = try WalletSecureStorage.read()
        XCTAssertEqual(firstPersistedEntropy.count, 16)

        // (8)/(9) A second real create call, without deleting storage, must
        // fail closed on the existing fail-closed duplicate-store rejection
        // — never overwrite, never delete-then-recreate.
        XCTAssertThrowsError(try WalletNativeCreateOrchestrator.createAndPersist()) { error in
            XCTAssertEqual(error as? WalletSecureStorageError, .itemAlreadyExists)
        }

        // (10) The original persisted entropy is untouched by the failed
        // duplicate attempt.
        let entropyAfterDuplicateAttempt = try WalletSecureStorage.read()
        XCTAssertEqual(entropyAfterDuplicateAttempt, firstPersistedEntropy)

        // (11) Cleanup is handled by `tearDownWithError`
        // (`WalletSecureStorage.delete()`), consistent with every other test
        // in this file.
    }

    // MARK: - Helpers

    private func skipIfSecureEnclaveUnavailable() throws {
        if !CryptoKit.SecureEnclave.isAvailable {
            throw XCTSkip("Secure Enclave unavailable in this environment — requires a physical iPhone, per ADR-005 §19.")
        }
    }
}
