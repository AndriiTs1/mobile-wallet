# ADR-005: Secure Storage & Local Authentication Architecture

**Status:** Accepted

**Scope:** This ADR decides how the canonical wallet secret (fixed by this document) is protected at rest on-device, how local authentication (biometric/device-credential) gates access to it, and how signing/recovery-phrase-reveal authorization works. It does not select specific libraries, Rust crates, or write any implementation code — it defines the guarantees future implementation must satisfy. It builds directly on **ADR-002** (Wallet Core runtime and trust boundary), **ADR-003** (account/derivation/address model), and **ADR-004** (recovery and backup model), and does not weaken any of them.

---

## Context (Required Inputs, Reconciled)

**ADR-002** established: Wallet Core is a single shared Rust implementation; raw seed/private keys never cross into React Native or the backend, under any circumstance including display, except a narrowly scoped case this ADR must resolve explicitly (§11–12); no signing occurs off-device; backend/provider data is untrusted input.

**ADR-003** established: a single BIP-39 seed roots a single BIP-32 tree; Ethereum uses `m/44'/60'/0'/0/0`; Bitcoin uses BIP-84 external (`m/84'/0'/0'/0/i`) and internal (`m/84'/0'/0'/1/i`) branches. This ADR protects exactly that seed's root secret at rest — it does not alter any derivation path.

**ADR-004** established: the canonical recovery mechanism is the BIP-39 mnemonic itself (English wordlist, 12-word V1 generation default, 12–24-word import); the mnemonic may be later-revealed through a strictly gated flow (option B); an optional import-only passphrase is never persisted as part of "the phrase" the user is shown; the mnemonic must never be stored in `AsyncStorage` or unprotected persistence; the exact secure-storage mechanism was explicitly deferred to this ADR; a local "backup verified" flag is not a secret and must not be conflated with the phrase itself; device backup must never substitute for recovery-phrase-based restore.

Root `CLAUDE.md` and `apps/mobile/CLAUDE.md` require: no `AsyncStorage`/unprotected persistence for key material; hardware-backed storage guarantees must be validated against actual platform behavior, never assumed from a library's name or marketing; any change touching secure storage or biometrics requires explicit security review before implementation.

**Current repository state, verified**: `apps/mobile/package.json` lists Expo SDK `~57.0.12`, React Native `0.86.2`, React `19.2.3`; no `expo-secure-store`, no `expo-local-authentication`, no crypto/security dependency of any kind is installed; `packages/` is empty; no native Swift/Kotlin modules exist. This ADR decides architecture before any of that is introduced.

**No contradiction with any accepted ADR was found or introduced by this document.**

---

## Decision

### 1. Security objective

**Primary objective**: a thief, a malicious app/process, a compromised backend, or simple filesystem/backup extraction must not be able to obtain usable wallet seed/private-key material merely by reading application storage.

The architecture minimizes:
- **Secret exposure at rest** — the persisted secret is always ciphertext, never plaintext, protected by a platform-hardware-gated wrapping key (§2–§5).
- **Secret exposure in JS** — normal operations never deliver secret material to React Native at all (§12); the one narrow exception (§11) is minimized and explicitly bounded.
- **Secret lifetime in memory** — decrypted secret material exists only for the duration of the operation that required it, then is cleared (§13).
- **Authentication bypass** — signing and phrase-reveal always require their own fresh, non-cached local authentication regardless of any other unlocked state (§7, §10, §11).
- **Backup leakage** — the protected secret is deliberately excluded from device backup/sync mechanisms wherever the platform allows (§4, §5, §16).

**This architecture does not claim protection against a fully compromised OS or device.** Consistent with ADR-002's existing Threat/Trust Assumptions, every guarantee below depends on the underlying platform's own security properties (Secure Enclave, Keystore, OS sandboxing) being intact.

### 2. Fundamental storage model

**Adopted chain**:

```
BIP-39 entropy (canonical secret, per below)
  → encrypted wallet-secret blob (versioned AEAD envelope, §3)
  → encrypted blob stored locally (iOS Keychain / Android Keystore-adjacent
    app-private storage, §4/§5)
  → separate, device-bound wrapping key
  → wrapping key protected by platform security hardware where available
    (Secure Enclave / StrongBox / TEE-backed Keystore, §4/§5)
  → local authentication gates use of the wrapping key
  → decrypted secret enters Wallet Core (Rust) only when required
  → secret cleared/zeroized as far as technically possible after use (§13)
```

**Explicitly rejected**:
- Plaintext mnemonic storage, in any location, at any point beyond the transient in-memory window an operation requires.
- `AsyncStorage`, for any part of the secret or the wrapping key.
- Plain filesystem storage of the secret.
- Database columns containing plaintext seed material.
- Storing the seed or any private key in React Native component/application state.
- Backend or cloud plaintext backup of the secret, in any form (restates ADR-004 §12).

