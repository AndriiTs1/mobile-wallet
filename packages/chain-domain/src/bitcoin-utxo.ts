import type { AtomicAmount } from './amount';

/**
 * A single Bitcoin unspent transaction output, as reported by an indexed
 * chain-data provider for a queried address. Bitcoin-specific — a UTXO has
 * no equivalent in Ethereum's account model, so this is deliberately not
 * unified into any cross-chain shape.
 *
 * Public chain data only: this represents "the provider reports this
 * output exists for the queried address," not proof of spendability,
 * script validity, or ownership beyond that report. No signing, script
 * construction, or PSBT concept belongs here.
 */
export type BitcoinUtxo = {
  readonly txid: string;
  readonly vout: number;
  readonly value: AtomicAmount;
  readonly confirmed: boolean;
};
