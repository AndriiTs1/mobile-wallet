import {
  SUPPORTED_ASSETS,
  type AtomicAmount,
  type EthereumAddress,
} from 'chain-domain';

import { fetchEthMainnetErc20Balance } from './ethereum-erc20';
import { fetchEthMainnetBalance } from './ethereum-rpc';

const USDC_ASSET = SUPPORTED_ASSETS.find(
  (asset) =>
    asset.symbol === 'USDC' &&
    asset.assetId.kind === 'erc20' &&
    asset.assetId.chainId === 'ethereum:mainnet',
);

if (!USDC_ASSET || USDC_ASSET.assetId.kind !== 'erc20') {
  throw new Error(
    'Ethereum Mainnet USDC is missing from SUPPORTED_ASSETS.',
  );
}

const USDC_CONTRACT_ADDRESS =
  USDC_ASSET.assetId.contractAddress;

export type EthereumLivePortfolio = {
  readonly eth: {
    readonly amount: AtomicAmount;
    readonly providerId: string;
  };
  readonly usdc: {
    readonly amount: AtomicAmount;
    readonly providerId: string;
  };
  readonly asOf: number;
};

/**
 * Reads the wallet's real Ethereum Mainnet portfolio.
 *
 * Read-only boundary:
 * - native ETH via eth_getBalance
 * - USDC via ERC-20 balanceOf
 *
 * No signing.
 * No transaction creation.
 * No broadcast.
 * No secret material.
 */
export async function fetchEthereumLivePortfolio(
  owner: EthereumAddress,
): Promise<EthereumLivePortfolio> {
  const [ethResult, usdcResult] = await Promise.all([
    fetchEthMainnetBalance(owner),
    fetchEthMainnetErc20Balance(
      USDC_CONTRACT_ADDRESS,
      owner,
    ),
  ]);

  return {
    eth: {
      amount: ethResult.snapshot.amount,
      providerId: ethResult.providerId,
    },
    usdc: {
      amount: usdcResult.amount,
      providerId: usdcResult.providerId,
    },
    asOf: Date.now(),
  };
}
