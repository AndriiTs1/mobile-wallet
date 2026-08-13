# ADR-002: Wallet Core Runtime & Trust Boundary

**Status:** Accepted

**Scope:** This ADR decides architecture only. It does not implement code, does not create `packages/wallet-core`, does not add dependencies, and does not modify `PRODUCT_ARCHITECTURE.md` or any application code. It supersedes nothing (no prior ADR exists in this repository); it is the first ADR recorded.

**Relationship to other documents:** This decision operationalizes the Wallet Core direction already sketched (as proposed, not-yet-approved architecture) in `docs/PRODUCT_ARCHITECTURE.md` §9 ("Non-Custodial Wallet Architecture") and §27 (ADR-002 listed as required before Stage 4 implementation). It does not decide V1 network scope (ADR-001) or derivation paths/account model (ADR-003) — both remain separate, not-yet-written ADRs.

---

## Context

Mobile Wallet is a non-custodial cryptocurrency wallet. Per the root `CLAUDE.md` constitution, seed phrases, private keys, and signing secrets must never be transmitted to a backend, must never be logged or persisted insecurely, and transaction signing must remain device-side. Key/security architecture changes require explicit approval before implementation — this ADR is that approval step for the Wallet Core runtime.

Today, `apps/mobile` is a React Native / Expo application with **no wallet-core, no crypto/signing dependencies, no secure-storage or biometric native modules, and no backend** (verified: `apps/mobile/package.json` contains only Expo/React Native framework packages; `packages/` is empty; no `apps/api` exists). This ADR decides the runtime and trust boundary for the Wallet Core module *before* any of that code is written, consistent with the project's stated execution workflow (state scope before editing on architecturally significant changes).

Three runtime candidates were evaluated: a pure JS/TypeScript wallet core, independent Swift and Kotlin native implementations, and a single shared Rust core bridged to both platforms. The evaluation considered cryptographic safety, secret-memory/zeroization guarantees, mature audited library availability (BIP-39, BIP-32, secp256k1, Bitcoin transaction/PSBT support, Ethereum transaction support), React Native/Expo integration complexity, testing and maintainability, and long-term extensibility toward the multi-chain (Bitcoin + Ethereum/EVM) scope already under consideration for V1.

---

## Decision

### 1. Wallet Core runtime: shared Rust implementation

Security-critical Wallet Core logic will be implemented as a **single, shared Rust codebase**, not duplicated per platform and not implemented in the React Native JS runtime.

Rationale summary (full comparison in "Alternatives Considered" below): Rust is the only evaluated option that gives compiler-enforced (not best-effort) guarantees around secret-memory handling and zeroization, via ownership semantics and the `zeroize`-style pattern of guaranteed overwrite-on-drop. Its available cryptographic libraries for this exact problem — a `secp256k1` binding to the same underlying C library Bitcoin Core itself uses, and `rust-bitcoin`'s mature BIP-174/PSBT support — are among the most audited and battle-tested available in any language ecosystem. Because the implementation is written once and shared across iOS and Android, it avoids the single largest structural risk of a dual-native approach: two independently maintained implementations of the same security-critical logic silently drifting apart.

### 2. Binding strategy: Rust → native bindings → React Native, UniFFI preferred

Rust Wallet Core is exposed to iOS and Android through a thin native-binding layer. **UniFFI is the currently preferred binding mechanism** (it generates Swift and Kotlin bindings from a single Rust interface definition, avoiding hand-written duplicate bridge code per platform).

This ADR decides the **architectural trust boundary** — Rust owns security-critical logic, the binding layer is a thin pass-through, JS never touches secret material — not the exact binding toolchain. The specific binding mechanism (UniFFI, or an alternative achieving the same properties) **may be adjusted during implementation** if UniFFI proves unworkable for a specific integration constraint, without requiring a new ADR, provided the trust boundary defined in this document is preserved unchanged. Any change that would *weaken* the trust boundary itself (e.g., moving signing logic into the binding layer or into JS) does require a new ADR.

### 3. Responsibility boundary

**Rust Wallet Core** owns all security-critical, deterministic wallet logic:

