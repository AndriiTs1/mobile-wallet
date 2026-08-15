import {
  toAtomicAmount,
  type AtomicAmount,
  type BalanceSnapshot,
  type EthereumAddress,
} from 'chain-domain';

import { attemptProvidersInOrder, fetchWithTimeout, type ProviderAttempt } from './provider-failover';

export type EthereumRpcProvider = {
  readonly id: string;
  readonly rpcUrl: string;
};

/**
 * Two independent, public, keyless Ethereum mainnet JSON-RPC endpoints.
 * Both verified live during Stage 4C.4 (`eth_getBalance` against the same
 * test address returned matching results from both). Provisional-for-proof
 * only, not an ADR-006 provider selection.
 *
 * Providers tried and rejected during Stage 4C research/4C.4: Cloudflare's
 * public gateway (cloudflare-eth.com) — consistently returns "Internal
 * error" on live requests; Ankr's public endpoint (rpc.ankr.com/eth) — now
 * requires an API key, no longer keyless; llamarpc (eth.llamarpc.com) —
 * returned HTTP 521 (origin down); 1rpc.io — initially returned a valid
 * result, but repeat verification showed it genuinely flaky (429 rate
 * limit revealing it's proxied through OnFinality, an inconsistent 301,
 * and a 503 across successive live calls within the same testing session)
 * — rejected as an unreliable fallback despite being keyless. meowrpc.com
 * also rate-limited (429) after a single successful call. `eth.drpc.org`
 * was the only candidate that returned a consistent 200 with a matching
 * result across repeated live calls.
 */
const ETHEREUM_PROVIDERS: readonly EthereumRpcProvider[] = [
  { id: 'publicnode', rpcUrl: 'https://ethereum-rpc.publicnode.com' },
  { id: 'drpc', rpcUrl: 'https://eth.drpc.org' },
];

const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;

async function callEthGetBalance(rpcUrl: string, address: EthereumAddress): Promise<string> {
  let response: Response;
  try {
    response = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });
  } catch (error) {
    throw new Error(`Failed to reach Ethereum RPC endpoint: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`Ethereum RPC request failed with status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Ethereum RPC response was not valid JSON');
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Ethereum RPC response was not a JSON object');
  }
  const body = payload as Record<string, unknown>;

  if (body.error) {
    const err = body.error as Record<string, unknown>;
    throw new Error(`Ethereum RPC returned an error: ${String(err.message ?? 'unknown error')}`);
  }

  const result = body.result;
  if (typeof result !== 'string' || !HEX_QUANTITY_PATTERN.test(result)) {
    throw new Error(
      `Ethereum RPC returned an unexpected eth_getBalance result: ${JSON.stringify(result)}`,
    );
  }

  return result;
}

/**
 * Converts a JSON-RPC hex wei quantity into an exact `AtomicAmount`. Uses
 * `BigInt` only as an internal step — the value is immediately serialized
 * back to a base-10 string; it never passes through `Number()` or any
 * floating-point representation.
 */
function hexWeiToAtomicAmount(hexWei: string): AtomicAmount {
  const wei = BigInt(hexWei);
  return toAtomicAmount(wei.toString(10));
}

export type EthereumBalanceProofResult = {
  readonly snapshot: BalanceSnapshot;
  /** Which provider actually served this result — infrastructure/
   * diagnostic metadata. Deliberately NOT part of chain-domain's
   * `BalanceSnapshot`: provider identity is not blockchain domain data. */
  readonly providerId: string;
};

/**
 * Fetches the native ETH balance for a public Ethereum mainnet address via
 * direct-device JSON-RPC (Stage 4C: direct-device access for core wallet
 * reads). Read-only — no key material is involved, and none is required:
 * `eth_getBalance` accepts any address as a public query parameter.
 *
 * Tries `providers` in order, stopping at the first success (Stage 4C.4:
 * sequential-only, never parallel, to avoid exposing the address to more
 * providers than necessary). Both providers go through this exact same
 * request/parsing/validation logic — nothing is duplicated per provider.
 */
export async function fetchEthMainnetBalance(
  address: EthereumAddress,
  providers: readonly EthereumRpcProvider[] = ETHEREUM_PROVIDERS,
): Promise<EthereumBalanceProofResult> {
  const attempts: ProviderAttempt<BalanceSnapshot>[] = providers.map((provider) => ({
    id: provider.id,
    run: async () => {
      const hexWei = await callEthGetBalance(provider.rpcUrl, address);
      return {
        assetId: { kind: 'native', chainId: 'ethereum:mainnet' },
        amount: hexWeiToAtomicAmount(hexWei),
        asOf: Date.now(),
      };
    },
  }));

  const { result, providerId } = await attemptProvidersInOrder(attempts);
  return { snapshot: result, providerId };
}
