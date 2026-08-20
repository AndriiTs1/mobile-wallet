// Stage 5G.1 — structured, public V1 Ethereum EIP-1559 transaction intent.
// Every field is public transaction data; the three wei-denominated
// quantities are decimal-digit strings, never `number`, to avoid JS
// floating-point precision loss (`chainId`/`nonce`/`gasLimit` are safe as
// plain numbers — their realistic range never approaches JS's
// safe-integer limit). This type must never gain a field for a private
// key, seed, entropy, mnemonic, xpriv, or precomputed signing hash.
export type EthereumV1TransactionIntent = {
  chainId: number;
  nonce: number;
  toHex: string;
  valueWeiDecimal: string;
  gasLimit: number;
  maxFeePerGasWeiDecimal: string;
  maxPriorityFeePerGasWeiDecimal: string;
  dataHex: string;
};

// Stage 5G.1 — the only thing signEthereumTransactionV1 ever resolves
// with. Both fields are non-secret and hex-encoded.
export type EthereumV1SignedTransaction = {
  signedTxHex: string;
  txHashHex: string;
};
