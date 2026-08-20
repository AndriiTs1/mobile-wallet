import ExpoModulesCore
import UIKit

/// Stage 5F.5B-Native — native iOS App Switcher / multitasking-snapshot
/// privacy cover.
///
/// PURELY presentational: dark background + centered brand shield only.
/// This is NOT an authentication or security boundary — it only ever
/// controls what pixels iOS composites into the app-switcher snapshot.
/// `AppLockGate` (React Native, `_layout.tsx`) remains the sole real
/// security boundary (structural render-tree gating of protected content);
/// this subscriber has no knowledge of, and no effect on, that gate.
///
/// Reacts only to raw `UIApplication` activation lifecycle events, which
/// fire identically regardless of WHY the app resigned/became active
/// (ordinary backgrounding, a Face ID/passcode sheet appearing, an
/// incoming call, Control Center, etc.) — this subscriber never inspects,
/// branches on, or is affected by that cause. It knows only
/// `UIApplication` lifecycle + `UIWindow`/`UIView` + one presentation
/// asset/color; it must never reference `WalletSecureStorage`,
/// `WalletBiometricAuthorizer`, `requestAppUnlock`, `requestRevealBackup`,
/// any wallet secret, or any React Native bridge API.
///
/// Complements, not replaces, the existing RN `PrivacyCover`
/// (`privacy-cover.tsx`)/`AppLockGate` (`_layout.tsx`) layer: this native
/// cover protects the specific OS-snapshot-capture instant a React
/// Native/JS-thread-driven cover cannot reliably beat; the RN layer
/// remains solely responsible for the full steady-state inactive/
/// background window and its own correctly-sequenced removal alongside
/// `AppLockGate`'s re-lock decision. Removing this native cover on
/// `applicationDidBecomeActive` unconditionally, with no coordination, is
/// safe specifically because the RN layer is still present underneath
/// during the brief handoff — see the Stage 5F.5B-Native pre-
/// implementation audit for the full reasoning.
public class WalletPrivacyCoverAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  private static let coverBackgroundColor = UIColor(red: 10.0 / 255.0, green: 11.0 / 255.0, blue: 15.0 / 255.0, alpha: 1.0)
  /// Already compiled into the app bundle by the existing `expo-splash-screen`
  /// config plugin — as of the shield-geometry audit, `app.json`'s splash
  /// `image` points at `shield-mark@3x.png` (the zero-padding master
  /// artwork also used by RN's `ShieldMark`/`AppLockScreen`/`PrivacyCover`),
  /// so this is the same canonical shield, not merely a similar one.
  private static let shieldImageName = "SplashScreenLogo"
  /// `SplashScreenLogo` is exported by `expo-splash-screen` as a SQUARE
  /// canvas with the shield artwork's own aspect ratio baked in as
  /// transparent padding (verified by direct alpha-bounding-box
  /// measurement of the generated asset: 90x90pt canvas containing a
  /// 76x90pt visible shield). Constraining this imageView to that SAME
  /// square canvas size — not to the artwork's own ~76x90 visible bounds —
  /// is what makes `.scaleAspectFit` below render the shield at its true,
  /// undistorted ~76x90 size: a box that instead matched only the visible
  /// artwork bounds would impose a second, mismatched aspect-fit on top of
  /// the padding already baked into the source, distorting/shrinking the
  /// result. This produces the same ~76x90 visible shield as the native
  /// launch screen's own storyboard box (also 90x90, same asset).
  private static let shieldContainerSize: CGFloat = 90

  private var coverView: UIView?

  public func applicationWillResignActive(_ application: UIApplication) {
    guard coverView == nil else {
      // Already installed — idempotent no-op.
      return
    }
    guard let window = Self.keyWindow() else {
      return
    }

    let cover = UIView(frame: window.bounds)
    cover.backgroundColor = Self.coverBackgroundColor
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    // Decorative only — the dark background above is what actually
    // protects the snapshot. If the shield artwork can't be loaded for any
    // reason, the cover is still fully installed with just the dark
    // background: privacy protection must never depend on this succeeding,
    // so this is a plain optional-binding, never a force unwrap.
    if let shieldImage = UIImage(named: Self.shieldImageName) {
      let imageView = UIImageView(image: shieldImage)
      imageView.contentMode = .scaleAspectFit
      imageView.translatesAutoresizingMaskIntoConstraints = false
      cover.addSubview(imageView)
      NSLayoutConstraint.activate([
        imageView.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
        imageView.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
        imageView.widthAnchor.constraint(equalToConstant: Self.shieldContainerSize),
        imageView.heightAnchor.constraint(equalToConstant: Self.shieldContainerSize),
      ])
    }

    // Adding as the last subview of the app's own existing window places
    // it topmost via ordinary UIKit z-ordering — no second window needed.
    window.addSubview(cover)
    coverView = cover
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    guard let cover = coverView else {
      // Not installed — idempotent no-op.
      return
    }
    cover.removeFromSuperview()
    coverView = nil
  }

  /// The current key window, resolved via `UIApplication.shared.connectedScenes`
  /// rather than the `UIApplication.windows` property (deprecated since iOS
  /// 15). This app has no `SceneDelegate`/`UIApplicationSceneManifest`
  /// entry — it still runs UIKit's classic single-implicit-scene lifecycle
  /// — so `connectedScenes` always yields exactly the one scene the app
  /// already has; this is not a scene-based-architecture change, only a
  /// non-deprecated way to reach the same window this file has always
  /// attached to. Mirrors the identical, already-established lookup in
  /// `WalletBackupPhrasePresenter.keyWindowRootViewController()` — no
  /// second implementation of this pattern.
  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })
  }
}
