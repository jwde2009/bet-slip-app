import { parseOddsText } from "../utils/parseOddsText";

self.onmessage = event => {
  try {
    const { text, context } = event.data || {};
    const rows = parseOddsText(text, context);
    self.postMessage({ rows, diagnostics: rows.importDiagnostics });
  } catch (error) {
    self.postMessage({ error: error?.message || "Could not parse this import." });
  }
};
