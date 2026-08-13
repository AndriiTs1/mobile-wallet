# ADR-003: Account, Derivation & Address Model

**Status:** Accepted

**Scope:** This ADR decides the derivation and address structure for V1 — the mathematical/structural relationship between one recovery root and the chain-specific keys/addresses derived from it. It does not decide recovery UX/policy (ADR-004), secure-storage architecture (ADR-005), RPC/indexer/data-source strategy (ADR-006), or Bitcoin transaction-construction details such as PSBT/coin-selection/fee strategy (a future Bitcoin transaction ADR). It builds directly on ADR-002 (Wallet Core runtime and trust boundary) and the V1 network scope provisionally selected in Stage 4A (Bitcoin mainnet, Ethereum mainnet with ERC-20 USDC/USDT, generic EVM-capable internal architecture with only Ethereum exposed).

---

## Context

ADR-002 established that Wallet Core is a single shared Rust implementation owning all security-critical deterministic logic — including HD derivation and address derivation — with seed/private keys never crossing into React Native or the backend. That decision assumed, but did not formally specify, *what* gets derived. This ADR fills that gap: the exact derivation structure Wallet Core implements for the V1 asset set (BTC, ETH, USDC, USDT).

Today, no wallet-core exists (`packages/` is empty, verified in prior stages), so this ADR is establishing structure before any implementation, consistent with the project's execution workflow of stating architectural scope before editing.

---

## Decision

### 1. Root recovery / HD model

V1 uses **one wallet recovery root for all supported chains**:

- A single **BIP-39 mnemonic** is generated on-device and deterministically expanded into a single **512-bit seed**.
- That one seed is the root of a single **BIP-32 hierarchical deterministic (HD) tree**.
- Each supported chain derives its keys from a **chain-specific standard branch** of that same tree (detailed in §2 and §4 below) — not from an independent, unrelated seed per chain.

This means a single mnemonic backup recovers every chain the wallet supports. This is the lowest-risk, most standard model available and matches the direction already sketched in `PRODUCT_ARCHITECTURE.md` §9 and §25.

**Explicit boundary with other ADRs**: this ADR decides *derivation and address structure only*. It does not decide:
- Whether the mnemonic is shown once or later revealable, or any other onboarding/backup UX — that is **ADR-004 (recovery model)**.
- Whether an optional BIP-39 passphrase is offered — this **remains deferred**, consistent with prior research; it is not required for the derivation structure decided here and introduces recovery-UX and lock-in tradeoffs that belong in ADR-004, not in this document.

Derivation architecture and recovery UX are deliberately kept as separate decisions so that a future change to recovery policy (e.g. adding passphrase support) does not require re-deciding the underlying derivation structure.

### 2. Ethereum account model

**Primary V1 Ethereum derivation path**: `m/44'/60'/0'/0/0`

| Level | Value | Meaning |
|---|---|---|
| purpose | `44'` | BIP-44 |
| coin_type | `60'` | Ethereum (SLIP-44 registered) |
| account | `0'` | First (and, for V1, only) account |
| change | `0` | External chain (Ethereum does not use a change-address concept the way Bitcoin does; `0` is the standard convention) |
| address_index | `0` | First (and, for V1, only) address |

**V1 UI exposes exactly one Ethereum account/address** — the address derived at the path above, and nothing else. There is no account switcher, no multi-address Ethereum UI in V1.

