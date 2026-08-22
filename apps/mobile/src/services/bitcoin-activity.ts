import type { WalletActivityItem } from './wallet-activity';

type BitcoinActivityProvider = {
  readonly id: string;
  readonly apiBase: string;
};

const PROVIDERS: readonly BitcoinActivityProvider[] = [
  {
    id: 'mempool.space',
    apiBase: 'https://mempool.space/api',
  },
  {
    id: 'blockstream.info',
    apiBase: 'https://blockstream.info/api',
  },
];

type EsploraVin = {
  readonly prevout?: {
    readonly scriptpubkey_address?: string;
    readonly value?: number;
  } | null;
};

type EsploraVout = {
  readonly scriptpubkey_address?: string;
  readonly value?: number;
};

type EsploraStatus = {
  readonly confirmed?: boolean;
  readonly block_time?: number;
};

type EsploraTransaction = {
  readonly txid?: string;
  readonly fee?: number;
  readonly vin?: EsploraVin[];
  readonly vout?: EsploraVout[];
  readonly status?: EsploraStatus;
};

function assertTxid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-fA-F]{64}$/.test(value)
  ) {
    throw new Error('Invalid Bitcoin transaction id.');
  }

  return value.toLowerCase();
}

function formatSats(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const fraction = (sats % 100_000_000n)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');

  return fraction
    ? `${whole}.${fraction}`
    : whole.toString();
}

function parseTransaction(
  tx: EsploraTransaction,
  walletAddress: string,
): WalletActivityItem | null {
  const txid = assertTxid(tx.txid);

  const vin = Array.isArray(tx.vin) ? tx.vin : [];
  const vout = Array.isArray(tx.vout) ? tx.vout : [];

  let incoming = 0n;
  let outgoing = 0n;

  for (const input of vin) {
    const prevout = input.prevout;

    if (
      prevout &&
      prevout.scriptpubkey_address === walletAddress &&
      Number.isSafeInteger(prevout.value) &&
      (prevout.value ?? 0) >= 0
    ) {
      outgoing += BigInt(prevout.value!);
    }
  }

  for (const output of vout) {
    if (
      output.scriptpubkey_address === walletAddress &&
      Number.isSafeInteger(output.value) &&
      (output.value ?? 0) >= 0
    ) {
      incoming += BigInt(output.value!);
    }
  }

  if (incoming === 0n && outgoing === 0n) {
    return null;
  }

  const confirmed = tx.status?.confirmed === true;

  const blockTime =
    confirmed &&
    Number.isSafeInteger(tx.status?.block_time)
      ? tx.status!.block_time!
      : null;

  const feeSats =
    Number.isSafeInteger(tx.fee) &&
    (tx.fee ?? 0) >= 0
      ? BigInt(tx.fee!)
      : null;

  const net = incoming - outgoing;

  const direction =
    net >= 0n ? 'received' : 'sent';

  let amount: bigint;

  if (direction === 'received') {
    amount = net;
  } else {
    // wallet inputs - wallet outputs contains both:
    //
    //   value sent externally + miner fee
    //
    // Activity amount must represent the asset value sent to external
    // recipients. Network fee is displayed separately.
    const totalDebit = outgoing - incoming;

    amount =
      feeSats !== null
        ? totalDebit - feeSats
        : totalDebit;

    if (amount < 0n) {
      throw new Error(
        'Bitcoin transaction fee exceeds wallet debit.',
      );
    }
  }

  // A pure self-transfer/consolidation can have zero externally-sent value
  // after subtracting the miner fee. It is not useful as a sent/received
  // asset movement in the current V1 Activity model.
  if (amount === 0n) {
    return null;
  }

  return {
    id: `btc:${txid}`,
    asset: 'BTC',
    network: 'bitcoin-mainnet',
    direction,
    status: confirmed
      ? 'confirmed'
      : 'pending',
    amount: formatSats(amount),
    timestampMs:
      blockTime === null
        ? null
        : blockTime * 1000,
    transactionId: txid,
    counterpartyAddress: null,
    fee:
      direction === 'sent' &&
      feeSats !== null
        ? formatSats(feeSats)
        : null,
  };
}

async function fetchFromProvider(
  provider: BitcoinActivityProvider,
  walletAddress: string,
): Promise<WalletActivityItem[]> {
  const url =
    `${provider.apiBase}/address/` +
    `${encodeURIComponent(walletAddress)}/txs`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Bitcoin activity provider failed with status ${response.status}.`,
    );
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error(
      'Bitcoin activity provider returned an invalid payload.',
    );
  }

  return payload
    .map((item) =>
      parseTransaction(
        item as EsploraTransaction,
        walletAddress,
      ),
    )
    .filter(
      (
        item,
      ): item is WalletActivityItem =>
        item !== null,
    )
    .sort((a, b) => {
      const left = a.timestampMs ?? Number.MAX_SAFE_INTEGER;
      const right = b.timestampMs ?? Number.MAX_SAFE_INTEGER;
      return right - left;
    });
}

/**
 * PUBLIC-SAFE address history lookup.
 *
 * Reads public Bitcoin mainnet address history only.
 * No wallet secret, signing, authentication or broadcast occurs here.
 */
export async function fetchBitcoinActivity(
  walletAddress: string,
): Promise<WalletActivityItem[]> {
  let lastError: unknown;

  for (const provider of PROVIDERS) {
    try {
      return await fetchFromProvider(
        provider,
        walletAddress,
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : 'Unable to load Bitcoin activity.',
  );
}
