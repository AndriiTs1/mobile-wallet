import { SUPPORTED_ASSETS } from '@swiss-wallet/chain-domain';

import type {
  WalletActivityAsset,
  WalletActivityItem,
} from './wallet-activity';

const BLOCKSCOUT_BASE =
  'https://eth.blockscout.com/api/v2';

type BlockscoutAddressRef = {
  readonly hash?: string;
};

type BlockscoutFee = {
  readonly value?: string;
};

type BlockscoutTransaction = {
  readonly hash?: string;
  readonly from?: BlockscoutAddressRef;
  readonly to?: BlockscoutAddressRef | null;
  readonly value?: string;
  readonly timestamp?: string | null;
  readonly status?: string;
  readonly fee?: BlockscoutFee | null;
};

type BlockscoutToken = {
  readonly address_hash?: string;
  readonly symbol?: string;
  readonly decimals?: string | number;
};

type BlockscoutTokenTransfer = {
  readonly transaction_hash?: string;
  readonly log_index?: number;
  readonly from?: BlockscoutAddressRef;
  readonly to?: BlockscoutAddressRef | null;
  readonly total?: {
    readonly value?: string;
    readonly decimals?: string | number;
  };
  readonly token?: BlockscoutToken;
  readonly timestamp?: string | null;
};

type BlockscoutList<T> = {
  readonly items?: T[];
};

type SupportedErc20 = {
  readonly symbol: Extract<
    WalletActivityAsset,
    'USDC' | 'USDT' | 'XAUT'
  >;
  readonly contractAddress: string;
  readonly decimals: number;
};

const ERC20_ASSETS: readonly SupportedErc20[] =
  SUPPORTED_ASSETS.flatMap((asset) => {
    if (
      asset.assetId.kind !== 'erc20' ||
      !(
        asset.symbol === 'USDC' ||
        asset.symbol === 'USDT' ||
        asset.symbol === 'XAUT'
      )
    ) {
      return [];
    }

    return [
      {
        symbol: asset.symbol,
        contractAddress:
          asset.assetId.contractAddress.toLowerCase(),
        decimals: asset.decimals,
      },
    ];
  });

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function assertEthereumHash(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(value)
  ) {
    throw new Error(
      'Invalid Ethereum transaction hash.',
    );
  }

  return value.toLowerCase();
}

function parseTimestamp(
  value: unknown,
): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function formatAtomic(
  value: bigint,
  decimals: number,
): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');

  return fraction
    ? `${whole}.${fraction}`
    : whole.toString();
}

function parseUnsignedDecimal(
  value: unknown,
): bigint | null {
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value)
  ) {
    return null;
  }

  return BigInt(value);
}

function parseNativeTransaction(
  tx: BlockscoutTransaction,
  walletAddress: string,
): WalletActivityItem | null {
  const wallet = normalizeAddress(walletAddress);

  const from =
    typeof tx.from?.hash === 'string'
      ? normalizeAddress(tx.from.hash)
      : null;

  const to =
    typeof tx.to?.hash === 'string'
      ? normalizeAddress(tx.to.hash)
      : null;

  if (from !== wallet && to !== wallet) {
    return null;
  }

  const valueWei =
    parseUnsignedDecimal(tx.value);

  if (valueWei === null || valueWei === 0n) {
    // Contract calls and ERC-20 transfers appear in the normal transaction
    // list too. They are handled separately by token-transfer history and
    // must not become fake zero-value ETH activity rows.
    return null;
  }

  const direction =
    from === wallet
      ? 'sent'
      : 'received';

  const feeWei =
    direction === 'sent'
      ? parseUnsignedDecimal(tx.fee?.value)
      : null;

  return {
    id: `eth:${assertEthereumHash(tx.hash)}`,
    asset: 'ETH',
    network: 'ethereum-mainnet',
    direction,
    status:
      tx.status === 'error'
        ? 'failed'
        : 'confirmed',
    amount: formatAtomic(valueWei, 18),
    timestampMs: parseTimestamp(tx.timestamp),
    transactionId: assertEthereumHash(tx.hash),
    counterpartyAddress:
      direction === 'sent'
        ? to
        : from,
    fee:
      feeWei === null
        ? null
        : formatAtomic(feeWei, 18),
  };
}