**Wallet Core's derivation API is parameterized internally for account and address_index**, even though V1 UI only ever calls it with `account = 0, address_index = 0`. This means the derivation function signature accepts account/index as inputs from day one, rather than hardcoding `0'/0/0` as a constant baked into the derivation logic itself. This costs nothing extra to build correctly now and avoids a structural rewrite later.

**Future account expansion — parameterization vs. policy**: BIP-44 defines two distinct levels relevant here, and they must not be conflated with each other or with a product-level feature:

- The **account'** level — a hardened index conventionally used to represent a distinct, separately-discoverable account.
- The **address_index** level — a non-hardened index for sequential addresses within one account's chain. Ethereum conventionally only ever uses `address_index = 0` per account, since Ethereum has no Bitcoin-style address-rotation concept.
- The **product-level concept of "multiple accounts"** (a user-facing feature, e.g. an account switcher) is a separate decision from either of the above — it is a UI/UX and discovery feature that would *use* one or both derivation levels, not something either level automatically implies.

Wallet Core's derivation API **may be implemented so that both `account'` and `address_index` are technically callable as parameters**, rather than the V1 path being an unparameterized hardcoded constant — this is an implementation-readiness choice only. **This ADR does not standardize a future multi-account derivation or discovery policy beyond the single V1 path.** It does not decide how many accounts a future feature would expose, how Ethereum account discovery would work (unlike Bitcoin, there is no on-chain gap-limit convention governing when to stop scanning additional Ethereum account indices), or how a product-level "multiple accounts" feature maps onto the `account'` vs. `address_index` levels.

**Arbitrary account/index expansion is not guaranteed to automatically preserve interoperability with every third-party Ethereum wallet.** Many mainstream wallets only discover or expose a single default account per seed unless the user explicitly drives their own account-derivation UI; a future Mobile Wallet multi-account feature's compatibility with any given third-party wallet depends on that wallet's own support for the same account-discovery convention, not on anything decided in this ADR.

**Before any multi-account Ethereum UI ships, a dedicated compatibility decision must define exactly how additional accounts/addresses are derived and discovered.** That decision is explicitly out of scope here.

**V1 remains exactly one Ethereum account/address: `m/44'/60'/0'/0/0`, and nothing else.**

**EVM chain-sharing clarification**: the address derived at `m/44'/60'/0'/0/0` is technically the *same address* usable across any EVM-compatible chain (Polygon, Arbitrum, Base, etc.), because EVM address derivation from a public key does not depend on chain ID. **V1 product exposes only Ethereum mainnet** — this technical fact does not imply any other chain is enabled, supported, or safe to send funds on within the V1 product surface. **Chain ID (EIP-155) is transaction/broadcast domain separation, not a private-key derivation requirement** — it is included in the signed transaction payload to prevent replay across chains, but it does not change which key or path is used to derive the address or sign. Enabling a new EVM network in the product remains a separate, explicit decision (§9 below), even though no new key derivation would be needed to support it technically.

### 3. ERC-20 model

USDC and USDT on Ethereum:

- Do **not** get separate private keys or separate derivation paths.
- Use the **same Ethereum account/address** derived at `m/44'/60'/0'/0/0` as native ETH.
- Are distinguished from ETH and from each other by **contract address + token metadata** (decimals, symbol, name), not by any key-level distinction.
- Are represented internally as **raw integer base units + decimals** (e.g. USDC: 6 decimals, USDT: 6 decimals, ETH: 18 decimals) — Wallet Core operates on integers, never on floating-point or pre-formatted display values.
- **Symbol and name are metadata only and must never be used as security identifiers.** A token calling itself "USDC" at an unexpected contract address is not USDC — display-layer strings are not proof of identity.
- **Decimals are security-relevant display/amount metadata, not cosmetic formatting.** An incorrect decimals value changes what amount a user believes they are confirming relative to the raw integer amount Wallet Core actually signs — a decimals error is functionally an amount error, not a display bug.

**Security-relevant identity fields, recorded explicitly**: for any ERC-20 token, **contract address + chain ID** together constitute its actual identity for signing/validation purposes. This is directly relevant to the transaction-confirmation invariant already established in ADR-002 (confirmation UI must be decoded from the exact payload being signed) — a token transfer's real destination and asset identity must be validated against contract address + chain ID, never against a claimed symbol or name.

**Trusted decimals source, not dynamic metadata**: Wallet Core / the trusted application configuration must use **curated, validated decimals for each V1-supported token** (native ETH: 18; USDC: 6; USDT: 6), sourced from a small curated supported-asset registry maintained as trusted configuration — not fetched dynamically from arbitrary on-chain token metadata or from an untrusted backend response at confirmation time. **Backend/RPC/provider-supplied symbol, name, or decimals must never silently redefine the token identity or amount the user is confirming.** If provider-supplied metadata for a given `chainId + contractAddress` ever disagrees with the curated registry entry, the curated, trusted value governs what is shown and what is signed. **Transaction confirmation must convert the raw integer token amount to a human-readable figure using the trusted decimals value associated with the exact `chainId + contractAddress`** being signed — never a decimals value inferred from a different source or a mismatched token entry. This ADR intentionally does not define a generic token-registry architecture; it only establishes that V1's three token entries (native ETH, USDC, USDT) are sourced from curated, trusted configuration rather than dynamic/untrusted metadata, consistent with the small, fixed V1 asset set already decided in Stage 4A and `PRODUCT_ARCHITECTURE.md` §10.

