import type { BitcoinV1TransactionIntent } from '@/services/wallet-core-bridge';

import {
  signBitcoinTransactionV1,
  type BitcoinV1SignedTransaction,
} from '@/services/wallet-core-bridge';

import {
  broadcastBitcoinMainnetTransaction,
  type BitcoinBroadcastResult,
} from './bitcoin-broadcast';

export type BitcoinSendExecutionResult = {
  readonly signed: BitcoinV1SignedTransaction;
  readonly broadcast: BitcoinBroadcastResult;
};

function normalizeTxid(txid: string): string {
  const normalized = txid.trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Bitcoin transaction id is invalid.');
  }

  return normalized;
}

/**
 * Executes the sensitive Bitcoin send pipeline in strict order:
 *
 * 1. Native signBitcoinTransactionV1()
 *    - fresh device-owner authentication
 *    - secure-storage read
 *    - Rust-only BIP-84 signing
 *
 * 2. Broadcast the already-signed public transaction.
 *
 * 3. Verify provider-returned txid exactly matches the txid Rust computed
 *    locally from the signed transaction.
 *
 * No secret material enters this module.
 */
export async function executeBitcoinV1Send(
  intent: BitcoinV1TransactionIntent,
): Promise<BitcoinSendExecutionResult> {
  const signed = await signBitcoinTransactionV1(intent);

  const expectedTxid = normalizeTxid(signed.txid);

  const broadcast =
    await broadcastBitcoinMainnetTransaction(
      signed.signedTxHex,
    );

  const providerTxid = normalizeTxid(broadcast.txid);

  if (providerTxid !== expectedTxid) {
    throw new Error(
      'Bitcoin broadcast transaction id did not match the locally signed transaction.',
    );
  }

  return {
    signed: {
      ...signed,
      txid: expectedTxid,
    },
    broadcast: {
      ...broadcast,
      txid: providerTxid,
    },
  };
}
