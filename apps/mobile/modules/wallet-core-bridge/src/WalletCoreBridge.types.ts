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


// Bitcoin V1 signing input. PUBLIC transaction data only.
// Satoshi values are decimal strings across the JS boundary so no value can
// be silently rounded by JavaScript number precision.
export type BitcoinV1Input = {
  txid: string;
  vout: number;
  valueSat: string;
};

// PUBLIC structured Bitcoin V1 transaction intent.
// No entropy, mnemonic, seed, private key, xpriv, derivation path,
// precomputed sighash, scriptCode, or witness field exists here.
export type BitcoinV1TransactionIntent = {
  inputs: BitcoinV1Input[];
  destinationAddress: string;
  amountSat: string;
  changeAddress?: string | null;
  changeSat: string;
};

// The only Bitcoin signing data allowed back to React Native.
export type BitcoinV1SignedTransaction = {
  signedTxHex: string;
  txid: string;
};
