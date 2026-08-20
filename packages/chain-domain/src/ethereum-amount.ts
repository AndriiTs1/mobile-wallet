import { toAtomicAmount, toDecimalString, type AtomicAmount } from './amount';

/** 1 ETH = 10^18 wei. */
const WEI_PER_ETH_DECIMALS = 18;

/**
 * Parses a user-supplied ETH decimal string into an exact wei `AtomicAmount`.
 * `BigInt`/string arithmetic only — the value never passes through
 * `Number()` or `parseFloat()` at any step, so it cannot lose precision the
 * way IEEE-754 floats do above 2^53 or below their fractional resolution.
 *
 * Whitespace is NEVER trimmed. This reuses `toDecimalString`'s existing
 * `^[0-9]+(\.[0-9]+)?$` pattern (chain-domain's one canonical decimal-shape
 * validator — not duplicated here), whose character class already excludes
 * whitespace, so " 1", "1 ", and "1\n" are rejected as malformed rather than
 * silently normalized. The same pattern also rejects empty input, a sign
 * (`-`/`+`), exponent notation (`e`/`E`), hex (`0x`), a bare `.`, a trailing
 * `.` ("5."), a leading `.` (".5"), and multiple `.` separators — all without
 * this file needing a second regex.
 *
 * On top of that generic shape check, this function additionally enforces
 * the two ETH-specific rules `toDecimalString` cannot know about: at most 18
 * fractional digits (wei is ETH's smallest unit — a 19th digit cannot be
 * represented), and a strictly positive result (a zero-value Send is
 * rejected as a malformed/meaningless amount, never silently accepted).
 */
export function parseEthDecimalStringToWei(input: string): AtomicAmount {
  let decimal: string;
  try {
    decimal = toDecimalString(input);
  } catch {
    throw new Error(
      `Invalid ETH amount: "${input}" is not a canonical, positive, base-10 decimal string.`,
    );
  }

  const separatorIndex = decimal.indexOf('.');
  const integerPart = separatorIndex === -1 ? decimal : decimal.slice(0, separatorIndex);
  const fractionalPart = separatorIndex === -1 ? '' : decimal.slice(separatorIndex + 1);

  if (fractionalPart.length > WEI_PER_ETH_DECIMALS) {
    throw new Error(
      `Invalid ETH amount: "${input}" has more than ${WEI_PER_ETH_DECIMALS} fractional digits.`,
    );
  }

  const paddedFractional = fractionalPart.padEnd(WEI_PER_ETH_DECIMALS, '0');
  const weiValue = BigInt(integerPart) * 10n ** BigInt(WEI_PER_ETH_DECIMALS) + BigInt(paddedFractional);

  if (weiValue <= 0n) {
    throw new Error(`Invalid ETH amount: "${input}" must be strictly greater than zero.`);
  }

  return toAtomicAmount(weiValue.toString(10));
}

/**
 * Formats an exact wei `AtomicAmount` as an ETH decimal string for display —
 * the inverse of `parseEthDecimalStringToWei`, with the same integer-safe
 * posture: `BigInt` div/mod only, never `Number()`/`parseFloat()`/float
 * division, so it cannot lose or round precision the way a float-based
 * `wei / 1e18` would. Trims unnecessary trailing fractional zeros (and the
 * `.` entirely for a whole-number ETH value) for a clean display string,
 * while still preserving the exact value: no digit is ever dropped except
 * trailing zeros, which carry no value.
 */
export function formatWeiAsEthDecimalString(wei: AtomicAmount): string {
  const value = BigInt(wei);
  const divisor = 10n ** BigInt(WEI_PER_ETH_DECIMALS);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return whole.toString(10);
  }

  const fractionDigits = fraction.toString(10).padStart(WEI_PER_ETH_DECIMALS, '0').replace(/0+$/, '');
  return `${whole.toString(10)}.${fractionDigits}`;
}