### 4. Bitcoin account model

V1 adopts **BIP-84 native SegWit** as the Bitcoin derivation direction.

**Full derivation structure**:

- External/receive branch: `m/84'/0'/0'/0/i`
- Internal/change branch: `m/84'/0'/0'/1/i`

| Level | Value | Meaning |
|---|---|---|
| purpose | `84'` | BIP-84 (native SegWit) |
| coin_type | `0'` | Bitcoin mainnet (SLIP-44 registered) |
| account | `0'` | First (and, for V1, only) account |
| change | `0` or `1` | `0` = external/receive, `1` = internal/change |
| address_index | `i` | Sequential index within each branch, starting at 0 |

Decisions:

- **Account = `0'` for V1 UI.** No multi-account Bitcoin UI in V1 (same posture as Ethereum, §2).
- **Address indexes rotate, but only upon detected use — not on every receive request.** Receive addresses are **not permanently fixed to index 0** over the wallet's lifetime, but a given current receive address is also not discarded merely because the Receive screen was opened or refreshed (full rotation policy in §5).
- **Change addresses must come exclusively from the internal branch** (`.../1/i`). A change output must never reuse the external/receive branch, and must never reuse the specific address that was just spent from.
- **Change-output ownership must be cryptographically/structurally verified against Wallet Core's own derived internal branch** before a transaction is signed. Wallet Core must not accept an externally-supplied "this is your change address" claim from the backend or any provider — it must verify the change output corresponds to an address it can itself derive from the seed at a known internal-branch index.

**Bitcoin is explicitly not reduced to a single-address model.** The wallet's Bitcoin balance is the union of UTXOs across every discovered used address on both branches, not one static address (full discovery model in §6).

### 5. Bitcoin address rotation policy (conceptual)

The governing invariant: **rotation is driven by detected use, not by UI activity.**

- Wallet Core maintains a **current receive index/address** on the external branch — a single, stable "the address to show right now" value, not a value that changes on every render.
- **Merely opening or refreshing the Receive screen MUST NOT advance the external address index.** Viewing the receive screen is a read of existing state, never a mutation of it.
- **The current receive address may continue to be displayed until it is detected as used** (i.e. an incoming transaction referencing it is observed). Showing the same address across multiple visits/sessions, until it actually receives funds, is correct behavior, not a bug or an omitted optimization.
- **After use is detected, Wallet Core may advance to the next external address** — this is the actual rotation event, triggered by observed on-chain activity, not by app/UI activity.
- **The product may later expose an explicit "Generate new address" action** (e.g. for a user who wants a fresh address before the current one has been used, for privacy reasons). If offered, that action must **deliberately** advance and persist the index — it is a distinct, intentional user-triggered event, never an implicit side effect of navigation.
- **Unused addresses must not be created speculatively in a way that can create large gaps.** Wallet Core must not, for example, silently pre-derive and advance through many external indexes without either detected use or an explicit user action — doing so would widen the distance between the last *actually used* address and the *next* one, which weakens restore discoverability (see the gap-limit relationship below).
- **Previously generated addresses always remain valid** and must remain part of wallet discovery/history regardless of whether they are still the "current" displayed address — a user can legitimately receive to an older, previously-issued address (e.g. a QR code shared earlier and used later), and this must be detected correctly, not treated as an error.
- **Change-address lifecycle is independent of external receive-address lifecycle.** The two branches are tracked and rotated separately; change-index advancement (driven by transaction construction, not by user action) has no effect on the receive-address index, and vice versa.

