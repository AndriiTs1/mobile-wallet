/**
 * V1-supported chain identifiers only. Deliberately a flat string-literal
 * union, not a generic multi-chain abstraction — Mobile Wallet supports
 * exactly these two networks (PRODUCT_ARCHITECTURE.md §10, ADR-002/003).
 * The "family:network" shape makes chain identity self-describing and hard
 * to confuse with an asset symbol (unlike a bare `'bitcoin' | 'ethereum'`).
 */
export type ChainId = 'bitcoin:mainnet' | 'ethereum:mainnet';

export const SUPPORTED_CHAIN_IDS: readonly ChainId[] = ['bitcoin:mainnet', 'ethereum:mainnet'];
