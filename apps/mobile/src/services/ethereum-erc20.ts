import {
  toAtomicAmount,
  type AtomicAmount,
  type EthereumAddress,
} from 'chain-domain';

import {
  callEthMainnetContract,
  type EthereumRpcProvider,
} from './ethereum-rpc';

const BALANCE_OF_SELECTOR = '70a08231';
const ALLOWANCE_SELECTOR = 'dd62ed3e';
const UINT256_RESULT_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export type EthereumErc20BalanceResult = {
  readonly amount: AtomicAmount;
  readonly providerId: string;
};


export type EthereumErc20AllowanceResult = {
  readonly amount: AtomicAmount;
  readonly providerId: string;
};

function encodeAddressArgument(address: EthereumAddress): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

function decodeUint256(result: string): AtomicAmount {
  if (!UINT256_RESULT_PATTERN.test(result)) {
    throw new Error('ERC-20 uint256 result must be exactly 32 bytes');
  }

  return toAtomicAmount(BigInt(result).toString(10));
}

/**
 * Reads `balanceOf(owner)` from a curated Ethereum Mainnet ERC-20 contract.
 *
 * Read-only:
 * - no signing
 * - no broadcast
 * - no secret material
 *
 * The caller supplies validated EthereumAddress values for both the token
 * contract and owner address.
 */
export async function fetchEthMainnetErc20Balance(
  tokenContract: EthereumAddress,
  owner: EthereumAddress,
  providers?: readonly EthereumRpcProvider[],
): Promise<EthereumErc20BalanceResult> {
  const data = `0x${BALANCE_OF_SELECTOR}${encodeAddressArgument(owner)}`;

  const result = await callEthMainnetContract(
    tokenContract,
    data,
    providers,
  );

  return {
    amount: decodeUint256(result.data),
    providerId: result.providerId,
  };
}


/**
 * Reads `allowance(owner, spender)` from an Ethereum Mainnet ERC-20 contract.
 *
 * Read-only:
 * - no signing
 * - no approval transaction
 * - no broadcast
 * - no secret material
 */
export async function fetchEthMainnetErc20Allowance(
  tokenContract: EthereumAddress,
  owner: EthereumAddress,
  spender: EthereumAddress,
  providers?: readonly EthereumRpcProvider[],
): Promise<EthereumErc20AllowanceResult> {
  const data =
    `0x${ALLOWANCE_SELECTOR}` +
    encodeAddressArgument(owner) +
    encodeAddressArgument(spender);

  const result = await callEthMainnetContract(
    tokenContract,
    data,
    providers,
  );

  return {
    amount: decodeUint256(result.data),
    providerId: result.providerId,
  };
}