**Relationship to the gap-limit restore model (§6)**: the gap-limit convention assumes that consecutive *unused* derived addresses are rare and bounded — restore scanning stops after a run of 20 unused addresses precisely because, under normal wallet behavior, addresses are issued roughly in step with actual use. If Wallet Core instead advanced the current index speculatively (e.g. on every screen open) independent of use, it could derive far more addresses than were ever actually funded. Should a user then eventually receive funds at a much later index than the last *funded* one, the effective gap between the last used address and that later used address could exceed the standard 20-address scan window — causing a standards-compliant restore (in this wallet or any third-party wallet) to miss those funds entirely. Advancing the index only on detected use (or on an explicit, deliberate user action) keeps the actual sequence of *used* indexes tight and contiguous, which is exactly what keeps the conventional gap-limit assumption valid for this wallet.

This section is conceptual policy only — no storage/state persistence mechanism is designed or decided here.

### 6. Wallet restore / discovery

**Bitcoin restore/discovery requirements**:

- A bare mnemonic carries no record of which indexes were previously used on either branch. Restoring requires **address discovery**: deriving addresses sequentially per branch and checking each (against an indexed data source — mechanism deferred to ADR-006) for transaction history.
- **External branch and internal/change branch are scanned independently**, each with its own discovery process, since usage on one branch does not imply anything about usage on the other.
- **Gap limit**: discovery continues deriving and checking sequential addresses within a branch as long as used addresses keep being found inside the current scan window. When a run of consecutive unused addresses is encountered, discovery for that branch stops at that point.
- **A conventional gap limit of 20 is adopted as the initial compatibility direction** — this matches the de facto convention used by Electrum and most BIP-84-compatible wallets, maximizing the odds that restoring into a third-party wallet (or restoring this wallet after using a different implementation) correctly recovers the same funds.
- **This is explicitly a wallet-discovery convention, not a cryptographic requirement.** Nothing about BIP-32/84 mandates the number 20; it is a practical, widely-adopted interoperability convention this ADR adopts for compatibility reasons, and it **may later be made configurable** (e.g., a deeper rescan option) without being a derivation-structure change.
- **Restoration must recover both prior receive and change address usage, and the UTXOs associated with each.** Discovery is not complete until both branches have been scanned to their respective gap boundaries and the current UTXO set for every discovered used address has been retrieved.

**Ethereum restore**:

- V1 restore is **deterministic single-account/address derivation**: given the seed, the address at `m/44'/60'/0'/0/0` is derived directly — no discovery/scanning process is needed, since V1 exposes exactly one Ethereum address with no ambiguity about which index is "in use."
- **Future additional-account discovery rules must be explicitly defined before any multi-account Ethereum UI ships.** Unlike Bitcoin's per-address balance/UTXO model, Ethereum account discovery (i.e., "does account index 1 have any activity") is a distinct future problem this ADR does not solve, because V1 does not need it.

### 7. Account expansion policy

- Wallet Core's derivation APIs are **parameterized internally** for account, change-branch (where applicable), and address_index, from the outset (§2, §4).
- **V1 UI exposes exactly one account per chain** — no multi-account UI is built now.
- **Wallet Core must not pre-create or pre-derive arbitrary addresses/accounts speculatively.** Parameterization means the capability to derive additional accounts/indexes exists in the API surface; it does not mean the wallet proactively generates a pool of unused accounts or indexes beyond what current operation (one Ethereum address; Bitcoin's rotation-driven external/internal indexes per §5) actually requires.
- This is a deliberate middle ground: **no speculative complexity beyond parameterized derivation support** — the API shape is future-proofed, but no multi-account feature, storage design, or UI is introduced in this ADR.

### 8. Address types / formats

**Bitcoin**:
- Native SegWit, Bech32-encoded (`bc1q…` prefix for mainnet P2WPKH addresses derived under BIP-84).
- Mainnet prefix semantics apply throughout — V1 operates on Bitcoin mainnet only, consistent with the Stage 4A network scope; testnet/signet address formats are a distinct, undecided concern (relevant to future testing infrastructure, not to this ADR).
- **Taproot (BIP-86, `bc1p…`) remains deferred** — no V1 requirement adopts it; this ADR's Bitcoin address format decision is native SegWit only.

**Ethereum**:
- A 20-byte address derived from the public key (standard Ethereum address derivation: Keccak-256 hash of the uncompressed public key, last 20 bytes).
- **EIP-55 mixed-case checksum encoding** is the required format for human-readable display and for validating any user-entered or scanned address — a transcription-error safety net applied at the display/validation layer.

**Display format vs. raw canonical representation** — for both chains, Wallet Core's internal/canonical representation (raw bytes, or the chain's own native encoding) is distinct from the human-facing display string:
- Bitcoin: canonical form is the Bech32-encoded string itself (Bech32 is both the canonical and display form for native SegWit — there is no separate "raw" address format users would need translated).
- Ethereum: canonical form is the raw 20-byte address; the EIP-55 checksummed hex string is a *display/validation* encoding of that same canonical value, not a different address.

