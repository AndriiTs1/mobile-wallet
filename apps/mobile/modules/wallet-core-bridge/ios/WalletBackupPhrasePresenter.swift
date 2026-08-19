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
    /// window, and — as of Stage 5E.8 — suspends until the user actually
    /// taps Continue, rather than returning as soon as the presentation
    /// animation starts. Before this stage, `present()` was a synchronous
    /// `throws` function called with `try await` purely for its
    /// `@MainActor` isolation hop: it returned immediately after calling
    /// `UIViewController.present`, so the Expo `presentBackupPhrase`/
    /// `createWalletAndPresentBackup` promises on the RN side resolved the
    /// instant the sheet appeared, long before the user had read or
    /// confirmed anything — the root cause of Stage 5E.8's "returns to
    /// Create Wallet instead of Home" bug. `present()` is now genuinely
    /// `async`, wrapping the presentation in
    /// `withCheckedThrowingContinuation` and resuming it only from
    /// `onWrittenDown` (i.e. only when Continue is tapped) — that is the
    /// sole, non-secret "backup screen finished" signal this function ever
    /// produces; no wallet secret crosses this boundary in either
    /// direction, unchanged from every prior stage.
    ///
    /// This is the PRODUCTION entry point: its completion policy
    /// (`onVerificationSucceeded`, passed to `presentFlow` below) is the
    /// one and only production call site of
    /// `WalletBackupConfirmationStore.markConfirmed()` in the entire
    /// codebase — see Stage 5E.9E2's own doc comment on `presentFlow` for
    /// why this decision now lives here rather than inside
    /// `WalletBackupVerificationView` itself.
    @MainActor
    static func present() async throws {
        try await presentFlow(onVerificationSucceeded: {
            WalletBackupConfirmationStore.markConfirmed()
        })
    }

    #if DEBUG
    /// Stage 5E.9E2 — DEV-ONLY preview entry point. Exists only in DEBUG
    /// builds (compiled out entirely in Release, per this stage's own
    /// dev-gating requirement) and is wired to Expo only from a matching
    /// `#if DEBUG`-gated `Function` in `WalletCoreBridgeModule.swift`,
    /// itself called only from `__DEV__`-gated RN Showcase Mode — belt and
    /// suspenders, neither layer alone is relied upon.
    ///
    /// Presents the exact same real native UI
    /// (`WalletBackupPhraseView`/`WalletBackupVerificationView`) against
    /// the exact same already-persisted wallet entropy as `present()` —
    /// nothing is duplicated, generated, or faked. The ONLY difference is
    /// the completion policy passed to `presentFlow`: a no-op instead of
    /// `WalletBackupConfirmationStore.markConfirmed()`. This decision is
    /// made here, in native code, once, at the call site that distinguishes
    /// "this is a real onboarding/resume flow" from "this is a design
    /// preview" — RN never passes a boolean or any other parameter that
    /// could control this; it only ever chooses which of two distinctly
    /// named Expo functions to call.
    @MainActor
    static func presentPreview() async throws {
        try await presentFlow(onVerificationSucceeded: {
            // Deliberately empty — a developer previewing this screen
            // against a real wallet must never mutate that wallet's real
            // `backupConfirmed` state, in either direction.
        })
    }
    #endif

    /// Swipe/interactive dismissal: `modalPresentationStyle` is
    /// `.fullScreen` (Stage 5E.7F.1), which — unlike `.pageSheet` — does
    /// not install iOS's automatic interactive swipe-to-dismiss gesture,
    /// and this screen has no Cancel/back affordance of its own. Continue
    /// is therefore the only reachable way to dismiss this screen today,
    /// so there is currently no swipe/cancel path that needs a separate
    /// "not completion" signal — adding one now would be guarding a
    /// presently-unreachable code path. If a future stage reintroduces an
    /// interactive dismissal affordance, that stage must also decide how
    /// (or whether) to resume this continuation for that case, since the
    /// continuation must be resumed exactly once for `presentFlow` to ever
    /// return; the `didComplete` guard below only protects against a
    /// double-tap of Continue itself.
    ///
    /// `@MainActor`-isolated: the compiler enforces that callers reach this
    /// only via an actor hop (an `await` from an async context), rather
    /// than relying on a raw `DispatchQueue.main.async` — the smallest
    /// concurrency mechanism this project's existing Swift files already
    /// imply (none use manual GCD dispatch), not a new concurrency
    /// architecture.
    ///
    /// Stage 5E.9E2: factored out of `present()` so `presentPreview()`
    /// above can share every line of presentation/continuation/dismissal
    /// logic, differing only in `onVerificationSucceeded` — the smallest
    /// native design that avoids duplicating this screen's UI or wiring,
    /// per this stage's own "do not duplicate the full UI" requirement.
    @MainActor
    private static func presentFlow(onVerificationSucceeded: @escaping () -> Void) async throws {
        guard let rootViewController = Self.keyWindowRootViewController() else {
            throw WalletBackupPhrasePresentationError.noPresentingViewController
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var hostingController: UIViewController?
            // Guards against a double-tap of Continue resuming the same
            // continuation twice (a fatal misuse per Swift Concurrency) —
            // `onWrittenDown` runs on the main actor, same as this whole
            // function, so a plain `Bool` is sufficient without extra
            // synchronization.
            var didComplete = false
            let backupView = WalletBackupPhraseView(
                onVerificationSucceeded: onVerificationSucceeded,
                onWrittenDown: {
                    guard !didComplete else { return }
                    didComplete = true
                    continuation.resume()
                    hostingController?.dismiss(animated: true)
                }
            )
            let controller = UIHostingController(rootView: backupView)
            // Stage 5E.7F.1: without this, an unset `modalPresentationStyle`
            // defaults to `.automatic` on iOS 13+, which resolves to a page
            // sheet (rounded top corners, inset/shrunk card, presenting view
            // visible behind it) — not the approved full-screen design.
            controller.modalPresentationStyle = .fullScreen
            hostingController = controller

            Self.topMostViewController(from: rootViewController).present(controller, animated: true)
        }
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
