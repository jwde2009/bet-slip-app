import { parseOddsText } from "../utils/parseOddsText";

self.onmessage = event => {
  try {
    const { text, context } = event.data || {};
    self.postMessage({ rows: parseOddsText(text, context) });
  } catch (error) {
    self.postMessage({ error: error?.message || "Could not parse this import." });
  }
};