No UI/display formatting logic is designed here — this section only establishes which representations exist and their relationship, per the token/address-identity model this ADR is responsible for.

### 9. Network / coin-type separation

Recorded exactly:

| Chain | coin_type | Purpose/branch |
|---|---|---|
| Bitcoin mainnet | `0'` | BIP-84, `m/84'/0'/...` |
| Ethereum | `60'` | BIP-44, `m/44'/60'/...` |

**Derivation branches are never reused across BTC and ETH.** Each chain's coin_type is a hard structural separator in the HD tree — there is no scenario in this architecture where a Bitcoin key and an Ethereum key are derived from overlapping path segments.

**For future EVM chains** (explicitly deferred from V1 product exposure, per Stage 4A):
- A future additional EVM chain (e.g. an L2) **may reuse the same Ethereum/EVM key-derivation branch** (`m/44'/60'/0'/0/0`) — this is the direct consequence of §2's chain-ID-is-broadcast-domain-not-derivation-input clarification.
- **No new key derivation is technically required to support a new EVM chain.**
- However, **enabling a new chain in the product remains a separate, explicit decision** requiring its own product, provider, and security review (RPC/indexer availability, fee-market behavior, UI/UX for network selection, explicit security sign-off) — technical key-reuse capability is not, by itself, authorization to expose a new network. This ADR grants no such authorization; it only records that the derivation layer would not block it.

### 10. Security invariants

The following are binding invariants of the derivation/address model, consistent with and extending ADR-002's trust boundary:

1. **Derivation paths are constants/configuration under Wallet Core's own control** — not arbitrary strings supplied by React Native or the backend. The specific paths recorded in this ADR (§2, §4) are the only paths Wallet Core will use for V1.
2. **React Native cannot request arbitrary derivation paths.** Any Wallet Core API surface exposed to RN accepts, at most, an account/index parameter within the parameterization described in §2/§4/§7 — never a raw path string RN constructs itself.
3. **The backend cannot influence derivation paths.** Backend/provider data is untrusted input for signing (per ADR-002) and has no role in determining which key is used to sign — that is determined exclusively by Wallet Core's own path constants and the account/index requested by legitimate application flow.
4. **Chain identity must be explicit** at every point where it matters for signing or validation (chain ID for Ethereum; mainnet-specific address encoding for Bitcoin) — never inferred or assumed.
5. **Token identity must use chain ID + contract address**, never symbol/name; decimals used in confirmation/signing must come from curated, trusted configuration for the exact chain ID + contract address, never untrusted provider metadata (§3).
6. **Bitcoin change outputs must be verified as belonging to the expected internal derivation branch** before signing (§4) — this is a direct, concrete instance of ADR-002's invariant that backend compromise must not be sufficient to cause Wallet Core to sign something structurally different from what the user approved.
7. **Account/index state must not silently reset in a way that causes address reuse or loss of discoverability.** Whatever mechanism eventually tracks "next unused index" (a persistence/state design out of scope for this ADR) must not regress to a previously-issued index in a way that would cause the same address to be reissued as if new, nor lose track of previously-derived-and-used indexes such that they become undiscoverable.
8. **Restore must derive the same addresses from the same seed + path policy.** Given an identical mnemonic and the path structure recorded in this ADR, derivation must be fully deterministic and reproducible — no non-deterministic input may influence which addresses are derived for a given seed/account/index/branch combination.

### 11. Interoperability / portability

