# Swiss Wallet — Product Architecture & Roadmap

**Status:** living document, authored at the end of the UI/live-market-data prototype milestone.
**Scope of this document:** architecture, product state, and roadmap only. No product code is changed by this document.

Every claim in sections 1–7 was verified directly against the repository (file reads, `grep`, `git log`, `git status`) at the time of writing, not assumed from the UI. Sections 8 onward are explicitly proposed future architecture and are labeled as such throughout.

---

## 1. Product Vision

**Intended end product:** Mobile Wallet — a Swiss-focused, premium, non-custodial mobile cryptocurrency wallet. Design language is restrained "Swiss fintech": dark UI, a single gold accent, CHF as the home-market fiat, and a small, high-quality initial asset set (BTC, ETH, USDC, USDT) rather than broad multi-chain sprawl.

Product principles already stated in `apps/mobile/README.md` and reaffirmed here:

- Non-custodial by design — the user, not the company, holds their keys.
- Private keys and recovery secrets must never reach a Mobile Wallet backend.
- Transaction signing happens locally, on-device.
- No fake functionality dressed up to look finished.

**This vision is not yet implemented.** What exists today is a fully-designed, partially-live UI prototype with no wallet, no keys, and no blockchain connectivity. The rest of this document draws a hard line between that vision and the current repository state.

---

## 2. Current Repository Architecture

### 2.1 Monorepo shape

```
mobile-wallet/
├── apps/
│   └── mobile/            # the only application that exists today
├── packages/               # empty — reserved as the future wallet-core repository
│                           # boundary (a TS package here does NOT imply secrets live
│                           # in the JS runtime — see §9 and ADR-002)
├── pnpm-workspace.yaml      # workspaces: apps/*, packages/*
└── package.json             # root: no scripts of substance, pnpm-managed
```

`packages/` is empty. There is no shared wallet-core, no shared types package, no backend package. Everything lives in `apps/mobile`.

### 2.2 `apps/mobile` — verified structure

```
apps/mobile/
├── app.json                 # Expo config — see §2.4
├── package.json              # deps — see §2.3
├── tsconfig.json              # strict TypeScript, "@/*" → "src/*"
├── src/
│   ├── app/                    # Expo Router file-based routes
│   │   ├── _layout.tsx           # root layout: ThemeProvider → MarketDataProvider → tabs
│   │   ├── index.tsx              # Home
│   │   ├── assets.tsx              # Assets
│   │   ├── activity.tsx             # Activity
│   │   └── settings.tsx              # Settings
│   ├── components/                    # presentational components (see §2.5)
│   ├── constants/
│   │   ├── theme.ts                     # Colors, Spacing, BottomTabInset, MaxContentWidth
│   │   ├── mock-portfolio.ts              # demo asset quantities + dead legacy fields
│   │   └── mock-activity.ts                # demo transaction history
│   ├── hooks/
│   │   ├── use-market-prices.ts             # Context consumer for live prices
│   │   ├── use-color-scheme(.web).ts          # RN color-scheme passthroughs
│   │   └── use-theme.ts                        # unused-by-app-screens theme hook (see §7)
│   ├── providers/
│   │   └── market-data-provider.tsx             # the one live-data polling owner
│   ├── services/
│   │   └── market-data.ts                        # CoinGecko fetch + validation
│   └── utils/
│       └── portfolio-valuation.ts                  # pure valuation/formatting math
└── assets/images/…                                    # bundled coin/tab icons, splash, logo
```

Nothing outside this list is relevant to product architecture (build caches, `.expo/`, `node_modules/`, VS Code settings are omitted).

### 2.3 Dependency inventory (verified against `package.json`)

Runtime dependencies are exclusively Expo/React Native framework packages: `expo`, `expo-router`, `expo-constants`, `expo-device`, `expo-font`, `expo-glass-effect`, `expo-image`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `expo-symbols`, `expo-system-ui`, `expo-web-browser`, `@expo/ui`, `react`, `react-dom`, `react-native`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `react-native-web`, `react-native-worklets`.

**Verified absent:** no blockchain/wallet library of any kind (no `ethers`, `viem`, `wagmi`, `bip39`, `bip32`, `@scure/*`, no HD-wallet or signing library), no `expo-secure-store`, no Keychain/Keystore wrapper, no `expo-local-authentication`, no charting/SVG library, no HTTP client library beyond native `fetch`, no state-management library, no test framework, no lint tooling wired into a working `eslint` install. A repo-wide `grep` for `web3|ethers|viem|wagmi|bip39|bip32|hdkey|SecureStore|Keychain|private[_-]?key|seed[_-]?phrase|mnemonic` returned zero matches in `src/`.

### 2.4 Expo/EAS configuration (verified against `app.json`)

- `name`/`slug`: `mobile`. `scheme`: `mobile`. `version`: `1.0.0`.
- `userInterfaceStyle: "automatic"` — **but every screen hardcodes `Colors.dark`** (see §7); light mode is configured at the platform level but not implemented at the screen level.
- `ios.icon` and `android.adaptiveIcon` are set. **No `ios.bundleIdentifier` and no `android.package` are set** — both are required before any real device/store build.
- `plugins`: `expo-router`, `expo-splash-screen` (custom splash color/image).
- `experiments`: `typedRoutes: true`, `reactCompiler: true`.
- `extra.eas.projectId` and `owner` are present (added by a recent `chore: link mobile app to EAS project` commit — this is project _linkage_ metadata only). **No `eas.json` exists** — no build profiles (development/preview/production) are configured yet.
- No `.env` files, no secrets, nothing gitignored-but-present that shouldn't be. `.gitignore` already covers `*.p8`, `*.p12`, `*.key`, `*.jks`, `*.mobileprovision`.

### 2.5 Component responsibilities

| Component                           | Responsibility                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ScreenScaffold`                    | Shared page shell: a `ScrollView` with safe-area handling (iOS via native `contentInset`, memoized; Android via padding), centers content to `MaxContentWidth`. Used by all four screens.                    |
| `ScreenHeader`                      | ShieldMark + "Mobile Wallet" wordmark + optional secondary screen-name label. No notification bell (removed by design).                                                                                      |
| `ShieldMark`                        | Purely decorative Swiss-red shield/cross mark. No logic.                                                                                                                                                     |
| `CoinBadge`                         | Maps `CoinSymbol` (`'BTC'\|'ETH'\|'USDC'\|'USDT'`) to a locally bundled PNG. Closed set — four assets only.                                                                                                  |
| `AssetRow`                          | Presentational holdings row (icon, name/symbol, quantity, CHF value, 24h change with a positive/negative/neutral tri-state). Fed different data by Home and Assets; contains no data-fetching itself.        |
| `TransactionRow`                    | Presentational activity row; icon/color derived from transaction type, reusing the same Send/Receive/Swap/Buy SF Symbol glyphs as Home's quick actions.                                                      |
| `PortfolioSparkline`                | Pure `View`-based polyline renderer (rotated hairline bars — there is no chart or SVG dependency in this project). Renders whatever `values: number[]` it's given; currently only ever fed static mock data. |
| `app-tabs.tsx` / `app-tabs.web.tsx` | Native (`expo-router/unstable-native-tabs`) and web tab-bar chrome respectively. Four tabs: Home, Assets, Activity, Settings.                                                                                |

---

## 3. Current Runtime/Data Flow

There is exactly **one** live data path in the app today:

```
CoinGecko public REST API  (GET /api/v3/simple/price, keyless)
        │
        ▼
