export type WalletActivityAsset =
  | 'BTC'
  | 'ETH'
  | 'USDC'
  | 'USDT'
  | 'XAUT';

export type WalletActivityNetwork =
  | 'bitcoin-mainnet'
  | 'ethereum-mainnet';

export type WalletActivityDirection =
  | 'sent'
  | 'received';

export type WalletActivityStatus =
  | 'pending'
  | 'confirmed'
  | 'failed';

export type WalletActivityItem = {
  readonly id: string;
  readonly asset: WalletActivityAsset;
  readonly network: WalletActivityNetwork;
  readonly direction: WalletActivityDirection;
  readonly status: WalletActivityStatus;

  /**
   * Human-readable decimal asset amount.
   * Public blockchain data only.
   */
  readonly amount: string;

  /**
   * Unix timestamp in milliseconds when known.
   * Pending transactions may not yet have a block timestamp.
   */
  readonly timestampMs: number | null;

  /**
   * Public blockchain transaction identifier.
   * Ethereum: 0x-prefixed transaction hash.
   * Bitcoin: txid.
   */
  readonly transactionId: string;

  readonly counterpartyAddress: string | null;

  /**
   * Human-readable network fee when known.
   * Null when unavailable.
   */
  readonly fee: string | null;
};
