export function americanToDecimal(american) {
  const n = Number(american);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return 1 + n / 100;
  return 1 + 100 / Math.abs(n);
}

export function decimalToAmerican(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 1) return null;
  if (d >= 2) return (d - 1) * 100;
  return -100 / (d - 1);
}

export function impliedProbabilityFromDecimal(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 0) return null;
  return 1 / d;
}

export function impliedProbabilityFromAmerican(american) {
  const n = Number(american);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return 100 / (n + 100);
  return Math.abs(n) / (Math.abs(n) + 100);
}

export function multiplyDecimals(decimals) {
  return decimals.reduce((acc, d) => acc * d, 1);
}