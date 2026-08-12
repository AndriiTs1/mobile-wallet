# Mobile Wallet — Root Claude Code Constitution

High-priority steering document for this repository. Read before making any change.
More specific `CLAUDE.md` files in subdirectories may add constraints; they must never weaken the rules below. Read the nearest relevant `CLAUDE.md` before modifying an area.

## Project identity

- Project: Mobile Wallet — a non-custodial cryptocurrency wallet.
- pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).
- Current application: `apps/mobile` (React Native / Expo / TypeScript, Expo Router).
- `packages/` exists but is currently empty — no shared packages yet.
- No backend exists yet.
- Do not assume a backend, shared package, script, or test exists unless you have verified it in the repository. If a task references something that doesn't exist yet, say so instead of inventing it.

## Non-custodial security invariant

- Seed phrases, private keys, signing secrets, and equivalent wallet secrets must never be transmitted to a Mobile Wallet backend.
- They must never be logged, committed, or placed in analytics, crash reports, test snapshots, fixtures, screenshots, or debugging output.
- Transaction signing must remain device-side unless an explicitly reviewed architecture decision changes this.
- Never use `AsyncStorage` or other unprotected general-purpose persistence for key material.
- Key/security architecture changes require explicit approval before implementation.

## Dependency safety

- Do not add, remove, replace, or upgrade dependencies without explicit approval.
- Crypto, wallet, signing, random-number-generation, secure-storage, and native dependencies require especially careful review.
- Do not choose packages merely because they are popular.
- Existing dependency versions should remain stable unless a scoped task requires a change.

## Change discipline

- One scoped change at a time.
- Inspect relevant code before editing.
- Do not perform unrelated refactors.
- Do not perform repository-wide formatting or auto-fix operations unless explicitly requested.
- Do not alter wallet/security code as part of unrelated UI or infrastructure work.
- Preserve existing architecture unless the task explicitly changes it.
- Prefer the smallest correct diff.

## Execution workflow

For each implementation task:

1. Inspect current state.
2. State the proposed scope before editing if the change has architectural or security impact.
3. Modify only the requested scope.
4. Run only relevant validation available in the repository.
5. Report exactly what files changed.
6. Report validation commands and results.
7. Report unresolved risks or assumptions.
8. Stop.

## Git rules

- Never commit automatically.
- Never push automatically.
- Never rewrite history.
- Never discard user changes to resolve conflicts or failures.
- Commit/push only when explicitly requested.

## AI / tool safety

- Do not weaken permissions, security boundaries, or repository protections for convenience.
- Hooks, agents, skills, MCP servers, external network tools, or automation must not be introduced unless explicitly requested.
- AI review is an additional engineering check, never a replacement for human/security review of wallet cryptography and signing code.

## Monorepo scope

- This file defines repository-wide invariants.
- More specific `CLAUDE.md` files may define local instructions for individual apps/packages (see `apps/mobile/CLAUDE.md`).
- Local instructions may add constraints but must not weaken the invariants above.
