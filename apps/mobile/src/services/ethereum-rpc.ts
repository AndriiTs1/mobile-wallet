import {
  toAtomicAmount,
  type AtomicAmount,
  type BalanceSnapshot,
  type EthereumAddress,
} from 'chain-domain';

/**
 * Public, keyless Ethereum mainnet JSON-RPC endpoint (PublicNode). Chosen
 * for this Stage 4C.2 read-only proof specifically because it requires no
 * API key/signup — per Stage 4C research, an embedded provider identifier
 * is a real open decision requiring product/security sign-off before real
 * usage; this default is provisional-for-proof only, not an ADR-006
 * provider selection. Cloudflare's public gateway (cloudflare-eth.com) was
 * tried first and is currently returning internal errors on live requests;
 * PublicNode was verified working via a live call during this stage.
 */
const DEFAULT_ETHEREUM_MAINNET_RPC_URL = 'https://ethereum-rpc.publicnode.com';

const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;

async function callEthGetBalance(rpcUrl: string, address: EthereumAddress): Promise<string> {
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
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

/**
 * Fetches the native ETH balance for a public Ethereum mainnet address via
 * direct-device JSON-RPC (Stage 4C: direct-device access for core wallet
 * reads). Read-only — no key material is involved, and none is required:
 * `eth_getBalance` accepts any address as a public query parameter.
 */
export async function fetchEthMainnetBalance(
  address: EthereumAddress,
  rpcUrl: string = DEFAULT_ETHEREUM_MAINNET_RPC_URL,
): Promise<BalanceSnapshot> {
  const hexWei = await callEthGetBalance(rpcUrl, address);
  return {
    assetId: { kind: 'native', chainId: 'ethereum:mainnet' },
    amount: hexWeiToAtomicAmount(hexWei),
    asOf: Date.now(),
  };
}
