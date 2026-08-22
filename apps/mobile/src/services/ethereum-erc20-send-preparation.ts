import {
  SUPPORTED_ASSETS,
  toAtomicAmount,
  toEthereumAddress,
  type AssetSymbol,
  type AtomicAmount,
  type EthereumAddress,
} from 'chain-domain';

import {
  buildErc20TransferCalldata,
  fetchEthMainnetErc20Balance,
} from './ethereum-erc20';

import {
  estimateEthMainnetGas,
  fetchEthMainnetBalance,
  fetchEthMainnetFeeData,
  fetchEthMainnetPendingNonce,
  EthereumRpcRejectionError,
  EthereumRpcTransportError,
} from './ethereum-rpc';

import {
  getEthereumAddressV1,
  type EthereumV1TransactionIntent,
} from './wallet-core-bridge';

const ETHEREUM_MAINNET_CHAIN_ID = 1;

export type EthereumErc20SendSymbol =
  | 'USDC'
  | 'USDT'
  | 'XAUT';

export type EthereumErc20SendPreparationErrorReason =
  | 'unsupported_asset'
  | 'invalid_recipient'
  | 'invalid_amount'
  | 'insufficient_token_balance'
  | 'insufficient_eth_for_fee'
  | 'network_error';

export class EthereumErc20SendPreparationError extends Error {
  readonly reason: EthereumErc20SendPreparationErrorReason;

  constructor(
    reason: EthereumErc20SendPreparationErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'EthereumErc20SendPreparationError';
    this.reason = reason;
  }
}

export type EthereumErc20PreparedSend = {
  readonly symbol: EthereumErc20SendSymbol;
  readonly senderAddress: EthereumAddress;
  readonly recipient: EthereumAddress;
  readonly tokenContract: EthereumAddress;
  readonly tokenDecimals: number;
  readonly amountAtomic: AtomicAmount;
  readonly gasLimit: number;
  readonly maxFeeWei: AtomicAmount;
  readonly nonce: number;
  readonly maxFeePerGasWei: AtomicAmount;
  readonly maxPriorityFeePerGasWei: AtomicAmount;
  readonly chainId: number;
  readonly dataHex: `0x${string}`;
};

function getTokenMetadata(
  symbol: EthereumErc20SendSymbol,
) {
  const asset = SUPPORTED_ASSETS.find(
    (candidate) =>
      candidate.symbol === symbol &&
      candidate.assetId.kind === 'erc20' &&
      candidate.assetId.chainId === 'ethereum:mainnet',
  );

  if (!asset || asset.assetId.kind !== 'erc20') {
    throw new EthereumErc20SendPreparationError(
      'unsupported_asset',
      'This token is not supported for Ethereum Mainnet Send.',
    );
  }

  return asset;
}

function parseTokenAmount(
  amountInput: string,
  decimals: number,
): AtomicAmount {
  const trimmed = amountInput.trim();

  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    throw new EthereumErc20SendPreparationError(
      'invalid_amount',
      'The token amount is invalid.',
    );
  }

  const [whole, fraction = ''] = trimmed.split('.');

  if (fraction.length > decimals) {
    throw new EthereumErc20SendPreparationError(
      'invalid_amount',
      'The token amount has too many decimal places.',
    );
  }

  const paddedFraction = fraction.padEnd(decimals, '0');
  const atomic =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(paddedFraction || '0');

  if (atomic <= 0n) {
    throw new EthereumErc20SendPreparationError(
      'invalid_amount',
      'The token amount must be greater than zero.',
    );
  }

  return toAtomicAmount(atomic.toString(10));
}

export async function prepareEthereumErc20Send(
  symbol: EthereumErc20SendSymbol,
  recipientInput: string,
  amountInput: string,
): Promise<EthereumErc20PreparedSend> {
  const metadata = getTokenMetadata(symbol);

  let recipient: EthereumAddress;
  try {
    recipient = toEthereumAddress(recipientInput);
  } catch {
    throw new EthereumErc20SendPreparationError(
      'invalid_recipient',
      'The recipient address is invalid.',
    );
  }

  const amountAtomic = parseTokenAmount(
    amountInput,
    metadata.decimals,
  );

  let senderAddress: EthereumAddress;
  try {
    senderAddress = getEthereumAddressV1();
  } catch {
    throw new EthereumErc20SendPreparationError(
      'network_error',
      'Unable to read the wallet address.',
    );
  }

  const tokenContract =
    metadata.assetId.contractAddress;

  const dataHex = buildErc20TransferCalldata(
    recipient,
    amountAtomic,
  );

  try {
    const [
      tokenBalanceResult,
      ethBalanceResult,
      nonceResult,
      feeResult,
    ] = await Promise.all([
      fetchEthMainnetErc20Balance(
        tokenContract,
        senderAddress,
      ),
      fetchEthMainnetBalance(senderAddress),
      fetchEthMainnetPendingNonce(senderAddress),
      fetchEthMainnetFeeData(),
    ]);

    if (
      BigInt(amountAtomic) >
      BigInt(tokenBalanceResult.amount)
    ) {
      throw new EthereumErc20SendPreparationError(
        'insufficient_token_balance',
        'The wallet does not have enough token balance.',
      );
    }

    const gasResult = await estimateEthMainnetGas({
      from: senderAddress,
      to: tokenContract,
      valueWeiDecimal: toAtomicAmount('0'),
      dataHex,
    });

    const maxFeeWei =
      BigInt(gasResult.gasLimit) *
      BigInt(feeResult.feeQuote.maxFeePerGasWei);

    if (
      maxFeeWei >
      BigInt(ethBalanceResult.snapshot.amount)
    ) {
      throw new EthereumErc20SendPreparationError(
        'insufficient_eth_for_fee',
        'The wallet does not have enough ETH to cover the network fee.',
      );
    }

    return {
      symbol,
      senderAddress,
      recipient,
      tokenContract,
      tokenDecimals: metadata.decimals,
      amountAtomic,
      gasLimit: gasResult.gasLimit,
      maxFeeWei: toAtomicAmount(
        maxFeeWei.toString(10),
      ),
      nonce: nonceResult.nonce,
      maxFeePerGasWei:
        feeResult.feeQuote.maxFeePerGasWei,
      maxPriorityFeePerGasWei:
        feeResult.feeQuote.maxPriorityFeePerGasWei,
      chainId: ETHEREUM_MAINNET_CHAIN_ID,
      dataHex,
    };
  } catch (error) {
    if (
      error instanceof
      EthereumErc20SendPreparationError
    ) {
      throw error;
    }

    if (
      error instanceof EthereumRpcRejectionError ||
      error instanceof EthereumRpcTransportError
    ) {
      throw new EthereumErc20SendPreparationError(
        'network_error',
        'Unable to prepare the token transaction.',
      );
    }

    throw new EthereumErc20SendPreparationError(
      'network_error',
      'Unable to prepare the token transaction.',
    );
  }
}

export function toEthereumErc20SendIntent(
  prepared: EthereumErc20PreparedSend,
): EthereumV1TransactionIntent {
  return {
    chainId: prepared.chainId,
    nonce: prepared.nonce,
    toHex: prepared.tokenContract,
    valueWeiDecimal: toAtomicAmount('0'),
    gasLimit: prepared.gasLimit,
    maxFeePerGasWeiDecimal:
      prepared.maxFeePerGasWei,
    maxPriorityFeePerGasWeiDecimal:
      prepared.maxPriorityFeePerGasWei,
    dataHex: prepared.dataHex,
  };
}
