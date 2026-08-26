import { decimalToAmerican } from "./odds";

export function applyProfitBoostToDecimal(rawDecimal, boostPct) {
  const d = Number(rawDecimal);
  const b = Number(boostPct);

  if (!Number.isFinite(d) || d <= 1) return null;
  if (!Number.isFinite(b)) return d;

  const boostedDecimal = 1 + (d - 1) * (1 + b / 100);
  return boostedDecimal;
}

export function applyProfitBoostToAmerican(rawDecimal, boostPct) {
  const boostedDecimal = applyProfitBoostToDecimal(rawDecimal, boostPct);
  if (!boostedDecimal) return null;
  return decimalToAmerican(boostedDecimal);
}