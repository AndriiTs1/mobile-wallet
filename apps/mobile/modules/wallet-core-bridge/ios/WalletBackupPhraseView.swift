import Combine
import SwiftUI
import UIKit

// Stage 5E.3 — native backup-phrase screen FOUNDATION ONLY.
//
// Not wired into onboarding, no backup-confirmation persistence, no Face
// ID, no Settings-reveal entry point, no Expo presentation trigger. See
// Stage 5E.1's design report and Stage 5E.2's mnemonic-reconstruction
// plumbing this screen consumes.
//
// The mnemonic never crosses into Expo/React Native/JavaScript: this file
// is deliberately `internal` (no `public` anywhere), lives outside the
// three files the Stage 5D.8B bridge guard scans (WalletCoreBridgeModule.swift,
// WalletCoreBridge.types.ts, WalletCoreBridgeModule.ts), and never imports
// or references anything from `src/` or that module file. No Expo
// Function(...)/AsyncFunction(...) exists anywhere in this file.
//
// Source of truth: WalletSecureStorage.read() -> canonical entropy (already
// persisted by wallet creation, Stage 5D.8C/5D.8D) ->
// dangerousNativeOnlyMnemonicFromEntropyV1(...) (Stage 5E.2) -> mnemonic
// sentence. This screen NEVER references WalletNativeCreateOrchestrator or
// any wallet-creation call — a failed reconstruction shows a generic error
// state, never a fallback to creating a new wallet.
//
// Stage 5E.7B: visual restyle only, to match the React Native onboarding
// screen's design system (apps/mobile/src/components/create-wallet-screen.tsx).
// `WalletBackupPhraseViewModel` below — the state machine, secret-lifetime
// handling, and screen-capture detection — is unchanged from Stage 5E.3.
// Only `WalletBackupPhraseView`'s rendering was restyled.

/// PUBLIC-SAFE structurally (nothing here reveals more than this exact
/// screen already shows), still `internal`/never Expo-visible. What the
/// backup-phrase screen currently has to render.
enum WalletBackupPhraseState: Equatable {
    case loading
    case loaded(String)
    case failed
}

/// Native-only, minimal reactive state for the backup-phrase screen.
/// Deliberately not a general MVVM base/framework — just enough state to
/// (a) obtain the phrase, (b) drop it on background/dismiss, (c) re-obtain
/// it on foreground, and (d) be unit-testable independent of SwiftUI's own
/// rendering (per this stage's own "do not introduce a large MVVM
/// architecture just for tests" instruction).
final class WalletBackupPhraseViewModel: ObservableObject {
    @Published private(set) var state: WalletBackupPhraseState = .loading

    /// Obtains the phrase via the Stage 5E.2 native-only reconstruction
    /// path — never generates new entropy, never creates a wallet. Safe to
    /// call repeatedly (e.g. on every foreground transition): always
    /// re-reads persisted entropy fresh rather than caching a prior result.
    /// This is the chosen, documented "returning active" behavior (Stage
    /// 5E.3 §2): re-reconstruct from persisted entropy, never require a
    /// separate reveal gate at this stage (no Face ID exists yet), and
    /// never create a second wallet.
    func loadPhrase() {
        do {
            let mnemonic = try WalletNativeMnemonicReconstructor.reconstructMnemonic()
            state = .loaded(mnemonic)
        } catch {
            // Generic, structural failure only. The caught
            // WalletSecureStorageError/FfiWalletError case name carries no
            // secret, but nothing about it is surfaced here regardless —
            // per this stage's own "do not expose secret/error internals"
            // instruction, and to keep this screen's UI contract fixed.
            state = .failed
        }
    }

    /// Called when the screen backgrounds/resigns active, or disappears.
    /// Drops the phrase from this object's own `@Published` state
    /// immediately, which also makes the view re-render without it before
    /// any app-switcher snapshot is taken (see `WalletBackupPhraseView`'s
    /// scene-phase handling below).
    ///
    /// This reduces the phrase's lifetime in *this object's* storage. It
    /// does NOT prove every Swift-runtime copy (SwiftUI's own diffing/state
    /// machinery, any transient copy made while rendering `Text`) is also
    /// erased — Swift `String` is copy-on-write and unique ownership can't
    /// be verified here, so no zeroization is claimed (same reasoning
    /// already documented in `WalletNativeMnemonicReconstructor`).
    func clearPhrase() {
        state = .loading
    }
}