**Canonical persisted object — decided**: the persisted wallet secret is the **BIP-39 entropy** (the raw random bytes generated at wallet creation, per BIP-39's mnemonic-generation procedure) — **not** the mnemonic sentence (the English words) and **not** the derived seed.

**Why entropy, not the mnemonic sentence, and why this does not deviate from the standard**: BIP-39 defines a fixed, deterministic, lossless bijection between entropy and its mnemonic sentence under a given wordlist. The mnemonic's checksum bits are themselves derived deterministically from the entropy (a truncated SHA-256 digest of the entropy), and splitting the resulting entropy‖checksum bitstring into 11-bit groups mapped to wordlist indices is a fixed, unambiguous procedure with no external input and no information loss in either direction. Concretely:

- **Generation**: entropy is the *first* artifact BIP-39 actually produces — the mnemonic sentence is already a derived encoding of it, not a more primitive form.
- **Import**: a valid, checksum-passing English BIP-39 mnemonic is converted **locally, deterministically, back to its exact entropy** (the standard "mnemonic to entropy" operation per BIP-39) — this conversion is exact and unique; no other entropy value produces the same mnemonic sentence.
- **Reveal / signing**: whenever the mnemonic sentence is actually required — to display it to the user (ADR-004 §5) or to feed it into BIP-39 seed derivation (PBKDF2 uses the mnemonic *sentence* string as its password, not the raw entropy bytes directly) — Wallet Core reconstructs it from the stored entropy using the same fixed, standard procedure. The reconstructed sentence is byte-for-byte identical to the one the user was originally shown or originally typed at import; nothing about the standard recovery contract in ADR-004 is altered, weakened, or reinterpreted by this choice.

**This preserves the exact ADR-004 recovery contract with no standards deviation.** There is no standards obstruction requiring a different model — entropy and the mnemonic sentence are two representations of the same standard artifact, related by a fixed, reversible, BIP-39-defined procedure, and persisting the more primitive (entropy) representation changes nothing about what a third-party wallet would derive from the same recovered mnemonic.

**Why this reduces long-lived secret-string handling**: entropy is a fixed-size byte buffer (16–32 bytes depending on the imported mnemonic's word count, per ADR-004 §3/§8), straightforward to hold in a `zeroize`-style, guaranteed-overwrite-on-drop byte buffer (§13) for its entire persisted lifetime. The mnemonic *sentence*, by contrast, is exactly the kind of immutable, potentially long-lived `String` value §13 already flags as harder to reliably zeroize. Treating entropy as canonical means the mnemonic sentence, as a `String`, is materialized only **transiently** — at generation-display time, at import-validation time, at reveal time (§11), and internally during each seed derivation for signing — and is never the form held in persistent storage or carried across the app's idle lifetime. This does not eliminate the mnemonic-sentence exposure window entirely (it still must exist in memory whenever genuinely needed), but it minimizes the number of code paths and the duration for which a String-typed secret exists, concentrating that exposure into the same few, already-reviewed operations rather than letting it persist as the resting representation of the secret.

**The optional BIP-39 passphrase is a separate, distinct value from entropy and is never part of this canonical persisted object** — its own persistence policy, and the consequences of that policy, are addressed explicitly below.

**The optional BIP-39 passphrase (ADR-004 §7, import-only) is never persisted, in any form, encrypted or otherwise.** This is a deliberate decision distinct from the entropy's own treatment: a passphrase's entire security value comes from being a secret independent of device storage — a user who imports a passphrase-protected wallet is explicitly relying on the property that *device compromise alone* (i.e., compromise of the encrypted blob plus its wrapping key) is not sufficient to reconstruct their seed. Persisting the passphrase alongside the entropy, even encrypted under the same protection, would collapse that property and defeat the reason such a user chose a passphrase in the first place. **No indefinite in-memory caching of the passphrase is permitted either** — it must not be held resident for the app's session lifetime as a workaround for re-prompting; it is supplied fresh for each operation that requires it, exactly like every other fresh-authentication requirement in this ADR (§7, §10).

**Consequences of this decision, stated explicitly, as required**:

- The imported passphrase functions as **a second required recovery secret**, independent of the persisted entropy.
- **The mnemonic alone does NOT restore the same wallet** for a passphrase-protected import — anyone in possession only of the mnemonic words (e.g. from a "Reveal Recovery Phrase" screen, §11) without the passphrase derives a *different*, empty-looking wallet, not the funded one.
- **The user must re-supply the passphrase whenever seed derivation is required** (signing, reveal) after the persisted entropy has been unlocked — the exact prompting policy within a single operation is a final implementation-time decision, but it must never amount to indefinite caching, per above.
- **Swiss Wallet cannot recover or reset that passphrase.** It is never transmitted, never persisted, and never known to Swiss Wallet at any point — losing it is exactly as unrecoverable, by design, as losing the mnemonic itself would be for a standard wallet.
- **"Reveal Recovery Phrase" must not imply that the displayed mnemonic alone is a complete backup** for a passphrase-protected imported wallet. The reveal flow (§11) must, for such a wallet, make explicit that the displayed words are necessary but not sufficient, and that the passphrase must be preserved separately for the backup to actually be complete.
- **The UI must explicitly instruct such a user to preserve the passphrase separately** from, and in addition to, the mnemonic — a product/UX requirement this ADR imposes on whatever future implementation builds the reveal and import flows; no specific copy is designed here.

**This is flagged as a real UX tradeoff, not silently resolved.** If this two-secret model proves unacceptable for V1's actual user base at implementation time, that is a decision requiring explicit product/security review — this ADR does not invent an alternative persistence mechanism (e.g. caching or storing the passphrase) to avoid that friction, since doing so would defeat the passphrase's purpose as established above. V1-created wallets (no passphrase, per ADR-004 §7) are entirely unaffected and never prompted for one — this entire consequence set applies only to the (expected to be small) population of users who explicitly chose to import a passphrase-protected wallet.

### 3. Encryption architecture

**Authenticated encryption is required.** The wallet-secret blob must be protected with an AEAD (authenticated encryption with associated data) construction — a class of algorithm that provides both confidentiality and built-in integrity/tamper detection in one operation (illustrative examples of this algorithm class include AES-256-GCM and XChaCha20-Poly1305; the exact algorithm and its Rust implementation are Stage 5 implementation decisions, not selected by this ADR).

**Nonce/IV handling**: a unique nonce must be generated for every encryption operation (initial creation and every future re-encryption, e.g. during migration, §18) and must never be reused under the same key — nonce reuse under an AEAD scheme catastrophically weakens or breaks its guarantees. The nonce is generated from the OS CSPRNG (consistent with ADR-002's entropy-handling posture) at the moment of encryption.

**Integrity protection**: the AEAD's built-in authentication tag is the mechanism by which tampering or corruption of the ciphertext is detected. A failed integrity check must be treated identically to a decryption failure (§17) — fail closed, never silently accept or "repair" corrupted ciphertext.

**Versioned ciphertext envelope**, conceptually:

```
{
  version:            integer          — envelope format version
  algorithm:          string identifier — e.g. an AEAD-family identifier; non-secret
  nonce:               bytes            — unique per encryption operation
  ciphertext:          bytes            — encrypts the canonical secret (§2) only
  wrappingKeyRef:      non-secret identifier/alias referencing the platform key
                        (Keychain/Keystore alias) — never the key material itself
}
```

- **Algorithm/version metadata may be non-secret.** The version and algorithm-identifier fields must be readable without decryption (they determine *how* to attempt decryption) and carry no confidentiality requirement themselves — only the `ciphertext` field requires protection.
- **Cryptographic key material must never be hardcoded in application code.** The wrapping key referenced by `wrappingKeyRef` is generated on-device, per-install, non-exportable, and resides exclusively in the platform's secure hardware/keystore (§4, §5) — never in source code, build configuration, or environment variables.
- **No plaintext wallet metadata is bundled inside the secret blob unless strictly necessary.** Non-sensitive application state (e.g., ADR-004 §11's "backup verified" flag) is stored structurally separately from this envelope — bundling it in would force ordinary, non-sensitive reads through the same expensive, hardware-gated decrypt path for no benefit, and could leak metadata about non-secret state through the envelope's shape/size.
- **Design for future crypto migration without requiring wallet recreation.** The `version`/`algorithm` fields exist specifically so a future re-encryption under different parameters (§18) can be detected and handled by Wallet Core without ever requiring the user to regenerate or re-supply their mnemonic.

### 4. iOS architecture

**What Keychain stores vs. what Secure Enclave protects — clarified explicitly, per this ADR's own requirement**: the iOS Keychain stores the **versioned encrypted envelope from §3** (ciphertext plus its non-secret metadata) as a Keychain item. **The Secure Enclave does not directly store or import arbitrary BIP-39 or secp256k1 wallet key material.** It generates and protects its own key type (typically P-256), used to gate or perform a wrapping operation whose result is what actually protects the encrypted envelope. The Enclave never sees the entropy, the reconstructed mnemonic sentence, the derived seed, or any secp256k1 private key.

**Access-control class**: the Keychain item holding the encrypted envelope (or the wrapping-key reference protecting it) must use `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` or an equivalent, at least as strong, accessibility class available at implementation time. This class requires a device passcode to be set at all — a device with no passcode cannot create or use an item at this class (a real device-tier consideration, §6) — and is `ThisDeviceOnly`.

**`ThisDeviceOnly` semantics**: the protected item's content never migrates automatically to a new device — not via iCloud Keychain sync, not via an encrypted iTunes/Finder backup restore, not via device-to-device migration tooling. A new device always starts with no wallet secret, requiring recovery-phrase-based restore, exactly as ADR-004 requires.

**Security requirement first, implementation detail second — applying the same discipline as the Android section (§5) below.** This ADR states the required iOS authentication behavior, then explicitly defers the exact `SecAccessControl` flag composition to implementation-time validation on real devices — it does not assume any single flag combination gives every desired behavior identically across iOS versions and devices.

**Required behavior**:
- **Device-bound protection**: the protected item must be bound to this device only (`ThisDeviceOnly`, per above) and must require a device passcode to exist at all, regardless of the exact biometric-related flag composition chosen.
- **Fresh authentication for sensitive operations**: signing and recovery-phrase reveal must require their own fresh local authentication immediately before the protected operation, per §7/§10/§11 — never satisfied by an earlier, unrelated authentication event.
- **A deliberate policy for biometric-set changes**: if the flag composition chosen at implementation time (e.g. an option analogous to `.biometryCurrentSet`) causes access to be invalidated when the enrolled Face ID/Touch ID set changes, that invalidation must be handled as a defined failure mode (§17) — re-authentication via device passcode, never silent secret loss or silent fallback to a weaker access class. If the chosen configuration does not provide this invalidation behavior, an equivalent compensating control must be identified at implementation time rather than silently accepting a security regression.
- **A defined recovery path when a biometric-bound wrapping key becomes unavailable** (e.g. due to an OS update changing behavior, a flag-composition edge case, or an unexpected platform state): the item's ciphertext must not be treated as destroyed by this — device-passcode-based re-authentication must be attempted first, and only if that path is also genuinely exhausted does the flow fall through to recovery-phrase-based restore (§17), never to silent wallet recreation.

**Explicitly deferred to implementation**: the exact `SecAccessControl` flag composition (the specific combination of biometric/passcode protection flags and access-control options used) **must be validated on real physical iOS devices at implementation time (§19)** — simulators cannot verify genuine Secure-Enclave-backed behavior, and this ADR does not commit to one specific flag combination or promise identical behavior across all iOS versions.

**App reinstall implications**: deleting and reinstalling the app may or may not remove the app's own Keychain items, depending on the exact access-control class and synchronization settings chosen — this must be **explicitly verified at implementation time against current platform documentation and actual device behavior**, not assumed either way. Regardless of the outcome, the recovery phrase remains the authoritative restore path per ADR-004.

**Device migration implications**: Apple's device-to-device migration tooling has its own semantics for what transfers; because the access class is `ThisDeviceOnly`, the protected item is not expected to transfer even via official migration tooling — must be explicitly verified at implementation time, and the product must never represent device migration as a substitute for recovery-phrase-based restore.

**iCloud Keychain implications**: explicitly excluded by the `ThisDeviceOnly` access class — the wallet secret must never appear in iCloud Keychain sync, consistent with ADR-004 §12's prohibition on cloud backup of the secret.

**Backup/restore implications**: standard encrypted iTunes/Finder or iCloud device backups must not restore the protected item to a new device — must be explicitly verified at implementation time against current platform documentation, consistent with `PRODUCT_ARCHITECTURE.md` §9's existing caution that such guarantees must be validated, not assumed from a library's marketing.

**Preferred architecture (restated, as required)**:

```
Secure Enclave / platform-protected key (P-256, biometric/passcode-gated)
    → protects access to a wrapping key or protects/gates a wrapping operation
    → wrapping key decrypts the versioned encrypted envelope (§3)
    → decrypted entropy enters Rust Wallet Core only for the duration of the
      operation that required it (derive/sign/reveal); the mnemonic sentence
      is reconstructed from it transiently only when actually needed (§2)
    → cleared/zeroized per §13 immediately after
```

*This diagram states the intended authentication factors and behavior; the exact `SecAccessControl` flag composition that achieves it is validated at implementation time per the "Required behavior" / "Explicitly deferred to implementation" text above — it is not a promise that one fixed configuration behaves identically on every iOS version/device.*

### 5. Android architecture

**Preferred architecture**:

```
Keystore-generated non-exportable wrapping key
    → hardware-backed where available (StrongBox preferred where supported and
      operationally appropriate, else TEE-backed)
    → BIOMETRIC_STRONG + DEVICE_CREDENTIAL gated, per-use authentication
      (no cached/timed validity for signing/reveal operations, §7/§10)
    → wrapping key decrypts the versioned encrypted envelope (§3)
    → wallet secret is released only after approved local authentication,
      only for the duration of the operation, per §13
```

*This diagram states the intended authentication factors and behavior; the exact API-level configuration that achieves it is validated at implementation time per the "Required behavior" / "Explicitly deferred to implementation" subsections below — it is not a promise that a single fixed configuration behaves identically on every Android version/device.*

**Hardware-backed key, where available**: the wrapping key should request hardware backing (StrongBox where present, TEE-backed Keystore otherwise) — but the actual backing tier achieved must be **queried and verified at runtime, not assumed from the request alone**, since a device may silently fail to honor a StrongBox request if unsupported.

**StrongBox where supported and operationally appropriate**: StrongBox (a discrete, physically separate secure chip on supporting devices) is the preferred tier where present, but this is a *preference*, not an unconditional requirement — StrongBox has real operational costs on some devices (slower operations, a more restrictive supported-algorithm set) that must be weighed at implementation time.

**TEE vs. StrongBox distinction**: TEE-backed Keystore keys run in a Trusted Execution Environment sharing more of the device's silicon/software attack surface than StrongBox's physically discrete chip. StrongBox is the stronger guarantee where present; TEE-backed is the common middle tier; neither is present on the weakest device class (§6).

**Security requirement first, implementation detail second.** This ADR states the required Android authentication behavior as a security requirement, then explicitly defers the exact API-level configuration that achieves it to implementation-time validation — it does not assume any single `KeyGenParameterSpec`/authenticator-combination configuration behaves identically across every Android API level, OEM, and device.

**Required behavior**:
- **Auth-per-use, not timed, for high-risk operations**: the wrapping key's cryptographic operations must require authentication **per use** (no cached/timed validity window) for the operations that gate signing and recovery-phrase reveal specifically — consistent with §10's "one authorization = one signing action" rule. A timed/cached window may be acceptable only for lower-risk, non-secret-touching operations (App Lock, §9), a distinct authorization tier from key-use authorization.
- **Strong authentication factors only**: gating the wrapping key must use a strong-class biometric authenticator (not a weak/convenience-tier class) combined with device-credential fallback, consistent with §8's fallback policy.
- **Biometric enrollment changes must not silently weaken authorization**: if the platform and the specific key configuration chosen at implementation time support automatic key invalidation on biometric-set change, that mechanism must be enabled and its invalidation must be handled as a defined failure mode (§17) — re-authentication via device credential, never silent secret loss or silent fallback to a weaker authorization class. If, for a given Android API level, device, or key configuration, such automatic invalidation is not available or not verified, the implementation must provide an equivalent compensating control (e.g., detecting the enrollment change through another available signal and forcing re-authentication) rather than silently relying on unverified platform behavior.
- **Detect and handle key invalidation wherever the selected configuration/platform provides a signal for it** — this ADR requires the behavior (invalidation must be detected and handled per §17, never silently ignored), not a specific API call.

**Explicitly deferred to implementation**: the exact `KeyGenParameterSpec` configuration, the exact authenticator-combination API (e.g. `BIOMETRIC_STRONG`/`DEVICE_CREDENTIAL`-class constants and their precise combination), and whether `setInvalidatedByBiometricEnrollment`-equivalent behavior is available and reliable for the chosen configuration **must be validated against the actual Android API level and device matrix at implementation time (§19)** — this ADR does not promise uniform behavior across all supported devices and does not commit to a specific API surface here.

**Device restore/migration**: Android's backup/restore mechanisms (Auto Backup, device-to-device transfer tools) must not be relied upon to transfer the wrapping key or the encrypted secret to a new device in usable form — Keystore keys are platform-documented as non-exportable and device-bound. Must be explicitly verified at implementation time for the exact key-generation parameters chosen; the product must never represent this transfer as a substitute for recovery-phrase-based restore.

**Application reinstall behavior**: uninstalling the app is expected, under standard platform behavior, to remove its Keystore-generated keys along with app-private storage — meaning a plain reinstall (absent a working OS-level app-data backup, which itself must not be relied upon per above) results in a fresh, secret-less app state requiring recovery-phrase restore. Must be explicitly verified at implementation time, not assumed.

**This ADR does not assume all Android devices provide equal guarantees.** Device capability must be queried and classified at runtime per §6 — a budget device with no hardware-backed Keystore at all is a real, expected case, not an edge case to be silently ignored.

### 6. Device security tiers / fallback policy

| Tier | Capability | Wallet creation | Signing | Warning required | Real-money use |
|---|---|---|---|---|---|
| **A — Full hardware-backed** | Secure Enclave (iOS) / StrongBox-or-strong-TEE (Android); `BIOMETRIC_STRONG` enrolled; device passcode/PIN set | Allowed | Allowed | None beyond ordinary onboarding security explanation | Allowed |
| **B — Hardware-backed, no strong biometric** | Hardware-backed key available; no biometric enrolled or none present on-device; device passcode/PIN set | Allowed | Allowed, gated by device credential | Non-blocking informational note recommending biometric enrollment | Allowed |
| **C — No hardware backing** | Software-only key protection (device fails to attest hardware backing); device passcode/PIN set | Allowed, with explicit acknowledgment | Allowed, gated by device credential (or biometric if present) | **Explicit, non-dismissible-without-acknowledgment warning** that the device lacks hardware-backed secure storage and funds are not protected to the same degree as on a higher tier | Allowed, with acknowledged risk |
| **No device passcode/PIN set at all** | The entire access-control model (§4/§5) fundamentally requires a device credential to exist | **Blocked** | N/A | Clear message instructing the user to set a device passcode/PIN first | Blocked until resolved |

**Recommended V1 policy, stated as one rule**: Tiers A and B are supported without restriction beyond Tier B's informational nudge; Tier C is supported but requires an honest, explicit capability-gap warning before wallet creation; the no-passcode sub-case blocks wallet creation entirely, since it breaks the access-control model this entire ADR depends on.

**Explicitly, per this ADR's requirement: software-backed storage is not treated as equivalent to Secure Enclave/StrongBox-backed storage.** The product must surface this distinction honestly (Tier C's warning) rather than silently presenting every successful key-creation outcome as equally protected.

### 7. Local authentication policy

| Action | Authentication requirement |
|---|---|
| Cold app launch | App Lock authentication (§9) |
| Resume after background timeout | App Lock re-authentication if the configured timeout has elapsed (§9) |
| View balances | Covered by App Lock; no separate per-view prompt — balances are non-secret data once unlocked |
| Receive (view address / QR) | Covered by App Lock; addresses are not secret (ADR-003) |
| Send entry (compose draft) | Covered by App Lock; composing an unsigned draft touches no secret material |
| **Final Send signing** | **Always fresh local authentication**, regardless of App Lock state or how recently it was satisfied — a hard, non-cacheable gate immediately before Wallet Core unlocks key material (§10) |
| **Swap signing** | Same as Send signing — fresh authentication, no exception |
| **Reveal recovery phrase** | Fresh local authentication, no caching (ADR-004 §5, §11 below) |
| **Security-setting changes** | Fresh local authentication — prevents silent downgrade during momentary unattended access |

**Governing philosophy**: do not require biometric/authentication friction for harmless, read-only actions (viewing balances, receiving, composing an unsigned draft), but **always** require fresh authorization for security-critical secret use, signing, and recovery-phrase reveal.

**Freshness window**: App Lock may have a bounded, product-configurable freshness/timeout window governing whether re-authentication is needed on resume (exact duration is a later product/UX decision, not fixed here) — but this window applies **only** to App Lock. Signing and phrase-reveal always require their own fresh authentication event, regardless of how recently the app was otherwise unlocked. This is decided as a hard rule, not a default that could be configured away.

### 8. Biometrics vs. device credential

**Biometrics are a local authorization factor, not the root encryption secret.** The actual protection is the platform-hardware-backed wrapping key (§4/§5); biometrics only gates operations against it — restated per this ADR's own requirement, consistent with prior research and ADR-002/004.

**Fallback handling**:

| Condition | Behavior |
|---|---|
| Face ID/Touch ID failure (misread) | Platform-standard retry, then fall back to device passcode |
| Fingerprint failure (Android) | Same — retry, then device-credential fallback |
| Biometric unavailable (not enrolled/no hardware) | Device credential is the primary gate — this is Tier B (§6) |
| Biometric lockout (platform-enforced) | Device-credential fallback required, per platform's own lockout policy — not treated as a wallet-specific failure |
| User disables biometrics in OS settings | Device credential becomes the gate going forward; the app must detect and adapt at runtime, not assume static availability |
| New biometric enrolled | Triggers key invalidation (§4/§5) — a defined re-authentication/re-enrollment flow, never silent |
| Device passcode/PIN | **Recommended as the general-availability fallback** for the majority of gated operations, ensuring the product remains usable and equally hardware-key-gated for users without biometric hardware/enrollment (Tier B), without falling back to a software-only shortcut |

**Explicit for signing and recovery-phrase reveal**: both accept device-credential fallback when biometric is unavailable or has failed — the security-relevant property is "a fresh, platform-verified local authentication occurred," and device credential verified by the OS satisfies that just as validly as biometric for this ADR's trust model. **What must never happen for either operation is a silent skip of authentication, or acceptance of an authentication result cached from an unrelated earlier event.**

### 9. App Lock model

**App Lock is decided as a layer separate from cryptographic key protection.** "The app is unlocked" (a UI/navigation state gating whether screens render non-secret-but-sensitive data such as balances/history) is **not** the same as "the wallet's signing key material is authorized for use" (a Wallet Core / hardware-key-gated operation, per §7's rule that signing/reveal always require their own fresh authentication regardless of App Lock state).

- **App launch**: requires authentication before any wallet content renders.
- **Foreground resume**: requires re-authentication if the configured timeout has elapsed since backgrounding.
- **Timeout**: bounded and product-configurable; this ADR requires that *some* bounded timeout exists — an indefinite, no-timeout unlocked state is not acceptable — without fixing its exact value.
- **UI privacy while locked**: no sensitive content (balances, addresses, activity, recovery-related screens) renders behind the App Lock screen; the lock screen itself must not leak account state.
- **Balances visibility**: gated by App Lock alone, not a separate secret-key gate, since balances are public chain data derived from already-authorized addresses.
- **App-switcher snapshot protection**: the OS-level app-switcher preview must not display sensitive content when backgrounded — ties into §15.

**Explicitly: App Lock unlocked ≠ signing key authorized.** These are two independent gates; satisfying one never implicitly satisfies the other.

### 10. Signing authorization model

```
user reviews exact transaction (confirmation UI rendered from the exact
  payload about to be signed, per ADR-002 §4 invariant 5)
  → trusted confirmation payload is fixed (no mutation without
    re-confirmation, per ADR-002 §4 invariant 6)
  → fresh local authentication (biometric or device credential, §7/§8 —
    never cached from an earlier event)
  → Wallet Core unlocks secret/key material (decrypts only what's needed,
    §2/§13)
  → Wallet Core validates the payload again immediately before signing
    (structural checks per ADR-002 §4 invariant 7 / ADR-003 §10.6 —
    change-address ownership, calldata match, chain ID, balanced arithmetic)
  → signs exactly the approved transaction
  → secret cleanup / zeroization (§13)
  → signed transaction (never key material) leaves Wallet Core
  → broadcast (backend/RPC layer, out of this ADR's scope)
```

**Signing authorization must not become a reusable, unlimited session token.** Decided explicitly: **V1 policy is one fresh authentication event authorizes exactly one signing action.** Multiple transactions can never be authorized by a single biometric/device-credential event — each Send or Swap signing operation independently triggers its own fresh authentication, with no session/token that could be replayed or reused for a second, different transaction.

### 11. Recovery phrase reveal model

Aligned with ADR-004 §5:

```
Recovery & Backup screen entry (deliberate navigation only)
  → high-risk warning shown
  → fresh local authentication (no caching, §7/§8)
  → secure decryption of the canonical persisted entropy (§2/§3)
  → mnemonic sentence deterministically reconstructed from the decrypted
    entropy (§2) — this is the one point in normal operation where the
    mnemonic sentence, as opposed to raw entropy, is materialized
  → phrase displayed (hidden by default until this point, per ADR-004 §14);
    for a passphrase-protected imported wallet (§2), the screen must also
    make explicit that the displayed words alone are not a complete backup
    and that the passphrase must be preserved separately
  → auto-hide on: backgrounding, navigation away, or a bounded timeout —
    whichever occurs first
  → cleanup: displayed value cleared from any retained state; the
    underlying decrypted secret is zeroized per §13
```

Consistent with ADR-004 §6/§11, the phrase must not: enter the clipboard; enter logs of any kind (§14); enter analytics (§14); enter the backend; or persist in React Native state any longer than the single render cycle required to display it, never surviving navigation away or backgrounding.

**Whether the phrase should cross the Rust → native/UI boundary, and how to minimize exposure — examined explicitly, as required**:

- The **strongest option** is a **native secure rendering surface**: the reveal screen (or at minimum the word-rendering portion) is implemented as native Swift/Kotlin UI, receiving the decrypted phrase directly from Wallet Core via the native binding layer and rendering it without the value ever being marshalled into the React Native JavaScript runtime as a JS string. This would mean the phrase never exists as a JS-heap object, eliminating the JS-side zeroization gap identified in prior research (JS strings are immutable/interned and cannot be reliably zeroed) for this specific, highest-value secret.
- The **weaker, simpler option** is passing the phrase as a JS string across the bridge for an RN component to render — materially easier to build with standard Expo/RN tooling, but reintroduces exactly the JS memory-safety gap ADR-002 chose Rust specifically to avoid, for the single most sensitive value in the product.
- **This ADR does not select the exact implementation mechanism** — that is properly an implementation-stage decision made once native tooling/library options are evaluated. **What this ADR requires as a binding guarantee, regardless of which mechanism is eventually chosen**: exposure window and retained-copy count of the plaintext phrase must be minimized as far as the chosen mechanism technically allows; and if a JS-string-based approach is used instead of a native secure view, that specific, narrow exception must be explicitly documented in the implementation's own security review as a deliberate, tightly-scoped deviation — not silently normalized as an unremarkable pattern reusable elsewhere.

**This is documented explicitly as the one unavoidable trust-boundary exception in the entire architecture**, because a human must, at some point, be able to read the words to record them — no technical mechanism can avoid that without defeating the feature's purpose. It is constrained as tightly as this ADR and ADR-004 together specify precisely because it is an exception, not a precedent.

### 12. React Native / Rust secret boundary

**Normal operations, restated and unweakened**: React Native never receives the mnemonic, seed, or private keys under any normal (non-reveal) operation. RN receives only public addresses, decoded confirmation data, balances, and other non-secret application state — this is ADR-002's rule, unchanged by this ADR.

**Recovery reveal is the sole, explicitly scoped exception**, resolved in §11 by: preferring a native secure rendering boundary where feasible; requiring the exposure to be as minimal and short-lived as the chosen mechanism allows; requiring explicit documentation of the exception at implementation time rather than treating it as ordinary data flow.

**Stated plainly, per this ADR's requirement: this document does not casually normalize passing mnemonic strings through JS.** The default, unweakened assumption for every other secret-touching operation (derivation, signing) remains that JS never sees the secret — only the one narrow, human-legibility-driven exception in §11 exists, and only for that purpose.

### 13. Memory security

Requirements for Rust/native secret handling:

- **Minimize copies**: pass secret buffers by reference/ownership rather than duplicating them across Wallet Core function boundaries wherever the implementation allows.
- **Zeroize secret buffers where supported**: use a guaranteed-overwrite-on-drop pattern for every buffer that ever holds the mnemonic, seed, or a derived private key.
- **Avoid immutable long-lived String copies where possible**: prefer mutable byte-buffer representations for secret material over immutable string types, since immutable copies cannot be reliably zeroized.
- **No debug formatting of secrets**: secret-holding types must not implement or derive standard debug/display formatting that could print their contents — enforced at the type level where the language allows, not by developer discipline alone.
- **No panic/error messages containing secrets**: failure paths must describe *what* failed structurally (e.g. "decryption failed") without ever interpolating the secret value itself.
- **No serialization into general app state**: secret material must never be included in any object serialized for persistence, logging, or cross-boundary transport outside the narrow, explicit pathways this ADR defines (§2/§3's envelope, and §11's narrowly-scoped exception).
- **Release immediately after operation**: decrypted secret material's lifetime in memory is bounded to the specific operation that required it (derive, sign, reveal) and cleared immediately afterward — never held for the duration of an app session.

**Explicitly stated, per this ADR's own requirement: zeroization reduces risk — it shrinks the exposure window and the number of recoverable copies — it does not guarantee secrecy against a fully compromised process or OS.** A sufficiently privileged attacker (e.g., on a rooted/jailbroken device, or with memory-forensics tooling against a live, unlocked, actively-signing process) may still recover secret material live in memory at the moment of compromise. This restates, and does not weaken, ADR-002's existing Threat/Trust Assumptions.

### 14. Logging / crash / analytics

**Absolute prohibition, restated as binding for this ADR's full secret inventory**: the mnemonic, seed, private keys, wrapping keys, decrypted secret blobs, and raw signing secrets must never appear in any log, crash report, breadcrumb, or analytics event, under any build configuration — **including debug builds.** The rule is not relaxed for non-production configurations.

- **Native logs** (iOS console/`os_log`, Android Logcat): must never receive secret-bearing values; any debug logging touching the wallet-secret path must be reviewed and removed before release, ideally structurally prevented (§13) rather than merely avoided by convention.
- **Rust logs**: any logging inside Wallet Core must never be passed a secret-holding value; the type-level "no debug formatting" requirement (§13) is the primary structural defense.
- **React Native logs**: since normal operation never delivers secrets to JS (§12), this is largely satisfied by construction for everything except the narrow reveal exception (§11), which must be independently reviewed for logging safety.
- **Crash reporters**: any future crash-reporting integration must apply PII/sensitive-field scrubbing, with this ADR's secret inventory treated as an absolute-exclusion category, not merely a scrubbing candidate.
- **Breadcrumbs**: any breadcrumb/trace system must exclude the recovery/signing/reveal flows' payload content, recording at most coarse, non-identifying event names.
- **Analytics**: event *names* touching these flows (coarse, non-identifying) are acceptable; event *data* touching secret material is not.

**Recommendation: redaction-by-design, not developer discipline alone.** Where the platform/language allows it, secret-bearing types and values should be made structurally difficult or impossible to accidentally log — relying solely on code-review convention is explicitly judged insufficient given the severity of a mistake in this area.

### 15. Screen capture / app-switcher privacy

- **Recovery phrase screen**: highest-priority target. Apply `FLAG_SECURE` on Android (genuinely blocks both screenshot and screen-recording capture at the OS level for a flagged screen) and the strongest available iOS mitigation — iOS lacks a direct equivalent hard-block for screenshots, but screen-recording *detection* (`UIScreen.isCaptured`) exists and should be used to react defensively (e.g., hiding content while active recording is detected).
- **Transaction confirmation, where appropriate**: lower priority than the phrase, since confirmation data is the user's own intended transaction, not a secret in the same sense — extending capture protection here is left as an implementation-time UX decision, not a hard requirement of this ADR.
- **App background snapshot**: per §9, the OS-level app-switcher preview must not display sensitive screens (the recovery-phrase screen at minimum) — via backgrounding hooks that swap in a neutral placeholder, or `FLAG_SECURE`'s snapshot-blocking side effect on Android.
- **Android `FLAG_SECURE`**: effective; should be applied at minimum to the recovery-phrase-bearing screen/activity.
- **iOS limitations**: iOS provides no OS-level mechanism to fully prevent a screenshot; screen-recording *detection* is available and should be used to react, but this is a *reduce/detect* control, not a *prevent* control, for iOS screenshots specifically.

**Explicitly, per this ADR's own requirement: screenshots cannot be universally prevented on every platform, and this document does not claim otherwise.**

**External camera attacks are explicitly out of scope.** No software control on the device can prevent a second device or camera from photographing the screen while the phrase is displayed — this is a threat classified as warn-only/user-education (§21), not a technical control this ADR attempts to build.

### 16. Backup / migration / reinstall consequences

| Scenario | iOS expected behavior | Android expected behavior |
|---|---|---|
| App deleted/reinstalled | Depends on the exact Keychain access-control class/synchronization setting chosen — **must be explicitly verified at implementation time**, not assumed | App-private storage and Keystore-generated keys are expected to be removed on uninstall under standard platform behavior — **must be explicitly verified** |
| OS backup restored (iCloud/Finder; Android Auto Backup/Transfer) | `ThisDeviceOnly` item not expected to be included at all — verify against current platform documentation | Keystore keys documented as non-exportable/device-bound, not expected to transfer — verify against current documentation |
| User buys a new phone | No wallet secret transfers automatically by design — recovery phrase is the required restore path (ADR-004) | Same |
| Device passcode changes | Passcode-dependent access classes may be invalidated or require re-authentication depending on class/OS version — verify at implementation time, handle as a defined failure mode (§17), never silently | Device-credential-authenticated keys may behave similarly — same verification and handling requirement |
| Biometric set changes | `.biometryCurrentSet`-protected access invalidated (§4) — defined failure mode, re-authentication via passcode required | `setInvalidatedByBiometricEnrollment(true)`-configured key invalidated (§5) — same handling |
| Device factory reset | All local secure storage removed, as expected — recovery phrase is the sole restore path | Same |

**The design preserves the fundamental ADR-004 rule: the recovery phrase, not device storage, is the ultimate recovery method.** Every row above is a direct structural enforcement of that rule — the access-control classes and key configurations chosen (`ThisDeviceOnly`, non-exportable Keystore keys) exist specifically so that **no hidden dependency on device backup for funds recovery is ever created.** If any of the above behaviors were found at implementation time to actually allow the wallet secret to silently transfer to a new device via backup/migration, that would be a deviation from this ADR requiring remediation, not an acceptable convenience.

### 17. Failure modes

| Failure | Required behavior |
|---|---|
| Secure key unavailable | Fail closed; explicit, honest error state — never proceed as if no wallet exists |
| Keychain/Keystore item missing | Distinct, explicit error state, not conflated with "no wallet was ever created"; guide toward recovery-phrase restore, never toward re-creation |
| Key invalidated (biometric/passcode change) | Explicit re-authentication flow; the ciphertext is not destroyed by key invalidation, only the prior access path — attempt device-credential-based re-authentication before ever suggesting recovery-phrase restore is required |
| Decrypt failure | Fail closed with a clear, honest error; retry logic, if any, must never fall through to wallet re-creation |
| Corrupted ciphertext | Detected via the AEAD's integrity check (§3) failing; treated identically to decrypt failure |
| Authentication failure | Standard platform retry, then fallback per §8; never silently bypassed |
| Authentication cancellation | Cleanly abort the requested operation, returning to the prior safe state; never proceed as if authentication succeeded |
| Biometric lockout | Fall back to device credential per §8; deferred to platform lockout/recovery policy |
| Device security downgraded (e.g. passcode removed post-creation) | Detected at next relevant access attempt; surfaced as an explicit warning consistent with Tier C messaging (§6) — never silently ignored |
| Unsupported security capability | Detected at wallet-creation time, classified per §6 — never silently treated as equivalent to full hardware backing |

**The single most important invariant in this entire ADR, restated verbatim per the task's own emphasis: a failure to decrypt or access the existing wallet secret must never silently trigger creation of a new wallet.** Doing so would present the user with a fresh, empty, differently-keyed wallet with no indication their original funds are inaccessible rather than gone — the single most dangerous failure mode this architecture can produce. Every row above exists specifically to avoid it: any decrypt-failure or key-unavailable state must surface an explicit, honest error and direct the user toward recovery-phrase-based restore (ADR-004), never toward "create a new wallet."

**Stated as its own explicit, non-negotiable rule, specifically for wrapping-key loss/invalidation**: **loss or invalidation of the device wrapping key — whether from a Keychain/Keystore item going missing, an OS-level invalidation event (§4/§5/§16), a platform bug, or any other cause — MUST NEVER cause silent wallet recreation.** On encountering this condition, the app must enter an explicit **recover-wallet state**: it must present the failure honestly, refuse to fabricate a fresh empty wallet in its place, and require the user to go through ADR-004's recovery-phrase-based restore flow to regain access. This applies even when a compensating re-authentication path (e.g. device-credential-based recovery of an equivalent access path, where the platform allows it, per §4/§5) has already been attempted and failed — the fallback from a fully exhausted recovery attempt is the recover-wallet state, never wallet re-creation.

### 18. Cryptographic migration

```
v1 encrypted envelope (§3) exists, protected by the current wrapping-key model
  → user authenticates and unlocks (ordinary operation, not a special
    migration-triggered auth)
  → v1 envelope is decrypted, yielding the canonical secret (§2)
  → secret is re-encrypted under the new (v2) algorithm/envelope parameters,
    using a freshly generated nonce and, if applicable, a freshly
    provisioned wrapping key
  → new (v2) envelope is written and verified (e.g. a round-trip
    decrypt-and-compare check, or a confirmed successful write) before
    anything is removed
  → the old (v1) envelope is deleted only after the new one is confirmed
    valid — never delete-then-write
  → future decrypt attempts use the v2 path; the envelope's own version
    field (§3) tells Wallet Core which algorithm/parameters to apply
```

This is the direct reason the versioned envelope from §3 exists: it makes a future cryptographic change possible **without ever requiring the user to recreate the wallet, re-enter their recovery phrase, or lose access during the transition** — migration is a normal authenticated unlock followed by a re-encrypt-and-atomically-swap operation, using the same secret the user has always had. No specific algorithm choice or migration trigger condition is decided here.

### 19. Expo / build consequences

- **Expo Go will not be the wallet-security test environment.** None of Keychain/Keystore access-control classes, Secure Enclave/StrongBox-backed key generation, or platform biometric/local-authentication integration are available through Expo Go's fixed built-in module set.
- **Custom development builds are required** — already anticipated by ADR-002, now concretely triggered by this ADR's decisions.
- **Expo/React Native may remain the application framework** — this ADR does not require abandoning Expo.
- **Prebuild/native modules are acceptable** — `expo prebuild` plus config plugins is the expected integration path for whatever secure-storage/biometric library is eventually selected (§20) alongside the Rust binding layer ADR-002 established.
- **Bare workflow is not automatically required** — the managed-workflow-plus-custom-dev-client pattern remains preferred unless a specific, currently-unidentified implementation constraint proves otherwise.

**What future implementation will need to test on**:
- **iOS Simulator / Android Emulator**: adequate for UX/control-flow validation — screen transitions, authentication-prompt call sequencing, timeout/App-Lock behavior, error-state handling — since these don't require genuine hardware security backing.
- **Physical iPhone**: required to verify actual Secure Enclave availability/behavior, real Face ID/Touch ID interaction, and genuine `ThisDeviceOnly`/backup-exclusion semantics — simulators do not provide genuine Secure-Enclave-backed guarantees.
- **Physical Android device(s), plural, spanning device tiers**: required to verify actual hardware-backed Keystore behavior — specifically, a StrongBox-capable device to validate that path, and a device without hardware backing to validate correct Tier B/C fallback behavior. Android's hardware landscape is heterogeneous enough that a single device is not sufficient to validate all tiers.

**Explicitly stated, per this ADR's requirement: simulators/emulators can validate UX and control flow, but hardware-backed security guarantees fundamentally require physical-device verification** — not a testing nicety, but a hard requirement, since the entire value proposition of this architecture is a hardware property no simulator genuinely provides.

### 20. Library selection criteria

This ADR defines acceptance criteria; it does not select libraries. Future secure-storage/biometric library selection (for the Swift/Kotlin thin platform-integration layer per ADR-002 §3) must be evaluated against:

- **Maintained** — active maintenance, responsive to platform OS updates.
- **Audited/reputable** — preference for a track record in production security-sensitive apps or published security review, over popularity alone (per root `CLAUDE.md`'s "do not choose packages merely because they are popular").
- **Expo/RN integration viability** — usable from an Expo custom-dev-client/prebuild setup (§19) without requiring bare-workflow ejection.
- **Clear native semantics** — documentation must make explicit, verifiable claims about exactly which Keychain access-control classes / Keystore configuration options it exposes.
- **Keychain/Keystore access-control support** — must support the specific access-control classes this ADR requires (§4/§5); a library exposing only a weaker or less configurable subset does not qualify.
- **Hardware-backed capability visibility** — must expose, at runtime, whether the actual key/storage achieved hardware backing (and StrongBox specifically, on Android) — required to implement §6's device-tier classification honestly.
- **Authentication-context control** — must support the fresh-per-operation, non-cached model §7/§10 require, not only a session-style cached-authorization pattern.
- **No hidden cloud synchronization** — must not default to, or silently enable, any sync behavior that could transmit protected material off-device; must be explicitly configurable to the `ThisDeviceOnly`/non-exportable posture this ADR requires.
- **Predictable key invalidation behavior** — documented, testable behavior for the biometric-enrollment-change and passcode-change scenarios (§4/§5/§16).
- **Testability** — supports the physical-device/simulator split in §19, ideally with some ability to simulate/mock failure states (§17) without requiring live hardware for every test run.

**This ADR defines these guarantees first; implementation selects and evaluates specific libraries afterward**, at whichever future stage the roadmap places secure-storage implementation — no library is named or committed to here.

---

## Threat Model

| Threat | Classification | Notes |
|---|---|---|
| Stolen locked phone | Prevent (largely) | Hardware-backed key + passcode-gated access class is the platform's strongest available guarantee tier, assuming Tier A/B (§6) |
| Stolen unlocked phone | Reduce | Fresh per-operation authentication for signing/reveal (§7/§10/§11) limits exposure even on an already-unlocked device — App Lock alone does not gate secret use (§9) |
| Malicious backend | Reduce | Backend never receives secret material and cannot trigger decryption/signing (ADR-002); factual chain-state verification remains out of this ADR's scope |
| Malicious JS bundle | Reduce | Normal operation never delivers secret material to JS (§12); the narrow reveal exception (§11) is the one path requiring independent scrutiny |
| Malicious/compromised dependency | Reduce | Library-selection criteria (§20) and existing dependency-review discipline reduce likelihood; cannot be eliminated for any third-party dependency |
| Rooted/jailbroken device | Warn only | Detection is a bypassable risk signal, not a security boundary, consistent with ADR-002; root/jailbreak can undermine the OS-level guarantees this entire ADR depends on |
| Memory dump | Reduce | Zeroization (§13) shrinks exposure window/copy count; does not prevent capture of live, currently-decrypted material |
| App backup extraction | Prevent (largely) | `ThisDeviceOnly`/non-exportable key design (§4/§5/§16) is specifically intended to exclude the protected secret from standard backups — subject to explicit per-implementation verification, not assumed |
| Biometric spoofing | Out of scope (platform-owned) | Matching fidelity of Face ID/Touch ID/Android biometrics is a platform security property this ADR depends on but does not control |
| Shoulder surfing | Warn only | Human-observation threat during reveal or PIN entry; mitigated only by UX design (auto-hide, minimized reveal frequency), not a technical control |
| Screenshot/screen recording | Reduce | Platform privacy controls applied where available (§15); explicitly not a universal-prevention claim, particularly on iOS |
| OS compromise | Out of scope | This architecture depends on OS-level guarantees being intact and cannot independently verify or substitute for them, consistent with ADR-002 |

---

## Final Decision Table

| Decision | V1 Choice | Deferred / Rejected | Reason |
|---|---|---|---|
| Canonical persisted wallet secret | **BIP-39 entropy only** (16–32 bytes, per imported word count); the mnemonic sentence is reconstructed from it transiently only when needed (display, seed derivation) — never itself the resting/persisted form | Persisting the mnemonic sentence as the resting form — rejected; persisting the derived seed instead — rejected | Entropy↔mnemonic-sentence is a lossless, standard BIP-39 bijection (no recovery-contract deviation); entropy is a fixed-size byte buffer, easier to reliably zeroize than a long-lived `String` (§2) |
| Imported passphrase persistence | **Never persisted, in any form, and never cached indefinitely in memory**; user re-supplies it whenever seed derivation requires it | Persisting or session-caching the passphrase to reduce re-entry friction — rejected | Persisting it alongside the entropy would defeat the passphrase's entire security purpose; flagged as a real UX cost requiring product review, not silently engineered around (§2) |
| Ciphertext storage location | iOS Keychain / Android Keystore-adjacent app-private storage, as a versioned AEAD-encrypted envelope | Plain filesystem, database column, `AsyncStorage` — all rejected | Matches ADR-002/CLAUDE.md's hard prohibition on unprotected persistence for secrets (§2) |
| iOS wrapping-key model | Secure-Enclave-protected key gates a wrapping key/operation that decrypts the envelope; Keychain item at `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`-equivalent, `ThisDeviceOnly` | Unwrapped direct Keychain storage of the entropy — rejected | Secure Enclave cannot directly hold secp256k1/BIP-39 material; layered model is required (§4) |
| iOS biometric-set-change invalidation | **Required behavior, not a promised specific mechanism**: if the flag composition chosen at implementation validates as providing invalidation-on-enrollment-change, it must be enabled and handled per §17; if not, an equivalent compensating control must be identified — never a silent security regression | Assuming `.biometryCurrentSet` (or any single flag combination) gives identical behavior across all iOS versions/devices without validation — rejected | Exact `SecAccessControl` flag composition must be validated on real devices at implementation time (§4, §19) |
| Android wrapping-key model | Keystore-generated non-exportable wrapping key, hardware-backed where available, StrongBox preferred where supported, gates decryption of the same versioned envelope | Same rejection as iOS row | Mirrors iOS's layered model; Keystore also cannot directly hold arbitrary secp256k1 material as this architecture requires (§5) |
| Android biometric-enrollment invalidation | **Required behavior, not a promised specific mechanism**: if the selected `KeyGenParameterSpec`/authenticator configuration provides automatic invalidation on biometric-enrollment change, it must be enabled and handled per §17; if not available/verified for a given API level or device, an equivalent compensating control must be identified — never a silent security regression | Assuming `setInvalidatedByBiometricEnrollment(true)` (or any single configuration) behaves identically across all Android API levels/devices without validation — rejected | Exact configuration must be validated against the Android API/device matrix at implementation time (§5, §19) |
| Hardware-backed preference/requirement | Preferred and requested wherever available; actual achieved tier honestly surfaced (§6) | Requiring hardware backing unconditionally (blocking Tier C) — rejected | Would exclude a real device population; honest warning chosen instead |
| StrongBox policy | Preferred where supported and operationally appropriate | Mandatory StrongBox-or-block — rejected | Real operational costs and device variability don't justify an unconditional requirement (§5) |
| Biometrics | Strong-class biometric (e.g. `BIOMETRIC_STRONG` / Face ID-Touch ID) as primary factor where enrolled; per-operation, non-cached for signing/reveal | Weak/convenience-tier biometric classes — rejected | Weak classes are not an acceptable authorization factor for wallet-secret access (§5, §7) |
| Device-credential fallback | Accepted as an equally valid authorization factor for all operations, including signing and phrase reveal | Blocking device-credential-only users from signing/reveal — rejected | Device credential is still hardware-key-gated and OS-verified, not a shortcut (§8) |
| Signing auth freshness | Always fresh per signing action; never cached/reusable across multiple transactions | A session-token/cached-authorization model — explicitly rejected | Prevents a single unlock event from authorizing unbounded signing (§10) |
| Phrase reveal auth | Always fresh, no caching, every reveal independently authenticated | Caching reveal authorization for a session — rejected | Matches ADR-004 §5's strict-gating requirement (§11) |
| App-lock model | Separate layer from key authorization; bounded, configurable timeout; App-Lock-unlocked ≠ signing-key-authorized | Treating App Lock as sufficient authorization for signing/reveal — rejected | Explicit separation is the core requirement (§9, §10) |
| Secret-to-JS policy | Never, for all normal operations (derivation, signing) | Passing derived private keys or the seed to JS for any convenience reason — rejected outright | Restates ADR-002's invariant unweakened (§12) |
| Recovery-display exception | The one explicitly scoped, documented exception; native secure rendering preferred, JS-string rendering permitted only as an explicitly-reviewed, tightly-constrained fallback | Treating this exception as a precedent for any other secret path — rejected | A human must read the phrase at least once; no other operation shares this requirement (§11) |
| Migration/versioning | Versioned AEAD envelope enabling future re-encryption via authenticated-unlock → re-encrypt → atomic swap → delete-old-only-after-verified | An unversioned/fixed-format envelope — rejected | Prevents ever requiring wallet re-creation for a future crypto change (§18) |
| Unsupported-device behavior | Tier C allowed with an explicit, honest capability-gap warning; no-device-passcode sub-case blocks wallet creation until one is set | Silently treating all devices as equally protected — rejected; unconditionally blocking all non-hardware-backed devices — rejected | Balances honesty about real capability differences against not excluding a real device population (§6) |
| Expo Go policy | Not used as the security test environment; custom EAS development builds required once native modules are integrated; Expo/RN and prebuild retained, bare workflow not mandated | Ejecting to bare workflow — not required, not selected | Consistent with ADR-002's Expo Consequence, extended to this ADR's native-module set (§19) |

---

## Acceptance Invariants

1. Plaintext seed is never persisted, under any circumstance.
2. Private keys are never persisted in ordinary storage.
3. Secrets never reach the backend, in any form.
4. Normal secret operations never expose secrets to JS — only the explicitly scoped recovery-reveal exception exists (§11–12).
5. Signing requires fresh local authorization every time — never cached, never a reusable session (§10).
6. The transaction payload is revalidated by Wallet Core after authorization and immediately before signing (§10).
7. Failed decryption, or loss/invalidation of the device wrapping key, never triggers silent wallet recreation — the app enters an explicit recover-wallet state requiring ADR-004 recovery instead (§17) — the single most important invariant in this ADR.
8. Device backup is not fund recovery — the recovery phrase is (§4, §5, §16, restating ADR-004).
9. The recovery phrase remains the ultimate recovery mechanism regardless of device state.
10. Security-capability differences across devices (§6) are surfaced honestly, never hidden or treated as equivalent.
11. Physical-device validation is required before real funds are handled, given simulators cannot verify genuine hardware-backed guarantees (§19).

---

## Dependencies on Other ADRs

This ADR explicitly depends on and does not restate or override:

- **ADR-002** — the mnemonic/seed lifecycle ownership, the never-leaves-device invariant (extended here with one explicitly scoped exception), and the backend-is-untrusted-input posture.
- **ADR-003** — the exact derivation paths this ADR's protected seed feeds, unaltered.
- **ADR-004** — the canonical recovery-phrase concept, the later-reveal policy this ADR's §11 implements, and the passphrase-import handling this ADR's §2 extends with a persistence decision.

This ADR does **not** decide:
- Specific Rust crate selection for AEAD/encryption.
- Specific secure-storage or biometric library selection (§20 defines criteria only).
- RPC/indexer/provider strategy — Stage 4C / a future provider ADR.

---

## Consequences

**Benefits:**
- A concrete, layered protection model (hardware-gated wrapping key → encrypted envelope → transient in-memory secret) that satisfies the security objective in §1 without contradicting any prior ADR.
- Explicit, honest device-tier classification (§6) prevents the product from silently overstating protection on weaker devices.
- A single fresh-authorization-per-signing rule (§10) closes the "one unlock authorizes many transactions" gap before implementation begins.
- The versioned envelope (§3/§18) makes future cryptographic migration possible without ever requiring wallet recreation.
- The recovery-reveal exception (§11/§12) is explicitly bounded rather than silently normalized, preserving ADR-002's trust boundary everywhere else.

**Costs:**
- Real UX friction: no skip on onboarding backup (ADR-004), fresh authentication on every signing/reveal action, and Tier C's mandatory warning all add deliberate friction in exchange for safety.
- Real implementation cost: two independent platform integrations (iOS Keychain/Secure Enclave, Android Keystore/StrongBox) must each be built and independently verified on physical hardware (§19) — simulators cannot substitute.
- The passphrase-never-persisted decision (§2) creates a real, recurring UX cost for the (expected to be small) population of users who imported a passphrase-protected wallet.
- Device-tier heterogeneity (§6) means the product must carry and maintain three distinct behavioral paths (A/B/C) rather than one uniform flow.

---

## Validation Notes

This document was checked for consistency against ADR-002, ADR-003, ADR-004, root `CLAUDE.md`, `apps/mobile/CLAUDE.md`, and `PRODUCT_ARCHITECTURE.md` before being finalized:

- No conflict with ADR-002 — the recovery-reveal exception (§11/§12) is explicitly scoped and documented as an exception, not a silent weakening of ADR-002's "raw secrets never cross into JS" invariant; every other operation remains fully consistent with ADR-002 as written.
- No conflict with ADR-003 — this ADR protects the seed ADR-003 already defined the derivation of; it does not alter any path, branch, or account model decision.
- No conflict with ADR-004 — this ADR resolves ADR-004's explicitly deferred secure-storage question (§11 of ADR-004) without altering ADR-004's recovery-standard, wordlist, word-count, later-reveal, or passphrase decisions; it extends ADR-004 §7's passphrase policy with an explicit, consistent persistence decision (§2 of this ADR).
- Consistent with root `CLAUDE.md` and `apps/mobile/CLAUDE.md`'s prohibition on `AsyncStorage`/unprotected persistence for key material and the requirement that hardware-backed guarantees be validated against actual platform behavior, not assumed.
- Consistent with `PRODUCT_ARCHITECTURE.md` §9's existing (proposed, not-yet-approved) secure-storage sketch — this ADR formalizes and extends that direction, including its own caution that platform storage semantics must be validated against current documentation rather than assumed from a library's marketing.
- `PRODUCT_ARCHITECTURE.md`, ADR-002, ADR-003, ADR-004, and both `CLAUDE.md` files were read for this consistency check only; none were modified.
