Pod::Spec.new do |s|
  s.name           = 'WalletCoreBridge'
  s.version        = '1.0.0'
  s.summary        = 'Native bridge to Mobile Wallet Wallet Core'
  s.description    = 'Expo native module bridging React Native to the Rust Wallet Core.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Generated/{wallet_core.swift,wallet_coreFFI.h,wallet_coreFFI.modulemap} are the
  # canonical UniFFI-generated bindings, committed here (regenerated via
  # packages/wallet-core/scripts/generate-bindings.sh, never hand-edited) — this is
  # the single source of truth, not a duplicate copy. They live inside this module's
  # own directory tree, not alongside the Rust crate at packages/wallet-core, because
  # CocoaPods only picks up source_files/preserve_paths/public_header_files patterns
  # that resolve inside a :path pod's own root; a pattern (even a genuinely matching
  # one) pointing outside it is silently dropped by `pod install`, not an error.
  s.source_files = ['*.swift', 'Generated/*.{swift,h}']
  s.preserve_paths = 'Generated/wallet_coreFFI.modulemap'
  s.public_header_files = 'Generated/wallet_coreFFI.h'

  # Rust/libwallet_core.a is a build product of build-rust.sh below, not a committed
  # file — see root .gitignore. It is cross-compiled fresh for whichever platform/arch
  # Xcode is currently building (device or simulator), so the same podspec supports
  # both without ever manually swapping a prebuilt binary.
  s.vendored_libraries = 'Rust/libwallet_core.a'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/Generated"',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/Generated"'
  }

  # `prepare_command` does not run for :path pods (this module is referenced by path,
  # not fetched), so the Rust build must instead be a normal Xcode Run Script build
  # phase — those run for every pod regardless of :path vs remote source. Running
  # before_compile guarantees Rust/libwallet_core.a exists before Swift/link steps
  # that depend on it.
  s.script_phase = {
    :name => 'Build wallet-core (Rust)',
    :script => 'bash "$PODS_TARGET_SRCROOT/build-rust.sh"',
    :execution_position => :before_compile,
    :output_files => ['$(PODS_TARGET_SRCROOT)/Rust/libwallet_core.a']
  }
end