Standard paths are selected specifically so that a user could restore their mnemonic into any other wallet implementing the same standards, avoiding proprietary lock-in:

- **Ethereum** `m/44'/60'/0'/0/0` is the path used by MetaMask, Trust Wallet, Ledger, and effectively every mainstream Ethereum wallet — restoring the same mnemonic elsewhere yields the same address.
- **Bitcoin** `m/84'/0'/0'/0/i` (receive) and `m/84'/0'/0'/1/i` (change) under BIP-84 account 0 is the standard native SegWit convention used by Electrum and most modern Bitcoin wallets.

**This does not promise universal automatic discovery.** Compatibility depends on the third-party wallet supporting the **same standard, the same script type (native SegWit specifically, not legacy or nested SegWit), and a compatible gap-limit convention**. A wallet that only supports legacy BIP-44 Bitcoin addresses, for example, would not automatically discover funds held at BIP-84 addresses without the user explicitly selecting the correct derivation/script type during import, where such an option exists. This ADR selects the standards that maximize practical compatibility with mainstream wallets today; it does not and cannot guarantee every possible third-party wallet supports them.

---

## Alternatives Considered

- **One private key per asset** — rejected. Would require a separate backup/recovery secret per asset, multiplying the recovery burden on the user by the number of assets and directly conflicting with the "one recovery root" goal (§1). ERC-20 tokens sharing the Ethereum account address (§3) is the correct model precisely to avoid this.
- **Unrelated seed per chain** — rejected. Would require the user to separately back up and manage one mnemonic per chain, eliminating the single-backup-recovers-everything property that is the primary usability and safety benefit of the HD model. No security benefit over a single BIP-32 tree with chain-specific branches, since coin_type separation (§9) already provides structural isolation between chains.
- **Bitcoin legacy BIP-44 (P2PKH, `1...` addresses)** — deferred/rejected for V1. Higher on-chain fees (larger transaction size) than native SegWit, and losing ground as the default in the current wallet ecosystem. No compatibility advantage over BIP-84 significant enough to justify it as the V1 default.
- **BIP-49 nested SegWit (P2SH-wrapped, `3...` addresses)** — deferred/rejected for V1. Was a reasonable transitional format before native SegWit had broad wallet/exchange support; that transitional need no longer applies as strongly today, and native SegWit (BIP-84) is now the more standard default across modern wallets.
- **BIP-86 Taproot for V1** — deferred, not rejected outright. Introduces Schnorr signatures (BIP-340) as a new cryptographic primitive on top of an already-substantial V1 crypto surface (per prior Stage 4B research), for compatibility/fee benefits that, while real and growing, are not yet as universal as native SegWit's. Revisit in a future ADR once ecosystem support/priorities are reassessed.
- **Multi-account UI in V1** — deferred, not rejected. The derivation API may be implemented so both `account'` and `address_index` are callable parameters, leaving room for this later without disturbing the V1 address (§2, §7) — but the actual multi-account derivation/discovery policy is a separate, not-yet-made decision (§2), and building the UI/UX and any needed state-management now would be speculative complexity ahead of an actual product requirement.
- **Proprietary/custom derivation paths** — rejected outright. Would directly undermine the interoperability goal (§11) and provide no offsetting security benefit; standard paths are exactly as secure (derivation path structure is not a secret and provides no security-through-obscurity value) while custom paths only add lock-in risk.

---

## Consequences

**Benefits**:
- One recovery root (a single BIP-39 mnemonic) recovers every V1 chain — lowest user-facing recovery burden consistent with security.
- Standard, widely-supported derivation paths maximize interoperability with third-party wallets (§11), avoiding proprietary lock-in.
- Parameterized (not hardcoded) derivation function signatures leave room for future multi-account support without requiring re-derivation or migration of the existing V1 address — though the actual multi-account derivation/discovery policy remains a dedicated future decision, not standardized by this ADR (§2).
- The Bitcoin external/internal branch model, correctly specified with change-output ownership verification (§4, §10.6), avoids the security and privacy pitfalls of a naive single-address Bitcoin model.
- No per-token key proliferation — ERC-20 tokens add zero derivation complexity beyond the one Ethereum account (§3).

