import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.3 bugfix — permanent regression tests for the physical-device
/// bug "tapping Home's Send quick action does nothing."
///
/// Root cause (proved structurally by `testSendAndSendReviewAreRegisteredAsStackScreens`
/// below): `NativeTabs` only ever registers a navigable screen for a route it
/// explicitly declares via `<NativeTabs.Trigger>` — `send`/`send-review` were
/// siblings of the tab screens but were never Trigger-declared, so
/// `router.push('/send')` dispatched a NAVIGATE action no navigator in the
/// tree could handle, and it silently did nothing (confirmed by reading
/// `expo-router`'s own `NativeBottomTabsRouter.getStateForAction`: an
/// unrecognized route name falls through to the plain `TabRouter`, which
/// returns unhandled, and — with no ancestor navigator — that's the end of
/// it). The fix moves the tab screens into an `(tabs)` route group and adds
/// a `<Stack>` ancestor (`WalletReadyNavigator` in `app/_layout.tsx`) that
/// hosts `(tabs)`, `send`, and `send-review` as sibling, independently
/// pushable screens.
///
/// `index.tsx`'s own onPress wiring (`action.label === 'Send' ? () =>
/// router.push('/send') : undefined`) was already structurally correct
/// before this fix — these tests re-confirm it anyway, since a regression
/// there would reintroduce the exact same symptom for a different reason.
final class WalletHomeSendNavigationSourceAuditTests: XCTestCase {
    // MARK: - Root cause: send/send-review are registered screens of a real navigator

    func testSendAndSendReviewAreRegisteredAsStackScreens() throws {
        let body = try walletReadyNavigatorBody()
        XCTAssertTrue(body.contains("<Stack.Screen name=\"(tabs)\" />"))
        XCTAssertTrue(body.contains("<Stack.Screen name=\"send\" />"))
        XCTAssertTrue(body.contains("<Stack.Screen name=\"send-review\" />"))
    }

    func testWalletReadyNavigatorIsActuallyUsedOnBothSuccessPaths() throws {
        let source = try layoutSource()
        // Both the production and DEV-showcase "wallet ready" branches must
        // render the real navigator — neither may render a bare `<AppTabs />`
        // (which is exactly the pre-fix code that reproduced this bug).
        XCTAssertFalse(source.contains("<AppTabs />"), "must never render NativeTabs directly with no ancestor Stack")
        XCTAssertEqual(source.components(separatedBy: "return <WalletReadyNavigator />;").count - 1, 2,
                       "both ProductionStartupGate's walletReady branch and ShowcaseCreateWalletGate's completed branch must use the fixed navigator")
    }

    // MARK: - The tab group still exists and still wraps the real AppTabs component

    func testTabGroupLayoutStillExportsAppTabs() throws {
        let source = try mobileAppSource(at: "src/app/(tabs)/_layout.tsx")
        XCTAssertTrue(source.contains("export { default } from '@/components/app-tabs';"))
    }

    // MARK: - send/send-review remain siblings of the group, never moved inside it

    func testSendScreensRemainOutsideTheTabGroup() throws {
        let fm = FileManager.default
        let appDir = mobileAppDirectoryURL()
        XCTAssertTrue(fm.fileExists(atPath: appDir.appendingPathComponent("send.tsx").path))
        XCTAssertTrue(fm.fileExists(atPath: appDir.appendingPathComponent("send-review.tsx").path))
        XCTAssertFalse(fm.fileExists(atPath: appDir.appendingPathComponent("(tabs)/send.tsx").path),
                       "send.tsx must stay OUTSIDE the (tabs) group — inside it, NativeTabs would swallow it the same way it swallowed the original bug")
        XCTAssertFalse(fm.fileExists(atPath: appDir.appendingPathComponent("(tabs)/send-review.tsx").path))
    }

    // MARK: - Home's Send quick action: real callback, correct route, others unaffected

    func testSendQuickActionHasARealNavigationCallback() throws {
        let body = try quickActionRenderLoopBody()
        XCTAssertTrue(body.contains("onPress={action.label === 'Send' ? () => router.push('/send') : undefined}"))
    }

    func testPressableInTheRenderLoopReceivesTheOnPressProp() throws {
        // Bounded to the actual <Pressable ...> opening tag, not merely
        // present somewhere in the file — proves the callback is wired to
        // the rendered element, not just defined and discarded.
        let body = try quickActionRenderLoopBody()
        let pressableStart = try XCTUnwrap(body.range(of: "<Pressable"))
        let pressableTagEnd = try XCTUnwrap(body.range(of: "</Pressable>", range: pressableStart.upperBound..<body.endIndex))
        let pressableElement = body[pressableStart.lowerBound..<pressableTagEnd.upperBound]
        XCTAssertTrue(pressableElement.contains("onPress={action.label === 'Send' ? () => router.push('/send') : undefined}"))
    }

    func testRouteStringIsExactlySlashSend() throws {
        let body = try quickActionRenderLoopBody()
        XCTAssertTrue(body.contains("router.push('/send')"))
        XCTAssertFalse(body.contains("router.push('send')"), "must be the absolute route \"/send\", not a relative segment")
    }

    func testOtherQuickActionsRemainUnaffected() throws {
        let source = try indexSource()
        XCTAssertTrue(source.contains("{ label: 'Receive', symbol: 'arrow.down', glyph: '↓' }"))
        XCTAssertTrue(source.contains("{ label: 'Swap', symbol: 'arrow.left.arrow.right', glyph: '⇄' }"))
        XCTAssertTrue(source.contains("{ label: 'Buy', symbol: 'plus', glyph: '+' }"))
        // The ternary's false branch is the literal `undefined` — Receive/Swap/Buy
        // get no onPress at all, exactly as before this fix.
        let body = try quickActionRenderLoopBody()
        XCTAssertTrue(body.contains(": undefined}"))
    }

    // MARK: - Helpers

    private func walletReadyNavigatorBody() throws -> String {
        let source = try layoutSource()
        let start = try XCTUnwrap(source.range(of: "function WalletReadyNavigator() {"))
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func quickActionRenderLoopBody() throws -> String {
        let source = try indexSource()
        let start = try XCTUnwrap(source.range(of: "{QUICK_ACTIONS.map((action) => ("))
        let end = try XCTUnwrap(source.range(of: "))}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func layoutSource() throws -> String {
        try mobileAppSource(at: "src/app/_layout.tsx")
    }

    private func indexSource() throws -> String {
        try mobileAppSource(at: "src/app/(tabs)/index.tsx")
    }

    private func mobileAppDirectoryURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent("src/app")
    }

    private func mobileAppSource(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent(relativePath)
        let source = try String(contentsOf: url, encoding: .utf8)
        // Strip full-line comments only (never touches inline string
        // literals this suite asserts on).
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
