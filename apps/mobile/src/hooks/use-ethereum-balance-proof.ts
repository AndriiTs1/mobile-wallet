import { useCallback, useEffect, useState } from 'react';
import type { BalanceSnapshot, EthereumAddress } from 'chain-domain';

import { fetchEthMainnetBalance } from '@/services/ethereum-rpc';

export type EthereumBalanceProofState = {
  snapshot: BalanceSnapshot | null;
  /** Which provider (primary or fallback) actually served `snapshot` —
   * DEV-diagnostic infrastructure metadata, not chain-domain data. */
  providerId: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

/**
 * Fetches a single ETH mainnet balance for the given address once on
 * mount, with manual refresh — no polling. This is intentionally the
 * smallest state shape that proves the service/hook boundary; a shared,
 * multi-consumer provider (like `MarketDataProvider`) is not built here
 * since this stage has exactly one consumer. Never fabricates a balance on
 * failure — `snapshot` simply stays whatever it last successfully was
 * (`null` until the first success).
 */
export function useEthereumBalanceProof(address: EthereumAddress): EthereumBalanceProofState {
  const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await fetchEthMainnetBalance(address);
      setSnapshot(next.snapshot);
      setProviderId(next.providerId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Ethereum balance'));
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  return { snapshot, providerId, isLoading, error, refresh: load };
}
