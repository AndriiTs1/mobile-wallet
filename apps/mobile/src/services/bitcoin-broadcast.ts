import {
  attemptProvidersInOrder,
  fetchWithTimeout,
  type ProviderAttempt,
} from './provider-failover';

export type BitcoinBroadcastResult = {
  readonly txid: string;
  readonly providerId: string;
  readonly broadcastAt: number;
};

type BitcoinBroadcastProvider = {
  readonly id: string;
  readonly url: string;
};

const BITCOIN_BROADCAST_PROVIDERS: readonly BitcoinBroadcastProvider[] = [
  {
    id: 'mempool.space',
    url: 'https://mempool.space/api/tx',
  },
  {
    id: 'blockstream.info',
    url: 'https://blockstream.info/api/tx',
  },
];

function normalizeSignedTransactionHex(
  signedTxHex: string,
): string {
  const trimmed = signedTxHex.trim();

  const withoutPrefix =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? trimmed.slice(2)
      : trimmed;

  if (
    withoutPrefix.length === 0 ||
    withoutPrefix.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(withoutPrefix)
  ) {
    throw new Error(
      'Signed Bitcoin transaction must be valid hexadecimal.',
    );
  }

  return withoutPrefix.toLowerCase();
}

function normalizeBitcoinTxid(value: string): string {
  const txid = value.trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(txid)) {
    throw new Error(
      'Bitcoin broadcast provider returned an invalid transaction id.',
    );
  }

  return txid;
}

async function broadcastWithProvider(
  provider: BitcoinBroadcastProvider,
  signedTxHex: string,
): Promise<string> {
  let response: Response;

  try {
    response = await fetchWithTimeout(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: signedTxHex,
    });
  } catch (error) {
    throw new Error(
      `Failed to reach Bitcoin broadcast provider: ${
        error instanceof Error
          ? error.message
          : 'unknown transport failure'
      }`,
    );
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Bitcoin broadcast provider rejected transaction with status ${response.status}`,
    );
  }

  return normalizeBitcoinTxid(responseText);
}

/**
 * PUBLIC-SAFE NETWORK OPERATION.
 *
 * Broadcasts an ALREADY-SIGNED Bitcoin mainnet transaction.
 *
 * Security boundary:
 * - receives signed public transaction bytes only
 * - no entropy
 * - no mnemonic
 * - no seed
 * - no xpriv/private key
 * - no signing
 * - no biometric authorization
 *
 * Transaction signing must have completed through the native/Rust signing
 * boundary before this function is called.
 */
export async function broadcastBitcoinMainnetTransaction(
  signedTxHexInput: string,
): Promise<BitcoinBroadcastResult> {
  const signedTxHex =
    normalizeSignedTransactionHex(signedTxHexInput);

  const attempts: ProviderAttempt<string>[] =
    BITCOIN_BROADCAST_PROVIDERS.map((provider) => ({
      id: provider.id,
      run: () =>
        broadcastWithProvider(
          provider,
          signedTxHex,
        ),
    }));

  const { result, providerId } =
    await attemptProvidersInOrder(attempts);

  return {
    txid: result,
    providerId,
    broadcastAt: Date.now(),
  };
}