src/services/market-data.ts
  fetchMarketPrices(): Promise<MarketPrices>
  — builds the URL from a fixed internal symbol→id map (BTC/ETH/USDC/USDT
    → bitcoin/ethereum/usd-coin/tether), requests CHF price + 24h change
    for all four in ONE request, runtime-validates every field, throws a
    descriptive Error on any failure. Never fabricates a price.
        │
        ▼
src/providers/market-data-provider.tsx
  MarketDataProvider (React Context, mounted once in _layout.tsx)
  — fetches on mount, then every 60,000ms via a single setInterval
  — isFetchingRef guards against overlapping requests
  — on failure: keeps the last good `prices` + `lastUpdatedAt`, sets `error`
  — `isStale` = now − lastUpdatedAt > 120,000ms (2× poll interval), computed
    inline on render — no dedicated ticking timer
  — exposes { prices, isLoading, error, lastUpdatedAt, isStale, refresh }
        │
        ▼
src/hooks/use-market-prices.ts
  useMarketPrices() — useContext(MarketDataContext), throws if called
  outside the provider (fails loudly rather than silently creating a
  second data source)
        │
        ▼
src/utils/portfolio-valuation.ts   (pure functions, no side effects)
  computeAssetValueChf(asset, prices)        = quantity × priceChf
  computeAssetChange24hPercent(asset, prices) = prices[symbol].change24hPercent
  computeTotalValueChf(assets, prices)        = Σ (quantity × priceChf)
  computePortfolioChange24hPercent(assets, prices)
    = value-weighted, NOT a naive average: reconstructs each asset's
      value ~24h ago from its own % change, sums both totals, and derives
      the portfolio % from (currentTotal − priorTotal) / priorTotal
  formatChf / formatChangePercent / toPositiveFlag — display formatting
        │
        ▼
src/app/index.tsx (Home)  and  src/app/assets.tsx (Assets)
  — both call useMarketPrices() directly and feed mockAssets quantities
    (src/constants/mock-portfolio.ts) through the same valuation functions
  — Home additionally computes the portfolio-level weighted 24h change;
    Assets deliberately does not (see §4)
        │
        ▼
src/components/asset-row.tsx  →  rendered <Text>
```

**Everything upstream of `mockAssets` quantities is live. The quantities themselves are not** — there is no wallet, so there is nothing real to multiply live prices by. This is the single most important fact about the current data model.

Activity and Settings are not part of this data flow at all — see §4.

---

## 4. Current Screen Architecture

### Home (`src/app/index.tsx`)

- **Purpose:** portfolio overview + quick actions + a preview of holdings.
- **Data/components used:** `ScreenHeader`, `PortfolioSparkline`, `AssetRow` (×4), `useMarketPrices()`, `portfolio-valuation.ts`, `mockAssets`/`mockChartValues`.
- **Live:** total CHF balance, portfolio-level weighted 24h % change, per-asset CHF value, per-asset 24h % change.
- **Mock:** the four asset quantities being multiplied; the sparkline shape (`mockChartValues`, explicitly documented in-file as "not derived from any real price series").
- **Presentation-only:** Send / Receive / Swap / Buy — four `Pressable` circles with SF Symbol icons and **no `onPress` handler at all**. "See all" _is_ functional (a real Expo Router `<Link href="/assets">`).

### Assets (`src/app/assets.tsx`)

- **Purpose:** dedicated holdings screen with a compact total-value summary.
- **Data/components used:** same `useMarketPrices()` + `portfolio-valuation.ts` + `mockAssets` as Home; a status footnote driven by real `isLoading`/`error`/`isStale` state.
- **Live:** total value, per-asset CHF value, per-asset 24h % change, the footnote's status text (genuinely reflects provider state — "fetching live prices…", "live prices unavailable.", "showing last known prices.", "live prices may be outdated.", "prices live via CoinGecko.").
- **Mock:** same quantities as Home.
- **Not implemented here by design:** portfolio-level weighted 24h % change was deliberately deferred to Home only, to avoid shipping the same non-trivial calculation twice before it had been reviewed once.

### Activity (`src/app/activity.tsx`)

- **Purpose:** transaction history.
- **Data/components used:** `TransactionRow`, `mockTransactions` (`src/constants/mock-activity.ts`).
- **Live:** nothing.
- **Mock:** 100% — six hardcoded demo transactions (Received BTC, Swap ETH→USDC, Sent USDT, Buy ETH, Received USDC, Sent BTC), grouped under Today/Yesterday/Earlier, each with a **static** CHF `valueLabel` that is not derived from live prices at all (unlike Home/Assets).
- **Presentation-only:** rows are not tappable; no detail screen exists.

### Settings (`src/app/settings.tsx`)

- **Purpose:** settings surface for security, preferences, currency, and about info.
- **Data/components used:** a local `SETTINGS_SECTIONS` config array rendered as grouped, hairline-divided rows.
- **Live:** the "1.0.0" App Version value is read from the real `package.json` version (small, accurate touch — not fabricated). Note for production: this coupling to `package.json` is a prototype convenience, not the production pattern — the real app version should be sourced from application/runtime metadata (e.g. `expo-constants`'s native app version) so the displayed value always reflects the actual installed build rather than the repository's own version field, which can drift from what's shipped.
- **Mock/static:** "Dark" (Appearance) and "CHF" (Base Currency) are accurate descriptions of the app's actual current, non-configurable state — not live preferences.
- **Presentation-only:** every single row (App Lock, Biometrics/Face ID, Recovery & Backup, Notifications, Appearance, Base Currency, Show CHF as the current value, Network, Privacy & Legal) has **zero `onPress` handler**. Chevrons and the gold checkmark are purely visual affordances.

---

## 5. Current Feature Matrix

| Feature                                 | UI               | Data source                 | Functional?                                  | Production-ready? | Notes                                                     |
| --------------------------------------- | ---------------- | --------------------------- | -------------------------------------------- | ----------------- | --------------------------------------------------------- |
| Portfolio total (Home)                  | ✅               | Live (CoinGecko × mock qty) | Partially — math is real, quantities are not | No                | No wallet backs the quantity                              |
| Portfolio 24h change (Home)             | ✅               | Live, value-weighted        | Yes (as math)                                | No                | Depends on mock quantities                                |
| Market prices (BTC/ETH/USDC/USDT → CHF) | ✅               | Live, CoinGecko public API  | Yes                                          | No                | Keyless public endpoint; no redundancy/fallback           |
| Portfolio chart                         | ✅               | Static mock array           | No                                           | No                | Explicitly documented as fictional in source              |
| Assets screen                           | ✅               | Live (same as Home)         | Partially                                    | No                | Same quantity caveat                                      |
| Activity                                | ✅               | 100% static demo data       | No                                           | No                | Not derived from live prices even for CHF display         |
| Send                                    | ✅ (button only) | —                           | No                                           | No                | No `onPress`, no flow exists                              |
| Receive                                 | ✅ (button only) | —                           | No                                           | No                | No `onPress`, no address/QR exists                        |
| Swap                                    | ✅ (button only) | —                           | No                                           | No                | No `onPress`, no provider integration                     |
| Buy                                     | ✅ (button only) | —                           | No                                           | No                | No `onPress`, no fiat/on-ramp integration                 |
| App Lock                                | ✅ (row only)    | —                           | No                                           | No                | No lock logic anywhere                                    |
| Biometrics                              | ✅ (row only)    | —                           | No                                           | No                | No `expo-local-authentication` dependency even installed  |
| Recovery/Backup                         | ✅ (row only)    | —                           | No                                           | No                | No wallet exists to back up                               |
| Notifications                           | ✅ (row only)    | —                           | No                                           | No                | No push infrastructure                                    |
| Currency (Base Currency / Show CHF)     | ✅ (row only)    | —                           | No                                           | No                | CHF is hardcoded app-wide, not a real setting             |
| Network                                 | ✅ (row only)    | —                           | No                                           | No                | No blockchain connectivity exists to select a network for |
| Privacy/Legal                           | ✅ (row only)    | —                           | No                                           | No                | No destination screen/document exists                     |

---

## 6. What Is Actually Complete Today

Only functionality demonstrably working in the repository, verified by reading the code:

- A polished, consistent, dark Swiss-fintech visual design across four screens, sharing one design system (`theme.ts`, `ScreenScaffold`, `ScreenHeader`, `AssetRow`/`TransactionRow` card language).
- Fully functional four-tab native navigation (Expo Router `NativeTabs`), plus one working in-app deep link (Home's "See all" → `/assets`).
- A real, working, validated, keyless integration with CoinGecko's public price API for BTC/ETH/USDC/USDT → CHF, including 24h % change.
- A correctly-architected single shared polling provider (one interval, one fetch owner, no duplicate polling across screens — verified: `MarketDataProvider` is mounted exactly once).
- Correct, tested-by-inspection valuation math, including a genuinely value-weighted (not naively averaged) portfolio 24h change calculation.
- Honest loading/error/stale-state handling on Assets — never fabricates a price, never silently blanks the last good data.
- A believable, well-composed static demo transaction history and a fully laid-out (non-functional) settings surface.

Nothing beyond this list should be described as "done." In particular: there is no wallet, no key of any kind, no blockchain read or write capability, no backend, and no persistence.

---

## 7. Current Technical Debt / Known Limitations

Verified, not invented:

- **Public CoinGecko endpoint, no key, no fallback provider.** Appropriate for a demo; not appropriate as the sole production price source (rate-limit risk, no redundancy, ToS position on unregistered commercial use).
- **Polling, not push.** A fixed 60s interval is simple and correct for this stage but doesn't scale well to many more data types (balances, tx status) without a rethink (WebSocket/event-driven or a request-batching layer).
- **Demo quantities and demo history are structurally indistinguishable from a real future data source** except by convention (`mock-portfolio.ts` / `mock-activity.ts` naming). There is no type-level or runtime marker separating "demo" from "real" data — worth hardening before real data is introduced, so a bug can never silently blend the two.
- **Dead code:** resolved as of Stage 3 (freeze/audit). `mockPortfolio` and `MockAsset.valueLabel`/`.changeLabel`/`.isPositive` were verified unused and removed; three fully orphaned component files (`hint-row.tsx`, `web-badge.tsx`, `ui/collapsible.tsx` — all zero-reference leftovers from the pre-redesign screens) were removed at the same time. One item was found and deliberately deferred rather than fixed in that pass: the `AnimatedIcon` export inside `animated-icon.tsx`/`.web.tsx` is unused, but shares a style with the still-critical `AnimatedSplashOverlay` in the same file, so untangling it was left for a small dedicated follow-up rather than risking the splash screen. Two image assets (`expo-badge-white.png`, `expo-badge.png`) were also left in place, orphaned now that `web-badge.tsx` is gone.
- **Static chart with no disclosure.** `PortfolioSparkline` renders fictional data with no in-UI indication that it isn't real; low risk at this stage since the whole app is clearly a demo, but should not survive into a build with real balances without either becoming real or being explicitly labeled.
- **No error boundary, no crash reporting, no structured logging** anywhere in the app.
- **No persistence layer of any kind** — every screen re-derives everything from constants + one in-memory Context on every app launch. Even entirely non-sensitive future preferences (currency, appearance) would currently have nowhere to be saved.
- **No automated testing.** Root `package.json`'s `test` script is a stub that always fails; `apps/mobile/package.json` has no `test` script at all. No unit, integration, or component tests exist.
- **Lint is not currently runnable** in at least this sandboxed environment (`expo lint` fails with `Cannot find module 'eslint'`) — worth confirming in a clean environment before relying on it as a gate.
- **No physical-device testing infrastructure** — everything verified so far has been iOS Simulator only.
- **EAS is linked but not configured.** `app.json` carries a `projectId`/`owner`, but there is no `eas.json`, no `ios.bundleIdentifier`, no `android.package` — a real build/store submission cannot happen yet.
- **Theme inconsistency:** `app.json` declares `userInterfaceStyle: "automatic"` and a `Colors.light` palette exists in `theme.ts`, but every screen hardcodes `Colors.dark` directly — light mode is configured at the platform level but not actually implemented anywhere in the UI. `src/hooks/use-theme.ts` (which does respect color scheme) exists but is not used by any of the four screens.
- **Backend: does not exist.** There is no server, no account model, no auth, in this repository at all — every "Backend" claim in this document (§17) is proposed, not present.

---

## 8. Target Production Architecture _(proposed — not implemented)_

High-level component separation for the eventual product:

```
┌─────────────────────────────┐
│        Mobile Application       │  React Native / Expo — UI, orchestration
└───────────────┬─────────────────┘
                │
   ┌────────────┼─────────────────────────────┐
   │            │                              │
