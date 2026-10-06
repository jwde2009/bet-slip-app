// Existing mappings remain in the core module; NFL is an additive extension.
import { normalizeMarketType as normalizeCore, isPlayerPropMarket as isCorePlayerProp } from "./marketNormalizationCore";
import { NFL_PROP_TYPES } from "./parsers/nflPropTypes";
export { getSelectionLineValue } from "./marketNormalizationCore";
export function normalizeMarketType(value = "") {
  const text = String(value || "").trim().toLowerCase();
  return NFL_PROP_TYPES.includes(text) ? text : normalizeCore(value);
}
export function isPlayerPropMarket(value = "") {
  return NFL_PROP_TYPES.includes(normalizeMarketType(value)) || isCorePlayerProp(value);
}
