import {
  toAtomicAmount,
  type AtomicAmount,
  type EthereumAddress,
  type SwapQuote,
} from 'chain-domain';

import {
  estimateEthMainnetGas,
  fetchEthMainnetBalance,
  fetchEthMainnetFeeData,
  fetchEthMainnetPendingNonce,
} from './ethereum-rpc';
import type { EthereumV1TransactionIntent } from './wallet-core-bridge';

const ETHEREUM_MAINNET_CHAIN_ID = 1;

export type EthereumSwapPreparationErrorReason =
  | 'unsupported_chain'
  | 'insufficient_eth';

export class EthereumSwapPreparationError extends Error {
  readonly reason: EthereumSwapPreparationErrorReason;

  constructor(
    reason: EthereumSwapPreparationErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'EthereumSwapPreparationError';
    this.reason = reason;
  }
}

export type EthereumPreparedSwap = {
  /** The exact validated firm quote reviewed by this preparation step. */
  readonly quote: SwapQuote;

  /** Maximum network fee implied by gasLimit * maxFeePerGas. */
  readonly maxFeeWei: AtomicAmount;

  /** ETH value sent to the router plus the maximum possible network fee. */
  readonly totalMaxEthDebitWei: AtomicAmount;

  /** Public transaction fields only — no key/seed/mnemonic/signature. */
  readonly intent: EthereumV1TransactionIntent;
};

function atomicAmountToHexQuantity(amount: AtomicAmount): string {
  return `0x${BigInt(amount).toString(16)}`;
}

/**
 * Converts an already-validated firm SwapQuote into a fresh Ethereum
 * EIP-1559 signing intent.
 *
 * Fresh RPC state is obtained here immediately before the future signing
 * boundary:
 * - pending nonce
 * - fee data
 * - gas estimate
 * - native ETH balance
 *
 * No signing.
 * No broadcast.
 * No authentication call.
 * No secret material.
 */
export async function prepareEthMainnetSwap(
  owner: EthereumAddress,
  quote: SwapQuote,
): Promise<EthereumPreparedSwap> {
  if (quote.chainId !== 'ethereum:mainnet') {
    throw new EthereumSwapPreparationError(
      'unsupported_chain',
      'Swap preparation only supports Ethereum mainnet.',
    );
  }

  const transactionValueHex = atomicAmountToHexQuantity(
    quote.transactionValueWei,
  );

  const [nonceResult, feeResult, balanceResult] =
    await Promise.all([
      fetchEthMainnetPendingNonce(owner),
      fetchEthMainnetFeeData(),
      fetchEthMainnetBalance(owner),
    ]);

  const transactionValueWeiBigInt = BigInt(
    quote.transactionValueWei,
  );

  const ethBalanceWeiBigInt = BigInt(
    balanceResult.snapshot.amount,
  );

  // Fail locally before eth_estimateGas when the wallet cannot even cover
  // the ETH value sent by the swap. This avoids relying on provider-specific
  // "insufficient funds" errors for an expected wallet-state condition.
  if (transactionValueWeiBigInt > ethBalanceWeiBigInt) {
    throw new EthereumSwapPreparationError(
      'insufficient_eth',
      'The wallet does not have enough ETH to cover the swap value and maximum network fee.',
    );
  }

  const gasResult = await estimateEthMainnetGas(
    owner,
    quote.transactionTarget,
    quote.transactionCalldata,
    transactionValueHex,
  );

  const maxFeeWeiBigInt =
    BigInt(gasResult.gasLimit) *
    BigInt(feeResult.feeQuote.maxFeePerGasWei);

  const totalMaxEthDebitWeiBigInt =
    transactionValueWeiBigInt + maxFeeWeiBigInt;

  if (
    totalMaxEthDebitWeiBigInt >
    ethBalanceWeiBigInt
  ) {
    throw new EthereumSwapPreparationError(
      'insufficient_eth',
      'The wallet does not have enough ETH to cover the swap value and maximum network fee.',
    );
  }

  const maxFeeWei = toAtomicAmount(
    maxFeeWeiBigInt.toString(10),
  );

  const totalMaxEthDebitWei = toAtomicAmount(
    totalMaxEthDebitWeiBigInt.toString(10),
  );

  const intent: EthereumV1TransactionIntent = {
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
    nonce: nonceResult.nonce,
    toHex: quote.transactionTarget,
    valueWeiDecimal: quote.transactionValueWei,
    gasLimit: gasResult.gasLimit,
    maxFeePerGasWeiDecimal:
      feeResult.feeQuote.maxFeePerGasWei,
    maxPriorityFeePerGasWeiDecimal:
      feeResult.feeQuote.maxPriorityFeePerGasWei,
    dataHex: quote.transactionCalldata,
  };

  return {
    quote,
    maxFeeWei,
    totalMaxEthDebitWei,
    intent,
  };
}