┌──▼───────┐ ┌──▼─────────────┐  ┌─────────────▼───────────┐
│ Wallet    │ │ Backend / API   │  │ Blockchain / RPC layer   │
│ Core      │ │ (metadata only) │  │ (balances, tx, broadcast)│
│ (on-device)│ └──┬──────────────┘  └────────────┬─────────────┘
└──┬────────┘    │                                │
   │      ┌───────▼────────┐              ┌────────▼─────────┐
   │      │ Database        │              │ Node/RPC providers│
   │      │ (no key material)│              │ + indexers        │
   │      └────────────────┘              └───────────────────┘
   │
┌──▼─────────────────────────────────────────────────────┐
│ Device secure storage (Keychain / Keystore)              │
└───────────────────────────────────────────────────────────┘

Alongside, as separate bounded services: Market data, Swap
aggregation, Fiat on/off-ramp (KYC'd), Card issuing (KYC'd,
licensed), Notifications, Observability.
```

Each of these is expanded in its own section below (§9–§21). The unifying rule: **Wallet Core and device secure storage are the only places private key material may ever exist.** Everything else — backend, database, RPC, market data, swap, fiat, card — operates on public information or user-authorized, already-signed transactions.

---

## 9. Non-Custodial Wallet Architecture _(proposed)_

This is the most safety-critical section of this document.

**Presentation vs. wallet-core boundary:** React Native remains the presentation/orchestration layer only. Sensitive wallet operations (entropy generation, HD derivation, secret-memory handling, signing) must be isolated behind a narrow `WalletCore` interface that the app calls into — the app never manipulates key material directly. `packages/wallet-core` may still be the repository boundary for this interface, but the boundary is architectural, not a statement that the implementation is TypeScript. Before Stage 4 implementation begins, we must explicitly decide (see ADR-002, §27) whether production key generation, HD derivation, secure-memory handling, and signing live in:

a) audited JS/TS crypto libraries, running in the React Native JS runtime;
b) platform-native Swift/Kotlin, called from React Native via a native module;
c) a shared native core (e.g. Rust) exposed to both platforms through a native bridge.

This choice must be driven by security review, the maturity/audit history of available libraries for each option, curve support for the target chains (§10), and how well each option handles secret material in memory (zeroing, avoiding GC-managed memory for secrets, minimizing time spent unencrypted) — never by developer convenience or time-to-ship.

**Wallet creation / entropy:**

- Seed entropy must be generated on-device using a cryptographically secure RNG (React Native's native crypto RNG via a vetted library — never `Math.random`).
- Standard BIP-39 mnemonic generation (12 or 24 words) from that entropy, using an audited library.
- HD derivation (BIP-32/BIP-44 or chain-appropriate equivalent) to derive per-chain keys from the single seed.

**Private-key handling:**

- The mnemonic/seed and all derived private keys exist in plaintext **only transiently, in memory, on-device**, for the minimum time needed to derive a key or sign a transaction.
- They must never be logged, included in crash reports, written to analytics, or transmitted over the network in any form, to any destination — including Mobile Wallet's own backend.

**Secure local storage:**

- iOS: store the encrypted seed material in the **iOS Keychain**, with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (or stricter), and where available use the **Secure Enclave** to _wrap/protect the encryption key that guards the seed_ — not to perform blockchain signing operations directly. The Secure Enclave supports its own key types (e.g., P-256) for authentication/encryption; it does not natively perform arbitrary blockchain curve operations (e.g., secp256k1 signing for Bitcoin/Ethereum). The correct pattern is: Secure Enclave protects an encryption key → that key encrypts the seed at rest in the Keychain → the seed is decrypted into memory only after biometric/passcode authentication → signing happens in the wallet-core module in memory.
- Android: equivalent pattern using the **Android Keystore** (hardware-backed where available, StrongBox on supported devices) to protect the encryption key guarding the seed, with biometric-gated unlock via `BiometricPrompt`.
- No seed or private key may ever be written to `AsyncStorage`, plain files, `expo-secure-store`'s default (unauthenticated) mode, or any non-hardware-backed storage.
- **This is the target pattern, not a guarantee that any specific library delivers it automatically.** Generic Expo/React Native storage abstractions do not, by themselves, guarantee hardware-backed protection on every device — actual availability of Secure Enclave / StrongBox / hardware-backed Keystore varies by device and OS version, and some abstractions silently fall back to weaker storage when hardware backing isn't available. The exact semantics (does it use the Secure Enclave/StrongBox on this device? does it fail closed or fall back silently if not?) must be validated against whichever native storage library is actually selected (ADR-005, §27) and against current platform documentation — not assumed from a library's name or marketing.

**Biometric gating:**

- Biometrics (Face ID/Touch ID, Android biometric) gate _access to_ the decryption key, not the cryptography itself. A device passcode/PIN fallback is required, since biometrics can be unavailable or disabled.
- Biometric gating should be required for: revealing the recovery phrase, unlocking the app after backgrounding (App Lock), and approving each transaction signature.

**Transaction signing:**

- Signing happens entirely in the on-device wallet-core module, in memory, after successful authentication. An unsigned transaction goes in; a signed transaction (or signature) comes out. The backend and any intermediate service only ever see the unsigned request and the already-signed result — never key material.

**Transaction construction / signing integrity boundary:** RPC, backend, and third-party provider services (swap quotes, fee estimators, etc.) may only ever supply **public inputs** to a transaction — nonce, UTXOs, gas data, fee estimates, swap quotes, candidate routes/calldata. None of that is trusted blindly:

- The device must either construct the exact transaction that will be signed itself, or independently validate any provider-supplied transaction candidate against the user's actual intent (destination, amount, token, network) before it is allowed anywhere near signing.
- The human-readable confirmation shown to the user must be derived from the *exact* transaction payload that is about to enter signing — never from a separate, earlier, or provider-supplied description that could drift from what actually gets signed.
- Once the user has confirmed, the destination, amount, token, network, and calldata must not be silently replaceable by a backend or provider before broadcast. Any change after confirmation requires the user to re-confirm against the new payload.
- Signing itself remains strictly on-device, as above, with no exception for provider-originated transactions (see §13 for how this applies specifically to Swap).

**Seed / recovery strategy:**

The initial recommended (baseline) model is deliberately minimal:

- Standard user-controlled BIP-39 mnemonic. No server-held recovery secret of any kind. This is the only recovery mechanism in scope for Stage 5.
- Optional cloud or social recovery is explicitly **not** part of the baseline architecture. It is a later product/security decision that requires its own separate threat model and an ADR (ADR-004, §27) before any implementation — it is not something this document pre-approves.

Three distinct moments must not be conflated, and the policy for each must be stated explicitly rather than assumed:

1. **Initial mnemonic backup/verification** — shown once at wallet-creation time, with an explicit user-acknowledgement step (and ideally a verification step, e.g. re-entering a subset of words), so the user has actually recorded it before proceeding.
2. **Later "reveal recovery phrase" capability** — a separate, deliberate product decision: does the app ever allow re-viewing the mnemonic after creation? If yes, it must be gated behind the same biometric/passcode approval as signing (§9, "Biometric gating"), and this document does not claim "shown once only" and "later revealable" simultaneously — whichever policy is chosen must be stated and implemented consistently, not left ambiguous.
3. **Wallet restore/import** — re-entering an existing mnemonic on a new device or after reinstall (see "Wallet import / restore" below) is a different flow from either of the above and does not, by itself, require "reveal recovery phrase" to exist.

**Wallet import / restore:**

- Import: user enters an existing BIP-39 mnemonic (or imports a supported hardware/format later); the app re-derives the same keys locally. Never transmitted anywhere during import.
- Restore: reconstructs local secure storage from the mnemonic on a new device; same rules apply as creation.

**What must NEVER be delegated to the backend, under any circumstance, in a non-custodial design:**

- Seed/mnemonic generation, storage, or transmission.
- Private key generation, storage, transmission, or derivation.
- Transaction signing.
- Any operation that would allow the backend (or anyone with access to it) to move user funds without the user's on-device authorization.

---

## 10. Blockchain Architecture _(proposed)_

**V1 network strategy — recommendation, not all-chains-at-once:** given the current asset set is BTC, ETH, USDC, USDT, a sound V1 scope is:

- **Bitcoin** (mainnet, native asset only).
- **Ethereum mainnet** (native ETH + the two ERC-20 stablecoins, USDC and USDT).

This covers all four currently-displayed assets with two chains, not four, and avoids the common mistake of also committing to L2s/other chains before the core signing/RPC/balance pipeline has shipped once, end-to-end, for the simplest case.

**Required per-chain components:**

- **RPC providers:** abstracted behind an internal interface (`ChainProvider`), so a specific RPC vendor is swappable. Recommend at least two providers per chain for failover (see §11 failure strategy).
- **Balances:** native balance via RPC `getBalance`-equivalent; ERC-20 balances via contract calls or an indexer (see below) rather than one RPC call per token.
- **Transaction history:** raw RPC nodes are a poor source of historical/indexed data at scale — a blockchain indexer/data API is the realistic source for Activity once real, not raw RPC polling.
- **Token metadata:** a small, curated, versioned local list for V1 (four assets) rather than a dynamic token-metadata service — avoids trusting arbitrary on-chain metadata for a small known asset set.
- **Fee estimation:** chain-native (e.g., Ethereum gas estimation via RPC + a gas-price oracle; Bitcoin fee-rate estimation via a fee-estimation API/node).
- **Transaction construction, signing, broadcasting:** RPC/backend services may supply the public inputs needed to build a transaction (nonce, fee data, UTXOs), but the device must construct or independently validate the exact transaction before signing — construction is not a concern the device can safely delegate wholesale. Signing is wallet-core-only, on-device, with no exception (§9). Broadcasting (submitting the already-signed transaction) is the one step that is genuinely backend/RPC-adjacent, since it requires no key material.
- **Confirmations:** poll or subscribe (where the provider supports it) for confirmation count/finality per chain's own model.
- **Explorer links:** simple per-chain URL templates (Etherscan-equivalent, a Bitcoin explorer) — no dependency, just configuration.
- **Network failure/fallback strategy:** provider abstraction (as above) with automatic failover between at least two RPC/indexer providers per chain, plus a clear "network unavailable" UI state that never fabricates a balance or transaction.

---

## 11. Send Flow _(proposed)_

```
amount entry
  → address validation (checksum/format, chain-appropriate)
  → network/asset validation (right chain selected for the asset)
  → fee estimate (live, from §10)
  → confirmation screen (amount, fee, total, destination — final review)
  → biometric/security approval (§9 — gates signing key access)
  → local signing (wallet-core, in memory, on-device)
  → broadcast (via RPC provider)
  → pending state (shown in Activity immediately, optimistic)
  → confirmed / failed (updated from chain confirmation polling)
  → Activity (final state recorded)
