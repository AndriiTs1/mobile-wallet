import { getBitcoinAddressV1, getEthereumAddressV1 } from './wallet-core-bridge';
import { fetchBitcoinActivity } from './bitcoin-activity';
import { fetchEthereumActivity } from './ethereum-activity';
import type { WalletActivityItem } from './wallet-activity';

export type WalletActivityNetworkState =
  | 'available'
  | 'unavailable';

export type WalletActivitySnapshot = {
  readonly items: readonly WalletActivityItem[];
  readonly fetchedAt: number;

  readonly bitcoin: WalletActivityNetworkState;
  readonly ethereum: WalletActivityNetworkState;
};

function dedupeActivity(
  items: readonly WalletActivityItem[],
): WalletActivityItem[] {
  const byId = new Map<string, WalletActivityItem>();

  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()];
}

function sortActivity(
  items: readonly WalletActivityItem[],
): WalletActivityItem[] {
  return [...items].sort((a, b) => {
    if (
      a.timestampMs === null &&
      b.timestampMs !== null
    ) {
      return -1;
    }

    if (
      a.timestampMs !== null &&
      b.timestampMs === null
    ) {
      return 1;
    }

    if (
      a.timestampMs !== null &&
      b.timestampMs !== null &&
      a.timestampMs !== b.timestampMs
    ) {
      return b.timestampMs - a.timestampMs;
    }

    return a.id.localeCompare(b.id);
  });
}

/**
 * PUBLIC-SAFE multi-chain activity aggregator.
 *
 * Each public network history lookup is isolated. A temporary failure of one
 * provider must not hide successfully loaded activity from the other network.
 *
 * No signing, broadcast, authentication or secret material enters this module.
 */
export async function fetchWalletActivity():
  Promise<WalletActivitySnapshot> {
  const bitcoinAddress = getBitcoinAddressV1();
  const ethereumAddress = getEthereumAddressV1();

  const [bitcoinResult, ethereumResult] =
    await Promise.allSettled([
      fetchBitcoinActivity(bitcoinAddress),
      fetchEthereumActivity(ethereumAddress),
    ]);

  const bitcoinItems =
    bitcoinResult.status === 'fulfilled'
      ? bitcoinResult.value
      : [];

  const ethereumItems =
    ethereumResult.status === 'fulfilled'
      ? ethereumResult.value
      : [];

  const items = sortActivity(
    dedupeActivity([
      ...bitcoinItems,
      ...ethereumItems,
    ]),
  );

  return {
    items,
    fetchedAt: Date.now(),

    bitcoin:
      bitcoinResult.status === 'fulfilled'
        ? 'available'
        : 'unavailable',

    ethereum:
      ethereumResult.status === 'fulfilled'
        ? 'available'
        : 'unavailable',
  };
}
