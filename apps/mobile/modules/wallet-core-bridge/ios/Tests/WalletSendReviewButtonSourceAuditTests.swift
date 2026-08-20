import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.3 bugfix — permanent regression tests for the physical-device
/// bug "tapping Review on the Send screen does nothing (no loading, no
/// error, no navigation)."
///
/// Root cause: `ScreenScaffold`'s `<ScrollView>` used React Native's default
/// `keyboardShouldPersistTaps="never"`. Send's Amount field uses a
/// `decimal-pad` keyboard, which has no Done/dismiss key on iOS — so the
/// keyboard is virtually always still open when the user taps Review. With
/// the default behavior, that first tap on a touchable while a `TextInput`
/// elsewhere in the same `ScrollView` is focused is swallowed to dismiss the
/// keyboard instead of firing the touchable's `onPress` — `handleContinue`
/// never ran, hence no loading state, no error, no navigation. The fix
/// (`keyboardShouldPersistTaps="handled"` on `ScreenScaffold`'s ScrollView)
/// is verified structurally below; it is a shared-component fix, so it also
/// covers every other current and future screen with the same shape, not
/// just Send.
final class WalletSendReviewButtonSourceAuditTests: XCTestCase {
    // MARK: - Root cause fix: ScreenScaffold lets a handled touch fire while a TextInput is focused

    func testScreenScaffoldScrollViewHandlesTapsWhileKeyboardIsOpen() throws {
        let body = try boundedFunctionBody(
            in: mobileAppSource(at: "src/components/screen-scaffold.tsx"),
            startingAt: "<ScrollView",
            upTo: "showsVerticalScrollIndicator={false}"
        )
        XCTAssertTrue(body.isEmpty == false)
        let source = try mobileAppSource(at: "src/components/screen-scaffold.tsx")
        XCTAssertTrue(source.contains("keyboardShouldPersistTaps=\"handled\""),
                      "a touchable (e.g. Send's Review button) must still receive its tap while a TextInput elsewhere in this ScrollView is focused")
        XCTAssertFalse(source.contains("keyboardShouldPersistTaps=\"never\""))
    }

    // MARK: - Review Pressable has a real onPress that invokes the preparation handler

    func testReviewPressableHasRealOnPressInvokingHandleContinue() throws {
        let source = try sendSource()
        let pressableStart = try XCTUnwrap(source.range(of: "<Pressable\n        accessibilityRole=\"button\"\n        accessibilityLabel=\"Review\""))
        let pressableTagEnd = try XCTUnwrap(source.range(of: "]}>", range: pressableStart.upperBound..<source.endIndex))
        let pressableOpenTag = source[pressableStart.lowerBound..<pressableTagEnd.upperBound]
        XCTAssertTrue(pressableOpenTag.contains("onPress={handleContinue}"))
    }

    // MARK: - Disabled state and visible disabled style never diverge

    func testDisabledPropAndVisibleDisabledStyleAgree() throws {
        let source = try sendSource()
        let pressableStart = try XCTUnwrap(source.range(of: "<Pressable\n        accessibilityRole=\"button\"\n        accessibilityLabel=\"Review\""))
        let pressableTagEnd = try XCTUnwrap(source.range(of: "]}>", range: pressableStart.upperBound..<source.endIndex))
        let pressableOpenTag = source[pressableStart.lowerBound..<pressableTagEnd.upperBound]
        // Both the actual `disabled` prop (what react-native enforces) and
        // the style array (what the user visually sees) must key off the
        // exact same `!canContinue` condition — a button that LOOKS enabled
        // while actually being `disabled` (or vice versa) is exactly the
        // "silent tap" failure mode this stage guards against.
        XCTAssertTrue(pressableOpenTag.contains("disabled={!canContinue}"))
        XCTAssertTrue(pressableOpenTag.contains("(!canContinue || pressed) && styles.continueButtonDisabled"))
    }

    // MARK: - The only early return in handleContinue is the intentional single-flight guard

    func testHandleContinueHasNoOtherSilentEarlyReturn() throws {
        let body = try handleContinueBody()
        // Exactly one bare `return;` — the isPreparingRef guard. Any other
        // early exit would let a user-triggered tap produce no visible
        // outcome, which this stage requires never happens.
        let bareReturnCount = body.components(separatedBy: "\n      return;\n").count - 1
        XCTAssertEqual(bareReturnCount, 1, "handleContinue must have exactly one silent early return — the isPreparingRef single-flight guard")
        XCTAssertTrue(body.contains("if (isPreparingRef.current) {"))
    }

    // MARK: - Every failure path ends in a visible error state

    func testCatchBlockAlwaysSetsAVisibleErrorState() throws {
        let body = try handleContinueBody()
        let catchRange = try XCTUnwrap(body.range(of: "} catch (error) {"))
        let catchBlock = body[catchRange.lowerBound...]
        XCTAssertTrue(catchBlock.contains("setFormState({ status: 'error', message });"),
                      "every failure path must end by setting a visible error state — never swallowed")
        // The message is always resolved from the static ERROR_MESSAGES
        // table or the generic fallback — never left undefined/empty.
        XCTAssertTrue(catchBlock.contains("ERROR_MESSAGES[error.reason]"))
        XCTAssertTrue(catchBlock.contains("GENERIC_ERROR_MESSAGE"))
    }

    // MARK: - Navigation happens only after a successful preparation

    func testNavigationOnlyFollowsSuccessfulPreparationNeverTheCatchPath() throws {
        let body = try handleContinueBody()
        XCTAssertTrue(body.contains("router.push('/send-review');"))
        let catchRange = try XCTUnwrap(body.range(of: "} catch (error) {"))
        let catchBlock = body[catchRange.lowerBound...]
        XCTAssertFalse(catchBlock.contains("router.push"), "navigation must never happen from the catch/failure path")

        let prepareRange = try XCTUnwrap(body.range(of: "await prepareEthereumV1Send(recipient, amount);"))
        let navigateRange = try XCTUnwrap(body.range(of: "router.push('/send-review');"))
        XCTAssertTrue(prepareRange.upperBound < navigateRange.lowerBound,
                      "router.push must come strictly after the awaited, successfully-resolved prepareEthereumV1Send call")
    }

    // MARK: - Helpers

    private func handleContinueBody() throws -> String {
        let source = try sendSource()
        let start = try XCTUnwrap(source.range(of: "const handleContinue = useCallback(async () => {"))
        let end = try XCTUnwrap(source.range(of: "}, [recipient, amount, router]);", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func sendSource() throws -> String {
        try mobileAppSource(at: "src/app/send.tsx")
    }

    private func boundedFunctionBody(in source: String, startingAt signatureStart: String, upTo signatureEnd: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: signatureStart), "could not find \(signatureStart)")
        let end = try XCTUnwrap(source.range(of: signatureEnd, range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
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
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
