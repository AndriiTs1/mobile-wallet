uniffi::setup_scaffolding!();

/// Returns the Wallet Core package version.
///
/// Stage 5A proof only: no wallet, key, storage, network, or cryptographic logic.
#[uniffi::export]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// Returns a deterministic health-check response.
///
/// Stage 5A proof only: used to verify the real Rust/native boundary.
#[uniffi::export]
pub fn health_check() -> String {
    "pong".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_package_version() {
        assert_eq!(version(), "0.1.0");
    }

    #[test]
    fn health_check_returns_pong() {
        assert_eq!(health_check(), "pong");
    }
}