```

Every step left of "local signing" only ever handles public information (address, amount, fee) or a not-yet-signed transaction. Nothing left of signing ever needs key material. Per §9's transaction-construction/signing integrity boundary, the "confirmation screen" step must render from the exact transaction payload that will be signed next, and nothing after that step may silently change destination, amount, token, network, or calldata without forcing a new confirmation.

---

## 12. Receive Flow _(proposed)_

- Display the wallet's public address for the selected asset/network, derived locally from the (already-unlocked) public key — no network call required to _display_ an address.
- QR code encoding the address (and optionally amount, for payment requests).
- Explicit network/token warning ("Only send ETH or ERC-20 tokens to this address") to prevent the extremely common cross-chain-deposit-loss mistake.
- Copy/share address as plain actions.
- Inbound transaction detection: polling/webhook from the chain indexer (§10) for the user's known addresses; surfaces into Activity as a new "Received" entry once confirmed.

---

## 13. Swap Architecture _(proposed)_

Swap should be built as a **provider-abstracted quote/build/sign/broadcast pipeline**, not a single hardcoded integration:

```
quote request (from asset, to asset, amount)
  → provider abstraction requests quotes from one or more swap/liquidity providers
  → best quote surfaced to user with an explicit "provider" and "you receive" figure
  → user confirms
  → provider returns a quote/route/unsigned-transaction candidate
  → device validates: chain matches expectation, destination contract(s) are the
    ones the quote claims, any token approvals are scoped to what's needed (not
    unlimited unless explicitly intended), amounts and min-received/slippage match
    what was quoted, and calldata/value are checked where technically feasible
  → confirmation UI is generated from the validated payload, not the raw provider
    response
  → wallet-core signs locally (§9) — the swap provider never receives key material
  → broadcast via the same RPC layer as Send
  → tracked through to confirmation like any other transaction
