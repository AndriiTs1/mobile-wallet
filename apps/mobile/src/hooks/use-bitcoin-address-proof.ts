import { useCallback, useEffect, useState } from 'react';

import { fetchBitcoinMainnetAddressProof, type BitcoinAddressProof } from '@/services/bitcoin-rpc';

export type BitcoinAddressProofState = {
  proof: BitcoinAddressProof | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

/**
 * Fetches a single Bitcoin mainnet address's read-only proof state once on
 * mount, with manual refresh — no polling. Mirrors the shape established
 * by `useEthereumBalanceProof` in Stage 4C.2. Not generalized into a
 * shared multi-chain provider yet — two proofs is not enough evidence to
 * safely design that abstraction. Never fabricates data on failure —
 * `proof` simply stays whatever it last successfully was.
 */
export function useBitcoinAddressProof(address: string): BitcoinAddressProofState {
  const [proof, setProof] = useState<BitcoinAddressProof | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await fetchBitcoinMainnetAddressProof(address);
      setProof(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Bitcoin address proof'));
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  return { proof, isLoading, error, refresh: load };
}
