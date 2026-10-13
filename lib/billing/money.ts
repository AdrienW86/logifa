export const MAX_MINOR = 999999999999n;

// Decimal strings avoid binary floating point. HALF_UP for non-negative amounts.
export function scaled(value: string, decimals = 2): bigint {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error('DECIMAL_REQUIRED');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('DECIMAL_PRECISION');
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0'));
}
export function moneyMinor(value: string): bigint {
  const amount = scaled(value);
  if (amount > MAX_MINOR) throw new Error('AMOUNT_LIMIT');
  return amount;
}
export function positiveMinor(value: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('MINOR_UNITS_REQUIRED');
  const amount = BigInt(value);
  if (amount <= 0n || amount > MAX_MINOR) throw new Error('AMOUNT_LIMIT');
  return amount;
}
export function halfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error('ROUNDING_INPUT');
  return (2n * numerator + denominator) / (2n * denominator);
}
export function decimal(minor: bigint): string {
  if (minor < 0n) throw new Error('NEGATIVE_AMOUNT');
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
}
