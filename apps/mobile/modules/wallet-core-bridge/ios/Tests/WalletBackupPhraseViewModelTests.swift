import CryptoKit
import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.3: backup-phrase screen foundation tests. Synthetic entropy
/// only, via `WalletSecureStorage.store(data:)` directly — never a real
/// recovered secret. Tests the `WalletBackupPhraseViewModel` state
/// machine directly rather than SwiftUI rendering, per this stage's own
/// "extract only the smallest native state model necessary" instruction.
final class WalletBackupPhraseViewModelTests: XCTestCase {
    override func setUpWithError() throws {
        try? WalletSecureStorage.delete()
    }

    override func tearDownWithError() throws {
        try? WalletSecureStorage.delete()
    }

    func testValidStoredEntropyProducesA12WordLoadedState() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let viewModel = WalletBackupPhraseViewModel()
        viewModel.loadPhrase()

        guard case .loaded(let mnemonic) = viewModel.state else {
            XCTFail("expected .loaded state")
            return
        }
        XCTAssertEqual(mnemonic.split(separator: " ").count, 12)
    }

    func testMissingEntropyProducesFailedState() throws {
        try skipIfSecureEnclaveUnavailable()

        // setUpWithError already ensures storage is empty.
        let viewModel = WalletBackupPhraseViewModel()
        viewModel.loadPhrase()

        XCTAssertEqual(viewModel.state, .failed)
    }

    func testClearPhraseRemovesLoadedMnemonicFromState() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let viewModel = WalletBackupPhraseViewModel()
        viewModel.loadPhrase()
        guard case .loaded = viewModel.state else {
            XCTFail("expected .loaded state before clearing")
            return
        }

        // Represents the screen's `.onChange(of: scenePhase)` background
        // path.
        viewModel.clearPhrase()

        XCTAssertEqual(viewModel.state, .loading)
    }

    func testDismissalSharesTheSameClearMechanismAsBackgrounding() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xB0, 0xC0, 0xD0, 0xE0, 0xF0, 0x00])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let viewModel = WalletBackupPhraseViewModel()
        viewModel.loadPhrase()

        // The screen's `onDisappear` calls this exact same method as its
        // background path — see `WalletBackupPhraseView`. No separate
        // "dismiss" state exists.
        viewModel.clearPhrase()

        XCTAssertEqual(viewModel.state, .loading)
    }

    func testReturningActiveReReconstructsFromPersistedEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x0F, 0x0E, 0x0D, 0x0C, 0x0B, 0x0A, 0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x00])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let viewModel = WalletBackupPhraseViewModel()
        viewModel.loadPhrase()
        guard case .loaded(let firstMnemonic) = viewModel.state else {
            XCTFail("expected .loaded state")
            return
        }

        viewModel.clearPhrase()
        XCTAssertEqual(viewModel.state, .loading)

        // Simulated "returning active": entropy is still persisted, so
        // re-loading must deterministically reproduce the same phrase —
        // the chosen safe behavior (re-reconstruct from persisted
        // entropy), never wallet re-creation.
        viewModel.loadPhrase()
        guard case .loaded(let secondMnemonic) = viewModel.state else {
            XCTFail("expected .loaded state after re-load")
            return
        }
        XCTAssertEqual(firstMnemonic, secondMnemonic)
    }

    func testLoadPhraseNeverMutatesPersistedEntropy() throws {
        try skipIfSecureEnclaveUnavailable()

        let syntheticEntropy = Data([0x99, 0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0xFF, 0xEE, 0xDD, 0xCC, 0xBB, 0xAA])
        try WalletSecureStorage.store(data: syntheticEntropy)

        let viewModel = WalletBackupPhraseViewModel()
        viewModel.loadPhrase()

        XCTAssertEqual(try WalletSecureStorage.read(), syntheticEntropy)
    }

    func testProductionSourceObtainsPhraseOnlyThroughMnemonicReconstructorNotWalletCreation() throws {
        let source = try codeOnlySourceOfProductionFile()

        XCTAssertTrue(source.contains("WalletNativeMnemonicReconstructor.reconstructMnemonic()"))
        XCTAssertFalse(source.contains("WalletNativeCreateOrchestrator"))
        XCTAssertFalse(source.contains("dangerousNativeOnlyCreateWalletV1"))
    }

    func testProductionSourceHasNoClipboardOrShareBehavior() throws {
        let source = try codeOnlySourceOfProductionFile()

        XCTAssertFalse(source.contains("UIPasteboard"))
        XCTAssertFalse(source.contains("ShareLink"))
        XCTAssertFalse(source.contains("UIActivityViewController"))
        XCTAssertFalse(source.contains(".textSelection("))
    }

    // MARK: - Helpers

    /// Reads `WalletBackupPhraseView.swift`'s own source with `//`-comment
    /// lines excluded first, so this checks actual code, not prose — this
    /// file's doc comments legitimately name several of these symbols while
    /// explaining they are deliberately NOT used/called (see e.g. the
    /// `.textSelection(...)` and `WalletNativeCreateOrchestrator` mentions
    /// in `WalletBackupPhraseView.swift`'s own comments).
    private func codeOnlySourceOfProductionFile() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("WalletBackupPhraseView.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func skipIfSecureEnclaveUnavailable() throws {
        if !CryptoKit.SecureEnclave.isAvailable {
            throw XCTSkip("Secure Enclave unavailable in this environment — requires a physical iPhone, per ADR-005 §19.")
        }
    }
}
