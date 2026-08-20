/**
 * A 32-byte Ethereum transaction hash, hex-encoded with a leading `0x` (64
 * hex chars). Format-validated only — mirrors `EthereumAddress`'s exact
 * validation posture (structural shape, not provenance/existence).
 * Successful construction is not proof the transaction actually exists on
 * chain; it only proves the string has the shape a transaction hash must
 * have.
 */
export type EthereumTxHash = string & { readonly __brand: 'EthereumTxHash' };

const ETHEREUM_TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function toEthereumTxHash(value: string): EthereumTxHash {
  if (!ETHEREUM_TX_HASH_PATTERN.test(value)) {
    throw new Error(`Invalid EthereumTxHash: "${value}" is not a 0x-prefixed 64-hex-character string.`);
  }
  return value as EthereumTxHash;
}
