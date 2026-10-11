// Pure helpers for the DarkHorseOdds image-review workflow.
// Do not infer bookmaker names from logos or guess missing minus/plus signs.
export const DHO_COLUMN_COUNT = 14;
export const DEFAULT_DHO_LAYOUTS = Object.freeze({
  moneyline: { first: 27.8, last: 96.0, top: 43.5, bottom: 64.2, band: 16 },
  total: { first: 26.0, last: 94.8, top: 49.5, bottom: 70.5, band: 15 },
});
export const DHO_KNOWN_BOOKS = [
  "BetMGM", "BetRivers", "bet365", "Caesars", "Circa", "DraftKings",
  "FanDuel", "Fanatics", "Kalshi", "Novig", "Pinnacle", "ProphetX",
  "Sporttrade", "theScore", "BetOnline", "Fliff", "Betr", "Other",
];
export function makeDhoSlots() {
  return Array.from({ length: DHO_COLUMN_COUNT }, (_, index) => ({
    id: index + 1, name: "", enabled: true,
  }));
}
const clean = value => String(value ?? "").trim();
export function readDhoAmerican(value) {
  // Positive/negative must be visible. Unsigned 150 could be missing the minus sign.
  const source = clean(value)
    .replace(/[−–—]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/[,*]/g, "")
    .replace(/[Oo](?=\d)/g, "0");
  const first = source.split(/[\n\r]/)[0].trim().replace(/\s+/g, "");
  const match = first.match(/^([+-])(\d{3,4})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const number = Number(match[1] + match[2] + (match[3] ? "." + match[3] : ""));
  if (!Number.isFinite(number) || Math.abs(number) < 100 || Math.abs(number) > 10000) return null;
  return number;
}
export function dhoAmericanToDecimal(american) {
  const a = Number(american);
  if (!Number.isFinite(a) || Math.abs(a) < 100) return null;
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
}
export function dhoColumnCenter(index, first, last, count = DHO_COLUMN_COUNT) {
  if (!Number.isInteger(index) || index < 0 || index >= count || count < 2) return null;
  return (Number(first) + (Number(last) - Number(first)) * index / (count - 1)) / 100;
}
export function dhoCellCrop(imageWidth, imageHeight, index, side, settings) {
  const centerX = dhoColumnCenter(index, settings.first, settings.last);
  const centerY = Number(side === 0 ? settings.top : settings.bottom) / 100;
  if (centerX == null || ![imageWidth, imageHeight, centerY].every(Number.isFinite)) return null;
  const spacing = (Number(settings.last) - Number(settings.first)) / 100 / (DHO_COLUMN_COUNT - 1);
  const width = Math.max(12, imageWidth * spacing * 0.88);
  const height = Math.max(12, imageHeight * Number(settings.band) / 100);
  const x = Math.max(0, Math.min(imageWidth - width, centerX * imageWidth - width / 2));
  const y = Math.max(0, Math.min(imageHeight - height, centerY * imageHeight - height / 2));
  return { x, y, width: Math.min(width, imageWidth), height: Math.min(height, imageHeight) };
}
export function dhoSelectionNames({ market, event, totalLine }) {
  if (market === "total") {
    const n = Number(totalLine);
    if (!Number.isFinite(n) || n <= 0 || n % 1 !== 0.5) return null;
    return [
      { label: "Over", lineValue: n },
      { label: "Under", lineValue: n },
    ];
  }
  const names = clean(event).split(/\s+@\s+|\s+vs\.?\s+/i).map(v => v.trim());
  if (names.length !== 2 || !names[0] || !names[1] || names[0] === names[1]) return null;
  return [
    { label: names[0], lineValue: null },
    { label: names[1], lineValue: null },
  ];
}
export function validateDhoSlots(slots) {
  if (!Array.isArray(slots) || slots.length !== DHO_COLUMN_COUNT) return "Map all 14 sportsbook columns.";
  const used = new Set();
  for (const slot of slots) {
    if (!slot.enabled) continue;
    const name = clean(slot.name);
    if (!name) return "Each selected column needs a sportsbook label.";
    const key = name.toLowerCase();
    if (used.has(key)) return "A sportsbook label appears in multiple selected columns.";
    used.add(key);
  }
  if (!used.size) return "Select at least one sportsbook column.";
  return null;
}
export function buildReviewedDhoRows({ slots, values, market, event, totalLine, sport, importedAt }) {
  const slotError = validateDhoSlots(slots);
  if (slotError) return { error: slotError, rows: [] };
  const selections = dhoSelectionNames({ market, event, totalLine });
  if (!selections) return { error: "Choose the exact event and a valid half-point total when applicable.", rows: [] };
  if (!clean(sport)) return { error: "Select a league.", rows: [] };
  const rows = [];
  const invalid = [];
  const date = importedAt || new Date().toISOString();
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot.enabled) continue;
    for (let side = 0; side < 2; side++) {
      const raw = clean(values?.[i]?.[side]);
      if (!raw) continue;
      const a = readDhoAmerican(raw);
      if (a === null) {
        invalid.push({ column: i + 1, side: side + 1, value: raw });
        continue;
      }
      rows.push({
        id: ["dho", date, i, side].join("_"),
        sportsbook: clean(slot.name),
        sport: clean(sport).toUpperCase(),
        league: clean(sport).toUpperCase(),
        eventLabelRaw: clean(event),
        marketType: market === "total" ? "total" : "moneyline_2way",
        selectionRaw: selections[side].label,
        selectionNormalized: selections[side].label,
        lineValue: selections[side].lineValue,
        oddsAmerican: a,
        oddsDecimal: dhoAmericanToDecimal(a),
        period: "full_game",
        sourceType: "darkhorseodds_screenshot_reviewed",
        screenshotImported: true,
        screenshotCapturedAt: date, // Import time, NOT the sportsbook quote time.
        isTargetBook: true, isSharpSource: false,
        batchRole: "target", excluded: false, userEdited: true,
      });
    }
  }
  return { rows, invalid, error: invalid.length
    ? "Fix or clear every unrecognized price before importing. Unsigned values are intentionally rejected."
    : rows.length ? null : "No reviewed sportsbook prices to import." };
}
export function mergeDhoRows(existing, incoming) {
  const combined = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
  const byKey = new Map();
  for (const row of combined) {
    const key = [
      clean(row.sport).toLowerCase(),clean(row.eventLabelRaw).toLowerCase(),
      clean(row.sportsbook).toLowerCase(),row.marketType,
      clean(row.selectionNormalized).toLowerCase(),row.lineValue ?? "",
    ].join("|");
    byKey.set(key, row);
  }
  return [...byKey.values()];
}