/// Stage 5E.7B: color palette matching the RN Mobile Wallet design system
/// (`apps/mobile/src/constants/theme.ts`'s `Colors.dark`) — hardcoded here
/// since native Swift can't import the RN theme module. Kept as this
/// file's single source of truth for color so both onboarding screens read
/// as the same product, not two different visual brands.
///
/// Stage 5E.9D: no longer `private` — `WalletBackupVerificationView.swift`
/// (a sibling file, same module) reuses this exact palette rather than
/// duplicating it, so the phrase-display and verification screens can
/// never visually drift apart. Still `internal` only — never `public`,
/// never Expo-visible; this is a pure-color namespace with no wallet data.
enum Palette {
    static let background = Color(red: 0x0A / 255.0, green: 0x0B / 255.0, blue: 0x0F / 255.0)
    static let surface = Color(red: 0x15 / 255.0, green: 0x17 / 255.0, blue: 0x1D / 255.0)
    static let text = Color.white
    static let textSecondary = Color(red: 0x8D / 255.0, green: 0x91 / 255.0, blue: 0x9B / 255.0)
    static let accentGold = Color(red: 0xC9 / 255.0, green: 0xA2 / 255.0, blue: 0x4B / 255.0)
    // Stage 5E.7F: lightened 0.08 -> 0.06 for an extremely subtle word-cell
    // border, per this stage's "lighter, not heavier" cell treatment. Only
    // consumer is `wordCell`'s overlay stroke.
    static let border = Color.white.opacity(0.06)
    // Stage 5E.9D: mirrors the RN theme's `Colors.dark.negative` exactly,
    // for the same cross-platform-consistency reason as every other color
    // here. Only consumer: `WalletBackupVerificationView`'s generic
    // failure message — never used to carry meaning on its own (paired
    // with text and a VoiceOver announcement), per this stage's own
    // "no critical meaning depends only on color" accessibility
    // requirement.
    static let negative = Color(red: 0xFF / 255.0, green: 0x61 / 255.0, blue: 0x61 / 255.0)
}

/// The backup-phrase screen itself. `internal`, never `public`/Expo-visible.
struct WalletBackupPhraseView: View {
    @StateObject private var viewModel = WalletBackupPhraseViewModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var isBeingCaptured = false
    /// Stage 5E.9D: local flow state — which step of the native backup
    /// flow this presentation is currently showing. `false` (phrase
    /// display) is always the entry state; Continue below is the only
    /// thing that sets it `true`. Reset back to `false` on every
    /// disappearance/backgrounding alongside `viewModel.clearPhrase()`
    /// (below), so re-foregrounding or re-presenting always starts back
    /// at the phrase screen rather than silently resuming mid-verification
    /// with stale state — this is the "smallest local flow enum/state"
    /// mechanism this stage's own instruction prefers over a
    /// `NavigationStack`/broader navigation architecture.
    @State private var isVerifying = false

