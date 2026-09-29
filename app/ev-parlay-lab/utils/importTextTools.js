export const IMPORT_PREVIEW_LIMIT = 30000;

export function importTextPreview(rawText) {
  const text = typeof rawText === "string" ? rawText : "";
  return { text: text.slice(0, IMPORT_PREVIEW_LIMIT), length: text.length, truncated: text.length > IMPORT_PREVIEW_LIMIT };
}

export async function copyImportText(rawText, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard?.writeText) throw new Error("Clipboard unavailable. Use Download TXT instead.");
  await clipboard.writeText(typeof rawText === "string" ? rawText : "");
}

export function downloadImportText(rawText, sportsbook, browser = globalThis) {
  const book = String(sportsbook || "sportsbook").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const text = typeof rawText === "string" ? rawText : "";
  const blob = new browser.Blob([text], { type: "text/plain;charset=utf-8" });
  const url = browser.URL.createObjectURL(blob);
  const link = browser.document.createElement("a");
  link.href = url;
  link.download = `${book}-import-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  try {
    browser.document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
  }
}
