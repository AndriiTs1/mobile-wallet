// Public entry point. Import only from the package root (`chain-domain`) —
// the `src/*` module paths are internal implementation detail, not a
// supported import surface.

export type { ChainId } from './chain-id';
export { SUPPORTED_CHAIN_IDS } from './chain-id';

export type { AssetId, AssetSymbol, AssetMetadata } from './asset-id';
export { SUPPORTED_ASSETS } from './asset-id';

export type { EthereumAddress } from './ethereum-address';
export { toEthereumAddress } from './ethereum-address';

export type { EthereumTxHash } from './ethereum-tx-hash';
export { toEthereumTxHash } from './ethereum-tx-hash';

export type { AtomicAmount, DecimalString } from './amount';
export { toAtomicAmount, toDecimalString } from './amount';

export { parseEthDecimalStringToWei } from './ethereum-amount';

export type { UnixTimestampMs } from './timestamp';

export type { BalanceSnapshot } from './balance-snapshot';

export type { FeeQuote, BitcoinFeeQuote, EthereumFeeQuote } from './fee-quote';

export type { BitcoinUtxo } from './bitcoin-utxo';