    /// Invoked exactly once — only after the user successfully completes
    /// native backup verification (Stage 5E.9D; see
    /// `WalletBackupVerificationView`'s `onVerified`). No longer invoked
    /// directly by this screen's own Continue button (that changed in
    /// Stage 5E.9D — see `ctaButton` below); its meaning to
    /// `WalletBackupPhrasePresenter`, which resumes its Stage 5E.8
    /// continuation from this exact closure, is unchanged: "this entire
    /// native backup flow is finished, dismiss and let RN proceed." Does
    /// NOT persist any "backup confirmed" state itself — that write
    /// happens inside `WalletBackupVerificationView`, immediately before
    /// this closure is called on success.
    ///
    /// Dismissal: this screen still has no explicit close/back button —
    /// the existing full-screen modal presentation (Stage 5E.7F.1) has no
    /// interactive swipe-to-dismiss gesture, so successful verification is
    /// the only reachable way to dismiss this flow (see
    /// `WalletBackupPhrasePresenter`'s own doc comment for the fuller
    /// swipe-dismiss analysis).
    let onWrittenDown: () -> Void

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            content
        }
        .onAppear { viewModel.loadPhrase() }
        .onDisappear {
            viewModel.clearPhrase()
            isVerifying = false
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                viewModel.loadPhrase()
            } else {
                viewModel.clearPhrase()
                isVerifying = false
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIScreen.capturedDidChangeNotification)) { _ in
            // Detection only. iOS provides no supported API to prevent
            // screenshots or screen recording outright — this hides the
            // phrase while a recording is actively detected; it cannot
            // and does not claim to block a screenshot itself.
            isBeingCaptured = UIScreen.main.isCaptured
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
                .tint(Palette.accentGold)
        case .failed:
            errorView
        case .loaded(let mnemonic):
            if isBeingCaptured {
                // Stage 5E.9D: capture protection applies identically
                // whether showing the phrase or verifying it — `isVerifying`
                // is checked only in the branch below, so a recording
                // detected mid-verification hides the verification screen
                // (and its choice chips) exactly like it already hides the
                // phrase grid, with no separate handling needed in
                // `WalletBackupVerificationView` itself.
                capturedPlaceholder
            } else if isVerifying {
                // Stage 5E.9D: `mnemonic` is the same `String` bound once
                // by this `switch` case above — passed by reference (COW),
                // not duplicated into a second buffer, exactly like
                // `phraseView(mnemonic:)` below already documents for its
                // own use of it. Only one canonical mnemonic copy is ever
                // alive at a time during this native session.
                WalletBackupVerificationView(mnemonic: mnemonic, onVerified: onWrittenDown)
            } else {
                phraseView(mnemonic: mnemonic)
            }
        }
    }

    private func phraseView(mnemonic: String) -> some View {
        // `.split` returns `[Substring]`: each element shares `mnemonic`'s
        // own storage rather than allocating a new backing buffer per word
        // — the smallest-copy representation practical for a numbered
        // grid, unchanged from Stage 5E.3. `mnemonic` itself must stay
        // alive as long as any Substring is used, which is already
        // guaranteed here (it's this enum case's own associated value,
        // alive exactly as long as this branch renders). No separate
        // `[String]` array of words is ever created.
        let words = mnemonic.split(separator: " ")

        // Stage 5E.7B: wrapped in a ScrollView (previously a fixed VStack)
        // so on a short screen, or with larger Dynamic Type sizes, content
        // becomes scrollable rather than clipping the CTA or shrinking the
        // words themselves — mirrors the RN onboarding screen's own
        // ScrollView strategy (Stage 5E.6B) for the same reason.
        return ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                wordGrid(words: words)
                safetyNote
                ctaButton
            }
            .padding(20)
        }
    }

    private var header: some View {
        // Stage 5E.7E: centered on the full screen width (not the leading
        // edge) to match the RN Create Wallet screen's shared center axis
        // (logo / MOBILE WALLET / hero title all center on full screen
        // width there, per Stage 5E.7D). `.frame(maxWidth: .infinity)`
        // makes this VStack itself span the full available width so its
        // `.center`-aligned children center against that width, not just
        // against each other's intrinsic size.
        VStack(alignment: .center, spacing: 10) {
            Image(systemName: "lock.shield")
                .font(.system(size: 26, weight: .medium))
                .foregroundColor(Palette.accentGold)
                .accessibilityHidden(true)

            Text("Back up your wallet")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(Palette.text)
                .multilineTextAlignment(.center)

            Text("Anyone who has these words can access your funds.\nNever share them with anyone.\nMobile Wallet cannot recover them for you.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                // Stage 5E.7F: capped to the same deliberate readable width
                // as the RN Create Wallet hero description
                // (`heroDescription`'s `maxWidth: 280` in
                // create-wallet-screen.tsx), rather than wrapping against
                // the full screen width — keeps the block compact and its
                // line lengths balanced instead of looking stretched/wide.
                .frame(maxWidth: 280)
        }
        .frame(maxWidth: .infinity)
    }

    /// 6 rows × 2 columns, as specified. Every cell shares one structural
    /// definition (`wordCell`) with no per-cell size/style variation, so
    /// width/height/corner-radius/padding/border are identical by
    /// construction across all 12 cells — not approximated per device.
    private func wordGrid(words: [Substring]) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
            spacing: 10
        ) {
            ForEach(Array(words.enumerated()), id: \.offset) { index, word in
                wordCell(index: index, word: word)
            }
        }
    }

    private func wordCell(index: Int, word: Substring) -> some View {
        // Stage 5E.7E: number and word are two independent layers, not one
        // HStack, so the number's width can never shift the word off the
        // cell's true center. The word layer is `.frame(maxWidth: .infinity,
        // alignment: .center)` against the *cell's* full content width, so
        // its visual center is the cell's center regardless of digit count
        // (1 vs. 12) or word length. The number layer is a separate
        // full-width HStack with a trailing Spacer, anchoring it to the
        // left edge without participating in the word's centering at all.
        ZStack {
            Text(word)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .center)

            HStack {
                Text("\(index + 1)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Palette.accentGold)
                Spacer()
            }

            // Deliberately no `.textSelection(.enabled)` anywhere in this
            // cell — SwiftUI `Text` is not selectable by default, and this
            // must stay that way: enabling it would surface the system
            // text-selection callout menu, which offers Copy — reintroducing
            // exactly the per-word clipboard exposure this screen must not
            // have (ADR-004 §6: no clipboard copy of the mnemonic, in whole
            // or in part).
        }
        // Stage 5E.7F: lighter cells — reduced minHeight/padding versus
        // Stage 5E.7B/5E.7E (44/12/10 -> 40/10/8) to cut unnecessary
        // internal empty space while staying comfortably readable/tappable.
        // Surface, radius, and the independent-layer centering above are
        // otherwise unchanged.
        .frame(maxWidth: .infinity, minHeight: 40)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Palette.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Palette.border, lineWidth: 1)
        )
        .cornerRadius(12)
    }

    private var safetyNote: some View {
        // Stage 5E.7F.2: icon and text are independent ZStack layers — the
        // same independent-layer strategy already used for word-cell
        // number/word centering (Stage 5E.7E) — so the icon's width can
        // never shift the text off the screen's center axis. The text
        // layer is `.frame(maxWidth: .infinity, alignment: .center)`
        // against this note's own full content width (which spans the
        // word grid's width, per the outer `.frame` below), so its visual
        // center is the screen's center, not "whatever's left after the
        // icon." The icon is a separate full-width HStack with a trailing
        // Spacer, anchoring it to the left edge without participating in
        // the text's centering at all.
        ZStack {
            (Text("Write these words down ").foregroundColor(Palette.textSecondary)
                + Text("in order").foregroundColor(Palette.accentGold).fontWeight(.semibold)
                + Text(" and store them somewhere safe.").foregroundColor(Palette.textSecondary))
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .center)

            HStack {
                Image(systemName: "checkmark.shield")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Palette.accentGold)
                    .accessibilityHidden(true)
                Spacer()
            }
        }
        // Stage 5E.7F: full width so this note's edges line up with the
        // word grid's edges (both sit inside the same 20pt outer padding)
        // rather than shrinking to its own content size — keeps it reading
        // as inline supporting text, not a second card.
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var ctaButton: some View {
        // Stage 5E.7E: "Continue" replaces "I've written it down" — this
        // button does not persist any backup-confirmed state itself (see
        // `onWrittenDown`'s own doc comment above), so the old label
        // overstated what tapping it actually records. Text-only, no
        // decorative icon — unchanged from before this stage, which never
        // had one.
        //
        // Stage 5E.9D: no longer calls `onWrittenDown` directly — it only
        // transitions this same native presentation to
        // `WalletBackupVerificationView` (`isVerifying = true`). The label
        // stays accurate either way: "Continue" has always meant "move to
        // the next required step," never "this is complete."
        Button(action: { isVerifying = true }) {
            Text("Continue")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Palette.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Palette.accentGold)
                .cornerRadius(14)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Continue")
    }

    private var errorView: some View {
        VStack(spacing: 12) {
            Text("Something went wrong")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Palette.text)
            Text("Your backup phrase couldn't be displayed right now. Please try again.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private var capturedPlaceholder: some View {
        VStack(spacing: 12) {
            Text("Hidden for your security")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Palette.text)
            Text("Recording detected. Stop screen recording to view your backup phrase.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
