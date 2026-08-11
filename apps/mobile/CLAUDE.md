@AGENTS.md

Mobile-specific steering document. Root `CLAUDE.md` is authoritative — this file adds mobile constraints and must not weaken it.

## Mobile scope

- `apps/mobile` is the React Native / Expo application. Do not hard-code Expo/React Native/React/TypeScript version numbers here — for any compatibility-sensitive work, verify actual versions from `apps/mobile/package.json` first.
- Expo Router is used; routes live in `src/app`, with `src/components`, `src/hooks`, `src/constants` alongside.
- No `ios/` or `android/` native directories exist — this is currently a managed Expo workflow. Do not assume prebuild/native directories exist unless verified.

## UI / architecture

- Keep screens (`src/app`), components (`src/components`), and hooks (`src/hooks`) clearly separated; respect existing `.web.tsx` platform-split conventions.
- Prefer existing Expo/React Native APIs before introducing dependencies.
- Do not introduce a state-management library until a concrete need exists.
- Do not introduce design-system libraries unless explicitly approved.
- Avoid web-only APIs in native code.
- Preserve Expo Router file-based routing conventions.

## Security

- Never put wallet secrets in UI state, logs, analytics, screenshots, previews, or debugging output.
- Never use `AsyncStorage` for private keys, mnemonics, or signing material.
- Treat biometric auth, secure storage, clipboard, deep links, QR payloads, and screen capture as security-sensitive areas.
- Any change touching wallet creation/import, secure storage, signing, recovery phrase handling, or biometrics requires explicit security review before implementation.

## Dependencies

- Do not add mobile/native packages without explicit approval.
- Native dependencies require additional caution because they affect Expo/dev builds and app security.
- Do not upgrade Expo/React Native independently unless explicitly requested and compatibility has been reviewed.

## Change discipline

- For mobile tasks, change only the files needed for the requested screen/feature.
- Avoid broad component rewrites.
- Avoid repository-wide formatting.
- Do not change wallet/security logic while working on unrelated UI.

## Validation

- Available scripts (`apps/mobile/package.json`): `start`, `android`, `ios`, `web`, `lint`, `reset-project`.
- No test script exists in `apps/mobile/package.json` — do not invent one; report its absence if a task calls for it.
- Prefer targeted validation first (e.g. `pnpm lint` for a lint-scoped change).
- Do not run `reset-project` (destructive) unless explicitly requested.

## Platform strategy

- iOS is the current primary development target.
- Keep Android compatibility unless a task is explicitly iOS-specific.
- Web support is secondary and should not drive architecture unless explicitly requested.

## Style of work

- Inspect before editing.
- Prefer smallest correct diff.
- Report exact files changed.
- Report validation commands and results.
- Stop after the scoped task.
