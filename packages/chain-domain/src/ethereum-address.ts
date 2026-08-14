/**
 * A 20-byte Ethereum address, hex-encoded with a leading `0x` (40 hex
 * chars). Format-validated only — this does NOT verify EIP-55 mixed-case
 * checksum correctness, which requires a Keccak-256 implementation and
 * would pull in a hashing dependency; deferred to whichever future stage
 * actually needs it. Successful construction is not proof any checksum
 * casing present in the input is correct.
 */
export type EthereumAddress = string & { readonly __brand: 'EthereumAddress' };

const ETHEREUM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export function toEthereumAddress(value: string): EthereumAddress {
  if (!ETHEREUM_ADDRESS_PATTERN.test(value)) {
    throw new Error(`Invalid EthereumAddress: "${value}" is not a 0x-prefixed 40-hex-character string.`);
  }
  return value as EthereumAddress;
}