```

**The wallet must not blindly sign arbitrary calldata returned by a swap provider.** A malicious or compromised provider returning a transaction that drains approvals, redirects funds, or grants excessive allowances is a realistic threat class for swap integrations specifically — the validation step above is not optional hardening, it's the core of what makes swap safe to ship at all.

What belongs **outside** the wallet core: quote aggregation, route-finding, and liquidity access are provider/backend-adjacent concerns — the wallet's job is to request a quote, validate what comes back, present it honestly, and sign only what the user approved against the validated payload. No specific swap provider is selected in this document; the architecture requirement is the abstraction plus validation, not a vendor choice.

---

## 14. Buy / Sell / Fiat Architecture _(proposed)_

Fiat on/off-ramp is a **regulated, provider-operated capability that the wallet integrates with — not something the wallet itself becomes.**

- **CHF-first:** given the product's Swiss focus, prioritize a fiat provider with strong CHF/SEPA-instant or Swiss QR-bill-equivalent rails over a generic multi-currency default.
- **On-ramp:** user selects amount/asset → redirected to (or embeds) a licensed fiat-to-crypto provider's KYC'd flow → provider delivers crypto to the user's wallet address once payment settles. The wallet never touches the user's fiat funds directly.
- **Off-ramp:** inverse — provider receives crypto (a normal Send from the user's wallet to a provider-supplied address) and pays out fiat to the user's bank account after its own compliance checks.
- **KYC/KYB implications:** identity verification is the _provider's_ regulatory obligation for the funds passing through their rails, not something Mobile Wallet's own backend should attempt to build from scratch for a V1.
- **Payment providers / bank transfer:** evaluated at build time against Swiss market fit (SEPA Instant, TWINT-equivalent, or card-based on-ramp) — no vendor is selected here.

**Hard separation:** wallet functionality (holding/sending/receiving/signing) must remain fully usable and architecturally independent of whether any fiat provider is integrated, live, or even exists yet.

---

## 15. Card Architecture _(proposed, explicitly future/gated)_

A card product is **not something the mobile app itself can provide** — it requires a licensed issuer relationship and is presented here purely at the architecture-boundary level:

- **Issuer / BIN sponsor / program manager:** a regulated card-issuing partner (bank or licensed program manager) that actually issues the card and sponsors the BIN; Mobile Wallet would integrate as the program's front-end, not the issuer.
- **Card lifecycle:** issuance, activation, freeze/unfreeze, and closure are all issuer-side operations exposed to the app via the issuer's API — never something the wallet's own backend fabricates.
- **Authorization:** real-time authorization requests flow from the card network → issuer → (optionally) Mobile Wallet backend for a spend-approval/crypto-conversion decision, with a strict latency budget.
- **Settlement:** typically requires pre-funding or a real-time crypto→fiat conversion at point-of-sale/settlement — a genuinely separate financial-operations concern from wallet custody.
- **Crypto conversion:** if spending directly from crypto balances, a conversion step (likely via the same swap/liquidity abstraction as §13) happens at authorization or settlement time, with clear user-facing rate transparency.
- **Compliance dependencies:** card issuance sits behind the same KYC perimeter as fiat (§14, §16) — a card cannot ship before that perimeter exists.

This capability should be explicitly gated behind fiat infrastructure (§14) and a real compliance program (§16); it is not a near-term milestone.

---

## 16. KYC / AML / Compliance Boundary _(proposed — not legal advice)_

Because this is intended as a Swiss-market product, the following technical boundaries are worth designing for early, without this document asserting a specific licensing conclusion:

- **KYC:** required wherever the product touches fiat rails (on/off-ramp, card) — see §14/§15. Pure wallet functionality (hold/send/receive/swap crypto-to-crypto) does not inherently require the _wallet itself_ to run KYC, but any integrated regulated provider will run its own.
- **AML / sanctions screening:** relevant to any fiat or card integration, and increasingly to swap/liquidity providers; typically delivered via a specialized blockchain-analytics/screening provider rather than built in-house.
- **Travel Rule:** applicable in specific fiat off-ramp / VASP-to-VASP transfer scenarios above relevant thresholds — a real determination requires knowing the exact money-flow and counterparties involved.
- **Transaction monitoring / auditability:** any regulated flow (fiat, card) needs monitoring and an audit trail on the _regulated-provider_ side; the wallet's own architecture should support exporting the minimum necessary data to satisfy this without ever exposing key material.
- **Privacy / data minimization:** the backend (§17) should be designed from day one to hold the minimum data necessary — public addresses and provider-transaction references, not more.

**This document does not, and cannot, determine Mobile Wallet's exact FINMA licensing posture.** That depends entirely on the final custody model, money flows, and specific providers chosen, and **requires qualified Swiss legal/compliance review** before any fiat, card, or custody-adjacent feature ships. Pure non-custodial wallet functionality (as scoped in §9–§13) is architected specifically to minimize this regulatory surface, but the fiat/card layers (§14–§15) reintroduce it and must not be built without that review.

---

## 17. Backend Architecture _(proposed — currently does not exist)_

**What the backend may reasonably handle:**

- Non-sensitive metadata: token/asset metadata cache, price-history cache (fronting a market-data provider so the app isn't calling third parties directly at scale), push-notification registration/dispatch, feature flags, app-config.
- Orchestration for regulated third-party flows (fiat, card, swap quote aggregation) where a server-side API key or provider contract requires it — the backend proxies to the provider, it does not become the custodian.
- Optional: encrypted-backup relay (storing only an already-client-encrypted blob, per §9) — never a plaintext seed.

**What the backend must never become:** a hidden custody layer. Concretely:

- It must never receive, store, log, or be able to derive a user's private key or seed phrase.
- It must never be positioned to construct and sign a transaction on the user's behalf without the user's on-device, authenticated approval.
- Even in an outage, the backend's absence should degrade the app (e.g., stale prices, no push notifications) — it must never be a single point of custody failure.

**Candidate service boundaries (proposed):**
| Service | Responsibility | Sees key material? |
|---|---|---|
| Market-data service | Cache/rate-limit third-party price feeds | No |
| Chain-indexer proxy | Cache/serve balance & history queries from indexers | No |
| Swap-quote aggregator | Fan out quote requests to swap providers | No |
| Fiat/card orchestration | Proxy to licensed fiat/card providers | No |
| Notification service | Push registration + dispatch | No |
| Encrypted-backup relay (optional) | Store client-encrypted seed blobs | No (ciphertext only) |

**Database boundary:** no schema in this system should ever contain a column capable of holding a plaintext private key, seed phrase, or unencrypted backup blob.

---

## 18. Security Architecture _(proposed — threat-oriented checklist)_

| Threat                                                | MVP requirement                                                                          | Later hardening                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Key compromise (device)                               | Hardware-backed secure storage (§9), biometric gating                                    | Anomaly detection on repeated auth failures              |
| Malicious transaction signing (compromised app logic) | Always show full human-readable transaction detail before signing; never auto-approve    | Signed-transaction diffing/simulation before broadcast   |
| Address substitution (clipboard/UI spoofing)          | Full-address display + copy confirmation; QR as primary input method                     | Address-book with verified/known-address highlighting    |
| Clipboard attacks (malware swapping copied addresses) | Warn/re-confirm destination address at final review step                                 | Clipboard-content integrity checks where platform allows |
| Rooted/jailbroken devices                             | Treat detection as a bypassable **risk signal**, not a security guarantee: surface a warning to the user | Full attestation (Play Integrity / DeviceCheck); whether to gate wallet-creation/signing on risk score is a product/security decision, not an automatic architecture rule |
| Phishing (fake app, fake support)                     | In-app education, no "share your seed" flows anywhere, ever                              | Domain/app-store monitoring                              |
| API tampering (MITM)                                  | Standard TLS certificate validation (mandatory, non-negotiable)                          | TLS pinning on sensitive endpoints, evaluated per-endpoint against operational risk (certificate rotation, availability impact if pinning breaks a release) — not an unconditional MVP requirement; full certificate transparency monitoring |
| RPC compromise (malicious/faulty node)                | Multi-provider RPC with cross-checking on critical reads                                 | Consensus-based balance verification                     |
| Supply-chain risk (deps)                              | Dependency pinning, minimal dependency surface (already a stated principle)              | Automated SCA scanning, lockfile auditing in CI          |
| Replay/double submission                              | Nonce/sequence handling per chain norms; idempotent broadcast                            | Explicit duplicate-transaction detection                 |
| Sensitive logs                                        | Hard rule: never log seed/key/signed-payload contents (already followed in current code) | Automated log-content scanning in CI                     |
| Crash reporting privacy                               | Scrub PII/sensitive fields before any crash report leaves the device                     | Formal DPIA on crash-reporting vendor                    |
| Dependency security                                   | Review before adding any wallet/crypto dependency (already a stated project rule)        | Regular re-audit cadence                                 |
| Rate limiting                                         | Backend-side rate limiting on all proxy endpoints                                        | Adaptive/anomaly-based limits                            |
| Secrets management                                    | No secrets in the mobile bundle; provider keys live server-side only                     | Rotating secrets, vault-based management                 |

---

## 19. Testing Strategy _(proposed — none of this exists today)_

- **Unit tests:** pure functions first — `portfolio-valuation.ts` is already a clean, dependency-free target once a test runner is added.
- **Integration tests:** provider/hook behavior (polling, failure preservation, staleness) with a mocked `fetch`.
- **Wallet-core tests:** deterministic test vectors for key derivation and signing (standard BIP-39/BIP-32 test vectors) — critical-path, must be exhaustive before shipping.
- **Transaction fixture tests:** known input → known signed-output byte comparison, per supported chain.
- **RPC/provider tests:** contract tests against provider APIs (recorded fixtures, not live calls, in CI).
- **Mobile UI tests:** component-level tests for the existing screens/components (currently zero coverage).
- **Security tests:** secure-storage behavior, biometric-gate bypass attempts, log-content scanning.
- **Physical-device QA:** real iOS and Android hardware, not just simulator — required before any real-money feature ships.
- **Failure/offline testing:** airplane-mode, slow-network, and RPC-timeout scenarios for every live data path.
- **Release regression testing:** a fixed manual+automated checklist run before every store submission.

---

## 20. Environments & Delivery _(proposed)_

| Environment | Purpose                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| Local       | Developer machine, Expo Go / dev client, points at test/mock data          |
| Development | Shared dev builds, test networks/testnets, internal-only                   |
| Staging     | Production-like config, still test networks where possible, pre-release QA |
| Production  | Mainnet, real fiat providers (once approved), App Store/Play Store builds  |

**Expo/EAS's expected role:** EAS Build for native binaries, EAS Update for OTA JS/asset updates on non-native changes, EAS Submit for store submission. Development builds (not Expo Go) become necessary the moment any native module (secure storage, biometrics, a signing library) is added, since Expo Go cannot load custom native code.

**Current EAS state (verified, no secrets exposed):** `app.json` has `extra.eas.projectId` and `owner` set (linked, not configured for builds). **No `eas.json` exists** — build profiles, and the `ios.bundleIdentifier`/`android.package` values required by any real build, are not yet defined.

**Distribution progression:** internal distribution (EAS internal builds) → TestFlight / Play internal testing → public App Store / Play Store release, in that order, gated by increasing confidence and (for anything touching real funds) increasing security review depth.

**CI/CD:** not present today. Recommended minimum once wallet-core exists: typecheck + lint + unit tests on every PR; wallet-core/signing tests treated as a hard, non-skippable gate.

---

## 21. Observability _(proposed — privacy-safe by construction)_

- **Crashes:** vendor crash reporting with mandatory PII/sensitive-field scrubbing before upload; never include wallet addresses' full form, transaction payloads, or any key-adjacent data by default.
- **API health:** uptime/latency monitoring for the backend's own proxy endpoints (§17) and for third-party providers it fronts.
- **Provider failures:** structured, non-sensitive logging of RPC/market-data/swap-provider failures to drive the failover logic in §10/§13.
- **Transaction lifecycle monitoring:** track (server-side, on public transaction data only) pending → confirmed/failed timing to catch systemic broadcast/confirmation problems, not to surveil individual users beyond what's needed for support.
- **Performance:** standard mobile performance telemetry (cold start, screen render time) — no sensitive payloads.

**Absolute rule, restated:** seeds, private keys, and raw signed-transaction payloads must never appear in logs, crash reports, or analytics events, under any configuration.

---

## 22. Roadmap From Current State to Product

Numbering continues from the two stages the repository's git history already represents (`chore: initialize SwissWallet monorepo` through the live-market-data/UI milestone = the foundation and prototype stages). Each stage below is scoped to be a single controlled change, matching the project's own stated working principle.

Stages largely follow the sequence suggested for this task, which was checked against the actual repository and found architecturally sound (foundation → secure storage → read-only balance/receive → send/signing → history → security polish → swap → backend-where-needed → regulated flows → hardening → release); no reordering was required.

**Stage 3 — Freeze/audit current prototype**

- Goal: lock in this document as the source of truth; clean up known dead code (`mockPortfolio`, unused `MockAsset` fields) so the codebase matches this document exactly.
- Scope: documentation + small, isolated dead-code removal. No feature work.
- Dependencies: none.
- Exit criteria: this document merged/reviewed; dead fields removed; `tsc` clean.
- Risk: very low.

**Stage 4 — Wallet-core foundation**

- Goal: introduce an isolated wallet-core module (repository boundary likely `packages/wallet-core`) capable of entropy generation, BIP-39 mnemonic generation, and BIP-32/44 HD derivation — with no UI wiring yet.
- Scope: new package/module, vetted crypto dependencies (first real dependency-review event for this project), exhaustive test vectors. Implementation language/runtime is decided as part of this stage, not assumed beforehand (§9).
- Dependencies: Stage 3.
- Exit criteria: **ADR-002 (wallet-core runtime/language), ADR-003 (derivation paths/account model), and the crypto-library and supported-curves/chains decisions are recorded and approved before implementation work in this stage is considered complete** (§27); deterministic test vectors pass for the chosen implementation; the wallet-core boundary has zero React/UI imports on the sensitive-operations path; security-reviewer sign-off on both the runtime/language choice and the specific dependency choices.
- Risk: high (foundational crypto correctness).

**Stage 5 — Secure wallet creation & storage**

- Goal: on-device wallet creation flow, seed backup/verification per the policy chosen in §9, encrypted at rest via Keychain/Keystore (§9), biometric-gated unlock.
- Scope: native secure-storage integration, App Lock becomes real, Recovery & Backup screen becomes real (backup/verification flow, plus whichever "reveal recovery phrase" policy was decided in §9).
- Dependencies: Stage 4. Requires moving off Expo Go to a development build (native module). **ADR-004 (recovery model) and ADR-005 (secure-storage model) must be recorded and approved before this stage starts** (§27).
- Exit criteria: seed never touches disk unencrypted or leaves the device; the actual secure-storage semantics of the selected native library (hardware-backed vs. software fallback, per-device) are explicitly verified, not assumed, on physical hardware; biometric gate verified on **physical iOS and Android devices**, not simulator/emulator only; security review passed.
- Risk: high.

**Stage 6 — Real balances**

- Goal: replace mock quantities with real on-chain balances for the V1 network scope (§10) for the wallet created in Stage 5.
- Scope: RPC/indexer integration, balance-fetching layer plugged into the existing `portfolio-valuation.ts` (already shaped correctly to accept real quantities in place of mock ones).
- Dependencies: Stage 5.
- Exit criteria: Home/Assets show real balances for a real (testnet-first) wallet; mock quantities fully removed from the live path.
- Risk: medium.

**Stage 7 — Receive**

- Goal: real receive flow (§12) — address display, QR, network warning.
- Scope: Home's "Receive" button gains a real destination; no Send yet (lower risk, no signing required).
- Dependencies: Stage 6.
- Exit criteria: address correctly derived and displayed for each V1 asset/network; inbound test transaction detected end-to-end on testnet.
- Risk: low–medium.

**Stage 8 — Send**

- Goal: real send flow (§11), full pipeline through local signing and broadcast.
- Scope: address/amount validation, fee estimation, confirmation UI, biometric approval, signing, broadcast.
- Dependencies: Stages 5–7.
- Exit criteria: successful signed, broadcast, confirmed testnet transaction; exhaustive fixture + physical-device testing; security review.
- Risk: high (first real fund-moving capability).

**Stage 9 — Real activity/history**

- Goal: replace `mock-activity.ts` with real transaction history from the indexer, including the Stage 7/8 transactions.
- Scope: Activity screen wired to real data; pending/confirmed/failed states.
- Dependencies: Stage 8.
- Exit criteria: real transactions appear correctly grouped and priced; mock activity fully removed from the live path.
- Risk: medium.

**Stage 10 — Security/settings made real**

- Goal: wire the remaining Settings rows that are genuinely wallet-adjacent (Biometrics toggle, Notifications opt-in, Network display) to real state.
- Scope: Settings screen only, no new financial capability.
- Dependencies: Stages 5–9 (depends on what each row is toggling).
- Exit criteria: no Settings row remains presentation-only except those explicitly gated to later stages (Fiat/Card-related, if any).
- Risk: low–medium.

**Stage 11 — Swap**

- Goal: real swap (§13) for the V1 asset set, via a provider-abstracted quote/build/sign/broadcast pipeline.
- Scope: swap-quote aggregation (may need a thin backend service — see Stage 12), Home's "Swap" button becomes real.
- Dependencies: Stages 8, 10.
- Exit criteria: successful signed swap transaction on at least one real provider integration; quote-vs-executed-amount accuracy verified.
- Risk: high (introduces a first external financial provider dependency).

**Stage 12 — Backend/account services where genuinely needed**

- Goal: stand up the minimum backend (§17) required by Stage 11 (and by Stage 13/14 later) — market-data proxy, swap-quote aggregation, push registration.
- Scope: new service(s), explicitly scoped to never touch key material (§17 table).
- Dependencies: Stage 11's actual needs.
- Exit criteria: backend threat-modeled and reviewed; verified it cannot construct or sign transactions.
- Risk: medium (mostly an architecture-discipline risk, not a technical one).

**Stage 13 — KYC/AML/provider layer**

- Goal: integrate a KYC/AML provider ahead of any fiat capability, per §16.
- Scope: provider integration only; gated behind qualified legal/compliance review (§16) before this stage starts, not after.
- Dependencies: Stage 12; external legal review.
- Exit criteria: compliance sign-off; provider integration tested end-to-end in a sandbox.
- Risk: high (regulatory, not just technical).

**Stage 14 — Fiat on/off-ramp**

- Goal: real Buy/Sell (§14) via a licensed fiat provider, CHF-first.
- Scope: Home's "Buy" button becomes real; off-ramp flow added.
- Dependencies: Stage 13.
- Exit criteria: end-to-end fiat→crypto and crypto→fiat transaction verified in provider sandbox, then in limited production.
- Risk: high.

**Stage 15 — Card infrastructure**

- Goal: card issuance integration (§15), explicitly gated.
- Scope: issuer/program-manager integration; no card issuing is ever built by the mobile app itself.
- Dependencies: Stage 14; a signed issuer/program-manager agreement (business, not engineering, prerequisite).
- Exit criteria: sandbox card issuance + one successful authorization/settlement cycle.
- Risk: high (business + regulatory + technical).

**Stage 16 — Notifications/observability**

- Goal: production-grade push notifications and observability (§21) across everything shipped so far.
- Scope: notification service, crash/monitoring integration, privacy-scrubbing verified.
- Dependencies: can start in parallel with Stages 9–15 once Stage 12's backend exists.
- Exit criteria: no sensitive data present in any crash report/log, verified by audit.
- Risk: low–medium.

**Stage 17 — Production hardening**

- Goal: work through the full §18 security checklist's "later hardening" column, plus §19's full testing strategy.
- Scope: security/testing work across the whole app, not a new feature.
- Dependencies: all functional stages that will ship in the initial release.
- Exit criteria: independent security audit passed; test coverage meets an agreed bar; physical-device QA complete on both platforms.
- Risk: medium (execution risk, not novel technical risk).

**Stage 18 — Release/compliance readiness**

- Goal: final go-live gate.
- Scope: store submission (§20), final legal/compliance sign-off (§16), production EAS configuration (`eas.json`, bundle identifiers).
- Dependencies: everything above that is in scope for the initial release.
- Exit criteria: see §27.
- Risk: medium (process/coordination risk).

---

## 23. MVP vs Production Product

**A. Current Prototype** _(what exists today)_

- Fully-designed four-screen UI.
- Live market prices; mock quantities/history.
- No wallet, no keys, no chain connectivity, no backend.
- True today, verified against the repository.

**B. Functional Non-Custodial Wallet MVP** _(end of Stage 9)_

- Real on-device wallet creation/import (Stage 5).
- Real balances for BTC + ETH/USDC/USDT on Ethereum (Stage 6).
- Real Receive and Send, with local signing (Stages 7–8).
- Real transaction history (Stage 9).
- No swap, no fiat, no card yet — genuinely complete as a _wallet_, deliberately incomplete as a full product.

**C. Production Swiss Wallet** _(end of Stage 18)_

- Everything in B, plus real Swap (Stage 11), real CHF fiat on/off-ramp with completed compliance review (Stages 13–14), production hardening and independent security audit (Stage 17), and store release (Stage 18).
- Card (Stage 15) is a distinct, explicitly optional/later milestone even within "production" — it depends on a business relationship this document cannot create.

---

## 24. External Provider Categories _(categories only — no vendor selection implied)_

- RPC / node infrastructure
- Blockchain indexing / transaction history
- Market data (current: CoinGecko, public tier — example only, not a final production selection)
- Swap / liquidity aggregation
- KYC identity verification
- AML / blockchain analytics & sanctions screening
- Travel Rule compliance
- Fiat on/off-ramp
- Banking / payment rails (CHF-focused)
- Card issuing / program management
- Push notifications
- Observability / crash reporting / monitoring

Any vendor named anywhere in this document (e.g., CoinGecko) is the one _currently integrated in code_ for that category, not a recommendation for the categories that have no integration yet.

---

## 25. Critical Decisions Still Required

- **Exact V1 networks:** this document recommends Bitcoin + Ethereum mainnet (§10) as the minimal set covering all four current assets — needs explicit product sign-off before Stage 6.
- **Recovery model:** mnemonic-only vs. mnemonic + optional encrypted cloud backup (§9) — affects both UX and the Stage 5 threat model.
- **Account model:** whether the backend ever needs a concept of a "user account" at all (e.g., for push notifications or fiat KYC linkage) versus staying fully anonymous/device-bound as long as possible.
- **Wallet derivation strategy:** single seed with multi-chain HD derivation (recommended) vs. per-chain independent wallets — affects Stage 4 design directly.
- **Backend account requirement:** does Stage 12's backend need any user identity at all before Stage 13 (KYC) forces the question anyway?
- **Swap model:** single integrated provider vs. multi-provider aggregation from day one (§13) — affects Stage 11 scope and cost.
- **Fiat provider model:** single CHF-focused provider vs. multi-provider from the start (§14).
- **Compliance perimeter:** exact boundary of what requires KYC (crypto-to-crypto swap? only fiat? — needs the qualified legal review flagged in §16, not an engineering guess).
- **Card strategy:** whether Card (§15) is in scope for V1 production at all, or a distinct post-launch initiative — recommend treating it as the latter given its dependency chain.

---

## 26. Architecture Decision Records Required Before Implementation

The decisions below are high-risk enough (security-critical, expensive to reverse, or both) that each must be captured as a discrete, reviewed Architecture Decision Record **before** its dependent implementation stage begins — not decided implicitly while writing code. This list is a minimum, not a ceiling.

| ADR | Decision | Must be resolved before |
|---|---|---|
| ADR-001 | V1 networks (this document recommends Bitcoin + Ethereum mainnet, §10) | Stage 6 |
| ADR-002 | Wallet-core implementation runtime/language — audited JS/TS vs. native Swift/Kotlin vs. shared native core (§9) | Stage 4 |
| ADR-003 | Derivation paths / account model — single seed with multi-chain HD derivation vs. per-chain wallets (§25) | Stage 4 |
| ADR-004 | Recovery model — baseline BIP-39-only, plus the "reveal recovery phrase" policy, plus whether/how cloud or social recovery is ever added (§9) | Stage 5 |
| ADR-005 | Secure-storage model — which native storage library, and verified hardware-backing semantics per platform (§9) | Stage 5 |
| ADR-006 | RPC/indexer strategy — provider selection and failover approach per chain (§10) | Stage 6 |

Each ADR should record: the decision, the alternatives considered, the security/product rationale, and who approved it. ADRs are inputs to the roadmap stages in §22, not a replacement for the exit criteria already defined there.

---

## 27. Definition of Done — Production

A concrete checklist for "product complete," engineering scope only (regulatory approval is a separate, non-engineering-only process — see the note at the end):

- [ ] Wallet-core module has full deterministic test-vector coverage and passed independent security audit.
- [ ] Seed/private-key material verified (by audit) to never leave the device unencrypted, never appear in logs/crash reports/analytics.
- [ ] Biometric + passcode fallback gating verified on physical iOS and Android devices.
- [ ] Real balances, receive, send, and transaction history working end-to-end on mainnet for the committed V1 network set.
- [ ] Swap working end-to-end with at least one integrated provider, with accurate quote-vs-executed reconciliation.
- [ ] Fiat on/off-ramp working end-to-end with a licensed provider, CHF-first, with that provider's KYC flow verified.
- [ ] Full §18 security checklist (MVP + later-hardening columns) closed out.
- [ ] Full §19 testing strategy in place and passing in CI, including physical-device QA.
- [ ] `eas.json`, `ios.bundleIdentifier`, `android.package` configured; production EAS build/submit pipeline verified.
- [ ] Observability (§21) live, with an audit confirming zero sensitive data in any collected telemetry.
- [ ] All dead/demo code identified in §7 removed or explicitly, permanently justified.
- [ ] Card (§15), if included in this release, has a completed issuer/program-manager relationship and passed its own sandbox-to-production cycle.

**This checklist defines engineering completeness only.** Final Swiss regulatory clearance (§16) — including any FINMA licensing determination — depends on the exact business model, custody model, money flows, and providers ultimately chosen, and requires sign-off from qualified Swiss legal/compliance counsel. No amount of engineering work by itself satisfies that requirement.
