import {
  toAtomicAmount,
  type AtomicAmount,
  type EthereumAddress,
} from 'chain-domain';

import { buildErc20ApproveCalldata } from './ethereum-erc20';
import {
  estimateEthMainnetGas,
  fetchEthMainnetBalance,
  fetchEthMainnetFeeData,
  fetchEthMainnetPendingNonce,
} from './ethereum-rpc';

const ETHEREUM_MAINNET_CHAIN_ID = 1;

export type EthereumErc20ApprovalIntent = {
  readonly chainId: 1;
  readonly nonce: number;
  readonly toHex: EthereumAddress;
  readonly valueWeiDecimal: AtomicAmount;
  readonly gasLimit: number;
  readonly maxFeePerGasWeiDecimal: AtomicAmount;
  readonly maxPriorityFeePerGasWeiDecimal: AtomicAmount;
  readonly dataHex: string;
};

export type EthereumErc20PreparedApproval = {
  readonly tokenContract: EthereumAddress;
  readonly spender: EthereumAddress;
  readonly amount: AtomicAmount;
  readonly gasLimit: number;
  readonly maxFeeWei: AtomicAmount;
  readonly intent: EthereumErc20ApprovalIntent;
};

/**
 * Prepares an exact-amount ERC-20 approval transaction.
 *
 * No signing.
 * No broadcast.
 * No biometric/authentication call.
 * No secret material.
 */
export async function prepareEthMainnetErc20Approval(
  owner: EthereumAddress,
  tokenContract: EthereumAddress,
  spender: EthereumAddress,
  amount: AtomicAmount,
): Promise<EthereumErc20PreparedApproval> {
  const dataHex = buildErc20ApproveCalldata(spender, amount);

  const [nonceResult, feeResult, balanceResult] = await Promise.all([
    fetchEthMainnetPendingNonce(owner),
    fetchEthMainnetFeeData(),
    fetchEthMainnetBalance(owner),
  ]);

  const gasResult = await estimateEthMainnetGas(
    owner,
    tokenContract,
    dataHex,
    '0x0',
  );

  const maxFeeWei =
    BigInt(gasResult.gasLimit) *
    BigInt(feeResult.feeQuote.maxFeePerGasWei);

  const ethBalanceWei = BigInt(balanceResult.snapshot.amount);

  if (maxFeeWei > ethBalanceWei) {
    throw new Error('Insufficient ETH balance to cover ERC-20 approval network fee');
  }

  const zeroValue = toAtomicAmount('0');

  const intent: EthereumErc20ApprovalIntent = {
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
    nonce: nonceResult.nonce,
    toHex: tokenContract,
    valueWeiDecimal: zeroValue,
    gasLimit: gasResult.gasLimit,
    maxFeePerGasWeiDecimal: feeResult.feeQuote.maxFeePerGasWei,
    maxPriorityFeePerGasWeiDecimal:
      feeResult.feeQuote.maxPriorityFeePerGasWei,
    dataHex,
  };

  return {
    tokenContract,
    spender,
    amount,
    gasLimit: gasResult.gasLimit,
    maxFeeWei: toAtomicAmount(maxFeeWei.toString(10)),
    intent,
  };
}
