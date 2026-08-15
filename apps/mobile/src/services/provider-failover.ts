/**
 * Tiny, chain-agnostic helpers for the minimum production-shaped
 * redundancy the Stage 4C read-only proofs need: try a primary provider,
 * fall over to a secondary on failure. Deliberately not a generic
 * multi-provider framework/registry/dependency-injection container — just
 * enough to remove duplication between the Ethereum and Bitcoin services.
 */

export const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;

/**
 * `fetch` wrapped with an explicit timeout via `AbortController` — a
 * platform-supported primitive, no timeout library. A dead endpoint must
 * not hang the UI indefinitely; the timeout is surfaced as an ordinary
 * `Error` so callers treat it exactly like any other provider-attempt
 * failure (triggering fallback), not a special case.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type ProviderAttempt<T> = {
  readonly id: string;
  readonly run: () => Promise<T>;
};

export type ProviderAttemptResult<T> = {
  readonly result: T;
  readonly providerId: string;
};

/**
 * Runs each provider attempt in sequence — never in parallel — stopping at
 * the first success. Sequential-only is deliberate: normal runtime never
 * queries more than one provider unless the first fails, minimizing
 * exposure of the queried (public) address to additional third parties.
 * If every attempt fails, throws one aggregate error that retains each
 * attempt's failure reason for DEV diagnostics (no secrets exist on this
 * path to leak). A zero-value result (empty balance, no UTXOs) is a
 * successful attempt, not a failure — callers must not treat "nothing
 * found" as a reason to fail over.
 */
export async function attemptProvidersInOrder<T>(
  attempts: readonly ProviderAttempt<T>[],
): Promise<ProviderAttemptResult<T>> {
  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      return { result, providerId: attempt.id };
    } catch (error) {
      failures.push(`${attempt.id}: ${(error as Error).message}`);
    }
  }

  throw new Error(`All providers failed — ${failures.join(' | ')}`);
}