function resolveSupportedToken(
  transfer: BlockscoutTokenTransfer,
): SupportedErc20 | null {
  const contract =
    typeof transfer.token?.address_hash === 'string'
      ? normalizeAddress(
          transfer.token.address_hash,
        )
      : null;

  if (!contract) {
    return null;
  }

  return (
    ERC20_ASSETS.find(
      (asset) =>
        asset.contractAddress === contract,
    ) ?? null
  );
}

function parseTokenTransfer(
  transfer: BlockscoutTokenTransfer,
  walletAddress: string,
): WalletActivityItem | null {
  const token =
    resolveSupportedToken(transfer);

  if (!token) {
    // Ignore every token outside SwissWallet's curated V1 registry.
    return null;
  }

  const wallet = normalizeAddress(walletAddress);

  const from =
    typeof transfer.from?.hash === 'string'
      ? normalizeAddress(transfer.from.hash)
      : null;

  const to =
    typeof transfer.to?.hash === 'string'
      ? normalizeAddress(transfer.to.hash)
      : null;

  if (from !== wallet && to !== wallet) {
    return null;
  }

  const rawValue =
    parseUnsignedDecimal(
      transfer.total?.value,
    );

  if (rawValue === null || rawValue === 0n) {
    return null;
  }

  const direction =
    from === wallet
      ? 'sent'
      : 'received';

  const transactionId =
    assertEthereumHash(
      transfer.transaction_hash,
    );

  const logIndex =
    Number.isSafeInteger(transfer.log_index) &&
    (transfer.log_index ?? -1) >= 0
      ? transfer.log_index
      : null;

  return {
    id:
      `erc20:${token.symbol}:` +
      `${transactionId}:` +
      `${logIndex ?? 'unknown'}:` +
      `${from ?? 'unknown'}:` +
      `${to ?? 'unknown'}:` +
      `${rawValue.toString()}`,
    asset: token.symbol,
    network: 'ethereum-mainnet',
    direction,
    status: 'confirmed',
    amount: formatAtomic(
      rawValue,
      token.decimals,
    ),
    timestampMs:
      parseTimestamp(transfer.timestamp),
    transactionId,
    counterpartyAddress:
      direction === 'sent'
        ? to
        : from,

    // ERC-20 gas is paid in ETH, not in the token.
    // Activity keeps token fee null rather than pretending the token itself
    // paid a fee. ETH network fee can be shown in transaction details later.
    fee: null,
  };
}

async function fetchBlockscoutList<T>(
  path: string,
): Promise<T[]> {
  const response = await fetch(
    `${BLOCKSCOUT_BASE}${path}`,
  );

  if (!response.ok) {
    throw new Error(
      `Ethereum activity provider failed with status ${response.status}.`,
    );
  }

  const payload: unknown =
    await response.json();

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !Array.isArray(
      (payload as BlockscoutList<T>).items,
    )
  ) {
    throw new Error(
      'Ethereum activity provider returned an invalid payload.',
    );
  }

  return (
    payload as BlockscoutList<T>
  ).items!;
}

/**
 * PUBLIC-SAFE Ethereum Mainnet activity lookup.
 *
 * Uses public address/indexer data only.
 * No wallet secret, signing, authentication, approval or broadcast occurs.
 *
 * V1 intentionally returns the provider's first page only. Pagination can
 * be added independently without changing the WalletActivityItem domain.
 */
export async function fetchEthereumActivity(
  walletAddress: string,
): Promise<WalletActivityItem[]> {
  const encoded =
    encodeURIComponent(walletAddress);

  const [
    transactions,
    tokenTransfers,
  ] = await Promise.all([
    fetchBlockscoutList<BlockscoutTransaction>(
      `/addresses/${encoded}/transactions`,
    ),
    fetchBlockscoutList<BlockscoutTokenTransfer>(
      `/addresses/${encoded}/token-transfers`,
    ),
  ]);

  const nativeItems =
    transactions
      .map((tx) =>
        parseNativeTransaction(
          tx,
          walletAddress,
        ),
      )
      .filter(
        (
          item,
        ): item is WalletActivityItem =>
          item !== null,
      );

  const tokenItems =
    tokenTransfers
      .map((transfer) =>
        parseTokenTransfer(
          transfer,
          walletAddress,
        ),
      )
      .filter(
        (
          item,
        ): item is WalletActivityItem =>
          item !== null,
      );

  return [
    ...nativeItems,
    ...tokenItems,
  ].sort((a, b) => {
    const left =
      a.timestampMs ??
      Number.MAX_SAFE_INTEGER;
    const right =
      b.timestampMs ??
      Number.MAX_SAFE_INTEGER;

    return right - left;
  });
}