- Entropy handling interface (consuming OS-CSPRNG-sourced entropy; see ADR-002's non-goal note below — entropy *source* selection is a Stage 4B/4C-adjacent detail, not re-litigated here beyond "OS CSPRNG only, on-device").
- Mnemonic/seed lifecycle (BIP-39 generation, seed derivation).
- HD derivation (BIP-32 and chain-specific derivation, e.g. BIP-44/BIP-84).
- Address derivation for supported chains.
- Transaction construction and/or exact transaction validation.
- Signing.
- Signature/key handling.
- Bitcoin PSBT processing, when Bitcoin implementation arrives.
- Ethereum transaction/calldata construction and validation, when Ethereum implementation arrives.
- Secret cleanup/zeroization, where technically achievable by the runtime.

**Swift/Kotlin** own only platform-specific security *integration*, not independent wallet logic:

- Keychain / Keystore integration (persisting the encrypted wallet secret; the plaintext seed and private keys never live here).
- Secure Enclave / StrongBox capability integration where applicable on the device.
- Biometric/passcode authentication integration (invoking the OS prompt; the result gates access to Rust operations, it does not perform cryptography itself).
- Native bridge lifecycle (loading the Rust library, exposing UniFFI-generated bindings to the RN bridge).

Swift/Kotlin must remain a thin, platform-API-access layer. They must not independently implement mnemonic generation, HD derivation, transaction construction, or signing — that would recreate the dual-native-implementation risk this ADR explicitly rejects (see Alternatives Considered).

**React Native / TypeScript** owns:

- Presentation.
- Navigation.
- User interaction (intent capture: amount, destination, asset, network selection).
- Orchestration of non-secret application state.
- Rendering decoded transaction-confirmation data returned from the trusted Wallet Core boundary.

React Native/TypeScript must not own seed/private-key generation, HD derivation, or transaction signing, and must never hold raw seed or private-key material, even transiently.

**Backend/provider** (future NestJS backend, RPC/indexer providers) owns:

- Non-secret chain data retrieval.
- Fee/gas estimates.
- UTXO/account-state discovery.
- Transaction broadcasting (of already-signed transactions).
- Market data.
- Optional indexing/history infrastructure.

All backend/provider data that will enter a signing operation — UTXOs, nonces, fee/gas estimates, balances, and (in a future swap integration) quote/calldata candidates — is **untrusted input** and must be validated at the device/Wallet Core trust boundary before any signing occurs. The backend is a data source and broadcast relay; it is never a decision-maker in what gets signed.

### 4. Trust-boundary invariants

The following are binding architectural invariants, not implementation suggestions:

1. Raw seed/private keys **never cross into React Native/JS**, under any circumstance, including for display purposes — even the one legitimate case where a human must see the mnemonic (onboarding backup) is scoped as narrowly as possible and does not imply general JS-layer access to key material.
2. Raw seed/private keys **never go to the backend**, in any form, encrypted or otherwise, as part of this architecture (an explicitly separate, not-yet-approved future decision — encrypted cloud backup — would require its own ADR and is out of scope here).
3. **No signing occurs off-device.** The backend and any third-party provider may supply public inputs to a transaction; they never receive key material and never produce a signature on the user's behalf.
4. **React Native cannot request arbitrary opaque bytes/calldata and have them blindly signed.** Any signing request crossing from RN into Wallet Core must be accompanied by (or itself constitute) a structured, decodable transaction description that Wallet Core can validate — not an opaque blob RN asserts is safe.
5. **Transaction confirmation must correspond to the exact payload that will be signed.** The confirmation UI is rendered from the same transaction object Wallet Core will sign, not from a separately constructed description that could drift from it.
6. **The payload must not mutate after user confirmation without requiring a new confirmation.** Any change to destination, amount, asset, network, or calldata after the user has confirmed forces a fresh confirmation cycle; nothing is silently re-signed against updated data.
7. **Backend compromise must not be sufficient, by itself, to cause Wallet Core to sign a structurally different transaction than the user approved.** A compromised backend can supply wrong or malicious public data (fees, UTXOs, nonces, balances, history, future swap calldata), but Wallet Core's structural validation (change-address ownership, calldata-matches-confirmation, chain-ID correctness, balanced input/output arithmetic) must be sufficient to prevent that bad data from silently altering what gets signed relative to what the user confirmed.

---

## Threat / Trust Assumptions

This architecture protects against a defined set of threats and does **not** claim protection beyond them.

**What this architecture is designed to prevent or substantially reduce:**

- Seed/private-key exfiltration via the JS layer, the backend, or the network, under normal (non-compromised-OS) operation.
- Off-device or backend-initiated signing.
- Silent substitution of transaction destination/amount/asset/network/calldata between user confirmation and signing.
- A single malicious or compromised backend/RPC/indexer response causing Wallet Core to sign something structurally different from what the user approved, via the structural validation described in invariant 7.
- Duplicated, independently-drifting security-critical logic across platforms (by using one shared Rust implementation instead of two independent native ones).

**What this architecture does NOT claim to protect against:**

- **A fully compromised or rooted/jailbroken device.** If the OS itself is compromised, the guarantees of hardware-backed secure storage, OS-level app sandboxing, and even Rust's memory-safety properties at runtime can be undermined by an attacker with sufficient device-level privilege. This architecture treats root/jailbreak detection as a bypassable risk signal to surface to the user, not a security boundary, consistent with `PRODUCT_ARCHITECTURE.md` §18.
- **A compromised operating system or its cryptographic primitives** (e.g., a subverted Secure Enclave, Keystore, or OS CSPRNG). This architecture depends on those platform guarantees being intact; it cannot independently verify them.
- **Physical memory-dump attacks against an actively unlocked, currently-signing device.** Zeroization reduces the exposure window and the number of recoverable copies; it does not make a live memory dump of an unlocked process safe.
- **Proof of factual blockchain state from a single, compromised data source.** As established in prior research, Wallet Core can enforce structural/arithmetic invariants on backend-supplied data regardless of source, but it cannot independently prove a claimed balance, UTXO existence, or transaction history is accurate if the only data source is itself compromised. Provider-redundancy strategy to mitigate this is explicitly out of scope for this ADR and is deferred to the RPC/provider-architecture decision.
- **Social engineering, phishing, or a user being coerced into approving a transaction they understand and technically consented to.** No technical architecture can fully prevent an authenticated user knowingly approving a bad transaction.

---

## Expo Consequence

React Native / Expo remains the application framework for `apps/mobile`. This ADR does **not** require ejecting to the bare React Native workflow.

However, **Expo Go will cease to be a sufficient runtime once native wallet/security modules are introduced** — this includes the Rust Wallet Core binding layer decided here, and would equally have been true for secure storage and biometric integration under any of the runtime alternatives considered. Expo Go can only load JavaScript and its fixed set of built-in native modules; it cannot load custom native code.

The expected path is an **EAS-compatible custom development build** (via `expo prebuild` / config plugins), which supports custom native modules — including a Rust-backed binding layer via UniFFI-generated Swift/Kotlin bindings — without requiring a full legacy "bare" ejection. `ios/`/`android/` native project directories become necessary once prebuild generates them; whether they are checked into version control or generated at build time is an implementation detail for the stage that actually introduces native modules, not decided here.

This transition is anticipated to occur no later than the stage that introduces secure wallet creation and storage, and may occur as early as the stage that first requires native test-vector validation of the Rust core. Neither is triggered by this ADR itself, which authorizes no implementation.

---

## Alternatives Considered

### Pure JS/TypeScript wallet core

Would use audited libraries such as `@scure/bip39`, `@scure/bip32`, `@noble/curves`/`@noble/hashes`, `bitcoinjs-lib`, and `viem`/`ethers`. Lowest integration complexity, remains usable in Expo Go for pure computation, and offers the simplest testing/debugging story of the three options.

**Rejected as the primary Wallet Core runtime** because JS's managed runtime (Hermes) offers no reliable memory-safety or zeroization guarantee for secret material — strings are immutable/interned, and typed-array buffers may be copied by the engine during cryptographic operations or bridge interop with no guarantee all copies are cleared. This is an industry-wide, acknowledged limitation of JS-based wallets, not a defect specific to any library. Given this project's root `CLAUDE.md` explicitly elevates crypto/signing code to require especially careful review, and `PRODUCT_ARCHITECTURE.md` §9 names "avoiding GC-managed memory for secrets" as an explicit evaluation criterion for this exact decision, this gap was judged decisive against JS/TS as the primary runtime.

### Independent Swift + Kotlin wallet implementations

Would use platform-native crypto integration (wrapping `libsecp256k1` independently on each platform) with genuinely strong zeroization control in native code, and the cleanest direct OS-CSPRNG access of the three options.

**Rejected** because it requires implementing and independently maintaining the entire security-critical logic — mnemonic/seed handling, HD derivation, transaction construction, signing — twice, in two different languages, forever. This is the best-documented real-world source of divergence bugs in dual-native wallets: a fix or vulnerability discovered on one platform must be independently ported and re-verified on the other, with no structural guarantee they stay behaviorally identical. This directly conflicts with the project's stated change-discipline principle of preferring the smallest correct, single reviewable implementation over duplicated logic, and it also carries the weakest native library ecosystem for Bitcoin PSBT and Ethereum transaction handling of the three options.

### Shared Rust core (selected)

Provides compiler-enforced secret-memory handling, a single implementation shared across both platforms (avoiding the JS zeroization gap and the dual-native duplication risk simultaneously), and the most audited underlying cryptographic libraries evaluated (`secp256k1` crate bound to the same C library Bitcoin Core uses; `rust-bitcoin`'s mature PSBT support).

**Accepted despite real, acknowledged costs**: a new language and toolchain for the team relative to the current all-TypeScript codebase; the highest one-time build/tooling setup of the three options (Rust cross-compilation for iOS/Android, UniFFI codegen, EAS Build integration); harder cross-boundary debugging (Rust ⟷ generated bindings ⟷ RN JS) than a pure-JS approach; and loss of Expo Go once the binding layer is introduced (a cost that, per the Expo Consequence section above, would have been incurred under any of the three options once secure storage was added — Rust adds incremental, not categorical, native-module surface on top of that already-unavoidable transition).

This tradeoff is accepted because the code in question is the highest-consequence code in the entire product — a bug here can directly result in loss of user funds — and this is not judged to be a case where implementation speed or team-familiarity should be weighed against secret-handling safety.

---

## Consequences

**Benefits:**

- Compiler-enforced secret-memory handling and zeroization guarantees, not available in a managed-runtime (JS) approach.
- One reviewed, tested implementation of security-critical logic shared across iOS and Android, rather than two independently drifting ones.
- Access to the most audited secp256k1 and Bitcoin-transaction/PSBT libraries evaluated across all three options.
- A clean, narrow trust boundary (unsigned transaction in, signed transaction out) that keeps React Native and the future backend structurally incapable of directly manipulating key material, by construction rather than by convention alone.
- Forward compatibility with the multi-chain (Bitcoin UTXO + Ethereum account-based) scope already under consideration, without committing to a second cryptographic curve family.

**Costs:**

- A new language/toolchain (Rust) introduced to a currently all-TypeScript project — genuine ramp-up and long-term maintenance cost for the team.
- Higher one-time build and CI setup cost: Rust toolchain provisioning, iOS/Android cross-compilation targets, UniFFI (or equivalent) codegen integration, and EAS Build configuration for native modules.
- Expo Go is no longer sufficient once the binding layer is introduced; development shifts to EAS development builds, which require a rebuild (not just reload) whenever native code changes.
- Cross-boundary debugging (Rust ⟷ generated bindings ⟷ RN JS) is inherently harder to reason about than debugging a single-language JS implementation.

**Testing implications:**

- Rust's own test framework can run BIP-39/32 and (later) chain-specific test vectors once, with results applying identically to both platforms, avoiding the cross-platform parity risk a dual-native approach would carry.
- Deterministic test-vector coverage for derivation and signing is expected to be exhaustive and non-skippable before any implementation stage depending on this ADR is considered complete, consistent with `PRODUCT_ARCHITECTURE.md` §22's Stage 4 exit criteria.
- Binding-layer (UniFFI-generated Swift/Kotlin) integration will need its own thin-layer tests distinct from the Rust core's own test suite, to confirm the bridge itself introduces no behavioral drift.

**Build/CI implications:**

- CI must provision a Rust toolchain and cross-compilation targets for iOS and Android in addition to the existing Node/pnpm toolchain.
- Native builds (EAS Build or local Xcode/Android Studio builds) become a required part of any workflow that touches Wallet Core, even during development — this is a new CI/local-dev dependency not present in the current pure-JS/Expo-Go workflow.

**Team-maintenance implications:**

- Ongoing maintenance of the Wallet Core requires Rust proficiency on the team (or deliberate investment in acquiring it) in addition to the existing TypeScript/React Native skill set.
- The binding layer (UniFFI or its eventual replacement) becomes a piece of infrastructure the team owns and must keep current with Rust, Swift, and Kotlin toolchain changes over time.

**Security-review implications:**

- Per `PRODUCT_ARCHITECTURE.md` §22's Stage 4 exit criteria, security-reviewer sign-off is required on both the runtime/language choice (this ADR) and the specific dependency choices made when Wallet Core is actually implemented (a separate, later review event, not satisfied by this ADR alone).
- Because the entire security-critical surface now lives in one shared implementation rather than two, security review effort is concentrated rather than duplicated — a review benefit, but one that also means a defect in this single implementation has no independent-implementation fallback catching it, making thorough review of the Rust core disproportionately important relative to the thin platform-integration layers.

---

## Non-Goals of This ADR

For clarity, the following are explicitly **not** decided here and remain open for future ADRs or implementation-stage decisions:

- Exact derivation paths and account model (ADR-003).
- V1 network/asset scope confirmation (ADR-001).
- Specific Rust crate selections (e.g. exact `secp256k1`, `rust-bitcoin`, `zeroize` versions) — a dependency-review event distinct from this runtime decision.
- Secure-storage library/architecture specifics (ADR-005, per `PRODUCT_ARCHITECTURE.md` §27).
- Recovery-phrase reveal policy and passphrase support (ADR-004).
- RPC/provider architecture, provider redundancy, and malicious-provider detection strategy (a separate provider-architecture ADR).
- Whether `ios/`/`android/` prebuild output is checked into version control.