**Costs**:
- Bitcoin address discovery and rotation state (next-unused-index tracking per branch, historically-used-address tracking) is materially more complex than Ethereum's single deterministic address — this asymmetry is inherent to the UTXO model, not an implementation shortcoming, and was already identified in Stage 4A/4B research.
- Account/index state (which indexes have been issued/used) must eventually be persisted safely and correctly — the specific persistence mechanism is not decided in this ADR and is a real, nontrivial future design point.
- Bitcoin restore requires indexed chain queries (gap-limit scanning against an indexer) — restore is not a purely local/offline operation for Bitcoin the way it is for Ethereum in V1.
- The testing matrix expands relative to a single-chain wallet: deterministic test vectors are needed for both branches on Bitcoin, for the Ethereum path, and for the discovery/gap-limit logic's edge cases (e.g. addresses used just inside vs. just outside the gap window).

---

## Relation to Future ADRs

This ADR decides derivation/address *structure* only. The following remain explicitly open, future decisions:

- **ADR-004** — recovery UX/policy (mnemonic reveal policy, passphrase support, backup/verification flow).
- **ADR-005** — secure-storage architecture (how the seed is encrypted at rest and unlocked).
- **ADR-006** — RPC/indexer/data-source strategy (how address/UTXO/balance discovery is actually queried, provider redundancy).
- **A future Bitcoin transaction ADR / implementation decision** — PSBT adoption, coin-selection algorithm, fee strategy. This ADR references the internal/change branch and change-output verification requirement (§4, §10.6) only insofar as it affects *which addresses* change belongs to — it does not decide how a transaction is constructed, PSBT is used, or fees are calculated.

Nothing in this ADR should be read as prematurely deciding any of the above.

---

## Implementation Contract (conceptual — no code)

Without specifying an actual Rust implementation, the minimum conceptual Wallet Core derivation API boundary this ADR implies:

- **Derive Ethereum address for (account, address_index)** — given the unlocked seed, returns the Ethereum address (and, internally, the keypair used to later sign with it) at `m/44'/60'/account'/0/address_index`. For V1, only ever called with `(0, 0)`.
- **Derive Bitcoin external (receive) address for (account, address_index)** — returns the native SegWit address at `m/84'/0'/account'/0/address_index`.
- **Derive Bitcoin internal (change) address for (account, address_index)** — returns the native SegWit address at `m/84'/0'/account'/1/address_index`, used internally by Wallet Core when constructing change outputs; not intended for direct display as a "receive" address to the user.
- **Verify Bitcoin change-output ownership** — given a candidate change output (address or script), confirm it corresponds to an address Wallet Core can itself derive from the seed at a known internal-branch index, before allowing a transaction containing it to be signed (the structural check required by §4/§10.6).

**Non-negotiable boundary condition**: none of these conceptual operations return, expose, or accept raw private key material across the Wallet Core ↔ React Native boundary. Every operation's inputs and outputs, as exposed to RN, are limited to public data (addresses, account/index parameters, unsigned/signed transaction payloads) — consistent with ADR-002's trust boundary. This is a conceptual API contract only; the actual Rust interface definition, its concrete types, and its UniFFI binding are implementation work for a later stage, not decided here.

---

## Validation Notes

This document was checked for consistency against ADR-002 and `PRODUCT_ARCHITECTURE.md` before being finalized:

- No conflict with ADR-002's trust boundary — this ADR's security invariants (§10) are additive, concrete instances of ADR-002's general invariants (e.g. §10.6 is a specific application of ADR-002's "backend compromise must not cause a structurally different signed transaction" invariant), not a restatement or contradiction.
- Consistent with `PRODUCT_ARCHITECTURE.md` §9's "one seed → multiple chain accounts" and §25's "Wallet derivation strategy: single seed with multi-chain HD derivation (recommended)" — this ADR formalizes exactly that direction, does not deviate from it.
- Consistent with `PRODUCT_ARCHITECTURE.md` §10's V1 network recommendation (Bitcoin + Ethereum mainnet) and the Stage 4A-selected asset set (BTC, ETH, USDC, USDT) — no new network or asset is introduced here.
- `PRODUCT_ARCHITECTURE.md` was read for this consistency check only; it was not modified.
