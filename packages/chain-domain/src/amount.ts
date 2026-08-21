/**
 * Exact, arbitrary-precision non-negative integer in an asset's smallest
 * atomic unit (satoshis, wei, ERC-20 base units), encoded as a base-10
 * digit string — never a JS `number`, which loses precision above
 * `Number.MAX_SAFE_INTEGER` and cannot represent every V1 atomic amount
 * exactly. A string (not `bigint`) so the value survives JSON
 * serialization unchanged across any future wire boundary (apps/api,
 * HTTP, storage) without custom bigint (de)serialization logic.
 */
export type AtomicAmount = string & { readonly __brand: 'AtomicAmount' };

const ATOMIC_AMOUNT_PATTERN = /^[0-9]+$/;

export function toAtomicAmount(value: string): AtomicAmount {
  if (!ATOMIC_AMOUNT_PATTERN.test(value)) {
    throw new Error(`Invalid AtomicAmount: "${value}" is not a base-10 non-negative integer string.`);
  }
  return value as AtomicAmount;
}

/**
 * Exact non-negative decimal value as a base-10 string (at most one `.`
 * separator) — for values that are legitimately fractional at the protocol
 * level, such as a Bitcoin sat/vB fee rate. Distinct from `AtomicAmount`,
 * which is integer-only and represents a discrete atomic unit count, not a
 * rate. Never a JS `number`.
 */
export type DecimalString = string & { readonly __brand: 'DecimalString' };

const DECIMAL_STRING_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

export function toDecimalString(value: string): DecimalString {
  if (!DECIMAL_STRING_PATTERN.test(value)) {
    throw new Error(`Invalid DecimalString: "${value}" is not a base-10 non-negative decimal string.`);
  }
  return value as DecimalString;
}

/**
 * Formats an exact atomic-unit amount using the asset's configured decimal
 * precision. BigInt/string arithmetic only — never Number/parseFloat.
 *
 * Examples:
 *   formatAtomicAmountDecimal("2426414910", 6) -> "2426.41491"
 *   formatAtomicAmountDecimal("1000000", 6)    -> "1"
 */
export function formatAtomicAmountDecimal(
  amount: AtomicAmount,
  decimals: number,
): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('Asset decimals must be a non-negative integer.');
  }

  if (decimals === 0) {
    return BigInt(amount).toString(10);
  }

  const divisor = 10n ** BigInt(decimals);
  const value = BigInt(amount);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return whole.toString(10);
  }

  const fractionDigits = fraction
    .toString(10)
    .padStart(decimals, '0')
    .replace(/0+$/, '');

  return `${whole.toString(10)}.${fractionDigits}`;
}
