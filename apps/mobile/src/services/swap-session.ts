import type { SwapQuote } from 'chain-domain';

/**
 * Ephemeral in-memory transfer of one validated firm SwapQuote from the
 * Swap screen to the future Review Swap screen.
 *
 * Deliberately not persisted and not placed in route params:
 * a firm quote can become stale and must never survive process death or
 * be replayed from a deep link after the app restarts.
 */
let pendingSwapQuote: SwapQuote | null = null;

/** Called immediately before navigating to Review Swap. */
export function setPendingSwapQuote(quote: SwapQuote): void {
  pendingSwapQuote = quote;
}

/**
 * Called by Review Swap exactly once on mount.
 * Reading also clears the snapshot so the same firm quote cannot be
 * consumed twice.
 */
export function consumePendingSwapQuote(): SwapQuote | null {
  const quote = pendingSwapQuote;
  pendingSwapQuote = null;
  return quote;
}
