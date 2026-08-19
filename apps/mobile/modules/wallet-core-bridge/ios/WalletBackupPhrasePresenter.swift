import SwiftUI
import UIKit

// Stage 5E.4 — secret-free native presentation entry point for
// WalletBackupPhraseView (Stage 5E.3).
//
// This type is deliberately `internal` (no `public` anywhere), lives
// outside the three files the Stage 5D.8B bridge guard scans, and knows
// nothing about wallet secrets — it only locates a view controller to
// present onto and instantiates the existing backup-phrase screen, which
// remains solely responsible for reconstructing and rendering the phrase
// natively (Stage 5E.3, unchanged by this stage). Nothing here ever
// receives, returns, logs, or persists the phrase — this file exists only
// to answer "where do I show it," never "how do I obtain it."
//
// Called from WalletCoreBridgeModule's `presentBackupPhrase` AsyncFunction,
// which takes no argument and resolves with no value — the phrase never
// travels back across the Expo boundary in either direction.

/// Structural, non-secret failure: there was nowhere to present onto.
/// Carries no wallet-related information whatsoever.
enum WalletBackupPhrasePresentationError: Error {
    case noPresentingViewController
}

enum WalletBackupPhrasePresenter {
    /// Presents `WalletBackupPhraseView` modally over the app's current key
    /// window. `@MainActor`-isolated: the compiler enforces that callers
    /// reach this only via an actor hop (an `await` from an async context),
    /// rather than relying on a raw `DispatchQueue.main.async` — the
    /// smallest concurrency mechanism this project's existing Swift files
    /// already imply (none use manual GCD dispatch), not a new
    /// concurrency architecture.
    ///
    /// Uses the system default (`.pageSheet`-style) modal presentation,
    /// which already supports interactive swipe-to-dismiss — the minimal
    /// "Cancel" affordance this stage calls for, without adding a new
    /// button to `WalletBackupPhraseView` itself. Swipe-to-dismiss never
    /// invokes `onWrittenDown`, so dismissing this way is never confused
    /// with backup confirmation (nothing in this file persists any
    /// confirmation state either way).
    @MainActor
    static func present() throws {
        guard let rootViewController = Self.keyWindowRootViewController() else {
            throw WalletBackupPhrasePresentationError.noPresentingViewController
        }

        var hostingController: UIViewController?
        let backupView = WalletBackupPhraseView(onWrittenDown: {
            hostingController?.dismiss(animated: true)
        })
        let controller = UIHostingController(rootView: backupView)
        // Stage 5E.7F.1: without this, an unset `modalPresentationStyle`
        // defaults to `.automatic` on iOS 13+, which resolves to a page
        // sheet (rounded top corners, inset/shrunk card, presenting view
        // visible behind it) — not the approved full-screen design.
        controller.modalPresentationStyle = .fullScreen
        hostingController = controller

        Self.topMostViewController(from: rootViewController).present(controller, animated: true)
    }

    private static func keyWindowRootViewController() -> UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first(where: { $0.isKeyWindow })?
            .rootViewController
    }

    private static func topMostViewController(from viewController: UIViewController) -> UIViewController {
        if let presented = viewController.presentedViewController {
            return topMostViewController(from: presented)
        }
        return viewController
    }
}
