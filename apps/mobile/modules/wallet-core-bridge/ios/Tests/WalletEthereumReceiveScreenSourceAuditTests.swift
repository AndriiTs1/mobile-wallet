import Foundation
import XCTest

@testable import WalletCoreBridge

/// Receive-screen source audit.
///
/// The production Receive screen supports:
/// - BTC on Bitcoin Mainnet via getBitcoinAddressV1()
/// - ETH / USDT / USDC / XAUT on Ethereum Mainnet via getEthereumAddressV1()
///
/// Public addresses only. No entropy/mnemonic/seed/private-key material,
/// no arbitrary derivation API, and no fresh biometric gate for viewing
/// receive addresses.
final class WalletEthereumReceiveScreenSourceAuditTests: XCTestCase {
    func testReceiveReadsBothPublicWalletAddresses() throws {
        let source = try receiveSource()

        XCTAssertTrue(source.contains("getEthereumAddressV1()"))
        XCTAssertTrue(source.contains("getBitcoinAddressV1()"))
    }

    func testReceiveContainsAllSupportedAssets() throws {
        let source = try receiveSource()

        for symbol in ["BTC", "ETH", "USDT", "USDC", "XAUT"] {
            XCTAssertTrue(
                source.contains("symbol: '\(symbol)'"),
                "Receive must expose \(symbol)"
            )
        }
    }

    func testBitcoinUsesBitcoinMainnet() throws {
        let source = try receiveSource()

        XCTAssertTrue(source.contains("Bitcoin Mainnet"))
        XCTAssertTrue(
            source.contains(
                "selectedSymbol === 'BTC'"
            )
        )
    }

    func testEthereumAssetsUseEthereumMainnet() throws {
        let source = try receiveSource()

        XCTAssertTrue(source.contains("Ethereum Mainnet"))

        for symbol in ["ETH", "USDT", "USDC", "XAUT"] {
            XCTAssertTrue(
                source.contains("symbol: '\(symbol)'"),
                "\(symbol) must remain available on Receive"
            )
        }
    }

    func testReceiveDoesNotExposeSecretMaterial() throws {
        let source = try receiveSource().lowercased()

        for forbidden in [
            "mnemonic",
            "privatekey",
            "private key",
            "xpriv",
            "derivationpath",
            "derivation path",
        ] {
            XCTAssertFalse(
                source.contains(forbidden),
                "Receive must not reference \(forbidden)"
            )
        }
    }

    func testReceiveDoesNotCallBiometricAuthorizer() throws {
        let source = try receiveSource()

        XCTAssertFalse(source.contains("WalletBiometricAuthorizer"))
        XCTAssertFalse(source.contains("requestAppUnlock"))
        XCTAssertFalse(source.contains("requestRevealBackup"))
    }

    func testReceiveDoesNotIntroduceGenericDerivationApi() throws {
        let source = try receiveSource()

        XCTAssertFalse(source.contains("deriveAddress("))
        XCTAssertFalse(source.contains("deriveBitcoinAddress("))
    }

    func testBitcoinAndEthereumAddressesStaySeparated() throws {
        let source = try receiveSource()

        XCTAssertTrue(
            source.contains(
                "selectedSymbol === 'BTC'"
            )
        )
        XCTAssertTrue(source.contains("state.bitcoinAddress"))
        XCTAssertTrue(source.contains("state.ethereumAddress"))
    }

    func testQrUsesTheSelectedPublicAddress() throws {
        let source = try receiveSource()

        XCTAssertTrue(source.contains("value={selectedAddress}"))
    }

    func testCopyUsesTheSelectedPublicAddress() throws {
        let source = try receiveSource()

        XCTAssertTrue(
            source.contains(
                "Clipboard.setStringAsync(selectedAddress)"
            )
        )
    }

    private func receiveSource() throws -> String {
        try mobileAppSource(at: "receive.tsx")
    }

    private func mobileAppSource(at relativePath: String) throws -> String {
        let testsFile = URL(fileURLWithPath: #filePath)
        let iosDir = testsFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()

        let moduleDir = iosDir.deletingLastPathComponent()
        let mobileDir = moduleDir
            .deletingLastPathComponent()
            .deletingLastPathComponent()

        let appDir = mobileDir
            .appendingPathComponent("src")
            .appendingPathComponent("app")

        let url = appDir.appendingPathComponent(relativePath)

        return try String(contentsOf: url, encoding: .utf8)
    }
}
