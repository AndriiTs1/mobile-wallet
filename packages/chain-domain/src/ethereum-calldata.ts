/**
 * EVM transaction calldata: a `0x`-prefixed, even-length hex byte string of
 * arbitrary (but non-zero) length — unlike `EthereumAddress`/`EthereumTxHash`,
 * calldata has no fixed byte count, so this validates shape (hex, even
 * length, at least one byte) rather than an exact length. At least one byte
 * is required because a `SwapQuote`'s transaction always targets a contract
 * function call (a selector is a minimum of 4 bytes); a plain native-ETH
 * transfer's empty `'0x'` calldata is `ethereum-send-preparation.ts`'s
 * concern, not this package's.
 */
export type EthereumCalldata = string & { readonly __brand: 'EthereumCalldata' };

const ETHEREUM_CALLDATA_PATTERN = /^0x([0-9a-fA-F]{2})+$/;

export function toEthereumCalldata(value: string): EthereumCalldata {
  if (!ETHEREUM_CALLDATA_PATTERN.test(value)) {
    throw new Error(
      `Invalid EthereumCalldata: "${value}" is not a 0x-prefixed, even-length, non-empty hex string.`,
    );
  }
  return value as EthereumCalldata;
}
