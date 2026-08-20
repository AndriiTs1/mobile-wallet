// Stage 5G.2.3 bugfix — mobile/UI-boundary normalization for the Send
// amount field. The iOS decimal keyboard can naturally produce "," as the
// decimal separator for European locales; `chain-domain`'s
// `parseEthDecimalStringToWei` is deliberately strict and must never be
// taught locale-specific formats (see that function's own doc comment —
// its one canonical shape is `^[0-9]+(\.[0-9]+)?$`, reused verbatim from
// `toDecimalString`). This file exists so that strictness never has to
// move: it normalizes a single, unambiguous "," to "." BEFORE the existing
// domain parser ever sees the string, and defers every other validation
// decision — malformed input, mixed separators, leading-decimal input,
// whitespace, signs, exponents, hex — entirely to that same existing
// parser, unchanged.

/**
 * Normalizes a single European-style decimal comma ("0,589") to the
 * canonical dot form ("0.589") the domain layer expects — string
 * manipulation only, never `Number`/`parseFloat`/any floating-point
 * arithmetic, and no digit is ever added, removed, or reordered.
 *
 * Deliberately narrow: only transforms the string when it contains
 * EXACTLY ONE comma AND NO dot already. Every other shape is returned
 * completely unchanged, so `parseEthDecimalStringToWei`'s own existing
 * strictness is what ultimately rejects it — this function never decides
 * "malformed" itself:
 * - "1,2.3" / "1.2,3" (a comma AND a dot present) → returned as-is → still
 *   contains a "," or two separators → rejected by the domain parser's
 *   `[0-9]+(\.[0-9]+)?` shape, exactly as before this file existed.
 * - "1,,2" (more than one comma) → returned as-is → still contains "," →
 *   rejected the same way.
 * - ",5" (comma with no leading digit) → becomes ".5" → still rejected by
 *   the domain parser, which requires at least one integer digit before
 *   any separator (`[0-9]+`, not `[0-9]*`) — this codebase's existing
 *   product rule of disallowing leading-decimal input is therefore
 *   preserved without this function needing to special-case it.
 * - Whitespace/signs/exponents/hex mixed with a single lone comma (e.g.
 *   " 0,589", "-0,589", "1,5e2") → the comma is normalized, but the
 *   resulting string is still rejected by the domain parser's existing
 *   character-class checks, exactly as the equivalent dot-form input
 *   already was.
 */
export function normalizeEthAmountDecimalSeparator(input: string): string {
  const commaCount = (input.match(/,/g) ?? []).length;
  if (commaCount === 1 && !input.includes('.')) {
    return input.replace(',', '.');
  }
  return input;
}
