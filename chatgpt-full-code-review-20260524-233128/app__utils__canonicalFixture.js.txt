// app/utils/canonicalFixture.js

import { canonicalizeTeamName, canonicalizeTeamsInText } from "./canonicalTeamNames";

function cleanValue(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitFixtureParts(fixture = "") {
  const raw = canonicalizeTeamsInText(fixture);

  const parts =
    raw.split(/\s+@\s+|\s+vs\.?\s+|\s+v\.?\s+|\s+at\s+/i).map((x) => cleanValue(x)).filter(Boolean);

  if (parts.length >= 2) {
    return [canonicalizeTeamName(parts[0]), canonicalizeTeamName(parts[1])];
  }

  return [];
}

export function canonicalizeFixture(fixture = "") {
  const cleaned = cleanValue(fixture);
  if (!cleaned) return "";

  const parts = splitFixtureParts(cleaned);
  if (parts.length >= 2) {
    return `${parts[0]} @ ${parts[1]}`;
  }

  return canonicalizeTeamsInText(cleaned);
}

export function getCanonicalFixtureKey(fixture = "") {
  const parts = splitFixtureParts(fixture);
  if (parts.length >= 2) {
    return [...parts].sort((a, b) => a.localeCompare(b)).join("|");
  }

  return canonicalizeFixture(fixture);
}