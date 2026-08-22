import type { BitcoinV1TransactionIntent } from '@/services/wallet-core-bridge';

export type PendingBitcoinSend = {
  readonly kind: 'bitcoin';
  readonly recipient: string;
  readonly amountSat: string;
  readonly feeSat: string;
  readonly totalDebitSat: string;
  readonly intent: BitcoinV1TransactionIntent;
};

let pending: PendingBitcoinSend | null = null;

/**
 * Stores exactly one immutable Bitcoin review snapshot in memory.
 *
 * PUBLIC transaction data only.
 *
 * No entropy, mnemonic, seed, private key, xpriv or authentication state
 * enters this session.
 */
export function setPendingBitcoinSend(
  next: PendingBitcoinSend,
): void {
  pending = next;
}

/**
 * One-shot consume. A review screen cannot accidentally consume the same
 * prepared Bitcoin transaction twice.
 */
export function consumePendingBitcoinSend():
  | PendingBitcoinSend
  | null {
  const current = pending;
  pending = null;
  return current;
}
