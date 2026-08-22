import { toEthereumAddress, type EthereumAddress } from './ethereum-address';

/**
 * Asset identity only — never metadata. Per ADR-003 §3, an asset's real
 * identity for signing/validation purposes is chainId (+ contractAddress
 * for ERC-20), never a symbol or name. Native assets need no
 * contractAddress: each V1 chain has exactly one native asset, so
 * `kind + chainId` alone is unambiguous.
 */
export type AssetId =
  | { readonly kind: 'native'; readonly chainId: 'bitcoin:mainnet' }
  | { readonly kind: 'native'; readonly chainId: 'ethereum:mainnet' }
  | { readonly kind: 'erc20'; readonly chainId: 'ethereum:mainnet'; readonly contractAddress: EthereumAddress };

export type AssetSymbol = 'BTC' | 'ETH' | 'USDC' | 'USDT' | 'XAUT';

/**
 * Display/amount metadata associated with an `AssetId` — kept structurally
 * separate from identity per ADR-003 §3 ("decimals are security-relevant
 * display/amount metadata, not cosmetic formatting"; "symbol and name are
 * metadata only and must never be used as security identifiers").
 */
export type AssetMetadata = {
  readonly assetId: AssetId;
  readonly symbol: AssetSymbol;
  readonly name: string;
  readonly decimals: number;
};

/**
 * Curated, static V1 asset registry (ADR-003 §3) — not dynamic, not
 * provider-sourced, not a general token-discovery mechanism.
 *
 * VERIFIED: USDC contract address and its 6-decimal convention confirmed
 * against Circle's own developer documentation
 * (developers.circle.com/stablecoins/usdc-contract-addresses). USDT
 * contract address confirmed against Tether's own site
 * (tether.to/en/supported-protocols/); its 6-decimal convention confirmed
 * via the contract's on-chain constructor arguments (decimals = 6, as
 * deployed and publicly verifiable on Etherscan). BTC's 8 and ETH's 18 are
 * fixed protocol-level unit definitions (satoshi/wei), not per-contract
 * values subject to third-party-list ambiguity.
 */
export const SUPPORTED_ASSETS: readonly AssetMetadata[] = [
  { assetId: { kind: 'native', chainId: 'bitcoin:mainnet' }, symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
  { assetId: { kind: 'native', chainId: 'ethereum:mainnet' }, symbol: 'ETH', name: 'Ether', decimals: 18 },
  {
    assetId: {
      kind: 'erc20',
      chainId: 'ethereum:mainnet',
      contractAddress: toEthereumAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    },
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  {
    assetId: {
      kind: 'erc20',
      chainId: 'ethereum:mainnet',
      contractAddress: toEthereumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    },
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
  {
    assetId: {
      kind: 'erc20',
      chainId: 'ethereum:mainnet',
      contractAddress: toEthereumAddress('0x68749665FF8D2d112Fa859AA293F07A622782F38'),
    },
    symbol: 'XAUT',
    name: 'Tether Gold',
    decimals: 6,
  },
];
