import type { BitcoinUtxo } from '@swiss-wallet/chain-domain';

export const BITCOIN_P2WPKH_DUST_SATS = 294n;

// Conservative native-SegWit P2WPKH transaction weight model.
// V1 wallet spends only its fixed BIP-84 receive output and creates
// P2WPKH destination/change outputs.
const TX_OVERHEAD_VBYTES = 11n;
const P2WPKH_INPUT_VBYTES = 68n;
const P2WPKH_OUTPUT_VBYTES = 31n;

export type PreparedBitcoinInput = {
  readonly txid: string;
  readonly vout: number;
  readonly valueSats: bigint;
};

export type PreparedBitcoinSend = {
  readonly inputs: readonly PreparedBitcoinInput[];
  readonly amountSats: bigint;
  readonly feeSats: bigint;
  readonly changeSats: bigint;
  readonly feeRateSatPerVbyte: number;
  readonly estimatedVbytes: number;
};

export type PrepareBitcoinSendParams = {
  readonly utxos: readonly BitcoinUtxo[];
  readonly amountSats: bigint;
  readonly feeRateSatPerVbyte: number;
};

function estimateP2wpkhVbytes(
  inputCount: number,
  outputCount: number,
): bigint {
  return (
    TX_OVERHEAD_VBYTES +
    BigInt(inputCount) * P2WPKH_INPUT_VBYTES +
    BigInt(outputCount) * P2WPKH_OUTPUT_VBYTES
  );
}

function feeFor(
  inputCount: number,
  outputCount: number,
  feeRateSatPerVbyte: number,
): bigint {
  return (
    estimateP2wpkhVbytes(inputCount, outputCount) *
    BigInt(feeRateSatPerVbyte)
  );
}

function normalizeUtxos(
  utxos: readonly BitcoinUtxo[],
): PreparedBitcoinInput[] {
  return utxos
    .map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      valueSats: utxo.valueSats,
    }))
    .filter((utxo) => utxo.valueSats > 0n)
    .sort((a, b) => {
      if (a.valueSats === b.valueSats) {
        const txidCompare = a.txid.localeCompare(b.txid);
        return txidCompare !== 0 ? txidCompare : a.vout - b.vout;
      }

      // Deterministic largest-first V1 policy: minimizes input count and
      // therefore normally minimizes fee for this single-address wallet.
      return a.valueSats > b.valueSats ? -1 : 1;
    });
}

/**
 * PUBLIC-SAFE / NO SIGNING / NO BROADCAST.
 *
 * Deterministically selects confirmed/spendable UTXOs supplied by the
 * read-only Bitcoin layer and calculates the immutable monetary snapshot
 * that the later native/Rust signer must reproduce exactly.
 *
 * V1 policy:
 * - largest-first deterministic selection
 * - P2WPKH inputs
 * - destination + optional change output
 * - change below the P2WPKH dust threshold is added to the miner fee
 * - no private key, seed, mnemonic, entropy or xpriv enters this module
 */
export function prepareBitcoinSend({
  utxos,
  amountSats,
  feeRateSatPerVbyte,
}: PrepareBitcoinSendParams): PreparedBitcoinSend {
  if (amountSats <= 0n) {
    throw new Error('Bitcoin send amount must be positive');
  }

  if (
    !Number.isSafeInteger(feeRateSatPerVbyte) ||
    feeRateSatPerVbyte <= 0
  ) {
    throw new Error('Bitcoin fee rate must be a positive integer');
  }

  const candidates = normalizeUtxos(utxos);

  if (candidates.length === 0) {
    throw new Error('No spendable Bitcoin UTXOs');
  }

  const selected: PreparedBitcoinInput[] = [];
  let selectedTotal = 0n;

  for (const utxo of candidates) {
    selected.push(utxo);
    selectedTotal += utxo.valueSats;

    // First determine whether the transaction can support amount + a
    // normal destination output + a non-dust change output.
    const feeWithChange = feeFor(
      selected.length,
      2,
      feeRateSatPerVbyte,
    );

    const changeWithChangeOutput =
      selectedTotal - amountSats - feeWithChange;

    if (changeWithChangeOutput >= BITCOIN_P2WPKH_DUST_SATS) {
      return {
        inputs: selected,
        amountSats,
        feeSats: feeWithChange,
        changeSats: changeWithChangeOutput,
        feeRateSatPerVbyte,
        estimatedVbytes: Number(
          estimateP2wpkhVbytes(selected.length, 2),
        ),
      };
    }

    // If there is no economical change output, check whether the selected
    // inputs can fund a one-output transaction. Any positive remainder
    // becomes additional miner fee rather than creating dust.
    const minimumFeeWithoutChange = feeFor(
      selected.length,
      1,
      feeRateSatPerVbyte,
    );

    const remainder =
      selectedTotal - amountSats - minimumFeeWithoutChange;

    if (remainder >= 0n && remainder < BITCOIN_P2WPKH_DUST_SATS) {
      return {
        inputs: selected,
        amountSats,
        feeSats: selectedTotal - amountSats,
        changeSats: 0n,
        feeRateSatPerVbyte,
        estimatedVbytes: Number(
          estimateP2wpkhVbytes(selected.length, 1),
        ),
      };
    }
  }

  throw new Error('Bitcoin balance is too low for amount and network fee');
}
